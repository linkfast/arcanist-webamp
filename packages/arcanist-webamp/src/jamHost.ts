import * as api from "./api/arcanist";
import { absolute } from "./api/client";
import { subscribe } from "./api/live";
import { app } from "./app";
import { errorText, t } from "./i18n";
import { toast } from "./ui/ui";

// This tab as the player of a Jukebox Jam (its host API, docs/developers/jukebox-jam.md in Arcanist): it claims the
// Jam, plays the song the server says comes next and has the one after it waiting in Webamp's list (so there is no
// gap), reports what plays every 5 seconds and on every change, and does what the host's controls ask (skip, pause).
// The order is always the server's: votes, pins and the queue's changes replace the song waiting.

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

  const add = (next: { entryId: string; track: api.Track }, start: boolean): void => {
    const url = absolute(next.track.streamUrl);
    if (start) player.play([next.track]);
    else player.append([next.track]);
    const id = webampIdOf(url);
    if (id != null) entries.set(id, next.entryId);
    waiting = start ? null : { entryId: next.entryId, webampId: id };
  };

  /** Brings Webamp's list in line with the server: what comes next waits after what plays. */
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

      if (playingEntry == null || (status === "STOPPED" && waiting == null)) {
        // Nothing of the Jam plays (or the last one ended): the next one starts.
        if (next) add(next, true);
      } else if (waiting?.entryId !== next?.entryId) {
        // The one waiting is no longer next (votes, a pin, removed): another takes its place.
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
    try {
      await api.reportJukeboxJamPlayback(code, device, entryId, entryId == null ? "STOPPED" : (status as "PLAYING" | "PAUSED" | "STOPPED"), player.elapsed() * 1000);
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
            if (waiting) player.webamp.nextTrack();
            else {
              player.webamp.stop();
              void sync();
            }
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
