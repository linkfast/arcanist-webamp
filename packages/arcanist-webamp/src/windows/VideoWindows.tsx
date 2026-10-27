import { useEffect, useRef, useState } from "react";
import { Clapperboard, ListMusic, Search } from "lucide-react";
import type Hls from "hls.js";
import * as api from "../api/arcanist";
import { absolute, artworkUrl } from "../api/client";
import { app } from "../app";
import { desktopWindows, Window, type DesktopWindow } from "../desktop/windows";
import { t } from "../i18n";
import { Badge, Button, cn, Input } from "../ui/ui";
import { Loading, useLoad } from "./common";

/** Opens a music video in its window (one per video), pausing Webamp. */
export function openVideo(clip: api.VideoClip): void {
  desktopWindows.open("video", { key: clip.id, clip });
}

/**
 * A music video. With HLS (prepared versions) the two audios are renditions hls.js switches between without touching
 * the picture; otherwise MP4, where switching loads the other stream at the same position (both share the timeline).
 * Webamp pauses while it plays; the song's play is reported when the window closes, and at the end Webamp can go on.
 */
export function VideoWindow({ window: win }: { window: DesktopWindow }) {
  const clip = win.props.clip as api.VideoClip;
  const video = useRef<HTMLVideoElement | null>(null);
  const hls = useRef<Hls | null>(null);
  const [audio, setAudio] = useState<api.VideoAudioMode>(clip.sync === "READY" ? clip.audioMode : "VIDEO");
  const [ended, setEnded] = useState(false);
  const watched = useRef({ ms: 0, since: 0, startedAt: null as Date | null });
  const resumeAt = useRef<{ time: number; playing: boolean } | null>(null);
  const canSwitch = clip.sync === "READY";

  // Webamp is quiet while the video plays.
  useEffect(() => {
    app.player.webamp.pause();
  }, []);

  // HLS when the server prepared it and the browser can play it (hls.js, or natively in Safari).
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let disposed = false;
    if (clip.hlsUrl) {
      void import("hls.js").then(({ default: HlsClass }) => {
        if (disposed) return;
        if (HlsClass.isSupported()) {
          const player = new HlsClass();
          hls.current = player;
          player.on(HlsClass.Events.AUDIO_TRACKS_UPDATED, () => pickAudio(player, audio));
          player.loadSource(absolute(clip.hlsUrl!));
          player.attachMedia(element);
        } else if (element.canPlayType("application/vnd.apple.mpegurl")) {
          element.src = absolute(clip.hlsUrl!);
        } else {
          element.src = absolute(audio === "TRACK" ? clip.trackAudioUrl : clip.videoAudioUrl);
        }
      });
    } else {
      element.src = absolute(audio === "TRACK" ? clip.trackAudioUrl : clip.videoAudioUrl);
    }
    return () => {
      disposed = true;
      hls.current?.destroy();
      hls.current = null;
    };
    // The source is set once; switching audio is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id]);

  // Reports the song as played (the time watched) when the window goes.
  useEffect(
    () => () => {
      const element = video.current;
      if (element && !element.paused) watched.current.ms += performance.now() - watched.current.since;
      if (clip.trackId && watched.current.startedAt && watched.current.ms >= 1000)
        api.recordPlay(clip.trackId, watched.current.ms, watched.current.startedAt).catch(() => {});
    },
    [clip.trackId],
  );

  const switchAudio = (mode: api.VideoAudioMode) => {
    setAudio(mode);
    const element = video.current;
    if (!element) return;
    if (hls.current) {
      pickAudio(hls.current, mode);
      return;
    }
    resumeAt.current = { time: element.currentTime, playing: !element.paused };
    element.src = absolute(mode === "TRACK" ? clip.trackAudioUrl : clip.videoAudioUrl);
  };

  const onLoaded = () => {
    const element = video.current;
    const resume = resumeAt.current;
    if (!element || !resume) return;
    resumeAt.current = null;
    // A version made while it streams cannot seek yet: it starts again there with `t`.
    const seekable = element.seekable.length > 0 && element.seekable.end(element.seekable.length - 1) >= resume.time;
    if (seekable) element.currentTime = resume.time;
    else if (resume.time > 1) {
      const url = new URL(element.src);
      url.searchParams.set("t", resume.time.toFixed(1));
      element.src = url.href;
    }
    if (resume.playing) void element.play();
  };

  return (
    <Window
      window={win}
      title={clip.artist ? `${clip.artist} – ${clip.title}` : clip.title}
      icon={<Clapperboard className="size-4" />}
      width={720}
      height={520}
      bodyClassName="flex flex-col gap-2 p-2"
    >
      <video
        ref={video}
        className="min-h-0 w-full flex-1 rounded-md bg-black"
        controls
        autoPlay
        playsInline
        poster={artworkUrl(clip.artworkId, 1024)}
        onLoadedMetadata={onLoaded}
        onPlay={() => {
          setEnded(false);
          watched.current.startedAt ??= new Date();
          watched.current.since = performance.now();
        }}
        onPause={() => {
          watched.current.ms += performance.now() - watched.current.since;
        }}
        onEnded={() => setEnded(true)}
      />
      <div className="flex flex-wrap items-center gap-2 px-1 pb-1 text-sm">
        <span className="text-muted-foreground">{t("videos.audio")}</span>
        <Button size="sm" variant={audio === "TRACK" ? "default" : "outline"} disabled={!canSwitch} onClick={() => switchAudio("TRACK")}>
          {t("videos.trackAudio")}
        </Button>
        <Button size="sm" variant={audio === "VIDEO" ? "default" : "outline"} onClick={() => switchAudio("VIDEO")}>
          {t("videos.videoAudio")}
        </Button>
        {!canSwitch && <span className="text-xs text-muted-foreground">{t(`videos.sync.${clip.sync}`)}</span>}
        {ended && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => {
              desktopWindows.close(win.id);
              app.player.webamp.nextTrack();
              app.player.webamp.play();
            }}
          >
            <ListMusic /> {t("videos.continue")}
          </Button>
        )}
      </div>
    </Window>
  );
}

