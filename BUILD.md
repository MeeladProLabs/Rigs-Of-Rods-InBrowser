# Building Rigs of Rods for the browser

This documents how the WebAssembly build is produced, the exact toolchain and
CMake flags, and the source patches applied on top of the upstream tree.

The workspace lives in `C2e/` (a checked-out monorepo of Ogre 1.12, the
AngelScript SDK, and the Rigs of Rods sources). Builds run under the
**Emscripten SDK** with `-pthread` and WebAssembly exceptions.

## Toolchain

- Emscripten SDK: `C2e/emsdk/` (wasm, `-pthread`, `-fwasm-exceptions`)
- CMake with the Emscripten toolchain file
  (`emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`)
- MinGW-style makefiles on Windows (`cmake --build build/ror -j 8`)

## 1. Build the AngelScript library (must match RoR's headers!)

RoR is compiled with `-DAS_DEPRECATED`, which **adds virtual methods to the
AngelScript interface classes** (`asIScriptEngine`, `asIScriptContext`,
`asIScriptFunction`) and shifts their vtable layout. If the static library is
built *without* that define, every virtual call from RoR lands on the wrong
vtable slot and the wasm binary traps with `RuntimeError: function signature
mismatch` at `ScriptEngine initializing`. The library **must** be built with
the same define:

```bash
cmake -S source/angelscript -B build/angelscript \
  -DCMAKE_TOOLCHAIN_FILE=<emsdk>/Emscripten.cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_FLAGS="-pthread -fwasm-exceptions -DAS_DEPRECATED -DAS_MAX_PORTABILITY"
cmake --build build/angelscript -j 8
cmake --install build/angelscript --prefix build/deps     # installs into build/deps
```

The addon sources (`scriptstdstring`, `scriptarray`, `scriptdictionary`,
`scriptmath`, `scripthelper`, `debugger`, `scriptbuilder`) are compiled by the
RoR build itself with the same flags.

## 2. Build RoR

```bash
cmake -S source/ror -B build/ror \
  -DCMAKE_TOOLCHAIN_FILE=<emsdk>/Emscripten.cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH=<workspace>/build/deps \
  -DCMAKE_CXX_FLAGS="-pthread -DAS_DEPRECATED" \
  -DCMAKE_C_FLAGS="-pthread" \
  -DROR_USE_ANGELSCRIPT=ON
cmake --build build/ror -j 8
# outputs: build/ror/bin/RoR.js, RoR.wasm, RoR.data
```

Deploy the build into `web/` (splits `RoR.data` into GitHub-friendly chunks
and patches `RoR.js` to download them):

```bash
python scripts/deploy-web.py
```

Notes:

- `ROR_USE_ANGELSCRIPT` stays **ON**. Turning it off would be the "clean" way
  to skip scripting, but upstream leaves some references unguarded, and with
  the vtable fix the registrations fail *gracefully* (they return
  `asNOT_SUPPORTED` — AngelScript runs in generic calling mode on Emscripten
  and rejects native calling conventions). The engine prints
  `Type registrations done. If you see no error above everything should be
  working` and continues; none of the bundled mods contain `.as` scripts.
- `RoR.data` (~112 MB) exceeds GitHub's 100 MB-per-file limit, so
  `scripts/deploy-web.py` splits it into `RoR.data.0` / `RoR.data.1`
  (~60 MB each) and patches `RoR.js` to fetch and concatenate the chunks.
  The split binaries **are** committed, which is what makes the game run
  directly from GitHub Pages.
- The threaded build needs a cross-origin-isolated page (SharedArrayBuffer).
  GitHub Pages cannot send COOP/COEP headers, so `web/coi-sw.js` (a service
  worker registered by `index.html`) injects them at runtime.

## Source patches applied (relative to upstream)

WebGL has **no fixed-function pipeline**, so every material that upstream
renders via FFP must get explicit GLSL/GLSL ES shaders. All patches are in
RoR-side code (Ogre is untouched):

| File | Change |
| --- | --- |
| `source/ror/source/main/gui/GUIManager.cpp` | Menu wallpaper material: GLSL vertex/fragment shaders (identity-projection overlay). |
| `source/ror/source/main/gui/imgui/OgreImGuiOverlay.cpp` | ImGui menu material: GLSL shaders (world transform + texture × vertex colour). |
| `source/ror/source/main/terrain/Terrain.cpp` | Skybox material: GLSL cube-map shaders; fixed the `worldviewproj_matrix` auto-constant binding. |
| `source/ror/source/main/terrain/OgreTerrainPSSMMaterialGenerator.{h,cpp}` | Ported the terrain material generator's GLSL/GLSL ES shader generators (vertex + fragment for all techniques: high LOD, low LOD/composite map, composite-map render). Upstream only implemented Cg/HLSL, so the GLSL path was stubs returning empty source → `Failed to preprocess shader`. Also fixed a double-append of the technique suffix in program names (`.../hlod/hlod`). Samplers are bound to texture units explicitly, in `addTechnique` order. |
| `source/ror/source/main/resources/ContentManager.cpp` | Ogre's built-in `BaseWhite` / `BaseWhiteNoLighting` materials (used by the reference grid, collision wireframes, ManualObjects, Hydrax water) get GLSL shaders at startup. |
| `source/ror/source/main/AppContext.{h,cpp}` | Initializes the **RTSS (Real-Time Shader System)** on the web build after the render window is created: registers the `SGTechniqueResolverListener` and switches the material scheme to RTSS's. This auto-generates GLSL ES shaders for **every** fixed-function material (particles, Hydrax water, plain object materials, mods, ...); materials with custom shaders (terrain, wallpaper, skybox) are left untouched. |
| `source/ror/source/main/gfx/GfxScene.cpp` | Registers the scene manager with RTSS (`addSceneManager`) so generated shaders get light data. |

## CircleCI

`.circleci/config.yml` runs a `web-check` job on every push: Node
syntax-checks the inline scripts of the HTML pages and verifies referenced
local assets exist. To set it up for this repository:

1. Sign in at **https://app.circleci.com** with the GitHub account that owns
   the repo (`MeeladProLabs`).
2. Authorize CircleCI when GitHub asks for access.
3. Go to **Projects** → find **MeeladProLabs/Rigs-Of-Rods-InBrowser** →
   click **Set Up Project**.
4. Choose **Fastest: Use the .circleci/config.yml in your repo** (it is
   already committed) → **Set Up Project**.
5. The first build triggers automatically on the next push to `main`. No
   environment variables are required.

Why CI doesn't build the wasm: the full `C2e/` source tree (Ogre, AngelScript,
RoR) is not part of this repository, and a full Emscripten build takes a long
time. The web check validates what *is* here. If you later vendor the source
tree into the repo (or a submodule), the same CircleCI config can be extended
with a `build-wasm` job using the `emscripten/emsdk` Docker image.
