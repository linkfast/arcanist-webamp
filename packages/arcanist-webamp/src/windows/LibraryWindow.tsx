import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Compass, DiscAlbum, Disc3, History, House, Library, ListPlus, MicVocal, Music, Play, Search, Shuffle, User } from "lucide-react";
import * as api from "../api/arcanist";
import { app, useLibraries } from "../app";
import { Window, desktopWindows, type DesktopWindow } from "../desktop/windows";
import { language, t, type TextKey } from "../i18n";
import { artistMenu, playMix, run } from "../menus";
import { settings, useSettings } from "../settings";
import { openMenu } from "../ui/menu";
import { Button, Input, Select, cn } from "../ui/ui";
import { AlbumGrid, ArtistRows, Artwork, ListActions, LoadMore, Loading, MixCard, TrackList, duration, usePages, useLoad } from "./common";

type Section = "home" | "explore" | "recent" | "artists" | "albums" | "tracks";

type View =
  | { kind: Section }
  | { kind: "search"; query: string }
  | { kind: "album"; id: string; title?: string }
  | { kind: "artist"; id: string; name: string };

const SECTIONS: { id: Section; label: TextKey; icon: ReactNode }[] = [
  { id: "home", label: "library.home", icon: <House /> },
  { id: "explore", label: "library.explore", icon: <Compass /> },
  { id: "recent", label: "library.recent", icon: <History /> },
  { id: "artists", label: "library.artists", icon: <MicVocal /> },
  { id: "albums", label: "library.albums", icon: <DiscAlbum /> },
  { id: "tracks", label: "library.tracks", icon: <Music /> },
];

const isSection = (view: View): view is { kind: Section } => SECTIONS.some((s) => s.id === view.kind);

function viewFromProps(props: Record<string, unknown>): View | null {
  if (typeof props.albumId === "string") return { kind: "album", id: props.albumId, title: props.albumTitle as string | undefined };
  if (typeof props.artistId === "string") return { kind: "artist", id: props.artistId, name: String(props.artistName ?? "") };
  return null;
}

function same(a: View, b: View): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function crumb(view: View): string {
  switch (view.kind) {
    case "search":
      return t("library.searchFor", { query: view.query });
    case "album":
      return view.title || t("library.album");
    case "artist":
      return view.name || t("library.artist");
    default:
      return t(SECTIONS.find((s) => s.id === view.kind)!.label);
  }
}

/**
 * Browsing the user's music: home, artists, albums and songs (of all libraries or the chosen one), search, and the
 * pages of albums and artists, with back and forward like a browser.
 */
