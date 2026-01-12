// chunkGen.js
// Generates a chunk (16x16 columns) of height 384 (y from -64..319) using Perlin noise.
// Features: Biomes, complex terrain, caves, ores, trees, and vegetation.

import { createPerlin } from './perlin.js';
import { TERRAIN, CAVES, TREES } from './config.js';

export const CHUNK_SIZE = 16;
export const MIN_Y = -64;
export const MAX_Y = 319;
export const HEIGHT = MAX_Y - MIN_Y + 1; // 384

// Block IDs:
// 0=air, 1=stone, 2=dirt, 3=grass, 4=water, 5=sand, 6=oak_log, 7=oak_leaves
// 8=grass_snow (snowy grass), 9=gravel, 10=coal_ore, 11=iron_ore, 12=gold_ore, 13=diamond_ore
// 14=bedrock, 15=clay, 16=red_sand, 17=snow, 18=ice, 19=cactus
// 20=dead_bush, 21=tall_grass, 22=rose_bush, 23=sunflower

// Biome IDs
const BIOME = {
  PLAINS: 0,
  FOREST: 1,
  DESERT: 2,
  MOUNTAINS: 3,
  SNOWY: 4,
  BEACH: 5,
  OCEAN: 6,
  SWAMP: 7,
  SAVANNA: 8,
};

// Pre-allocate reusable arrays for terrain generation (reduces GC pressure)
const heightMapCache = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
const biomeMapCache = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
const temperatureCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
const humidityCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
const continentalnessCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function smoothstep(t) { return t * t * (3 - 2 * t); }

