import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  Copy,
  Crown,
  ListPlus,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  Search,
  SkipForward,
  Sparkles,
  ThumbsUp,
  Trash2,
  UserMinus,
  Volume2,
  X,
} from "lucide-react";
import * as api from "../api/arcanist";
import { subscribe } from "../api/live";
import { app } from "../app";
import { Window, desktopWindows, type DesktopWindow } from "../desktop/windows";
import { KINDS } from "../desktop/kinds";
import { hostJam, hostedJam, onHostingChange, stopHosting } from "../jamHost";
import { errorText, t } from "../i18n";
import { QrCode } from "../ui/qr";
import { Badge, Button, Checkbox, Input, Select, Spinner, cn, toast } from "../ui/ui";
import { Artwork, Loading, duration, useLoad } from "./common";

// Jukebox Jams: a live queue several people add songs to (and vote on) while it plays on one player of the host's.
// The same view serves the host's window, a member's and a guest's page (#/jam/<code>), each seeing what they can do.

const GUEST_KEY = "arcanist.jamGuest.";

/** The guest token this browser keeps for a Jam. */
export function guestTokenOf(code: string): string | null {
  try {
    return localStorage.getItem(GUEST_KEY + code);
  } catch {
    return null;
  }
}

function keepGuestToken(code: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(GUEST_KEY + code, token);
    else localStorage.removeItem(GUEST_KEY + code);
  } catch {
    // Without storage the guest joins again after a reload.
  }
}

/** Now, every second (countdowns, the progress of what plays). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Whether this tab plays a Jam, and which. */
function useHosted(): string | null {
  return useSyncExternalStore(onHostingChange, hostedJam);
}

/** A Jam, read again whenever it changes (its subscription) and every 20 seconds besides. */
function useJam(code: string, guestToken: string | null, onRemoved?: () => void) {
  const [jam, setJam] = useState<api.Jam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const reload = useCallback(async () => {
    try {
      setJam(await api.jukeboxJam(code, guestToken));
      setError(null);
    } catch (e) {
      const errorCode = (e as { code?: string }).code ?? "unknown";
      if (errorCode === "jam_guest_removed" || errorCode === "unauthorized") onRemoved?.();
      setError(errorText(errorCode));
    }
  }, [code, guestToken, onRemoved]);

  useEffect(() => {
    void reload();
    const soon = () => {
      if (timer.current != null) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void reload(), 150);
    };
    const stop = subscribe(`subscription($c: String!) { jukeboxJamChanged(code: $c) { kind } }`, { c: code }, soon);
    const every = setInterval(() => void reload(), 20_000);
    return () => {
      stop();
      clearInterval(every);
      if (timer.current != null) clearTimeout(timer.current);
    };
  }, [code, reload]);

  return { jam, setJam, error, reload };
}

/** «A session with Ultimate's AI DJ»: shown to everyone while the host's DJ chooses what plays. */
export function DjBanner({ dj }: { dj: NonNullable<api.Jam["dj"]> }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-violet-700 via-fuchsia-700 to-amber-600 p-3 text-white shadow-lg">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-black/30 ring-1 ring-white/30">
          <Sparkles className="size-5" />
        </span>
        <div className="grid min-w-0">
          <span className="text-[10px] font-black tracking-[0.3em] opacity-90">ULTIMATE AI DJ</span>
          <span className="truncate text-sm font-semibold">{dj.name ? t("jam.djSessionNamed", { name: dj.name }) : t("jam.djSession")}</span>
          {dj.message && <span className="truncate text-xs opacity-90">“{dj.message}”</span>}
        </div>
      </div>
    </div>
  );
}

function songArtwork(song: api.JamSong, size: number) {
  return song.artworkUrl ? (
    <img src={song.artworkUrl} alt="" className="shrink-0 rounded object-cover" style={{ width: size, height: size }} />
  ) : (
    <Artwork id={song.artworkId} size={size} />
  );
}

