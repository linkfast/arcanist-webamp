import { useCallback, useEffect, useState } from "react";
import { ListPlus, Music, Play, Star } from "lucide-react";
import type { Track } from "../api/arcanist";
import { artworkUrl } from "../api/client";
import { app } from "../app";
import { errorText, t } from "../i18n";
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

/** Songs: double-click plays from there; each row can be added alone. */
export function TrackList({ tracks, numbered = false }: { tracks: Track[]; numbered?: boolean }) {
  if (tracks.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</p>;
  return (
    <ul className="grid gap-0.5">
      {tracks.map((track, i) => (
        <li
          key={`${track.id}-${i}`}
          className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50"
          onDoubleClick={() => app.player.play(tracks.slice(i))}
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
          <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" aria-label={t("common.play")} onClick={() => app.player.play([track])}>
              <Play />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.add")} onClick={() => app.player.append([track])}>
              <ListPlus />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
