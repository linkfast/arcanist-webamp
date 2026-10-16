import { useCallback, useEffect, useRef, useState } from "react";
import { ListPlus, Music, Play, Star, User } from "lucide-react";
import * as api from "../api/arcanist";
import type { Track } from "../api/arcanist";
import { artworkUrl } from "../api/client";
import { app } from "../app";
import { errorText, t } from "../i18n";
import { albumMenu, artistMenu, playMix, run, songMenu } from "../menus";
import { openMenu } from "../ui/menu";
import { Button, Spinner, cn } from "../ui/ui";

export function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function artistsOf(track: Track): string {
  return track.artists.map((a) => a.name).join(", ");
}

/** Loads something when its key changes; `reload` loads it again. */
export function useLoad<T>(load: () => Promise<T>, key: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    load()
      .then((result) => current && setData(result))
      .catch((e) => current && setError(errorText((e as { code?: string }).code ?? "unknown")))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...key, version]);
  return { data, error, loading, reload: useCallback(() => setVersion((v) => v + 1), []) };
}

/**
 * Pages of a list, by cursor: the first page when the key changes, the next one on `more()`. Pages that arrive
 * after the key changed are dropped.
 */
export function usePages<T>(
  load: (after: string | null) => Promise<api.Page<T>>,
  key: unknown[],
): { items: T[]; total: number | null; error: string | null; loading: boolean; more: (() => void) | null } {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const fetchPage = useCallback(
    (after: string | null) => {
      const mine = generation.current;
      setLoading(true);
      setError(null);
      load(after)
        .then((page) => {
          if (mine !== generation.current) return;
          setItems((list) => (after ? [...list, ...page.items] : page.items));
          setCursor(page.nextCursor);
          setTotal(page.totalCount);
        })
        .catch((e) => mine === generation.current && setError(errorText((e as { code?: string }).code ?? "unknown")))
        .finally(() => mine === generation.current && setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    key,
  );

  useEffect(() => {
    generation.current++;
    setItems([]);
    setCursor(null);
    setTotal(null);
    fetchPage(null);
  }, [fetchPage]);

  return { items, total, error, loading, more: cursor && !loading && !error ? () => fetchPage(cursor) : null };
}

export function Loading({ error, loading }: { error: string | null; loading: boolean }) {
  if (error) return <p className="py-6 text-center text-sm text-[var(--destructive)]">{error}</p>;
  if (loading)
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Spinner /> {t("common.loading")}
      </p>
    );
  return null;
}

export function Artwork({ id, size = 48, className }: { id: string | null | undefined; size?: number; className?: string }) {
  const url = artworkUrl(id, size > 64 ? 256 : 64);
  return url ? (
    <img src={url} alt="" loading="lazy" className={cn("shrink-0 rounded-md object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn("grid shrink-0 place-items-center rounded-md bg-muted text-muted-foreground", className)} style={{ width: size, height: size }}>
      <Music className="size-1/2" />
    </span>
  );
}

/** Buttons that play or add a whole list. */
export function ListActions({ tracks, playLabel = t("common.play") }: { tracks: Track[]; playLabel?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={tracks.length === 0} onClick={() => app.player.play(tracks)}>
        <Play /> {playLabel}
      </Button>
      <Button size="sm" variant="outline" disabled={tracks.length === 0} onClick={() => app.player.append(tracks)}>
        <ListPlus /> {t("common.add")}
      </Button>
    </div>
  );
}

/** Songs: double-click plays from there; each row can be played or added alone, and has the menu of songs. */
export function TrackList({ tracks, numbered = false, empty }: { tracks: Track[]; numbered?: boolean; empty?: string }) {
  // StarTracks changed from the menu, until the list is loaded again.
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setChanged({}), [tracks]);
  if (tracks.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty ?? t("common.empty")}</p>;
  const onChange = (track: Track) => setChanged((c) => ({ ...c, [track.id]: track.starred }));
  return (
    <ul className="grid gap-0.5">
      {tracks.map((original, i) => {
        const track = original.id in changed ? { ...original, starred: changed[original.id] } : original;
        const key = `${track.id}-${i}`;
        return (
          <li
            key={key}
            className={cn("group flex items-center gap-3 rounded-md px-2 py-1.5 select-none hover:bg-accent/50", selected === key && "bg-accent")}
            onClick={() => setSelected(key)}
            onDoubleClick={() => app.player.play(tracks.slice(i))}
            onContextMenu={(e) => {
              setSelected(key);
              openMenu(e, songMenu([track], { onChange }));
            }}
          >
            {numbered ? (
              <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{track.trackNumber ?? ""}</span>
            ) : (
              <Artwork id={track.artworkId} size={36} />
            )}
            <span className="grid min-w-0 flex-1">
              <span className="flex items-center gap-1 truncate text-sm">
                {track.title}
                {track.starred && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {artistsOf(track)} · {track.album.title}
              </span>
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">{duration(track.durationMs)}</span>
            <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <Button variant="ghost" size="icon-sm" aria-label={t("common.play")} title={t("common.play")} onClick={() => app.player.play([track])}>
                <Play />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={t("common.add")} title={t("common.add")} onClick={() => app.player.append([track])}>
                <ListPlus />
              </Button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Loads the next page when it scrolls into view (and has a button, for keyboards and slow scrolls). */
export function LoadMore({ onMore, loading }: { onMore: (() => void) | null; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const more = useRef(onMore);
  more.current = onMore;
  const visible = onMore != null && !loading;
  useEffect(() => {
    const el = ref.current;
    if (!el || !visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) more.current?.();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);
  if (!visible) return null;
  return (
    <div ref={ref} className="grid justify-items-center py-2">
      <Button variant="outline" size="sm" onClick={() => more.current?.()}>
        {t("common.more")}
      </Button>
    </div>
  );
}

/** Albums as cards: click opens one; the cover's button plays it; right-click has the album's menu. */
export function AlbumGrid({ albums, onAlbum, row = false }: { albums: api.Album[]; onAlbum: (album: api.Album) => void; row?: boolean }) {
  if (albums.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</p>;
  return (
    <ul className={cn(row ? "flex gap-2 overflow-x-auto pb-2" : "grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2")}>
      {albums.map((album) => (
        <li key={album.id} className={cn(row && "w-36 shrink-0")}>
          <div className="group relative grid rounded-lg p-1.5 hover:bg-accent/50" onContextMenu={(e) => openMenu(e, albumMenu(album, () => onAlbum(album)))}>
            <button
              className="grid gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              onClick={() => onAlbum(album)}
              title={album.title}
            >
              <span className="block aspect-square w-full overflow-hidden rounded-md bg-muted shadow-sm">
                <Artwork id={album.artworkId} size={256} className="size-full! rounded-md" />
              </span>
              <span className="truncate text-sm font-medium">{album.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {album.artist.name}
                {album.year ? ` · ${album.year}` : ""}
              </span>
            </button>
            <span className="absolute inset-x-1.5 top-1.5 flex aspect-square items-end justify-end p-1.5 pointer-events-none">
              <Button
                size="icon"
                className="pointer-events-auto rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={t("library.playAlbum")}
                title={t("library.playAlbum")}
                onClick={() => run(() => api.albumTracks(album.id), (list) => app.player.play(list))}
              >
                <Play className="fill-current" />
              </Button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Artists as rows: click opens the artist; right-click has the artist's menu. */
export function ArtistRows({ artists, onArtist }: { artists: api.Artist[]; onArtist: (artist: api.Artist) => void }) {
  if (artists.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</p>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-0.5">
      {artists.map((artist) => (
        <li key={artist.id}>
          <button
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50"
            onClick={() => onArtist(artist)}
            onContextMenu={(e) => openMenu(e, artistMenu(artist, () => onArtist(artist)))}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <User className="size-4" />
            </span>
            <span className="truncate">{artist.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function mixTitle(mix: api.Mix): string {
  return t(`mixes.kind.${mix.kind}` as "mixes.kind.ARTIST", { subject: mix.subject ?? "" });
}

/** A mix: its covers; click plays it, the button adds it; right-click has both. */
export function MixCard({ mix, className }: { mix: api.Mix; className?: string }) {
  const [busy, setBusy] = useState(false);
  const play = async (append: boolean) => {
    setBusy(true);
    try {
      await playMix(mix, append);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className={cn("grid content-start gap-2 rounded-lg border p-2", busy && "opacity-60", className)}
      onContextMenu={(e) =>
        openMenu(e, [
          { label: t("common.play"), onClick: () => void play(false) },
          { label: t("common.add"), onClick: () => void play(true) },
        ])
      }
    >
      <button className="grid gap-2 text-left" onClick={() => play(false)} title={mixTitle(mix)}>
        <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-md">
          {[0, 1, 2, 3].map((i) => (
            <Artwork key={i} id={mix.artworkIds[i] ?? mix.artworkIds[0]} size={68} className="aspect-square h-auto! w-full! rounded-none" />
          ))}
        </div>
        <span className="flex items-center gap-1.5 truncate text-sm font-medium">
          {busy && <Spinner className="size-3" />}
          <span className="truncate">{mixTitle(mix)}</span>
        </span>
      </button>
      <Button size="sm" variant="outline" onClick={() => play(true)}>
        {t("common.add")}
      </Button>
    </div>
  );
}
