import { gql, rest } from "./client";

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
}

export interface Album {
  id: string;
  title: string;
  year: number | null;
  artworkId: string | null;
  trackCount: number;
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
  artworkIds: string[];
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
  hasLyrics streamUrl starred rating`;
const ALBUM = `id title year artworkId trackCount artist { id name }`;
const PLAYLIST = `id name description isPublic role trackCount durationMs artworkIds owner { id name }`;

export async function serverInfo(): Promise<ServerInfo> {
  return rest<ServerInfo>("GET", "/rest/v1/server-info");
}

export async function albums(search: string | null, after: string | null, artistId?: string): Promise<Page<Album>> {
  return (
    await gql<{ albums: Page<Album> }>(
      `query($s: String, $a: String, $artist: ID) { albums(search: $s, after: $a, first: 60, artistId: $artist) { items { ${ALBUM} } nextCursor totalCount } }`,
      { s: search || null, a: after, artist: artistId ?? null },
    )
  ).albums;
}

export async function artists(search: string | null, after: string | null): Promise<Page<Artist>> {
  return (
    await gql<{ artists: Page<Artist> }>(
      `query($s: String, $a: String) { artists(search: $s, after: $a, first: 100) { items { id name } nextCursor totalCount } }`,
      { s: search || null, a: after },
    )
  ).artists;
}

export async function albumTracks(albumId: string): Promise<Track[]> {
  return (
    await gql<{ tracks: Page<Track> }>(`query($id: ID) { tracks(albumId: $id) { items { ${TRACK} } } }`, { id: albumId })
  ).tracks.items;
}

export async function artistTracks(artistId: string): Promise<Track[]> {
  const result: Track[] = [];
  let after: string | null = null;
  do {
    const page: Page<Track> = (
      await gql<{ tracks: Page<Track> }>(
        `query($id: ID, $a: String) { tracks(artistId: $id, after: $a, first: 500) { items { ${TRACK} } nextCursor } }`,
        { id: artistId, a: after },
      )
    ).tracks;
    result.push(...page.items);
    after = page.nextCursor;
  } while (after);
  return result;
}

export async function search(query: string): Promise<{ artists: Artist[]; albums: Album[]; tracks: Track[]; playlists: Playlist[] }> {
  return (
    await gql<{ search: { artists: Artist[]; albums: Album[]; tracks: Track[]; playlists: Playlist[] } }>(
      `query($q: String!) { search(query: $q, first: 20) { artists { id name } albums { ${ALBUM} } tracks { ${TRACK} } playlists { ${PLAYLIST} } } }`,
      { q: query },
    )
  ).search;
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
  return (await gql<{ mixes: Mix[] }>(`query { mixes { id kind subject artworkIds } }`)).mixes;
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
