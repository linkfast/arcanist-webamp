import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { ContextMenuItem } from "../../../webamp/js/types";
import { cn } from "./ui";

// Context menus for Arcanist's windows, with the same items as Webamp's (ContextMenuItem): one open at a time.

export type MenuItem = ContextMenuItem & { icon?: ReactNode };

interface OpenMenu {
  x: number;
  y: number;
  items: MenuItem[];
}

/** Above Webamp, Arcanist's windows and the taskbar; below the toasts. */
export const MENU_Z = 90000;

let current: OpenMenu | null = null;
const listeners = new Set<() => void>();

function set(menu: OpenMenu | null): void {
  current = menu;
  for (const listener of listeners) listener();
}

/** Opens a menu where the pointer is (a right-click) or at a point. */
export function openMenu(at: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[] | null): void {
  if (!items?.length) return;
  at.preventDefault?.();
  set({ x: at.clientX, y: at.clientY, items });
}

export function closeMenu(): void {
  if (current) set(null);
}

/** Where the open menu is drawn: once, at the root. */
export function MenuHost() {
  const menu = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && e.target instanceof Element && e.target.closest("[data-menu]")) return;
      closeMenu();
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    addEventListener("blur", close);
    addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
      removeEventListener("blur", close);
      removeEventListener("resize", close);
    };
  }, [menu]);

  if (!menu) return null;
  return <MenuPanel key={`${menu.x},${menu.y}`} items={menu.items} x={menu.x} y={menu.y} onDone={closeMenu} />;
}

/** A floating list of items, kept inside the viewport; submenus open beside it. */
function MenuPanel({ items, x, y, onDone, side }: { items: MenuItem[]; x: number; y: number; onDone: () => void; side?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, visible: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let left = x;
    // A submenu that does not fit to the right opens to the left of its parent.
    if (left + width > innerWidth - 4) left = side != null ? side - width : innerWidth - width - 4;
    const top = Math.max(4, Math.min(y, innerHeight - height - 4));
    setPosition({ left: Math.max(4, left), top, visible: true });
  }, [x, y, side]);

  return (
    <div
      ref={ref}
      data-menu
      role="menu"
      className="ui fixed min-w-48 max-w-80 rounded-lg border bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-xl"
      style={{ left: position.left, top: position.top, zIndex: MENU_Z, visibility: position.visible ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuList items={items} onDone={onDone} />
    </div>
  );
}

/** Menu items (also the start menu's): separators, checks and submenus. */
export function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  const [open, setOpen] = useState<{ index: number; rect: DOMRect } | null>(null);
  return (
    <ul className="grid">
      {items.map((item, i) => {
        if (item.type === "separator") return <li key={i} role="separator" className="-mx-1 my-1 h-px bg-[var(--border)]" />;
        const hasChildren = !!item.children?.length;
        return (
          <li key={i}>
            <button
              role="menuitem"
              disabled={item.disabled}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
                open?.index === i && "bg-[var(--accent)]",
              )}
              onPointerEnter={(e) => setOpen(hasChildren ? { index: i, rect: e.currentTarget.getBoundingClientRect() } : null)}
              onClick={(e) => {
                if (hasChildren) {
                  setOpen({ index: i, rect: e.currentTarget.getBoundingClientRect() });
                  return;
                }
                onDone();
                item.onClick?.();
              }}
            >
              <span className="grid w-4 place-items-center text-muted-foreground">
                {item.checked ? <Check className="text-[var(--foreground)]" /> : item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {hasChildren && <ChevronRight className="text-muted-foreground" />}
            </button>
            {hasChildren && open?.index === i && (
              <MenuPanel items={item.children as MenuItem[]} x={open.rect.right + 2} y={open.rect.top - 5} side={open.rect.left - 2} onDone={onDone} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
