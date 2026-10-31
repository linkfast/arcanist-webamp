import * as api from "./api/arcanist";
import { absolute, artworkUrl } from "./api/client";
import { subscribe } from "./api/live";
import { app } from "./app";
import { errorText, t } from "./i18n";
import { toast } from "./ui/ui";

// This tab as the player of a Jukebox Jam (its host API, docs/developers/jukebox-jam.md in Arcanist): it claims the
// Jam, puts the song the server says comes next right after the one playing in Webamp's list (so there is no gap),
// reports what plays every 5 seconds and on every change, and does what the host's controls ask (skip, pause).
// Webamp's own list stays: the host may be playing something, or have songs of their own coming; the Jam's go right
// after the one playing, and the host's own go on when the Jam has none waiting (reported as the host's song).
// The Jam's order is always the server's: votes, pins and the queue's changes replace the song waiting.

const STORAGE_KEY = "arcanist.jamHost";

type Listener = () => void;

interface Hosting {
  code: string;
  deviceId: string;
  stop: () => void;
}

let hosting: Hosting | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** The Jam this tab plays, if any. */
export function hostedJam(): string | null {
  return hosting?.code ?? null;
}

export function onHostingChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A tab's own id (kept while the tab lives), so another tab of the same user is another device. */
function deviceId(): string {
  try {
    let id = sessionStorage.getItem(`${STORAGE_KEY}.device`);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(`${STORAGE_KEY}.device`, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Plays the Jam here, taking over from any other device of the host's. */
export async function hostJam(code: string): Promise<void> {
  stopHosting();
  const device = deviceId();
  const player = app.player;
  await api.claimJukeboxJamHost(code, device);

  /** Which Jam entry each of Webamp's list entries is (by Webamp's id). */
  const entries = new Map<number, string>();
  let reported: { entryId: string | null; state: string } = { entryId: null, state: "" };
  let lastReport = 0;
  let waiting: { entryId: string; webampId: number | null } | null = null;
  let busy = false;
  let stopped = false;

  const webampIdOf = (url: string): number | null => {
    const tracks = player.webamp.store.getState().tracks as Record<number, { url: string }>;
    const order = player.webamp.store.getState().playlist.trackOrder;
    for (let i = order.length - 1; i >= 0; i--) if (tracks[order[i]]?.url === url) return order[i];
    return null;
  };

  /** Puts the Jam's song right after the one playing (where Webamp's list goes on next), and plays it when asked. */
  const add = (next: { entryId: string; track: api.Track }, start: boolean): void => {
    player.insertNext([next.track]);
    const playlist = player.webamp.store.getState().playlist;
    const index = playlist.currentTrack == null ? playlist.trackOrder.length - 1 : playlist.trackOrder.indexOf(playlist.currentTrack) + 1;
    const id = playlist.trackOrder[index] ?? webampIdOf(absolute(next.track.streamUrl));
    if (id != null) entries.set(id, next.entryId);
    if (start) {
      player.webamp.setCurrentTrack(index);
      player.webamp.play();
      waiting = null;
    } else waiting = { entryId: next.entryId, webampId: id };
  };

  /** Brings Webamp's list in line with the server: the Jam's next song waits right after what plays. */
  const sync = async (): Promise<void> => {
    if (busy || stopped) return;
    busy = true;
    try {
      const state = player.webamp.store.getState();
      const current = state.playlist.currentTrack;
      const playingEntry = current == null ? null : (entries.get(current) ?? null);
      const status = player.webamp.getMediaStatus();
      const next = await api.jukeboxJamNext(code);
      if (stopped) return;

      if (waiting && waiting.webampId === current) waiting = null;
      if (status === "STOPPED" || current == null) {
        // Nothing plays: the next one starts (after where the list was; the host's own songs stay after it).
        if (waiting?.webampId != null) player.removeFromList([waiting.webampId]);
        waiting = null;
        if (next) add(next, true);
      } else if (waiting?.entryId !== next?.entryId) {
        // Something plays (the Jam's or the host's own): the Jam's next one waits right after it. The one waiting
        // before is no longer next (votes, a pin, removed): it gives way.
        if (waiting?.webampId != null) player.removeFromList([waiting.webampId]);
        waiting = null;
        if (next && next.entryId !== playingEntry) add(next, false);
      }
    } catch (e) {
      handle(e);
    } finally {
      busy = false;
    }
  };

  const report = async (force: boolean): Promise<void> => {
    const state = player.webamp.store.getState();
    const current = state.playlist.currentTrack;
    const entryId = current == null ? null : (entries.get(current) ?? null);
    const status = player.webamp.getMediaStatus();
    const now = Date.now();
    const changed = entryId !== reported.entryId || status !== reported.state;
    if (!force && !changed && now - lastReport < 5000) return;
    if (changed && waiting && entryId === waiting.entryId) waiting = null;
    reported = { entryId, state: status ?? "" };
    lastReport = now;
    // A song of the host's own (not the Jam's) is told as such, so those taking part see what plays.
    const own = entryId == null && status !== "STOPPED" ? player.current() : null;
    const external: api.JamExternalSong | null = own
      ? {
          title: own.title,
          artists: own.artists.filter((a) => a.role !== "FEATURED").map((a) => a.name),
          album: own.album.title,
          durationMs: own.durationMs,
          artworkUrl: own.artworkId ? new URL(artworkUrl(own.artworkId, 512)!, location.origin).href : null,
        }
      : null;
    try {
      await api.reportJukeboxJamPlayback(
        code,
        device,
        entryId,
        entryId == null && !external ? "STOPPED" : (status as "PLAYING" | "PAUSED" | "STOPPED"),
        player.elapsed() * 1000,
        external,
      );
      // A new song plays: the next one goes after it.
      if (changed) void sync();
    } catch (e) {
      handle(e);
    }
  };

  const handle = (e: unknown): void => {
    const code = (e as { code?: string }).code;
    if (code === "jam_not_host" || code === "jam_ended" || code === "not_found") {
      toast(code === "jam_ended" ? errorText("jam_ended") : t("jam.hostElsewhere"), true);
      stopHosting();
    }
  };

  const unsubscribe = subscribe<{ jukeboxJamChanged: { kind: string; command: string | null; hostDeviceId: string | null } }>(
    `subscription($c: String!) { jukeboxJamChanged(code: $c) { kind command hostDeviceId } }`,
    { c: code },
    ({ jukeboxJamChanged: change }) => {
      switch (change.kind) {
        case "HOST":
          if (change.hostDeviceId && change.hostDeviceId !== device) {
            toast(t("jam.hostElsewhere"));
            stopHosting();
          }
          break;
        case "ENDED":
          toast(errorText("jam_ended"));
          stopHosting();
          break;
        case "COMMAND":
          if (change.command === "PAUSE") player.webamp.pause();
          else if (change.command === "RESUME") player.webamp.play();
          else if (change.command === "SKIP") {
            // To what comes next in the list: the Jam's waiting song (a song chosen to play now is put there first).
            void (async () => {
              await sync();
              const playlist = player.webamp.store.getState().playlist;
              const index = playlist.currentTrack == null ? -1 : playlist.trackOrder.indexOf(playlist.currentTrack);
              if (index >= 0 && index + 1 < playlist.trackOrder.length) player.webamp.nextTrack();
              else {
                player.webamp.stop();
                void sync();
              }
            })();
          }
          break;
        case "QUEUE":
        case "SETTINGS":
          void sync();
          break;
      }
    },
  );

  const unsubscribePlayer = player.subscribe(() => void report(false));
  const timer = window.setInterval(() => void report(false), 1000);
  hosting = {
    code,
    deviceId: device,
    stop: () => {
      stopped = true;
      unsubscribe();
      unsubscribePlayer();
      clearInterval(timer);
    },
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Without storage, a reload stops hosting.
  }
  emit();
  await sync();
  await report(true);
}

/** This tab no longer plays the Jam (the Jam goes on: another device of the host's, or none). */
export function stopHosting(): void {
  if (!hosting) return;
  hosting.stop();
  hosting = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept.
  }
  emit();
}

/** After a reload, the tab goes on playing the Jam it played. */
export function resumeHosting(): void {
  let code: string | null = null;
  try {
    code = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (code) hostJam(code).catch(() => stopHosting());
}
