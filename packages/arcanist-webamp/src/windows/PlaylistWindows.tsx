import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ListMusic, Save } from "lucide-react";
import * as api from "../api/arcanist";
import { app } from "../app";
import { Window, desktopWindows, type DesktopWindow } from "../desktop/windows";
import { dropIndex, useTrackDrop } from "../dnd";
import { errorText, t } from "../i18n";
import { run } from "../menus";
import { Badge, Button, Checkbox, Input, Spinner, cn, toast } from "../ui/ui";
import { Artwork, ListActions, Loading, TrackList, duration, useLoad } from "./common";

/**
 * The user's playlists (their own, shared with them and public). Opened by Webamp's LOAD LIST, it only picks one:
 * its tracks replace Webamp's list.
 */
export function PlaylistsWindow({ window: win }: { window: DesktopWindow }) {
  const pick = win.props.pick === true;
  const { data, error, loading } = useLoad(() => app.refreshPlaylists(), [win.props]);
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
        <PlaylistView playlist={open} onBack={() => setOpen(null)} />
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
    disabled: pick || playlist.role === "VIEWER",
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
function PlaylistView({ playlist, onBack }: { playlist: api.Playlist; onBack: () => void }) {
  const { data, error, loading, reload } = useLoad(() => api.playlistEntries(playlist.id), [playlist.id]);
  const editable = playlist.role !== "VIEWER";
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

  return (
    <div {...drop.props} className="grid min-h-full content-start gap-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" aria-label={t("common.back")} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{playlist.name}</h3>
      </div>
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
