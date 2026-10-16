import { useState } from "react";
import { ArrowLeft, ListMusic, Save } from "lucide-react";
import * as api from "../api/arcanist";
import { app } from "../app";
import { Window, desktopWindows, type DesktopWindow } from "../desktop/windows";
import { errorText, t } from "../i18n";
import { Badge, Button, Checkbox, Input, Spinner, toast } from "../ui/ui";
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
              <li key={playlist.id}>
                <button
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50"
                  onClick={() => (pick ? load(playlist) : setOpen(playlist))}
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
                  {loadingId === playlist.id && <Spinner />}
                </button>
              </li>
            ))}
            {data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</p>}
          </ul>
        </>
      )}
    </Window>
  );
}

function PlaylistView({ playlist, onBack }: { playlist: api.Playlist; onBack: () => void }) {
  const { data, error, loading } = useLoad(() => api.playlistTracks(playlist.id), [playlist.id]);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" aria-label={t("common.back")} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{playlist.name}</h3>
      </div>
      {data && <ListActions tracks={data} />}
      {data ? <TrackList tracks={data} /> : <Loading error={error} loading={loading} />}
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
