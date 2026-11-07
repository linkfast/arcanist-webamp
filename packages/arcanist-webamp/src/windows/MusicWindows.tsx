import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Disc3, FileText, Languages, Star } from "lucide-react";
import * as api from "../api/arcanist";
import { app, openPanel } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { useTrackDrop } from "../dnd";
import { language as uiLanguage, t } from "../i18n";
import { run } from "../menus";
import { Button, Select, cn } from "../ui/ui";
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

const LYRICS_KEY = "arcanist-webamp.lyrics";

/** What the user chose in the lyrics window, kept in the browser: pronunciation shown, and the language to translate into. */
function lyricsChoices(): { readings: boolean; translate: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(LYRICS_KEY) ?? "{}") as { readings?: boolean; translate?: string | null };
    return { readings: saved.readings ?? true, translate: saved.translate ?? null };
  } catch {
    return { readings: true, translate: null };
  }
}

function saveLyricsChoices(choices: { readings: boolean; translate: string | null }): void {
  try {
    localStorage.setItem(LYRICS_KEY, JSON.stringify(choices));
  } catch {
    // Not remembered: no storage.
  }
}

/** A language's name in the player's language ("japonés"), or its code. */
function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/**
 * The lyrics in another language (servers with LYRICS_TRANSLATION): asked for once, followed every 3 s while the server
 * makes it; its lines go with those of the lyrics.
 */
function useTranslation(trackId: string | null, language: string | null) {
  const [result, setResult] = useState<api.LyricsTranslation | null>(null);
  useEffect(() => {
    setResult(null);
    if (!trackId || !language) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (ask: boolean) => {
      try {
        const current = ask ? await api.requestLyricsTranslation(trackId, language) : await api.lyricsTranslation(trackId, language);
        if (stopped) return;
        if (current.status === "NOT_REQUESTED") return void load(true);
        setResult(current);
        if (current.status === "QUEUED" || current.status === "WORKING") timer = setTimeout(() => void load(false), 3000);
      } catch {
        if (!stopped) setResult({ status: "FAILED", lines: null, engine: null, position: null });
      }
    };
    void load(false);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [trackId, language]);
  return result;
}

/** A line with furigana above its kanji, when it has them. */
function LineText({ text, reading, showRuby }: { text: string; reading: api.LyricsLineReading | null | undefined; showRuby: boolean }) {
  if (!showRuby || !reading?.ruby) return <>{text}</>;
  return (
    <>
      {reading.ruby.map((segment, i) =>
        segment.reading ? (
          <ruby key={i}>
            {segment.text}
            <rt className="text-[0.6em] font-normal text-muted-foreground">{segment.reading}</rt>
          </ruby>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function LyricsWindow({ window: win }: { window: DesktopWindow }) {
  const player = app.player;
  const current = useSyncExternalStore(
    (listener) => player.subscribe(listener),
    () => player.current(),
  );
  const trackId = (win.props.trackId as string | undefined) ?? current?.id ?? null;
  const shown = current?.id === trackId ? current : null;
  const features = app.server?.features ?? [];
  const canRead = features.includes("LYRICS_READINGS");
  const canTranslate = features.includes("LYRICS_TRANSLATION");
  const { data, error, loading } = useLoad(async () => (trackId ? api.lyrics(trackId, canRead) : null), [trackId, canRead]);
  const languages = useLoad(async () => (canTranslate ? api.lyricsTranslationLanguages() : []), [canTranslate]).data ?? [];
  const [choices, setChoices] = useState(lyricsChoices);
  const [elapsed, setElapsed] = useState(0);
  const activeRef = useRef<HTMLLIElement>(null);

  const choose = (change: Partial<typeof choices>) =>
    setChoices((old) => {
      const next = { ...old, ...change };
      saveLyricsChoices(next);
      return next;
    });

  useEffect(() => {
    const timer = setInterval(() => setElapsed(player.elapsed()), 250);
    return () => clearInterval(timer);
  }, [player]);

  const synced = data?.synced ?? null;
  // The lines as the server counts them: the synchronized ones, else the plain lyrics by line.
  const lines = synced ? synced.map((l) => l.text) : (data?.plain?.split("\n") ?? []);
  const readings = choices.readings ? (data?.readings ?? null) : null;
  // Not into the language the lyrics are already in.
  const target = choices.translate && languages.includes(choices.translate) && choices.translate !== data?.language ? choices.translate : null;
  const translation = useTranslation(data && !data.instrumental ? trackId : null, target);
  const translated = translation?.status === "READY" ? translation.lines : null;

  const active = synced && shown ? synced.findLastIndex((line) => line.timeMs <= elapsed * 1000) : -1;
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  const translationNote =
    !target || !translation
      ? null
      : translation.status === "QUEUED" || translation.status === "WORKING"
        ? t("lyrics.translating", { language: languageName(target) })
        : translation.status === "FAILED"
          ? t("lyrics.translationFailed")
          : translation.status === "READY" && translation.engine
            ? t("lyrics.translatedBy", { engine: translation.engine })
            : null;

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
          {data && !data.instrumental && (data.readings || languages.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {data.readings && (
                <Button size="sm" variant={choices.readings ? "secondary" : "ghost"} aria-pressed={choices.readings}
                  title={t("lyrics.readingsHelp")} onClick={() => choose({ readings: !choices.readings })}>
                  {t("lyrics.readings")}
                </Button>
              )}
              {languages.length > 0 && (
                <label className="flex items-center gap-1.5">
                  <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">{t("lyrics.translate")}</span>
                  <Select className="h-8 w-auto" value={choices.translate ?? ""} onChange={(e) => choose({ translate: e.target.value || null })} aria-label={t("lyrics.translate")}>
                    <option value="">{t("lyrics.noTranslation")}</option>
                    {languages.filter((l) => l !== data.language).map((l) => (
                      <option key={l} value={l}>
                        {languageName(l)}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              {translationNote && <span className="text-muted-foreground">{translationNote}</span>}
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
          ) : synced || readings || translated ? (
            <ul className={cn("grid gap-1.5", synced ? "text-center text-base" : "text-sm")}>
              {lines.map((text, i) => (
                <li
                  key={i}
                  ref={i === active ? activeRef : undefined}
                  className={cn("transition-colors", synced && (i === active ? "font-semibold text-[var(--foreground)]" : "text-muted-foreground"))}
                >
                  <span className="block leading-relaxed">
                    <LineText text={text || (synced ? "♪" : "")} reading={readings?.[i]} showRuby={!!readings} />
                  </span>
                  {readings?.[i]?.romanized && <span className="block text-xs font-normal opacity-80">{readings[i]!.romanized}</span>}
                  {translated?.[i] && <span className="block text-xs font-normal italic opacity-80">{translated[i]}</span>}
                  {!synced && !text && <span className="block h-2" />}
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