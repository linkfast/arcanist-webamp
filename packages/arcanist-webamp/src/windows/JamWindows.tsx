import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Crown,
  ListMusic,
  ListPlus,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  QrCode as QrCodeIcon,
  Settings2,
  SkipForward,
  Sparkles,
  ThumbsUp,
  Trash2,
  UserMinus,
  Volume2,
} from "lucide-react";
import * as api from "../api/arcanist";
import { artworkUrl } from "../api/client";
import { subscribe } from "../api/live";
import { app } from "../app";
import { Window, desktopWindows, type DesktopWindow } from "../desktop/windows";
import { KINDS } from "../desktop/kinds";
import { hostJam, hostedJam, onHostingChange, stopHosting, whatPlays } from "../jamHost";
import { errorText, t } from "../i18n";
import { QrCode } from "../ui/qr";
import { Badge, Button, Checkbox, Input, Select, Spinner, cn, toast } from "../ui/ui";
import { Artwork, Loading, duration, useLoad } from "./common";

// Jukebox Jams: a live queue several people add songs to (and vote on) while it plays on one player of the host's.
// Webamp is a player a Jam can play on (the host's window); those taking part follow it and add songs in the Jam's
// client, the link's page (Ultimate Web Player, or Arcanist's own), which the window opens.

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

type JamTab = "queue" | "invite" | "settings";

/** A Jam as the one looking sees it: what plays, the queue, inviting, and the host's settings; adding songs is in the Jam's client. */
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
  const [tab, setTab] = useState<JamTab>("queue");

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
  const now_ = jam.nowPlaying;
  const playing = now_.entry?.song ?? now_.external;
  const position = Math.min(
    playing?.durationMs ?? 0,
    now_.positionMs + (!now_.paused && now_.at ? Math.max(0, now - Date.parse(now_.at)) : 0),
  );
  const link = new URL(jam.url, location.origin).href;
  const hostHere = hosted === jam.code;
  const participating = you.participation !== "VISITOR";
  const tabs: JamTab[] = [
    "queue",
    ...(!ended && participating && (jam.allowGuests || you.canControl) ? (["invite"] as const) : []),
    ...(!ended && you.participation === "HOST" ? (["settings"] as const) : []),
  ];
  const shown = tabs.includes(tab) ? tab : "queue";

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
            {jam.allowReplace && ` · ${t("jam.replaceOn")}`}
          </p>
          {you.name && <p className="text-xs text-muted-foreground">{t(`jam.you.${you.participation}` as "jam.you.GUEST", { name: you.name })}</p>}
        </div>
        {participating && !ended && (
          <Button size="sm" onClick={() => window.open(link, "_blank", "noopener")}>
            <ListPlus />
            {t("jam.openClient")}
          </Button>
        )}
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
      {jam.hostGone && !ended && (
        <div className="grid gap-2 rounded-lg border border-amber-500 p-3 text-sm">
          <p>{t(you.participation === "HOST" ? "jam.hostGone.you" : "jam.hostGone", { name: jam.host })}</p>
          <div className="flex flex-wrap gap-2">
            {canHostHere && you.canTakeOver && (
              <Button size="sm" disabled={busy} onClick={() => act(async () => {
                await api.takeOverJukeboxJam(jam.code);
                await hostJam(jam.code);
              })}>
                <Volume2 />
                {t("jam.takeOver")}
              </Button>
            )}
            {you.canManage && you.participation !== "HOST" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(async () => {
                if (confirm(t("jam.endConfirm"))) return api.endJukeboxJam(jam.code);
              })}>
                {t("jam.end")}
              </Button>
            )}
          </div>
        </div>
      )}
      {jam.dj && <DjBanner dj={jam.dj} />}

      {/* What plays now. */}
      <div className="grid gap-2 rounded-xl border bg-[var(--card)] p-3">
        <div className="flex items-center gap-3">
          {playing ? songArtwork(playing, 64) : <span className="grid size-16 place-items-center rounded bg-accent"><Volume2 /></span>}
          <div className="grid min-w-0 flex-1">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{now_.paused && playing ? t("jam.paused") : t("jam.nowPlaying")}</span>
            <span className="truncate font-medium">{playing?.title ?? t("jam.nothingPlaying")}</span>
            {playing && (
              <span className="truncate text-sm text-muted-foreground">
                {playing.artists.join(", ")}
                {playing.album && ` · ${playing.album}`}
              </span>
            )}
            {now_.entry?.suggested && <span className="text-xs text-muted-foreground">{t("jam.suggested")}</span>}
            {now_.entry && (now_.entry.addedByDj ? <span className="text-xs text-fuchsia-400">{t("jam.byDj")}</span> : now_.entry.addedBy && <span className="text-xs text-muted-foreground">{now_.entry.addedByYou ? t("jam.byYou") : t("jam.askedBy", { name: now_.entry.addedBy })}</span>)}
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
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.controlJukeboxJam(jam.code, now_.paused ? "RESUME" : "PAUSE", undefined, undefined, guestToken))}>
              {now_.paused ? <Play /> : <Pause />}
              {now_.paused ? t("jam.resume") : t("jam.pause")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.controlJukeboxJam(jam.code, "SKIP", undefined, undefined, guestToken))}>
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

      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-1 rounded-lg bg-accent/50 p-1">
          {tabs.map((option) => (
            <button
              key={option}
              role="tab"
              aria-selected={shown === option}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                shown === option ? "bg-[var(--card)] font-medium shadow" : "text-muted-foreground hover:text-[var(--foreground)]",
              )}
              onClick={() => setTab(option)}
            >
              {option === "queue" && <ListMusic className="size-4" />}
              {option === "invite" && <QrCodeIcon className="size-4" />}
              {option === "settings" && <Settings2 className="size-4" />}
              <span className="hidden sm:inline">{t(`jam.tab.${option}` as "jam.tab.queue")}</span>
              {option === "queue" && <span className="text-xs tabular-nums text-muted-foreground">{jam.queue.length}</span>}
            </button>
          ))}
        </div>
      )}

      {shown === "queue" && <JamQueue jam={jam} guestToken={guestToken} busy={busy} act={act} />}
      {shown === "invite" && <Invite link={link} jam={jam} onChanged={setJam} />}
      {shown === "settings" && <JamSettings jam={jam} onChanged={setJam} />}
    </div>
  );
}

