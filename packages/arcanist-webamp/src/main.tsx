import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { serverInfo } from "./api/arcanist";
import { login, loginWithCode, refresh } from "./api/client";
import { app } from "./app";
import { DesktopBackground } from "./desktop/Background";
import { Desktop } from "./desktop/Desktop";
import { ArcanistMark } from "./desktop/Taskbar";
import { errorText, t } from "./i18n";
import { settings } from "./settings";
import { startAura } from "./player/aura";
import { skinFile } from "./skins";
import { MenuHost } from "./ui/menu";
import { LegalTerms, TermsGate, loadTerms, termsAccepted } from "./Terms";
import { Button, Input, Spinner, Toaster } from "./ui/ui";
import { SharedPlaylistPage } from "./windows/JamWindows";

type Stage = "loading" | "setup" | "login" | "terms" | "ready" | "error" | "shared";

let webampRendered = false;

/**
 * A shared link this page was opened with: a playlist's (#/s/<token>). A Jukebox Jam's (#/jam/<code>) goes to the
 * Jam's own client (Arcanist's, or Ultimate Web Player): Webamp only plays Jams.
 */
type SharedLink = { kind: "playlist"; token: string };

function sharedLink(): SharedLink | null {
  const jam = /^#\/jam\/([A-Za-z0-9_-]{8,64})\/?$/.exec(location.hash);
  if (jam) location.replace(`/players/jam/#/jam/${jam[1]}`);
  const match = /^#\/s\/([A-Za-z0-9_-]{8,64})\/?$/.exec(location.hash);
  return match ? { kind: "playlist", token: match[1] } : null;
}

// Another shared link (or leaving one) in the same tab: the page starts again with it.
addEventListener("hashchange", (e) => {
  const before = new URL(e.oldURL).hash;
  const now = sharedLink();
  if (now || /^#\/s\//.test(before)) location.reload();
});

function Root() {
  const [stage, setStage] = useState<Stage>("loading");
  const [link] = useState(sharedLink);
  const [signedIn, setSignedIn] = useState(false);
  const [terms, setTerms] = useState<LegalTerms | null>(null);
  const host = useRef<HTMLDivElement>(null);
  // The player exists before the desktop renders (its taskbar follows Webamp); Webamp itself renders after.
  const start = () => {
    app.start();
    setStage("ready");
  };
  // Signed in: the terms first, until this browser accepted their version (servers without them go straight on).
  const ready = async () => {
    const current = await loadTerms();
    if (current && !termsAccepted(current)) {
      setTerms(current);
      setStage("terms");
    } else start();
  };

  useEffect(() => {
    (async () => {
      try {
        const info = await serverInfo();
        app.setServer(info);
        if (!info.setupCompleted) return setStage("setup");
        // A shared link opens its page, with or without an account (the desktop is not started).
        if (link) {
          setSignedIn(await refresh());
          return setStage("shared");
        }
        if (await refresh()) await ready();
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
    player.attach(node);
    startAura(player);
    void (async () => {
      if (settings.value.skin.kind !== "base") {
        const skin = await skinFile(settings.value.skin).catch(() => null);
        if (skin) player.setSkin(skin);
        else settings.set({ skin: { kind: "base" } });
      }
      await player.webamp.renderWhenReady(node);
      // Eject opens the library (player.ts): its tooltip says so.
      document.querySelector("#webamp #eject")?.setAttribute("title", t("menu.library").replace("…", ""));
    })();
  }, [stage]);

  return (
    <>
      <DesktopBackground />
      <div ref={host} className="absolute inset-x-0 top-0" style={{ pointerEvents: "none", bottom: "var(--taskbar-height)" }} />
      {stage === "ready" && <Desktop />}
      {stage === "shared" && link?.kind === "playlist" && <SharedPlaylistPage token={link.token} signedIn={signedIn} />}
      {stage === "login" && <Login onDone={() => void ready()} />}
      {stage === "terms" && terms && <TermsGate terms={terms} onAccepted={start} />}
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
  // The password was right: a code finishes the sign-in. Passkeys, and pairing a factor, are the panel's.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [mustPair, setMustPair] = useState(false);
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
            if (challenge) await loginWithCode(challenge, code.trim());
            else await login(userName.trim(), password);
            onDone();
          } catch (err) {
            const failure = err as { code?: string; challenge?: string };
            if (failure.code === "second_factor_required" && failure.challenge) setChallenge(failure.challenge);
            else if (failure.code === "second_factor_setup_required") setMustPair(true);
            else {
              if (failure.code === "second_factor_expired") setChallenge(null);
              setError(errorText(failure.code ?? "unknown"));
            }
            setCode("");
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
        {mustPair ? (
          <p className="text-sm">
            {t("login.mustPair")}{" "}
            <a className="underline" href="/admin/login">
              {t("login.panel")}
            </a>
          </p>
        ) : challenge ? (
          <>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("login.code")}
              <Input autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
              <span className="text-xs font-normal text-muted-foreground">{t("login.codeHelp")}</span>
            </label>
            <p className="text-xs text-muted-foreground">
              {t("login.passkey")}{" "}
              <a className="underline" href="/admin/login">
                {t("login.panel")}
              </a>
            </p>
          </>
        ) : (
          <>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("login.userName")}
              <Input autoFocus autoComplete="username" value={userName} onChange={(e) => setUserName(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("login.password")}
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </>
        )}
        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
        {!mustPair && (
          <Button type="submit" disabled={busy || (challenge ? !code.trim() : !userName.trim() || !password)}>
            {busy && <Spinner />}
            {t("login.submit")}
          </Button>
        )}
      </form>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
