import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Code, LogOut, Menu, Pause, Play, Settings2, SkipForward, UserCog, X } from "lucide-react";
import { logout, artworkUrl, session } from "../api/client";
import type { ExtensionApp, Track } from "../api/arcanist";
import { app, managesServer, openPanel } from "../app";
import { t } from "../i18n";
import { MenuList, type MenuItem } from "../ui/menu";
import { cn } from "../ui/ui";
import { useDesktopIcons } from "./Desktop";
import { AppGlyph, KINDS, WEBAMP_KIND } from "./kinds";
import { ArcanistMark, usePlayerState } from "./Taskbar";
import { desktopWindows, type DesktopWindow, type WindowKind } from "./windows";

// A phone's navigation: tabs at the bottom (Webamp, the library, playlists, StarTracks and everything else), with
// what is playing above them while a page covers Webamp.

/** Above Webamp and the pages; below menus and toasts (as the taskbar). */
const NAV_Z = 80000;

const TABS: WindowKind[] = ["library", "playlists", "starTracks"];

/** The window shown as a page: the one in front, unless Webamp is. */
export function useShownPage(windows: DesktopWindow[]): DesktopWindow | null {
  const webamp = usePlayerState();
  const front = windows.reduce<DesktopWindow | null>((best, w) => (!best || w.z > best.z ? w : best), null);
  return front && (webamp.closed || front.z > webamp.z) ? front : null;
}

/** Brings a window of that kind in front as it was, or opens it. */
function show(kind: WindowKind, windows: DesktopWindow[]): void {
  const open = windows.find((w) => w.kind === kind);
  if (open) desktopWindows.focus(open.id);
  else desktopWindows.open(kind);
}

