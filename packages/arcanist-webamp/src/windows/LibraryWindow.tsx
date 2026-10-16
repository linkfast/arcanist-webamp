import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Library, Play, Search } from "lucide-react";
import * as api from "../api/arcanist";
import { app } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { t } from "../i18n";
import { Button, Input, cn } from "../ui/ui";
import { Artwork, ListActions, Loading, TrackList, useLoad } from "./common";

type View =
  | { kind: "browse" }
  | { kind: "search"; query: string }
  | { kind: "album"; id: string }
  | { kind: "artist"; id: string; name: string };

function initialView(props: Record<string, unknown>): View {
  if (typeof props.albumId === "string") return { kind: "album", id: props.albumId };
  if (typeof props.artistId === "string") return { kind: "artist", id: props.artistId, name: String(props.artistName ?? "") };
  return { kind: "browse" };
}

/** Browsing the user's music: albums and artists, search, an album's songs, an artist's albums. */
export function LibraryWindow({ window: win }: { window: DesktopWindow }) {
  const [history, setHistory] = useState<View[]>(() => [initialView(win.props)]);
  const view = history[history.length - 1];
  const [query, setQuery] = useState("");

  // Opened again from a menu ("Go to the album"): show that.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const next = initialView(win.props);
    if (next.kind !== "browse") setHistory((h) => [...h, next]);
  }, [win.props]);

  const go = (next: View) => setHistory((h) => [...h, next]);
  const back = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));

  return (
    <Window window={win} title={t("library.title")} icon={<Library className="size-4" />} width={640} height={560}>
      <div className="grid gap-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) go({ kind: "search", query: query.trim() });
          }}
        >
          {history.length > 1 && (
            <Button variant="outline" size="icon" aria-label={t("common.back")} onClick={back}>
              <ArrowLeft />
            </Button>
          )}
          <Input value={query} placeholder={t("library.search")} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" variant="secondary" size="icon" aria-label={t("common.search")}>
            <Search />
          </Button>
        </form>
        {view.kind === "browse" && <Browse onAlbum={(id) => go({ kind: "album", id })} onArtist={(id, name) => go({ kind: "artist", id, name })} />}
        {view.kind === "search" && (
          <SearchResults query={view.query} onAlbum={(id) => go({ kind: "album", id })} onArtist={(id, name) => go({ kind: "artist", id, name })} />
        )}
        {view.kind === "album" && <AlbumView id={view.id} onArtist={(id, name) => go({ kind: "artist", id, name })} />}
        {view.kind === "artist" && <ArtistView id={view.id} name={view.name} onAlbum={(id) => go({ kind: "album", id })} />}
      </div>
    </Window>
  );
}

function Browse({ onAlbum, onArtist }: { onAlbum: (id: string) => void; onArtist: (id: string, name: string) => void }) {
  const [tab, setTab] = useState<"albums" | "artists">("albums");
  return (
    <div className="grid gap-3">
      <div className="inline-flex w-fit rounded-lg bg-muted p-1">
        {(["albums", "artists"] as const).map((key) => (
          <button
            key={key}
            className={cn("rounded-md px-3 py-1 text-sm", tab === key ? "bg-[var(--background)] shadow-sm" : "text-muted-foreground")}
            onClick={() => setTab(key)}
          >
            {t(key === "albums" ? "library.albums" : "library.artists")}
          </button>
        ))}
      </div>
      {tab === "albums" ? <AlbumGrid onAlbum={onAlbum} /> : <ArtistList onArtist={onArtist} />}
    </div>
  );
}

