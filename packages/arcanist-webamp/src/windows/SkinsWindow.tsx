import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Palette, Search, Trash2, Upload } from "lucide-react";
import { app } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { t } from "../i18n";
import { settings, useSettings, type SkinChoice } from "../settings";
import {
  MUSEUM_PAGE,
  MUSEUM_URL,
  museum,
  sameSkin,
  saveFile,
  savedSkins,
  skinFile,
  useSkinLibrary,
  type MuseumSkin,
} from "../skins";
import { Button, Input, Spinner, cn, toast } from "../ui/ui";

type Tab = "mine" | "museum";

/** Puts a skin on Webamp and remembers it for the next time. */
async function applySkin(choice: SkinChoice, blob?: Blob | null): Promise<boolean> {
  if (choice.kind === "base") {
    app.player.setBaseSkin();
  } else {
    const file = blob ?? (await skinFile(choice));
    if (!file) return false;
    app.player.setSkin(file);
  }
  settings.set({ skin: choice });
  return true;
}

/** A skin's card: its screenshot (or a placeholder), its name and what can be done with it. */
function SkinCard({
  name,
  screenshot,
  current,
  busy,
  badge,
  onUse,
  onRemove,
}: {
  name: string;
  screenshot?: string;
  current?: boolean;
  busy?: boolean;
  badge?: string;
  onUse: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative grid gap-1.5 rounded-lg border p-2 text-left",
        current ? "border-[var(--primary)] ring-2 ring-[var(--primary)]" : "hover:bg-muted",
      )}
    >
      <button className="grid gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" onClick={onUse} disabled={busy} title={name}>
        <div className="grid aspect-[275/116] place-items-center overflow-hidden rounded bg-muted">
          {screenshot ? (
            <img src={screenshot} alt="" loading="lazy" className="h-full w-full object-cover object-top [image-rendering:pixelated]" />
          ) : (
            <Palette className="size-8 text-muted-foreground" />
          )}
        </div>
        <span className="truncate text-sm font-medium">{name}</span>
      </button>
      {(busy || current || badge) && (
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[var(--background)]/90 px-2 py-0.5 text-xs shadow">
          {busy ? <Spinner className="size-3" /> : current ? <Check className="size-3" /> : null}
          {current ? t("skins.current") : badge}
        </span>
      )}
      {onRemove && !current && (
        <button
          className="absolute left-3 top-3 hidden rounded-full bg-[var(--background)]/90 p-1 shadow hover:text-[var(--destructive)] group-hover:block focus-visible:block"
          title={t("skins.remove")}
          aria-label={t("skins.remove")}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function MySkins() {
  const s = useSettings();
  const library = useSkinLibrary();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (key: string, choice: SkinChoice) => {
    setBusy(key);
    try {
      if (!(await applySkin(choice))) toast(t("skins.missing"), true);
    } catch {
      toast(t("skins.failed"), true);
    } finally {
      setBusy(null);
    }
  };

  const load = async (file: File) => {
    setBusy("file");
    try {
      const { choice, kept } = await saveFile(file);
      await applySkin(choice, file);
      if (!kept) toast(t("skins.session"), true);
    } catch {
      toast(t("skins.failed"), true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    await savedSkins.remove(id);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy === "file"} onClick={() => input.current?.click()}>
          {busy === "file" ? <Spinner /> : <Upload />} {t("skins.load")}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".wsz,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void load(file);
          }}
        />
        <span className="text-xs text-muted-foreground">{t("skins.mineHelp")}</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        <SkinCard
          name={t("skins.base")}
          current={s.skin.kind === "base"}
          busy={busy === "base"}
          onUse={() => void choose("base", { kind: "base" })}
        />
        {library.bundled.map((skin) => {
          const choice: SkinChoice = { kind: "bundled", file: skin.file, name: skin.name, ...(skin.effects?.length ? { effects: skin.effects } : {}) };
          return (
            <SkinCard
              key={skin.file}
              name={skin.name}
              screenshot={skin.screenshot ? `skins/${encodeURIComponent(skin.screenshot)}` : undefined}
              current={sameSkin(s.skin, choice)}
              busy={busy === skin.file}
              badge={skin.effects?.includes("oled") ? "OLED" : t("skins.bundled")}
              onUse={() => void choose(skin.file, choice)}
            />
          );
        })}
        {library.saved.map((skin) => {
          const choice: SkinChoice = { kind: "saved", id: skin.id, name: skin.name };
          return (
            <SkinCard
              key={skin.id}
              name={skin.name}
              screenshot={skin.screenshotUrl}
              current={sameSkin(s.skin, choice)}
              busy={busy === skin.id}
              onUse={() => void choose(skin.id, choice)}
              onRemove={() => void remove(skin.id)}
            />
          );
        })}
      </div>
      {library.loading && <Spinner />}
    </div>
  );
}

function Museum() {
  const s = useSettings();
  const library = useSkinLibrary();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [skins, setSkins] = useState<MuseumSkin[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const offset = useRef(0);
  const request = useRef<AbortController | null>(null);

  // Searches as the user types, a moment after they stop.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchPage = async (reset: boolean) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (reset) offset.current = 0;
    setLoading(true);
    setFailed(false);
    try {
      const page = await museum.page(search, offset.current, controller.signal);
      offset.current += MUSEUM_PAGE;
      setSkins((current) => (reset ? page.skins : [...current, ...page.skins]));
      setMore(page.more);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (request.current === controller) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPage(true);
    return () => request.current?.abort();
  }, [search]);

  const use = async (skin: MuseumSkin) => {
    setBusy(skin.md5);
    try {
      const { choice, blob, kept } = await museum.save(skin);
      await applySkin(choice, blob);
      toast(kept ? t("skins.saved", { name: skin.name }) : t("skins.session"), !kept);
    } catch {
      toast(t("skins.downloadFailed"), true);
    } finally {
      setBusy(null);
    }
  };

  const saved = new Set(library.saved.map((skin) => skin.id));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" type="search" placeholder={t("skins.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button size="sm" variant="link" onClick={() => globalThis.open(MUSEUM_URL, "_blank", "noopener")}>
          <ExternalLink /> skins.webamp.org
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("skins.museumHelp")}</p>

      {failed && skins.length === 0 ? (
        <div className="grid justify-items-start gap-2 text-sm">
          <p>{t("skins.museumUnavailable")}</p>
          <Button size="sm" variant="outline" onClick={() => void fetchPage(true)}>
            {t("skins.retry")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {skins.map((skin) => {
            const id = `museum:${skin.md5}`;
            return (
              <SkinCard
                key={skin.md5}
                name={skin.name}
                screenshot={skin.screenshotUrl}
                current={s.skin.kind === "saved" && s.skin.id === id}
                busy={busy === skin.md5}
                badge={saved.has(id) ? t("skins.inLibrary") : undefined}
                onUse={() => void use(skin)}
              />
            );
          })}
        </div>
      )}
      {!loading && !failed && skins.length === 0 && <p className="text-sm text-muted-foreground">{t("skins.noResults")}</p>}
      <div className="flex justify-center">
        {loading ? (
          <Spinner />
        ) : (
          more && (
            <Button size="sm" variant="outline" onClick={() => void fetchPage(false)}>
              {t("common.more")}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

/** Webamp's skins: the library (base, the ones that come with the player, the saved ones) and the Winamp Skin Museum. */
export function SkinsWindow({ window: win }: { window: DesktopWindow }) {
  const [tab, setTab] = useState<Tab>(win.props.tab === "museum" ? "museum" : "mine");
  // Opened again from elsewhere (Personalize's "Skin Museum"): the tab it asks for.
  useEffect(() => {
    if (win.props.tab === "museum" || win.props.tab === "mine") setTab(win.props.tab);
  }, [win.props]);
  const tabs: { id: Tab; label: string }[] = [
    { id: "mine", label: t("skins.mine") },
    { id: "museum", label: t("skins.museum") },
  ];
  return (
    <Window window={win} title={t("skins.title")} icon={<Palette className="size-4" />} width={720} height={600}>
      <div className="grid gap-4">
        <div role="tablist" className="inline-flex w-fit gap-0.5 rounded-lg bg-muted p-1">
          {tabs.map((option) => (
            <button
              key={option.id}
              role="tab"
              aria-selected={tab === option.id}
              className={cn(
                "rounded-md px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                tab === option.id ? "bg-[var(--background)] shadow-sm" : "text-muted-foreground hover:text-[var(--foreground)]",
              )}
              onClick={() => setTab(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {tab === "mine" ? <MySkins /> : <Museum />}
      </div>
    </Window>
  );
}
