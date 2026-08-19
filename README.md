# Rigs-Of-Rods-InBrowser

[Rigs of Rods](https://www.rigsofrods.org) compiled to WebAssembly and running
in the browser. No install, no download — open a page, click the canvas, play.

Playable build: **http://localhost:8000/** (serve the repo's `web/` folder over
HTTP — see [Run it locally](#run-it-locally)).

## Status

The goal is a fully working Rigs of Rods in the browser. What works today:

- **Main menu** — wallpaper, ImGui interface, terrain selection.
- **Terrain loading** — the game's terrain shader generation was ported to
  GLSL/GLSL ES. WebGL has no fixed-function pipeline, so every material needs
  explicit shaders; these were added for the menu wallpaper, the ImGui menu,
  the skybox cube map, the terrain renderer, and Ogre's built-in
  `BaseWhite`/`BaseWhiteNoLighting` materials (reference grid, collision
  wireframes, ManualObjects, Hydrax water). Selecting a map and starting a
  game now loads the terrain and renders it instead of a white screen.
- **Resizable screen** — drag the **corner** to resize width *and* height
  independently, the **right edge** for width only, or the **bottom edge** for
  height only. Double-click the game to toggle fullscreen, or press **⤡ Fit
  window**.
- **Mod repository** — [repo.html](web/repo.html) browses the official Rigs of
  Rods repository (975+ resources): search, category filter, thumbnails,
  ratings, downloads, and per-mod detail pages with download links.
- **CI** — CircleCI validates the web frontend on every push (see
  [.circleci/config.yml](.circleci/config.yml)).

Known limitations of the WebAssembly build:

- **Scripting (AngelScript) is largely non-functional.** AngelScript runs in
  "generic calling mode" on Emscripten and rejects native function
  registrations; the game logs a large but *harmless* stream of `asNOT_SUPPORTED`
  errors at startup and continues. None of the bundled mods use scripts.
- Shadows, vegetation, water and other GPU-heavy features are best kept at low
  settings until the GLSL ES shader coverage is complete.
- Some textures referenced by older content (`.dds` packs) are missing from
  the bundled mods; Ogre logs "texture layer will be blank" and continues.

## Run it locally

```bash
cd web
python -m http.server 8000
# then open http://localhost:8000/
```

Serve over HTTP — the game fetches `RoR.wasm` / `RoR.data` and needs a normal
web server, not `file://`.

## Controls

See [controls.html](web/controls.html) in the browser (top-right link), or the
usual Rigs of Rods bindings (WASD + mouse).

## Repository & multiplayer

- **Mod repository** — implemented as a web page (`web/repo.html`) backed by
  the official Rigs of Rods API. Browsing/downloading works today; *in-game*
  install (dropping a downloaded mod zip into the game's content folder at
  runtime) is on the roadmap.
- **Multiplayer** — planned, not started yet.

## Building from source

See [BUILD.md](BUILD.md) — toolchain, exact CMake flags, and the list of
source patches applied to the upstream tree.

> The compiled game binaries (`RoR.js` ~230 KB, `RoR.wasm` ~9 MB,
> `RoR.data` ~112 MB) are build artifacts and are **not** committed to git
> (GitHub's 100 MB-per-file limit). Get them by building (BUILD.md) or from a
> GitHub Release.

## CI (CircleCI)

Every push runs `web-check`: a Node syntax-check of the inline scripts in the
HTML pages plus an asset-reference check. See `.circleci/config.yml`. To set
up CircleCI for this repo, follow the steps in
[BUILD.md → CircleCI](BUILD.md#circleci).

## Acknowledgements

- [Rigs of Rods](https://github.com/RigsOfRods/rigs-of-rods) and the OGRE
  engine — the actual game, compiled to wasm.
- This project only *hosts* the compiled game and its web shell; all game code
  belongs to its upstream authors.