export function LibraryWindow({ window: win }: { window: DesktopWindow }) {
  const [history, setHistory] = useState<{ stack: View[]; index: number }>(() => ({
    stack: [viewFromProps(win.props) ?? { kind: "home" }],
    index: 0,
  }));
  const view = history.stack[history.index];
  const [query, setQuery] = useState("");
  const libraries = useLibraries();
  useSettings();
  const libraryId = app.libraryId;

  useEffect(() => {
    void app.loadLibraries().catch(() => {
      // Without them there is no selector.
    });
  }, []);

  const go = (next: View, replace = false) =>
    setHistory(({ stack, index }) => {
      if (same(stack[index], next)) return { stack, index };
      const kept = stack.slice(0, replace ? index : index + 1);
      return { stack: [...kept, next], index: kept.length };
    });

  // Opened again from a menu ("Go to the album"): show that.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const next = viewFromProps(win.props);
    if (next) go(next);
  }, [win.props]);

  // Searching as the user types: one entry in the history per search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => go({ kind: "search", query: q }, view.kind === "search"), 350);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // The section a page was reached from stays highlighted, and starts the breadcrumb.
  let section: Section | null = null;
  let from = 0;
  for (let i = history.index; i >= 0; i--) {
    const v = history.stack[i];
    if (isSection(v)) {
      section = v.kind;
      from = i;
      break;
    }
    if (v.kind === "search") {
      from = i;
      break;
    }
  }
  const crumbs = history.stack.slice(from, history.index + 1).map((v, i) => ({ label: crumb(v), index: from + i }));

  const onAlbum = (album: { id: string; title?: string }) => go({ kind: "album", id: album.id, title: album.title });
  const onArtist = (artist: { id: string; name: string }) => go({ kind: "artist", id: artist.id, name: artist.name });
  const nav = { onAlbum, onArtist };
  const chooser = app.canChooseLibrary ? libraries : null;

  return (
    <Window window={win} title={t("library.title")} icon={<Library className="size-4" />} width={880} height={620} bodyClassName="p-0 overflow-hidden">
      <div className="@container size-full">
        <div className="flex size-full flex-col @[620px]:flex-row">
          <aside className="flex shrink-0 items-center gap-1 overflow-x-auto border-b p-1.5 @[620px]:w-44 @[620px]:flex-col @[620px]:items-stretch @[620px]:border-r @[620px]:border-b-0 @[620px]:p-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&_svg]:size-4 [&_svg]:shrink-0",
                  section === s.id ? "bg-[var(--primary)]/12 font-medium text-[var(--foreground)] [&_svg]:text-[var(--primary)]" : "text-muted-foreground",
                )}
                aria-current={section === s.id ? "page" : undefined}
                onClick={() => go({ kind: s.id })}
              >
                {s.icon}
                {t(s.label)}
              </button>
            ))}
            {chooser && (
              <label className="ml-auto grid shrink-0 gap-1 text-xs text-muted-foreground @[620px]:mt-auto @[620px]:ml-0">
                <span className="hidden @[620px]:block">{t("library.chooseLibrary")}</span>
                <Select
                  className="h-8 max-w-48 text-xs"
                  aria-label={t("library.chooseLibrary")}
                  value={libraryId ?? ""}
                  onChange={(e) => settings.set({ libraryId: e.target.value || null })}
                >
                  <option value="">{t("library.allLibraries")}</option>
                  {chooser.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1 border-b px-2 py-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.back")}
                title={t("common.back")}
                disabled={history.index === 0}
                onClick={() => setHistory((h) => ({ ...h, index: Math.max(0, h.index - 1) }))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("library.forward")}
                title={t("library.forward")}
                disabled={history.index >= history.stack.length - 1}
                onClick={() => setHistory((h) => ({ ...h, index: Math.min(h.stack.length - 1, h.index + 1) }))}
              >
                <ChevronRight />
              </Button>
              <nav aria-label={t("library.breadcrumb")} className="flex min-w-0 flex-1 items-center gap-1 px-1 text-sm">
                {crumbs.map((c, i) => (
                  <span key={c.index} className={cn("flex items-center gap-1", i === crumbs.length - 1 ? "min-w-0" : "min-w-0 shrink")}>
                    {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                    {i === crumbs.length - 1 ? (
                      <span className="truncate font-semibold">{c.label}</span>
                    ) : (
                      <button
                        className="truncate text-muted-foreground hover:text-[var(--foreground)] hover:underline"
                        onClick={() => setHistory((h) => ({ ...h, index: c.index }))}
                      >
                        {c.label}
                      </button>
                    )}
                  </span>
                ))}
              </nav>
              <form
                className="relative w-40 shrink-0 @[620px]:w-56"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) go({ kind: "search", query: query.trim() }, view.kind === "search");
                }}
              >
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8"
                  type="search"
                  value={query}
                  placeholder={t("library.search")}
                  aria-label={t("common.search")}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </form>
            </div>
            <div key={`${history.index}-${libraryId}`} className="min-h-0 flex-1 overflow-auto p-4">
              {view.kind === "home" && <HomeView {...nav} />}
              {view.kind === "explore" && <ExploreView libraryId={libraryId} {...nav} />}
              {view.kind === "recent" && <RecentView libraryId={libraryId} {...nav} />}
              {view.kind === "artists" && <ArtistsView libraryId={libraryId} {...nav} />}
              {view.kind === "albums" && <AlbumsView libraryId={libraryId} {...nav} />}
              {view.kind === "tracks" && <TracksView libraryId={libraryId} />}
              {view.kind === "search" && <SearchView query={view.query} libraryId={libraryId} {...nav} />}
              {view.kind === "album" && <AlbumView id={view.id} {...nav} />}
              {view.kind === "artist" && <ArtistView id={view.id} name={view.name} libraryId={libraryId} {...nav} />}
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

interface Nav {
  onAlbum: (album: { id: string; title?: string }) => void;
  onArtist: (artist: { id: string; name: string }) => void;
}

function Heading({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
      {actions}
    </div>
  );
}

const HOME_TITLES: Record<api.HomeSectionKind, TextKey> = {
  RECENTLY_PLAYED: "home.RECENTLY_PLAYED",
  MIXES: "home.MIXES",
  RECENTLY_ADDED: "home.RECENTLY_ADDED",
  MOST_PLAYED: "home.MOST_PLAYED",
  STARRED: "home.STARRED",
  REDISCOVER: "home.REDISCOVER",
  NEVER_PLAYED: "home.NEVER_PLAYED",
  PLAYLISTS: "home.PLAYLISTS",
};

function HomeView({ onAlbum }: Nav) {
  const { data, error, loading } = useLoad(() => api.home(), []);
  if (!data) return <Loading error={error} loading={loading} />;
  return (
    <div className="grid gap-6">
      {app.libraryId && <p className="text-xs text-muted-foreground">{t("library.homeAll")}</p>}
      {data.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("library.homeEmpty")}</p>}
      {data.map((section) => (
        <section key={section.kind} className="grid gap-2">
          <Heading actions={section.tracks.length > 0 && <ListActions tracks={section.tracks} />}>{t(HOME_TITLES[section.kind])}</Heading>
          {section.albums.length > 0 && <AlbumGrid albums={section.albums} onAlbum={onAlbum} row />}
          {section.mixes.length > 0 && (
            <ul className="flex gap-2 overflow-x-auto pb-2">
              {section.mixes.map((mix) => (
                <li key={mix.id} className="w-40 shrink-0">
                  <MixCard mix={mix} />
                </li>
              ))}
            </ul>
          )}
          {section.tracks.length > 0 && <TrackList tracks={section.tracks} />}
          {section.playlists.length > 0 && <PlaylistRow playlists={section.playlists} />}
        </section>
      ))}
    </div>
  );
}

