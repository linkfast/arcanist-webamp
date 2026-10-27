import { useEffect, useState } from "react";
import { ExternalLink, Gift, Link2, Plus, Trash2, X } from "lucide-react";
import * as api from "../api/arcanist";
import { artworkUrl, session } from "../api/client";
import { app } from "../app";
import { Window, type DesktopWindow } from "../desktop/windows";
import { errorText, t } from "../i18n";
import { Button, Checkbox, Input, cn } from "../ui/ui";
import { Loading, TrackList, useLoad } from "./common";

/** The services' own names (brands are not translated). */
const serviceNames: Record<api.WishLinkService, string | null> = {
  SPOTIFY: "Spotify",
  YOU_TUBE_MUSIC: "YouTube Music",
  YOU_TUBE: "YouTube",
  DEEZER: "Deezer",
  APPLE_MUSIC: "Apple Music",
  MUSIC_BRAINZ: "MusicBrainz",
  TIDAL: "TIDAL",
  SOUND_CLOUD: "SoundCloud",
  BANDCAMP: "Bandcamp",
  AMAZON_MUSIC: "Amazon Music",
  OTHER: null,
};

const serviceName = (service: api.WishLinkService | null) => (service && serviceNames[service]) ?? t("wishes.otherPage");

/** A wish's cover, or an empty square. */
function Cover({ id, size = "size-10" }: { id: string | null; size?: string }) {
  return id ? (
    <img src={artworkUrl(id, 128)} alt="" loading="lazy" className={cn(size, "shrink-0 rounded object-cover")} />
  ) : (
    <div className={cn(size, "shrink-0 rounded bg-muted")} aria-hidden="true" />
  );
}

