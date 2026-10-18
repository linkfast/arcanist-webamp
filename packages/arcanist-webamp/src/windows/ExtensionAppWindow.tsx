import { useCallback, useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import type { ExtensionApp } from "../api/arcanist";
import { AppGlyph } from "../desktop/kinds";
import { desktopWindows, Window, type DesktopWindow } from "../desktop/windows";
import { adoptApp, releaseApp, startExtensionHost } from "../extensionHost";
import { t } from "../i18n";
import { Button } from "../ui/ui";

/**
 * An extension's app in a window: its page in an iframe, which gets the session and Arcanist's look from the player
 * (host protocol), or in a tab of its own (opened from here, so it still talks to the player).
 */
export function ExtensionAppWindow({ window: win }: { window: DesktopWindow }) {
  const app = win.props.app as ExtensionApp;
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => startExtensionHost(), []);

  // The frame's window may talk to the player from its first script on.
  const attach = useCallback((element: HTMLIFrameElement | null) => {
    if (frame.current) releaseApp(frame.current.contentWindow);
    frame.current = element;
    if (element) adoptApp(element.contentWindow);
  }, []);

  const openInTab = () => {
    startExtensionHost();
    // Not "noopener": the tab finds the player through window.opener.
    const tab = globalThis.open(app.url, "_blank");
    if (tab) {
      adoptApp(tab);
      desktopWindows.close(win.id);
    }
  };

  return (
    <Window
      window={win}
      title={app.name}
      icon={<AppGlyph iconUrl={app.iconUrl} className="size-4" />}
      width={app.width ?? 760}
      height={app.height ?? 640}
      bodyClassName="p-0 overflow-hidden"
      actions={
        <Button variant="ghost" size="icon-sm" title={t("extension.openInTab")} aria-label={t("extension.openInTab")} onClick={openInTab}>
          <ExternalLink />
        </Button>
      }
    >
      <iframe ref={attach} src={app.url} title={app.name} className="block size-full border-0 bg-[var(--card)]" allow="autoplay; clipboard-write" />
    </Window>
  );
}
