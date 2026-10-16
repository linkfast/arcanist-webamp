import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Disc3, FileText, Star } from "lucide-react";
import * as api from "../api/arcanist";
import { app } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { t } from "../i18n";
import { Button, cn } from "../ui/ui";
import { Artwork, ListActions, Loading, TrackList, artistsOf, useLoad } from "./common";

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

function mixTitle(mix: api.Mix): string {
  return t(`mixes.kind.${mix.kind}` as "mixes.kind.ARTIST", { subject: mix.subject ?? "" });
}

/** The mixes Arcanist made for the user today. */
export function MixesWindow({ window: win }: { window: DesktopWindow }) {
  const { data, error, loading } = useLoad(() => api.mixes(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const play = async (mix: api.Mix, append: boolean) => {
    setBusy(mix.id);
    try {
      const tracks = await api.mixTracks(mix.id);
      if (append) app.player.append(tracks);
      else app.player.play(tracks);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Window window={win} title={t("mixes.title")} icon={<Disc3 className="size-4" />} width={560} height={480}>
      <Loading error={error} loading={loading && !data} />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {(data ?? []).map((mix) => (
          <li key={mix.id} className={cn("grid gap-2 rounded-lg border p-2", busy === mix.id && "opacity-60")}>
            <button className="grid gap-2 text-left" onClick={() => play(mix, false)}>
              <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-md">
                {[0, 1, 2, 3].map((i) => (
                  <Artwork key={i} id={mix.artworkIds[i] ?? mix.artworkIds[0]} size={68} className="w-full rounded-none" />
                ))}
              </div>
              <span className="truncate text-sm font-medium">{mixTitle(mix)}</span>
            </button>
            <Button size="sm" variant="outline" onClick={() => play(mix, true)}>
              {t("common.add")}
            </Button>
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
