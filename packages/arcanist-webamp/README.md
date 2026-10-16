# Webamp for Arcanist

The Winamp 2 player in the browser, playing an [Arcanist](https://github.com/linkfast/arcanist) server's music. It
comes with Arcanist as a bonus player, served at `/players/webamp/`.

- **Webamp** (this monorepo, MIT) plays Arcanist's stream URLs: tracks carry their tags, cover and duration, so
  nothing else is fetched; seeking uses HTTP ranges.
- **The desktop** has icons that open Arcanist's windows (shadcn/ui, the same look as Arcanist's panel), draggable
  and resizable: library, playlists, StarTracks, mixes, synced lyrics, uploads and the account.
- **Webamp's menus** gain Arcanist's features: the main menu's *Arcanist* submenu, and a menu of its own on the
  playlist's tracks (StarTrack, add to playlist, radio, album, artist, lyrics, download). LOAD LIST and SAVE LIST
  use Arcanist's playlists; ADD URL opens the library.
- **Plays** are reported to Arcanist as they end (time actually played), so statistics and mixes follow them.

## Changes to Webamp

Kept small and generic, in `packages/webamp` on this branch:

- `mainContextMenuItems` and `trackContextMenuItems` options: items a host page adds to the main context menu, and
  a menu of its own for the selected playlist tracks.
- `setCurrentTrack(index)` used the index as a track id.
- Tracks given with `metaData` lost their `albumArtUrl`.

## Building

From the monorepo's root, with Node 22+ and pnpm 9 (`corepack pnpm`):

```bash
pnpm install --filter "arcanist-webamp..."
pnpm --filter arcanist-webamp build        # dist/: the player, with its arcanist-frontend.json
pnpm --filter arcanist-webamp start        # dev server; ARCANIST_URL points it at a server (default http://localhost:8484)
```

Arcanist serves `dist/` when it is in its `wwwroot/players/webamp` (or `Arcanist:Frontends:BundledRoot`), or once
installed from the panel as a `.zip` of it.

## License

AGPL-3.0-or-later, © LinkFast S.A. and Arcanist contributors. Webamp is MIT, © Jordan Eldredge. Only Webamp's base
skin comes with it: more skins can be dropped on the player (the Winamp Skin Museum has thousands).
