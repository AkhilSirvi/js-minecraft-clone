
# Js-Minecraft-Clone

A small Minecraft-inspired voxel engine written in plain JavaScript. It demonstrates
chunked world streaming, Perlin-based procedural terrain generation, simple player
physics, and real-time rendering using Three.js.

Live Demo: https://akhilsirvi.github.io/js-minecraft-clone/

**Overview**

This project is an educational, browser-based voxel engine. It keeps memory and
CPU usage reasonable by splitting the world into chunks and streaming them in/out
based on the player's position. Terrain is generated procedurally using
Perlin noise so the world is deterministic from a seed.

**How it works (components)**
- **Main loop & init**: [js/main.js](js/main.js) initializes Three.js, lighting,
	the player, and the chunk streaming manager. It runs the animation loop,
	handles fixed-timestep physics, and updates the chunk manager and day/night cycle.
- **Chunk generation**: [js/chunkGen.js](js/chunkGen.js) contains `generateChunk()`
	and constants like `CHUNK_SIZE`, `HEIGHT`, and `MIN_Y`. It uses [js/perlin.js](js/perlin.js)
	to compute terrain heights and fill a compact block-data array.
- **Chunk streaming & meshes**: [js/chunkManager.js](js/chunkManager.js) manages which
	chunks are loaded, generates meshes for visible blocks, and exposes helpers
	like `getBlockAtWorld()`, `getTopAtWorld()` and `getGroundAtWorld()` used by the player.
- **Rendering engine**: The project uses the included Three.js modules
	([js/three.module.js](js/three.module.js), [js/three.core.js](js/three.core.js)) for
	scene graph, materials, and rendering.
- **Debug & overlay**: [js/debugOverlay.js](js/debugOverlay.js) provides an on-screen
	debug panel (toggle with F3) showing FPS, loaded chunks and target block info.
- **Config**: [js/config.js](js/config.js) centralizes runtime settings (seed,
	physics, rendering, day/night cycle, etc.).

**Chunk generation details**
- A chunk represents a 3D block area of size `CHUNK_SIZE x HEIGHT x CHUNK_SIZE`.
- `generateChunk(x, z, seed)` uses Perlin noise to compute terrain and returns an
	object with a compact `data` array of block IDs (0 = air). The generator sets
	block IDs per (x,y,z) column and can be extended with new block types.
- The chunk manager converts this block data into Three.js geometry, combining
	visible faces and applying textures from `assets/textures/block/` to reduce
	draw calls.

**Rendering & day/night**
- The renderer is created in [js/main.js](js/main.js). It sets up ambient and
	directional lights, a visual sun/moon, and blends the sky color according to
	the day/night cycle parameters in `DAY_NIGHT` from `js/config.js`.
- The scene background, sun intensity, and ambient light are updated each frame
	to create dawn/day/dusk/night transitions.

**Player, controls & physics**
- Player and camera are implemented in `js/main.js`. The player is represented
	as an Object3D with a separate pitch object for camera pitch control.
- Controls (default):
	- Move: `W`/`A`/`S`/`D`
	- Jump: `Space`
	- Sprint: `Control` (hold)
	- Crouch: `Shift` (hold)
	- Toggle third/first-person: `F5`
	- Toggle debug overlay: `F3`
	- Click the canvas to lock the pointer and enable mouse look
- Physics uses a fixed timestep for stable behavior. Collision checking is
	performed against block data provided by the chunk manager. The physics
	constants (gravity, jump speed, friction, etc.) are in `js/config.js`.

**Configuration**
- Change world parameters in [js/config.js](js/config.js):
	- `SEED` — controls deterministic terrain generation
	- `RENDER.viewDistance` — how many chunks to keep loaded around the player
	- `PLAYER` — spawn, size, and movement-related values
	- `PHYSICS` — gravity, step rate, jump speed, max speed, etc.
	- `DAY_NIGHT` and `CAMERA` — visual and camera-related settings

**Running locally**
This project is static and can be served from any static file server. For local
development use a simple HTTP server (some browsers block module imports via
`file://`):

```bash
# Python 3
python -m http.server 8000

# or using Node + `serve`
npx serve .
```

Then open `http://localhost:8000/` in your browser and click the canvas to lock
the pointer and begin playing.

**Adding blocks & textures**
- Block textures live in `assets/textures/block/`. Add new images there and map
	them to block IDs in your mesh/material generation code (typically inside
	`js/chunkManager.js` and `js/chunkGen.js`).
- To add a new block type:
	1. Add a texture file to `assets/textures/block/`.
	2. Assign a numeric ID for the block in the generator logic in
		 [js/chunkGen.js](js/chunkGen.js).
	3. Update the material/UV mapping rules in [js/chunkManager.js](js/chunkManager.js)
		 so the new ID uses the correct texture.