import { useEffect, useState } from "react";
import { Gift, Plus, Trash2 } from "lucide-react";
import * as api from "../api/arcanist";
import { Window, type DesktopWindow } from "../desktop/windows";
import { errorText, t } from "../i18n";
import { Button, Input, cn } from "../ui/ui";
import { Loading, TrackList, useLoad } from "./common";

/**
 * The user's wish list: songs they want, recognised by the server as soon as one enters a library they can play,
 * and those that arrived (playable from here). Opening it counts what arrived as seen.
 */
export function WishesWindow({ window: win }: { window: DesktopWindow }) {
  const { data, error, loading, reload } = useLoad(() => api.wishList(), [win.props]);
  const [items, setItems] = useState<api.Wish[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setItems(data.items);
    if (data.unseen > 0) void api.markWishesSeen().catch(() => {});
  }, [data]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const wish = await api.addWish({ title: title.trim(), artist: artist.trim(), album: album.trim() || null });
      setItems((list) => [wish, ...list]);
      setTitle("");
      setArtist("");
      setAlbum("");
      setProblem(wish.status === "OBTAINED" ? t("wishes.alreadyThere") : null);
    } catch (e) {
      setProblem(errorText((e as { code?: string }).code ?? (e as Error).message));
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
  const tracks = obtained.map((w) => w.track).filter((x): x is api.Track => x != null);

  return (
    <Window window={win} title={t("wishes.title")} icon={<Gift className="size-4" />} width={620} height={560}>
      <div className="grid gap-5">
        <p className="text-sm text-muted-foreground">{t("wishes.help")}</p>
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={add}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("wishes.songTitle")} aria-label={t("wishes.songTitle")} required />
          <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder={t("wishes.artist")} aria-label={t("wishes.artist")} required />
          <Input value={album} onChange={(e) => setAlbum(e.target.value)} placeholder={t("wishes.album")} aria-label={t("wishes.album")} />
          <Button type="submit" size="sm" className="h-9" disabled={busy || !title.trim() || !artist.trim()}>
            <Plus /> {t("wishes.add")}
          </Button>
        </form>
        {problem && <p className="text-sm text-muted-foreground">{problem}</p>}
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
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{wish.title}</span>
                    <span className="text-muted-foreground"> · {wish.artist}</span>
                    {wish.album && <span className="text-muted-foreground"> · {wish.album}</span>}
                  </span>
                  <Button variant="ghost" size="icon-sm" title={t("wishes.remove")} aria-label={t("wishes.remove")} onClick={() => void remove(wish)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && obtained.length > 0 && (
          <section className="grid gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("wishes.obtained")}</h3>
            {tracks.length > 0 && <TrackList tracks={tracks} />}
            <ul className="grid gap-1">
              {obtained
                .filter((w) => !w.track)
                .map((wish) => (
                  <li key={wish.id} className={cn("flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground")}>
                    <span className="min-w-0 flex-1 truncate">
                      {wish.title} · {wish.artist} · {t("wishes.gone")}
                    </span>
                    <Button variant="ghost" size="icon-sm" title={t("wishes.remove")} aria-label={t("wishes.remove")} onClick={() => void remove(wish)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </Window>
  );
}
