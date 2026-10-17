import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type DragEvent as ReactDragEvent } from "react";
import type { TrackDragOutEvent } from "../../webamp/js/types";
import type * as api from "./api/arcanist";
import { t } from "./i18n";

// Dragging songs between windows. From Arcanist's windows it is the browser's drag and drop (which Webamp's
// windows accept too, see ArcanistPlayer); from Webamp's playlist it is Webamp's own mouse drag, which tells when it
// leaves the playlist (onTracksDragOut). Either way, the places that take songs (drop zones) get the same drop.

const TRACKS = "application/x-arcanist-tracks";

/** Entries of an Arcanist playlist being dragged (they move within it instead of being added again). */
export interface DraggedEntries {
  playlistId: string;
  entryIds: string[];
}

/** Songs dropped on a zone, and where. */
export interface TrackDrop {
  tracks: api.Track[];
  entries?: DraggedEntries;
  clientX: number;
  clientY: number;
  /** The element under the pointer: lists find the row there. */
  target: Element;
}

/** Where songs being dragged are, before they are dropped. */
export type TrackDragOver = TrackDrop;

interface Zone {
  accepts: (dragged: { tracks: api.Track[]; entries?: DraggedEntries }) => boolean;
  over: (at: TrackDragOver | null) => void;
  drop: (drop: TrackDrop) => void;
}

// The drag that started in this page: the browser only shows the data on drop, the zones need it before.
let dragged: { tracks: api.Track[]; entries?: DraggedEntries } | null = null;
const zones = new Map<Element, Zone>();

function zoneAt(target: Element | null): { element: Element; zone: Zone } | null {
  for (let element = target; element; element = element.parentElement) {
    const zone = zones.get(element);
    if (zone) return { element, zone };
  }
  return null;
}

function label(tracks: api.Track[]): string {
  return tracks.length === 1 ? tracks[0].title : t("drag.tracks", { count: tracks.length });
}

/** Starts dragging songs (from a row of an Arcanist window). */
export function startTrackDrag(e: ReactDragEvent, tracks: api.Track[], entries?: DraggedEntries): void {
  dragged = { tracks, entries };
  e.dataTransfer.effectAllowed = "all";
  e.dataTransfer.setData(TRACKS, JSON.stringify(tracks.map((x) => x.id)));
  e.dataTransfer.setData("text/plain", tracks.map((x) => `${x.artists.map((a) => a.name).join(", ")} - ${x.title}`).join("\n"));
  // A small label instead of the whole row.
  const image = document.createElement("div");
  image.className = "ui rounded-md bg-[var(--primary)] px-2 py-1 text-xs text-[var(--primary-foreground)]";
  image.style.cssText = "position:fixed;top:-100px;left:-100px;pointer-events:none;white-space:nowrap";
  image.textContent = label(tracks);
  document.body.append(image);
  e.dataTransfer.setDragImage(image, 8, 8);
  setTimeout(() => image.remove());
}

export function endTrackDrag(): void {
  dragged = null;
}

/** The songs being dragged in this page, when the event carries them: what Webamp's windows take when dropped. */
export function draggedTracks(e: { dataTransfer: DataTransfer | null }): api.Track[] | null {
  return dragged && [...(e.dataTransfer?.types ?? [])].includes(TRACKS) ? dragged.tracks : null;
}

/**
 * A place that takes songs: spread `props` on its element. `over` says where they would go while they are over it;
 * `onDrop` gets them.
 */
