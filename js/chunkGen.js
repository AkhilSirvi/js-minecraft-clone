// chunkGen.js
// Generates a chunk (16x16 columns) of height 384 (y from -64..319) using Perlin noise.
// Features: Biomes, complex terrain, caves, ores, trees, and vegetation.

import { createPerlin } from './perlin.js';
import { TERRAIN, CAVES, TREES, ORES as CONFIG_ORES, BIOMES } from './config.js';

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
const vegetationDensityCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
const treeDensityCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);

// Biome blending radius - how far to sample for smooth transitions
const BIOME_BLEND_RADIUS = 16;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function smoothstep(t) { return t * t * (3 - 2 * t); }

// Improved seeded random with better distribution
function seededRandom(x, z, seed) {
  let h = seed + x * 374761393 + z * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

// Hash function for more varied randomness
function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >>> 13)) * 1103515245;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Determine biome with smooth transitions based on climate values
function getBiome(temperature, humidity, continentalness, erosion, height, seaLevel) {
  // Ocean determination - low continentalness
  if (continentalness < 0.25) {
    return BIOME.OCEAN;
  }
  
  // Beach near coastlines (transitional zone)
  if (continentalness < 0.38 && height <= seaLevel + 4 && height >= seaLevel - 3) {
    // Use humidity to sometimes make swampy beaches
    if (humidity > 0.7 && temperature > 0.4) return BIOME.SWAMP;
    return BIOME.BEACH;
  }

  // Mountain biome - high continentalness with low erosion creates peaks
  if (continentalness > 0.85 && erosion < 0.4) {
    if (temperature < 0.35) return BIOME.SNOWY;
    return BIOME.MOUNTAINS;
  }
  
  // High altitude always tends toward snowy/mountains
  if (height > seaLevel + 60) {
    return temperature < 0.4 ? BIOME.SNOWY : BIOME.MOUNTAINS;
  }

  // Climate-based biome selection with smooth boundaries
  // Use Whittaker diagram-style classification
  
  // Cold biomes (temperature < 0.3)
  if (temperature < 0.28) {
    return BIOME.SNOWY;
  }
  
  // Cool biomes (0.28 - 0.45)
  if (temperature < 0.45) {
    if (humidity > 0.55) return BIOME.FOREST;
    if (humidity > 0.35) return BIOME.PLAINS;
    return BIOME.SNOWY; // Cold and dry = tundra-like
  }
  
  // Temperate biomes (0.45 - 0.65)
  if (temperature < 0.65) {
    if (humidity > 0.65) return BIOME.SWAMP;
    if (humidity > 0.45) return BIOME.FOREST;
    return BIOME.PLAINS;
  }
  
  // Warm biomes (0.65 - 0.8)
  if (temperature < 0.8) {
    if (humidity > 0.55) return BIOME.SWAMP;
    if (humidity > 0.35) return BIOME.SAVANNA;
    return BIOME.PLAINS;
  }
  
  // Hot biomes (> 0.8)
  if (humidity > 0.5) return BIOME.SAVANNA;
  if (humidity > 0.25) return BIOME.SAVANNA;
  return BIOME.DESERT;
}

// Get base terrain amplitude multiplier for a biome (without erosion factor)
function getBiomeTerrainScaleBase(biome) {
  switch (biome) {
    case BIOME.OCEAN: return 0.25;
    case BIOME.BEACH: return 0.08;
    case BIOME.PLAINS: return 0.35;
    case BIOME.FOREST: return 0.45;
    case BIOME.DESERT: return 0.30;
    case BIOME.MOUNTAINS: return 1.8;
    case BIOME.SNOWY: return 0.65;
    case BIOME.SWAMP: return 0.15;
    case BIOME.SAVANNA: return 0.40;
    default: return 0.4;
  }
}

// Get terrain amplitude multiplier based on biome with erosion factor
function getBiomeTerrainScale(biome, erosion) {
  const baseScale = getBiomeTerrainScaleBase(biome);
  // Erosion reduces terrain height variation
  return baseScale * lerp(1.0, 0.4, erosion);
}

// Get base height offset for a biome (used for blending)
function getBiomeHeightOffset(biome) {
  switch (biome) {
    case BIOME.OCEAN: return -15;
    case BIOME.BEACH: return 0;
    case BIOME.PLAINS: return 5;
    case BIOME.FOREST: return 8;
    case BIOME.DESERT: return 3;
    case BIOME.MOUNTAINS: return 40;
    case BIOME.SNOWY: return 12;
    case BIOME.SWAMP: return -2;
    case BIOME.SAVANNA: return 6;
    default: return 5;
  }
}

// Get surface block for biome
function getSurfaceBlock(biome, underwater) {
  if (underwater) {
    switch (biome) {
      case BIOME.DESERT: return 16; // red_sand
      case BIOME.SWAMP: return 15;  // clay
      case BIOME.OCEAN: return 9;   // gravel (deep ocean)
      default: return 5; // sand
    }
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
    case BIOME.SWAMP: return depth < 2 ? 15 : 2; // clay then dirt
    default: return 2; // dirt
  }
}

// Get vegetation probability for biome
function getBiomeVegetationDensity(biome) {
  switch (biome) {
    case BIOME.FOREST: return 0.65;
    case BIOME.PLAINS: return 0.35;
    case BIOME.SWAMP: return 0.55;
    case BIOME.SAVANNA: return 0.20;
    case BIOME.SNOWY: return 0.08;
    case BIOME.MOUNTAINS: return 0.15;
    case BIOME.DESERT: return 0.02;
    case BIOME.BEACH: return 0.0;
    case BIOME.OCEAN: return 0.0;
    default: return 0.25;
  }
}

