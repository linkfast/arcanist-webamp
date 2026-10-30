import WebampLazy from "../../../webamp/js/webampLazy";
import type { ContextMenuItem, Track as WebampTrack, WindowInfo, WindowLayout } from "../../../webamp/js/types";
import { loadDefaultSkin, setWindowLayout, toggleWindow } from "../../../webamp/js/actionCreators";
import { centerWindows, setWindowSize, updateWindowPositions } from "../../../webamp/js/actionCreators/windows";
import { setSkinFromBlob } from "../../../webamp/js/actionCreators/files";
import { WINDOW_RESIZE_SEGMENT_HEIGHT, WINDOW_RESIZE_SEGMENT_WIDTH } from "../../../webamp/js/constants";
import * as Selectors from "../../../webamp/js/selectors";
import isButterchurnSupported from "butterchurn/dist/isSupported.min";
import { absolute, artworkUrl } from "../api/client";
import { recordPlay, type Track } from "../api/arcanist";
import { desktopWindows, TASKBAR_HEIGHT } from "../desktop/windows";
import { draggedTracks, webampDragOut } from "../dnd";
import { isMobile, onLayoutChange } from "../layout";
import { settings } from "../settings";

/** Webamp's windows and menus sit below Arcanist's own windows. */
export const WEBAMP_Z = 10;

