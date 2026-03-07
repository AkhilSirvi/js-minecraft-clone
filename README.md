
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

---

## Technical Deep Dive: Logic & Mathematics

This section explains the core algorithms and mathematical foundations that power the engine.

---

### 1. Perlin Noise — The Mathematical Foundation

All terrain generation is based on **Perlin noise**, a gradient noise function invented by Ken Perlin in 1983. It produces smooth, continuous pseudo-random values that tile seamlessly.

#### 1.1 Seeded Random Number Generator

A **Linear Congruential Generator (LCG)** provides deterministic randomness from a seed. This is the Java LCG algorithm:

```
s(n+1) = (s(n) × 25214903917 + 11) mod 2^48
```

The output is normalized to [0, 1):
```
output = (s >> 22) / 2^26
```

**Mathematical Properties:**
- **Period**: 2^48 (≈281 trillion values before repeating)
- **Multiplier**: 25214903917 (chosen to maximize period and statistical quality)
- **Increment**: 11 (must be odd for full period)
- **Modulus**: 2^48 (allows efficient bitwise masking)

#### 1.2 Permutation Table

A 256-element permutation table P is constructed using Fisher-Yates shuffle:

```
for i from 255 down to 1:
    j = random(0, i)
    swap(P[i], P[j])
```

The table is doubled (P[256..511] = P[0..255]) to avoid modulo operations during lookup.

#### 1.3 Fade Function (Quintic Smoothstep)

The fade function ensures C² continuity (continuous first and second derivatives):

```
fade(t) = 6t⁵ - 15t⁴ + 10t³
```

**Derivation**: We need a polynomial f(t) where:
- f(0) = 0, f(1) = 1 (interpolation endpoints)
- f'(0) = 0, f'(1) = 0 (zero first derivative at endpoints)
- f''(0) = 0, f''(1) = 0 (zero second derivative at endpoints)

Solving these 6 constraints with a degree-5 polynomial:
```
f(t) = at⁵ + bt⁴ + ct³ + dt² + et + f
```

Yields: a=6, b=-15, c=10, d=e=f=0

**Derivatives:**
```
f'(t)  = 30t⁴ - 60t³ + 30t²  = 30t²(t-1)²
f''(t) = 120t³ - 180t² + 60t = 60t(2t² - 3t + 1) = 60t(t-1)(2t-1)
```

#### 1.4 Gradient Vectors

Perlin noise uses 12 gradient vectors pointing to edges of a unit cube, plus 4 duplicates for power-of-2 indexing (16 total):

| Hash & 15 | Gradient Vector | Dot Product |
|-----------|-----------------|-------------|
| 0 | (1, 1, 0) | x + y |
| 1 | (-1, 1, 0) | -x + y |
| 2 | (1, -1, 0) | x - y |
| 3 | (-1, -1, 0) | -x - y |
| 4 | (1, 0, 1) | x + z |
| 5 | (-1, 0, 1) | -x + z |
| 6 | (1, 0, -1) | x - z |
| 7 | (-1, 0, -1) | -x - z |
| 8 | (0, 1, 1) | y + z |
| 9 | (0, -1, 1) | -y + z |
| 10 | (0, 1, -1) | y - z |
| 11 | (0, -1, -1) | -y - z |
| 12 | (1, 1, 0) | x + y |
| 13 | (-1, 1, 0) | -x + y |
| 14 | (0, -1, 1) | -y + z |
| 15 | (0, -1, -1) | -y - z |

The dot product `g · (x, y, z)` is computed efficiently using switch/case without explicit vector math.

#### 1.5 3D Noise Algorithm — Full Mathematical Description

Given input point **p** = (x, y, z):

**Step 1: Determine unit cube**
```
X = floor(x) mod 256
Y = floor(y) mod 256
Z = floor(z) mod 256
```

**Step 2: Compute relative position within cube**
```
x' = x - floor(x)    ∈ [0, 1)
y' = y - floor(y)    ∈ [0, 1)
z' = z - floor(z)    ∈ [0, 1)
```

**Step 3: Compute fade values**
```
u = fade(x') = 6x'⁵ - 15x'⁴ + 10x'³
v = fade(y') = 6y'⁵ - 15y'⁴ + 10y'³
w = fade(z') = 6z'⁵ - 15z'⁴ + 10z'³
```

**Step 4: Hash corner coordinates** (using doubled permutation table P)
```
A  = P[X] + Y
AA = P[A] + Z
AB = P[A + 1] + Z
B  = P[X + 1] + Y
BA = P[B] + Z
BB = P[B + 1] + Z
```

**Step 5: Compute gradient contributions at 8 corners**

For corner at offset (i, j, k) where i,j,k ∈ {0, 1}:
```
g_ijk = grad(P[hash_ijk], x' - i, y' - j, z' - k)
```

Where hash indices are:
```
g₀₀₀ = grad(P[AA],     x',     y',     z')
g₁₀₀ = grad(P[BA],     x' - 1, y',     z')
g₀₁₀ = grad(P[AB],     x',     y' - 1, z')
g₁₁₀ = grad(P[BB],     x' - 1, y' - 1, z')
g₀₀₁ = grad(P[AA + 1], x',     y',     z' - 1)
g₁₀₁ = grad(P[BA + 1], x' - 1, y',     z' - 1)
g₀₁₁ = grad(P[AB + 1], x',     y' - 1, z' - 1)
g₁₁₁ = grad(P[BB + 1], x' - 1, y' - 1, z' - 1)
```

**Step 6: Trilinear interpolation**
```
noise(x, y, z) = lerp(
    lerp(
        lerp(g₀₀₀, g₁₀₀, u),
        lerp(g₀₁₀, g₁₁₀, u),
        v
    ),
    lerp(
        lerp(g₀₀₁, g₁₀₁, u),
        lerp(g₀₁₁, g₁₁₁, u),
        v
    ),
    w
)
```

**Output range**: [-1, 1] (though typically closer to [-0.7, 0.7] in practice)

#### 1.6 Fractal Brownian Motion (fBm) — Octave Noise

