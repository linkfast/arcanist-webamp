import { useRef, useState } from "react";
import { CircleUser, ExternalLink, LogOut, Upload } from "lucide-react";
import * as api from "../api/arcanist";
import { logout, refresh, session } from "../api/client";
import { app } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { errorText, t } from "../i18n";
import { Button, Select, Spinner, cn } from "../ui/ui";
import { Loading, useLoad } from "./common";

interface UploadItem {
  name: string;
  size: number;
  sent: number;
  status: "waiting" | "sending" | "IMPORTED" | "DUPLICATE" | "failed";
  error?: string;
}

const AUDIO = /\.(mp3|flac|ogg|oga|opus|m4a|mp4|aac|wav|wma|aif|aiff|ape|wv|dsf|dff)$/i;

/** Uploading audio files into a library the user may upload to. */
export function UploadWindow({ window: win }: { window: DesktopWindow }) {
  const { data, error, loading } = useLoad(async () => (await api.libraries()).filter((l) => l.canUpload), []);
  const [libraryId, setLibraryId] = useState<string>("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const target = libraryId || data?.[0]?.id || "";

  const send = async (files: File[]) => {
    const audio = files.filter((f) => AUDIO.test(f.name));
    const start = items.length;
    setItems((list) => [...list, ...audio.map((f) => ({ name: f.name, size: f.size, sent: 0, status: "waiting" as const }))]);
    const update = (i: number, change: Partial<UploadItem>) =>
      setItems((list) => list.map((item, j) => (j === start + i ? { ...item, ...change } : item)));
    for (const [i, file] of audio.entries()) {
      update(i, { status: "sending" });
      const attempt = () => api.upload(target, file, session.token ?? "", (sent) => update(i, { sent }));
      try {
        let result;
        try {
          result = await attempt();
        } catch (e) {
          // An access token that expired during a long batch: once more with a fresh one.
          if ((e as Error).message !== "unauthorized" || !(await refresh())) throw e;
          result = await attempt();
        }
        update(i, { status: result.status, sent: file.size });
      } catch (e) {
        update(i, { status: "failed", error: errorText((e as Error).message) });
      }
    }
  };

  return (
    <Window window={win} title={t("upload.title")} icon={<Upload className="size-4" />} width={520} height={500}>
      <Loading error={error} loading={loading} />
      {data && data.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("upload.none")}</p>}
      {data && data.length > 0 && (
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            {t("upload.library")}
            <Select value={target} onChange={(e) => setLibraryId(e.target.value)}>
              {data.map((library) => (
                <option key={library.id} value={library.id}>
                  {library.name}
                </option>
              ))}
            </Select>
          </label>
          <button
            className={cn(
              "grid place-items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground",
              dragging && "border-[var(--ring)] bg-accent/30",
            )}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void send([...e.dataTransfer.files]);
            }}
          >
            <Upload className="size-6" />
            {t("upload.drop")}
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept="audio/*,.flac,.opus,.ape,.wv,.dsf,.dff"
            className="hidden"
            onChange={(e) => {
              void send([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">{t("upload.help")}</p>
          <ul className="grid gap-1.5">
            {items.map((item, i) => (
              <li key={i} className="grid gap-1 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{item.name}</span>
                  <span className={cn("shrink-0 text-xs", item.status === "failed" ? "text-[var(--destructive)]" : "text-muted-foreground")}>
                    {item.status === "sending" ? (
                      <Spinner className="size-3" />
                    ) : item.status === "IMPORTED" ? (
                      t("upload.imported")
                    ) : item.status === "DUPLICATE" ? (
                      t("upload.duplicate")
                    ) : item.status === "failed" ? (
                      item.error ?? t("upload.failed")
                    ) : (
                      ""
                    )}
                  </span>
                </span>
                <span className="h-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full bg-[var(--primary)]" style={{ width: `${item.size ? (item.sent / item.size) * 100 : 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Window>
  );
}

/** Who is signed in, signing out, the panel, and where the source code is (AGPL §13). */
export function AccountWindow({ window: win }: { window: DesktopWindow }) {
  const user = session.user;
  const server = app.server;
  return (
    <Window window={win} title={t("account.title")} icon={<CircleUser className="size-4" />} width={440} height={380}>
      <div className="grid gap-4 text-sm">
        <p>{t("account.signedIn", { name: user?.displayName || user?.userName || "" })}</p>
        {server && <p className="text-muted-foreground">{t("login.server", { name: server.name, version: server.version })}</p>}
        <div className="flex flex-wrap gap-2">
          {user?.role === "ADMIN" && (
            <Button variant="outline" size="sm" onClick={() => window.open("/admin/", "_blank")}>
              <ExternalLink /> {t("account.panel")}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              await logout();
              location.reload();
            }}
          >
            <LogOut /> {t("account.logout")}
          </Button>
        </div>
        <p className="border-t pt-4 text-xs text-muted-foreground">{t("account.about")}</p>
        {server?.sourceUrl && (
          <a className="text-xs underline" href={server.sourceUrl} target="_blank" rel="noreferrer">
            {t("account.source")}
          </a>
        )}
      </div>
    </Window>
  );
}
