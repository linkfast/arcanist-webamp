import { useSyncExternalStore } from "react";

// Phones get their own layout: Webamp's windows stacked to the screen's width, Arcanist's windows as full-screen
// pages and a bar of tabs at the bottom instead of the desktop and its taskbar. Narrow screens, and touch screens
// too short for the desktop (a phone held sideways).

const query = typeof matchMedia === "function" ? matchMedia("(max-width: 640px), (pointer: coarse) and (max-height: 500px)") : null;
const listeners = new Set<() => void>();

function apply(): void {
  document.documentElement.dataset.layout = isMobile() ? "mobile" : "desktop";
}

query?.addEventListener("change", () => {
  apply();
  for (const listener of listeners) listener();
});
apply();

/** Whether the phone layout is in use. */
export function isMobile(): boolean {
  return query?.matches ?? false;
}

export function onLayoutChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMobile(): boolean {
  return useSyncExternalStore(onLayoutChange, isMobile);
}