Multiple noise frequencies are summed to create natural-looking detail at multiple scales:

```
              n-1
fbm(p) =  Σ   aⁱ × noise(p × fⁱ)
             i=0
```

**Expanded form:**
```
fbm(p) = noise(p) 
       + a × noise(p × f) 
       + a² × noise(p × f²) 
       + a³ × noise(p × f³)
       + ...
```

**Parameters:**
- **Octaves** (n): Number of noise layers (default: 5)
- **Persistence** (a): Amplitude multiplier per octave (default: 0.5)
- **Lacunarity** (f): Frequency multiplier per octave (default: 2.0)

**Normalization**: Divide by sum of all amplitudes to keep output in [-1, 1]:
```
                n-1
max_amplitude = Σ   aⁱ = (1 - aⁿ) / (1 - a)
               i=0

normalized_fbm(p) = fbm(p) / max_amplitude
```

For persistence = 0.5 and 5 octaves:
```
max_amplitude = 1 + 0.5 + 0.25 + 0.125 + 0.0625 = 1.9375
```

**Spectral Analysis**: Each octave adds detail at a specific frequency band. The power spectrum follows:
```
Power(f) ∝ f^(-β)  where β = -2 × log₂(persistence)
```

For persistence = 0.5: β = 2 (pink noise / 1/f² noise)

---

### 2. Terrain Generation

#### 2.1 Chunk System & Coordinate Mathematics

The world is divided into **16×16×384 block chunks** (Y range: -64 to 319):

```
CHUNK_SIZE = 16
MIN_Y = -64
MAX_Y = 319
HEIGHT = MAX_Y - MIN_Y + 1 = 384
```

**Coordinate conversions:**

World position → Chunk coordinates:
```
chunk_x = floor(world_x / CHUNK_SIZE)
chunk_z = floor(world_z / CHUNK_SIZE)
```

World position → Local block coordinates:
```
local_x = ((world_x mod CHUNK_SIZE) + CHUNK_SIZE) mod CHUNK_SIZE
local_z = ((world_z mod CHUNK_SIZE) + CHUNK_SIZE) mod CHUNK_SIZE
local_y = world_y - MIN_Y
```

**1D Array indexing** (column-major for cache efficiency):
```
index = (local_x × CHUNK_SIZE + local_z) × HEIGHT + local_y
```

**Memory per chunk**: 16 × 16 × 384 = 98,304 bytes (using Uint8Array for block IDs)

#### 2.2 Biome Climate System

Four climate parameters determine biomes using domain-warped noise:

| Parameter | Scale | Octaves | Purpose |
|-----------|-------|---------|---------|
| Temperature | 0.0015 | 4 | Latitude-like bands |
| Humidity | 0.0025 | 4 | Moisture variation |
| Continentalness | 0.008 | 5 | Land/ocean distribution |
| Erosion | 0.004 | 3 | Local terrain roughness |

#### 2.3 Domain Warping

Domain warping distorts the noise input coordinates to create more organic, irregular shapes:

```
warped_sample(x, z) = noise((x + Wₓ(x,z)) × scale, (z + Wᵤ(x,z)) × scale)
```

Where warp functions are themselves noise:
```
Wₓ(x, z) = A × fbm(x × s_w, 0, z × s_w)
Wᵤ(x, z) = A × fbm(x × s_w, 100, z × s_w)
```

**Parameters used:**
- Amplitude A = 50 blocks
- Warp scale s_w = 0.001

**Mathematical effect**: Creates "swirling" patterns by displacing sample points before noise evaluation.

#### 2.4 Continentalness Height Function

Terrain base height is a **piecewise function** of continentalness C:

```
              ⎧ seaLevel - 20 - (0.25 - C) × 40           if C < 0.25  (deep ocean)
              ⎪
              ⎪ lerp(seaLevel - 20, seaLevel + 5, 
h_base(C) =   ⎨      smoothstep((C - 0.25) / 0.15))       if 0.25 ≤ C < 0.4  (coast)
              ⎪
              ⎪ lerp(seaLevel + 5, baseHeight + 20, 
              ⎪      (C - 0.4) / 0.4)                      if 0.4 ≤ C < 0.8  (land)
              ⎪
              ⎩ baseHeight + 20 + (C - 0.8) / 0.5 × 50    if C ≥ 0.8  (mountains)
```

Where:
- `seaLevel = 62`
- `baseHeight = 64`

#### 2.5 Smoothstep Functions

**Cubic smoothstep** (C¹ continuous):
```
smoothstep(t) = 3t² - 2t³ = t²(3 - 2t)
```

**Derivatives:**
```
smoothstep'(t) = 6t - 6t² = 6t(1 - t)
smoothstep'(0) = smoothstep'(1) = 0  ✓
```

**Comparison to quintic fade:**
- Smoothstep: C¹ continuous (continuous first derivative)
- Fade (Perlin): C² continuous (continuous second derivative)

#### 2.6 Height Map Composition

The final terrain height combines multiple noise contributions:

```
H(x, z) = h_base(C) + N_terrain × A × S_biome + offset_biome
```

Where:
- `N_terrain` = octave noise at (x × scale, 0, z × scale)
- `A` = amplitude (80 blocks)
- `S_biome` = biome terrain scale (0.08 to 1.8 depending on biome)
- `offset_biome` = biome height offset (-15 to +40)

**Biome terrain scales:**

| Biome | Scale Factor | Effect |
|-------|--------------|--------|
| Ocean | 0.25 | Very flat |
| Beach | 0.08 | Nearly flat |
| Swamp | 0.15 | Slight variation |
| Plains | 0.35 | Gentle hills |
| Savanna | 0.40 | Rolling terrain |
| Forest | 0.45 | Moderate hills |
| Snowy | 0.65 | Hilly |
| Mountains | 1.80 | Extreme variation |

**Erosion factor** reduces terrain amplitude:
```
effective_scale = S_biome × lerp(1.0, 0.4, erosion)
```

#### 2.7 Biome Blending — Weighted Average

To prevent harsh biome boundaries, terrain parameters are **averaged** over a sampling radius:

