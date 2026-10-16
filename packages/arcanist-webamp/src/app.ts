import { useSyncExternalStore } from "react";
import * as api from "./api/arcanist";
import { session } from "./api/client";
import { desktopWindows } from "./desktop/windows";
import { t } from "./i18n";
import { songMenu } from "./menus";
import { ArcanistPlayer } from "./player/player";
import { settings } from "./settings";

// What the whole player shares: the Webamp instance, the server, and the user's playlists (for the menus, which
// are built synchronously).

let player: ArcanistPlayer | null = null;
let server: api.ServerInfo | null = null;
let playlists: api.Playlist[] = [];
let pendingLoad: ((tracks: api.Track[] | null) => void) | null = null;
let libraries: api.Library[] | null = null;
let loadingLibraries: Promise<api.Library[]> | null = null;
const libraryListeners = new Set<() => void>();

/** A page of Arcanist's panel (same server, wherever this player is mounted), in a new tab. */
export function openPanel(path = ""): void {
  window.open(new URL(`/admin/${path}`, location.origin).href, "_blank");
}

/** Whether the user may use the panel beyond their account: administrators and managers. */
export function managesServer(): boolean {
  const user = session.user;
  return (
    user?.role === "ADMIN" ||
    ["MANAGE_LIBRARIES", "MANAGE_USERS", "MANAGE_SETTINGS", "RUN_SCANS", "VIEW_ALL_STATS"].some((p) => user?.permissions.includes(p))
  );
}

export const app = {
  get player(): ArcanistPlayer {
    if (!player) throw new Error("The player is not started.");
    return player;
  },
  get server(): api.ServerInfo | null {
    return server;
  },
  setServer(info: api.ServerInfo): void {
    server = info;
  },
  get playlists(): api.Playlist[] {
    return playlists;
  },
  async refreshPlaylists(): Promise<api.Playlist[]> {
    try {
      playlists = await api.playlists();
    } catch {
      // The menus keep the last list.
    }
    return playlists;
  },
  /** The libraries the user sees (loaded once). */
  get libraries(): api.Library[] | null {
    return libraries;
  },
  loadLibraries(): Promise<api.Library[]> {
    loadingLibraries ??= api
      .libraries()
      .then((list) => {
        libraries = list;
        for (const listener of libraryListeners) listener();
        return list;
      })
      .catch((e) => {
        loadingLibraries = null;
        throw e;
      });
    return loadingLibraries;
  },
  /** Whether the user can choose a library: the server filters by library and they see more than one. */
  get canChooseLibrary(): boolean {
    return (server?.features.includes("LIBRARY_FILTER") ?? false) && (libraries?.length ?? 0) > 1;
  },
  /** The library the lists show (the chosen one, while it is still there); null is all of them. */
  get libraryId(): string | null {
    const id = settings.value.libraryId;
    return id && app.canChooseLibrary && libraries!.some((l) => l.id === id) ? id : null;
  },
  /** The playlist window answers Webamp's LOAD LIST with the chosen playlist's tracks. */
  resolveLoad(tracks: api.Track[] | null): void {
    pendingLoad?.(tracks);
    pendingLoad = null;
  },
  start(): ArcanistPlayer {
    player ??= new ArcanistPlayer({
      mainMenu: () => [
        {
          label: t("menu.arcanist"),
          children: [
            { label: t("menu.library"), onClick: () => desktopWindows.open("library") },
            { label: t("menu.playlists"), onClick: () => desktopWindows.open("playlists") },
            { label: t("menu.saveAsPlaylist"), onClick: () => saveCurrentList() },
            { label: t("menu.starTracks"), onClick: () => desktopWindows.open("starTracks") },
            { label: t("menu.mixes"), onClick: () => desktopWindows.open("mixes") },
            { label: t("menu.lyrics"), onClick: () => desktopWindows.open("lyrics") },
            { label: t("menu.upload"), onClick: () => desktopWindows.open("upload") },
            { label: t("menu.personalize"), onClick: () => desktopWindows.open("personalize") },
            { type: "separator" },
            { label: t("menu.account"), onClick: () => desktopWindows.open("account") },
            { label: t("menu.accountSettings"), onClick: () => openPanel("account") },
            ...(managesServer() ? [{ label: t("menu.panel"), onClick: () => openPanel() }] : []),
          ],
        },
      ],
      trackMenu: (tracks, ids) => songMenu(tracks, { webampIds: ids }),
      loadList: () =>
        new Promise((resolve) => {
          app.resolveLoad(null);
          pendingLoad = resolve;
          desktopWindows.open("playlists", { pick: true, onClose: () => app.resolveLoad(null) });
        }),
      saveList: (tracks, others) => desktopWindows.open("savePlaylist", { tracks, others }),
      addFromLibrary: () => desktopWindows.open("library"),
    });
    void app.refreshPlaylists();
    void app.loadLibraries().catch(() => {
      // The windows that need them ask again.
    });
    return player;
  },
};

/** SAVE LIST from the main menu: the playlist as Webamp has it. */
function saveCurrentList(): void {
  const p = app.player;
  const order = p.webamp.store.getState().playlist.trackOrder;
  const tracks = order.map((id) => p.trackOf(id));
  desktopWindows.open("savePlaylist", {
    tracks: tracks.filter((x): x is api.Track => x != null),
    others: tracks.filter((x) => x == null).length,
  });
}

/** The libraries the user sees, once loaded. */
export function useLibraries(): api.Library[] | null {
  return useSyncExternalStore(
    (listener) => {
      libraryListeners.add(listener);
      return () => libraryListeners.delete(listener);
    },
    () => libraries,
  );
}