/** A Jam as the one looking sees it: what plays, the queue, adding and voting, and the host's controls. */
export function JamPanel({
  code,
  guestToken,
  onLeft,
  canHostHere = false,
}: {
  code: string;
  guestToken: string | null;
  onLeft?: () => void;
  canHostHere?: boolean;
}) {
  const removed = useCallback(() => {
    keepGuestToken(code, null);
    onLeft?.();
  }, [code, onLeft]);
  const { jam, setJam, error, reload } = useJam(code, guestToken, removed);
  const hosted = useHosted();
  const now = useNow();
  const [busy, setBusy] = useState(false);

  const act = async (change: () => Promise<api.Jam | void>) => {
    setBusy(true);
    try {
      const updated = await change();
      if (updated) setJam(updated);
      else await reload();
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(false);
    }
  };

  if (!jam) return <Loading error={error} loading={!error} />;
  const you = jam.you;
  const ended = jam.endedAt != null;
  const nextVote = you.nextVoteAt ? Math.max(0, Math.ceil((Date.parse(you.nextVoteAt) - now) / 1000)) : 0;
  const now_ = jam.nowPlaying;
  const playing = now_.entry?.song ?? now_.external;
  const position = Math.min(
    playing?.durationMs ?? 0,
    now_.positionMs + (!now_.paused && now_.at ? Math.max(0, now - Date.parse(now_.at)) : 0),
  );
  const link = new URL(jam.url, location.origin).href;
  const hostHere = hosted === jam.code;
  const participating = you.participation !== "VISITOR";

  return (
    <div className="grid content-start gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="truncate text-lg font-semibold">{jam.name}</h2>
          <p className="text-xs text-muted-foreground">
            {t("jam.hostedBy", { name: jam.host })} · {t(`jam.playsOn.${jam.playsOn}` as "jam.playsOn.CLIENT")}
            {jam.hostClient && ` · ${jam.hostClient.name ?? jam.hostClient.kind}`}
            {jam.playsOn === "CLIENT" && jam.hostClient && !jam.hostClient.online && ` · ${t("jam.hostOffline")}`}
            {jam.voting && ` · ${t("jam.voting")}`}
          </p>
          {you.name && <p className="text-xs text-muted-foreground">{t(`jam.you.${you.participation}` as "jam.you.GUEST", { name: you.name })}</p>}
        </div>
        {you.participation === "HOST" && !ended && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => act(async () => {
            if (!confirm(t("jam.endConfirm"))) return;
            if (hostHere) stopHosting();
            return api.endJukeboxJam(jam.code);
          })}>
            {t("jam.end")}
          </Button>
        )}
      </div>

      {ended && <p className="rounded-lg border p-3 text-sm">{t("jam.ended")}</p>}
      {jam.dj && <DjBanner dj={jam.dj} />}

      {/* What plays now. */}
      <div className="grid gap-2 rounded-xl border bg-[var(--card)] p-3">
        <div className="flex items-center gap-3">
          {playing ? songArtwork(playing, 56) : <span className="grid size-14 place-items-center rounded bg-accent"><Volume2 /></span>}
          <div className="grid min-w-0 flex-1">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{now_.paused && playing ? t("jam.paused") : t("jam.nowPlaying")}</span>
            <span className="truncate font-medium">{playing?.title ?? t("jam.nothingPlaying")}</span>
            {playing && <span className="truncate text-sm text-muted-foreground">{playing.artists.join(", ")}</span>}
            {now_.entry && (now_.entry.addedByDj ? <span className="text-xs text-fuchsia-400">{t("jam.byDj")}</span> : now_.entry.addedBy && <span className="text-xs text-muted-foreground">{t("jam.askedBy", { name: now_.entry.addedBy })}</span>)}
          </div>
        </div>
        {playing && playing.durationMs > 0 && (
          <div className="grid gap-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-accent">
              <div className="h-full bg-[var(--primary)] transition-[width]" style={{ width: `${(position / playing.durationMs) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>{duration(position)}</span>
              <span>{duration(playing.durationMs)}</span>
            </div>
          </div>
        )}
        {you.canControl && !ended && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.controlJukeboxJam(jam.code, now_.paused ? "RESUME" : "PAUSE"))}>
              {now_.paused ? <Play /> : <Pause />}
              {now_.paused ? t("jam.resume") : t("jam.pause")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.controlJukeboxJam(jam.code, "SKIP"))}>
              <SkipForward />
              {t("jam.skip")}
            </Button>
            {canHostHere && you.participation === "HOST" && jam.playsOn === "CLIENT" && (
              hostHere ? (
                <Button size="sm" variant="secondary" onClick={() => stopHosting()}>
                  {t("jam.stopHere")}
                </Button>
              ) : (
                <Button size="sm" onClick={() => act(async () => { await hostJam(jam.code); })}>
                  <Volume2 />
                  {t("jam.playHere")}
                </Button>
              )
            )}
          </div>
        )}
      </div>

      {/* Inviting: the link and its QR code. */}
      {!ended && participating && (jam.allowGuests || you.canControl) && <Invite link={link} guests={jam.allowGuests} />}

      {/* Adding songs. */}
      {!ended && participating && <AddSongs jam={jam} guestToken={guestToken} onAdded={setJam} />}

      {/* The queue. */}
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">
          {t("jam.queue")} <span className="font-normal text-muted-foreground">({jam.queue.length})</span>
        </h3>
        {jam.dj && <p className="text-xs text-muted-foreground">{t("jam.djChooses")}</p>}
        {jam.voting && participating && !ended && (
          <p className="text-xs text-muted-foreground">{nextVote > 0 ? t("jam.nextVote", { seconds: nextVote }) : t("jam.canVote")}</p>
        )}
        {jam.queue.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t("jam.emptyQueue")}</p>}
        <ol className="grid gap-1">
          {jam.queue.map((entry, i) => (
            <li key={entry.id} className={cn("flex items-center gap-3 rounded-lg p-2", entry.pinned && "bg-accent/60")}>
              <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              {songArtwork(entry.song, 40)}
              <span className="grid min-w-0 flex-1">
                <span className="flex items-center gap-2 truncate text-sm font-medium">
                  {entry.song.title}
                  {entry.pinned && <Badge>{t("jam.pinned")}</Badge>}
                  {entry.addedByDj && <Badge className="border-fuchsia-500 text-fuchsia-400">{t("jam.djBadge")}</Badge>}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {entry.song.artists.join(", ")}
                  {entry.addedBy && ` · ${entry.addedByYou ? t("jam.byYou") : t("jam.askedBy", { name: entry.addedBy })}`}
                </span>
              </span>
              {jam.voting && (
                <Button
                  size="sm"
                  variant="outline"
                  className="tabular-nums"
                  disabled={busy || ended || !participating || nextVote > 0}
                  title={nextVote > 0 ? t("jam.nextVote", { seconds: nextVote }) : t("jam.vote")}
                  onClick={() => act(() => api.voteJukeboxJam(jam.code, entry.id, guestToken))}
                >
                  <ThumbsUp />
                  {entry.votes}
                </Button>
              )}
              {you.canControl && !ended && (
                <>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={entry.pinned ? t("jam.unpin") : t("jam.pin")}
                    title={entry.pinned ? t("jam.unpin") : t("jam.pin")}
                    disabled={busy}
                    onClick={() => act(() => api.controlJukeboxJam(jam.code, entry.pinned ? "UNPIN" : "PIN", entry.id))}
                  >
                    {entry.pinned ? <PinOff /> : <Pin />}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("jam.remove")}
                    title={t("jam.remove")}
                    disabled={busy}
                    onClick={() => act(() => api.controlJukeboxJam(jam.code, "REMOVE", entry.id))}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      {jam.played.length > 0 && (
        <section className="grid gap-1">
          <h3 className="text-sm font-semibold">{t("jam.played")}</h3>
          {jam.played.slice(0, 8).map((entry) => (
            <p key={entry.id} className="truncate text-xs text-muted-foreground">
              {entry.song.title} — {entry.song.artists.join(", ")}
            </p>
          ))}
        </section>
      )}

      {jam.guests && jam.guests.length > 0 && (
        <section className="grid gap-1">
          <h3 className="text-sm font-semibold">{t("jam.guests")}</h3>
          {jam.guests.map((guest) => (
            <div key={guest.id} className="flex items-center gap-2 text-sm">
              <span className={cn("min-w-0 flex-1 truncate", guest.removed && "line-through text-muted-foreground")}>
                {guest.name} <span className="text-xs text-muted-foreground">· {t("jam.guestSongs", { count: guest.songsAdded })}</span>
              </span>
              {!guest.removed && !ended && (
                <Button size="icon-sm" variant="ghost" aria-label={t("jam.removeGuest")} title={t("jam.removeGuest")} disabled={busy}
                  onClick={() => act(() => api.removeJukeboxJamGuest(jam.code, guest.id))}>
                  <UserMinus />
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Invite({ link, guests }: { link: string; guests: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm">{guests ? t("jam.inviteGuests") : t("jam.inviteUsers")}</span>
        <Button size="sm" variant="outline" onClick={() => setShown((s) => !s)}>
          {shown ? t("common.close") : t("jam.showQr")}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("jam.copyLink")}
          title={t("jam.copyLink")}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            toast(t("jam.linkCopied"));
          }}
        >
          <Copy />
        </Button>
      </div>
      {shown && (
        <div className="grid justify-items-center gap-2">
          <QrCode text={link} className="size-56 p-2" />
          <code className="text-xs break-all text-muted-foreground">{link}</code>
        </div>
      )}
    </div>
  );
}

function AddSongs({ jam, guestToken, onAdded }: { jam: api.Jam; guestToken: string | null; onAdded: (jam: api.Jam) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ song: api.JamSong; inQueue: boolean }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setResults(await api.jukeboxJamSearch(jam.code, q, guestToken));
      } catch (e) {
        toast(errorText((e as { code?: string }).code ?? "unknown"), true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, jam.code, guestToken]);

  const add = async (trackId: string) => {
    setBusy(trackId);
    try {
      const updated = await api.addToJukeboxJam(jam.code, [trackId], guestToken);
      onAdded(updated);
      setResults((r) => r?.map((x) => (x.song.trackId === trackId ? { ...x, inQueue: true } : x)) ?? null);
      toast(t("jam.added"));
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="grid gap-2">
      <label className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder={t("jam.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button className="absolute top-2.5 right-3 text-muted-foreground" aria-label={t("common.close")} onClick={() => setQuery("")}>
            <X className="size-4" />
          </button>
        )}
      </label>
      {jam.you.addsLeft != null && <p className="text-xs text-muted-foreground">{t("jam.addsLeft", { count: jam.you.addsLeft })}</p>}
      {results && (
        <ul className="grid max-h-72 gap-1 overflow-auto rounded-lg border p-1">
          {results.length === 0 && <li className="p-3 text-center text-sm text-muted-foreground">{t("common.empty")}</li>}
          {results.map(({ song, inQueue }) => (
            <li key={song.trackId} className="flex items-center gap-3 rounded-md p-1.5 hover:bg-accent/40">
              {songArtwork(song, 36)}
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm">{song.title}</span>
                <span className="truncate text-xs text-muted-foreground">{song.artists.join(", ")}</span>
              </span>
              <Button size="sm" variant={inQueue ? "ghost" : "outline"} disabled={inQueue || busy != null} onClick={() => add(song.trackId!)}>
                {busy === song.trackId ? <Spinner /> : <Plus />}
                {inQueue ? t("jam.inQueue") : t("jam.add")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The Jukebox Jam window: the user's Jams, starting one, or one of them. */
export function JukeboxJamWindow({ window: win }: { window: DesktopWindow }) {
  const [code, setCode] = useState<string | null>((win.props.code as string | undefined) ?? null);
  useEffect(() => {
    if (win.props.code) setCode(win.props.code as string);
  }, [win.props.code]);

  return (
    <Window window={win} title={t("jam.title")} icon={KINDS.jukeboxJam.glyph("size-4")} width={560} height={640}>
      {code ? (
        <div className="grid gap-3">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setCode(null)}>
              <ArrowLeft />
              {t("jam.mine")}
            </Button>
          </div>
          <JamPanel code={code} guestToken={null} canHostHere onLeft={() => setCode(null)} />
        </div>
      ) : (
        <JamList onOpen={setCode} />
      )}
    </Window>
  );
}

function JamList({ onOpen }: { onOpen: (code: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => api.myJukeboxJams(), []);
  const [starting, setStarting] = useState(false);
  return (
    <div className="grid content-start gap-4">
      <p className="text-sm text-muted-foreground">{t("jam.intro")}</p>
      {starting ? (
        <StartJam
          onCancel={() => setStarting(false)}
          onStarted={(code) => {
            setStarting(false);
            reload();
            onOpen(code);
          }}
        />
      ) : (
        <div>
          <Button onClick={() => setStarting(true)}>
            <Plus />
            {t("jam.start")}
          </Button>
        </div>
      )}
      <Loading error={error} loading={loading && !data} />
      <ul className="grid gap-1">
        {(data ?? []).map((jam) => (
          <li key={jam.code}>
            <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50" onClick={() => onOpen(jam.code)}>
              <span className="grid size-10 place-items-center rounded-lg bg-purple-700 text-white">
                {jam.hosting ? <Crown className="size-5" /> : <ListPlus className="size-5" />}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{jam.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {jam.hosting ? t("jam.youHost") : t("jam.hostedBy", { name: jam.host })} · {t("jam.waiting", { count: jam.waiting })}
                </span>
              </span>
            </button>
          </li>
        ))}
        {data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t("jam.none")}</p>}
      </ul>
    </div>
  );
}

function StartJam({ onCancel, onStarted }: { onCancel: () => void; onStarted: (code: string) => void }) {
  const [name, setName] = useState(t("jam.defaultName"));
  const [where, setWhere] = useState("CLIENT");
  const [voting, setVoting] = useState(true);
  const [guests, setGuests] = useState(false);
  const [busy, setBusy] = useState(false);
  const renderers = useLoad(() => api.dlnaRenderers().catch(() => []), []);
  const sharing = useLoad(() => api.sharing().catch(() => null), []);
  const guestsAllowed = sharing.data?.jamGuests === true && sharing.data.canShareLinks;

  const start = async () => {
    setBusy(true);
    try {
      const playsOn: api.JamPlaysOn = where === "CLIENT" ? "CLIENT" : where === "server" ? "SERVER" : "DLNA";
      const jam = await api.startJukeboxJam({
        name: name.trim(),
        playsOn,
        rendererId: playsOn === "DLNA" ? where : null,
        voting,
        allowGuests: guests && guestsAllowed,
        guestLibraryIds: app.libraryId ? [app.libraryId] : null,
      });
      // Started to play here: this tab hosts it.
      if (playsOn === "CLIENT") await hostJam(jam.code);
      void app.refreshPlaylists();
      onStarted(jam.code);
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-3 rounded-xl border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void start();
      }}
    >
      <label className="grid gap-1.5 text-sm font-medium">
        {t("jam.name")}
        <Input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {t("jam.where")}
        <Select value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="CLIENT">{t("jam.whereHere")}</option>
          {(renderers.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.id === "server" ? t("jam.whereServer", { name: r.name }) : r.name}
            </option>
          ))}
        </Select>
      </label>
      <Checkbox checked={voting} onChange={setVoting} label={t("jam.votingLabel")} />
      {guestsAllowed && <Checkbox checked={guests} onChange={setGuests} label={t("jam.guestsLabel")} />}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy && <Spinner />}
          {t("jam.startButton")}
        </Button>
      </div>
    </form>
  );
}

/** The page of a Jam's link (#/jam/<code>): a member with their account, or a guest by name. */
export function JamPage({ code, signedIn }: { code: string; signedIn: boolean }) {
  const [token, setToken] = useState<string | null>(() => (signedIn ? null : guestTokenOf(code)));
  const [joined, setJoined] = useState(signedIn ? false : token != null);
  const [visitor, setVisitor] = useState<api.Jam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (signedIn) {
      api
        .joinJukeboxJam(code, null)
        .then(() => setJoined(true))
        .catch((e) => setError(errorText((e as { code?: string }).code ?? "unknown")));
    } else if (!joined) {
      api
        .jukeboxJam(code, null)
        .then(setVisitor)
        .catch((e) => setError(errorText((e as { code?: string }).code ?? "unknown")));
    }
  }, [code, signedIn, joined]);

  const join = async () => {
    setBusy(true);
    try {
      const session = await api.joinJukeboxJam(code, name.trim());
      if (session) {
        keepGuestToken(code, session.token);
        setToken(session.token);
      }
      setJoined(true);
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicFrame>
      {error ? (
        <p className="py-10 text-center text-sm text-[var(--destructive)]">{error}</p>
      ) : joined ? (
        <JamPanel
          code={code}
          guestToken={token}
          onLeft={() => {
            setToken(null);
            setJoined(false);
          }}
        />
      ) : visitor ? (
        <div className="grid gap-4">
          <div className="grid gap-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("jam.title")}</p>
            <h1 className="text-xl font-semibold">{visitor.name}</h1>
            <p className="text-sm text-muted-foreground">{t("jam.hostedBy", { name: visitor.host })}</p>
          </div>
          {visitor.dj && <DjBanner dj={visitor.dj} />}
          <form
            className="grid gap-3 rounded-xl border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void join();
            }}
          >
            <p className="text-sm">{t("jam.joinIntro")}</p>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("jam.yourName")}
              <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </label>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Spinner />}
              {t("jam.join")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("jam.guestNote")}</p>
          </form>
        </div>
      ) : (
        <Loading error={null} loading />
      )}
    </PublicFrame>
  );
}

/** A page outside the desktop (a shared link), readable on a phone. */
export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui absolute inset-0 overflow-auto">
      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-6 sm:py-10">
        <div className="rounded-2xl border bg-[var(--card)]/95 p-4 shadow-2xl backdrop-blur sm:p-6">{children}</div>
        <p className="text-center text-xs text-muted-foreground">
          {app.server?.name ?? "Arcanist"} · Arcanist
        </p>
      </main>
    </div>
  );
}

/** A playlist's public link (#/s/<token>): its songs with 30-second previews, or whole for those who can play them. */
export function SharedPlaylistPage({ token, signedIn }: { token: string; signedIn: boolean }) {
  const { data, error, loading } = useLoad(() => api.sharedPlaylist(token, null, signedIn), [token, signedIn]);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const play = (entry: api.SharedPlaylistEntry) => {
    const element = audio.current;
    if (!element) return;
    if (playing === entry.id) {
      element.pause();
      setPlaying(null);
      return;
    }
    const url = entry.track?.streamUrl ?? entry.previewUrl;
    if (!url) return;
    element.src = new URL(url, location.origin).href;
    void element.play();
    setPlaying(entry.id);
  };

  const covers = useMemo(() => data?.artworkIds.slice(0, 4) ?? [], [data]);

  return (
    <PublicFrame>
      <audio ref={audio} onEnded={() => setPlaying(null)} />
      {!data ? (
        <Loading error={error} loading={loading} />
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <div className="grid size-24 shrink-0 grid-cols-2 overflow-hidden rounded-lg bg-accent">
              {covers.length >= 4 ? covers.map((id) => <Artwork key={id} id={id} size={48} className="rounded-none" />) : <Artwork id={covers[0]} size={96} className="col-span-2 row-span-2" />}
            </div>
            <div className="grid min-w-0 gap-1">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("shared.playlist")}</p>
              <h1 className="truncate text-xl font-semibold">{data.name}</h1>
              <p className="text-sm text-muted-foreground">
                {t("playlists.by", { name: data.owner })} · {t("playlists.tracks", { count: data.trackCount })} · {duration(data.durationMs)}
              </p>
            </div>
          </div>
          {data.description && <p className="text-sm whitespace-pre-line">{data.description}</p>}
          <p className="text-xs text-muted-foreground">{signedIn ? t("shared.signedInNote") : t("shared.previewNote")}</p>
          <div className="flex flex-wrap gap-2">
            {signedIn ? (
              <>
                <Button
                  disabled={saved}
                  onClick={async () => {
                    try {
                      await api.copySharedPlaylist(token, null);
                      setSaved(true);
                      toast(t("shared.saved"));
                    } catch (e) {
                      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
                    }
                  }}
                >
                  <ListPlus />
                  {saved ? t("shared.savedButton") : t("shared.save")}
                </Button>
                <Button variant="outline" onClick={() => location.assign(location.pathname)}>
                  {t("shared.openPlayer")}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => location.assign(location.pathname)}>
                {t("shared.signIn")}
              </Button>
            )}
          </div>
          <ol className="grid gap-1">
            {data.entries.items.map((entry, i) => {
              const playable = entry.track != null || entry.previewUrl != null;
              return (
                <li key={entry.id} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-accent/40">
                  <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <Artwork id={entry.artworkId} size={40} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">{entry.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.artists.join(", ")}
                      {entry.album && ` · ${entry.album}`}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{duration(entry.durationMs)}</span>
                  <Button
                    size="icon-sm"
                    variant={playing === entry.id ? "default" : "outline"}
                    disabled={!playable}
                    aria-label={entry.track ? t("common.play") : t("shared.preview")}
                    title={entry.track ? t("common.play") : t("shared.preview")}
                    onClick={() => play(entry)}
                  >
                    {playing === entry.id ? <Pause /> : <Play />}
                  </Button>
                  {!entry.track && entry.previewUrl && <span className="w-8 text-[10px] text-muted-foreground">30 s</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </PublicFrame>
  );
}

/** Opens the Jukebox Jam window on a Jam. */
export function openJam(code: string): void {
  desktopWindows.open("jukeboxJam", { code });
}

/** Whether the server has Jukebox Jams. */
export function hasJams(): boolean {
  return app.server?.features.includes("JUKEBOX_JAM") ?? false;
}