**Weight function** (smooth polynomial falloff):
```
w(d) = (1 - (d/R)²)²  for d ≤ R, else 0
```

Where R = 16 blocks (blend radius).

**Weighted average computation:**
```
         Σ w(dᵢ) × param(xᵢ, zᵢ)
param_blended = ─────────────────────
                    Σ w(dᵢ)
```

Samples are taken on a 4-block grid within the blend radius for efficiency.

**Mathematical properties:**
- w(0) = 1 (full weight at center)
- w(R) = 0 (zero weight at boundary)
- w'(R) = 0 (smooth transition at boundary)

#### 2.8 Ridge Noise for Mountain Chains

Mountain formations use **ridged multifractal noise**:

```
ridge(x) = 1 - |noise(x)|
```

This creates sharp ridges where the absolute value crosses zero:

```
ridge_contribution = ridge² × 0.3
continentalness_final = continentalness_base + ridge_contribution
```

**Visual effect**: Creates linear mountain chains at continental boundaries.

#### 2.9 Cave Generation Mathematics

Caves use a combination of two noise systems:

**Main cave system** (3D Perlin with threshold):
```
cave_value = fbm(x × 0.06, y × 0.03, z × 0.06, octaves=3)
depth_bias = (seaLevel - y) / (seaLevel - MIN_Y + 1) × 0.4
carve = (cave_value + depth_bias) > threshold
```

Where `threshold = 0.5`. The depth bias makes caves more common at lower elevations.

**Spaghetti caves** (narrow winding tunnels):
```
spaghetti = |fbm(x × 0.042, y × 0.018, z × 0.042, octaves=2)| < 0.05
```

The absolute value creates a narrow band around zero, producing tunnel-like structures.

**Cave carving rules:**
- Don't carve bedrock (y ≤ MIN_Y + 4)
- Don't carve within 3 blocks of surface (unless `caveOpenToSurface = true`)
- Don't carve below sea level if it would flood

#### 2.10 Ore Distribution

Ore vein placement uses noise thresholding with per-ore parameters:

```
place_ore(x, y, z, ore) = noise(x × 0.1 + oreId × 100,
                                 y × 0.1,
                                 z × 0.1 + oreId × 100) > T(ore)
```

Where threshold:
```
T(ore) = 1 - rarity × veinSize
```

**Ore configuration:**

| Ore | Y Range | Vein Size | Rarity | Threshold |
|-----|---------|-----------|--------|-----------|
| Coal | -64 → 128 | 6 | 0.06 | 0.64 |
| Iron | -64 → 64 | 5 | 0.06 | 0.70 |
| Gold | -64 → 32 | 4 | 0.015 | 0.94 |
| Diamond | -64 → 16 | 4 | 0.005 | 0.98 |

**Offset by oreId × 100**: Ensures each ore type samples a different noise region, preventing correlation.

#### 2.11 Bedrock Generation

Bedrock uses a probabilistic gradient at the world bottom:

```
place_bedrock(y) = random() < (MIN_Y + 5 - y) / 5
```

**Probabilities by layer:**
| Y | Probability |
|---|-------------|
| -64 | 100% |
| -63 | 80% |
| -62 | 60% |
| -61 | 40% |
| -60 | 20% |
| -59 | 0% |

#### 2.12 Seeded Random for Features

Deterministic random for tree/vegetation placement:

```
random(x, z, seed) = hash(seed + x × 374761393 + z × 668265263) / 2³²
```

Where hash function:
```
hash(h) = h ^ (h >> 13)
        = h × 1274126177
        = h ^ (h >> 16)
```

These magic numbers are primes chosen to maximize bit mixing.

---

### 3. Chunk Management & Rendering

#### 3.1 View Distance & Chunk Loading

Chunks are loaded in a circular pattern around the player:

```
load_chunk(cx, cz) if (cx - player_cx)² + (cz - player_cz)² ≤ viewDistance²
```

**Hysteresis**: Chunks are unloaded with extra margin to prevent thrashing:
```
unload_chunk(cx, cz) if distance² > (viewDistance + hysteresis)²
```

#### 3.2 Face Culling — Greedy Optimization

Only render block faces **adjacent to transparent blocks**:

```
for each face direction d ∈ {+X, -X, +Y, -Y, +Z, -Z}:
    neighbor_pos = block_pos + normal[d]
    neighbor_id = getBlock(neighbor_pos)
    
    render_face = isTransparent(neighbor_id) OR 
                  (isTransparent(block_id) AND neighbor_id != block_id)
```

**Transparent blocks**: air, water, leaves, ice, glass, vegetation

**Complexity reduction**:
- Worst case (checkerboard): 6 faces per block
- Average solid terrain: ~0.5 faces per block
- Typical reduction: 90%+ fewer triangles

#### 3.3 Quad Geometry & Triangle Decomposition

Each block face is a **quad** split into 2 triangles:

**Corner definitions** (for +Y face as example):
```
v₀ = (0, 1, 0)
v₁ = (0, 1, 1)
v₂ = (1, 1, 1)
v₃ = (1, 1, 0)
```

**Triangle indices**: `[0, 1, 2]` and `[0, 2, 3]`

**Normal calculation** via cross product:
```
edge₁ = v₁ - v₀ = (0, 0, 1)
edge₂ = v₂ - v₀ = (1, 0, 1)
normal = edge₁ × edge₂ = (0×1 - 1×0, 1×1 - 0×1, 0×0 - 0×1) = (0, 1, 0)
```

#### 3.4 Face Direction Definitions

Six faces with their normal vectors and corner offsets:

| Face | Normal | Corners (CCW from outside) |
|------|--------|---------------------------|
| +X | (1, 0, 0) | (1,0,0), (1,1,0), (1,1,1), (1,0,1) |
| -X | (-1, 0, 0) | (0,0,0), (0,0,1), (0,1,1), (0,1,0) |
| +Y | (0, 1, 0) | (0,1,0), (0,1,1), (1,1,1), (1,1,0) |
| -Y | (0, -1, 0) | (0,0,0), (1,0,0), (1,0,1), (0,0,1) |
| +Z | (0, 0, 1) | (0,0,1), (1,0,1), (1,1,1), (0,1,1) |
| -Z | (0, 0, -1) | (0,0,0), (0,1,0), (1,1,0), (1,0,0) |