function JamQueue({
  jam,
  guestToken,
  busy,
  act,
}: {
  jam: api.Jam;
  guestToken: string | null;
  busy: boolean;
  act: (change: () => Promise<api.Jam | void>) => Promise<void>;
}) {
  const you = jam.you;
  const ended = jam.endedAt != null;
  const participating = you.participation !== "VISITOR";
  return (
    <div className="grid content-start gap-4">
      <section className="grid gap-2">
        {jam.dj && <p className="text-xs text-muted-foreground">{t("jam.djChooses")}</p>}
        {jam.voting && participating && !ended && <p className="text-xs text-muted-foreground">{t("jam.canVote")}</p>}
        {jam.queue.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t(jam.suggestions ? "jam.emptyQueueSuggests" : "jam.emptyQueue")}</p>}
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
                  {entry.suggested && <Badge>{t("jam.suggestedBadge")}</Badge>}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {entry.song.artists.join(", ")}
                  {entry.addedBy && ` · ${entry.addedByYou ? t("jam.byYou") : t("jam.askedBy", { name: entry.addedBy })}`}
                  {entry.likedBy && entry.likedBy.length > 0 && ` · ${t("jam.likedBy", { names: entry.likedBy.join(", ") })}`}
                </span>
              </span>
              {jam.voting && (
                <Button
                  size="sm"
                  variant={entry.votedByYou ? "default" : "outline"}
                  className="tabular-nums"
                  disabled={busy || ended || !participating}
                  aria-pressed={entry.votedByYou === true}
                  title={entry.votedByYou ? t("jam.unvote") : t("jam.vote")}
                  onClick={() => act(() => api.voteJukeboxJam(jam.code, entry.id, guestToken))}
                >
                  <ThumbsUp />
                  {entry.votes}
                </Button>
              )}
              {you.canControl && !ended && (
                <>
                  {!jam.voting && !jam.dj && (
                    <>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("jam.moveUp")}
                        title={t("jam.moveUp")}
                        disabled={busy || i === 0}
                        onClick={() => act(() => api.controlJukeboxJam(jam.code, "MOVE", entry.id, i - 1, guestToken))}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("jam.moveDown")}
                        title={t("jam.moveDown")}
                        disabled={busy || i === jam.queue.length - 1}
                        onClick={() => act(() => api.controlJukeboxJam(jam.code, "MOVE", entry.id, i + 1, guestToken))}
                      >
                        <ArrowDown />
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={entry.pinned ? t("jam.unpin") : t("jam.pin")}
                    title={entry.pinned ? t("jam.unpin") : t("jam.pin")}
                    disabled={busy}
                    onClick={() => act(() => api.controlJukeboxJam(jam.code, entry.pinned ? "UNPIN" : "PIN", entry.id, undefined, guestToken))}
                  >
                    {entry.pinned ? <PinOff /> : <Pin />}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("jam.remove")}
                    title={t("jam.remove")}
                    disabled={busy}
                    onClick={() => act(() => api.controlJukeboxJam(jam.code, "REMOVE", entry.id, undefined, guestToken))}
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

function Invite({ link, jam, onChanged }: { link: string; jam: api.Jam; onChanged: (jam: api.Jam) => void }) {
  const hosting = jam.you.participation === "HOST";
  const sharing = useLoad(() => (hosting ? api.sharing().catch(() => null) : Promise.resolve(null)), [hosting]);
  const canOpen = hosting && !jam.allowGuests && sharing.data?.jamGuests === true && sharing.data.canShareLinks;
  return (
    <div className="grid gap-3 rounded-xl border p-3">
      <p className="text-sm">{jam.allowGuests ? t("jam.inviteGuests") : t("jam.inviteUsers")}</p>
      {canOpen && (
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                onChanged(await api.updateJukeboxJam(jam.code, { allowGuests: true }));
              } catch (e) {
                toast(errorText((e as { code?: string }).code ?? "unknown"), true);
              }
            }}
          >
            {t("jam.openToGuests")}
          </Button>
        </div>
      )}
      <div className="grid justify-items-center gap-2">
        <QrCode text={link} className="size-56 p-2" />
        <div className="flex w-full items-center gap-2">
          <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{link}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              toast(t("jam.linkCopied"));
            }}
          >
            <Copy />
            {t("jam.copyLink")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The host's settings of a Jam: name, voting, guests and whether anyone may change the song playing. */
function JamSettings({ jam, onChanged }: { jam: api.Jam; onChanged: (jam: api.Jam) => void }) {
  const [name, setName] = useState(jam.name);
  const [busy, setBusy] = useState(false);
  const sharing = useLoad(() => api.sharing().catch(() => null), []);
  const guestsAllowed = jam.allowGuests || (sharing.data?.jamGuests === true && sharing.data.canShareLinks);

  const update = async (input: Parameters<typeof api.updateJukeboxJam>[1]) => {
    setBusy(true);
    try {
      onChanged(await api.updateJukeboxJam(jam.code, input));
      toast(t("jam.settings.saved"));
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid content-start gap-3 rounded-xl border p-3">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== jam.name) void update({ name: name.trim() });
        }}
      >
        <label className="grid flex-1 gap-1.5 text-sm font-medium">
          {t("jam.name")}
          <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button type="submit" variant="outline" disabled={busy || !name.trim() || name.trim() === jam.name}>
          {t("jam.settings.rename")}
        </Button>
      </form>
      <Checkbox checked={jam.voting} onChange={(voting) => void update({ voting })} label={t("jam.votingLabel")} />
      {guestsAllowed && <Checkbox checked={jam.allowGuests} onChange={(allowGuests) => void update({ allowGuests })} label={t("jam.guestsLabel")} />}
      {api.jamReplaceAvailable() && (
        <Checkbox checked={jam.allowReplace === true} onChange={(allowReplace) => void update({ allowReplace })} label={t("jam.replaceLabel")} />
      )}
      {api.jamSharedAvailable() && (
        <Checkbox checked={jam.suggestions === true} onChange={(suggestions) => void update({ suggestions })} label={t("jam.suggestionsLabel")} />
      )}
      {api.jamSaveOptionAvailable() && (
        <Checkbox checked={jam.saveAsPlaylist === false} onChange={(remove) => void update({ saveAsPlaylist: !remove })} label={t("jam.deleteLabel")} />
      )}
    </div>
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
  const [busy, setBusy] = useState(false);

  /** One tap: a Jam here, from what plays, with what most Jams want; its settings are there to change later. */
  const startNow = async () => {
    setBusy(true);
    try {
      const jam = await api.startJukeboxJam({
        name: t("jam.defaultName"),
        playsOn: "CLIENT",
        rendererId: null,
        voting: false,
        allowGuests: false,
        guestLibraryIds: app.libraryId ? [app.libraryId] : null,
        ...(api.jamReplaceAvailable() ? { allowReplace: true } : {}),
        ...(api.jamSharedAvailable() ? { queueTrackIds: whatPlays() } : {}),
      });
      await hostJam(jam.code, jam);
      void app.refreshPlaylists();
      reload();
      onOpen(jam.code);
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(false);
    }
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => void startNow()}>
            {busy ? <Spinner /> : <Plus />}
            {t("jam.start")}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setStarting(true)}>
            {t("jam.moreOptions")}
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
  const [voting, setVoting] = useState(false);
  const [guests, setGuests] = useState(false);
  const [replace, setReplace] = useState(true);
  const [suggestions, setSuggestions] = useState(true);
  // Untouched (null), the server's choice: it comes ticked as the server says and is not sent.
  const [remove, setRemove] = useState<boolean | null>(null);
  const removeDefault = useLoad(() => api.jamDeletesPlaylist(), []);
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
        ...(api.jamReplaceAvailable() ? { allowReplace: replace } : {}),
        ...(api.jamSaveOptionAvailable() && remove !== null ? { saveAsPlaylist: !remove } : {}),
        ...(api.jamSharedAvailable() ? { suggestions, ...(playsOn === "CLIENT" ? { queueTrackIds: whatPlays() } : {}) } : {}),
      });
      // Started to play here: this tab hosts it.
      if (playsOn === "CLIENT") await hostJam(jam.code, jam);
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
      {api.jamReplaceAvailable() && <Checkbox checked={replace} onChange={setReplace} label={t("jam.replaceLabel")} />}
      {api.jamSharedAvailable() && <Checkbox checked={suggestions} onChange={setSuggestions} label={t("jam.suggestionsLabel")} />}
      {api.jamSaveOptionAvailable() && (
        <Checkbox checked={remove ?? removeDefault.data ?? false} onChange={setRemove} label={t("jam.deleteLabel")} />
      )}
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
