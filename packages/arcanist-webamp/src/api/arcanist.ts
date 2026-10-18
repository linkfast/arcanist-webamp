import { gql, rest } from "./client";
import { language } from "../i18n";

// What this player reads of Arcanist's API (docs/developers/README.md in Arcanist).

export interface Track {
  id: string;
  title: string;
  album: { id: string; title: string };
  artists: { artistId: string; name: string; role: string }[];
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number;
  artworkId: string | null;
  hasLyrics: boolean;
  streamUrl: string;
  starred: boolean;
  rating: number | null;
  /** The libraries with a copy the user can play. */
  libraryIds: string[];
}

export interface Album {
  id: string;
  title: string;
  year: number | null;
  artworkId: string | null;
  trackCount: number;
  durationMs?: number;
  artist: { id: string; name: string };
}

export interface Artist {
  id: string;
  name: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  role: "OWNER" | "COLLABORATOR" | "VIEWER";
  trackCount: number;
  durationMs: number;
  artworkIds: string[];
  owner: { id: string; name: string };
}

export interface Mix {
  id: string;
  kind: "ARTIST" | "GENRE" | "DECADE" | "FAVORITES" | "DISCOVERY" | "TRACK";
  subject: string | null;
  subjectId: string | null;
  artworkIds: string[];
}

export type HomeSectionKind =
  | "RECENTLY_PLAYED"
  | "MIXES"
  | "RECENTLY_ADDED"
  | "MOST_PLAYED"
  | "STARRED"
  | "REDISCOVER"
  | "NEVER_PLAYED"
  | "PLAYLISTS";

export interface HomeSection {
  kind: HomeSectionKind;
  albums: Album[];
  mixes: Mix[];
  tracks: Track[];
  playlists: Playlist[];
}

export interface ArtistOverview {
  artist: Artist;
  topTracks: Track[];
  albums: Album[];
  appearsOn: Album[];
  relatedArtists: Artist[];
  mix: Mix;
  playCount: number;
  artworkId: string | null;
}

export interface SearchResults {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
  playlists: Playlist[];
}

export interface Library {
  id: string;
  name: string;
  canUpload: boolean;
}