#### 3.5 UV Texture Mapping

Each face gets UV coordinates [0,1]² mapped to its corners:

```
UV assignments (per-face, varies by orientation):
(0,0) → bottom-left
(1,0) → bottom-right
(1,1) → top-right
(0,1) → top-left
```

#### 3.6 UV Rotation for Visual Variety

Top faces (+Y) use deterministic rotation to avoid obvious tiling:

```
rotation = hash(seed, block_x, block_y, block_z) mod 4
```

**Rotation transformation** (90° clockwise, n times):
```
rotate_uv(u, v, n):
    for i in 0..n:
        (u, v) = (v, 1 - u)
    return (u, v)
```

Rotation matrices:
```
0°:   [1  0]    90°:  [0  1]    180°: [-1  0]    270°: [0 -1]
      [0  1]          [-1 0]          [0  -1]          [1  0]
```

#### 3.7 Merged Geometry — Buffer Construction

Faces are batched by material into merged BufferGeometry:

```
positions = Float32Array[vertex_count × 3]
uvs = Float32Array[vertex_count × 2]
colors = Float32Array[vertex_count × 3]
indices = Uint32Array[triangle_count × 3]
```

**Memory per chunk** (typical 1000 visible faces):
- Positions: 1000 × 4 vertices × 3 coords × 4 bytes = 48 KB
- UVs: 1000 × 4 × 2 × 4 = 32 KB
- Colors: 1000 × 4 × 3 × 4 = 48 KB
- Indices: 1000 × 6 × 4 = 24 KB
- **Total**: ~152 KB per chunk

#### 3.8 Cross-Model Blocks (Vegetation)

Vegetation (grass, flowers) uses X-shaped billboard geometry:

```
Two intersecting quads at 45° angles:
Quad 1: corners at (0,0,0), (1,0,1), (1,1,1), (0,1,0)
Quad 2: corners at (1,0,0), (0,0,1), (0,1,1), (1,1,0)
```

These render from all angles without requiring rotation toward the camera.

---

### 4. Lighting System

The lighting system uses a **discrete light level** model with values 0-15, combining sky light and block light.

#### 4.1 Light Level Representation

Light levels are stored as integers 0-15:
- **0**: Complete darkness
- **15**: Maximum brightness (direct sunlight or light source)

Two separate light channels:
- `skyLight[x,y,z]`: Light from the sky
- `blockLight[x,y,z]`: Light from emissive blocks (torches, lava, etc.)

#### 4.2 Sky Light Propagation Algorithm

Uses **Breadth-First Search (BFS) flood fill** from exposed surfaces:

**Phase 1: Vertical propagation** (top-down per column)
```
for each column (x, z):
    light = 15  // Full sky light at top
    for y from MAX_Y down to MIN_Y:
        if block[x,y,z] == AIR:
            skyLight[x,y,z] = light
            add (x,y,z,light) to queue
        else if isTransparent(block[x,y,z]):
            if isFiltering(block[x,y,z]):
                light = max(0, light - 1)
            skyLight[x,y,z] = light
            add (x,y,z,light) to queue
        else:
            skyLight[x,y,z] = 0
            light = 0  // Opaque block stops propagation
```

**Phase 2: Horizontal BFS spread**
```
while queue not empty:
    (x, y, z, light) = queue.dequeue()
    if light ≤ 1: continue  // Can't propagate further
    
    for each direction d ∈ {±X, ±Y, ±Z}:
        (nx, ny, nz) = (x, y, z) + d
        if out_of_bounds(nx, ny, nz): continue
        if isOpaque(block[nx,ny,nz]): continue
        
        new_light = light - 1
        if isFiltering(block[nx,ny,nz]):
            new_light = max(0, new_light - 1)
        
        if new_light > skyLight[nx,ny,nz]:
            skyLight[nx,ny,nz] = new_light
            queue.enqueue(nx, ny, nz, new_light)
```

**Time complexity**: O(n) where n = chunk volume (each block visited at most once)

**Space complexity**: O(n) for the queue in worst case (fully hollow chunk)

#### 4.3 Light Attenuation

Light decreases by 1 per block traversed:
```
L_new = L_current - 1
```

**Filtering blocks** (water, leaves, ice) subtract an additional 1:
```
L_new = max(0, L_current - 2)
```

**Maximum propagation distance**: 15 blocks from source

#### 4.4 Block Light System

Similar BFS algorithm, but sources are light-emitting blocks:

```
for each block (x,y,z):
    emission = EMISSION_TABLE[block[x,y,z]]
    if emission > 0:
        blockLight[x,y,z] = emission
        queue.enqueue(x, y, z, emission)

// Then BFS propagation (same as sky light phase 2)
```

**Light emission values:**
| Block | Emission Level |
|-------|----------------|
| Glowstone | 15 |
| Jack-o-lantern | 15 |
| Torch | 14 |
| Lava | 15 |
| Redstone torch | 7 |

#### 4.5 Per-Face Light Calculation

Each face samples light from the **adjacent air block** in its normal direction:

```
face_light(x, y, z, face_index) = light(x + nₓ, y + nᵧ, z + nᵤ)
```

Where (nₓ, nᵧ, nᵤ) is the face normal vector.

**Combined light level**:
```
combined = max(sky_light × day_brightness, block_light)
```

#### 4.6 Day/Night Cycle — Brightness Function

Sky brightness varies sinusoidally with time:

```
brightness(t) = B_min + (B_max - B_min) × (sin((t - t₀) × 2π) + 1) / 2
```

**Parameters:**
- t ∈ [0, 1]: Time of day (0 = midnight, 0.5 = noon)
- t₀ = 0.25: Phase shift (so max is at t = 0.5)
- B_min = 0.25: Night brightness (25%)
- B_max = 1.0: Day brightness (100%)

