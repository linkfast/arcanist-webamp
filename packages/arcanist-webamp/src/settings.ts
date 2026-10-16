import { useSyncExternalStore } from "react";

// The player's personalization, per browser: theme, background, accent, desktop icons, Webamp at start, the chosen
// library. Storage can be unavailable (private mode, blocked site data): the settings then last for the session.

export type ThemePreference = "system" | "light" | "dark";
export type ArcaneBackground = "astrolabe" | "constellations" | "sigil" | "aurora";
export type Accent = "neutral" | "violet" | "indigo" | "teal" | "amber" | "rose";
export type IconSize = "small" | "normal" | "large";

export type SkinChoice =
  | { kind: "base" }
  /** effects: what the skin also changes around Webamp ("oled": a black desktop with glowing art, and an aura). */
  | { kind: "bundled"; file: string; name: string; effects?: string[] }
  | { kind: "saved"; id: string; name: string };

export type Background = { kind: "arcane"; id: ArcaneBackground } | { kind: "color"; color: string } | { kind: "image" };

export interface Settings {
  theme: ThemePreference;
  background: Background;
  /** The built-in backgrounds' slow movement (never with reduced motion). */
  animate: boolean;
  accent: Accent;
  iconSize: IconSize;
  iconLabels: boolean;
  hiddenIcons: string[];
  /** Milkdrop's window open when the player starts. */
  milkdrop: boolean;
  /** The skin Webamp starts with: its base skin, one that comes with the player or one saved in this browser. */
  skin: SkinChoice;
  /** The library the Library window shows; null is all of them. */
  libraryId: string | null;
}

export const ARCANE_BACKGROUNDS: ArcaneBackground[] = ["astrolabe", "constellations", "sigil", "aurora"];
export const ACCENTS: Accent[] = ["neutral", "violet", "indigo", "teal", "amber", "rose"];

export const DEFAULTS: Settings = {
  theme: "system",
  background: { kind: "arcane", id: "astrolabe" },
  animate: true,
  accent: "neutral",
  iconSize: "normal",
  iconLabels: true,
  hiddenIcons: [],
  milkdrop: true,
  skin: { kind: "base" },
  libraryId: null,
};

const KEY = "arcanist.webamp.settings";
const WALLPAPER_KEY = "arcanist.webamp.wallpaper";
/** The panel's theme (same origin): the player follows it until the user picks one here. */
const PANEL_THEME_KEY = "arcanist.theme";
/** A data URL bigger than this is not kept (localStorage holds about 5 MB per origin, shared with the panel). */
export const WALLPAPER_MAX_CHARS = 2_500_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): boolean {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function load(): Settings {
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(read(KEY) ?? "{}") ?? {};
  } catch {
    // Unreadable: the defaults.
  }
  const panelTheme = read(PANEL_THEME_KEY);
  const settings: Settings = {
    ...DEFAULTS,
    theme: panelTheme === "light" || panelTheme === "dark" ? panelTheme : DEFAULTS.theme,
    ...stored,
  };
  if (!["system", "light", "dark"].includes(settings.theme)) settings.theme = DEFAULTS.theme;
  if (!ACCENTS.includes(settings.accent)) settings.accent = DEFAULTS.accent;
  if (!["small", "normal", "large"].includes(settings.iconSize)) settings.iconSize = DEFAULTS.iconSize;
  if (!Array.isArray(settings.hiddenIcons)) settings.hiddenIcons = [];
  const bg = settings.background;
  if (
    !bg ||
    (bg.kind === "arcane" && !ARCANE_BACKGROUNDS.includes(bg.id)) ||
    (bg.kind === "color" && !/^#[0-9a-f]{6}$/i.test(bg.color)) ||
    !["arcane", "color", "image"].includes(bg.kind)
  )
    settings.background = DEFAULTS.background;
  // Before the skin library there was one loaded skin, kept as "current".
  const skin = settings.skin as SkinChoice | { kind: "custom"; name: string } | undefined;
  if (skin?.kind === "custom") settings.skin = { kind: "saved", id: "current", name: skin.name };
  else if (!skin || !["base", "bundled", "saved"].includes(skin.kind)) settings.skin = DEFAULTS.skin;
  return settings;
}

let current = load();
let wallpaper: string | null = read(WALLPAPER_KEY);
const listeners = new Set<() => void>();
const systemDark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

function emit(): void {
  apply();
  for (const listener of listeners) listener();
}

/** Whether the skin in use turns on OLED mode: pure black, glowing art and an aura around Webamp. */
export function isOled(settings = current): boolean {
  return settings.skin.kind === "bundled" && (settings.skin.effects?.includes("oled") ?? false);
}

/** Whether Arcanist's windows are dark now (always in OLED mode). */
export function isDark(settings = current): boolean {
  if (isOled(settings)) return true;
  return settings.theme === "system" ? (systemDark?.matches ?? true) : settings.theme === "dark";
}

/** Whether the desktop behind the icons is dark (their labels are then light). */
function darkDesktop(): boolean {
  const bg = current.background;
  if (bg.kind === "color") {
    const n = parseInt(bg.color.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
  }
  // Photos: light labels with a strong shadow read on almost anything. OLED mode is black.
  return bg.kind === "image" || isOled() ? true : isDark();
}

/** The theme on <html>: the `dark` class (as in Arcanist's panel), the accent and the desktop's lightness. */
function apply(): void {
  const root = document.documentElement;
  root.classList.toggle("dark", isDark());
  root.classList.toggle("oled", isOled());
  root.dataset.accent = current.accent;
  root.dataset.desktop = darkDesktop() ? "dark" : "light";
}

systemDark?.addEventListener("change", () => {
  if (current.theme === "system") emit();
});
apply();

export const settings = {
  get value(): Settings {
    return current;
  },
  /** Changes some settings and keeps them; false when they could not be stored (they last for the session). */
  set(change: Partial<Settings>): boolean {
    current = { ...current, ...change };
    const stored = write(KEY, JSON.stringify(current));
    emit();
    return stored;
  },
  reset(): void {
    current = { ...DEFAULTS, libraryId: current.libraryId };
    wallpaper = null;
    write(KEY, null);
    write(WALLPAPER_KEY, null);
    emit();
  },
  /** The user's own background: a data URL or a web address. */
  get wallpaper(): string | null {
    return wallpaper;
  },
  /** Sets the user's own background; false when it could not be stored (it lasts for the session). */
  setWallpaper(src: string): boolean {
    wallpaper = src;
    const stored = src.length <= WALLPAPER_MAX_CHARS && write(WALLPAPER_KEY, src);
    if (!stored) write(WALLPAPER_KEY, null);
    settings.set({ background: { kind: "image" } });
    return stored;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, () => current);
}

/** Whether the system asks for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A picture the user chose, made small enough to keep: at most 1920 px wide (or 1280 when that is still too big),
 * as JPEG.
 */
export async function downscaleImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const [max, quality] of [
      [1920, 0.85],
      [1600, 0.75],
      [1280, 0.7],
    ] as const) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= WALLPAPER_MAX_CHARS) return url;
    }
    throw new Error("too_big");
  } finally {
    bitmap.close();
  }
}
