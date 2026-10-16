import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

interface Notice {
  name: string;
  version: string;
  license: string;
  text: string;
}

const root = resolve(__dirname, "../..");

/**
 * Writes THIRD-PARTY-NOTICES.txt next to the build: the license of every package whose code ended up in the
 * bundle (found from the modules Rollup read), plus Webamp's, which is bundled from this monorepo's source.
 */
export function thirdPartyNotices(): Plugin {
  return {
    name: "arcanist-third-party-notices",
    apply: "build",
    generateBundle() {
      const notices = new Map<string, Notice>();
      notices.set("webamp", {
        name: "Webamp, ani-cursor and winamp-eqf (this monorepo's packages, with this fork's changes)",
        version: readJson(join(root, "packages/webamp/package.json")).version,
        license: "MIT",
        text: readFileSync(join(root, "LICENSE.txt"), "utf8"),
      });
      for (const id of this.getModuleIds()) {
        // Node polyfills are virtual modules: their code comes from the plugin's own folder.
        const directory = id.includes("polyfill-node")
          ? join(__dirname, "node_modules/rollup-plugin-polyfill-node")
          : packageDirectory(id.replace(/^\0/, "").split("?")[0]);
        if (!directory) continue;
        const manifest = readJson(join(directory, "package.json"));
        const key = `${manifest.name}@${manifest.version}`;
        if (notices.has(key) || manifest.name === "webamp") continue;
        notices.set(key, {
          name: manifest.name,
          version: manifest.version,
          license: typeof manifest.license === "string" ? manifest.license : "see the package",
          text: licenseText(directory),
        });
      }
      const body = [...notices.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((n) => `${n.name} ${n.version} (${n.license})\n${"-".repeat(72)}\n${n.text.trim()}\n`)
        .join("\n\n");
      this.emitFile({
        type: "asset",
        fileName: "THIRD-PARTY-NOTICES.txt",
        source:
          "Webamp for Arcanist is AGPL-3.0-or-later (LICENSE.txt). It includes the following third-party code,\n" +
          "each under its own license:\n\n" +
          body,
      });
    },
  };
}

/** The folder of the npm package a module comes from (the last node_modules/<name> in its path). */
function packageDirectory(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/node_modules/");
  if (index < 0) return null;
  const rest = normalized.slice(index + "/node_modules/".length).split("/");
  const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  const directory = normalized.slice(0, index) + "/node_modules/" + name;
  return existsSync(join(directory, "package.json")) ? directory : null;
}

function licenseText(directory: string): string {
  const file = readdirSync(directory).find((f) => /^(licen[cs]e|copying)(\..*)?$/i.test(f));
  if (file) return readFileSync(join(directory, file), "utf8");
  // A few packages only state it in their manifest or README.
  return `No license file in the package; package.json says: ${readJson(join(directory, "package.json")).license ?? "nothing"}.`;
}

function readJson(path: string): { name: string; version: string; license?: unknown } {
  return JSON.parse(readFileSync(path, "utf8"));
}
