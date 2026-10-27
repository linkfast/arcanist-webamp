import { Clapperboard, CloudUpload, Disc3, ListPlus, Play, Puzzle } from "lucide-react";
import { createElement } from "react";
import * as api from "./api/arcanist";
import { absolute, session } from "./api/client";
import { app } from "./app";
import { desktopWindows, openExtensionApp } from "./desktop/windows";
import { openVideo } from "./windows/VideoWindows";
import { errorText, t } from "./i18n";
import type { MenuItem } from "./ui/menu";
import { toast } from "./ui/ui";

// The menus of songs, albums and artists: the same items in Webamp's playlist and in Arcanist's windows.

const icon = (glyph: typeof Play) => createElement(glyph);

export async function run<T>(action: () => Promise<T>, done?: (result: T) => string | void): Promise<void> {
  try {
    const result = await action();
    const message = done?.(result);
    if (message) toast(message);
  } catch (error) {
    toast(errorText((error as { code?: string }).code ?? (error as Error).message), true);
  }
}

/** "Add to playlist": the user's editable playlists and a new one, for songs known now or fetched on click. */
function addToPlaylistItem(tracks: () => Promise<api.Track[]>): MenuItem {
  const editable = app.playlists.filter((p) => p.role !== "VIEWER");
  return {
    label: t("menu.addTo"),
    children: [
      ...editable.map(
        (p): MenuItem => ({
          label: p.name,
          onClick: () =>
            run(
              async () => api.addToPlaylist(p.id, (await tracks()).map((x) => x.id)),
              () => {
                void app.refreshPlaylists();
                return t("playlists.added", { name: p.name });
              },
            ),
        }),
      ),
      ...(editable.length ? [{ type: "separator" as const }] : []),
      {
        label: t("playlists.new"),
        onClick: () => run(tracks, (list) => void desktopWindows.open("savePlaylist", { tracks: list, others: 0 })),
      },
    ],
  };
}

/**
 * "Upload to my Ultimate Cloud": the songs go to the user's own Ultimate Cloud library, in the background (Arcanist's
 * history of uploads follows them). Only with a linked account and the DOWNLOAD permission.
 */
function cloudItem(tracks: () => Promise<api.Track[]>): MenuItem[] {
  if (!app.canUploadToCloud) return [];
  return [
    {
      label: t("menu.uploadCloud"),
      icon: icon(CloudUpload),
      onClick: () =>
        run(
          async () => api.uploadToMyCloud((await tracks()).map((x) => x.id)),
          (rows) => {
            const count = (status: api.MyUploadStatus) => rows.filter((r) => r.status === status).length;
            const [queued, already, failed] = [count("QUEUED"), count("ALREADY_IN_CLOUD"), count("FAILED")];
            if (failed === rows.length) {
              toast(errorText(rows[0]?.errorCode ?? "upload_failed"), true);
              return;
            }
            return [
              queued ? t("cloud.queued", { count: queued }) : "",
              already ? t("cloud.already", { count: already }) : "",
              failed ? t("cloud.failed", { count: failed }) : "",
            ]
              .filter(Boolean)
              .join(" ");
          },
        ),
    },
  ];
}

interface SongMenuOptions {
  /** The songs' ids in Webamp's playlist, when the menu is Webamp's: it can remove them. */
  webampIds?: number[];
  /** Called with a song whose StarTrack changed, for lists that show it. */
  onChange?: (track: api.Track) => void;
}

