# Skins that come with the player

Put `.wsz` files here: the build (`bundledSkins.ts`) publishes them at `skins/` next to the player with an
`index.json`, and the Skins window lists them in "My skins" for everyone, before the ones each browser saves.

- **Name:** the file's name, without `.wsz` and with `_` as spaces (`Big_Bento.wsz` is "Big Bento"), unless
  `skins.json` gives another.
- **Screenshot (optional):** a `.png` or `.jpg` with the same name (`Big_Bento.png`), shown in the list.
- **`skins.json` (optional):** `{ "<file>.wsz": { "name": "…", "effects": ["oled"] } }`. The skins it names come first,
  in its order. `"oled"` turns on OLED mode while the skin is in use: a pure black desktop with Arcanist's art glowing,
  and an aura around Webamp that follows the music.
- **Suggested from the Winamp Skin Museum:** a `"museum:<md5>": { "name": "…" }` entry in `skins.json` lists a museum
  skin in "My skins" without shipping it: it is downloaded from skins.webamp.org the first time it is chosen, then kept
  like any other. Use it for skins whose authors did not allow redistributing them (most say "All rights reserved").
- **Credits:** only skins whose authors allow redistributing them. Write each one's author, source and permission in
  `CREDITS.md` here: it is published next to them (`skins/CREDITS.md`) and goes in the release zip.

`Arcanist_Light`, `Arcanist_Dark` and `Arcanist_OLED` (and their screenshots and `skins.json` entries) are made by
`../skins-src/arcanist_skins.py`: change that script, not the files, and run it again (`python skins-src/arcanist_skins.py`,
with Pillow).

Webamp's base skin is always there; it does not need a file.
