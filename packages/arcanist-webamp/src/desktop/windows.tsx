import { useCallback, useRef, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, cn } from "../ui/ui";
import { t } from "../i18n";

// Arcanist's own windows on the desktop: draggable cards above Webamp, one per kind unless asked otherwise.

export type WindowKind =
  | "library"
  | "playlists"
  | "savePlaylist"
  | "starTracks"
  | "mixes"
  | "upload"
  | "lyrics"
  | "account";

export interface DesktopWindow {
  id: string;
  kind: WindowKind;
  props: Record<string, unknown>;
  x: number;
  y: number;
  z: number;
}

/** Above Webamp (whose windows and menus use 10 and 11). */
const BASE_Z = 100;

let windows: DesktopWindow[] = [];
let topZ = BASE_Z;
let opened = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const desktopWindows = {
  /** Opens a window (or brings the one of that kind to the front, with the new props). */
  open(kind: WindowKind, props: Record<string, unknown> = {}): void {
    const existing = windows.find((w) => w.kind === kind);
    if (existing) {
      windows = windows.map((w) => (w === existing ? { ...w, props, z: ++topZ } : w));
    } else {
      const offset = (opened++ % 8) * 28;
      const x = Math.max(16, Math.min(window.innerWidth - 560, 120 + offset));
      const y = Math.max(16, Math.min(window.innerHeight - 480, 60 + offset));
      windows = [...windows, { id: `${kind}-${Date.now()}`, kind, props, x, y, z: ++topZ }];
    }
    emit();
  },
  close(id: string): void {
    const closing = windows.find((w) => w.id === id);
    windows = windows.filter((w) => w.id !== id);
    emit();
    (closing?.props.onClose as (() => void) | undefined)?.();
  },
  focus(id: string): void {
    if (windows.find((w) => w.id === id)?.z === topZ) return;
    windows = windows.map((w) => (w.id === id ? { ...w, z: ++topZ } : w));
    emit();
  },
  move(id: string, x: number, y: number): void {
    windows = windows.map((w) => (w.id === id ? { ...w, x, y } : w));
    emit();
  },
  closeAll(): void {
    windows = [];
    emit();
  },
};

export function useDesktopWindows(): DesktopWindow[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => windows,
  );
}

interface WindowProps {
  window: DesktopWindow;
  title: string;
  icon?: ReactNode;
  width?: number;
  height?: number;
  children: ReactNode;
  footer?: ReactNode;
}

/** A card with a title bar to drag it by, like the panel's dialogs. */
export function Window({ window: win, title, icon, width = 520, height = 460, children, footer }: WindowProps) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [win.x, win.y],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const x = Math.min(Math.max(e.clientX - drag.current.dx, -width + 80), globalThis.innerWidth - 80);
      const y = Math.min(Math.max(e.clientY - drag.current.dy, 0), globalThis.innerHeight - 40);
      desktopWindows.move(win.id, x, y);
    },
    [win.id, width],
  );
  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <section
      role="dialog"
      aria-label={title}
      className="ui absolute flex flex-col overflow-hidden rounded-xl border bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl"
      style={{
        left: win.x,
        top: win.y,
        zIndex: win.z,
        width: `min(${width}px, calc(100vw - 16px))`,
        height: `min(${height}px, calc(100vh - 16px))`,
        resize: "both",
        minWidth: 280,
        minHeight: 200,
      }}
      onPointerDownCapture={() => desktopWindows.focus(win.id)}
    >
      <div
        className={cn("flex cursor-move select-none items-center gap-2 border-b px-4 py-2.5")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {icon}
        <h2 className="flex-1 truncate text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={() => desktopWindows.close(win.id)}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      {footer && <div className="flex items-center justify-end gap-2 border-t px-4 py-3">{footer}</div>}
    </section>
  );
}
