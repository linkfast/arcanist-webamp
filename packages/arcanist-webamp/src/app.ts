import type { ContextMenuItem } from "../../webamp/js/types";
import * as api from "./api/arcanist";
import { absolute, session } from "./api/client";
import { desktopWindows } from "./desktop/windows";
import { t, errorText } from "./i18n";
import { ArcanistPlayer } from "./player/player";
import { toast } from "./ui/ui";

// What the whole player shares: the Webamp instance, the server, and the user's playlists (for the menus, which
// are built synchronously).

let player: ArcanistPlayer | null = null;
let server: api.ServerInfo | null = null;
let playlists: api.Playlist[] = [];
let pendingLoad: ((tracks: api.Track[] | null) => void) | null = null;

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
            { type: "separator" },
            { label: t("menu.account"), onClick: () => desktopWindows.open("account") },
          ],
        },
      ],
      trackMenu: (tracks, ids) => trackMenu(tracks, ids),
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

async function run<T>(action: () => Promise<T>, done?: (result: T) => string | void): Promise<void> {
  try {
    const result = await action();
    const message = done?.(result);
    if (message) toast(message);
  } catch (error) {
    toast(errorText((error as { code?: string }).code ?? (error as Error).message), true);
  }
}

function trackMenu(tracks: api.Track[], ids: number[]): ContextMenuItem[] {
  const one = tracks.length === 1 ? tracks[0] : null;
  const editable = app.playlists.filter((p) => p.role !== "VIEWER");
  const items: ContextMenuItem[] = [];

  if (one) {
    items.push({
      label: t("menu.starTrack"),
      checked: one.starred,
      onClick: () => run(() => api.starTrack(one.id, !one.starred), (updated) => app.player.update(updated)),
    });
  } else {
    items.push({
      label: t("menu.starAll"),
      onClick: () =>
        run(async () => {
          for (const track of tracks.filter((x) => !x.starred)) app.player.update(await api.starTrack(track.id, true));
        }),
    });
  }

  items.push({
    label: t("menu.addTo"),
    children: [
      ...editable.map((p) => ({
        label: p.name,
        onClick: () =>
          run(() => api.addToPlaylist(p.id, tracks.map((x) => x.id)), () => {
            void app.refreshPlaylists();
            return t("playlists.added", { name: p.name });
          }),
      })),
      ...(editable.length ? [{ type: "separator" as const }] : []),
      { label: t("playlists.new"), onClick: () => desktopWindows.open("savePlaylist", { tracks, others: 0 }) },
    ],
  });

  if (one) {
    items.push(
      { type: "separator" },
      {
        label: t("menu.radio"),
        onClick: () => run(() => api.mixTracks(`track:${one.id.replaceAll("-", "")}`), (radio) => app.player.play(radio)),
      },
      { label: t("menu.album"), onClick: () => desktopWindows.open("library", { albumId: one.album.id }) },
    );
    const artist = one.artists.find((a) => a.role !== "FEATURED") ?? one.artists[0];
    if (artist) items.push({ label: t("menu.artist"), onClick: () => desktopWindows.open("library", { artistId: artist.artistId, artistName: artist.name }) });
    items.push({ label: t("menu.lyrics"), disabled: !one.hasLyrics, onClick: () => desktopWindows.open("lyrics", { trackId: one.id }) });
    if (session.can("DOWNLOAD"))
      items.push({
        label: t("menu.download"),
        onClick: () => {
          const url = new URL(absolute(one.streamUrl));
          url.searchParams.set("download", "true");
          window.open(url.href, "_blank");
        },
      });
  }

  items.push({ type: "separator" }, { label: t("menu.remove"), onClick: () => app.player.removeFromList(ids) });
  return items;
}