/** The menu of one or more songs. In Arcanist's lists it starts with playing and adding them. */
export function songMenu(tracks: api.Track[], options: SongMenuOptions = {}): MenuItem[] {
  const one = tracks.length === 1 ? tracks[0] : null;
  const changed = (track: api.Track) => {
    app.player.update(track);
    options.onChange?.(track);
  };
  const items: MenuItem[] = [];

  if (!options.webampIds) {
    items.push(
      { label: t("common.play"), icon: icon(Play), onClick: () => app.player.play(tracks) },
      { label: t("common.add"), icon: icon(ListPlus), onClick: () => app.player.append(tracks) },
      { type: "separator" },
    );
  }

  if (one) {
    items.push({
      label: t("menu.starTrack"),
      checked: one.starred,
      onClick: () => run(() => api.starTrack(one.id, !one.starred), changed),
    });
  } else {
    items.push({
      label: t("menu.starAll"),
      onClick: () =>
        run(async () => {
          for (const track of tracks.filter((x) => !x.starred)) changed(await api.starTrack(track.id, true));
        }),
    });
  }

  items.push(addToPlaylistItem(async () => tracks));
  // Songs all in the user's own Ultimate Cloud library are there already.
  const personal = app.myCloud?.libraryId;
  if (!personal || !tracks.every((x) => x.libraryIds.length === 1 && x.libraryIds[0] === personal)) items.push(...cloudItem(async () => tracks));

  if (one) {
    items.push(
      { type: "separator" },
      {
        label: t("menu.radio"),
        icon: icon(Disc3),
        onClick: () => run(() => api.mixTracks(`track:${one.id.replaceAll("-", "")}`), (radio) => app.player.play(radio)),
      },
      { label: t("menu.album"), onClick: () => desktopWindows.open("library", { albumId: one.album.id, albumTitle: one.album.title }) },
    );
    const artist = one.artists.find((a) => a.role !== "FEATURED") ?? one.artists[0];
    if (artist) items.push({ label: t("menu.artist"), onClick: () => desktopWindows.open("library", { artistId: artist.artistId, artistName: artist.name }) });
    items.push({ label: t("menu.lyrics"), disabled: !one.hasLyrics, onClick: () => desktopWindows.open("lyrics", { trackId: one.id }) });
    // Its music videos, and what extensions offer on a song (looking for its video, say).
    const videos = one.videos ?? [];
    for (const clip of videos)
      items.push({ label: videos.length > 1 ? `${t("menu.video")}: ${clip.title}` : t("menu.video"), icon: icon(Clapperboard), onClick: () => openVideo(clip) });
    for (const extension of app.extensionApps) {
      for (const action of extension.trackActions ?? []) {
        if (action.withoutVideoOnly && videos.length) continue;
        items.push({
          label: action.name,
          icon: icon(Puzzle),
          onClick: () => openExtensionApp({ ...extension, url: action.url.replaceAll("{trackId}", one.id) }),
        });
      }
    }
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

  if (options.webampIds) {
    const ids = options.webampIds;
    items.push({ type: "separator" }, { label: t("menu.remove"), onClick: () => app.player.removeFromList(ids) });
  }
  return items;
}

/** The menu of an album: its songs are fetched when an item needs them. */
export function albumMenu(album: api.Album, open?: () => void): MenuItem[] {
  const tracks = () => api.albumTracks(album.id);
  return [
    { label: t("library.playAlbum"), icon: icon(Play), onClick: () => run(tracks, (list) => app.player.play(list)) },
    { label: t("common.add"), icon: icon(ListPlus), onClick: () => run(tracks, (list) => app.player.append(list)) },
    addToPlaylistItem(tracks),
    ...cloudItem(tracks),
    { type: "separator" },
    ...(open ? [{ label: t("menu.openAlbum"), onClick: open }] : []),
    { label: t("menu.artist"), onClick: () => desktopWindows.open("library", { artistId: album.artist.id, artistName: album.artist.name }) },
  ];
}

/** The menu of an artist: everything by them (in the chosen library), their mix, their page. */
export function artistMenu(artist: api.Artist, open?: () => void): MenuItem[] {
  const tracks = () => api.artistTracks(artist.id, app.libraryId);
  return [
    { label: t("library.playArtist"), icon: icon(Play), onClick: () => run(tracks, (list) => app.player.play(list)) },
    { label: t("common.add"), icon: icon(ListPlus), onClick: () => run(tracks, (list) => app.player.append(list)) },
    {
      label: t("menu.artistMix"),
      icon: icon(Disc3),
      onClick: () => run(() => api.mixTracks(`artist:${artist.id.replaceAll("-", "")}`), (list) => app.player.play(list)),
    },
    { type: "separator" },
    { label: t("menu.openArtist"), onClick: open ?? (() => desktopWindows.open("library", { artistId: artist.id, artistName: artist.name })) },
  ];
}

/** Plays (or adds) a mix's songs. */
export function playMix(mix: Pick<api.Mix, "id">, append = false): Promise<void> {
  return run(
    () => api.mixTracks(mix.id),
    (list) => (append ? app.player.append(list) : app.player.play(list)),
  );
}