// Simple seeded random for deterministic decoration placement
function seededRandom(x, z, seed) {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

// Determine biome based on temperature, humidity, and continentalness
function getBiome(temperature, humidity, continentalness, height, seaLevel) {
  // Note: continentalness has +0.35 bias, so typical values are 0.0 to 1.2
  
  // Ocean determination - very low continentalness or deep underwater
  if (continentalness < 0.1 || height < seaLevel - 10) {
    return BIOME.OCEAN;
  }
  
  // Beach near coastlines (transitional continentalness AND near sea level)
  if (continentalness < 0.35 && height <= seaLevel + 3 && height >= seaLevel - 2) {
    return BIOME.BEACH;
  }

  // Mountain biome only for very high continentalness
  if (continentalness > 1.1) {
    if (temperature < 0.35) return BIOME.SNOWY;
    return BIOME.MOUNTAINS;
  }

  // Temperature and humidity based biomes for normal land
  if (temperature < 0.3) {
    return BIOME.SNOWY;
  } else if (temperature < 0.5) {
    // Cool/temperate - forest and plains
    return humidity > 0.4 ? BIOME.FOREST : BIOME.PLAINS;
  } else if (temperature < 0.7) {
    // Moderate temperatures
    if (humidity > 0.6) return BIOME.SWAMP;
    if (humidity > 0.4) return BIOME.FOREST;
    return BIOME.PLAINS;
  } else if (temperature < 0.85) {
    // Warm - savanna and plains
    return humidity > 0.35 ? BIOME.SAVANNA : BIOME.PLAINS;
  } else {
    // Hot - desert
    return BIOME.DESERT;
  }
}

// Get terrain amplitude multiplier based on biome
function getBiomeTerrainScale(biome) {
  switch (biome) {
    case BIOME.OCEAN: return 0.3;
    case BIOME.BEACH: return 0.1;
    case BIOME.PLAINS: return 0.4;
    case BIOME.FOREST: return 0.5;
    case BIOME.DESERT: return 0.35;
    case BIOME.MOUNTAINS: return 2.0;
    case BIOME.SNOWY: return 0.8;
    case BIOME.SWAMP: return 0.2;
    case BIOME.SAVANNA: return 0.45;
    default: return 0.5;
  }
}

// Get surface block for biome
function getSurfaceBlock(biome, underwater) {
  if (underwater) {
    return biome === BIOME.DESERT ? 16 : (biome === BIOME.SWAMP ? 15 : 5); // red_sand, clay, or sand
  }
  switch (biome) {
    case BIOME.DESERT: return 5; // sand
    case BIOME.BEACH: return 5; // sand
    case BIOME.SNOWY: return 8; // snow grass
    case BIOME.SWAMP: return 3; // grass
    case BIOME.SAVANNA: return 3; // grass
    case BIOME.MOUNTAINS: return 3; // grass (stone at high altitude handled separately)
    case BIOME.PLAINS: return 3; // grass
    case BIOME.FOREST: return 3; // grass
    default: return 3; // grass
  }
}

// Get subsurface block for biome
function getSubsurfaceBlock(biome, depth) {
  switch (biome) {
    case BIOME.DESERT: return depth < 4 ? 5 : 1; // sand then stone
    case BIOME.BEACH: return depth < 3 ? 5 : 2; // sand then dirt
    default: return 2; // dirt
  }
}

// Ore generation parameters: [blockId, minY, maxY, veinSize, rarity]
const ORES = [
  [10, -64, 128, 12, 0.08],  // coal - common, throughout
  [11, -64, 64, 8, 0.06],    // iron - moderately common
  [12, -64, 32, 6, 0.015],   // gold - rare, deep
  [13, -64, 16, 4, 0.005],   // diamond - very rare, very deep
];

export function generateChunk(chunkX, chunkZ, seed = 0, opts = {}) {
  const perlin = createPerlin(seed);
  const perlin2 = createPerlin(seed + 1000); // Secondary noise for variety
  const perlin3 = createPerlin(seed + 2000); // Tertiary noise for caves/ores
  
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

  // Tree parameters
  const treeProbability = opts.treeProbability ?? TREES.probability;
  const treeMinHeight = opts.treeMinHeight ?? TREES.minHeight;
  const treeMaxHeight = opts.treeMaxHeight ?? TREES.maxHeight;

  // Cache common values
  const caveScaleYFactor = caveScale * 0.5;
  const seaMinYDiff = seaLevel - MIN_Y + 1;

  const chunkWorldX = chunkX * CHUNK_SIZE;
  const chunkWorldZ = chunkZ * CHUNK_SIZE;

  // ==========================================
  // PHASE 1: Generate climate maps (temperature, humidity, continentalness)
  // ==========================================
  const climateScale = 0.008; // Scale for biome regions (higher = more variety)
  const continentScale = 0.003; // Scale for continent shapes
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      
      // Temperature (varies with latitude/z and some noise)
      const tempBase = perlin.octaveNoise(worldX * climateScale, 0, worldZ * climateScale * 0.5, 3, 0.5, 2.0);
      temperatureCache[idx] = clamp((tempBase + 1) * 0.5, 0, 1);
      
      // Humidity
      const humidBase = perlin2.octaveNoise(worldX * climateScale * 1.5, 0, worldZ * climateScale, 3, 0.5, 2.0);
      humidityCache[idx] = clamp((humidBase + 1) * 0.5, 0, 1);
      
      // Continentalness (determines land vs ocean, mountain ridges)
      const contBase = perlin.octaveNoise(worldX * continentScale, 100, worldZ * continentScale, 4, 0.6, 2.0);
      // Add ridge noise for mountain chains
      const ridgeNoise = Math.abs(perlin2.octaveNoise(worldX * 0.005, 200, worldZ * 0.005, 2, 0.5, 2.0));
      // Bias towards land (add 0.3 to make more terrain above sea level)
      continentalnessCache[idx] = contBase + ridgeNoise * 0.4 + 0.35;
    }
  }

  // ==========================================
  // PHASE 2: Generate heightmap with biome-aware terrain
  // ==========================================
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    const noiseX = worldX * scale;
    
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      
      // Base terrain noise
      const baseNoise = perlin.octaveNoise(noiseX, 0, worldZ * scale, octaves, persistence, lacunarity);
      
      // Secondary detail noise
      const detailNoise = perlin2.octaveNoise(worldX * scale * 2, 0, worldZ * scale * 2, 3, 0.5, 2.0) * 0.3;
      
      // Erosion/river carving noise
      const erosion = Math.abs(perlin3.octaveNoise(worldX * 0.008, 0, worldZ * 0.008, 2, 0.5, 2.0));
      const erosionFactor = smoothstep(1 - erosion);
      
      // Get preliminary height to determine biome
      const continentalness = continentalnessCache[idx];
      const temperature = temperatureCache[idx];
      const humidity = humidityCache[idx];
      
      // Continent shaping - push ocean areas down, land up
      // Only push down for very negative continentalness (actual oceans)
      const continentHeight = continentalness > 0.2 
        ? baseHeight + (continentalness - 0.2) * 25 
        : continentalness > -0.2 
          ? baseHeight + 5  // Slight elevation for coastal/plains areas
          : baseHeight + continentalness * 30;
      
      // Calculate preliminary height for biome determination
      const prelimHeight = Math.floor(clamp(continentHeight + baseNoise * amplitude * 0.5, MIN_Y, MAX_Y));
      
      // Determine biome
      const biome = getBiome(temperature, humidity, continentalness, prelimHeight, seaLevel);
      biomeMapCache[idx] = biome;
      
      // Calculate final height with biome-specific amplitude
      const biomeScale = getBiomeTerrainScale(biome);
      const combinedNoise = (baseNoise + detailNoise) * erosionFactor;
      
      let finalHeight;
      if (biome === BIOME.MOUNTAINS) {
        // Mountains get extra dramatic height
        const mountainNoise = Math.abs(perlin.octaveNoise(worldX * 0.02, 0, worldZ * 0.02, 4, 0.5, 2.0));
        finalHeight = continentHeight + combinedNoise * amplitude * biomeScale + mountainNoise * 60;
      } else if (biome === BIOME.OCEAN) {
        // Ocean floor
        finalHeight = seaLevel - 15 + combinedNoise * 20;
      } else {
        finalHeight = continentHeight + combinedNoise * amplitude * biomeScale;
      }
      
      heightMapCache[idx] = Math.floor(clamp(finalHeight, MIN_Y, MAX_Y));
    }
  }

  // ==========================================
  // PHASE 3: Generate terrain blocks with caves and ores
  // ==========================================
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    const caveNoiseX = worldX * caveScale;
    
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const caveNoiseZ = worldZ * caveScale;
      const idx = x * CHUNK_SIZE + z;
      const height = heightMapCache[idx];
      const biome = biomeMapCache[idx];
      const colBase = idx * HEIGHT;
      // Only treat as underwater if actually in ocean/beach biome AND below sea level
      const underwater = (biome === BIOME.OCEAN || biome === BIOME.BEACH) && height < seaLevel;
      
      // Determine max Y we need to fill
      const maxFillY = Math.max(height, seaLevel);
      
      for (let y = MIN_Y; y <= maxFillY; y++) {
        const dataIdx = colBase + (y - MIN_Y);
        let placedId = 0;
        const depthFromSurface = height - y;

        if (y <= height) {
          // Bedrock layer at bottom
          if (y <= MIN_Y + 4) {
            const bedrockChance = (MIN_Y + 5 - y) / 5;
            if (seededRandom(worldX, worldZ + y * 1000, seed) < bedrockChance) {
              placedId = 14; // bedrock
              data[dataIdx] = placedId;
              continue;
            }
          }
          
          // Surface block
          if (y === height && !underwater) {
            placedId = getSurfaceBlock(biome, false);
          }
          // Subsurface layers
          else if (depthFromSurface <= 4) {
            placedId = underwater ? getSurfaceBlock(biome, true) : getSubsurfaceBlock(biome, depthFromSurface);
          }
          // Stone layer
          else {
            placedId = 1; // stone
            
            // Ore generation
            for (const [oreId, minY, maxY, veinSize, rarity] of ORES) {
              if (y >= minY && y <= maxY) {
                const oreNoise = perlin3.octaveNoise(
                  worldX * 0.1 + oreId * 100,
                  y * 0.1,
                  worldZ * 0.1 + oreId * 100,
                  1, 0.5, 2.0
                );
                if (oreNoise > 1 - rarity * veinSize) {
                  placedId = oreId;
                  break;
                }
              }
            }
          }

          // Cave carving
          if (placedId !== 14 && y <= caveMaxY && (caveOpenToSurface || depthFromSurface >= 3)) {
            // Main cave system
            const cn = perlin.octaveNoise(caveNoiseX, y * caveScaleYFactor, caveNoiseZ, caveOctaves, 0.5, 2.0);
            
            // Spaghetti caves (winding tunnels)
            const spaghettiNoise = perlin2.octaveNoise(
              worldX * caveScale * 0.7,
              y * caveScale * 0.3,
              worldZ * caveScale * 0.7,
              2, 0.5, 2.0
            );
            const spaghetti = Math.abs(spaghettiNoise) < 0.05;
            
            const depthBias = (seaLevel - y) / seaMinYDiff;
            const caveValue = cn + depthBias * 0.4;
            
            if (caveValue > caveThreshold || (spaghetti && y < seaLevel - 5)) {
              // Don't carve caves that would flood from water
              if (y > seaLevel || height > seaLevel) {
                placedId = 0;
              }
            }
          }
        } else if (y <= seaLevel) {
          // Water or ice above terrain but below sea level
          if (biome === BIOME.SNOWY && y === seaLevel) {
            placedId = 18; // ice on top
          } else {
            placedId = 4; // water
          }
        }

        data[dataIdx] = placedId;
      }
      
      // Snow layer on top for snowy biome
      if (biome === BIOME.SNOWY && height > seaLevel) {
        const snowIdx = colBase + (height + 1 - MIN_Y);
        if (snowIdx < size) {
          data[snowIdx] = 17; // snow layer
        }
      }
    }
  }

  // ==========================================
  // PHASE 4: Tree and vegetation generation
  // ==========================================
  const treePositions = [];
  
  for (let x = 1; x < CHUNK_SIZE - 1; x++) {
    const worldX = chunkWorldX + x;
    
    for (let z = 1; z < CHUNK_SIZE - 1; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      const height = heightMapCache[idx];
      const biome = biomeMapCache[idx];
      const colBase = idx * HEIGHT;
      
      // Skip underwater or invalid heights
      if (height <= seaLevel) continue;
      
      const surfaceIdx = colBase + (height - MIN_Y);
      const surfaceBlock = data[surfaceIdx];
      
      // Only place vegetation on grass or snow
      if (surfaceBlock !== 3 && surfaceBlock !== 8) {
        // Cactus in desert
        if (biome === BIOME.DESERT && surfaceBlock === 5) {
          const cactusRand = seededRandom(worldX, worldZ, seed + 5000);
          if (cactusRand < 0.01) {
            const cactusHeight = 1 + Math.floor(seededRandom(worldX, worldZ, seed + 5001) * 3);
            for (let cy = 1; cy <= cactusHeight; cy++) {
              const cactusIdx = colBase + (height + cy - MIN_Y);
              if (cactusIdx < size) data[cactusIdx] = 19; // cactus
            }
          }
          // Dead bush in desert
          else if (cactusRand < 0.03) {
            const bushIdx = colBase + (height + 1 - MIN_Y);
            if (bushIdx < size) data[bushIdx] = 20; // dead_bush
          }
        }
        continue;
      }
      
      const rand = seededRandom(worldX, worldZ, seed + 3000);
      
      // Tree probability varies by biome
      let biomeTreProb = treeProbability;
      if (biome === BIOME.FOREST) biomeTreProb *= 3;
      else if (biome === BIOME.SAVANNA) biomeTreProb *= 0.3;
      else if (biome === BIOME.SNOWY) biomeTreProb *= 0.5;
      else if (biome === BIOME.SWAMP) biomeTreProb *= 1.5;
      
      if (rand < biomeTreProb) {
        // Check spacing from other trees
        let tooClose = false;
        for (const [tx, tz] of treePositions) {
          const dx = worldX - tx;
          const dz = worldZ - tz;
          if (dx * dx + dz * dz < 9) { // Minimum 3 block spacing
            tooClose = true;
            break;
          }
        }
        
        if (!tooClose) {
          treePositions.push([worldX, worldZ]);
          const treeHeight = treeMinHeight + Math.floor(seededRandom(worldX, worldZ, seed + 3001) * (treeMaxHeight - treeMinHeight + 1));
          
          // Generate tree trunk
          for (let ty = 1; ty <= treeHeight; ty++) {
            const trunkIdx = colBase + (height + ty - MIN_Y);
            if (trunkIdx < size) data[trunkIdx] = 6; // wood
          }
          
          // Generate leaves (simple sphere pattern)
          const leafRadius = 2;
          const leafStart = treeHeight - 2;
          
          for (let ly = leafStart; ly <= treeHeight + 1; ly++) {
            const radiusAtHeight = ly > treeHeight ? 1 : leafRadius;
            for (let lx = -radiusAtHeight; lx <= radiusAtHeight; lx++) {
              for (let lz = -radiusAtHeight; lz <= radiusAtHeight; lz++) {
                if (lx === 0 && lz === 0 && ly <= treeHeight) continue; // Skip trunk
                
                const nx = x + lx;
                const nz = z + lz;
                
                // Only place leaves within chunk bounds
                if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
                  const dist = Math.abs(lx) + Math.abs(lz);
                  if (dist <= radiusAtHeight + 1) {
                    const leafY = height + ly;
                    const leafColBase = (nx * CHUNK_SIZE + nz) * HEIGHT;
                    const leafIdx = leafColBase + (leafY - MIN_Y);
                    if (leafIdx < size && data[leafIdx] === 0) {
                      // Random leaf gaps for natural look
                      if (seededRandom(worldX + lx, worldZ + lz + ly, seed + 4000) > 0.15) {
                        data[leafIdx] = 7; // leaves
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      // Tall grass and flowers - increased probability for more vegetation
      else if (rand < 0.48 && biome !== BIOME.SNOWY) {
        const aboveIdx = colBase + (height + 1 - MIN_Y);
        if (aboveIdx < size && data[aboveIdx] === 0) {
          const floraRand = seededRandom(worldX, worldZ, seed + 4000);
          if (floraRand < 0.75) { 
            data[aboveIdx] = 21; // tall_grass
          } else if (floraRand < 0.88) {
            data[aboveIdx] = 22; // rose_bush
          } else {
            data[aboveIdx] = 23; // sunflower
          }
        }
      }
    }
  }

  return {
    chunkX,
    chunkZ,
    data,
    heightMap: new Int16Array(heightMapCache),
    biomeMap: new Uint8Array(biomeMapCache)
  };
}
