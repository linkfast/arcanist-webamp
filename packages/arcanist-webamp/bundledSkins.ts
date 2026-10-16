import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

// The skins that come with the player: the .wsz files of skins/ (each with a screenshot of the same name, .png or
// .jpg, when there is one), published at skins/ next to the player with the index.json the Skins window reads.

const folder = resolve(__dirname, "skins");

export interface BundledSkinEntry {
  file: string;
  name: string;
  screenshot?: string;
}

function entries(): BundledSkinEntry[] {
  if (!existsSync(folder)) return [];
  const files = readdirSync(folder);
  const base = (file: string) => file.slice(0, file.lastIndexOf("."));
  return files
    .filter((f) => /\.wsz$/i.test(f))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const screenshot = files.find((f) => /\.(png|jpe?g)$/i.test(f) && base(f) === base(file));
      return { file, name: base(file).replace(/_+/g, " ").trim(), ...(screenshot ? { screenshot } : {}) };
    });
}

/** The files to publish: every skin, its screenshot and the credits. */
function published(): string[] {
  const list = entries().flatMap((e) => (e.screenshot ? [e.file, e.screenshot] : [e.file]));
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