**Expanded:**
```
brightness(t) = 0.25 + 0.75 × (sin(2πt - π/2) + 1) / 2
              = 0.25 + 0.375 × (sin(2πt - π/2) + 1)
              = 0.25 + 0.375 × sin(2πt - π/2) + 0.375
              = 0.625 + 0.375 × sin(2πt - π/2)
```

**Values at key times:**
| Time | t | sin(2πt - π/2) | Brightness |
|------|---|----------------|------------|
| Midnight | 0 | -1 | 0.25 |
| Sunrise | 0.25 | 0 | 0.625 |
| Noon | 0.5 | 1 | 1.0 |
| Sunset | 0.75 | 0 | 0.625 |

#### 4.7 Light-to-Brightness Conversion (Gamma Curve)

Light level (0-15) is converted to rendering brightness using an exponential curve:

```
brightness(L) = B_min ^ (1 - L/15)
```

Where B_min = 0.05 (5% brightness at light level 0).

**Derivation:**
We want brightness values to follow human perception (Weber-Fechner law):
```
perceived_brightness ∝ log(actual_brightness)
```

So we use exponential scaling:
```
brightness(L) = B_min × (B_max / B_min) ^ (L/15)
              = 0.05 × (1.0 / 0.05) ^ (L/15)
              = 0.05 × 20 ^ (L/15)
              = 0.05 ^ (1 - L/15)  [equivalent form]
```

**Values:**
| Light Level | Brightness |
|-------------|------------|
| 0 | 0.050 |
| 3 | 0.092 |
| 7 | 0.215 |
| 11 | 0.499 |
| 15 | 1.000 |

#### 4.8 Vertex Color Application

Per-face brightness is baked into vertex colors during mesh construction:

```
vertex_color = (brightness, brightness, brightness)
```

The shader multiplies texture color by vertex color:
```
final_color = texture_color × vertex_color
```

This avoids per-pixel lighting calculations, improving performance.

---

### 5. Player Physics

The physics system simulates movement, gravity, and collisions using discrete time-step integration.

#### 5.1 Fixed Timestep Integration

Physics runs at a fixed rate independent of frame rate:

```
FIXED_DT = 1/60  // 16.67ms per physics step

accumulator += frame_delta_time
while accumulator >= FIXED_DT:
    update_physics(FIXED_DT)
    accumulator -= FIXED_DT
```

**Benefits:**
- Deterministic behavior regardless of frame rate
- Stable collision detection
- Consistent feel across hardware

#### 5.2 Semi-Implicit Euler Integration

Position and velocity updates use **semi-implicit (symplectic) Euler**:

```
v(t+dt) = v(t) + a(t) × dt         // Update velocity first
x(t+dt) = x(t) + v(t+dt) × dt      // Then position uses NEW velocity
```

**Comparison to explicit Euler:**
```
Explicit: x(t+dt) = x(t) + v(t) × dt     // Uses old velocity
Semi-implicit: x(t+dt) = x(t) + v(t+dt) × dt  // Uses new velocity
```

Semi-implicit Euler is **symplectic** — it conserves energy in oscillating systems better than explicit Euler.

#### 5.3 Input Direction Calculation

Movement input is converted to a world-space direction vector:

**Step 1: Build local direction from input**
```
local_dir = (0, 0, 0)
if W pressed: local_dir.z -= 1
if S pressed: local_dir.z += 1
if A pressed: local_dir.x -= 1
if D pressed: local_dir.x += 1

local_dir = normalize(local_dir)  // Length 1 or 0
```

**Step 2: Rotate by player yaw** (Y-axis rotation)
```
world_dir.x = local_dir.x × cos(yaw) + local_dir.z × sin(yaw)
world_dir.z = local_dir.z × cos(yaw) - local_dir.x × sin(yaw)
```

This is a 2D rotation matrix applied to (x, z):
```
[world_x]   [cos(θ)   sin(θ)] [local_x]
[world_z] = [-sin(θ)  cos(θ)] [local_z]
```

#### 5.4 Velocity-Based Movement

Target velocity is computed from input and speed limits:

```
target_speed = maxSpeed × speed_multiplier
target_velocity = direction × target_speed
```

**Speed multipliers:**
- Normal: 1.0 → 4.317 blocks/s
- Sprinting: 1.428 → 6.165 blocks/s
- Crouching: 0.3 → 1.295 blocks/s

#### 5.5 Acceleration Model

Velocity approaches target using exponential smoothing:

```
v_new = v + (v_target - v) × min(1, accel × dt)
```

**Rearranging:**
```
v_new = v × (1 - min(1, accel × dt)) + v_target × min(1, accel × dt)
```

This is a **lerp** toward target velocity each frame.

**Acceleration values:**
- Ground: 50 blocks/s² (reaches target in ~0.1s)
- Air: 10 blocks/s² (reaches target in ~0.5s)

**Time to 95% of target** (assuming accel × dt < 1):
```
v(t) = v_target × (1 - e^(-accel × t))
0.95 = 1 - e^(-accel × t)
t_95 = -ln(0.05) / accel ≈ 3 / accel
```

Ground: t_95 ≈ 0.06s, Air: t_95 ≈ 0.3s

#### 5.6 Friction/Deceleration

When not pressing movement keys, velocity decays:

```
v_new = v × max(0, 1 - friction × dt)
```

**Friction coefficients:**
- Ground: 12 → 99.5% decay in 0.25s
- Air: 1 → 63% decay in 1s

**Half-life calculation:**
```
v(t) = v₀ × (1 - friction × dt)^(t/dt)
     ≈ v₀ × e^(-friction × t)   // For small dt

t_half = ln(2) / friction
```

Ground: t_half ≈ 0.058s, Air: t_half ≈ 0.69s

#### 5.7 Gravity

Constant downward acceleration:

```
v_y(t+dt) = v_y(t) + g × dt
```

Where g = -28.42 blocks/s² (negative = downward)

**Comparison to real-world:**
- Earth gravity: 9.81 m/s²
- Minecraft-like: 28.42 blocks/s² (1 block ≈ 1m, so ~2.9× real gravity)

