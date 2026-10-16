import { useRef, useState, type ReactNode } from "react";
import { Check, ImagePlus, Link, Monitor, Moon, Paintbrush, Palette, RotateCcw, Sun, Upload } from "lucide-react";
import { app } from "../app";
import { ArcaneArt } from "../desktop/Background";
import { useDesktopIcons } from "../desktop/Desktop";
import { desktopWindows, Window, type DesktopWindow } from "../desktop/windows";
import { t, type TextKey } from "../i18n";
import {
  ACCENTS,
  ARCANE_BACKGROUNDS,
  downscaleImage,
  isDark,
  settings,
  useSettings,
  type Accent,
  type IconSize,
  type ThemePreference,
} from "../settings";
import { Button, Checkbox, Input, Spinner, cn, toast } from "../ui/ui";

/** Swatches of the accents, as they look in each theme (the 500/600 of Tailwind's palette; neutral is the panel's). */
const ACCENT_COLORS: Record<Accent, { light: string; dark: string }> = {
  neutral: { light: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" },
  violet: { light: "oklch(0.541 0.281 293.009)", dark: "oklch(0.606 0.25 292.717)" },
  indigo: { light: "oklch(0.511 0.262 276.966)", dark: "oklch(0.585 0.233 277.117)" },
  teal: { light: "oklch(0.6 0.118 184.704)", dark: "oklch(0.704 0.14 182.503)" },
  amber: { light: "oklch(0.666 0.179 58.318)", dark: "oklch(0.769 0.188 70.08)" },
  rose: { light: "oklch(0.586 0.253 17.585)", dark: "oklch(0.645 0.246 16.439)" },
};

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon?: ReactNode }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit flex-wrap gap-0.5 rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&_svg]:size-4",
            value === o.id ? "bg-[var(--background)] shadow-sm" : "text-muted-foreground hover:text-[var(--foreground)]",
          )}
          onClick={() => onChange(o.id)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b pb-5 last:border-b-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** A background to choose, as a small preview. */
function Tile({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      className="group grid gap-1.5 text-left text-xs outline-none"
      onClick={onClick}
      title={label}
    >
      <span
        className={cn(
          "relative block aspect-[16/10] overflow-hidden rounded-lg ring-1 ring-[var(--border)] transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-[var(--ring)]",
          selected && "ring-2 ring-[var(--primary)]",
        )}
      >
        {children}
        {selected && (
          <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Check className="size-3.5" />
          </span>
        )}
      </span>
      <span className={cn("truncate", selected ? "font-medium" : "text-muted-foreground")}>{label}</span>
    </button>
  );
}

/** How the player looks, per browser: theme, background, accent, desktop icons and Webamp. */
export function PersonalizeWindow({ window: win }: { window: DesktopWindow }) {
  const s = useSettings();
  const dark = isDark(s);
  const icons = useDesktopIcons();
  const image = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"image" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const bg = s.background;

  const chooseImage = async (file: File) => {
    setBusy("image");
    try {
      if (!settings.setWallpaper(await downscaleImage(file))) toast(t("personalize.imageSession"), true);
    } catch {
      toast(t("personalize.imageFailed"), true);
    } finally {
      setBusy(null);
    }
  };

  const resetAll = () => {
    // The saved skins stay in the library; Webamp goes back to its own.
    const hadSkin = settings.value.skin.kind !== "base";
    settings.reset();
    if (hadSkin) app.player.setBaseSkin();
    setConfirmReset(false);
    toast(t("personalize.resetDone"));
  };

  const theme: { id: ThemePreference; label: string; icon: ReactNode }[] = [
    { id: "system", label: t("personalize.themeSystem"), icon: <Monitor /> },
    { id: "light", label: t("personalize.themeLight"), icon: <Sun /> },
    { id: "dark", label: t("personalize.themeDark"), icon: <Moon /> },
  ];
  const sizes: { id: IconSize; label: string }[] = [
    { id: "small", label: t("personalize.iconsSmall") },
    { id: "normal", label: t("personalize.iconsNormal") },
    { id: "large", label: t("personalize.iconsLarge") },
  ];

  return (
    <Window
      window={win}
      title={t("personalize.title")}
      icon={<Paintbrush className="size-4" />}
      width={600}
      height={640}
      footer={
        confirmReset ? (
          <>
            <span className="mr-auto text-sm text-muted-foreground">{t("personalize.resetConfirm")}</span>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={resetAll}>
              {t("personalize.reset")}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw /> {t("personalize.reset")}
          </Button>
        )
      }
    >
      <div className="grid gap-5">
        <Group title={t("personalize.theme")}>
          <Segmented label={t("personalize.theme")} value={s.theme} options={theme} onChange={(value) => settings.set({ theme: value })} />
          <p className="text-xs text-muted-foreground">{t("personalize.themeHelp")}</p>
        </Group>

        <Group title={t("personalize.accent")}>
          <div role="radiogroup" aria-label={t("personalize.accent")} className="flex flex-wrap gap-2">
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                role="radio"
                aria-checked={s.accent === accent}
                aria-label={t(`personalize.accent.${accent}` as TextKey)}
                title={t(`personalize.accent.${accent}` as TextKey)}
                className={cn(
                  "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-[var(--card)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  s.accent === accent && "ring-2 ring-[var(--foreground)]",
                )}
                style={{ background: ACCENT_COLORS[accent][dark ? "dark" : "light"] }}
                onClick={() => settings.set({ accent })}
              >
                {s.accent === accent && <Check className={cn("size-4", accent === "neutral" && dark ? "text-black" : "text-white")} />}
              </button>
            ))}
          </div>
        </Group>

        <Group title={t("personalize.background")}>
          <div role="radiogroup" aria-label={t("personalize.background")} className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {ARCANE_BACKGROUNDS.map((id) => (
              <Tile key={id} selected={bg.kind === "arcane" && bg.id === id} label={t(`personalize.bg.${id}` as TextKey)} onClick={() => settings.set({ background: { kind: "arcane", id } })}>
                <ArcaneArt id={id} dark={dark} className="size-full" />
              </Tile>
            ))}
            <Tile selected={bg.kind === "color"} label={t("personalize.bgColor")} onClick={() => settings.set({ background: { kind: "color", color: bg.kind === "color" ? bg.color : dark ? "#1e1b3a" : "#e7e3f4" } })}>
              <span className="block size-full" style={{ background: bg.kind === "color" ? bg.color : dark ? "#1e1b3a" : "#e7e3f4" }} />
            </Tile>
            <Tile selected={bg.kind === "image"} label={t("personalize.bgImage")} onClick={() => (settings.wallpaper ? settings.set({ background: { kind: "image" } }) : image.current?.click())}>
              {settings.wallpaper ? (
                <span className="block size-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(settings.wallpaper)})` }} />
              ) : (
                <span className="grid size-full place-items-center bg-muted text-muted-foreground">{busy === "image" ? <Spinner /> : <ImagePlus className="size-6" />}</span>
              )}
            </Tile>
          </div>

          {bg.kind === "color" && (
            <label className="flex items-center gap-3 text-sm">
              {t("personalize.bgColorPick")}
              <input
                type="color"
                className="h-8 w-14 cursor-pointer rounded-md border bg-transparent p-0.5"
                value={bg.color}
                onChange={(e) => settings.set({ background: { kind: "color", color: e.target.value } })}
              />
              <span className="font-mono text-xs text-muted-foreground">{bg.color}</span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy === "image"} onClick={() => image.current?.click()}>
              {busy === "image" ? <Spinner /> : <Upload />} {t("personalize.bgImagePick")}
            </Button>
            <form
              className="flex min-w-60 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const parsed = new URL(url.trim());
                  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
                  settings.setWallpaper(parsed.href);
                  setUrl("");
                } catch {
                  toast(t("personalize.bgUrlInvalid"), true);
                }
              }}
            >
              <Input className="h-8" type="url" value={url} placeholder={t("personalize.bgUrl")} aria-label={t("personalize.bgUrl")} onChange={(e) => setUrl(e.target.value)} />
              <Button size="sm" variant="outline" type="submit" disabled={!url.trim()}>
                <Link /> {t("personalize.bgUrlUse")}
              </Button>
            </form>
          </div>
          <input
            ref={image}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void chooseImage(file);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("personalize.bgImageHelp")}</p>
          <Checkbox checked={s.animate} onChange={(animate) => settings.set({ animate })} label={t("personalize.animate")} />
        </Group>

        <Group title={t("personalize.desktop")}>
          <div className="grid gap-1.5 text-sm">
            {t("personalize.iconSize")}
            <Segmented label={t("personalize.iconSize")} value={s.iconSize} options={sizes} onChange={(iconSize) => settings.set({ iconSize })} />
          </div>
          <Checkbox checked={s.iconLabels} onChange={(iconLabels) => settings.set({ iconLabels })} label={t("personalize.iconLabels")} />
          <div className="grid gap-1.5">
            <span className="text-sm">{t("personalize.icons")}</span>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-4 gap-y-1.5">
              {icons.map((icon) => (
                <li key={icon.id}>
                  <Checkbox
                    checked={!s.hiddenIcons.includes(icon.id)}
                    label={icon.label}
                    onChange={(shown) =>
                      settings.set({ hiddenIcons: shown ? s.hiddenIcons.filter((id) => id !== icon.id) : [...s.hiddenIcons, icon.id] })
                    }
                  />
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("personalize.iconsHelp")}</p>
          </div>
        </Group>

        <Group title={t("personalize.webamp")}>
          <Checkbox checked={s.milkdrop} onChange={(milkdrop) => settings.set({ milkdrop })} label={t("personalize.milkdrop")} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => app.player.resetLayout()}>
              <RotateCcw /> {t("personalize.resetWindows")}
            </Button>
          </div>
          <div className="grid gap-2">
            <span className="text-sm">
              {t("personalize.skin")}:{" "}
              <span className="font-medium">{s.skin.kind === "base" ? t("personalize.skinBase") : s.skin.name}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => desktopWindows.open("skins")}>
                <Palette /> {t("personalize.skinLibrary")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => desktopWindows.open("skins", { tab: "museum" })}>
                {t("personalize.skinMuseum")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("personalize.skinHelp")}</p>
          </div>
        </Group>
      </div>
    </Window>
  );
}
