import WebampLazy from "../../../webamp/js/webampLazy";
import type { ContextMenuItem, Track as WebampTrack, WindowLayout } from "../../../webamp/js/types";
import isButterchurnSupported from "butterchurn/dist/isSupported.min";
import { absolute, artworkUrl } from "../api/client";
import { recordPlay, type Track } from "../api/arcanist";

/** Webamp's windows and menus sit below Arcanist's own windows. */
export const WEBAMP_Z = 10;

export interface PlayerHooks {
  /** The main menu's "Arcanist" items. */
  mainMenu(): ContextMenuItem[];
  /** The menu for selected tracks (with their ids in Webamp's playlist); null for local files. */
  trackMenu(tracks: Track[], webampIds: number[]): ContextMenuItem[] | null;
  /** LOAD LIST: the tracks of the playlist the user picks, or null. */
  loadList(): Promise<Track[] | null>;
  /** SAVE LIST: the playlist's Arcanist tracks, and how many are not Arcanist's. */
  saveList(tracks: Track[], others: number): void;
  /** ADD URL: what to add from Arcanist. */
  addFromLibrary(): void;
}

function credits(track: Track): string {
  const primary = track.artists.filter((a) => a.role !== "FEATURED");
  return (primary.length ? primary : track.artists).map((a) => a.name).join(", ");
}

/**
 * Webamp playing Arcanist: tracks are its stream URLs (with their signed token) and carry their tags and duration,
 * so Webamp fetches nothing else; Arcanist's features hang from its menus; plays are reported as they end.
 */
export class ArcanistPlayer {
  readonly webamp: WebampLazy;
  /** Arcanist's track of each stream URL in the playlist. */
  private readonly byUrl = new Map<string, Track>();
  private readonly listeners = new Set<() => void>();

  constructor(hooks: PlayerHooks) {
    const butterchurn = isButterchurnSupported() as boolean;
    const layout: WindowLayout = {
      main: { position: { left: 0, top: 0 } },
      equalizer: { position: { left: 0, top: 116 } },
      playlist: { position: { left: 0, top: 232 }, size: { extraHeight: 4, extraWidth: 0 } },
      ...(butterchurn ? { milkdrop: { position: { left: 275, top: 0 }, size: { extraHeight: 12, extraWidth: 7 } } } : {}),
    };

    this.webamp = new WebampLazy({
      zIndex: WEBAMP_Z,
      enableHotkeys: true,
      enableMediaSession: true,
      windowLayout: layout,
      requireJSZip: () => import("jszip").then((m) => m.default ?? m),
      requireMusicMetadata: () => import("music-metadata"),
      mainContextMenuItems: () => hooks.mainMenu(),
      trackContextMenuItems: (ids) => {
        const tracks = ids.map((id) => this.trackOf(id)).filter((t): t is Track => t != null);
        return tracks.length === ids.length && tracks.length > 0 ? hooks.trackMenu(tracks, ids) : null;
      },
      handleLoadListEvent: async () => {
        const tracks = await hooks.loadList();
        return tracks ? tracks.map((t) => this.toWebamp(t)) : null;
      },
      handleSaveListEvent: (tracks) => {
        const known = tracks.map((t) => ("url" in t ? this.byUrl.get(t.url) : undefined));
        hooks.saveList(
          known.filter((t): t is Track => t != null),
          known.filter((t) => t == null).length,
        );
        return null;
      },
      handleAddUrlEvent: () => {
        hooks.addFromLibrary();
        return null;
      },
      ...(butterchurn
        ? {
            __butterchurnOptions: {
              importButterchurn: () => import("butterchurn"),
              getPresets: async () => {
                const presets = await import("butterchurn-presets");
                return Object.entries((presets as { default: Record<string, object> }).default).map(([name, preset]) => ({
                  name,
                  butterchurnPresetObject: preset,
                }));
              },
              butterchurnOpen: true,
            },
          }
        : {}),
    } as ConstructorParameters<typeof WebampLazy>[0]);

    this.webamp.__onStateChange(() => this.emit());
    new PlayReporter(this);
  }

