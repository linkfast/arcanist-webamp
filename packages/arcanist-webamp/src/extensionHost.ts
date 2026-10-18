// The player's side of Arcanist's host protocol (docs/developers/extensions.md in Arcanist): the apps of extensions
// opened here (in a window's iframe, or in a tab opened from here) ask for the session and get it, with the language
// and the look of Arcanist's windows, again whenever the token is refreshed or the theme changes. Only windows of
// this origin that the player opened get it.
import { refresh, session } from "./api/client";
import { desktopWindows } from "./desktop/windows";
import { language } from "./i18n";
import { isDark, settings } from "./settings";
import { toast } from "./ui/ui";

const apps = new Set<Window>();

/** An app's window (an iframe's, or a tab's): it may talk to the player. */
export function adoptApp(target: Window | null): void {
  if (target) apps.add(target);
}

export function releaseApp(target: Window | null): void {
  if (target) apps.delete(target);
}

/** The look of Arcanist's windows, as CSS values (the app keeps its own for what is missing). */
function theme() {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string) => style.getPropertyValue(name).trim() || undefined;
  return {
    scheme: isDark() ? "dark" : "light",
    background: value("--background"),
    foreground: value("--foreground"),
    muted: value("--muted-foreground"),
    surface: value("--card"),
    border: value("--border"),
    accent: value("--primary"),
    accentForeground: value("--primary-foreground"),
    radius: value("--radius"),
    font: style.fontFamily || undefined,
  };
}

function sessionMessage() {
  return { type: "arcanist:session", token: session.token, language, theme: theme() };
}

function send(target: Window): void {
  if (!session.token) return;
  try {
    target.postMessage(sessionMessage(), location.origin);
  } catch {
    apps.delete(target);
  }
}

function sendAll(): void {
  for (const target of [...apps]) {
    if ("closed" in target && target.closed) apps.delete(target);
    else send(target);
  }
}

let started = false;

/** Starts answering apps (once). */
export function startExtensionHost(): void {
  if (started) return;
  started = true;
  window.addEventListener("message", async (event: MessageEvent) => {
    if (event.origin !== location.origin || !event.source || !apps.has(event.source as Window)) return;
    const source = event.source as Window;
    const message = event.data as { type?: string; target?: string; id?: string; kind?: string; text?: string } | null;
    switch (message?.type) {
      case "arcanist:hello":
        send(source);
        break;
      case "arcanist:token-expired":
        // Refreshing changes the token: every app gets the new one through the session's listener.
        if (!(await refresh())) return;
        send(source);
        break;
      case "arcanist:open":
        if (message.target === "uploads") desktopWindows.open("uploads");
        else if (message.target === "track" && message.id) desktopWindows.open("library");
        break;
      case "arcanist:notify":
        if (typeof message.text === "string") toast(message.text.slice(0, 200), message.kind === "error");
        break;
    }
  });
  session.subscribe(sendAll);
  // After the theme is applied to the page (the colors are read from it).
  settings.subscribe(() => requestAnimationFrame(sendAll));
}
