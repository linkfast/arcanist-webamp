import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Link2, ListMusic, Pencil, Save, Share2, Trash2, X } from "lucide-react";
import * as api from "../api/arcanist";
import { session } from "../api/client";
import { subscribe } from "../api/live";
import { QrCode } from "../ui/qr";
import { app } from "../app";
import { Window, desktopWindows, type DesktopWindow } from "../desktop/windows";
import { dropIndex, useTrackDrop } from "../dnd";
import { errorText, t } from "../i18n";
import { run } from "../menus";
import { Badge, Button, Checkbox, Input, Select, Spinner, cn, toast } from "../ui/ui";
import { Artwork, ListActions, Loading, TrackList, duration, useLoad } from "./common";

/**
 * The user's playlists (their own, shared with them and public). Opened by Webamp's LOAD LIST, it only picks one:
 * its tracks replace Webamp's list.
 */
export function PlaylistsWindow({ window: win }: { window: DesktopWindow }) {
  const pick = win.props.pick === true;
  const { data, error, loading, reload } = useLoad(() => app.refreshPlaylists(), [win.props]);
  // Shared with the user, renamed, or changed by someone else: the list follows.
  useEffect(() => {
    if (!app.server?.features.includes("PLAYLIST_SHARING")) return;
    let timer: number | null = null;
    return subscribe(`subscription { playlistChanged { playlistId deleted } }`, {}, () => {
      if (timer != null) clearTimeout(timer);
      timer = window.setTimeout(reload, 300);
    });
  }, [reload]);
  const [open, setOpen] = useState<api.Playlist | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Opened on a playlist (from the library's home): show it.
  const wanted = win.props.playlistId as string | undefined;
  useEffect(() => {
    if (wanted && data) setOpen(data.find((p) => p.id === wanted) ?? null);
  }, [wanted, data]);

  const load = async (playlist: api.Playlist) => {
    setLoadingId(playlist.id);
    try {
      const tracks = await api.playlistTracks(playlist.id);
      app.resolveLoad(tracks);
      desktopWindows.close(win.id);
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Window window={win} title={pick ? t("playlists.pick") : t("playlists.title")} icon={<ListMusic className="size-4" />} width={560} height={520}>
      {open && !pick ? (
        <PlaylistView
          playlist={open}
          onBack={() => {
            setOpen(null);
            reload();
          }}
          onChanged={(changed) => {
            setOpen(changed);
            void app.refreshPlaylists();
          }}
        />
      ) : (
        <>
          <Loading error={error} loading={loading && !data} />
          <ul className="grid gap-1">
            {(data ?? []).map((playlist) => (
              <PlaylistItem
                key={playlist.id}
                playlist={playlist}
                pick={pick}
                loading={loadingId === playlist.id}
                onOpen={() => (pick ? load(playlist) : setOpen(playlist))}
              />
            ))}
            {data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</p>}
          </ul>
        </>
      )}
    </Window>
  );
}

/** A playlist of the list: opens it, and takes songs dropped on it (at its end) when the user can edit it. */
function PlaylistItem({ playlist, pick, loading, onOpen }: { playlist: api.Playlist; pick: boolean; loading: boolean; onOpen: () => void }) {
  const drop = useTrackDrop({
    disabled: pick || playlist.role === "VIEWER" || playlist.type === "JUKEBOX_JAM",
    accepts: (d) => d.entries?.playlistId !== playlist.id,
    onDrop: (d) =>
      run(
        () => api.addToPlaylist(playlist.id, d.tracks.map((x) => x.id)),
        (changed) => {
          void app.refreshPlaylists();
          return t("playlists.added", { name: changed.name });
        },
      ),
  });
  return (
    <li {...drop.props}>
      <button
        className={cn(
          "flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50",
          drop.over && "bg-accent ring-2 ring-[var(--ring)]",
        )}
        onClick={onOpen}
      >
        <Artwork id={playlist.artworkIds[0]} size={44} />
        <span className="grid min-w-0 flex-1">
          <span className="flex items-center gap-2 truncate text-sm font-medium">
            {playlist.name}
            {playlist.isPublic && <Badge>{t("playlists.public")}</Badge>}
            {playlist.type === "JUKEBOX_JAM" && <Badge>{t("icon.jukeboxJam")}</Badge>}
            {playlist.link && <Link2 className="size-3.5 text-muted-foreground" aria-label={t("playlists.hasLink")} />}
            {(playlist.members?.length ?? 0) > 0 && playlist.role === "OWNER" && <Badge>{t("playlists.sharedWith", { count: playlist.members!.length })}</Badge>}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {t("playlists.tracks", { count: playlist.trackCount })} · {duration(playlist.durationMs)}
            {playlist.role !== "OWNER" && ` · ${t("playlists.by", { name: playlist.owner.name })}`}
          </span>
        </span>
        {loading && <Spinner />}
      </button>
    </li>
  );
}

/**
 * An open playlist. Its owner and collaborators drop songs where they want them (from the library, other windows
 * or Webamp's playlist), drag its songs to reorder them, and remove them from the menu.
 */
function PlaylistView({ playlist, onBack, onChanged }: { playlist: api.Playlist; onBack: () => void; onChanged: (playlist: api.Playlist) => void }) {
  const { data, error, loading, reload } = useLoad(() => api.playlistEntries(playlist.id), [playlist.id]);
  // A Jam's queue changes through the Jam.
  const editable = playlist.role !== "VIEWER" && playlist.type !== "JUKEBOX_JAM";
  const tracks = useMemo(() => data?.map((e) => e.track) ?? [], [data]);
  const changed = () => {
    reload();
    void app.refreshPlaylists();
  };

  const drop = useTrackDrop({
    disabled: !editable || !data,
    onDrop: (d) => {
      const entries = data!;
      const index = dropIndex(d, entries.length);
      // Positions count the whole playlist (songs the user cannot play keep theirs).
      const position = index < entries.length ? entries[index].position : (entries.at(-1)?.position ?? -1) + 1;
      if (d.entries?.playlistId === playlist.id) {
        const moving = new Set(d.entries.entryIds);
        const before = entries.filter((e) => moving.has(e.id) && e.position < position).length;
        void run(() => api.movePlaylistEntries(playlist.id, d.entries!.entryIds, position - before), changed);
      } else {
        void run(
          () => api.insertIntoPlaylist(playlist.id, d.tracks.map((x) => x.id), index < entries.length ? position : null),
          (result) => {
            changed();
            return t("playlists.added", { name: result.name });
          },
        );
      }
    },
  });

  const [panel, setPanel] = useState<"edit" | "share" | null>(null);
  const manages = playlist.role === "OWNER" || playlist.role === "MANAGER";
  const sharingOn = app.server?.features.includes("PLAYLIST_SHARING") ?? false;

  return (
    <div {...drop.props} className="grid min-h-full content-start gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" aria-label={t("common.back")} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{playlist.name}</h3>
        {playlist.role !== "OWNER" && <Badge>{t(`playlists.role.${playlist.role}` as "playlists.role.VIEWER")}</Badge>}
        {manages && sharingOn && playlist.type !== "JUKEBOX_JAM" && (
          <>
            <Button variant="outline" size="sm" onClick={() => setPanel(panel === "edit" ? null : "edit")}>
              <Pencil />
              {t("playlists.edit")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPanel(panel === "share" ? null : "share")}>
              <Share2 />
              {t("playlists.share")}
            </Button>
          </>
        )}
      </div>
      {panel === "edit" && <EditPlaylist playlist={playlist} onDone={(p) => (p ? onChanged(p) : onBack())} />}
      {panel === "share" && <SharePlaylist playlist={playlist} onChanged={onChanged} />}
      {playlist.jukeboxJamCode && (
        <Button variant="secondary" className="justify-self-start" onClick={() => desktopWindows.open("jukeboxJam", { code: playlist.jukeboxJamCode })}>
          {t("playlists.openJam")}
        </Button>
      )}
      {data && <ListActions tracks={tracks} />}
      {data ? (
        <TrackList
          tracks={tracks}
          empty={editable ? t("playlists.dropHere") : undefined}
          entries={editable ? { playlistId: playlist.id, ids: data.map((e) => e.id) } : undefined}
          insertAt={drop.over ? dropIndex(drop.over, data.length) : null}
          extraMenu={
            editable
              ? (indexes) => [
                  { type: "separator" },
                  {
                    label: t("playlists.removeEntries"),
                    onClick: () => run(() => api.removePlaylistEntries(playlist.id, indexes.map((i) => data[i].id)), changed),
                  },
                ]
              : undefined
          }
        />
      ) : (
        <Loading error={error} loading={loading} />
      )}
    </div>
  );
}

/** Renaming, describing and making public a playlist (its owner and managers); deleting it (its owner). */
function EditPlaylist({ playlist, onDone }: { playlist: api.Playlist; onDone: (playlist: api.Playlist | null) => void }) {
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description ?? "");
  const [isPublic, setIsPublic] = useState(playlist.isPublic);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      onDone(await api.updatePlaylist(playlist.id, name.trim(), description.trim() || null, isPublic));
      toast(t("playlists.updated"));
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(t("playlists.deleteConfirm", { name: playlist.name }))) return;
    try {
      await api.deletePlaylist(playlist.id);
      void app.refreshPlaylists();
      toast(t("playlists.deleted", { name: playlist.name }));
      onDone(null);
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    }
  };
  return (
    <form
      className="grid gap-3 rounded-xl border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void save();
      }}
    >
      <label className="grid gap-1.5 text-sm font-medium">
        {t("playlists.name")}
        <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {t("playlists.description")}
        <textarea
          className="min-h-16 rounded-md border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <Checkbox checked={isPublic} onChange={setIsPublic} label={t("playlists.makePublic")} />
      <div className="flex flex-wrap justify-end gap-2">
        {playlist.role === "OWNER" && (
          <Button variant="ghost" className="mr-auto text-[var(--destructive)]" onClick={remove}>
            <Trash2 />
            {t("playlists.delete")}
          </Button>
        )}
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy && <Spinner />}
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

