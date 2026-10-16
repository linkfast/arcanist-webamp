import { useEffect, useState, type ReactNode } from "react";
import { CircleUser, Code, Disc3, FileText, Library, ListMusic, Palette, Star, Upload, Zap } from "lucide-react";
import { libraries } from "../api/arcanist";
import { app } from "../app";
import { t } from "../i18n";
import { cn } from "../ui/ui";
import { AccountWindow, UploadWindow } from "../windows/AccountWindows";
import { LibraryWindow } from "../windows/LibraryWindow";
import { LyricsWindow, MixesWindow, StarTracksWindow } from "../windows/MusicWindows";
import { PlaylistsWindow, SavePlaylistWindow } from "../windows/PlaylistWindows";
import { desktopWindows, useDesktopWindows, type DesktopWindow, type WindowKind } from "./windows";

interface Icon {
  id: string;
  label: string;
  glyph: ReactNode;
  tile: string;
  open: () => void;
}

/** Webamp's desktop: icons that open Arcanist's windows (double-click, or Enter), like webamp.org's. */
export function Desktop() {
  const [selected, setSelected] = useState<string | null>(null);
  const [canUpload, setCanUpload] = useState(false);
  const open = useDesktopWindows();

  useEffect(() => {
    libraries()
      .then((list) => setCanUpload(list.some((l) => l.canUpload)))
      .catch(() => setCanUpload(false));
  }, []);

  const window = (kind: WindowKind) => () => desktopWindows.open(kind);
  const icons: Icon[] = [
    { id: "webamp", label: t("icon.webamp"), glyph: <Zap className="fill-amber-300 text-amber-500" />, tile: "bg-slate-800", open: () => app.player.webamp.reopen() },
    { id: "library", label: t("icon.library"), glyph: <Library />, tile: "bg-sky-700", open: window("library") },
    { id: "playlists", label: t("icon.playlists"), glyph: <ListMusic />, tile: "bg-emerald-700", open: window("playlists") },
    { id: "starTracks", label: t("icon.starTracks"), glyph: <Star className="fill-amber-300 text-amber-300" />, tile: "bg-violet-700", open: window("starTracks") },
    { id: "mixes", label: t("icon.mixes"), glyph: <Disc3 />, tile: "bg-rose-700", open: window("mixes") },
    { id: "lyrics", label: t("icon.lyrics"), glyph: <FileText />, tile: "bg-teal-700", open: window("lyrics") },
    ...(canUpload ? [{ id: "upload", label: t("icon.upload"), glyph: <Upload />, tile: "bg-orange-700", open: window("upload") }] : []),
    { id: "account", label: t("icon.account"), glyph: <CircleUser />, tile: "bg-zinc-700", open: window("account") },
    { id: "skins", label: t("icon.skins"), glyph: <Palette />, tile: "bg-fuchsia-800", open: () => globalThis.open("https://skins.webamp.org/", "_blank", "noopener") },
    ...(app.server?.sourceUrl
      ? [{ id: "source", label: t("icon.source"), glyph: <Code />, tile: "bg-neutral-700", open: () => globalThis.open(app.server!.sourceUrl!, "_blank", "noopener") }]
      : []),
  ];

  return (
    <>
      <div className="absolute inset-0" onPointerDown={() => setSelected(null)} />
      <ul className="ui absolute top-3 left-3 flex max-h-[calc(100vh-1.5rem)] flex-col flex-wrap content-start gap-1">
        {icons.map((icon) => (
          <li key={icon.id}>
            <button
              className={cn(
                "grid w-[84px] justify-items-center gap-1.5 rounded-md p-1.5 text-center outline-none",
                selected === icon.id && "bg-white/15",
              )}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelected(icon.id);
              }}
              onDoubleClick={icon.open}
              onKeyDown={(e) => e.key === "Enter" && icon.open()}
            >
              <span className={cn("grid size-12 place-items-center rounded-xl text-white shadow-md [&_svg]:size-7", icon.tile)}>{icon.glyph}</span>
              <span
                className={cn("line-clamp-2 px-1 text-xs leading-tight text-white", selected === icon.id ? "bg-sky-700" : "")}
                style={{ textShadow: "0 1px 2px rgb(0 0 0 / 0.8)" }}
              >
                {icon.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open.map((win) => (
        <WindowContent key={win.id} window={win} />
      ))}
    </>
  );
}

function WindowContent({ window: win }: { window: DesktopWindow }) {
  switch (win.kind) {
    case "library":
      return <LibraryWindow window={win} />;
    case "playlists":
      return <PlaylistsWindow window={win} />;
    case "savePlaylist":
      return <SavePlaylistWindow window={win} />;
    case "starTracks":
      return <StarTracksWindow window={win} />;
    case "mixes":
      return <MixesWindow window={win} />;
    case "lyrics":
      return <LyricsWindow window={win} />;
    case "upload":
      return <UploadWindow window={win} />;
    case "account":
      return <AccountWindow window={win} />;
  }
}