/** What the playlist and Milkdrop grow by, in each direction. */
const RESIZE_STEP = { width: WINDOW_RESIZE_SEGMENT_WIDTH, height: WINDOW_RESIZE_SEGMENT_HEIGHT };

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
  /** Webamp's layer: its windows use it, its menus the one above. */
  private z = WEBAMP_Z;
  /** Arcanist's track of each stream URL in the playlist. */
  private readonly byUrl = new Map<string, Track>();
  private readonly listeners = new Set<() => void>();
  /** Where Webamp's windows start (and go back to). */
  private readonly layout: WindowLayout;
  /** The node Webamp renders into. */
  private host: HTMLElement | null = null;
  private fitting = false;

  constructor(hooks: PlayerHooks) {
    const butterchurn = isButterchurnSupported() as boolean;
    // Milkdrop starts open unless the user turned it off, or on a phone (it can still be opened from Webamp's menu).
    const milkdrop = butterchurn && settings.value.milkdrop && !isMobile();
    const layout: WindowLayout = {
      main: { position: { left: 0, top: 0 } },
      equalizer: { position: { left: 0, top: 116 } },
      playlist: { position: { left: 0, top: 232 }, size: { extraHeight: 4, extraWidth: 0 } },
      ...(milkdrop ? { milkdrop: { position: { left: 275, top: 0 }, size: { extraHeight: 12, extraWidth: 7 } } } : {}),
    };
    this.layout = layout;

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
      // Songs dragged from Arcanist's windows: into the playlist where they are dropped (or played, on the main window).
      handleTrackDropEvent: (e) => draggedTracks(e)?.map((t) => this.toWebamp(t)) ?? null,
      // Songs dragged out of the playlist, to Arcanist's windows.
      onTracksDragOut: (event) => webampDragOut(event, event.trackIds.map((id) => this.trackOf(id)).filter((t): t is Track => t != null)),
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
              butterchurnOpen: milkdrop,
            },
          }
        : {}),
    } as ConstructorParameters<typeof WebampLazy>[0]);

    this.webamp.__onStateChange(() => {
      this.emit();
      this.fitLater();
    });
    new PlayReporter(this);
    addEventListener("resize", () => this.fitLater());
    onLayoutChange(() => {
      if (isMobile()) return this.fitLater();
      // Back on the desktop: unscaled, and the windows where they start.
      this.fit();
      this.resetLayout();
    });
    // On a phone the windows stay stacked: their title bars and resize corners do not move them.
    for (const type of ["mousedown", "touchstart"])
      document.addEventListener(
        type,
        (event) => {
          if (!isMobile() || !(event.target instanceof Element) || !event.target.closest("#webamp")) return;
          if (event.target.classList.contains("draggable") || event.target.closest("#playlist-resize-target, #gen-resize-target"))
            event.stopPropagation();
        },
        true,
      );
    // Eject ("open file", in the main window and the playlist) opens Arcanist's library instead of the computer's files,
    // which ADD FILE and dropping files still reach. Caught before Webamp's own handler (React listens on its root).
    document.addEventListener(
      "click",
      (event) => {
        if (!(event.target instanceof Element) || !event.target.closest("#webamp #eject, #webamp .playlist-eject-button")) return;
        event.stopPropagation();
        event.preventDefault();
        hooks.addFromLibrary();
      },
      true,
    );
    // Clicking any of Webamp's windows brings it in front of Arcanist's, as clicking one of those does for it.
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target instanceof Element && event.target.closest("#webamp")) this.toFront();
      },
      true,
    );
  }

  /** The area Webamp's windows go in (above the taskbar or the tabs). */
  attach(host: HTMLElement): void {
    this.host = host;
    this.fitLater();
  }

  private fitLater(): void {
    if (this.fitting) return;
    this.fitting = true;
    requestAnimationFrame(() => {
      this.fitting = false;
      this.fit();
    });
  }

  /**
   * On a phone, Webamp's open windows go one under the other, scaled so the column is as wide as the screen (or as
   * tall, held sideways), and the playlist (or Milkdrop) grows to fill what is left below. On the desktop, nothing.
   */
  private fit(): void {
    // Webamp's own node (on the body; the host only says where its windows go) is what scales.
    const host = this.host;
    const node = document.getElementById("webamp");
    if (!host || !node) return;
    if (!isMobile()) {
      if (node.style.zoom) node.style.zoom = "";
      return;
    }
    const state = this.webamp.store.getState();
    const dispatch = this.webamp.store.dispatch as (action: unknown) => void;
    const open = (id: string) => (state.windows.genWindows as Record<string, { open: boolean } | undefined>)[id]?.open ?? false;
    const info = new Map<string, WindowInfo>(Selectors.getWindowsInfo(state).map((w) => [w.key, w]));
    const stack = (["main", "equalizer", "playlist", "milkdrop"] as const).filter((id) => open(id) && info.has(id));
    if (stack.length === 0) return;
    const filler = stack.includes("milkdrop") ? "milkdrop" : stack.includes("playlist") ? "playlist" : null;
    const windows = state.windows.genWindows as Record<string, { size: [number, number]; shade?: boolean }>;
    const resizable = (id: string): id is "playlist" | "milkdrop" => id === "playlist" || id === "milkdrop";
    // Each window at its smallest: the resizable ones without their extra steps.
    const smallest = (id: string) => {
      const w = info.get(id)!;
      const [extraWidth, extraHeight] = resizable(id) ? windows[id].size : [0, 0];
      return { width: w.width - extraWidth * RESIZE_STEP.width, height: windows[id].shade ? w.height : w.height - extraHeight * RESIZE_STEP.height };
    };
    const width = Math.max(...stack.map((id) => smallest(id).width));
    const column = stack.reduce((sum, id) => sum + smallest(id).height, 0);

    const box = host.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const zoom = Math.min(box.width / width, box.height / column);
    if (node.style.zoom !== String(zoom)) node.style.zoom = String(zoom);
    const room = { width: box.width / zoom, height: box.height / zoom };

    // The filler takes the rest of the screen, in its steps; the other resizable one stays at its smallest.
    const grow = filler && !windows[filler].shade ? Math.max(0, Math.floor((room.height - column) / RESIZE_STEP.height)) : 0;
    for (const id of stack.filter(resizable)) {
      const extra = id === filler ? grow : 0;
      const [w, h] = windows[id].size;
      if (w !== 0 || h !== extra) dispatch(setWindowSize(id, [0, extra]));
    }
    const left = Math.floor(box.left / zoom) + Math.max(0, Math.floor((room.width - width) / 2));
    let top = Math.floor(box.top / zoom) + Math.max(0, Math.floor((room.height - column - grow * RESIZE_STEP.height) / 2));
    const positions: Record<string, { x: number; y: number }> = {};
    let moved = false;
    for (const id of stack) {
      positions[id] = { x: left, y: top };
      const w = info.get(id)!;
      if (w.x !== left || w.y !== top) moved = true;
      top += smallest(id).height + (id === filler ? grow * RESIZE_STEP.height : 0);
    }
    if (moved) dispatch(updateWindowPositions(positions, true));
  }

  /** Brings Webamp's windows (and their menus) in front of Arcanist's. */
  toFront(): void {
    if (this.z + 1 >= desktopWindows.top()) return;
    this.z = desktopWindows.raise(2);
    this.webamp.store.dispatch({ type: "SET_Z_INDEX", zIndex: this.z } as never);
  }

  /** Webamp's layer in the desktop's stacking order. */
  get zIndex(): number {
    return this.z;
  }

  /** Whether Webamp was closed (its taskbar button opens it again). */
  get closed(): boolean {
    return this.webamp.store.getState().display.closed;
  }

  /** Puts Webamp's windows back where they start: open, stacked and centered above the taskbar. */
  resetLayout(): void {
    const dispatch = this.webamp.store.dispatch as (action: unknown) => void;
    this.webamp.reopen();
    const windows = this.webamp.store.getState().windows.genWindows as Record<string, { open: boolean }>;
    for (const id of ["main", "equalizer", "playlist"] as const) if (!windows[id]?.open) dispatch(toggleWindow(id));
    dispatch(setWindowLayout(this.layout));
    dispatch(centerWindows({ left: 0, top: 0, width: innerWidth, height: innerHeight - TASKBAR_HEIGHT }));
    this.toFront();
  }

  /** A skin (.wsz) for Webamp. */
  setSkin(skin: Blob): void {
    (this.webamp.store.dispatch as (action: unknown) => void)(setSkinFromBlob(skin));
  }

  /** Webamp's own skin. */
  setBaseSkin(): void {
    this.webamp.store.dispatch(loadDefaultSkin());
  }

  /** Shows Webamp again (after it was closed) in front. */
  reopen(): void {
    this.webamp.reopen();
    this.toFront();
  }

  /** Opens Webamp for what was just played or queued: in front on the desktop; on a phone the page stays. */
  private show(): void {
    if (isMobile()) this.webamp.reopen();
    else this.reopen();
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
    this.show();
    this.webamp.setTracksToPlay(tracks.map((t) => this.toWebamp(t)));
  }

  append(tracks: Track[]): void {
    if (tracks.length === 0) return;
    this.show();
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
