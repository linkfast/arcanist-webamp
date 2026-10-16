import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { serverInfo } from "./api/arcanist";
import { login, refresh } from "./api/client";
import { app } from "./app";
import { DesktopBackground } from "./desktop/Background";
import { Desktop } from "./desktop/Desktop";
import { ArcanistMark } from "./desktop/Taskbar";
import { errorText, t } from "./i18n";
import { settings, skinStore } from "./settings";
import { MenuHost } from "./ui/menu";
import { Button, Input, Spinner, Toaster } from "./ui/ui";

type Stage = "loading" | "setup" | "login" | "ready" | "error";

let webampRendered = false;

function Root() {
  const [stage, setStage] = useState<Stage>("loading");
  const host = useRef<HTMLDivElement>(null);
  // The player exists before the desktop renders (its taskbar follows Webamp); Webamp itself renders after.
  const ready = () => {
    app.start();
    setStage("ready");
  };

  useEffect(() => {
    (async () => {
      try {
        const info = await serverInfo();
        app.setServer(info);
        if (!info.setupCompleted) return setStage("setup");
        if (await refresh()) ready();
        else setStage("login");
      } catch {
        setStage("error");
      }
    })();
  }, []);

  // Webamp lives outside React's tree: it renders once, into the desktop (above the taskbar), with the skin the
  // user loaded last.
  useEffect(() => {
    if (stage !== "ready" || webampRendered || !host.current) return;
    webampRendered = true;
    const node = host.current;
    const player = app.start();
    void (async () => {
      if (settings.value.skin.kind === "custom") {
        const skin = await skinStore.load();
        if (skin) player.setSkin(skin);
        else settings.set({ skin: { kind: "base" } });
      }
      await player.webamp.renderWhenReady(node);
    })();
  }, [stage]);

  return (
    <>
      <DesktopBackground />
      <div ref={host} className="absolute inset-x-0 top-0" style={{ pointerEvents: "none", bottom: "var(--taskbar-height)" }} />
      {stage === "ready" && <Desktop />}
      {stage === "login" && <Login onDone={ready} />}
      {(stage === "loading" || stage === "setup" || stage === "error") && (
        <div className="ui absolute inset-0 grid place-items-center">
          <div className="grid justify-items-center gap-3 rounded-xl border bg-[var(--card)] p-6 text-sm shadow-xl">
            {stage === "loading" && (
              <p className="flex items-center gap-2">
                <Spinner /> {t("app.loading")}
              </p>
            )}
            {stage === "setup" && (
              <>
                <p>{t("app.setup")}</p>
                <Button onClick={() => location.assign(new URL("/admin/setup", location.origin).href)}>{t("app.setupLink")}</Button>
              </>
            )}
            {stage === "error" && <p>{errorText("server_error")}</p>}
          </div>
        </div>
      )}
      <MenuHost />
      <Toaster />
    </>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const server = app.server;

  return (
    <div className="ui absolute inset-0 grid place-items-center p-4">
      <form
        className="grid w-full max-w-sm gap-4 rounded-xl border bg-[var(--card)] p-6 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await login(userName.trim(), password);
            onDone();
          } catch (err) {
            setError(errorText((err as { code?: string }).code ?? "unknown"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-1">
          <ArcanistMark className="mb-2 size-10" />
          <h1 className="text-lg font-semibold">{t("login.title")}</h1>
          {server && <p className="text-xs text-muted-foreground">{t("login.server", { name: server.name, version: server.version })}</p>}
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          {t("login.userName")}
          <Input autoFocus autoComplete="username" value={userName} onChange={(e) => setUserName(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          {t("login.password")}
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
        <Button type="submit" disabled={busy || !userName.trim() || !password}>
          {busy && <Spinner />}
          {t("login.submit")}
        </Button>
      </form>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
