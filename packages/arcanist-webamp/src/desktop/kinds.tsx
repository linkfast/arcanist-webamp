import type { ReactNode } from "react";
import { CircleUser, Disc3, FileText, Gift, History, Library, ListMusic, Paintbrush, Palette, Puzzle, Save, Star, Upload, Zap } from "lucide-react";
import { t } from "../i18n";
import type { WindowKind } from "./windows";

// How Arcanist's windows (and Webamp) look on the desktop, the taskbar and the start menu.

export interface Kind {
  label: () => string;
  glyph: (className?: string) => ReactNode;
  /** The desktop icon's tile. */
  tile: string;
}

export const WEBAMP_KIND: Kind = {
  label: () => t("icon.webamp"),
  glyph: (c) => <Zap className={c ? `${c} fill-amber-300 text-amber-500` : "fill-amber-300 text-amber-500"} />,
  tile: "bg-slate-800",
};

export const KINDS: Record<WindowKind, Kind> = {
  library: { label: () => t("icon.library"), glyph: (c) => <Library className={c} />, tile: "bg-sky-700" },
  playlists: { label: () => t("icon.playlists"), glyph: (c) => <ListMusic className={c} />, tile: "bg-emerald-700" },
  savePlaylist: { label: () => t("playlists.saveTitle"), glyph: (c) => <Save className={c} />, tile: "bg-emerald-700" },
  starTracks: {
    label: () => t("icon.starTracks"),
    glyph: (c) => <Star className={`${c ?? ""} fill-amber-300 text-amber-300`} />,
    tile: "bg-violet-700",
  },
  mixes: { label: () => t("icon.mixes"), glyph: (c) => <Disc3 className={c} />, tile: "bg-rose-700" },
  lyrics: { label: () => t("icon.lyrics"), glyph: (c) => <FileText className={c} />, tile: "bg-teal-700" },
  upload: { label: () => t("icon.upload"), glyph: (c) => <Upload className={c} />, tile: "bg-orange-700" },
  uploads: { label: () => t("icon.uploads"), glyph: (c) => <History className={c} />, tile: "bg-amber-700" },
  account: { label: () => t("icon.account"), glyph: (c) => <CircleUser className={c} />, tile: "bg-zinc-700" },
  personalize: { label: () => t("icon.personalize"), glyph: (c) => <Paintbrush className={c} />, tile: "bg-indigo-700" },
  skins: { label: () => t("icon.skins"), glyph: (c) => <Palette className={c} />, tile: "bg-fuchsia-800" },
  wishes: { label: () => t("icon.wishes"), glyph: (c) => <Gift className={c} />, tile: "bg-pink-700" },
  extensionApp: { label: () => t("icon.extension"), glyph: (c) => <Puzzle className={c} />, tile: "bg-slate-700" },
};

/** An extension app's icon (its SVG), or the puzzle piece. */
export function AppGlyph({ iconUrl, className }: { iconUrl: string | null | undefined; className?: string }) {
  return iconUrl ? <img src={iconUrl} alt="" className={className ?? "size-4"} draggable={false} /> : <Puzzle className={className} />;
}