  /** Webamp's track for Arcanist's: no tag reading and no duration probe. */
  toWebamp(track: Track): WebampTrack {
    const url = absolute(track.streamUrl);
    this.byUrl.set(url, track);
    return {
      url,
      duration: track.durationMs / 1000,
      defaultName: `${credits(track)} - ${track.title}`,
      metaData: {
        artist: credits(track),
        title: track.title,
        album: track.album.title,
        albumArtUrl: artworkUrl(track.artworkId, 512),
      },
    };
  }

  play(tracks: Track[]): void {
    if (tracks.length === 0) return;
    this.webamp.reopen();
    this.webamp.setTracksToPlay(tracks.map((t) => this.toWebamp(t)));
  }

  append(tracks: Track[]): void {
    if (tracks.length === 0) return;
    this.webamp.reopen();
    this.webamp.appendTracks(tracks.map((t) => this.toWebamp(t)));
  }

  /** Arcanist's track of a Webamp playlist entry; null for local files. */
  trackOf(webampId: number): Track | null {
    const entry = this.webamp.store.getState().tracks[webampId];
    return entry ? (this.byUrl.get(entry.url) ?? null) : null;
  }

  /** What is playing (or loaded), when it is Arcanist's. */
  current(): Track | null {
    const id = this.webamp.store.getState().playlist.currentTrack;
    return id == null ? null : this.trackOf(id);
  }

  /** Seconds into the current track. */
  elapsed(): number {
    return this.webamp.store.getState().media.timeElapsed;
  }

  /** Keeps the playlist's copy of a track (its StarTrack) up to date. */
  update(track: Track): void {
    const url = absolute(track.streamUrl);
    for (const [known, old] of this.byUrl) {
      if (old.id === track.id) this.byUrl.set(known, { ...old, starred: track.starred, rating: track.rating });
    }
    this.byUrl.set(url, track);
    this.emit();
  }

  removeFromList(webampIds: number[]): void {
    this.webamp.store.dispatch({ type: "REMOVE_TRACKS", ids: webampIds } as never);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Reports each Arcanist track listened to when it ends, is skipped or replaced: the time actually played (pauses
 * left out) and when it started. Arcanist decides what counts as a play.
 */
class PlayReporter {
  private trackId: number | null = null;
  private track: Track | null = null;
  private playedMs = 0;
  private startedAt: Date | null = null;
  private lastTick = performance.now();
  private lastElapsed = 0;

  constructor(private readonly player: ArcanistPlayer) {
    setInterval(() => this.tick(), 1000);
    addEventListener("pagehide", () => this.flush());
  }

  private tick(): void {
    const now = performance.now();
    const delta = now - this.lastTick;
    this.lastTick = now;
    const state = this.player.webamp.store.getState();
    const current = state.playlist.currentTrack;
    const status = this.player.webamp.getMediaStatus();
    const elapsed = state.media.timeElapsed;

    // Another track, or the same one again from the start (repeat).
    if (current !== this.trackId || (elapsed + 2 < this.lastElapsed && this.playedMs > 0)) {
      this.flush();
      this.trackId = current;
      this.track = current == null ? null : this.player.trackOf(current);
    }
    this.lastElapsed = elapsed;

    if (status === "PLAYING" && this.track) {
      this.startedAt ??= new Date();
      this.playedMs += Math.min(delta, 2000);
    } else if (status === "STOPPED" && this.playedMs > 0) {
      this.flush();
    }
  }

  private flush(): void {
    const track = this.track;
    const played = this.playedMs;
    const startedAt = this.startedAt;
    this.playedMs = 0;
    this.startedAt = null;
    if (track && startedAt && played >= 1000) {
      recordPlay(track.id, played, startedAt).catch(() => {
        // A play that cannot be reported is lost; it never stops playback.
      });
    }
  }
}
