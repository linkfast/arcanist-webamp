import { useState, type ReactNode } from "react";
import { Code } from "lucide-react";
import { app, useLibraries, useMyCloud } from "../app";
import { DragGhost } from "../dnd";
import { t } from "../i18n";
import { useSettings, type IconSize } from "../settings";
import { cn } from "../ui/ui";
import { AccountWindow, UploadWindow } from "../windows/AccountWindows";
import { LibraryWindow } from "../windows/LibraryWindow";
import { LyricsWindow, MixesWindow, StarTracksWindow } from "../windows/MusicWindows";
import { PersonalizeWindow } from "../windows/PersonalizeWindow";
import { PlaylistsWindow, SavePlaylistWindow } from "../windows/PlaylistWindows";
import { SkinsWindow } from "../windows/SkinsWindow";
import { UploadsWindow } from "../windows/UploadsWindow";
import { KINDS, WEBAMP_KIND } from "./kinds";
import { Taskbar } from "./Taskbar";
import { desktopWindows, useDesktopWindows, type DesktopWindow, type WindowKind } from "./windows";

export interface DesktopIcon {
  id: string;
  label: string;
  glyph: ReactNode;
  tile: string;
  open: () => void;
}

/** The desktop's icons; those the user hid are still here (Personalize lists them). */
export function useDesktopIcons(): DesktopIcon[] {
  const libraries = useLibraries();
  const canUpload = libraries?.some((l) => l.canUpload) ?? false;
  // Their history of uploads, when they can send something somewhere.
  useMyCloud();
  const hasUploads = app.hasUploadHistory && (canUpload || app.canUploadToCloud);
  const kind = (id: WindowKind): DesktopIcon => ({
    id,
    label: KINDS[id].label(),
    glyph: KINDS[id].glyph(),
    tile: KINDS[id].tile,
    open: () => desktopWindows.open(id),
  });
  return [
    { id: "webamp", label: WEBAMP_KIND.label(), glyph: WEBAMP_KIND.glyph(), tile: WEBAMP_KIND.tile, open: () => app.player.reopen() },
    kind("library"),
    kind("playlists"),
    kind("starTracks"),
    kind("mixes"),
    kind("lyrics"),
    ...(canUpload ? [kind("upload")] : []),
    ...(hasUploads ? [kind("uploads")] : []),
    kind("account"),
    kind("personalize"),
    kind("skins"),
    ...(app.server?.sourceUrl
      ? [
          {
            id: "source",
            label: t("icon.source"),
            glyph: <Code />,
            tile: "bg-neutral-700",
            open: () => globalThis.open(app.server!.sourceUrl!, "_blank", "noopener"),
          },
        ]
      : []),
  ];
}

const SIZES: Record<IconSize, { button: string; tile: string }> = {
  small: { button: "w-[72px]", tile: "size-9 rounded-lg [&_svg]:size-5" },
  normal: { button: "w-[84px]", tile: "size-12 rounded-xl [&_svg]:size-7" },
  large: { button: "w-[104px]", tile: "size-16 rounded-2xl [&_svg]:size-9" },
};

/** Webamp's desktop: icons that open Arcanist's windows (double-click, or Enter), like webamp.org's, and a taskbar. */
export function Desktop() {
  const [selected, setSelected] = useState<string | null>(null);
  const open = useDesktopWindows();
  const s = useSettings();
  const icons = useDesktopIcons().filter((icon) => !s.hiddenIcons.includes(icon.id));
  const size = SIZES[s.iconSize];

  return (
    <>
      <div className="absolute inset-0" onPointerDown={() => setSelected(null)} />
      <ul
        className="ui absolute top-3 left-3 flex flex-col flex-wrap content-start gap-1"
        style={{ maxHeight: "calc(100vh - var(--taskbar-height) - 1.5rem)" }}
      >
        {icons.map((icon) => (
          <li key={icon.id}>
            <button
              className={cn(
                "grid justify-items-center gap-1.5 rounded-md p-1.5 text-center outline-none focus-visible:bg-white/10",
                size.button,
                selected === icon.id && "bg-white/15",
              )}
              title={s.iconLabels ? undefined : icon.label}
              aria-label={icon.label}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelected(icon.id);
              }}
              onDoubleClick={icon.open}
              onKeyDown={(e) => e.key === "Enter" && icon.open()}
            >
              <span className={cn("grid place-items-center text-white shadow-md ring-1 ring-white/10", size.tile, icon.tile)}>{icon.glyph}</span>
              {s.iconLabels && (
                <span
                  className={cn(
                    "line-clamp-2 rounded-sm px-1 text-xs leading-tight",
                    selected === icon.id ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--desktop-label)]",
                  )}
                  style={selected === icon.id ? undefined : { textShadow: "var(--desktop-label-shadow)" }}
                >
                  {icon.label}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {open.map((win) => (
        <WindowContent key={win.id} window={win} />
      ))}
      <Taskbar />
      <DragGhost />
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
    case "uploads":
      return <UploadsWindow window={win} />;
    case "account":
      return <AccountWindow window={win} />;
    case "personalize":
      return <PersonalizeWindow window={win} />;
    case "skins":
      return <SkinsWindow window={win} />;
  }
}