const ROLES: api.ShareRole[] = ["LISTEN", "EDIT", "MANAGE"];

/** Who the playlist is shared with and what each can do, and its public link (with a QR code). */
function SharePlaylist({ playlist, onChanged }: { playlist: api.Playlist; onChanged: (playlist: api.Playlist) => void }) {
  const users = useLoad(() => api.shareableUsers(), []);
  const sharing = useLoad(() => api.sharing().catch(() => null), []);
  const [members, setMembers] = useState<api.PlaylistMember[]>(playlist.members ?? []);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(false);
  const me = session.user?.id;
  const available = (users.data ?? []).filter((u) => u.id !== playlist.owner.id && u.id !== me && !members.some((m) => m.user.id === u.id));
  const dirty = JSON.stringify(members.map((m) => [m.user.id, m.role])) !== JSON.stringify((playlist.members ?? []).map((m) => [m.user.id, m.role]));
  const link = playlist.link ? new URL(playlist.link.url, location.origin).href : null;

  const change = async (call: () => Promise<api.Playlist>) => {
    setBusy(true);
    try {
      const updated = await call();
      setMembers(updated.members ?? []);
      onChanged(updated);
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 rounded-xl border p-3">
      <section className="grid gap-2">
        <h4 className="text-sm font-semibold">{t("playlists.members")}</h4>
        <p className="text-xs text-muted-foreground">{t("playlists.membersHelp")}</p>
        {members.length === 0 && <p className="text-sm text-muted-foreground">{t("playlists.noMembers")}</p>}
        {members.map((member) => (
          <div key={member.user.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{member.user.name}</span>
            <Select
              className="h-8 w-40"
              value={member.role}
              onChange={(e) => setMembers((list) => list.map((m) => (m.user.id === member.user.id ? { ...m, role: e.target.value as api.ShareRole } : m)))}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`playlists.shareRole.${role}` as "playlists.shareRole.LISTEN")}
                </option>
              ))}
            </Select>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("playlists.removeMember")}
              title={t("playlists.removeMember")}
              onClick={() => setMembers((list) => list.filter((m) => m.user.id !== member.user.id))}
            >
              <X />
            </Button>
          </div>
        ))}
        {available.length > 0 && (
          <div className="flex gap-2">
            <Select className="h-8" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">{t("playlists.addMember")}</option>
              {available.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!adding}
              onClick={() => {
                const user = available.find((u) => u.id === adding);
                if (user) setMembers((list) => [...list, { user, role: "LISTEN" }]);
                setAdding("");
              }}
            >
              {t("playlists.add")}
            </Button>
          </div>
        )}
        {dirty && (
          <Button
            className="justify-self-end"
            size="sm"
            disabled={busy}
            onClick={() => change(() => api.setPlaylistMembers(playlist.id, members.map((m) => ({ userId: m.user.id, role: m.role }))))}
          >
            {busy && <Spinner />}
            {t("playlists.saveSharing")}
          </Button>
        )}
      </section>

      <section className="grid gap-2">
        <h4 className="text-sm font-semibold">{t("playlists.publicLink")}</h4>
        {!sharing.data?.publicLinks ? (
          <p className="text-xs text-muted-foreground">{t("playlists.linksOff")}</p>
        ) : !sharing.data.canShareLinks ? (
          <p className="text-xs text-muted-foreground">{t("playlists.linksNotAllowed")}</p>
        ) : link ? (
          <>
            <p className="text-xs text-muted-foreground">{t("playlists.linkHelp")}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-accent/50 px-2 py-1 text-xs">{link}</code>
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
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setQr((s) => !s)}>
                {qr ? t("common.close") : t("jam.showQr")}
              </Button>
              <Button size="sm" variant="ghost" className="text-[var(--destructive)]" disabled={busy} onClick={() => change(() => api.revokePlaylistLink(playlist.id))}>
                {t("playlists.revokeLink")}
              </Button>
            </div>
            {qr && <QrCode text={link} className="size-48 justify-self-center p-2" />}
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t("playlists.linkHelp")}</p>
            <Button size="sm" className="justify-self-start" disabled={busy} onClick={() => change(() => api.createPlaylistLink(playlist.id))}>
              <Link2 />
              {t("playlists.createLink")}
            </Button>
          </>
        )}
      </section>
    </div>
  );
}

