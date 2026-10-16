import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

// The skins that come with the player: the .wsz files of skins/ (each with a screenshot of the same name, .png or
// .jpg, when there is one), published at skins/ next to the player with the index.json the Skins window reads.
// skins/skins.json may give a skin its name and effects ("oled"); the skins it names come first, in its order. It
// may also suggest skins of the Winamp Skin Museum ("museum:<md5>"): listed, but downloaded from the museum when
// chosen, so they are not redistributed with the player.

const folder = resolve(__dirname, "skins");

export type BundledSkinEntry =
  | { file: string; name: string; screenshot?: string; effects?: string[] }
  | { museum: string; name: string };

type Metadata = Record<string, { name?: string; effects?: string[] }>;

function metadata(): Metadata {
  const path = join(folder, "skins.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Metadata) : {};
}

function entries(): BundledSkinEntry[] {
  if (!existsSync(folder)) return [];
  const files = readdirSync(folder);
  const base = (file: string) => file.slice(0, file.lastIndexOf("."));
  const meta = metadata();
  const order = Object.keys(meta);
  const rank = (file: string) => (order.includes(file) ? order.indexOf(file) : order.length);
  const suggested = order
    .filter((key) => /^museum:[0-9a-f]{32}$/.test(key))
    .map((key) => ({ museum: key.slice(7), name: meta[key].name ?? key.slice(7) }));
  const bundled = files
    .filter((f) => /\.wsz$/i.test(f))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((file) => {
      const screenshot = files.find((f) => /\.(png|jpe?g)$/i.test(f) && base(f) === base(file));
      const { name, effects } = meta[file] ?? {};
      return {
        file,
        name: name ?? base(file).replace(/_+/g, " ").trim(),
        ...(screenshot ? { screenshot } : {}),
        ...(effects?.length ? { effects } : {}),
      };
    });
  return [...bundled, ...suggested];
}

/** The files to publish: every skin, its screenshot and the credits. */
function published(): string[] {
  const list = entries().flatMap((e) => ("museum" in e ? [] : e.screenshot ? [e.file, e.screenshot] : [e.file]));
  return existsSync(join(folder, "CREDITS.md")) ? [...list, "CREDITS.md"] : list;
}

export function bundledSkins(): Plugin {
  return {
    name: "arcanist-bundled-skins",
    configureServer(server) {
      server.middlewares.use("/skins", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\//, ""));
        if (name === "index.json") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(entries()));
        } else if (published().includes(name)) {
          res.end(readFileSync(join(folder, name)));
        } else {
          next();
        }
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "skins/index.json", source: `${JSON.stringify(entries(), null, 2)}\n` });
      for (const file of published()) this.emitFile({ type: "asset", fileName: `skins/${file}`, source: readFileSync(join(folder, file)) });
    },
  };
}