// Get tree density for biome
function getBiomeTreeDensity(biome) {
  switch (biome) {
    case BIOME.FOREST: return 0.09;
    case BIOME.PLAINS: return 0.003;
    case BIOME.SWAMP: return 0.03;
    case BIOME.SAVANNA: return 0.006;
    case BIOME.SNOWY: return 0.012;
    case BIOME.MOUNTAINS: return 0.004;
    case BIOME.DESERT: return 0.0;
    case BIOME.BEACH: return 0.0;
    case BIOME.OCEAN: return 0.0;
    default: return 0.008;
  }
}

// Ore generation parameters: [blockId, minY, maxY, veinSize, rarity]
// Convert config ORES (named) into the internal array format.
// Mapping from config ore names to block IDs used in this generator.
const ORE_NAME_TO_ID = {
  coal: 10,
  iron: 11,
  gold: 12,
  diamond: 13,
};

let ORES = [];
if (CONFIG_ORES && typeof CONFIG_ORES === 'object') {
  ORES = Object.entries(CONFIG_ORES).map(([name, cfg]) => {
    const oreId = ORE_NAME_TO_ID[name] ?? cfg.blockId ?? null;
    if (oreId == null) return null;
    return [oreId, cfg.minY ?? -64, cfg.maxY ?? 32, cfg.veinSize ?? 4, cfg.rarity ?? 0.01];
  }).filter(Boolean);
}

// Fallback default ores if config didn't provide any
if (ORES.length === 0) {
  ORES = [
    [10, -64, 128, 12, 0.08],  // coal
    [11, -64, 64, 8, 0.06],    // iron
    [12, -64, 32, 6, 0.015],   // gold
    [13, -64, 16, 4, 0.005],   // diamond
  ];
}