export interface ServerInfo {
  name: string;
  version: string;
  sourceUrl: string | null;
  setupCompleted: boolean;
  ratingMode: "STARS" | "STAR";
  features: string[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  totalCount: number;
}

export interface Lyrics {
  plain: string | null;
  synced: { timeMs: number; text: string }[] | null;
  instrumental: boolean;
}

const TRACK = `id title album { id title } artists { artistId name role } discNumber trackNumber durationMs artworkId
  hasLyrics streamUrl starred rating libraryIds`;
const ALBUM = `id title year artworkId trackCount artist { id name }`;
const PLAYLIST = `id name description isPublic role trackCount durationMs artworkIds owner { id name }`;
const MIX = `id kind subject subjectId artworkIds`;

export async function serverInfo(): Promise<ServerInfo> {
  return rest<ServerInfo>("GET", "/rest/v1/server-info");
}

export async function albums(search: string | null, after: string | null, artistId?: string | null, libraryId?: string | null): Promise<Page<Album>> {
  return (
    await gql<{ albums: Page<Album> }>(
      `query($s: String, $a: String, $artist: ID, $l: ID) { albums(search: $s, after: $a, first: 60, artistId: $artist, libraryId: $l) { items { ${ALBUM} } nextCursor totalCount } }`,
      { s: search || null, a: after, artist: artistId ?? null, l: libraryId ?? null },
    )
  ).albums;
}

export async function artists(search: string | null, after: string | null, libraryId?: string | null): Promise<Page<Artist>> {
  return (
    await gql<{ artists: Page<Artist> }>(
      `query($s: String, $a: String, $l: ID) { artists(search: $s, after: $a, first: 100, libraryId: $l) { items { id name } nextCursor totalCount } }`,
      { s: search || null, a: after, l: libraryId ?? null },
    )
  ).artists;
}

/** A page of songs by title, optionally of a library. */
export async function tracks(search: string | null, after: string | null, libraryId?: string | null): Promise<Page<Track>> {
  return (
    await gql<{ tracks: Page<Track> }>(
      `query($s: String, $a: String, $l: ID) { tracks(search: $s, after: $a, first: 100, libraryId: $l) { items { ${TRACK} } nextCursor totalCount } }`,
      { s: search || null, a: after, l: libraryId ?? null },
    )
  ).tracks;
}

export async function albumTracks(albumId: string): Promise<Track[]> {
  return (
    await gql<{ tracks: Page<Track> }>(`query($id: ID) { tracks(albumId: $id) { items { ${TRACK} } } }`, { id: albumId })
  ).tracks.items;
}

/** An album and its songs, in one request. */
export async function albumWithTracks(albumId: string): Promise<{ album: Album; tracks: Track[] }> {
  const result = await gql<{ album: Album; tracks: Page<Track> }>(
    `query($id: ID!) { album(id: $id) { ${ALBUM} durationMs } tracks(albumId: $id) { items { ${TRACK} } } }`,
    { id: albumId },
  );
  return { album: result.album, tracks: result.tracks.items };
}

export async function artistTracks(artistId: string, libraryId?: string | null): Promise<Track[]> {
  const result: Track[] = [];
  let after: string | null = null;
  do {
    const page: Page<Track> = (
      await gql<{ tracks: Page<Track> }>(
        `query($id: ID, $a: String, $l: ID) { tracks(artistId: $id, after: $a, first: 500, libraryId: $l) { items { ${TRACK} } nextCursor } }`,
        { id: artistId, a: after, l: libraryId ?? null },
      )
    ).tracks;
    result.push(...page.items);
    after = page.nextCursor;
  } while (after);
  return result;
}

/**
 * Artists, albums, songs and playlists matching a query. `search` has no library filter: within a library, the
 * lists' own search (the same index) answers, in one request.
 */
export async function search(query: string, libraryId?: string | null): Promise<SearchResults> {
  if (libraryId) {
    const result = await gql<{ artists: Page<Artist>; albums: Page<Album>; tracks: Page<Track> }>(
      `query($q: String, $l: ID) {
        artists(search: $q, first: 20, libraryId: $l) { items { id name } }
        albums(search: $q, first: 20, libraryId: $l) { items { ${ALBUM} } }
        tracks(search: $q, first: 50, libraryId: $l) { items { ${TRACK} } }
      }`,
      { q: query, l: libraryId },
    );
    return { artists: result.artists.items, albums: result.albums.items, tracks: result.tracks.items, playlists: [] };
  }
  return (
    await gql<{ search: SearchResults }>(
      `query($q: String!) { search(query: $q, first: 20) { artists { id name } albums { ${ALBUM} } tracks { ${TRACK} } playlists { ${PLAYLIST} } } }`,
      { q: query },
    )
  ).search;
}

/** The user's home: recently played and added, mixes, most played, StarTracks, to rediscover, playlists. */
export async function home(): Promise<HomeSection[]> {
  return (
    await gql<{ home: { sections: HomeSection[] } }>(
      `query { home { sections { kind albums { ${ALBUM} } mixes { ${MIX} } tracks { ${TRACK} } playlists { ${PLAYLIST} } } } }`,
    )
  ).home.sections;
}

/** An artist's page; within a library, its albums there instead (the overview has no library filter). */
export async function artistOverview(id: string, libraryId?: string | null): Promise<ArtistOverview> {
  const result = await gql<{ artistOverview: ArtistOverview; inLibrary?: Page<Album> }>(
    `query($id: ID!, $l: ID, $within: Boolean!) {
      artistOverview(id: $id) {
        artist { id name } topTracks { ${TRACK} } albums { ${ALBUM} } appearsOn { ${ALBUM} } relatedArtists { id name }
        mix { ${MIX} } playCount artworkId
      }
      inLibrary: albums(artistId: $id, libraryId: $l, first: 200) @include(if: $within) { items { ${ALBUM} } }
    }`,
    { id, l: libraryId ?? null, within: !!libraryId },
  );
  const overview = result.artistOverview;
  if (!result.inLibrary) return overview;
  const own = new Set(overview.albums.map((a) => a.id));
  const albums = result.inLibrary.items;
  return {
    ...overview,
    albums: albums.filter((a) => own.has(a.id) || a.artist.id === id),
    appearsOn: albums.filter((a) => !own.has(a.id) && a.artist.id !== id),
  };
}

export async function playlists(): Promise<Playlist[]> {
  return (await gql<{ playlists: Playlist[] }>(`query { playlists { ${PLAYLIST} } }`)).playlists;
}

export async function playlistTracks(playlistId: string): Promise<Track[]> {
  const result: Track[] = [];
  let after: string | null = null;
  do {
    const page: Page<{ track: Track }> = (
      await gql<{ playlistEntries: Page<{ track: Track }> }>(
        `query($id: ID!, $a: String) { playlistEntries(playlistId: $id, after: $a, first: 500) { items { track { ${TRACK} } } nextCursor } }`,
        { id: playlistId, a: after },
      )
    ).playlistEntries;
    result.push(...page.items.map((e) => e.track));
    after = page.nextCursor;
  } while (after);
  return result;
}

export async function createPlaylist(name: string, isPublic: boolean, trackIds: string[]): Promise<Playlist> {
  return (
    await gql<{ createPlaylist: Playlist }>(
      `mutation($i: CreatePlaylistInput!) { createPlaylist(input: $i) { ${PLAYLIST} } }`,
      { i: { name, description: null, isPublic, trackIds } },
    )
  ).createPlaylist;
}

export async function addToPlaylist(playlistId: string, trackIds: string[]): Promise<Playlist> {
  return (
    await gql<{ addPlaylistTracks: Playlist }>(
      `mutation($id: ID!, $i: AddPlaylistTracksInput!) { addPlaylistTracks(playlistId: $id, input: $i) { ${PLAYLIST} } }`,
      { id: playlistId, i: { trackIds } },
    )
  ).addPlaylistTracks;
}

export async function starTrack(trackId: string, starred: boolean): Promise<Track> {
  return (
    await gql<{ starTrack: Track }>(`mutation($id: ID!, $s: Boolean!) { starTrack(trackId: $id, starred: $s) { ${TRACK} } }`, {
      id: trackId,
      s: starred,
    })
  ).starTrack;
}

export async function starTracks(): Promise<Track[]> {
  const result: Track[] = [];
  let after: string | null = null;
  do {
    const page: Page<{ track: Track }> = (
      await gql<{ starTracks: Page<{ track: Track }> }>(
        `query($a: String) { starTracks(after: $a, first: 500) { items { track { ${TRACK} } } nextCursor } }`,
        { a: after },
      )
    ).starTracks;
    result.push(...page.items.map((s) => s.track));
    after = page.nextCursor;
  } while (after);
  return result;
}

export async function mixes(): Promise<Mix[]> {
  return (await gql<{ mixes: Mix[] }>(`query { mixes { ${MIX} } }`)).mixes;
}

export async function mixTracks(id: string): Promise<Track[]> {
  return (await gql<{ mix: { tracks: Track[] } }>(`query($id: String!) { mix(id: $id) { tracks { ${TRACK} } } }`, { id })).mix
    .tracks;
}

export async function lyrics(trackId: string): Promise<Lyrics> {
  return (
    await gql<{ trackLyrics: Lyrics }>(
      `query($id: ID!) { trackLyrics(trackId: $id) { plain synced { timeMs text } instrumental } }`,
      { id: trackId },
    )
  ).trackLyrics;
}

export async function libraries(): Promise<Library[]> {
  return (await gql<{ libraries: Library[] }>(`query { libraries { id name canUpload } }`)).libraries;
}

export async function recordPlay(trackId: string, playedMs: number, playedAt: Date): Promise<void> {
  await gql(`mutation($i: RecordPlayInput!) { recordPlay(input: $i) { counted } }`, {
    i: { trackId, playedMs: Math.round(playedMs), playedAt: playedAt.toISOString(), client: "Webamp" },
  });
}

export interface UploadResult {
  status: "IMPORTED" | "DUPLICATE";
  path?: string;
}

/** Sends a file into a library, reporting the bytes sent. */
export function upload(libraryId: string, file: File, token: string, onProgress: (sent: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/rest/v1/libraries/${libraryId}/uploads?fileName=${encodeURIComponent(file.name)}`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.onprogress = (e) => onProgress(e.loaded);
    request.onload = () => {
      let body: { status?: string; code?: string } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        // No body.
      }
      if (request.status >= 200 && request.status < 300) resolve(body as UploadResult);
      else reject(new Error(body.code ?? `http_${request.status}`));
    };
    request.onerror = () => reject(new Error("network"));
    request.send(file);
  });
}

export interface PlaylistEntry {
  /** The entry (the same song can be there twice): what is moved and removed. */
  id: string;
  /** Its place in the whole playlist, songs the user cannot play included. */
  position: number;
  track: Track;
}

export async function playlistEntries(playlistId: string): Promise<PlaylistEntry[]> {
  const result: PlaylistEntry[] = [];
  let after: string | null = null;
  do {
    const page: Page<PlaylistEntry> = (
      await gql<{ playlistEntries: Page<PlaylistEntry> }>(
        `query($id: ID!, $a: String) { playlistEntries(playlistId: $id, after: $a, first: 500) { items { id position track { ${TRACK} } } nextCursor } }`,
        { id: playlistId, a: after }
      )
    ).playlistEntries;
    result.push(...page.items);
    after = page.nextCursor;
  } while (after);
  return result;
}

/** Adds songs to a playlist: at a position, or at the end. */
export async function insertIntoPlaylist(playlistId: string, trackIds: string[], position: number | null): Promise<Playlist> {
  return (
    await gql<{ addPlaylistTracks: Playlist }>(
      `mutation($id: ID!, $i: AddPlaylistTracksInput!) { addPlaylistTracks(playlistId: $id, input: $i) { ${PLAYLIST} } }`,
      { id: playlistId, i: { trackIds, position } }
    )
  ).addPlaylistTracks;
}

/** Moves entries together to a position of the playlist without them, keeping their order. */
export async function movePlaylistEntries(playlistId: string, entryIds: string[], position: number): Promise<Playlist> {
  return (
    await gql<{ movePlaylistEntries: Playlist }>(
      `mutation($id: ID!, $i: MovePlaylistEntriesInput!) { movePlaylistEntries(playlistId: $id, input: $i) { ${PLAYLIST} } }`,
      { id: playlistId, i: { entryIds, position } }
    )
  ).movePlaylistEntries;
}

export async function removePlaylistEntries(playlistId: string, entryIds: string[]): Promise<Playlist> {
  return (
    await gql<{ removePlaylistEntries: Playlist }>(
      `mutation($id: ID!, $e: [ID!]!) { removePlaylistEntries(playlistId: $id, entryIds: $e) { ${PLAYLIST} } }`,
      { id: playlistId, e: entryIds }
    )
  ).removePlaylistEntries;
}

/** The user's own Ultimate Cloud account, as far as this player cares. */
export interface MyCloud {
  /** The Ultimate Cloud extension is on. */
  enabled: boolean;
  state: "NOT_CONFIGURED" | "UNLINKED" | "PENDING" | "LINKED";
  tier: "NONE" | "FREE" | "PAID";
  /** Their personal library with the account's music. */
  libraryId: string | null;
}

export async function myCloud(): Promise<MyCloud> {
  return (await gql<{ myUltimateCloud: MyCloud }>(`query { myUltimateCloud { enabled state tier libraryId } }`)).myUltimateCloud;
}

export type MyUploadStatus = "PROCESSING" | "ADDED" | "DUPLICATE" | "NOT_ADDED" | "QUEUED" | "UPLOADING" | "UPLOADED" | "ALREADY_IN_CLOUD" | "FAILED";

export interface MyUpload {
  id: string;
  kind: "LIBRARY" | "ULTIMATE_CLOUD";
  status: MyUploadStatus;
  name: string;
  size: number | null;
  libraryName: string | null;
  track: Track | null;
  errorCode: string | null;
  createdAt: string;
  /** The extension that brought the file (such as "youtube"); null when the user sent it. */
  source?: string | null;
}

export interface MyUploadPage extends Page<MyUpload> {
  /** How many are still on their way. */
  active: number;
}

let uploadSource = false;

/** Whether the server names the extension that brought each upload (EXTENSION_APPS). */
export function setUploadSource(on: boolean): void {
  uploadSource = on;
}

const UPLOAD_BASE = `id kind status name size libraryName errorCode createdAt track { ${TRACK} }`;
const uploadFields = () => (uploadSource ? `${UPLOAD_BASE} source` : UPLOAD_BASE);

export async function myUploads(after: string | null): Promise<MyUploadPage> {
  return (
    await gql<{ myUploads: MyUploadPage }>(
      `query($a: String) { myUploads(after: $a, first: 100) { items { ${uploadFields()} } nextCursor totalCount active } }`,
      { a: after }
    )
  ).myUploads;
}

/** Forgets the finished uploads; returns how many. */
export async function clearMyUploads(): Promise<number> {
  return (await gql<{ clearMyUploads: number }>(`mutation { clearMyUploads }`)).clearMyUploads;
}

/** Sends songs to the user's own Ultimate Cloud library, in the background. */
export async function uploadToMyCloud(trackIds: string[]): Promise<MyUpload[]> {
  return (
    await gql<{ uploadTracksToMyCloud: MyUpload[] }>(`mutation($i: UploadTracksToMyCloudInput!) { uploadTracksToMyCloud(input: $i) { ${uploadFields()} } }`, {
      i: { trackIds },
    })
  ).uploadTracksToMyCloud;
}

/** A page of an installed extension the user may open (in a window, or a tab of its own). */
export interface ExtensionApp {
  extensionId: string;
  id: string;
  name: string;
  description: string | null;
  url: string;
  iconUrl: string | null;
  width: number | null;
  height: number | null;
}

export async function extensionApps(): Promise<ExtensionApp[]> {
  return (
    await gql<{ extensionApps: ExtensionApp[] }>(
      `query($l: String) { extensionApps(language: $l) { extensionId id name description url iconUrl width height } }`,
      { l: language }
    )
  ).extensionApps;
}