/** Two or more choices in a row, like tabs. */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="tablist" className="inline-flex w-fit rounded-md bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          className={cn(
            "rounded px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            value === o.id ? "bg-[var(--background)] font-medium shadow-sm" : "text-muted-foreground hover:text-[var(--foreground)]",
          )}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const RECENT_TAB = "arcanist.library.recent";

/** What the user played lately (by day) and the albums added lately. */
function RecentView({ libraryId, onAlbum }: Nav & { libraryId: string | null }) {
  const [tab, setTab] = useState<"played" | "added">(() => {
    try {
      return localStorage.getItem(RECENT_TAB) === "added" ? "added" : "played";
    } catch {
      return "played";
    }
  });
  const choose = (next: "played" | "added") => {
    setTab(next);
    try {
      localStorage.setItem(RECENT_TAB, next);
    } catch {
      // Only a convenience.
    }
  };
  return (
    <div className="grid gap-4">
      <Choice
        value={tab}
        onChange={choose}
        options={[
          { id: "played", label: t("recent.played") },
          { id: "added", label: t("recent.added") },
        ]}
      />
      {tab === "played" ? <PlayedView libraryId={libraryId} /> : <AddedView libraryId={libraryId} onAlbum={onAlbum} />}
    </div>
  );
}

function dayOf(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayOf(date) === dayOf(today)) return t("recent.today");
  if (dayOf(date) === dayOf(yesterday)) return t("recent.yesterday");
  return date.toLocaleDateString(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function PlayedView({ libraryId }: { libraryId: string | null }) {
  const pages = usePages((after) => api.playHistory(after), []);
  // The history is the user's across libraries: with one chosen, only its songs.
  const items = libraryId ? pages.items.filter((i) => i.track.libraryIds?.includes(libraryId) ?? true) : pages.items;
  const days: { key: string; label: string; tracks: api.Track[] }[] = [];
  for (const item of items) {
    const date = new Date(item.playedAt);
    const key = dayOf(date);
    if (days.at(-1)?.key !== key) days.push({ key, label: dayLabel(date), tracks: [] });
    days.at(-1)!.tracks.push(item.track);
  }
  return (
    <div className="grid gap-5">
      {days.length === 0 && !pages.loading && !pages.error && <p className="py-6 text-center text-sm text-muted-foreground">{t("recent.empty")}</p>}
      {days.map((day) => (
        <section key={day.key} className="grid gap-2">
          <Heading actions={<ListActions tracks={day.tracks} />}>{day.label}</Heading>
          <TrackList tracks={day.tracks} />
        </section>
      ))}
      <Loading error={pages.error} loading={pages.loading} />
      <LoadMore onMore={pages.more} loading={pages.loading} />
    </div>
  );
}

function AddedView({ libraryId, onAlbum }: { libraryId: string | null; onAlbum: Nav["onAlbum"] }) {
  const pages = usePages((after) => api.sortedAlbums("RECENTLY_ADDED", after, libraryId), [libraryId]);
  return (
    <div className="grid gap-3">
      {(pages.items.length > 0 || (!pages.loading && !pages.error)) && <AlbumGrid albums={pages.items} onAlbum={onAlbum} />}
      <Loading error={pages.error} loading={pages.loading} />
      <LoadMore onMore={pages.more} loading={pages.loading} />
    </div>
  );
}

const MIX_GROUPS: { label: TextKey; kinds: api.Mix["kind"][] }[] = [
  { label: "explore.forYou", kinds: ["FAVORITES", "DISCOVERY"] },
  { label: "explore.genres", kinds: ["GENRE"] },
  { label: "explore.decades", kinds: ["DECADE"] },
  { label: "explore.artists", kinds: ["ARTIST"] },
];

/** Something new to listen to: the user's mixes by kind, and albums at random. */
function ExploreView({ libraryId, onAlbum }: Nav & { libraryId: string | null }) {
  const mixes = useLoad(() => api.mixes(), []);
  const [seed, setSeed] = useState(0);
  const random = useLoad(() => api.sortedAlbums("RANDOM", null, libraryId, seed), [libraryId, seed]);
  return (
    <div className="grid gap-6">
      {mixes.data == null && <Loading error={mixes.error} loading={mixes.loading} />}
      {mixes.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("explore.noMixes")}</p>}
      {MIX_GROUPS.map((group) => {
        const list = (mixes.data ?? []).filter((m) => group.kinds.includes(m.kind));
        if (list.length === 0) return null;
        return (
          <section key={group.label} className="grid gap-2">
            <Heading>{t(group.label)}</Heading>
            <ul className="flex gap-2 overflow-x-auto pb-2">
              {list.map((mix) => (
                <li key={mix.id} className="w-40 shrink-0">
                  <MixCard mix={mix} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="grid gap-2">
        <Heading
          actions={
            <Button size="sm" variant="outline" disabled={random.loading} onClick={() => setSeed((s) => s + 1)}>
              <Shuffle /> {t("explore.shuffle")}
            </Button>
          }
        >
          {t("explore.randomAlbums")}
        </Heading>
        {random.data ? <AlbumGrid albums={random.data.items.slice(0, 24)} onAlbum={onAlbum} /> : <Loading error={random.error} loading={random.loading} />}
      </section>
    </div>
  );
}

function PlaylistRow({ playlists }: { playlists: api.Playlist[] }) {
  const tracks = (p: api.Playlist) => () => api.playlistTracks(p.id);
  return (
    <ul className="flex gap-2 overflow-x-auto pb-2">
      {playlists.map((p) => (
        <li key={p.id} className="w-36 shrink-0">
          <button
            className="grid w-full gap-1 rounded-lg p-1.5 text-left hover:bg-accent/50"
            onClick={() => desktopWindows.open("playlists", { playlistId: p.id })}
            onContextMenu={(e) =>
              openMenu(e, [
                { label: t("common.play"), icon: <Play />, onClick: () => run(tracks(p), (list) => app.player.play(list)) },
                { label: t("common.add"), icon: <ListPlus />, onClick: () => run(tracks(p), (list) => app.player.append(list)) },
                { type: "separator" },
                { label: t("menu.openPlaylist"), onClick: () => desktopWindows.open("playlists", { playlistId: p.id }) },
              ])
            }
          >
            <span className="block aspect-square w-full overflow-hidden rounded-md bg-muted">
              <Artwork id={p.artworkIds[0]} size={256} className="size-full!" />
            </span>
            <span className="truncate text-sm font-medium">{p.name}</span>
            <span className="truncate text-xs text-muted-foreground">{t("playlists.tracks", { count: p.trackCount })}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ArtistsView({ libraryId, onArtist }: Nav & { libraryId: string | null }) {
  const pages = usePages((after) => api.artists(null, after, libraryId), [libraryId]);
  return (
    <div className="grid gap-3">
      {pages.total != null && <Heading>{t("library.countArtists", { count: pages.total })}</Heading>}
      {(pages.items.length > 0 || (!pages.loading && !pages.error)) && <ArtistRows artists={pages.items} onArtist={onArtist} />}
      <Loading error={pages.error} loading={pages.loading} />
      <LoadMore onMore={pages.more} loading={pages.loading} />
    </div>
  );
}

function AlbumsView({ libraryId, onAlbum }: Nav & { libraryId: string | null }) {
  const pages = usePages((after) => api.albums(null, after, null, libraryId), [libraryId]);
  return (
    <div className="grid gap-3">
      {pages.total != null && <Heading>{t("library.countAlbums", { count: pages.total })}</Heading>}
      {(pages.items.length > 0 || (!pages.loading && !pages.error)) && <AlbumGrid albums={pages.items} onAlbum={onAlbum} />}
      <Loading error={pages.error} loading={pages.loading} />
      <LoadMore onMore={pages.more} loading={pages.loading} />
    </div>
  );
}

function TracksView({ libraryId }: { libraryId: string | null }) {
  const pages = usePages((after) => api.tracks(null, after, libraryId), [libraryId]);
  return (
    <div className="grid gap-3">
      {pages.total != null && (
        <Heading actions={<ListActions tracks={pages.items} playLabel={t("library.playLoaded")} />}>
          {t("library.countTracks", { count: pages.total })}
        </Heading>
      )}
      {(pages.items.length > 0 || (!pages.loading && !pages.error)) && <TrackList tracks={pages.items} />}
      <Loading error={pages.error} loading={pages.loading} />
      <LoadMore onMore={pages.more} loading={pages.loading} />
    </div>
  );
}

function SearchView({ query, libraryId, onAlbum, onArtist }: Nav & { query: string; libraryId: string | null }) {
  const { data, error, loading } = useLoad(() => api.search(query, libraryId), [query, libraryId]);
  if (!data) return <Loading error={error} loading={loading} />;
  const nothing = !data.artists.length && !data.albums.length && !data.tracks.length && !data.playlists.length;
  if (nothing) return <p className="py-6 text-center text-sm text-muted-foreground">{t("library.noResults", { query })}</p>;
  return (
    <div className="grid gap-6">
      {data.tracks.length > 0 && (
        <section className="grid gap-2">
          <Heading actions={<ListActions tracks={data.tracks} />}>{t("library.tracks")}</Heading>
          <TrackList tracks={data.tracks} />
        </section>
      )}
      {data.artists.length > 0 && (
        <section className="grid gap-2">
          <Heading>{t("library.artists")}</Heading>
          <ArtistRows artists={data.artists} onArtist={onArtist} />
        </section>
      )}
      {data.albums.length > 0 && (
        <section className="grid gap-2">
          <Heading>{t("library.albums")}</Heading>
          <AlbumGrid albums={data.albums} onAlbum={onAlbum} />
        </section>
      )}
      {data.playlists.length > 0 && (
        <section className="grid gap-2">
          <Heading>{t("library.playlists")}</Heading>
          <PlaylistRow playlists={data.playlists} />
        </section>
      )}
    </div>
  );
}

function AlbumView({ id, onArtist }: Nav & { id: string }) {
  const { data, error, loading } = useLoad(() => api.albumWithTracks(id), [id]);
  if (!data) return <Loading error={error} loading={loading} />;
  const { album, tracks } = data;
  const discs = new Set(tracks.map((x) => x.discNumber ?? 1)).size;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Artwork id={album.artworkId} size={148} className="shadow-lg" />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("library.album")}</span>
          <h3 className="text-xl leading-tight font-semibold">{album.title}</h3>
          <p className="text-sm text-muted-foreground">
            <button className="font-medium text-[var(--foreground)] hover:underline" onClick={() => onArtist(album.artist)}>
              {album.artist.name}
            </button>
            {album.year ? ` · ${album.year}` : ""}
            {` · ${t("playlists.tracks", { count: tracks.length })}`}
            {album.durationMs ? ` · ${duration(album.durationMs)}` : ""}
            {discs > 1 ? ` · ${t("library.discs", { count: discs })}` : ""}
          </p>
          <ListActions tracks={tracks} playLabel={t("library.playAlbum")} />
        </div>
      </div>
      <TrackList tracks={tracks} numbered />
    </div>
  );
}

function ArtistView({ id, name, libraryId, onAlbum, onArtist }: Nav & { id: string; name: string; libraryId: string | null }) {
  const { data, error, loading } = useLoad(() => api.artistOverview(id, libraryId), [id, libraryId]);
  const [busy, setBusy] = useState(false);
  const everything = async (append: boolean) => {
    setBusy(true);
    await run(
      () => api.artistTracks(id, libraryId),
      (list) => (append ? app.player.append(list) : app.player.play(list)),
    );
    setBusy(false);
  };
  if (!data) return <Loading error={error} loading={loading} />;
  const top = libraryId ? data.topTracks.filter((x) => x.libraryIds?.includes(libraryId) ?? true) : data.topTracks;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-4">
        {data.artworkId ? (
          <Artwork id={data.artworkId} size={128} className="rounded-full shadow-lg" />
        ) : (
          <span className="grid size-32 place-items-center rounded-full bg-muted text-muted-foreground">
            <User className="size-12" />
          </span>
        )}
        <div className="grid min-w-0 flex-1 gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("library.artist")}</span>
          <h3 className="text-xl leading-tight font-semibold">{data.artist.name || name}</h3>
          {data.playCount > 0 && <p className="text-sm text-muted-foreground">{t("library.plays", { count: data.playCount })}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => everything(false)}>
              <Play /> {t("library.playArtist")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => everything(true)}>
              <ListPlus /> {t("common.add")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => playMix(data.mix)}>
              <Disc3 /> {t("menu.artistMix")}
            </Button>
          </div>
        </div>
      </div>
      {top.length > 0 && (
        <section className="grid gap-2">
          <Heading>{t("library.popular")}</Heading>
          <TrackList tracks={top} />
        </section>
      )}
      {data.albums.length > 0 && (
        <section className="grid gap-2">
          <Heading>{t("library.albums")}</Heading>
          <AlbumGrid albums={data.albums} onAlbum={onAlbum} />
        </section>
      )}
      {data.appearsOn.length > 0 && (
        <section className="grid gap-2">
          <Heading>{t("library.appearsOn")}</Heading>
          <AlbumGrid albums={data.appearsOn} onAlbum={onAlbum} />
        </section>
      )}
      {data.relatedArtists.length > 0 && (
        <section className="grid gap-2">
          <Heading>{t("library.related")}</Heading>
          <div className="flex flex-wrap gap-2">
            {data.relatedArtists.map((a) => (
              <Button key={a.id} size="sm" variant="outline" onClick={() => onArtist(a)} onContextMenu={(e) => openMenu(e, artistMenu(a, () => onArtist(a)))}>
                {a.name}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