/** Links to the song's page on its service and on MusicBrainz, opened in new tabs. */
function WishLinks({ wish }: { wish: api.Wish }) {
  if (!wish.sourceUrl && !wish.musicBrainzRecordingId) return null;
  return (
    <span className="flex flex-wrap gap-x-3 text-xs">
      {wish.sourceUrl && (
        <a className="inline-flex items-center gap-1 underline" href={wish.sourceUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3" /> {t("wishes.openIn", { service: serviceName(wish.sourceService) })}
        </a>
      )}
      {wish.musicBrainzRecordingId && wish.sourceService !== "MUSIC_BRAINZ" && (
        <a
          className="inline-flex items-center gap-1 underline"
          href={`https://musicbrainz.org/recording/${wish.musicBrainzRecordingId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="size-3" /> MusicBrainz
        </a>
      )}
    </span>
  );
}

/**
 * The user's wish list: songs they want, recognised by the server as soon as one enters a library they can play,
 * and those that arrived (playable from here). A song starts from a streaming service's link (it fills itself in,
 * with its cover) or is typed in. With VIEW_ALL_WISHES, everyone's wishes too. Opening it counts what arrived as seen.
 */
export function WishesWindow({ window: win }: { window: DesktopWindow }) {
  const canSeeAll = session.can("VIEW_ALL_WISHES");
  const [scope, setScope] = useState<"MINE" | "ALL">("MINE");
  const { data, error, loading, reload } = useLoad(() => api.wishList(undefined, scope), [win.props, scope]);
  const [items, setItems] = useState<api.Wish[]>([]);
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<api.WishLinkPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Where it goes when uploaded for the wish ("" = automatic), and the choices. */
  const [target, setTarget] = useState("");
  const [wantsVideo, setWantsVideo] = useState(false);
  const videos = app.server?.features.includes("MUSIC_VIDEOS") ?? false;
  const [targets, setTargets] = useState<api.Library[]>([]);
  const [allLibraries, setAllLibraries] = useState<api.Library[]>([]);
  const [automatic, setAutomatic] = useState<string | null>(null);
  /** A wish just added that a library had already: shown with where it is. */
  const [found, setFound] = useState<api.Wish | null>(null);
  const mine = scope === "MINE";

  useEffect(() => {
    void Promise.all([api.libraries(), api.uploadSettings()])
      .then(([libraries, settings]) => {
        setAllLibraries(libraries);
        setTargets(libraries.filter((l) => l.canUpload));
        setAutomatic(settings.defaultLibraryName);
      })
      .catch(() => {});
  }, []);

  const libraryNames = (ids: string[]) =>
    ids.map((id) => allLibraries.find((l) => l.id === id)?.name).filter(Boolean).join(", ");
  const quality = (file: NonNullable<api.Wish["track"]>["files"][number]) =>
    [file.format, file.bitDepth ? `${file.bitDepth} bit` : null, file.sampleRate ? `${file.sampleRate / 1000} kHz` : null,
      file.bitDepth ? null : file.bitRate ? `${file.bitRate} kbit/s` : null].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!data) return;
    setItems(data.items);
    if (mine && data.unseen > 0) void api.markWishesSeen().catch(() => {});
  }, [data, mine]);

  const fail = (e: unknown) => setProblem(errorText((e as { code?: string }).code ?? (e as Error).message));

  const read = async (e: React.FormEvent) => {
    e.preventDefault();
    setReading(true);
    setProblem(null);
    try {
      const found = await api.resolveWishLink(link.trim());
      setPreview(found);
      setTitle(found.title);
      setArtist(found.artist);
      setAlbum(found.album ?? "");
    } catch (e) {
      fail(e);
    } finally {
      setReading(false);
    }
  };

  const clearLink = () => {
    setPreview(null);
    setLink("");
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const wish = await api.addWish({
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim() || null,
        durationMs: preview?.durationMs ?? null,
        musicBrainzRecordingId: preview?.musicBrainzRecordingId ?? null,
        sourceUrl: preview?.url ?? null,
        artworkId: preview?.artworkId ?? null,
        targetLibraryId: target || null,
        ...(videos ? { wantsVideo } : {}),
      });
      setWantsVideo(false);
      setItems((list) => [wish, ...list]);
      setTitle("");
      setArtist("");
      setAlbum("");
      clearLink();
      if (wish.status === "OBTAINED" && wish.track) setFound(wish);
      else setProblem(wish.status === "OBTAINED" ? t("wishes.alreadyThere") : null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (wish: api.Wish) => {
    setItems((list) => list.filter((w) => w.id !== wish.id));
    try {
      await api.removeWish(wish.id);
    } catch {
      reload();
    }
  };

  const wanted = items.filter((w) => w.status === "WANTED");
  const obtained = items.filter((w) => w.status === "OBTAINED");
  const tracks: api.Track[] = obtained.flatMap((w) => (w.track ? [w.track] : []));
  const owner = (wish: api.Wish) =>
    wish.owner ? t("wishes.wantedBy", { name: wish.owner.displayName || wish.owner.userName }) : null;

  return (
    <Window window={win} title={t("wishes.title")} icon={<Gift className="size-4" />} width={660} height={600}>
      <div className="grid gap-5">
        {canSeeAll && (
          <div className="flex gap-1" role="tablist">
            {(["MINE", "ALL"] as const).map((value) => (
              <Button
                key={value}
                role="tab"
                aria-selected={scope === value}
                size="sm"
                variant={scope === value ? "secondary" : "ghost"}
                onClick={() => setScope(value)}
              >
                {t(value === "MINE" ? "wishes.mine" : "wishes.all")}
              </Button>
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground">{t(mine ? "wishes.help" : "wishes.allHelp")}</p>

        {mine && (
          <div className="grid gap-3">
            <form className="flex gap-2" onSubmit={read}>
              <Input
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={t("wishes.link")}
                aria-label={t("wishes.link")}
                className="min-w-0 flex-1"
              />
              <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={reading || !link.trim()}>
                <Link2 /> {t(reading ? "wishes.reading" : "wishes.read")}
              </Button>
            </form>
            {preview ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-2 text-sm">
                <Cover id={preview.artworkId} size="size-14" />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">{preview.title}</span>
                  <span className="truncate text-muted-foreground">
                    {preview.artist}
                    {preview.album && ` · ${preview.album}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("wishes.readFrom", { service: serviceName(preview.service) })}{" "}
                    <a className="underline" href={preview.url} target="_blank" rel="noopener noreferrer">
                      {t("wishes.openIn", { service: serviceName(preview.service) })}
                    </a>
                  </span>
                </div>
                <Button variant="ghost" size="icon-sm" title={t("wishes.clearLink")} aria-label={t("wishes.clearLink")} onClick={clearLink}>
                  <X />
                </Button>
              </div>
            ) : (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("wishes.manual")}</p>
            )}
            <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={add}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("wishes.songTitle")} aria-label={t("wishes.songTitle")} required />
              <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder={t("wishes.artist")} aria-label={t("wishes.artist")} required />
              <Input value={album} onChange={(e) => setAlbum(e.target.value)} placeholder={t("wishes.album")} aria-label={t("wishes.album")} />
              <Button type="submit" size="sm" className="h-9" disabled={busy || !title.trim() || !artist.trim()}>
                <Plus /> {t("wishes.add")}
              </Button>
              {videos && (
                <div className="text-xs sm:col-span-4">
                  <Checkbox checked={wantsVideo} onChange={setWantsVideo} label={t("wishes.wantsVideo")} />
                </div>
              )}
              {targets.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-4">
                  {t("wishes.target")}
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">{automatic ? t("wishes.targetAutomaticNamed", { library: automatic }) : t("wishes.targetAutomatic")}</option>
                    {targets.map((library) => (
                      <option key={library.id} value={library.id}>
                        {library.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </form>
          </div>
        )}
        {problem && <p className="text-sm text-muted-foreground">{problem}</p>}
        {found?.track && (
          <div className="grid gap-1 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{t("wishes.foundTitle")}</span>
              <Button variant="ghost" size="icon-sm" title={t("wishes.clearLink")} aria-label={t("wishes.clearLink")} onClick={() => setFound(null)}>
                <X />
              </Button>
            </div>
            <span>
              {found.track.title} · {found.track.artists.map((a) => a.name).join(", ")} · {found.track.album.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("wishes.where", { libraries: libraryNames(found.track.libraryIds) })}
              {found.track.files[0] && ` · ${quality(found.track.files[0])}`}
            </span>
          </div>
        )}
        {!data && <Loading error={error} loading={loading} />}

        {data && (
          <section className="grid gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("wishes.wanted")} ({wanted.length})
            </h3>
            {wanted.length === 0 && <p className="text-sm text-muted-foreground">{t("wishes.noneWanted")}</p>}
            <ul className="grid gap-1">
              {wanted.map((wish) => (
                <li key={wish.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50">
                  <Cover id={wish.artworkId} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate">
                      <span className="font-medium">{wish.title}</span>
                      <span className="text-muted-foreground"> · {wish.artist}</span>
                      {wish.album && <span className="text-muted-foreground"> · {wish.album}</span>}
                    </span>
                    {owner(wish) && <span className="text-xs text-muted-foreground">{owner(wish)}</span>}
                    {wish.targetLibraryId && (
                      <span className="text-xs text-muted-foreground">{t("wishes.goesTo", { library: libraryNames([wish.targetLibraryId]) })}</span>
                    )}
                    <WishLinks wish={wish} />
                  </span>
                  {mine && (
                    <Button variant="ghost" size="icon-sm" title={t("wishes.remove")} aria-label={t("wishes.remove")} onClick={() => void remove(wish)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && obtained.length > 0 && (
          <section className="grid gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("wishes.obtained")}</h3>
            {mine && tracks.length > 0 && <TrackList tracks={tracks} />}
            {obtained.some((w) => w.wantsVideo) && (
              <ul className="grid gap-0.5 text-xs">
                {obtained
                  .filter((w) => w.wantsVideo)
                  .map((wish) => (
                    <li key={wish.id} className="px-2 text-muted-foreground">
                      {wish.title} · {t(wish.videoObtainedAt ? "wishes.videoArrived" : "wishes.videoMissing")}
                    </li>
                  ))}
              </ul>
            )}
            <ul className="grid gap-1">
              {obtained
                .filter((w) => !mine || !w.track)
                .map((wish) => (
                  <li key={wish.id} className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                    <Cover id={wish.artworkId} size="size-8" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate">
                        {wish.title} · {wish.artist}
                        {!wish.track && ` · ${t("wishes.gone")}`}
                      </span>
                      {owner(wish) && <span className="text-xs">{owner(wish)}</span>}
                    </span>
                    {mine && (
                      <Button variant="ghost" size="icon-sm" title={t("wishes.remove")} aria-label={t("wishes.remove")} onClick={() => void remove(wish)}>
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </Window>
  );
}
