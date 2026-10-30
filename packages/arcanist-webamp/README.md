# Webamp for Arcanist

The Winamp 2 player in the browser, playing an [Arcanist](https://github.com/linkfast/arcanist) server's music. It
comes with Arcanist as a bonus player, served at `/players/webamp/`.

- **Webamp** (this monorepo, MIT) plays Arcanist's stream URLs: tracks carry their tags, cover and duration, so
  nothing else is fetched; seeking uses HTTP ranges.
- **The desktop** has icons that open Arcanist's windows (shadcn/ui, the same look as Arcanist's panel), draggable
  and resizable: library, playlists, StarTracks, mixes, synced lyrics, uploads, the account and Personalize. A
  taskbar has the Arcanist menu (every window, the account and administration pages of Arcanist's panel, the source
  code, signing out), a button per open window and for Webamp, and a clock.
- **On a phone** (narrow screens, or touch screens held sideways; `src/layout.ts`) there is no desktop: Webamp's open
  windows go one under the other, scaled to the screen's width (CSS `zoom` on `#webamp`), with the playlist (or
  Milkdrop) growing to fill the screen, and they stay in place (dragging and resizing are off). Arcanist's windows are
  full-screen pages, reached from tabs at the bottom (Webamp, library, playlists, StarTracks and *More*: the open
  pages, every app and the account); while a page covers Webamp, what is playing shows above the tabs with play/pause
  and next. Playing or queueing from a page leaves the page open.
- **The library** has a sidebar (home, artists, albums, songs), search as you type, album and artist pages, back,
  forward and a breadcrumb, and a library selector (remembered per browser) when the user sees several libraries.
  Lists load more as they scroll; double-click plays, right-click has the same menu as Webamp's playlist.
- **Personalize** (kept per browser, in localStorage and IndexedDB): light, dark or system theme with the panel's
  tokens, an accent color, Arcanist's own backgrounds (inline SVG, light and dark, slowly moving unless the system asks
  for less motion), a solid color or the user's own picture, the desktop icons, Milkdrop at start, Webamp's window
  positions.
- **Skins:** a library with Webamp's base skin, the ones that come with the player (`skins/`) and the ones this browser
  saved (IndexedDB), from a `.wsz` or from the [Winamp Skin Museum](https://skins.webamp.org/), browsed and searched in
  a window through its public API (`api.webamp.org`) without leaving the player.
- **Arcanist's own skins:** Light, Dark and OLED, drawn from scratch by `skins-src/arcanist_skins.py`. Their buttons
  say what they do in Arcanist: eject is LIB (it opens the library, in any skin; ADD FILE and dropping files still
  reach the computer's), ADD URL is LIB, the playlists' button is LISTS. **OLED** also turns the desktop pure black
  with Arcanist's art glowing and a slow beam of light sweeping it, makes Arcanist's windows black, and puts an aura
  around Webamp's windows that breathes with the music and flashes on the beats (only the level, slowly, with reduced
  motion).
- **Webamp's menus** gain Arcanist's features: the main menu's *Arcanist* submenu, and a menu of its own on the
  playlist's tracks (StarTrack, add to playlist, radio, album, artist, lyrics, download). LOAD LIST and SAVE LIST
  use Arcanist's playlists; ADD URL opens the library.
- **Plays** are reported to Arcanist as they end (time actually played), so statistics and mixes follow them.

## Skins that come with it

Put `.wsz` files (and a screenshot of the same name, `.png` or `.jpg`) in `skins/`: the build publishes them at
`skins/` with an `index.json`, and they go in the release zip. Only skins whose authors allow it, credited in
`skins/CREDITS.md` (see `skins/README.md`).

## Changes to Webamp

Kept small and generic, in `packages/webamp` on this branch:

- `mainContextMenuItems` and `trackContextMenuItems` options: items a host page adds to the main context menu, and
  a menu of its own for the selected playlist tracks.
- `setCurrentTrack(index)` used the index as a track id.
- Tracks given with `metaData` lost their `albumArtUrl`.

## Building

The zip, in one command (PowerShell; Docker Desktop is all it needs, `-Local` uses this machine's Node instead,
`-Test` also runs Webamp's tests):

```powershell
pwsh packages/arcanist-webamp/scripts/pack.ps1   # release/arcanist-webamp-<version>.zip and its SHA-256
```

To put it in a Synology package with Arcanist instead of the published release, run Arcanist's
`packaging/synology/build.ps1 -LocalWebamp` (it builds this checkout with this script).

By hand, from the monorepo's root, with Node 22+ and pnpm 9 (`corepack pnpm`):

```bash
pnpm install --filter "arcanist-webamp..."
pnpm --filter ani-cursor --filter winamp-eqf run build   # once: Webamp uses their built output
pnpm --filter arcanist-webamp build        # dist/: the player, its arcanist-frontend.json, LICENSE.txt and THIRD-PARTY-NOTICES.txt
pnpm --filter arcanist-webamp run package  # release/arcanist-webamp-<version>.zip and its SHA-256
pnpm --filter arcanist-webamp start        # dev server; ARCANIST_URL points it at a server (default http://localhost:8484)
python skins-src/arcanist_skins.py         # from this package (with Pillow): Arcanist's skins into skins/
```

Arcanist serves `dist/` when it is in its `wwwroot/players/webamp` (or `Arcanist:Frontends:BundledRoot`), or once
installed from the panel with the zip (or its URL).

## Releasing

1. Raise `version` in `package.json` and `public/arcanist-frontend.json`. Until Arcanist has a tested release, versions carry
   a pre-release suffix (`0.2.0-alpha.1`), and the workflow publishes them as pre-releases.
2. Push a tag `arcanist-webamp-v<version>`. The workflow `.github/workflows/arcanist-webamp.yml` builds the zip
   (reproducible: same sources, same SHA-256) and publishes it as a GitHub Release with its SHA-256.
3. In Arcanist, update the `BundledPlayer` item of `src/Arcanist.Core/Arcanist.Core.csproj` (version and SHA-256):
   its packages download that zip when they are published.

Upstream's own CI (`ci.yml`) only runs in captbaritone/webamp.

## License

AGPL-3.0-or-later, © LinkFast S.A. and Arcanist contributors. Webamp is MIT, © Jordan Eldredge. Only Webamp's base
skin comes with it: more skins can be dropped on the player (the Winamp Skin Museum has thousands).