export function generateChunk(chunkX, chunkZ, seed = 0, opts = {}) {
  const perlin = createPerlin(seed);
  const perlin2 = createPerlin(seed + 1000); // Secondary noise for variety
  const perlin3 = createPerlin(seed + 2000); // Tertiary noise for caves/ores
  const perlin4 = createPerlin(seed + 3000); // Vegetation/detail noise
  
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
  // PHASE 1: Generate climate maps with proper scales for biome coherence
  // ==========================================
  // Use larger scales for smoother, more realistic biome regions
  const temperatureScale = BIOMES.temperatureScale;   // Large scale for temperature bands
  const humidityScale = BIOMES.humidityScale;      // Medium scale for humidity variation
  const continentScale = BIOMES.continentScale;     // Very large scale for continent shapes
  const erosionScale = BIOMES.erosionScale;        // Erosion affects local terrain roughness
  const vegetationNoiseScale = BIOMES.vegetationScale; // Fine-grained vegetation patches
  const treeNoiseScale = BIOMES.treeClusterScale;      // Medium-grained tree clustering
  
  // Erosion cache for this chunk
  const erosionCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      
      // Temperature - varies smoothly across large distances (latitude-like)
      // Add domain warping for more natural shapes
      const warpX = perlin2.octaveNoise(worldX * 0.001, 0, worldZ * 0.001, 2, 0.5, 2.0) * 50;
      const warpZ = perlin2.octaveNoise(worldX * 0.001, 100, worldZ * 0.001, 2, 0.5, 2.0) * 50;
      
      const tempNoise = perlin.octaveNoise(
        (worldX + warpX) * temperatureScale, 
        0, 
        (worldZ + warpZ) * temperatureScale, 
        4, 0.5, 2.0
      );
      temperatureCache[idx] = clamp((tempNoise + 1) * 0.5, 0, 1);
      
      // Humidity - slightly different warping for variety
      const humidWarpX = perlin.octaveNoise(worldX * 0.0015, 50, worldZ * 0.0015, 2, 0.5, 2.0) * 40;
      const humidWarpZ = perlin.octaveNoise(worldX * 0.0015, 150, worldZ * 0.0015, 2, 0.5, 2.0) * 40;
      
      const humidNoise = perlin2.octaveNoise(
        (worldX + humidWarpX) * humidityScale,
        0,
        (worldZ + humidWarpZ) * humidityScale,
        4, 0.5, 2.0
      );
      humidityCache[idx] = clamp((humidNoise + 1) * 0.5, 0, 1);
      
      // Continentalness - large-scale land/ocean distribution
      const contBase = perlin.octaveNoise(worldX * continentScale, 200, worldZ * continentScale, 5, 0.55, 2.0);
      // Add ridge noise for mountain chains at continent edges
      const ridgeNoise = 1 - Math.abs(perlin2.octaveNoise(worldX * 0.003, 300, worldZ * 0.003, 3, 0.5, 2.0));
      const ridgeContribution = ridgeNoise * ridgeNoise * 0.3;
      // Bias toward land and add ridge contribution
      continentalnessCache[idx] = clamp(contBase + 0.4 + ridgeContribution, 0, 1.5);
      
      // Erosion - affects terrain roughness and creates river-like valleys
      const erosionNoise = perlin3.octaveNoise(worldX * erosionScale, 0, worldZ * erosionScale, 3, 0.5, 2.0);
      erosionCache[idx] = clamp((erosionNoise + 1) * 0.5, 0, 1);
      
      // Vegetation density noise - creates natural patches of vegetation
      // Use multiple octaves for varied patch sizes
      const vegNoise1 = perlin4.octaveNoise(worldX * vegetationNoiseScale, 0, worldZ * vegetationNoiseScale, 2, 0.5, 2.0);
      const vegNoise2 = perlin4.octaveNoise(worldX * vegetationNoiseScale * 0.3, 50, worldZ * vegetationNoiseScale * 0.3, 2, 0.5, 2.0);
      // Combine for patchy distribution (some areas have lots, some have none)
      const combinedVeg = (vegNoise1 * 0.6 + vegNoise2 * 0.4);
      vegetationDensityCache[idx] = clamp((combinedVeg + 0.3) * 0.8, 0, 1);
      
      // Tree density noise - creates forest clusters
      const treeNoise1 = perlin4.octaveNoise(worldX * treeNoiseScale, 100, worldZ * treeNoiseScale, 3, 0.5, 2.0);
      const treeNoise2 = perlin.octaveNoise(worldX * treeNoiseScale * 2.5, 150, worldZ * treeNoiseScale * 2.5, 2, 0.6, 2.0);
      treeDensityCache[idx] = clamp((treeNoise1 * 0.7 + treeNoise2 * 0.3 + 1) * 0.5, 0, 1);
    }
  }

  // ==========================================
  // PHASE 2: Generate heightmap with biome-aware terrain and BLENDED transitions
  // ==========================================
  
  // Helper function to compute biome at any world position for blending
  // (used for sampling nearby positions outside the current cached area)
  function computeBiomeAndScaleAt(wx, wz) {
    // Temperature with warping
    const warpX = perlin2.octaveNoise(wx * 0.001, 0, wz * 0.001, 2, 0.5, 2.0) * 50;
    const warpZ = perlin2.octaveNoise(wx * 0.001, 100, wz * 0.001, 2, 0.5, 2.0) * 50;
    const tempNoise = perlin.octaveNoise(
      (wx + warpX) * temperatureScale, 0, (wz + warpZ) * temperatureScale, 4, 0.5, 2.0
    );
    const temp = clamp((tempNoise + 1) * 0.5, 0, 1);
    
    // Humidity with warping
    const humidWarpX = perlin.octaveNoise(wx * 0.0015, 50, wz * 0.0015, 2, 0.5, 2.0) * 40;
    const humidWarpZ = perlin.octaveNoise(wx * 0.0015, 150, wz * 0.0015, 2, 0.5, 2.0) * 40;
    const humidNoise = perlin2.octaveNoise(
      (wx + humidWarpX) * humidityScale, 0, (wz + humidWarpZ) * humidityScale, 4, 0.5, 2.0
    );
    const humid = clamp((humidNoise + 1) * 0.5, 0, 1);
    
    // Continentalness
    const contBase = perlin.octaveNoise(wx * continentScale, 200, wz * continentScale, 5, 0.55, 2.0);
    const ridgeNoise = 1 - Math.abs(perlin2.octaveNoise(wx * 0.003, 300, wz * 0.003, 3, 0.5, 2.0));
    const cont = clamp(contBase + 0.4 + ridgeNoise * ridgeNoise * 0.3, 0, 1.5);
    
    // Erosion
    const erosionNoise = perlin3.octaveNoise(wx * erosionScale, 0, wz * erosionScale, 3, 0.5, 2.0);
    const eros = clamp((erosionNoise + 1) * 0.5, 0, 1);
    
    // Preliminary height
    const noiseX = wx * scale;
    const noiseZ = wz * scale;
    const baseN = perlin.octaveNoise(noiseX, 0, noiseZ, octaves, persistence, lacunarity);
    
    let contHeight;
    if (cont < 0.25) {
      contHeight = seaLevel - 20 - (0.25 - cont) * 40;
    } else if (cont < 0.4) {
      const t = (cont - 0.25) / 0.15;
      contHeight = lerp(seaLevel - 20, seaLevel + 5, smoothstep(t));
    } else if (cont < 0.8) {
      const t = (cont - 0.4) / 0.4;
      contHeight = lerp(seaLevel + 5, baseHeight + 20, t);
    } else {
      const t = (cont - 0.8) / 0.5;
      contHeight = baseHeight + 20 + t * 50;
    }
    
    const prelimH = Math.floor(clamp(contHeight + baseN * amplitude * 0.3, MIN_Y, MAX_Y));
    const biome = getBiome(temp, humid, cont, eros, prelimH, seaLevel);
    
    return {
      biome,
      terrainScale: getBiomeTerrainScaleBase(biome),
      heightOffset: getBiomeHeightOffset(biome),
      erosion: eros,
      continentalness: cont,
      continentHeight: contHeight
    };
  }
  
  // Get blended terrain parameters by sampling nearby positions
  function getBlendedTerrainParams(worldX, worldZ, localIdx) {
    // Use cached values if within chunk bounds
    const lx = worldX - chunkWorldX;
    const lz = worldZ - chunkWorldZ;
    const inChunk = lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE;
    
    let totalWeight = 0;
    let blendedScale = 0;
    let blendedOffset = 0;
    let blendedErosion = 0;
    
    // Sample in a grid pattern for blending
    const sampleStep = 4; // Sample every 4 blocks for efficiency
    const blendRadius = BIOME_BLEND_RADIUS;
    
    for (let dx = -blendRadius; dx <= blendRadius; dx += sampleStep) {
      for (let dz = -blendRadius; dz <= blendRadius; dz += sampleStep) {
        const sampleX = worldX + dx;
        const sampleZ = worldZ + dz;
        
        // Distance-based weight with smooth falloff
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > blendRadius) continue;
        
        // Smooth falloff weight
        const normalizedDist = dist / blendRadius;
        const weight = 1 - normalizedDist * normalizedDist; // Quadratic falloff
        const smoothWeight = weight * weight; // Extra smoothing
        
        if (smoothWeight <= 0.001) continue;
        
        // Get biome data at sample position
        const slx = sampleX - chunkWorldX;
        const slz = sampleZ - chunkWorldZ;
        
        let sampleData;
        if (slx >= 0 && slx < CHUNK_SIZE && slz >= 0 && slz < CHUNK_SIZE) {
          // Use cached data
          const sampleIdx = slx * CHUNK_SIZE + slz;
          const temp = temperatureCache[sampleIdx];
          const humid = humidityCache[sampleIdx];
          const cont = continentalnessCache[sampleIdx];
          const eros = erosionCache[sampleIdx];
          
          let contHeight;
          if (cont < 0.25) {
            contHeight = seaLevel - 20 - (0.25 - cont) * 40;
          } else if (cont < 0.4) {
            const t = (cont - 0.25) / 0.15;
            contHeight = lerp(seaLevel - 20, seaLevel + 5, smoothstep(t));
          } else if (cont < 0.8) {
            const t = (cont - 0.4) / 0.4;
            contHeight = lerp(seaLevel + 5, baseHeight + 20, t);
          } else {
            const t = (cont - 0.8) / 0.5;
            contHeight = baseHeight + 20 + t * 50;
          }
          
          const baseN = perlin.octaveNoise(sampleX * scale, 0, sampleZ * scale, octaves, persistence, lacunarity);
          const prelimH = Math.floor(clamp(contHeight + baseN * amplitude * 0.3, MIN_Y, MAX_Y));
          const biome = getBiome(temp, humid, cont, eros, prelimH, seaLevel);
          
          sampleData = {
            terrainScale: getBiomeTerrainScaleBase(biome),
            heightOffset: getBiomeHeightOffset(biome),
            erosion: eros
          };
        } else {
          // Compute for positions outside chunk
          sampleData = computeBiomeAndScaleAt(sampleX, sampleZ);
        }
        
        blendedScale += sampleData.terrainScale * smoothWeight;
        blendedOffset += sampleData.heightOffset * smoothWeight;
        blendedErosion += sampleData.erosion * smoothWeight;
        totalWeight += smoothWeight;
      }
    }
    
    if (totalWeight > 0) {
      return {
        terrainScale: blendedScale / totalWeight,
        heightOffset: blendedOffset / totalWeight,
        erosion: blendedErosion / totalWeight
      };
    }
    
    // Fallback to local values
    const eros = inChunk ? erosionCache[localIdx] : 0.5;
    return { terrainScale: 0.4, heightOffset: 5, erosion: eros };
  }
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    const noiseX = worldX * scale;
    
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      
      // Base terrain noise with multiple scales
      const baseNoise = perlin.octaveNoise(noiseX, 0, worldZ * scale, octaves, persistence, lacunarity);
      
      // Secondary detail noise for micro-terrain
      const detailNoise = perlin2.octaveNoise(worldX * scale * 2.5, 0, worldZ * scale * 2.5, 3, 0.5, 2.0) * 0.25;
      
      // Get climate values
      const continentalness = continentalnessCache[idx];
      const temperature = temperatureCache[idx];
      const humidity = humidityCache[idx];
      const erosion = erosionCache[idx];
      
      // Continent shaping - smooth transition from ocean to land
      let continentHeight;
      if (continentalness < 0.25) {
        // Deep ocean
        continentHeight = seaLevel - 20 - (0.25 - continentalness) * 40;
      } else if (continentalness < 0.4) {
        // Coastal/shallow water transition
        const t = (continentalness - 0.25) / 0.15;
        continentHeight = lerp(seaLevel - 20, seaLevel + 5, smoothstep(t));
      } else if (continentalness < 0.8) {
        // Normal land
        const t = (continentalness - 0.4) / 0.4;
        continentHeight = lerp(seaLevel + 5, baseHeight + 20, t);
      } else {
        // Mountains and highlands
        const t = (continentalness - 0.8) / 0.5;
        continentHeight = baseHeight + 20 + t * 50;
      }
      
      // Calculate preliminary height for biome determination
      const prelimHeight = Math.floor(clamp(continentHeight + baseNoise * amplitude * 0.3, MIN_Y, MAX_Y));
      
      // Determine biome with erosion parameter (for block placement later)
      const biome = getBiome(temperature, humidity, continentalness, erosion, prelimHeight, seaLevel);
      biomeMapCache[idx] = biome;
      
      // Get BLENDED terrain parameters for smooth transitions
      const blendedParams = getBlendedTerrainParams(worldX, worldZ, idx);
      const blendedScale = blendedParams.terrainScale * lerp(1.0, 0.4, blendedParams.erosion);
      const blendedOffset = blendedParams.heightOffset;
      
      const combinedNoise = baseNoise + detailNoise;
      
      // Calculate height using blended parameters
      let finalHeight;
      
      // Special handling for extreme biomes, but blend the contribution
      const mountainInfluence = blendedParams.terrainScale > 1.2 ? (blendedParams.terrainScale - 1.2) / 0.6 : 0;
      const oceanInfluence = blendedParams.terrainScale < 0.2 ? (0.2 - blendedParams.terrainScale) / 0.15 : 0;
      const swampInfluence = blendedParams.heightOffset < 0 ? Math.min(1, -blendedParams.heightOffset / 3) : 0;
      
      // Base height calculation with blended scale
      let baseHeight_calc = continentHeight + combinedNoise * amplitude * blendedScale + blendedOffset * 0.5;
      
      // Mountain contribution (blended in based on how "mountainous" the blend is)
      if (mountainInfluence > 0) {
        const mountainNoise = Math.abs(perlin.octaveNoise(worldX * 0.015, 0, worldZ * 0.015, 4, 0.5, 2.0));
        const peakNoise = perlin2.octaveNoise(worldX * 0.03, 50, worldZ * 0.03, 2, 0.5, 2.0);
        const mountainBonus = mountainNoise * 55 + Math.max(0, peakNoise) * 25;
        baseHeight_calc += mountainBonus * smoothstep(mountainInfluence);
      }
      
      // Ocean floor contribution (blended)
      if (oceanInfluence > 0) {
        const oceanFloorNoise = perlin.octaveNoise(worldX * 0.02, 0, worldZ * 0.02, 2, 0.5, 2.0);
        const oceanHeight = seaLevel - 18 + oceanFloorNoise * 12 + combinedNoise * 8;
        baseHeight_calc = lerp(baseHeight_calc, oceanHeight, smoothstep(oceanInfluence));
      }
      
      // Swamp flattening (blended)
      if (swampInfluence > 0) {
        const swampHeight = seaLevel + 1 + combinedNoise * 4 + detailNoise * 2;
        baseHeight_calc = lerp(baseHeight_calc, swampHeight, smoothstep(swampInfluence) * 0.7);
      }
      
      finalHeight = baseHeight_calc;
      
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
  // PHASE 4: Tree and vegetation generation with proper density variation
  // Trees are generated using world coordinates so they're consistent across chunks
  // We check a wider area to include trees from neighboring chunks that extend into this one
  // ==========================================
  
  // Helper to get height at any world position (for cross-chunk tree generation)
  function getHeightAt(wx, wz) {
    // Check if within current chunk
    const lx = wx - chunkWorldX;
    const lz = wz - chunkWorldZ;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return heightMapCache[lx * CHUNK_SIZE + lz];
    }
    // For positions outside chunk, calculate height using same noise
    const noiseX = wx * scale;
    const noiseZ = wz * scale;
    const baseNoise = perlin.octaveNoise(noiseX, 0, noiseZ, octaves, persistence, lacunarity);
    const detailNoise = perlin2.octaveNoise(wx * scale * 2.5, 0, wz * scale * 2.5, 3, 0.5, 2.0) * 0.25;
    
    // Simplified height calculation for neighboring chunks
    const warpX = perlin2.octaveNoise(wx * 0.001, 0, wz * 0.001, 2, 0.5, 2.0) * 50;
    const warpZ = perlin2.octaveNoise(wx * 0.001, 100, wz * 0.001, 2, 0.5, 2.0) * 50;
    const tempNoise = perlin.octaveNoise((wx + warpX) * 0.0015, 0, (wz + warpZ) * 0.0015, 4, 0.5, 2.0);
    const temperature = clamp((tempNoise + 1) * 0.5, 0, 1);
    
    const contBase = perlin.octaveNoise(wx * 0.0008, 200, wz * 0.0008, 5, 0.55, 2.0);
    const ridgeNoise = 1 - Math.abs(perlin2.octaveNoise(wx * 0.003, 300, wz * 0.003, 3, 0.5, 2.0));
    const continentalness = clamp(contBase + 0.4 + ridgeNoise * ridgeNoise * 0.3, 0, 1.5);
    
    let continentHeight;
    if (continentalness < 0.25) {
      continentHeight = seaLevel - 20 - (0.25 - continentalness) * 40;
    } else if (continentalness < 0.4) {
      const t = (continentalness - 0.25) / 0.15;
      continentHeight = lerp(seaLevel - 20, seaLevel + 5, smoothstep(t));
    } else if (continentalness < 0.8) {
      const t = (continentalness - 0.4) / 0.4;
      continentHeight = lerp(seaLevel + 5, baseHeight + 20, t);
    } else {
      const t = (continentalness - 0.8) / 0.5;
      continentHeight = baseHeight + 20 + t * 50;
    }
    
    return Math.floor(clamp(continentHeight + (baseNoise + detailNoise) * amplitude * 0.4, MIN_Y, MAX_Y));
  }
  
  // Helper to get biome at any world position
  function getBiomeAt(wx, wz) {
    const lx = wx - chunkWorldX;
    const lz = wz - chunkWorldZ;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return biomeMapCache[lx * CHUNK_SIZE + lz];
    }
    // Calculate biome for positions outside chunk
    const warpX = perlin2.octaveNoise(wx * 0.001, 0, wz * 0.001, 2, 0.5, 2.0) * 50;
    const warpZ = perlin2.octaveNoise(wx * 0.001, 100, wz * 0.001, 2, 0.5, 2.0) * 50;
    const tempNoise = perlin.octaveNoise((wx + warpX) * 0.0015, 0, (wz + warpZ) * 0.0015, 4, 0.5, 2.0);
    const temperature = clamp((tempNoise + 1) * 0.5, 0, 1);
    
    const humidWarpX = perlin.octaveNoise(wx * 0.0015, 50, wz * 0.0015, 2, 0.5, 2.0) * 40;
    const humidWarpZ = perlin.octaveNoise(wx * 0.0015, 150, wz * 0.0015, 2, 0.5, 2.0) * 40;
    const humidNoise = perlin2.octaveNoise((wx + humidWarpX) * 0.0025, 0, (wz + humidWarpZ) * 0.0025, 4, 0.5, 2.0);
    const humidity = clamp((humidNoise + 1) * 0.5, 0, 1);
    
    const contBase = perlin.octaveNoise(wx * 0.0008, 200, wz * 0.0008, 5, 0.55, 2.0);
    const ridgeNoise = 1 - Math.abs(perlin2.octaveNoise(wx * 0.003, 300, wz * 0.003, 3, 0.5, 2.0));
    const continentalness = clamp(contBase + 0.4 + ridgeNoise * ridgeNoise * 0.3, 0, 1.5);
    
    const erosionNoise = perlin3.octaveNoise(wx * 0.004, 0, wz * 0.004, 3, 0.5, 2.0);
    const erosion = clamp((erosionNoise + 1) * 0.5, 0, 1);
    
    const h = getHeightAt(wx, wz);
    return getBiome(temperature, humidity, continentalness, erosion, h, seaLevel);
  }
  
  // Helper to check if a tree should spawn at world position
  function shouldTreeSpawnAt(wx, wz) {
    const biome = getBiomeAt(wx, wz);
    const height = getHeightAt(wx, wz);
    
    if (height <= seaLevel) return null;
    if (biome === BIOME.DESERT || biome === BIOME.BEACH || biome === BIOME.OCEAN) return null;
    
    // Tree density noise at this position
    const treeNoise1 = perlin4.octaveNoise(wx * 0.025, 100, wz * 0.025, 3, 0.5, 2.0);
    const treeNoise2 = perlin.octaveNoise(wx * 0.0625, 150, wz * 0.0625, 2, 0.6, 2.0);
    const localTreeDensity = clamp((treeNoise1 * 0.7 + treeNoise2 * 0.3 + 1) * 0.5, 0, 1);
    
    const biomeTreeDensity = getBiomeTreeDensity(biome);
    // Apply global treeProbability as an overall multiplier to allow config/opts control
    const effectiveTreeProb = biomeTreeDensity * (0.3 + localTreeDensity * 1.4) * treeProbability;
    
    const treeRand = seededRandom(wx, wz, seed + 3000);
    if (treeRand >= effectiveTreeProb) return null;
    
    // Return tree info
    let minH = treeMinHeight, maxH = treeMaxHeight;
    if (biome === BIOME.FOREST) { minH = 6; maxH = 10; }
    else if (biome === BIOME.SWAMP) { minH = 5; maxH = 8; }
    else if (biome === BIOME.SAVANNA) { minH = 4; maxH = 6; }
    
    const treeHeight = minH + Math.floor(seededRandom(wx, wz, seed + 3001) * (maxH - minH + 1));
    const leafRadius = biome === BIOME.SAVANNA ? 3 : 2;
    
    return { wx, wz, height, treeHeight, leafRadius, biome };
  }
  
  // Scan a wider area to find all trees that could affect this chunk
  // Trees can have leaves up to 3 blocks away, so check 4 blocks outside chunk
  const TREE_SCAN_MARGIN = 4;
  const treesToPlace = [];
  
  for (let wx = chunkWorldX - TREE_SCAN_MARGIN; wx < chunkWorldX + CHUNK_SIZE + TREE_SCAN_MARGIN; wx++) {
    for (let wz = chunkWorldZ - TREE_SCAN_MARGIN; wz < chunkWorldZ + CHUNK_SIZE + TREE_SCAN_MARGIN; wz++) {
      const treeInfo = shouldTreeSpawnAt(wx, wz);
      if (treeInfo) {
        // Check spacing from other trees
        const minSpacing = treeInfo.biome === BIOME.FOREST ? 3 : 5;
        let tooClose = false;
        
        for (const other of treesToPlace) {
          const dx = wx - other.wx;
          const dz = wz - other.wz;
          if (dx * dx + dz * dz < minSpacing * minSpacing) {
            tooClose = true;
            break;
          }
        }
        
        if (!tooClose) {
          treesToPlace.push(treeInfo);
        }
      }
    }
  }
  
  // Place trees - only modify blocks within this chunk
  for (const tree of treesToPlace) {
    const { wx, wz, height, treeHeight, leafRadius, biome } = tree;
    const localX = wx - chunkWorldX;
    const localZ = wz - chunkWorldZ;
    const isInChunk = localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE;
    
    // Place trunk (only if tree origin is in this chunk)
    if (isInChunk) {
      const colBase = (localX * CHUNK_SIZE + localZ) * HEIGHT;
      for (let ty = 1; ty <= treeHeight; ty++) {
        const trunkIdx = colBase + (height + ty - MIN_Y);
        if (trunkIdx < size) data[trunkIdx] = 6; // wood
      }
    }
    
    // Place leaves (can extend into this chunk from neighboring chunks)
    const leafStart = biome === BIOME.SAVANNA ? treeHeight - 1 : treeHeight - 2;
    const leafEnd = biome === BIOME.SAVANNA ? treeHeight + 2 : treeHeight + 3;
    
    for (let ly = leafStart; ly <= leafEnd; ly++) {
      const radiusAtHeight = biome === BIOME.SAVANNA 
        ? leafRadius 
        : (ly > treeHeight ? 1 : leafRadius);
      
      for (let lx = -radiusAtHeight; lx <= radiusAtHeight; lx++) {
        for (let lz = -radiusAtHeight; lz <= radiusAtHeight; lz++) {
          if (lx === 0 && lz === 0 && ly <= treeHeight) continue; // Skip trunk
          
          const leafWorldX = wx + lx;
          const leafWorldZ = wz + lz;
          const leafLocalX = leafWorldX - chunkWorldX;
          const leafLocalZ = leafWorldZ - chunkWorldZ;
          
          // Only place leaves within THIS chunk's bounds
          if (leafLocalX >= 0 && leafLocalX < CHUNK_SIZE && leafLocalZ >= 0 && leafLocalZ < CHUNK_SIZE) {
            const dist = Math.abs(lx) + Math.abs(lz);
            const maxDist = radiusAtHeight + (biome === BIOME.SAVANNA ? 0 : 1);
            
            if (dist <= maxDist) {
              const leafY = height + ly;
              const leafColBase = (leafLocalX * CHUNK_SIZE + leafLocalZ) * HEIGHT;
              const leafIdx = leafColBase + (leafY - MIN_Y);
              
              if (leafIdx >= 0 && leafIdx < size && data[leafIdx] === 0) {
                // Random leaf gaps for natural look
                const leafRand = hash3(leafWorldX, leafY, leafWorldZ);
                if (leafRand > 0.12) {
                  data[leafIdx] = 7; // leaves
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Cactus and dead bush generation in deserts
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      const height = heightMapCache[idx];
      const biome = biomeMapCache[idx];
      const colBase = idx * HEIGHT;
      
      if (height <= seaLevel) continue;
      if (biome !== BIOME.DESERT) continue;
      
      const surfaceIdx = colBase + (height - MIN_Y);
      const surfaceBlock = data[surfaceIdx];
      
      if (surfaceBlock !== 5) continue; // Only on sand
      
      const cactusRand = seededRandom(worldX, worldZ, seed + 5000);
      const localDensity = vegetationDensityCache[idx];
      
      if (cactusRand < 0.012 * localDensity) {
        const cactusHeight = 1 + Math.floor(seededRandom(worldX, worldZ, seed + 5001) * 3);
        for (let cy = 1; cy <= cactusHeight; cy++) {
          const cactusIdx = colBase + (height + cy - MIN_Y);
          if (cactusIdx < size) data[cactusIdx] = 19; // cactus
        }
      } else if (cactusRand < 0.035 * localDensity) {
        const bushIdx = colBase + (height + 1 - MIN_Y);
        if (bushIdx < size) data[bushIdx] = 20; // dead_bush
      }
    }
  }
  
  // Second pass: Vegetation (grass, flowers) - separate from trees
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      const height = heightMapCache[idx];
      const biome = biomeMapCache[idx];
      const colBase = idx * HEIGHT;
      
      // Skip inappropriate conditions
      if (height <= seaLevel) continue;
      if (biome === BIOME.DESERT || biome === BIOME.BEACH || biome === BIOME.OCEAN) continue;
      
      const surfaceIdx = colBase + (height - MIN_Y);
      const surfaceBlock = data[surfaceIdx];
      
      // Only on grass (snow biome gets less vegetation)
      if (surfaceBlock !== 3 && surfaceBlock !== 8) continue;
      
      const aboveIdx = colBase + (height + 1 - MIN_Y);
      if (aboveIdx >= size || data[aboveIdx] !== 0) continue; // Already occupied
      
      // Get vegetation density from noise and biome
      const localVegDensity = vegetationDensityCache[idx];
      const biomeVegDensity = getBiomeVegetationDensity(biome);
      
      // Combined probability with thresholding for patchy distribution
      // Only spawn vegetation where local density is above a threshold
      const densityThreshold = 0.25;
      if (localVegDensity < densityThreshold) continue;
      
      // Scale probability based on how far above threshold we are
      const effectiveDensity = (localVegDensity - densityThreshold) / (1 - densityThreshold);
      const vegProb = biomeVegDensity * effectiveDensity;
      
      // Per-block random check
      const vegRand = seededRandom(worldX, worldZ, seed + 4000);
      
      if (vegRand < vegProb) {
        // Determine vegetation type based on biome and random
        const typeRand = seededRandom(worldX, worldZ, seed + 4001);
        
        if (biome === BIOME.SNOWY) {
          // Snow biome: mostly nothing, occasional dead grass
          if (typeRand < 0.3) {
            data[aboveIdx] = 21; // tall_grass (sparse)
          }
        } else if (biome === BIOME.SWAMP) {
          // Swamp: lots of tall grass, some flowers
          if (typeRand < 0.85) {
            data[aboveIdx] = 21; // tall_grass
          } else {
            data[aboveIdx] = 22; // rose_bush
          }
        } else if (biome === BIOME.FOREST) {
          // Forest: mixed vegetation
          if (typeRand < 0.65) {
            data[aboveIdx] = 21; // tall_grass
          } else if (typeRand < 0.85) {
            data[aboveIdx] = 22; // rose_bush
          } else {
            data[aboveIdx] = 23; // sunflower
          }
        } else if (biome === BIOME.SAVANNA) {
          // Savanna: mostly tall dry grass
          if (typeRand < 0.92) {
            data[aboveIdx] = 21; // tall_grass
          } else {
            data[aboveIdx] = 20; // dead_bush
          }
        } else if (biome === BIOME.PLAINS) {
          // Plains: nice mix of grass and flowers
          if (typeRand < 0.60) {
            data[aboveIdx] = 21; // tall_grass
          } else if (typeRand < 0.80) {
            data[aboveIdx] = 22; // rose_bush  
          } else {
            data[aboveIdx] = 23; // sunflower
          }
        } else {
          // Default: mostly grass
          if (typeRand < 0.75) {
            data[aboveIdx] = 21; // tall_grass
          } else {
            data[aboveIdx] = 22; // rose_bush
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

// Exported helper: compute biome at arbitrary world coordinates using same noise parameters
export function getBiomeAtWorld(wx, wz, seed = SEED, opts = {}) {
  const perlin = createPerlin(seed);
  const perlin2 = createPerlin(seed + 1000);
  const perlin3 = createPerlin(seed + 2000);

  const scale = opts.scale ?? TERRAIN.scale;
  const octaves = opts.octaves ?? TERRAIN.octaves;
  const persistence = opts.persistence ?? TERRAIN.persistence;
  const lacunarity = opts.lacunarity ?? TERRAIN.lacunarity;
  const amplitude = opts.amplitude ?? TERRAIN.amplitude;
  const baseHeight = opts.baseHeight ?? TERRAIN.baseHeight;
  const seaLevel = opts.seaLevel ?? TERRAIN.seaLevel;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Compute warped temperature
  const warpX = perlin2.octaveNoise(wx * 0.001, 0, wz * 0.001, 2, 0.5, 2.0) * 50;
  const warpZ = perlin2.octaveNoise(wx * 0.001, 100, wz * 0.001, 2, 0.5, 2.0) * 50;
  const tempNoise = perlin.octaveNoise((wx + warpX) * 0.0015, 0, (wz + warpZ) * 0.0015, 4, 0.5, 2.0);
  const temperature = clamp((tempNoise + 1) * 0.5, 0, 1);

  const humidWarpX = perlin.octaveNoise(wx * 0.0015, 50, wz * 0.0015, 2, 0.5, 2.0) * 40;
  const humidWarpZ = perlin.octaveNoise(wx * 0.0015, 150, wz * 0.0015, 2, 0.5, 2.0) * 40;
  const humidNoise = perlin2.octaveNoise((wx + humidWarpX) * 0.0025, 0, (wz + humidWarpZ) * 0.0025, 4, 0.5, 2.0);
  const humidity = clamp((humidNoise + 1) * 0.5, 0, 1);

  const contBase = perlin.octaveNoise(wx * 0.0008, 200, wz * 0.0008, 5, 0.55, 2.0);
  const ridgeNoise = 1 - Math.abs(perlin2.octaveNoise(wx * 0.003, 300, wz * 0.003, 3, 0.5, 2.0));
  const continentalness = clamp(contBase + 0.4 + ridgeNoise * ridgeNoise * 0.3, 0, 1.5);

  const erosionNoise = perlin3.octaveNoise(wx * 0.004, 0, wz * 0.004, 3, 0.5, 2.0);
  const erosion = clamp((erosionNoise + 1) * 0.5, 0, 1);

  // compute approximate height at wx,wz (reuse approach from generateChunk.getHeightAt)
  const noiseX = wx * scale;
  const noiseZ = wz * scale;
  const baseNoise = perlin.octaveNoise(noiseX, 0, noiseZ, octaves, persistence, lacunarity);
  const detailNoise = perlin2.octaveNoise(wx * scale * 2.5, 0, wz * scale * 2.5, 3, 0.5, 2.0) * 0.25;

  let continentHeight;
  if (continentalness < 0.25) {
    continentHeight = seaLevel - 20 - (0.25 - continentalness) * 40;
  } else if (continentalness < 0.4) {
    const t = (continentalness - 0.25) / 0.15;
    continentHeight = (seaLevel - 20) + (seaLevel + 5 - (seaLevel - 20)) * (t * t * (3 - 2 * t));
  } else if (continentalness < 0.8) {
    const t = (continentalness - 0.4) / 0.4;
    continentHeight = (seaLevel + 5) + (baseHeight + 20 - (seaLevel + 5)) * t;
  } else {
    const t = (continentalness - 0.8) / 0.5;
    continentHeight = baseHeight + 20 + t * 50;
  }

  const height = Math.floor(clamp(continentHeight + (baseNoise + detailNoise) * amplitude * 0.4, MIN_Y, MAX_Y));

  // call module-scope getBiome helper (declared above) to get numeric id
  const biomeId = getBiome(temperature, humidity, continentalness, erosion, height, seaLevel);

  // Map numeric ids to readable names using the internal BIOME const
  const idToName = {};
  for (const k of Object.keys(BIOME)) idToName[BIOME[k]] = k.charAt(0) + k.slice(1).toLowerCase();
  return idToName[biomeId] || String(biomeId);
}
