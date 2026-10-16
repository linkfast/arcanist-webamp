import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Code, LogOut, Settings2, UserCog } from "lucide-react";
import { logout, session } from "../api/client";
import { app, managesServer, openPanel, useLibraries } from "../app";
import { language, t } from "../i18n";
import { MenuList, type MenuItem } from "../ui/menu";
import { cn } from "../ui/ui";
import { KINDS, WEBAMP_KIND } from "./kinds";
import { desktopWindows, useDesktopWindows, type WindowKind } from "./windows";

// The desktop's taskbar: a start button with the app's menu, a button per open window (and Webamp's), and a clock.

/** Above Webamp and Arcanist's windows; below menus and toasts. */
const TASKBAR_Z = 80000;

/** Arcanist's mark: an astrolabe ring around Webamp's lightning bolt. */
export function ArcanistMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="#1c1838" stroke="#a78bfa" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="#a78bfa" strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="1.2 2" />
      <path d="M18 6 10 18h5.5l-1.6 8L22 14h-5.5z" fill="#f5b400" stroke="#7a5a00" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}

function usePlayerState(): { closed: boolean; z: number } {
  const player = app.player;
  const snapshot = useSyncExternalStore(
    (listener) => player.subscribe(listener),
    () => `${player.closed}|${player.zIndex}`,
  );
  const [closed, z] = snapshot.split("|");
  return { closed: closed === "true", z: Number(z) };
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <time
      className="grid px-2 text-right text-xs leading-tight tabular-nums"
      dateTime={now.toISOString()}
      title={now.toLocaleDateString(language, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
    >
      <span>{now.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}</span>
      <span className="text-muted-foreground">{now.toLocaleDateString(language, { day: "numeric", month: "short" })}</span>
    </time>
  );
}

function StartMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const user = session.user;
  const libraries = useLibraries();
  const canUpload = libraries?.some((l) => l.canUpload) ?? false;
  const source = app.server?.sourceUrl;

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") onClose();
        return;
      }
      if (e.target instanceof Element && (e.target.closest("[data-start]") || e.target.closest("[data-menu]"))) return;
      onClose();
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [onClose]);

  const window = (kind: WindowKind): MenuItem => ({ label: KINDS[kind].label(), icon: KINDS[kind].glyph(), onClick: () => desktopWindows.open(kind) });
  const items: MenuItem[] = [
    window("library"),
    window("playlists"),
    window("starTracks"),
    window("mixes"),
    window("lyrics"),
    ...(canUpload ? [window("upload")] : []),
    { type: "separator" },
    window("personalize"),
    window("skins"),
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
      ref={ref}
      data-start
      className="ui fixed left-2 w-72 overflow-hidden rounded-xl border bg-[var(--popover)]/95 text-[var(--popover-foreground)] shadow-2xl backdrop-blur-xl"
      style={{ bottom: "calc(var(--taskbar-height) + 6px)", zIndex: TASKBAR_Z + 1 }}
      role="menu"
    >
      <button
        className="flex w-full items-center gap-3 border-b bg-[var(--muted)]/50 px-4 py-3 text-left hover:bg-[var(--accent)]"
        onClick={() => {
          onClose();
          desktopWindows.open("account");
        }}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-sm font-semibold text-[var(--primary-foreground)]">
          {(user?.displayName || user?.userName || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="grid min-w-0">
          <span className="truncate text-sm font-semibold">{user?.displayName || user?.userName}</span>
          <span className="truncate text-xs text-muted-foreground">{t("start.signedIn", { server: app.server?.name ?? "" })}</span>
        </span>
      </button>
      <div className="max-h-[70vh] overflow-auto p-1">
        <MenuList items={items} onDone={onClose} />
      </div>
    </div>
  );
}

export function Taskbar() {
  const [start, setStart] = useState(false);
  const windows = useDesktopWindows();
  const webamp = usePlayerState();
  const front = desktopWindows.front();
  const webampInFront = !webamp.closed && (!front || webamp.z > front.z);

  const button = "flex h-9 min-w-0 items-center gap-2 rounded-md px-2.5 text-xs outline-none transition-colors hover:bg-[var(--foreground)]/10 focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&_svg]:size-4 [&_svg]:shrink-0";
  const active = "bg-[var(--foreground)]/12 shadow-[inset_0_-2px_0_var(--primary)]";

  return (
    <>
      {start && <StartMenu onClose={() => setStart(false)} />}
      <nav
        className="ui fixed inset-x-0 bottom-0 flex items-center gap-1 border-t bg-[var(--taskbar)] px-1.5 backdrop-blur-xl"
        style={{ height: "var(--taskbar-height)", zIndex: TASKBAR_Z }}
        aria-label={t("taskbar.label")}
      >
        <button
          data-start
          className={cn(button, "px-2 font-semibold", start && active)}
          aria-expanded={start}
          aria-haspopup="menu"
          onClick={() => setStart((s) => !s)}
        >
          <ArcanistMark className="size-6!" />
          <span className="hidden sm:inline">{t("taskbar.start")}</span>
        </button>
        <span className="mx-1 h-6 w-px bg-[var(--border)]" />
        <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <li className="min-w-0">
            <button
              className={cn(button, "max-w-44", webampInFront && active, webamp.closed && "opacity-60")}
              title={WEBAMP_KIND.label()}
              onClick={() => app.player.reopen()}
            >
              {WEBAMP_KIND.glyph()}
              <span className="hidden truncate md:inline">{WEBAMP_KIND.label()}</span>
            </button>
          </li>
          {windows.map((win) => {
            const kind = KINDS[win.kind];
            return (
              <li key={win.id} className="min-w-0">
                <button
                  className={cn(button, "max-w-44", !webampInFront && front?.id === win.id && active)}
                  title={kind.label()}
                  onClick={() => desktopWindows.focus(win.id)}
                  onAuxClick={(e) => e.button === 1 && desktopWindows.close(win.id)}
                >
                  {kind.glyph()}
                  <span className="hidden truncate md:inline">{kind.label()}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <Clock />
      </nav>
    </>
  );
}