/** Webamp's SAVE LIST (or "new playlist" from a song's menu): a new Arcanist playlist with those songs. */
export function SavePlaylistWindow({ window: win }: { window: DesktopWindow }) {
  const tracks = (win.props.tracks as api.Track[]) ?? [];
  const others = Number(win.props.others ?? 0);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const playlist = await api.createPlaylist(name.trim(), isPublic, tracks.map((x) => x.id));
      void app.refreshPlaylists();
      toast(t("playlists.saved", { name: playlist.name }));
      desktopWindows.close(win.id);
    } catch (e) {
      toast(errorText((e as { code?: string }).code ?? "unknown"), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      window={win}
      title={t("playlists.saveTitle")}
      icon={<Save className="size-4" />}
      width={460}
      height={360}
      footer={
        <>
          <Button variant="ghost" onClick={() => desktopWindows.close(win.id)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !name.trim() || tracks.length === 0} onClick={save}>
            {busy && <Spinner />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void save();
        }}
      >
        <label className="grid gap-1.5 text-sm font-medium">
          {t("playlists.name")}
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        <Checkbox checked={isPublic} onChange={setIsPublic} label={t("playlists.makePublic")} />
        <p className="text-sm text-muted-foreground">{t("playlists.tracks", { count: tracks.length })}</p>
        {others > 0 && <p className="text-sm text-amber-400">{t("playlists.skipped", { count: others })}</p>}
      </form>
    </Window>
  );
}