function AlbumGrid({ onAlbum, artistId }: { onAlbum: (id: string) => void; artistId?: string }) {
  const [pages, setPages] = useState<api.Album[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const { error, loading } = useLoad(async () => {
    const page = await api.albums(null, after, artistId);
    setPages((p) => (after ? [...p, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, [after, artistId]);
  return (
    <div className="grid gap-3">
      <Albums albums={pages} onAlbum={onAlbum} />
      <Loading error={error} loading={loading} />
      {cursor && !loading && (
        <Button variant="outline" size="sm" className="justify-self-center" onClick={() => setAfter(cursor)}>
          {t("common.more")}
        </Button>
      )}
    </div>
  );
}

function Albums({ albums, onAlbum }: { albums: api.Album[]; onAlbum: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
      {albums.map((album) => (
        <li key={album.id}>
          <button className="grid w-full gap-1 rounded-lg p-1 text-left hover:bg-accent/50" onClick={() => onAlbum(album.id)}>
            <Artwork id={album.artworkId} size={112} className="w-full" />
            <span className="truncate text-sm font-medium">{album.title}</span>
            <span className="truncate text-xs text-muted-foreground">
              {album.artist.name}
              {album.year ? ` · ${album.year}` : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ArtistList({ onArtist }: { onArtist: (id: string, name: string) => void }) {
  const [list, setList] = useState<api.Artist[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const { error, loading } = useLoad(async () => {
    const page = await api.artists(null, after);
    setList((l) => (after ? [...l, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, [after]);
  return (
    <div className="grid gap-2">
      <ul className="grid gap-0.5">
        {list.map((artist) => (
          <li key={artist.id}>
            <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50" onClick={() => onArtist(artist.id, artist.name)}>
              {artist.name}
            </button>
          </li>
        ))}
      </ul>
      <Loading error={error} loading={loading} />
      {cursor && !loading && (
        <Button variant="outline" size="sm" className="justify-self-center" onClick={() => setAfter(cursor)}>
          {t("common.more")}
        </Button>
      )}
    </div>
  );
}

function SearchResults({ query, onAlbum, onArtist }: { query: string; onAlbum: (id: string) => void; onArtist: (id: string, name: string) => void }) {
  const { data, error, loading } = useLoad(() => api.search(query), [query]);
  if (!data) return <Loading error={error} loading={loading} />;
  return (
    <div className="grid gap-5">
      {data.artists.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">{t("library.artists")}</h3>
          <div className="flex flex-wrap gap-2">
            {data.artists.map((a) => (
              <Button key={a.id} size="sm" variant="outline" onClick={() => onArtist(a.id, a.name)}>
                {a.name}
              </Button>
            ))}
          </div>
        </section>
      )}
      {data.albums.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">{t("library.albums")}</h3>
          <Albums albums={data.albums} onAlbum={onAlbum} />
        </section>
      )}
      <section className="grid gap-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">{t("library.tracks")}</h3>
        <TrackList tracks={data.tracks} />
      </section>
    </div>
  );
}

function AlbumView({ id, onArtist }: { id: string; onArtist: (id: string, name: string) => void }) {
  const { data, error, loading } = useLoad(() => api.albumTracks(id), [id]);
  if (!data) return <Loading error={error} loading={loading} />;
  const first = data[0];
  return (
    <div className="grid gap-4">
      {first && (
        <div className="flex gap-4">
          <Artwork id={first.artworkId} size={128} />
          <div className="grid content-end gap-1">
            <h3 className="text-lg font-semibold">{first.album.title}</h3>
            {first.artists[0] && (
              <button className="w-fit text-sm text-muted-foreground hover:underline" onClick={() => onArtist(first.artists[0].artistId, first.artists[0].name)}>
                {first.artists[0].name}
              </button>
            )}
            <ListActions tracks={data} playLabel={t("library.playAlbum")} />
          </div>
        </div>
      )}
      <TrackList tracks={data} numbered />
    </div>
  );
}

function ArtistView({ id, name, onAlbum }: { id: string; name: string; onAlbum: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t("library.albumsOf", { name })}</h3>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              app.player.play(await api.artistTracks(id));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Play /> {t("library.playArtist")}
        </Button>
      </div>
      <AlbumGrid onAlbum={onAlbum} artistId={id} />
    </div>
  );
}
