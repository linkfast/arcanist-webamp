// Zips dist/ into release/arcanist-webamp-<version>.zip: what Arcanist bundles (wwwroot/players/webamp) and what
// an administrator can install from the panel. The zip is reproducible (fixed dates, sorted entries), so the same
// build gives the same SHA-256.
//
//   node scripts/package.mjs [expected version, e.g. from the tag]
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const manifest = JSON.parse(readFileSync(join(dist, "arcanist-frontend.json"), "utf8"));

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
if (manifest.version !== version)
  fail(`arcanist-frontend.json says ${manifest.version}, package.json ${version}`);
const expected = process.argv[2]?.replace(/^(arcanist-webamp-)?v/, "");
if (expected && expected !== version) fail(`The tag says ${expected}, package.json ${version}`);
for (const file of ["index.html", "LICENSE.txt", "THIRD-PARTY-NOTICES.txt"])
  if (!statSync(join(dist, file), { throwIfNoEntry: false })) fail(`dist/${file} is missing: build first`);

const files = [];
const walk = (folder) => {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(relative(dist, path).replace(/\\/g, "/"));
  }
};
walk(dist);
files.sort();

const zip = new JSZip();
const date = new Date(Date.UTC(2000, 0, 1));
for (const file of files) zip.file(file, readFileSync(join(dist, file)), { date, createFolders: false });
const bytes = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
  platform: "UNIX",
});

mkdirSync(join(root, "release"), { recursive: true });
const name = `arcanist-webamp-${version}.zip`;
writeFileSync(join(root, "release", name), bytes);
const sha256 = createHash("sha256").update(bytes).digest("hex");
writeFileSync(join(root, "release", `${name}.sha256`), `${sha256}  ${name}\n`);
console.log(`release/${name} (${files.length} files, ${bytes.length} bytes)\nSHA-256 ${sha256}`);