export function MobileNav({ windows }: { windows: DesktopWindow[] }) {
  const [more, setMore] = useState(false);
  const page = useShownPage(windows);
  const active = more ? "more" : !page ? "player" : TABS.includes(page.kind) ? page.kind : "more";
  const playing = usePlaying();
  const mini = page != null && !more && playing.track != null;

  // Pages end above the tabs, and above what is playing while it shows.
  useEffect(() => {
    document.documentElement.style.setProperty("--page-bottom", mini ? "calc(var(--taskbar-height) + 56px)" : "var(--taskbar-height)");
  }, [mini]);

  const tab = (id: string, label: string, glyph: ReactNode, onClick: () => void) => (
    <li key={id} className="min-w-0 flex-1">
      <button
        className={cn(
          "grid h-14 w-full place-items-center content-center gap-0.5 text-[11px] outline-none transition-colors focus-visible:bg-[var(--foreground)]/10 [&_svg]:size-5",
          active === id ? "text-[var(--primary)]" : "text-muted-foreground",
        )}
        aria-current={active === id ? "page" : undefined}
        onClick={onClick}
      >
        {glyph}
        <span className="max-w-full truncate px-1">{label}</span>
      </button>
    </li>
  );

  return (
    <>
      {more && <MoreSheet windows={windows} onClose={() => setMore(false)} />}
      <div className="ui fixed inset-x-0 bottom-0 border-t bg-[var(--taskbar)] backdrop-blur-xl" style={{ zIndex: NAV_Z, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {mini && <NowPlaying {...playing} />}
        <nav aria-label={t("mobile.tabs")}>
          <ul className="flex">
            {tab("player", t("mobile.player"), WEBAMP_KIND.glyph(), () => {
              setMore(false);
              app.player.reopen();
            })}
            {TABS.map((kind) =>
              tab(kind, KINDS[kind].label(), KINDS[kind].glyph(), () => {
                setMore(false);
                show(kind, windows);
              }),
            )}
            {tab("more", t("mobile.more"), <Menu />, () => setMore((m) => !m))}
          </ul>
        </nav>
      </div>
    </>
  );
}

/** What Webamp has loaded, or else the first song of its list (when they are Arcanist's), and whether it plays. */
function usePlaying(): { track: Track | null; playing: boolean } {
  const player = app.player;
  const loaded = () => {
    const order = player.webamp.store.getState().playlist.trackOrder;
    return player.current() ?? (order.length > 0 ? player.trackOf(order[0]) : null);
  };
  const state = useSyncExternalStore(
    (listener) => player.subscribe(listener),
    () => `${loaded()?.id ?? ""}|${player.webamp.getMediaStatus()}`,
  );
  return { track: loaded(), playing: state.endsWith("|PLAYING") };
}

/** What is playing, with play/pause and next; tapping it shows Webamp. */
function NowPlaying({ track, playing }: { track: Track | null; playing: boolean }) {
  const player = app.player;
  if (!track) return null;
  const artwork = artworkUrl(track.artworkId, 128);
  return (
    <div className="flex h-14 items-center gap-2 border-b px-2">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t("mobile.showPlayer")} onClick={() => player.reopen()}>
        {artwork ? (
          <img src={artwork} alt="" className="size-10 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-slate-800">{WEBAMP_KIND.glyph("size-5")}</span>
        )}
        <span className="grid min-w-0">
          <span className="truncate text-sm font-medium">{track.title}</span>
          <span className="truncate text-xs text-muted-foreground">{track.artists.map((a) => a.name).join(", ")}</span>
        </span>
      </button>
      <button
        className="grid size-10 place-items-center rounded-full hover:bg-[var(--foreground)]/10 [&_svg]:size-5"
        aria-label={playing ? t("mobile.pause") : t("common.play")}
        onClick={() => (playing ? player.webamp.pause() : player.webamp.play())}
      >
        {playing ? <Pause /> : <Play />}
      </button>
      <button
        className="grid size-10 place-items-center rounded-full hover:bg-[var(--foreground)]/10 [&_svg]:size-5"
        aria-label={t("mobile.next")}
        onClick={() => player.webamp.nextTrack()}
      >
        <SkipForward />
      </button>
    </div>
  );
}

/** Everything else: the open pages, every app of the desktop, and the account. */
function MoreSheet({ windows, onClose }: { windows: DesktopWindow[]; onClose: () => void }) {
  const icons = useDesktopIcons().filter((icon) => icon.id !== "webamp" && icon.id !== "source");
  const user = session.user;
  const source = app.server?.sourceUrl;

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const items: MenuItem[] = [
    { label: t("start.accountSettings"), icon: <UserCog />, onClick: () => openPanel("account") },
    ...(managesServer() ? [{ label: t("start.panel"), icon: <Settings2 />, onClick: () => openPanel() }] : []),
    ...(source ? [{ label: t("icon.source"), icon: <Code />, onClick: () => globalThis.open(source, "_blank", "noopener") }] : []),
    { type: "separator" },
    {
      label: t("account.logout"),
      icon: <LogOut />,
      onClick: async () => {
        await logout();
        location.reload();
      },
    },
  ];

  return (
    <div
      className="ui fixed inset-x-0 top-0 flex flex-col bg-[var(--card)] text-[var(--card-foreground)]"
      style={{ bottom: "var(--taskbar-height)", zIndex: NAV_Z - 1 }}
      role="dialog"
      aria-label={t("mobile.more")}
    >
      <div className="flex min-h-12 items-center gap-3 border-b px-3 py-1.5">
        <ArcanistMark className="size-7 shrink-0" />
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-semibold">{user?.displayName || user?.userName}</span>
          <span className="truncate text-xs text-muted-foreground">{t("start.signedIn", { server: app.server?.name ?? "" })}</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {windows.length > 0 && (
          <section className="mb-5 grid gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mobile.open")}</h3>
            <ul className="grid gap-1">
              {windows.map((win) => {
                const extension = win.kind === "extensionApp" ? (win.props.app as ExtensionApp) : null;
                const label = extension ? extension.name : KINDS[win.kind].label();
                return (
                  <li key={win.id} className="flex items-center gap-1 rounded-lg border">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-sm [&_svg]:size-4 [&_svg]:shrink-0"
                      onClick={() => {
                        onClose();
                        desktopWindows.focus(win.id);
                      }}
                    >
                      {extension ? <AppGlyph iconUrl={extension.iconUrl} className="size-4" /> : KINDS[win.kind].glyph()}
                      <span className="truncate">{label}</span>
                    </button>
                    <button
                      className="grid size-10 place-items-center text-muted-foreground [&_svg]:size-4"
                      aria-label={t("common.close")}
                      onClick={() => desktopWindows.close(win.id)}
                    >
                      <X />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <section className="mb-5 grid gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mobile.apps")}</h3>
          <ul className="grid grid-cols-4 gap-1">
            {icons.map((icon) => (
              <li key={icon.id}>
                <button
                  className="grid w-full justify-items-center gap-1.5 rounded-lg p-1.5 text-center outline-none focus-visible:bg-[var(--foreground)]/10"
                  onClick={() => {
                    onClose();
                    icon.open();
                  }}
                >
                  <span className={cn("grid size-12 place-items-center rounded-xl text-white shadow-md [&_svg]:size-6", icon.tile)}>{icon.glyph}</span>
                  <span className="line-clamp-2 text-xs leading-tight">{icon.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <div className="rounded-lg border p-1">
          <MenuList items={items} onDone={onClose} />
        </div>
      </div>
    </div>
  );
}
