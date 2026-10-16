import { useEffect, useState } from "react";
import { settings, type SkinChoice } from "./settings";

// The skin library: Webamp's base skin, the ones that come with the player (skins/, see bundledSkins.ts) and the
// ones this browser saved, from a file or from the Winamp Skin Museum (skins.webamp.org), kept in IndexedDB.

export interface BundledSkin {
  file: string;
  name: string;
  screenshot?: string;
  /** What else it changes ("oled"), from skins/skins.json. */
  effects?: string[];
}

export interface SavedSkin {
  id: string;
  name: string;
  source: "museum" | "file";
  /** The museum's screenshot; files have none. */
  screenshotUrl?: string;
  museumUrl?: string;
  addedAt: number;
}

interface StoredSkin extends SavedSkin {
  blob: Blob;
}

// ── Saved skins, in IndexedDB (a .wsz is too big for localStorage) ────────────────────────────────

const DB = "arcanist-webamp";
const STORE = "skins";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** A stored value as a skin: the one loaded before the library existed was a bare Blob under "current". */
function asStored(id: string, value: unknown): StoredSkin | null {
  if (value instanceof Blob) {
    const name = settings.value.skin.kind === "saved" && settings.value.skin.id === id ? settings.value.skin.name : "Skin";
    return { id, name, source: "file", addedAt: 0, blob: value };
  }
  const stored = value as StoredSkin | undefined;
  return stored?.blob instanceof Blob ? { ...stored, id } : null;
}

export const savedSkins = {
  async list(): Promise<SavedSkin[]> {
    try {
      const [keys, values] = await Promise.all([
        transact<IDBValidKey[]>("readonly", (store) => store.getAllKeys()),
        transact<unknown[]>("readonly", (store) => store.getAll()),
      ]);
      return keys
        .map((key, i) => asStored(String(key), values[i]))
        .filter((skin): skin is StoredSkin => skin !== null)
        .map(({ blob: _, ...skin }) => skin)
        .sort((a, b) => b.addedAt - a.addedAt);
    } catch {
      return [];
    }
  },
  async load(id: string): Promise<Blob | null> {
    try {
      return asStored(id, await transact<unknown>("readonly", (store) => store.get(id)))?.blob ?? null;
    } catch {
      return null;
    }
  },
  /** Saves a skin; false when this browser does not keep data (it can still be used until the tab closes). */
  async save(skin: SavedSkin, blob: Blob): Promise<boolean> {
    try {
      await transact("readwrite", (store) => store.put({ ...skin, blob } satisfies StoredSkin, skin.id));
      return true;
    } catch {
      return false;
    } finally {
      changed();
    }
  },
  async remove(id: string): Promise<void> {
    try {
      await transact("readwrite", (store) => store.delete(id));
    } catch {
      // Nothing kept.
    }
    changed();
  },
};

// ── Skins that come with the player ────────────────────────────────────────────────────────────────

let bundledList: Promise<BundledSkin[]> | null = null;

export function bundledSkins(): Promise<BundledSkin[]> {
  bundledList ??= fetch("skins/index.json")
    .then((r) => (r.ok ? (r.json() as Promise<BundledSkin[]>) : []))
    .then((list) => (Array.isArray(list) ? list : []))
    .catch(() => []);
  return bundledList;
}

/** The library, kept up to date as skins are saved and removed. */
export function useSkinLibrary(): { bundled: BundledSkin[]; saved: SavedSkin[]; loading: boolean } {
  const [state, setState] = useState<{ bundled: BundledSkin[]; saved: SavedSkin[]; loading: boolean }>({ bundled: [], saved: [], loading: true });
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void Promise.all([bundledSkins(), savedSkins.list()]).then(([bundled, saved]) => {
        if (alive) setState({ bundled, saved, loading: false });
      });
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, []);
  return state;
}

/** The .wsz of a choice; null for Webamp's base skin or when it is gone. */
export async function skinFile(choice: SkinChoice): Promise<Blob | null> {
  switch (choice.kind) {
    case "base":
      return null;
    case "bundled": {
      const response = await fetch(`skins/${encodeURIComponent(choice.file)}`);
      return response.ok ? response.blob() : null;
    }
    case "saved":
      return savedSkins.load(choice.id);
  }
}