**Fall distance vs. time** (from rest):
```
h(t) = ½|g|t² = 14.21t²
```

| Time (s) | Distance (blocks) |
|----------|-------------------|
| 0.5 | 3.55 |
| 1.0 | 14.21 |
| 1.5 | 31.97 |
| 2.0 | 56.84 |

#### 5.8 Terminal Velocity

Downward velocity is clamped to prevent unrealistic speeds:

```
v_y = max(v_y, terminal_velocity)
```

Where terminal_velocity = -50 blocks/s

**Time to reach terminal velocity:**
```
t = (terminal_velocity - 0) / g = 50 / 28.42 ≈ 1.76s
```

**Fall distance to reach terminal:**
```
h = v_t² / (2|g|) = 2500 / 56.84 ≈ 44 blocks
```

#### 5.9 Jump Mechanics

Jump applies an instantaneous upward velocity:

```
if on_ground AND space_pressed:
    v_y = jump_speed  // 8.436 blocks/s
    on_ground = false
```

**Jump height calculation:**

At peak, v_y = 0:
```
0 = v₀ + g × t_peak
t_peak = v₀ / |g| = 8.436 / 28.42 ≈ 0.297s

h_peak = v₀ × t_peak + ½g × t_peak²
       = v₀²/(2|g|)
       = 8.436² / 56.84
       ≈ 1.25 blocks
```

**Total jump duration** (up and down):
```
t_total = 2 × t_peak ≈ 0.594s
```

#### 5.10 Player Bounding Box

The player is an **Axis-Aligned Bounding Box (AABB)**:

```
Standing:
  width = 0.6 blocks
  height = 1.8 blocks
  
Crouching:
  width = 0.6 blocks
  height = 1.5 blocks
```

**AABB definition:**
```
min_x = position.x - width/2 = position.x - 0.3
max_x = position.x + width/2 = position.x + 0.3
min_y = position.y - height/2
max_y = position.y + height/2
min_z = position.z - width/2 = position.z - 0.3
max_z = position.z + width/2 = position.z + 0.3
```

#### 5.11 Collision Detection

Check if player AABB overlaps any solid blocks:

```
is_position_free(x, y, z, height):
    min_block_x = floor(x - half_width + ε)
    max_block_x = floor(x + half_width - ε)
    // Similar for Y and Z
    
    for bx in min_block_x..max_block_x:
        for by in min_block_y..max_block_y:
            for bz in min_block_z..max_block_z:
                if not isPassable(block[bx,by,bz]):
                    return false
    return true
```

Where ε = 0.001 (small epsilon to avoid edge-case issues)

**Passable blocks**: air, water, tall grass, flowers, snow layer

#### 5.12 Collision Resolution

When player is stuck in a solid block, push them out:

**Algorithm:**
```
if not is_position_free(position):
    // Try pushing up
    for dy in [0.001, 0.002, ... 2.0]:
        if is_position_free(position + (0, dy, 0)):
            position.y += dy
            return
    
    // Try 8 horizontal directions
    directions = [(1,0), (-1,0), (0,1), (0,-1),
                  (1,1)/√2, (1,-1)/√2, (-1,1)/√2, (-1,-1)/√2]
    for dist in [0.001, 0.002, ... 2.0]:
        for (dx, dz) in directions:
            if is_position_free(position + (dx×dist, 0, dz×dist)):
                position.x += dx × dist
                position.z += dz × dist
                return
    
    // Try combined up + horizontal
    ...
```

#### 5.13 Ground Detection

Check if player is standing on solid ground:

```
on_ground = false
bottom_y = position.y - height/2

// Sample multiple points under the player
sample_points = [(0,0), (±half_width, ±half_depth), ...]
for (ox, oz) in sample_points:
    ground_y = getGroundHeight(position.x + ox, position.z + oz)
    if bottom_y - ground_y < threshold:  // threshold ≈ 0.01
        on_ground = true
        break
```

#### 5.14 Crouching Transition

Height change is smoothly interpolated:

```
current_height += (target_height - current_height) × min(1, lerp_speed × dt)
```

Where lerp_speed = 10.5 → 95% transition in ~0.3s

**Position adjustment** to keep feet at same level:
```
position.y += (current_height - previous_height) / 2
```

---

### 6. Ray Casting for Block Interaction

Block selection and placement require finding which block the player is looking at.

#### 6.1 Ray Origin and Direction

**First-person ray** starts at eye position:
```
origin = (player.x, player.y + eye_height, player.z)
```

Where eye_height = player_height × 0.5

**Direction from yaw and pitch angles:**

Using spherical coordinates (yaw = rotation around Y, pitch = rotation around X):
```
direction = (
    -sin(yaw) × cos(pitch),
    -sin(pitch),
    -cos(yaw) × cos(pitch)
)
```

**Derivation:**
Starting from forward vector (0, 0, -1):

1. Apply pitch rotation (around X-axis):
```
[1    0         0    ] [0 ]   [0          ]
[0  cos(p)  -sin(p) ] [0 ] = [-sin(p)    ]
[0  sin(p)   cos(p) ] [-1]   [-cos(p)    ]
```

2. Apply yaw rotation (around Y-axis):
```
[cos(y)   0   sin(y)] [0      ]   [-sin(y)×cos(p)]
[0        1   0     ] [-sin(p)] = [-sin(p)       ]
[-sin(y)  0   cos(y)] [-cos(p)]   [-cos(y)×cos(p)]
```

#### 6.2 Parametric Ray Equation

A ray is defined parametrically:
```
point(t) = origin + t × direction,  t ≥ 0
```

For any t value, this gives a point along the ray.

#### 6.3 DDA Voxel Traversal Algorithm

**Digital Differential Analyzer (DDA)** efficiently steps through voxels:

**Initialize:**
```
// Current voxel
voxel = floor(origin)

// Step direction for each axis
step_x = sign(direction.x)  // -1, 0, or 1
step_y = sign(direction.y)
step_z = sign(direction.z)

// Distance to next voxel boundary (in t units)
if direction.x != 0:
    t_delta_x = |1 / direction.x|
    if step_x > 0:
        t_max_x = (floor(origin.x) + 1 - origin.x) / direction.x
    else:
        t_max_x = (origin.x - floor(origin.x)) / direction.x
else:
    t_delta_x = ∞
    t_max_x = ∞

// Similar for Y and Z
```

**Main loop:**
```
while t < max_reach:
    // Check current voxel for solid block
    if isSolid(voxel):
        return {voxel, t, hit_face}
    
    // Step to next voxel boundary
    if t_max_x < t_max_y AND t_max_x < t_max_z:
        t_max_x += t_delta_x
        voxel.x += step_x
        hit_face = step_x > 0 ? NEGATIVE_X : POSITIVE_X
    elif t_max_y < t_max_z:
        t_max_y += t_delta_y
        voxel.y += step_y
        hit_face = step_y > 0 ? NEGATIVE_Y : POSITIVE_Y
    else:
        t_max_z += t_delta_z
        voxel.z += step_z
        hit_face = step_z > 0 ? NEGATIVE_Z : POSITIVE_Z
```

**Complexity**: O(distance) — visits each voxel along the ray exactly once

#### 6.4 Hit Point Calculation

Exact intersection point with block face:
```
hit_point = origin + t × direction
```

**Local coordinates** within the hit block:
```
local = hit_point - floor(hit_point)
// local ∈ [0, 1)³
```

#### 6.5 Face Detection for Block Placement

Determine which face was hit by finding closest face to hit point:

```
distances = [
    local.x,        // Distance to -X face
    1 - local.x,    // Distance to +X face
    local.y,        // Distance to -Y face
    1 - local.y,    // Distance to +Y face
    local.z,        // Distance to -Z face
    1 - local.z     // Distance to +Z face
]

hit_face = argmin(distances)
```

**Place position** = hit block + face normal:
```
place_position = hit_block + face_normal[hit_face]
```

#### 6.6 Reach Distance

Maximum interaction distance:
```
reach = 4.5 blocks
```

Ray marching terminates when:
```
|point(t) - origin| > reach
// or equivalently:
t > reach  (since |direction| = 1)
```

---

### 7. Cloud System

Volumetric clouds are rendered as 3D voxel blocks derived from a 2D texture.

#### 7.1 Cloud Texture Parsing

A PNG texture defines cloud shapes:
```
for each pixel (px, py):
    is_cloud = (alpha[px, py] > 128)
```

#### 7.2 World Position Mapping

Each texture pixel maps to a world-space cloud block:
```
pixel_scale = 12  // Each pixel = 12 blocks
cloud_height = 192  // Y level
thickness = 5  // Block height

world_x = (px - width/2) × pixel_scale + pixel_scale/2
world_z = (py - height/2) × pixel_scale + pixel_scale/2
world_y = cloud_height
```

#### 7.3 Neighbor Detection for Face Culling

Only exterior faces are rendered:
```
is_opaque(x, y) = pixel exists AND alpha > 128

needs_face_+X = NOT is_opaque(px + 1, py)
needs_face_-X = NOT is_opaque(px - 1, py)
needs_face_+Z = NOT is_opaque(px, py + 1)
needs_face_-Z = NOT is_opaque(px, py - 1)
needs_face_+Y = true  // Top always visible
needs_face_-Y = true  // Bottom always visible
```

#### 7.4 Directional Shading

Different brightness per face direction:
```
Top face (+Y):    color = (255, 255, 255)  // White
Side faces:       color = (204, 204, 204)  // 80% gray
Bottom face (-Y): color = (177, 177, 177)  // 69% gray
```

This simulates ambient occlusion without actual shadow computation.

#### 7.5 Instanced Mesh Rendering

Each face type uses InstancedMesh for efficient rendering:
```
top_mesh = InstancedMesh(plane_geometry, top_material, cloud_count)
bottom_mesh = InstancedMesh(plane_geometry, bottom_material, cloud_count)
side_meshes = [InstancedMesh(...) for each needed side face]
```

**Instance matrix** positions each cloud block:
```
for each cloud block:
    matrix.makeTranslation(world_x, world_y ± thickness/2, world_z)
    mesh.setMatrixAt(index, matrix)
```

#### 7.6 Cloud Tiling for Infinite Sky

Clouds tile seamlessly around the player:
```
tile_size = texture_width × pixel_scale

for tile_offset_x in [-1, 0, 1]:
    for tile_offset_z in [-1, 0, 1]:
        tile_group.position = (
            round(player.x / tile_size) × tile_size + tile_offset_x × tile_size,
            cloud_height,
            round(player.z / tile_size) × tile_size + tile_offset_z × tile_size
        )
```

---

### 8. Day/Night Cycle

#### 8.1 Cycle Timing

Default cycle parameters:
```
cycle_length = 20 minutes
day_length = 10 minutes
night_length = 7 minutes
transition_length = 3 minutes (dawn + dusk)
```

**Time normalization:**
```
t = ((current_time - cycle_start) mod cycle_length) / cycle_length
// t ∈ [0, 1)
```

#### 8.2 Celestial Orbit Mathematics

Sun and moon orbit in a vertical circle (XY plane):

**Orbit angle:**
```
θ = t × 2π
```

**Sun position:**
```
sun_position = (
    cos(θ) × orbit_radius,
    sin(θ) × orbit_radius,
    0
)
```

Where orbit_radius = 600 blocks (far enough to appear at infinity)

**Moon position** (opposite side of orbit):
```
moon_position = (
    cos(θ + π) × orbit_radius,
    sin(θ + π) × orbit_radius,
    0
) = -sun_position
```

#### 8.3 Celestial Body Orientation

Sun and moon always face the player:
```
celestial_body.lookAt(camera.position)
```

Or equivalently, their forward (-Z) axis points toward camera.

#### 8.4 Sky Color Interpolation

Sky color transitions between day and night:

**Color space**: RGB hex values
```
sky_day = 0x77A8FF = (119, 168, 255)
sky_night = 0x000000 = (0, 0, 0)
```

