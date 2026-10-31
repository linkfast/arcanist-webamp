import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Disc3, FileText, Star } from "lucide-react";
import * as api from "../api/arcanist";
import { app, openPanel } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { useTrackDrop } from "../dnd";
import { t } from "../i18n";
import { run } from "../menus";
import { Button, cn } from "../ui/ui";
import { Artwork, ListActions, Loading, MixCard, TrackList, artistsOf, useLoad } from "./common";

/** The user's StarTracks, newest first. */
export function StarTracksWindow({ window: win }: { window: DesktopWindow }) {
  const { data, error, loading, reload } = useLoad(() => api.starTracks(), []);
  // Songs dropped here become StarTracks.
  const drop = useTrackDrop({
    onDrop: (d) =>
      run(
        async () => {
          const marked = [];
          for (const track of d.tracks.filter((x) => !x.starred)) marked.push(await api.starTrack(track.id, true));
          return marked;
        },
        (marked) => {
          for (const track of marked) app.player.update(track);
          reload();
          return marked.length ? t("starTracks.added", { count: marked.length }) : undefined;
        },
      ),
  });
  return (
    <Window window={win} title={t("starTracks.title")} icon={<Star className="size-4 fill-amber-400 text-amber-400" />} width={560} height={520}>
      <div {...drop.props} className={cn("grid min-h-full content-start gap-3 rounded-lg", drop.over && "ring-2 ring-[var(--ring)]")}>
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
/**
 * For a song without lyrics (servers with LYRICS_TRANSCRIPTION): asks for a model (Lyrics Sync) to recognize them,
 * and follows it every 10 s while it works. What it writes waits for someone to review it; those who may (with
 * EDIT_METADATA) open it in the panel's editor.
 */
function Recognize({ trackId }: { trackId: string }) {
  const [status, setStatus] = useState<api.LyricsTranscription | null>(null);
  const [busy, setBusy] = useState(false);
  const available = app.server?.features.includes("LYRICS_TRANSCRIPTION") ?? false;

  useEffect(() => {
    if (!available) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api
        .lyricsTranscription(trackId)
        .then((result) => {
          if (stopped) return;
          setStatus(result);
          if (result.state === "QUEUED" || result.state === "WORKING") timer = setTimeout(load, 10_000);
        })
        .catch(() => setStatus(null));
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [trackId, available, busy]);

  if (!status) return null;
  const ask = async () => {
    setBusy(true);
    try {
      setStatus(await api.requestLyricsTranscription(trackId));
    } catch {
      // The status says why on the next read.
    } finally {
      setBusy(false);
    }
  };

  switch (status.state) {
    case "QUEUED":
    case "WORKING":
      return <p>{t(status.state === "QUEUED" ? "lyrics.queued" : "lyrics.recognizing")}</p>;
    case "NEEDS_REVIEW":
      return (
        <div className="grid justify-items-center gap-2">
          <p>{t("lyrics.toReview")}</p>
          {status.canReview && (
            <Button size="sm" variant="outline" onClick={() => openPanel(`lyrics/review/${trackId}`)}>
              {t("lyrics.review")}
            </Button>
          )}
        </div>
      );
    default:
      if (!status.canRequest) return null;
      return (
        <div className="grid max-w-xs justify-items-center gap-2">
          {status.state === "NO_VOICE" && <p>{t("lyrics.noVoice")}</p>}
          {status.state === "FAILED" && <p>{t("lyrics.failed")}</p>}
          <Button size="sm" disabled={busy} onClick={() => void ask()}>
            {t(status.state === "NOT_REQUESTED" ? "lyrics.recognize" : "lyrics.again")}
          </Button>
          <p className="text-xs">{t("lyrics.recognizeHelp")}</p>
        </div>
      );
  }
}

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
            <div className="grid justify-items-center gap-3 py-6 text-center text-sm text-muted-foreground">
              <p>{t("lyrics.none")}</p>
              <Recognize trackId={trackId} />
            </div>
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