export function sameSkin(a: SkinChoice, b: SkinChoice): boolean {
  return (
    a.kind === b.kind &&
    (a.kind === "base" || (a.kind === "bundled" && b.kind === "bundled" && a.file === b.file) || (a.kind === "saved" && b.kind === "saved" && a.id === b.id))
  );
}

/** A skin loaded from a file: saved under its name and size, so loading it again does not repeat it. */
export async function saveFile(file: File): Promise<{ choice: SkinChoice; kept: boolean }> {
  const id = `file:${file.name}:${file.size}`;
  const name = file.name.replace(/\.(wsz|zip)$/i, "");
  const kept = await savedSkins.save({ id, name, source: "file", addedAt: Date.now() }, file);
  return { choice: { kind: "saved", id, name }, kept };
}

// ── The Winamp Skin Museum (skins.webamp.org), through its public GraphQL API ─────────────────────────

const MUSEUM_API = "https://api.webamp.org/graphql";
export const MUSEUM_URL = "https://skins.webamp.org/";
export const MUSEUM_PAGE = 30;

export interface MuseumSkin {
  md5: string;
  name: string;
  screenshotUrl: string;
  downloadUrl: string;
  museumUrl: string;
}

interface MuseumNode {
  md5: string;
  filename: string;
  screenshot_url: string;
  download_url: string;
  museum_url?: string;
  nsfw: boolean;
}

const FIELDS = "md5 filename screenshot_url download_url museum_url nsfw";

async function museumQuery<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(MUSEUM_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  const body = (await response.json()) as { data?: T; errors?: unknown[] };
  if (!response.ok || !body.data) throw new Error("museum_unavailable");
  return body.data;
}

function toMuseumSkin(node: MuseumNode): MuseumSkin {
  return {
    md5: node.md5,
    name: node.filename.replace(/\.(wsz|zip)$/i, "").replace(/_+/g, " ").trim(),
    screenshotUrl: node.screenshot_url,
    downloadUrl: node.download_url,
    museumUrl: node.museum_url ?? `${MUSEUM_URL}skin/${node.md5}`,
  };
}

export const museum = {
  /** A page of the museum: in its own order without a query, or the skins that match it. NSFW skins are left out. */
  async page(query: string, offset: number, signal?: AbortSignal): Promise<{ skins: MuseumSkin[]; more: boolean; total?: number }> {
    const text = query.trim();
    if (text) {
      const data = await museumQuery<{ search_classic_skins: MuseumNode[] }>(
        `query Search($query: String!, $first: Int!, $offset: Int!) { search_classic_skins(query: $query, first: $first, offset: $offset, nsfw: false) { ${FIELDS} } }`,
        { query: text, first: MUSEUM_PAGE, offset },
        signal,
      );
      const nodes = data.search_classic_skins ?? [];
      return { skins: nodes.filter((n) => !n.nsfw).map(toMuseumSkin), more: nodes.length === MUSEUM_PAGE };
    }
    const data = await museumQuery<{ skins: { count: number; nodes: MuseumNode[] } }>(
      `query Browse($first: Int!, $offset: Int!) { skins(first: $first, offset: $offset, sort: MUSEUM) { count nodes { ${FIELDS} } } }`,
      { first: MUSEUM_PAGE, offset },
      signal,
    );
    const nodes = data.skins.nodes ?? [];
    return { skins: nodes.filter((n) => !n.nsfw).map(toMuseumSkin), more: offset + nodes.length < data.skins.count, total: data.skins.count };
  },

  /** Downloads a skin and saves it in this browser. */
  async save(skin: MuseumSkin): Promise<{ choice: SkinChoice; blob: Blob; kept: boolean }> {
    const response = await fetch(skin.downloadUrl);
    if (!response.ok) throw new Error("museum_unavailable");
    const blob = await response.blob();
    const id = `museum:${skin.md5}`;
    const kept = await savedSkins.save(
      { id, name: skin.name, source: "museum", screenshotUrl: skin.screenshotUrl, museumUrl: skin.museumUrl, addedAt: Date.now() },
      blob,
    );
    return { choice: { kind: "saved", id, name: skin.name }, blob, kept };
  },
};
