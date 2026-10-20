// Tells the user when songs of their wish list arrive: the server recognises them as libraries are scanned, and the
// player asks now and then (and shows each one once).
import * as api from "./api/arcanist";
import { t } from "./i18n";
import { toast } from "./ui/ui";

const EVERY_MS = 60_000;

let started = false;
const told = new Set<string>();

/** Starts asking (once), when the server keeps wish lists. */
export function startWishWatcher(features: string[]): void {
  if (started || !features.includes("WISH_LIST")) return;
  started = true;
  const check = async () => {
    try {
      const list = await api.wishList("OBTAINED");
      if (list.unseen === 0) return;
      const fresh = list.items.filter((w) => !w.seen && !told.has(w.id));
      for (const wish of fresh) told.add(wish.id);
      if (fresh.length === 1) toast(t("wishes.arrived", { title: fresh[0].title }));
      else if (fresh.length > 1) toast(t("wishes.arrivedMany", { count: fresh.length }));
    } catch {
      // Asked again later.
    }
  };
  void check();
  setInterval(() => void check(), EVERY_MS);
}