/** The HLS audio rendition of a mode: "Song" (the mix) or "Video". */
function pickAudio(player: Hls, mode: api.VideoAudioMode): void {
  const index = player.audioTracks.findIndex((track) => track.name === (mode === "TRACK" ? "Song" : "Video"));
  if (index >= 0 && player.audioTrack !== index) player.audioTrack = index;
}

/** The music videos of the libraries, by title, with a search. */
export function VideosWindow({ window: win }: { window: DesktopWindow }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<string | null>(null);
  const { data, error, loading } = useLoad(() => api.musicVideos(search, null), [search]);
  return (
    <Window window={win} title={t("videos.title")} icon={<Clapperboard className="size-4" />} width={720} height={540}>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim() || null);
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("videos.search")} />
        <Button type="submit" variant="outline" size="icon" aria-label={t("videos.search")}>
          <Search />
        </Button>
      </form>
      <Loading error={error} loading={loading && !data} />
      {data && !data.items.length && <p className="py-6 text-center text-sm text-muted-foreground">{t("videos.none")}</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {(data?.items ?? []).map((clip) => (
          <li key={clip.id}>
            <button className="grid w-full gap-1 text-left" onDoubleClick={() => openVideo(clip)} onClick={() => openVideo(clip)}>
              <span className="relative block aspect-video overflow-hidden rounded-md bg-black/40">
                {clip.artworkId && <img src={artworkUrl(clip.artworkId, 512)} alt="" className="size-full object-cover" loading="lazy" draggable={false} />}
                <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[11px] text-white">{duration(clip.durationMs)}</span>
              </span>
              <span className="truncate text-sm font-medium">{clip.title}</span>
              <span className={cn("flex items-center gap-1 truncate text-xs text-muted-foreground")}>
                {clip.artist ?? ""}
                {clip.isLive && <Badge>{t("videos.live")}</Badge>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Window>
  );
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