export function useTrackDrop(options: {
  onDrop: (drop: TrackDrop) => void;
  accepts?: (dragged: { tracks: api.Track[]; entries?: DraggedEntries }) => boolean;
  disabled?: boolean;
}) {
  const [over, setOver] = useState<TrackDragOver | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const element = useRef<Element | null>(null);

  const zone = useRef<Zone>({
    accepts: (d) => !latest.current.disabled && (latest.current.accepts?.(d) ?? true),
    over: setOver,
    drop: (d) => latest.current.onDrop(d),
  });

  const ref = useCallback((node: Element | null) => {
    if (element.current) zones.delete(element.current);
    element.current = node;
    if (node) zones.set(node, zone.current);
  }, []);

  useEffect(
    () => () => {
      if (element.current) zones.delete(element.current);
    },
    []
  );

  const onDragOver = (e: ReactDragEvent) => {
    if (!dragged || !draggedTracks(e) || !zone.current.accepts(dragged)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragged.entries ? "move" : "copy";
    setOver({
      ...dragged,
      clientX: e.clientX,
      clientY: e.clientY,
      target: e.target as Element,
    });
  };
  const onDragLeave = (e: ReactDragEvent) => {
    if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) setOver(null);
  };
  const onDrop = (e: ReactDragEvent) => {
    setOver(null);
    if (!dragged || !draggedTracks(e) || !zone.current.accepts(dragged)) return;
    e.preventDefault();
    e.stopPropagation();
    const drop = {
      ...dragged,
      clientX: e.clientX,
      clientY: e.clientY,
      target: e.target as Element,
    };
    dragged = null;
    latest.current.onDrop(drop);
  };

  return { over, props: { ref, onDragOver, onDragLeave, onDrop } };
}

/**
 * The position to insert at for a drop on a list whose rows carry `data-drop-index`: before or after the row under
 * it, or, between rows, the nearest one.
 */
export function dropIndex(at: Pick<TrackDrop, "target" | "clientY">, count: number): number {
  const row =
    at.target.closest("[data-drop-index]") ??
    [...at.target.querySelectorAll("[data-drop-index]")].find((r) => at.clientY < r.getBoundingClientRect().bottom);
  if (!row) return count;
  const index = Number(row.getAttribute("data-drop-index"));
  const box = row.getBoundingClientRect();
  return at.clientY > box.top + box.height / 2 ? index + 1 : index;
}

// Songs dragged out of Webamp's playlist: a label follows the pointer, and the zone under it gets them on release.

interface Ghost {
  x: number;
  y: number;
  text: string;
  accepted: boolean;
}

let ghost: Ghost | null = null;
let ghostZone: Zone | null = null;
const ghostListeners = new Set<() => void>();

function setGhost(value: Ghost | null): void {
  ghost = value;
  for (const listener of ghostListeners) listener();
}

/** Webamp's playlist drag outside of it, with its tracks as Arcanist's (null for local files, which no zone takes). */
export function webampDragOut(event: TrackDragOutEvent, tracks: api.Track[]): void {
  const target = event.phase === "cancel" ? null : document.elementFromPoint(event.clientX, event.clientY);
  const found = zoneAt(target);
  const payload = { tracks };
  const accepted = found != null && tracks.length > 0 && found.zone.accepts(payload);
  if (ghostZone && ghostZone !== found?.zone) ghostZone.over(null);
  ghostZone = accepted ? found!.zone : null;

  if (event.phase === "move") {
    ghostZone?.over({
      ...payload,
      clientX: event.clientX,
      clientY: event.clientY,
      target: target!,
    });
    setGhost({
      x: event.clientX,
      y: event.clientY,
      text: label(tracks),
      accepted,
    });
    return;
  }
  ghostZone?.over(null);
  if (event.phase === "drop" && accepted)
    found!.zone.drop({
      ...payload,
      clientX: event.clientX,
      clientY: event.clientY,
      target: target!,
    });
  ghostZone = null;
  setGhost(null);
}

/** The label of songs dragged out of Webamp's playlist. */
export function DragGhost() {
  const value = useSyncExternalStore(
    (listener) => {
      ghostListeners.add(listener);
      return () => ghostListeners.delete(listener);
    },
    () => ghost
  );
  if (!value) return null;
  return (
    <div
      className="ui pointer-events-none fixed rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-lg"
      style={{
        left: value.x + 12,
        top: value.y + 12,
        zIndex: 100000,
        background: value.accepted ? "var(--primary)" : "var(--muted)",
        color: value.accepted ? "var(--primary-foreground)" : "var(--muted-foreground)",
      }}
    >
      {value.text}
    </div>
  );
}
