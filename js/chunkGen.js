// chunkGen.js
// Generates a chunk (16x16 columns) of height 384 (y from -64..319) using Perlin noise.
// Optimized with height-map caching and reduced per-block calculations.

import { createPerlin } from './perlin.js';
import { TERRAIN, CAVES } from './config.js';

export const CHUNK_SIZE = 16;
export const MIN_Y = -64;
export const MAX_Y = 319;
export const HEIGHT = MAX_Y - MIN_Y + 1; // 384

// Block IDs: 0=air,1=stone,2=dirt,3=grass,4=water,5=sand,6=wood,7=leaves

// Pre-allocate reusable heightmap for terrain generation (reduces GC pressure)
const heightMapCache = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function generateChunk(chunkX, chunkZ, seed = 0, opts = {}) {
  const perlin = createPerlin(seed);
  
  // Terrain parameters (from config, can be overridden by opts)
  const scale = opts.scale ?? TERRAIN.scale;
  const octaves = opts.octaves ?? TERRAIN.octaves;
  const persistence = opts.persistence ?? TERRAIN.persistence;
  const lacunarity = opts.lacunarity ?? TERRAIN.lacunarity;
  const amplitude = opts.amplitude ?? TERRAIN.amplitude;
  const baseHeight = opts.baseHeight ?? TERRAIN.baseHeight;
  const seaLevel = opts.seaLevel ?? TERRAIN.seaLevel;

  const size = CHUNK_SIZE * CHUNK_SIZE * HEIGHT;
  const data = new Uint8Array(size); // initialized to 0 (air)

  // Cave parameters
  const caveScale = opts.caveScale ?? CAVES.scale;
  const caveOctaves = opts.caveOctaves ?? CAVES.octaves;
  const caveThreshold = opts.caveThreshold ?? CAVES.threshold;
  const caveMaxY = opts.caveMaxY ?? CAVES.maxY;
  const caveOpenToSurface = opts.caveOpenToSurface ?? CAVES.openToSurface;

  // Cache common values
  const caveScaleYFactor = caveScale * 0.5;
  const seaMinYDiff = seaLevel - MIN_Y + 1;

  // OPTIMIZATION 1: Pre-compute height map for all columns first
  // This avoids redundant octaveNoise calls and allows better cache locality
  const chunkWorldX = chunkX * CHUNK_SIZE;
  const chunkWorldZ = chunkZ * CHUNK_SIZE;
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    const noiseX = worldX * scale;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const n = perlin.octaveNoise(noiseX, 0, worldZ * scale, octaves, persistence, lacunarity);
      heightMapCache[x * CHUNK_SIZE + z] = Math.floor(clamp(baseHeight + n * amplitude, MIN_Y, MAX_Y));
    }
  }

  // OPTIMIZATION 2: Only iterate from MIN_Y to max needed height per column
  // This drastically reduces iterations for flat terrain
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    const caveNoiseX = worldX * caveScale;
    
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const caveNoiseZ = worldZ * caveScale;
      const height = heightMapCache[x * CHUNK_SIZE + z];
      const colBase = (x * CHUNK_SIZE + z) * HEIGHT;
      const topIsSand = height < seaLevel;
      
      // Determine max Y we need to fill (either terrain height or sea level, whichever higher)
      const maxFillY = Math.max(height, seaLevel);
      
      for (let y = MIN_Y; y <= maxFillY; y++) {
        const idx = colBase + (y - MIN_Y);
        let placedId = 0;

        if (y <= height) {
          // Solid terrain
          if (y === height) {
            placedId = topIsSand ? 5 : 3; // sand or grass on top
          } else if (y >= height - 4) {
            placedId = 2; // dirt layer
          } else {
            placedId = 1; // stone
          }

          // Cave carving - only for non-grass blocks below cave max Y
          if (placedId !== 3 && y <= caveMaxY && (caveOpenToSurface || y <= height - 3)) {
            const cn = perlin.octaveNoise(caveNoiseX, y * caveScaleYFactor, caveNoiseZ, caveOctaves, 0.5, 2.0);
            const depthBias = (seaLevel - y) / seaMinYDiff;
            if (cn + depthBias * 0.5 > caveThreshold) placedId = 0;
          }
        } else if (y <= seaLevel) {
          placedId = 4; // water above terrain but below sea level
        }
        // else: air (already 0)

        data[idx] = placedId;
      }
    }
  }

  return {
    chunkX,
    chunkZ,
    data,
    heightMap: new Int16Array(heightMapCache) // Copy for tree placement use
  };
}
