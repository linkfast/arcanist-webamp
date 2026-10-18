import { useEffect, useRef, useState } from "react";
import { CloudUpload, History, Upload } from "lucide-react";
import * as api from "../api/arcanist";
import { app, useMyCloud } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { endTrackDrag, startTrackDrag, useTrackDrop } from "../dnd";
import { errorText, language, t, type TextKey } from "../i18n";
import { run, songMenu } from "../menus";
import { openMenu } from "../ui/menu";
import { Button, Spinner, cn } from "../ui/ui";
import { Artwork, LoadMore, Loading } from "./common";

const ON_THE_WAY: api.MyUploadStatus[] = ["PROCESSING", "QUEUED", "UPLOADING"];
const DONE: api.MyUploadStatus[] = ["ADDED", "UPLOADED"];
const NOTICE: api.MyUploadStatus[] = ["NOT_ADDED"];

function size(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${new Intl.NumberFormat(language, {
    maximumFractionDigits: 1,
  }).format(value)} ${units[unit]}`;
}

/**
 * The user's uploads, newest first: files sent into libraries (until their scan catalogues them) and songs sent to
 * their own Ultimate Cloud library, followed while they are on their way. Songs dropped here go to Ultimate Cloud.
 */
export function UploadsWindow({ window: win }: { window: DesktopWindow }) {
  const cloud = useMyCloud();
  const [pages, setPages] = useState<api.MyUploadPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Clearing asks for a second click (for a few seconds).
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  const first = pages?.[0];
  const items = pages?.flatMap((p) => p.items) ?? [];
  const next = pages?.at(-1)?.nextCursor ?? null;

  // The newest page again: often while something is on its way, now and then otherwise.
  const refresh = useRef(async () => {});
  refresh.current = async () => {
    try {
      const page = await api.myUploads(null);
      setPages((current) => [page, ...(current?.slice(1) ?? [])]);
      setError(null);
    } catch (e) {
      setError(errorText((e as { code?: string }).code ?? (e as Error).message));
    }
  };
  useEffect(() => {
    void refresh.current();
  }, [win.props]);
  const active = first?.active ?? 0;
  useEffect(() => {
    const timer = setInterval(() => void refresh.current(), active > 0 ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [active]);

  const more = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await api.myUploads(next);
      setPages((current) => [...(current ?? []), page]);
    } finally {
      setLoadingMore(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    await run(api.clearMyUploads, (count) => {
      setPages(null);
      void refresh.current();
      return t("uploads.cleared", { count });
    });
    setClearing(false);
  };

  const canSend = app.canUploadToCloud;
  const drop = useTrackDrop({
    disabled: !canSend,
    onDrop: (d) =>
      run(
        () => api.uploadToMyCloud(d.tracks.map((x) => x.id)),
        () => {
          void refresh.current();
        }
      ),
  });

  return (
    <Window window={win} title={t("uploads.title")} icon={<History className="size-4" />} width={560} height={540}>
      <div {...drop.props} className={cn("grid min-h-full content-start gap-3 rounded-lg", drop.over && "ring-2 ring-[var(--ring)]")}>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground">
            {first ? t("uploads.count", { count: first.totalCount }) : ""}
            {active > 0 && ` · ${t("uploads.active", { count: active })}`}
          </p>
          <Button
            variant={armed ? "destructive" : "outline"}
            size="sm"
            disabled={clearing || !first || first.totalCount === active}
            onClick={() => {
              if (!armed) return setArmed(true);
              setArmed(false);
              void clear();
            }}
          >
            {clearing && <Spinner />}
            {armed ? t("uploads.clearConfirm") : t("uploads.clear")}
          </Button>
        </div>
        {canSend && cloud && (
          <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <CloudUpload className="size-4 shrink-0" />
            {t("uploads.dropCloud")}
          </p>
        )}
        <Loading error={error} loading={!pages && !error} />
        {pages && items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("uploads.empty")}</p>}
        <ul className="grid gap-0.5">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} />
          ))}
        </ul>
        <LoadMore onMore={next ? () => void more() : null} loading={loadingMore} />
      </div>
    </Window>
  );
}

function UploadRow({ item }: { item: api.MyUpload }) {
  const track = item.track;
  const when = new Date(item.createdAt).toLocaleString(language, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const where =
    item.kind === "ULTIMATE_CLOUD" ? t("uploads.toCloud") : item.libraryName ? t("uploads.toLibrary", { library: item.libraryName }) : null;
  const status = t(`uploads.status.${item.status}` as TextKey);
  // Brought by an extension: named as its app is.
  const source = item.source ? (app.extensionApps.find((a) => a.extensionId === item.source)?.name ?? t("uploads.from", { name: item.source })) : null;
  return (
    <li
      className={cn("group flex items-center gap-3 rounded-md px-2 py-1.5 select-none", track && "hover:bg-accent/50")}
      draggable={track != null}
      onDragStart={(e) => track && startTrackDrag(e, [track])}
      onDragEnd={endTrackDrag}
      onDoubleClick={() => track && app.player.play([track])}
      onContextMenu={(e) => {
        if (track) openMenu(e, songMenu([track]));
        else e.preventDefault();
      }}
    >
      {track ? (
        <Artwork id={track.artworkId} size={36} />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          {item.kind === "ULTIMATE_CLOUD" ? <CloudUpload className="size-4" /> : <Upload className="size-4" />}
        </span>
      )}
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm">{track ? track.title : item.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {[source, where, track && item.kind === "LIBRARY" ? item.name : null, item.size != null ? size(item.size) : null, when].filter(Boolean).join(" · ")}
        </span>
        {item.status === "FAILED" && item.errorCode && (
          <span className="truncate text-xs text-[var(--destructive)]">{errorText(item.errorCode)}</span>
        )}
      </span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
          DONE.includes(item.status) && "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
          NOTICE.includes(item.status) && "border-amber-500/50 text-amber-600 dark:text-amber-400",
          item.status === "FAILED" && "border-[var(--destructive)] text-[var(--destructive)]",
          !DONE.includes(item.status) && !NOTICE.includes(item.status) && item.status !== "FAILED" && "text-muted-foreground"
        )}
        title={item.status === "NOT_ADDED" ? t("uploads.notAddedHelp") : undefined}
      >
        {ON_THE_WAY.includes(item.status) && <Spinner className="size-3" />}
        {status}
      </span>
    </li>
  );
}