**Interpolation factor** from brightness function:
```
mix = brightness(t)  // 0.25 to 1.0

sky_color = lerp(sky_night, sky_day, mix)
          = sky_night + (sky_day - sky_night) × mix
```

**Per-channel:**
```
R = 0 + 119 × mix = 119 × mix
G = 0 + 168 × mix = 168 × mix
B = 0 + 255 × mix = 255 × mix
```

#### 8.5 Phase Breakdown

| Phase | Time Range (t) | Duration | Sky Brightness |
|-------|----------------|----------|----------------|
| Night | 0.00 - 0.175 | 7 min | 0.25-0.40 |
| Dawn | 0.175 - 0.325 | 3 min | 0.40-0.90 |
| Day | 0.325 - 0.675 | 7 min | 0.90-1.0-0.90 |
| Dusk | 0.675 - 0.825 | 3 min | 0.90-0.40 |
| Night | 0.825 - 1.00 | 3.5 min | 0.40-0.25 |

#### 8.6 Ambient Light Adjustment

Global ambient light intensity follows brightness:
```
ambient_intensity = base_ambient × brightness(t)
                  = 0.6 × brightness(t)
```

At noon: 0.6 × 1.0 = 0.6
At midnight: 0.6 × 0.25 = 0.15

---

### 9. Camera System

#### 9.1 First-Person Camera

Camera attached to the player with pitch rotation:

```
player (Object3D)
  └── pitch_object (Object3D) — rotates around X
        └── camera (PerspectiveCamera)
```

**Rotation constraints:**
```
yaw = player.rotation.y       ∈ (-∞, ∞)
pitch = pitch_object.rotation.x  ∈ (-π/2 + ε, π/2 - ε)
```

Where ε = 0.01 prevents gimbal lock at straight up/down.

#### 9.2 Mouse Look Mathematics

Mouse movement converts to rotation:
```
Δyaw = -movement_x × sensitivity
Δpitch = -movement_y × sensitivity
```

Where sensitivity = 0.002 radians/pixel

**Pitch clamping:**
```
pitch = clamp(pitch + Δpitch, -π/2 + 0.01, π/2 - 0.01)
```

#### 9.3 Third-Person Camera

Camera offset behind the player:
```
local_offset = (0, 0, distance)  // distance = 3 blocks

// Transform to world space via pitch_object
world_camera_pos = pitch_object.localToWorld(local_offset)
```

#### 9.4 Camera Collision Detection

Prevent camera clipping through blocks:

```
head_position = player position + eye offset
desired_position = third-person camera position
ray_direction = normalize(desired_position - head_position)
ray_length = |desired_position - head_position|

// Step along ray checking for solid blocks
for t from 0 to ray_length step 0.1:
    check_point = head_position + ray_direction × t
    if isSolid(block_at(check_point)):
        // Place camera just before collision
        camera_position = check_point - ray_direction × 0.25
        break
```

#### 9.5 Field of View Animation

FOV changes smoothly when sprinting:
```
default_fov = 75°
sprint_fov = 90°
lerp_speed = 0.15

target_fov = is_sprinting ? sprint_fov : default_fov
current_fov += (target_fov - current_fov) × lerp_speed
```

**Perspective projection matrix:**
```
aspect = window_width / window_height
near = 0.1
far = 1000

f = 1 / tan(fov/2)

projection = [
  f/aspect  0    0                         0
  0         f    0                         0
  0         0    (far+near)/(near-far)    -1
  0         0    2×far×near/(near-far)     0
]
```

---

### 10. Additional Mathematical Utilities

#### 10.1 Clamping Function
```
clamp(v, min, max) = max(min, min(max, v))
```

#### 10.2 Linear Interpolation
```
lerp(a, b, t) = a + (b - a) × t = a × (1 - t) + b × t
```

#### 10.3 Distance Calculations

**Euclidean distance:**
```
dist(a, b) = √((aₓ-bₓ)² + (aᵧ-bᵧ)² + (aᵤ-bᵤ)²)
```

**Squared distance** (avoiding sqrt for comparisons):
```
dist²(a, b) = (aₓ-bₓ)² + (aᵧ-bᵧ)² + (aᵤ-bᵤ)²
```

**Chunk distance** (for loading):
```
chunk_dist²(cx₁, cz₁, cx₂, cz₂) = (cx₁-cx₂)² + (cz₁-cz₂)²
```

#### 10.4 Vector Operations

**Normalization:**
```
normalize(v) = v / |v| = v / √(vₓ² + vᵧ² + vᵤ²)
```

**Dot product:**
```
a · b = aₓbₓ + aᵧbᵧ + aᵤbᵤ
```

**Cross product:**
```
a × b = (aᵧbᵤ - aᵤbᵧ, aᵤbₓ - aₓbᵤ, aₓbᵧ - aᵧbₓ)
```

#### 10.5 Hash Functions

**32-bit integer hash** (for seeded random):
```
hash(x) = x
hash ^= hash >> 13
hash *= 1274126177
hash ^= hash >> 16
return hash
```

**Spatial hash** (for deterministic features):
```
spatial_hash(x, y, z, seed) = hash(seed + x×374761393 + y×668265263 + z×1274126177)
```

These prime multipliers create good bit mixing.

---

### Summary Table

| System | Key Mathematical Concepts |
|--------|---------------------------|
| **Perlin Noise** | Gradient interpolation, quintic fade, permutation hashing |
| **Terrain** | fBm, domain warping, piecewise height functions, weighted blending |
| **Caves** | 3D noise thresholding, absolute value for tunnels |
| **Lighting** | BFS flood fill, exponential gamma, sinusoidal brightness |
| **Physics** | Semi-implicit Euler, AABB intersection, exponential smoothing |
| **Rendering** | Face culling, cross products, instanced geometry |
| **Ray Casting** | DDA voxel traversal, parametric rays |
| **Camera** | Rotation matrices, spherical coordinates, perspective projection |
| **Day/Night** | Circular orbit, sinusoidal brightness, RGB interpolation |