import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Disc3, FileText, Star } from "lucide-react";
import * as api from "../api/arcanist";
import { app } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { t } from "../i18n";
import { Button, cn } from "../ui/ui";
import { Artwork, ListActions, Loading, MixCard, TrackList, artistsOf, useLoad } from "./common";

/** The user's StarTracks, newest first. */
export function StarTracksWindow({ window: win }: { window: DesktopWindow }) {
  const { data, error, loading, reload } = useLoad(() => api.starTracks(), []);
  return (
    <Window window={win} title={t("starTracks.title")} icon={<Star className="size-4 fill-amber-400 text-amber-400" />} width={560} height={520}>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          {data && <ListActions tracks={data} playLabel={t("starTracks.playAll")} />}
          <Button variant="ghost" size="sm" onClick={reload}>
            ↻
          </Button>
        </div>
        {data ? (
          data.length ? <TrackList tracks={data} /> : <p className="py-6 text-center text-sm text-muted-foreground">{t("starTracks.none")}</p>
        ) : (
          <Loading error={error} loading={loading} />
        )}
      </div>
    </Window>
  );
}

/** The mixes Arcanist made for the user today. */
export function MixesWindow({ window: win }: { window: DesktopWindow }) {
  const { data, error, loading } = useLoad(() => api.mixes(), []);
  return (
    <Window window={win} title={t("mixes.title")} icon={<Disc3 className="size-4" />} width={560} height={480}>
      <Loading error={error} loading={loading && !data} />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {(data ?? []).map((mix) => (
          <li key={mix.id}>
            <MixCard mix={mix} />
          </li>
        ))}
      </ul>
    </Window>
  );
}

/** The lyrics of what is playing (or of the song given), following the music when they are synced. */
export function LyricsWindow({ window: win }: { window: DesktopWindow }) {
  const player = app.player;
  const current = useSyncExternalStore(
    (listener) => player.subscribe(listener),
    () => player.current(),
  );
  const trackId = (win.props.trackId as string | undefined) ?? current?.id ?? null;
  const shown = current?.id === trackId ? current : null;
  const { data, error, loading } = useLoad(async () => (trackId ? api.lyrics(trackId) : null), [trackId]);
  const [elapsed, setElapsed] = useState(0);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(player.elapsed()), 250);
    return () => clearInterval(timer);
  }, [player]);

  const synced = data?.synced ?? null;
  const active = synced && shown ? synced.findLastIndex((line) => line.timeMs <= elapsed * 1000) : -1;
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <Window window={win} title={t("lyrics.title")} icon={<FileText className="size-4" />} width={420} height={520}>
      {!trackId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("lyrics.nothing")}</p>
      ) : (
        <div className="grid gap-4">
          {shown && (
            <div className="flex items-center gap-3">
              <Artwork id={shown.artworkId} size={48} />
              <span className="grid min-w-0">
                <span className="truncate text-sm font-medium">{shown.title}</span>
                <span className="truncate text-xs text-muted-foreground">{artistsOf(shown)}</span>
              </span>
            </div>
          )}
          {error ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("lyrics.none")}</p>
          ) : !data ? (
            <Loading error={null} loading={loading} />
          ) : data.instrumental ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("lyrics.instrumental")}</p>
          ) : synced ? (
            <ul className="grid gap-1.5 text-center text-base">
              {synced.map((line, i) => (
                <li
                  key={i}
                  ref={i === active ? activeRef : undefined}
                  className={cn("transition-colors", i === active ? "font-semibold text-[var(--foreground)]" : "text-muted-foreground")}
                >
                  {line.text || "♪"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{data.plain}</p>
          )}
        </div>
      )}
    </Window>
  );
}
