import { createPerlin } from './perlin.js';
import { TERRAIN, CAVES, TREES, ORES as CONFIG_ORES, BIOMES, DEEPSLATE, LUSH_CAVES, AQUIFERS } from './config.js';
import { BLOCK } from '../data/blocks.js';

export const CHUNK_SIZE = 16;
export const MIN_Y = -64;
export const MAX_Y = 319;
export const HEIGHT = MAX_Y - MIN_Y + 1;

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

const heightMapCache = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
const biomeMapCache = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
const temperatureCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
const humidityCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
const continentalnessCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
const vegetationDensityCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
const treeDensityCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);

const BIOME_BLEND_RADIUS = BIOMES.blendDistance;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function smoothstep(t) { return t * t * (3 - 2 * t); }

function seededRandom(x, z, seed) {
  let h = seed + x * 374761393 + z * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >>> 13)) * 1103515245;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function getBiome(temperature, humidity, continentalness, erosion, height, seaLevel) {
  if (continentalness < 0.25) {
    return BIOME.OCEAN;
  }
  
  if (continentalness < 0.38 && height <= seaLevel + 4 && height >= seaLevel - 3) {
    if (humidity > 0.7 && temperature > 0.4) return BIOME.SWAMP;
    return BIOME.BEACH;
  }

  if (continentalness > 0.55 && erosion < 0.4) {
    if (temperature < 0.35) return BIOME.SNOWY;
    return BIOME.MOUNTAINS;
  }
  
  if (height > seaLevel + 60) {
    return temperature < 0.4 ? BIOME.SNOWY : BIOME.MOUNTAINS;
  }

  if (temperature < 0.28) {
    return BIOME.SNOWY;
  }
  
  if (temperature < 0.45) {
    if (humidity > 0.55) return BIOME.FOREST;
    if (humidity > 0.35) return BIOME.PLAINS;
    return BIOME.SNOWY;
  }
  
  if (temperature < 0.65) {
    if (humidity > 0.65) return BIOME.SWAMP;
    if (humidity > 0.45) return BIOME.FOREST;
    return BIOME.PLAINS;
  }
  
  if (temperature < 0.8) {
    if (humidity > 0.55) return BIOME.SWAMP;
    if (humidity > 0.35) return BIOME.SAVANNA;
    return BIOME.PLAINS;
  }
  
  if (humidity > 0.5) return BIOME.SAVANNA;
  if (humidity > 0.25) return BIOME.SAVANNA;
  return BIOME.DESERT;
}

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

function getSurfaceBlock(biome, underwater) {
  if (underwater) {
    switch (biome) {
      case BIOME.DESERT: return BLOCK.RED_SAND;
      case BIOME.SWAMP: return BLOCK.CLAY;
      case BIOME.OCEAN: return BLOCK.GRAVEL;
      default: return BLOCK.SAND;
    }
  }
  switch (biome) {
    case BIOME.DESERT: return BLOCK.SAND;
    case BIOME.BEACH: return BLOCK.SAND;
    case BIOME.SNOWY: return BLOCK.GRASS_SNOW;
    case BIOME.SWAMP: return BLOCK.GRASS;
    case BIOME.SAVANNA: return BLOCK.GRASS;
    case BIOME.MOUNTAINS: return BLOCK.GRASS;
    case BIOME.PLAINS: return BLOCK.GRASS;
    case BIOME.FOREST: return BLOCK.GRASS;
    default: return BLOCK.GRASS;
  }
}

function getSubsurfaceBlock(biome, depth) {
  switch (biome) {
    case BIOME.DESERT: return depth < 4 ? BLOCK.SAND : BLOCK.STONE;
    case BIOME.BEACH: return depth < 3 ? BLOCK.SAND : BLOCK.DIRT;
    case BIOME.SWAMP: return depth < 2 ? BLOCK.CLAY : BLOCK.DIRT;
    default: return BLOCK.DIRT;
  }
}

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

function getBiomeTreeDensity(biome) {
  switch (biome) {
    case BIOME.FOREST: return 0.9;
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

const ORE_NAME_TO_ID = {
  coal: BLOCK.COAL_ORE,
  iron: BLOCK.IRON_ORE,
  gold: BLOCK.GOLD_ORE,
  diamond: BLOCK.DIAMOND_ORE,
};

let ORES = [];
if (CONFIG_ORES && typeof CONFIG_ORES === 'object') {
  ORES = Object.entries(CONFIG_ORES).map(([name, cfg]) => {
    const oreId = ORE_NAME_TO_ID[name] ?? cfg.blockId ?? null;
    if (oreId == null) return null;
    return [oreId, cfg.minY ?? -64, cfg.maxY ?? 32, cfg.veinSize ?? 4, cfg.rarity ?? 0.01];
  }).filter(Boolean);
}

if (ORES.length === 0) {
  ORES = [
    [BLOCK.COAL_ORE, -64, 128, 12, 0.08],
    [BLOCK.IRON_ORE, -64, 64, 8, 0.06],
    [BLOCK.GOLD_ORE, -64, 32, 6, 0.015],
    [BLOCK.DIAMOND_ORE, -64, 16, 4, 0.005],
  ];
}

const DEEPSLATE_ORE_VARIANT = {
  [BLOCK.COAL_ORE]: BLOCK.DEEPSLATE_COAL_ORE,
  [BLOCK.IRON_ORE]: BLOCK.DEEPSLATE_IRON_ORE,
  [BLOCK.GOLD_ORE]: BLOCK.DEEPSLATE_GOLD_ORE,
  [BLOCK.DIAMOND_ORE]: BLOCK.DEEPSLATE_DIAMOND_ORE,
};

export function generateChunk(chunkX, chunkZ, seed = 0, opts = {}) {
  const perlin = createPerlin(seed);
  const perlin2 = createPerlin(seed + 1000);
  const perlin3 = createPerlin(seed + 2000);
  const perlin4 = createPerlin(seed + 3000); 
  const perlin5 = createPerlin(seed + 4000); 
  
  const scale = opts.scale ?? TERRAIN.scale;
  const octaves = opts.octaves ?? TERRAIN.octaves;
  const persistence = opts.persistence ?? TERRAIN.persistence;
  const lacunarity = opts.lacunarity ?? TERRAIN.lacunarity;
  const amplitude = opts.amplitude ?? TERRAIN.amplitude;
  const baseHeight = opts.baseHeight ?? TERRAIN.baseHeight;
  const seaLevel = opts.seaLevel ?? TERRAIN.seaLevel;

  const size = CHUNK_SIZE * CHUNK_SIZE * HEIGHT;
  const data = new Uint16Array(size); 

  const caveMinY = opts.caveMinY ?? CAVES.minY;
  const caveMaxY = opts.caveMaxY ?? CAVES.maxY;
  const caveOpenToSurface = opts.caveOpenToSurface ?? CAVES.openToSurface;
  const surfaceOpenBuffer = opts.surfaceOpenBuffer ?? CAVES.surfaceOpenBuffer;

  const cheeseScale = opts.cheeseScale ?? CAVES.cheeseScale;
  const cheeseThreshold = opts.cheeseThreshold ?? CAVES.cheeseThreshold;
  const cheeseDepthBias = opts.cheeseDepthBias ?? CAVES.cheeseDepthBias;

  const megaCheeseScale = opts.megaCheeseScale ?? CAVES.megaCheeseScale;
  const megaCheeseThreshold = opts.megaCheeseThreshold ?? CAVES.megaCheeseThreshold;
  const megaCheeseMaxY = opts.megaCheeseMaxY ?? CAVES.megaCheeseMaxY;

  const spaghettiScale = opts.spaghettiScale ?? CAVES.spaghettiScale;
  const spaghettiThickness = opts.spaghettiThickness ?? CAVES.spaghettiThickness;

  const noodleScale = opts.noodleScale ?? CAVES.noodleScale;
  const noodleMinThickness = opts.noodleMinThickness ?? CAVES.noodleMinThickness;
  const noodleMaxThickness = opts.noodleMaxThickness ?? CAVES.noodleMaxThickness;
  const noodleMinY = opts.noodleMinY ?? CAVES.noodleMinY;
  const noodleMaxY = opts.noodleMaxY ?? CAVES.noodleMaxY;

  const pillarScale = opts.pillarScale ?? CAVES.pillarScale;
  const pillarThreshold = opts.pillarThreshold ?? CAVES.pillarThreshold;

  const deepslateStartY = opts.deepslateStartY ?? DEEPSLATE.transitionStartY;
  const deepslateEndY = opts.deepslateEndY ?? DEEPSLATE.transitionEndY;
  const deepslateBorderScale = opts.deepslateBorderScale ?? DEEPSLATE.borderNoiseScale;
  const deepslateBorderAmp = opts.deepslateBorderAmp ?? DEEPSLATE.borderNoiseAmplitude;

  const lushHumidityThreshold = opts.lushHumidityThreshold ?? LUSH_CAVES.humidityThreshold;
  const lushMaxY = opts.lushMaxY ?? LUSH_CAVES.maxY;
  const lushMossChance = opts.lushMossChance ?? LUSH_CAVES.mossFloorChance;
  const lushVineChance = opts.lushVineChance ?? LUSH_CAVES.vineChance;
  const lushVineMinLength = opts.lushVineMinLength ?? LUSH_CAVES.vineMinLength;
  const lushVineMaxLength = opts.lushVineMaxLength ?? LUSH_CAVES.vineMaxLength;
  const lushClayPoolChance = opts.lushClayPoolChance ?? LUSH_CAVES.clayPoolChance;

  const aquiferRegionScale = opts.aquiferRegionScale ?? AQUIFERS.regionScale;
  const aquiferRegionThreshold = opts.aquiferRegionThreshold ?? AQUIFERS.regionThreshold;
  const aquiferLevelScale = opts.aquiferLevelScale ?? AQUIFERS.levelScale;
  const aquiferLevelVariance = opts.aquiferLevelVariance ?? AQUIFERS.levelVariance;
  const aquiferMaxY = opts.aquiferMaxY ?? AQUIFERS.maxY;
  const aquiferAlwaysLavaMaxY = opts.aquiferAlwaysLavaMaxY ?? AQUIFERS.alwaysLavaMaxY;
  const aquiferLavaChanceBelowZero = opts.aquiferLavaChanceBelowZero ?? AQUIFERS.lavaChanceBelowZero;

  const treeProbability = opts.treeProbability ?? TREES.probability;
  const treeMinHeight = opts.treeMinHeight ?? TREES.minHeight;
  const treeMaxHeight = opts.treeMaxHeight ?? TREES.maxHeight;

  const seaMinYDiff = seaLevel - MIN_Y + 1;

  const chunkWorldX = chunkX * CHUNK_SIZE;
  const chunkWorldZ = chunkZ * CHUNK_SIZE;

  const temperatureScale = BIOMES.temperatureScale;
  const humidityScale = BIOMES.humidityScale;
  const continentScale = BIOMES.continentScale;
  const erosionScale = BIOMES.erosionScale;
  const vegetationNoiseScale = BIOMES.vegetationScale
  const treeNoiseScale = BIOMES.treeClusterScale;
  
  
  const erosionCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      
      
      
      const warpX = perlin2.octaveNoise(worldX * 0.001, 0, worldZ * 0.001, 2, 0.5, 2.0) * 50;
      const warpZ = perlin2.octaveNoise(worldX * 0.001, 100, worldZ * 0.001, 2, 0.5, 2.0) * 50;
      
      const tempNoise = perlin.octaveNoise(
        (worldX + warpX) * temperatureScale, 
        0, 
        (worldZ + warpZ) * temperatureScale, 
        4, 0.5, 2.0
      );
      temperatureCache[idx] = clamp((tempNoise + 1) * 0.5, 0, 1);
      
      
      const humidWarpX = perlin.octaveNoise(worldX * 0.0015, 50, worldZ * 0.0015, 2, 0.5, 2.0) * 40;
      const humidWarpZ = perlin.octaveNoise(worldX * 0.0015, 150, worldZ * 0.0015, 2, 0.5, 2.0) * 40;
      
      const humidNoise = perlin2.octaveNoise(
        (worldX + humidWarpX) * humidityScale,
        0,
        (worldZ + humidWarpZ) * humidityScale,
        4, 0.5, 2.0
      );
      humidityCache[idx] = clamp((humidNoise + 1) * 0.5, 0, 1);
      
      
      const contBase = perlin.octaveNoise(worldX * continentScale, 200, worldZ * continentScale, 5, 0.55, 2.0);
      
      const ridgeNoise = 1 - Math.abs(perlin2.octaveNoise(worldX * 0.003, 300, worldZ * 0.003, 3, 0.5, 2.0));
      const ridgeContribution = ridgeNoise * ridgeNoise * 0.3;
      
      continentalnessCache[idx] = clamp(contBase + 0.4 + ridgeContribution, 0, 1.5);
      
      
      const erosionNoise = perlin3.octaveNoise(worldX * erosionScale, 0, worldZ * erosionScale, 3, 0.5, 2.0);
      erosionCache[idx] = clamp((erosionNoise + 1) * 0.5, 0, 1);
      
      
      
      const vegNoise1 = perlin4.octaveNoise(worldX * vegetationNoiseScale, 0, worldZ * vegetationNoiseScale, 2, 0.5, 2.0);
      const vegNoise2 = perlin4.octaveNoise(worldX * vegetationNoiseScale * 0.3, 50, worldZ * vegetationNoiseScale * 0.3, 2, 0.5, 2.0);
      
      const combinedVeg = (vegNoise1 * 0.6 + vegNoise2 * 0.4);
      vegetationDensityCache[idx] = clamp((combinedVeg + 0.3) * 0.8, 0, 1);
      
      
      const treeNoise1 = perlin4.octaveNoise(worldX * treeNoiseScale, 100, worldZ * treeNoiseScale, 3, 0.5, 2.0);
      const treeNoise2 = perlin.octaveNoise(worldX * treeNoiseScale * 2.5, 150, worldZ * treeNoiseScale * 2.5, 2, 0.6, 2.0);
      treeDensityCache[idx] = clamp((treeNoise1 * 0.7 + treeNoise2 * 0.3 + 1) * 0.5, 0, 1);
    }
  }

  
  
  
  
  
  
  function computeBiomeAndScaleAt(wx, wz) {
    
    const warpX = perlin2.octaveNoise(wx * 0.001, 0, wz * 0.001, 2, 0.5, 2.0) * 50;
    const warpZ = perlin2.octaveNoise(wx * 0.001, 100, wz * 0.001, 2, 0.5, 2.0) * 50;
    const tempNoise = perlin.octaveNoise(
      (wx + warpX) * temperatureScale, 0, (wz + warpZ) * temperatureScale, 4, 0.5, 2.0
    );
    const temp = clamp((tempNoise + 1) * 0.5, 0, 1);
    
    
    const humidWarpX = perlin.octaveNoise(wx * 0.0015, 50, wz * 0.0015, 2, 0.5, 2.0) * 40;
    const humidWarpZ = perlin.octaveNoise(wx * 0.0015, 150, wz * 0.0015, 2, 0.5, 2.0) * 40;
    const humidNoise = perlin2.octaveNoise(
      (wx + humidWarpX) * humidityScale, 0, (wz + humidWarpZ) * humidityScale, 4, 0.5, 2.0
    );
    const humid = clamp((humidNoise + 1) * 0.5, 0, 1);
    
    
    const contBase = perlin.octaveNoise(wx * continentScale, 200, wz * continentScale, 5, 0.55, 2.0);
    const ridgeNoise = 1 - Math.abs(perlin2.octaveNoise(wx * 0.003, 300, wz * 0.003, 3, 0.5, 2.0));
    const cont = clamp(contBase + 0.4 + ridgeNoise * ridgeNoise * 0.3, 0, 1.5);
    
    
    const erosionNoise = perlin3.octaveNoise(wx * erosionScale, 0, wz * erosionScale, 3, 0.5, 2.0);
    const eros = clamp((erosionNoise + 1) * 0.5, 0, 1);
    
    
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
  
  
  function getBlendedTerrainParams(worldX, worldZ, localIdx) {
    
    const lx = worldX - chunkWorldX;
    const lz = worldZ - chunkWorldZ;
    const inChunk = lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE;
    
    let totalWeight = 0;
    let blendedScale = 0;
    let blendedOffset = 0;
    let blendedErosion = 0;
    
    
    const sampleStep = 4; 
    const blendRadius = BIOME_BLEND_RADIUS;
    
    for (let dx = -blendRadius; dx <= blendRadius; dx += sampleStep) {
      for (let dz = -blendRadius; dz <= blendRadius; dz += sampleStep) {
        const sampleX = worldX + dx;
        const sampleZ = worldZ + dz;
        
        
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > blendRadius) continue;
        
        
        const normalizedDist = dist / blendRadius;
        const weight = 1 - normalizedDist * normalizedDist; 
        const smoothWeight = weight * weight; 
        
        if (smoothWeight <= 0.001) continue;
        
        
        const slx = sampleX - chunkWorldX;
        const slz = sampleZ - chunkWorldZ;
        
        let sampleData;
        if (slx >= 0 && slx < CHUNK_SIZE && slz >= 0 && slz < CHUNK_SIZE) {
          
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
    
    
    const eros = inChunk ? erosionCache[localIdx] : 0.5;
    return { terrainScale: 0.4, heightOffset: 5, erosion: eros };
  }
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    const noiseX = worldX * scale;
    
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      
      
      const baseNoise = perlin.octaveNoise(noiseX, 0, worldZ * scale, octaves, persistence, lacunarity);
      
      
      const detailNoise = perlin2.octaveNoise(worldX * scale * 2.5, 0, worldZ * scale * 2.5, 3, 0.5, 2.0) * 0.25;
      
      
      const continentalness = continentalnessCache[idx];
      const temperature = temperatureCache[idx];
      const humidity = humidityCache[idx];
      const erosion = erosionCache[idx];
      
      
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
      
      
      const prelimHeight = Math.floor(clamp(continentHeight + baseNoise * amplitude * 0.3, MIN_Y, MAX_Y));
      
      
      const biome = getBiome(temperature, humidity, continentalness, erosion, prelimHeight, seaLevel);
      biomeMapCache[idx] = biome;
      const blendedParams = getBlendedTerrainParams(worldX, worldZ, idx);
      const blendedScale = blendedParams.terrainScale * lerp(1.0, 0.4, blendedParams.erosion);
      const blendedOffset = blendedParams.heightOffset;
      const combinedNoise = baseNoise + detailNoise;
      let finalHeight;
      
      
      const mountainInfluence = blendedParams.terrainScale > 1.2 ? (blendedParams.terrainScale - 1.2) / 0.6 : 0;
      const oceanInfluence = blendedParams.terrainScale < 0.2 ? (0.2 - blendedParams.terrainScale) / 0.15 : 0;
      const swampInfluence = blendedParams.heightOffset < 0 ? Math.min(1, -blendedParams.heightOffset / 3) : 0;
      
      
      let baseHeight_calc = continentHeight + combinedNoise * amplitude * blendedScale + blendedOffset * 0.5;
      if (mountainInfluence > 0) {
        const mountainNoise = Math.abs(perlin.octaveNoise(worldX * 0.015, 0, worldZ * 0.015, 4, 0.5, 2.0));
        const peakNoise = perlin2.octaveNoise(worldX * 0.03, 50, worldZ * 0.03, 2, 0.5, 2.0);
        const mountainBonus = mountainNoise * 55 + Math.max(0, peakNoise) * 25;
        baseHeight_calc += mountainBonus * smoothstep(mountainInfluence);
      }
      
      
      if (oceanInfluence > 0) {
        const oceanFloorNoise = perlin.octaveNoise(worldX * 0.02, 0, worldZ * 0.02, 2, 0.5, 2.0);
        const oceanHeight = seaLevel - 18 + oceanFloorNoise * 12 + combinedNoise * 8;
        baseHeight_calc = lerp(baseHeight_calc, oceanHeight, smoothstep(oceanInfluence));
      }
      
      
      if (swampInfluence > 0) {
        const swampHeight = seaLevel + 1 + combinedNoise * 4 + detailNoise * 2;
        baseHeight_calc = lerp(baseHeight_calc, swampHeight, smoothstep(swampInfluence) * 0.7);
      }
      
      finalHeight = baseHeight_calc;
      
      heightMapCache[idx] = Math.floor(clamp(finalHeight, MIN_Y, MAX_Y));
    }
  }

  
  
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      const height = heightMapCache[idx];
      const biome = biomeMapCache[idx];
      const colBase = idx * HEIGHT;
      
      const underwater = (biome === BIOME.OCEAN || biome === BIOME.BEACH) && height < seaLevel;
      
      
      const maxFillY = Math.max(height, seaLevel);
      
      for (let y = MIN_Y; y <= maxFillY; y++) {
        const dataIdx = colBase + (y - MIN_Y);
        let placedId = BLOCK.AIR;
        const depthFromSurface = height - y;

        if (y <= height) {
          
          if (y <= MIN_Y + 4) {
            const bedrockChance = (MIN_Y + 5 - y) / 5;
            if (seededRandom(worldX, worldZ + y * 1000, seed) < bedrockChance) {
              placedId = BLOCK.BEDROCK;
              data[dataIdx] = placedId;
              continue;
            }
          }
          
          
          if (y === height && !underwater) {
            placedId = getSurfaceBlock(biome, false);
          }
          
          else if (depthFromSurface <= 4) {
            placedId = underwater ? getSurfaceBlock(biome, true) : getSubsurfaceBlock(biome, depthFromSurface);
          }
          
          else {
            
            
            const deepslateT = clamp((deepslateStartY - y) / (deepslateStartY - deepslateEndY), 0, 1);
            const deepslateWobble = perlin5.octaveNoise(
              worldX * deepslateBorderScale, y * deepslateBorderScale, worldZ * deepslateBorderScale, 2, 0.5, 2.0
            );
            const isDeepslate = (deepslateT + deepslateWobble * 0.3) > 0.5;

            placedId = isDeepslate ? BLOCK.DEEPSLATE : BLOCK.STONE;
            
            
            for (const [oreId, minY, maxY, veinSize, rarity] of ORES) {
              if (y >= minY && y <= maxY) {
                const oreNoise = perlin3.octaveNoise(
                  worldX * 0.1 + oreId * 100,
                  y * 0.1,
                  worldZ * 0.1 + oreId * 100,
                  1, 0.5, 2.0
                );
                if (oreNoise > 1 - rarity * veinSize) {
                  placedId = isDeepslate ? (DEEPSLATE_ORE_VARIANT[oreId] ?? oreId) : oreId;
                  break;
                }
              }
            }
          }

          
          
          
          
          
          if (placedId !== BLOCK.BEDROCK && y >= caveMinY && y <= caveMaxY) {
            
            
            
            
            
            
            
            
            const warpScale = 0.015;
            const warpAmp = 5.5;
            const warpX = perlin5.octaveNoise(worldX * warpScale, y * warpScale, worldZ * warpScale, 2, 0.5, 2.0) * warpAmp;
            const warpY = perlin5.octaveNoise(worldX * warpScale + 400, y * warpScale, worldZ * warpScale + 400, 2, 0.5, 2.0) * warpAmp * 0.6;
            const warpZ = perlin5.octaveNoise(worldX * warpScale + 900, y * warpScale, worldZ * warpScale + 900, 2, 0.5, 2.0) * warpAmp;
            const wx = worldX + warpX;
            const wy = y + warpY;
            const wz = worldZ + warpZ;

            
            
            
            const depthFactor = clamp((seaLevel - y) / seaMinYDiff, 0, 1);
            const effectiveCheeseThreshold = cheeseThreshold - depthFactor * cheeseDepthBias;
            const cheeseNoise = perlin.octaveNoise(
              wx * cheeseScale, wy * cheeseScale * 1.2, wz * cheeseScale, 3, 0.5, 2.0
            );
            const cheeseCarve = cheeseNoise > effectiveCheeseThreshold;

            
            
            
            let megaCarve = false;
            let megaCheeseNoise = -1;
            if (y <= megaCheeseMaxY) {
              megaCheeseNoise = perlin5.octaveNoise(
                wx * megaCheeseScale, wy * megaCheeseScale * 0.6, wz * megaCheeseScale, 2, 0.5, 2.0
              );
              megaCarve = megaCheeseNoise > megaCheeseThreshold;
            }

            
            
            
            
            const spagA = perlin2.octaveNoise(
              wx * spaghettiScale, wy * spaghettiScale * 1.5, wz * spaghettiScale, 3, 0.5, 2.0
            );
            const spagB = perlin3.octaveNoise(
              wx * spaghettiScale + 500, wy * spaghettiScale * 1.5, wz * spaghettiScale + 500, 3, 0.5, 2.0
            );
            const spaghettiCarve = Math.abs(spagA) < spaghettiThickness && Math.abs(spagB) < spaghettiThickness;

            
            
            let noodleCarve = false;
            if (y >= noodleMinY && y <= noodleMaxY) {
              const noodleA = perlin4.octaveNoise(
                wx * noodleScale, wy * noodleScale * 2.5, wz * noodleScale, 3, 0.5, 2.0
              );
              const noodleB = perlin.octaveNoise(
                wx * noodleScale + 900, wy * noodleScale * 2.5, wz * noodleScale + 900, 3, 0.5, 2.0
              );
              const widthT = (perlin2.octaveNoise(
                wx * noodleScale * 0.5, wy * noodleScale * 0.5, wz * noodleScale * 0.5, 1, 0.5, 2.0
              ) + 1) * 0.5;
              const noodleThickness = lerp(noodleMinThickness, noodleMaxThickness, widthT);
              noodleCarve = Math.abs(noodleA) < noodleThickness && Math.abs(noodleB) < noodleThickness;
            }

            const bigCavern = cheeseCarve || megaCarve;
            let carve = bigCavern || spaghettiCarve || noodleCarve;

            
            
            if (carve && bigCavern) {
              const deepInCavern = cheeseCarve
                ? cheeseNoise > effectiveCheeseThreshold + 0.06
                : megaCheeseNoise > megaCheeseThreshold + 0.06;
              if (deepInCavern) {
                const pillarNoise = perlin3.octaveNoise(
                  worldX * pillarScale, 777, worldZ * pillarScale, 2, 0.5, 2.0
                );
                if (pillarNoise > pillarThreshold) carve = false;
              }
            }

            
            
            
            
            if (carve) {
              const nearSurface = depthFromSurface < surfaceOpenBuffer;
              const surfaceOk = !nearSurface || (caveOpenToSurface && bigCavern);
              
              const noOceanFlood = y > seaLevel || height > seaLevel;

              if (surfaceOk && noOceanFlood) {
                
                
                let fluid = BLOCK.AIR;
                if (y <= aquiferMaxY) {
                  const aquiferRegionNoise = perlin5.octaveNoise(
                    worldX * aquiferRegionScale, 300, worldZ * aquiferRegionScale, 2, 0.5, 2.0
                  );
                  if (aquiferRegionNoise > aquiferRegionThreshold) {
                    const tableNoise = perlin5.octaveNoise(
                      worldX * aquiferLevelScale, 700, worldZ * aquiferLevelScale, 2, 0.5, 2.0
                    );
                    const localTable = (seaLevel - 25) + tableNoise * aquiferLevelVariance;
                    if (y <= localTable) {
                      if (y <= aquiferAlwaysLavaMaxY) {
                        fluid = BLOCK.LAVA;
                      } else if (y < 0) {
                        const lavaRegionNoise = perlin3.octaveNoise(
                          worldX * 0.02, 900, worldZ * 0.02, 2, 0.5, 2.0
                        );
                        fluid = ((lavaRegionNoise + 1) * 0.5) < aquiferLavaChanceBelowZero ? BLOCK.LAVA : BLOCK.WATER;
                      } else {
                        fluid = BLOCK.WATER;
                      }
                    }
                  }
                }
                placedId = fluid === BLOCK.AIR ? BLOCK.AIR : fluid;
              }
            }
          }
        } else if (y <= seaLevel) {
          
          if (biome === BIOME.SNOWY && y === seaLevel) {
            placedId = BLOCK.ICE;
          } else {
            placedId = BLOCK.WATER;
          }
        }

        data[dataIdx] = placedId;
      }
      
      
      if (biome === BIOME.SNOWY && height > seaLevel) {
        const snowIdx = colBase + (height + 1 - MIN_Y);
        if (snowIdx < size) {
          data[snowIdx] = BLOCK.SNOW;
        }
      }
    }
  }

  
  
  
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      if (humidityCache[idx] < lushHumidityThreshold) continue;

      const height = heightMapCache[idx];
      const colBase = idx * HEIGHT;
      const hiY = Math.min(lushMaxY, height - 2);

      for (let y = caveMinY; y <= hiY; y++) {
        const dataIdx = colBase + (y - MIN_Y);
        if (data[dataIdx] !== BLOCK.AIR) continue;

        
        const floorIdx = dataIdx - 1;
        if (floorIdx >= colBase && (data[floorIdx] === BLOCK.STONE || data[floorIdx] === BLOCK.DEEPSLATE)) {
          const floorRand = seededRandom(worldX * 3 + 1, worldZ * 5 + y * 7, seed + 6001);
          if (floorRand < lushMossChance) {
            data[floorIdx] = BLOCK.MOSS_BLOCK;
          } else if (floorRand < lushMossChance + lushClayPoolChance) {
            data[floorIdx] = BLOCK.CLAY;
            data[dataIdx] = BLOCK.WATER; 
          }
        }

        
        const ceilIdx = dataIdx + 1;
        if (data[dataIdx] === BLOCK.AIR && ceilIdx < colBase + HEIGHT && (data[ceilIdx] === BLOCK.STONE || data[ceilIdx] === BLOCK.DEEPSLATE)) {
          const vineRand = seededRandom(worldX * 7 + 3, worldZ * 11 + y * 13, seed + 6002);
          if (vineRand < lushVineChance) {
            const vineLen = lushVineMinLength + Math.floor(
              seededRandom(worldX * 13 + 5, worldZ * 17 + y * 19, seed + 6003) * (lushVineMaxLength - lushVineMinLength + 1)
            );
            for (let k = 0; k < vineLen; k++) {
              const vIdx = dataIdx - k;
              if (vIdx < colBase || data[vIdx] !== BLOCK.AIR) break;
              data[vIdx] = BLOCK.CAVE_VINE;
            }
          }
        }
      }
    }
  }


  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  {
    const SMALL_POCKET_MAX = 10; 
    const MAX_VISIT = 4000; 
    const isVoid = (id) => id === BLOCK.AIR || id === BLOCK.WATER || id === BLOCK.LAVA;
    const visited = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * HEIGHT);

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const idx = x * CHUNK_SIZE + z;
        const height = heightMapCache[idx];
        const colBase = idx * HEIGHT;
        const loY = Math.max(caveMinY, MIN_Y + 1);
        const hiY = Math.min(caveMaxY, height - 2);

        for (let y = loY; y <= hiY; y++) {
          const startVIdx = colBase + (y - MIN_Y);
          if (visited[startVIdx] || !isVoid(data[startVIdx])) continue;

          
          
          
          
          
          
          
          
          
          const stack = [[x, z, y]];
          visited[startVIdx] = 1;
          const members = [[x, z, y]];
          let visitCount = 1;
          let exposed = false;

          while (stack.length > 0 && visitCount < MAX_VISIT) {
            const [cx, cz, cy] = stack.pop();
            const neighborOffsets = [
              [cx + 1, cz, cy], [cx - 1, cz, cy],
              [cx, cz + 1, cy], [cx, cz - 1, cy],
              [cx, cz, cy + 1], [cx, cz, cy - 1],
            ];

            for (const [nx, nz, ny] of neighborOffsets) {
              if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
                exposed = true; 
                continue;
              }
              const nIdx2d = nx * CHUNK_SIZE + nz;
              const nHeight = heightMapCache[nIdx2d];
              if (ny < MIN_Y || ny > nHeight - 2) {
                exposed = true; 
                continue;
              }
              const nVIdx = nIdx2d * HEIGHT + (ny - MIN_Y);
              if (visited[nVIdx] || !isVoid(data[nVIdx])) continue;

              visited[nVIdx] = 1;
              visitCount++;
              stack.push([nx, nz, ny]); 
              if (members.length < SMALL_POCKET_MAX) {
                members.push([nx, nz, ny]); 
              }
            }
          }

          if (!exposed && members.length < SMALL_POCKET_MAX) {
            for (const [fx, fz, fy] of members) {
              const fIdx2d = fx * CHUNK_SIZE + fz;
              const fDataIdx = fIdx2d * HEIGHT + (fy - MIN_Y);
              const deepslateT = clamp((deepslateStartY - fy) / (deepslateStartY - deepslateEndY), 0, 1);
              data[fDataIdx] = deepslateT > 0.5 ? BLOCK.DEEPSLATE : BLOCK.STONE;
            }
          }
        }
      }
    }
  }

  
  
  
  
  
  
  
  function computeClimateAt(wx, wz) {
    const warpX = perlin2.octaveNoise(wx * 0.001, 0, wz * 0.001, 2, 0.5, 2.0) * 50;
    const warpZ = perlin2.octaveNoise(wx * 0.001, 100, wz * 0.001, 2, 0.5, 2.0) * 50;
    const tempNoise = perlin.octaveNoise(
      (wx + warpX) * temperatureScale, 0, (wz + warpZ) * temperatureScale, 4, 0.5, 2.0
    );
    const temperature = clamp((tempNoise + 1) * 0.5, 0, 1);
    
    const humidWarpX = perlin.octaveNoise(wx * 0.0015, 50, wz * 0.0015, 2, 0.5, 2.0) * 40;
    const humidWarpZ = perlin.octaveNoise(wx * 0.0015, 150, wz * 0.0015, 2, 0.5, 2.0) * 40;
    const humidNoise = perlin2.octaveNoise(
      (wx + humidWarpX) * humidityScale, 0, (wz + humidWarpZ) * humidityScale, 4, 0.5, 2.0
    );
    const humidity = clamp((humidNoise + 1) * 0.5, 0, 1);
    
    const contBase = perlin.octaveNoise(wx * continentScale, 200, wz * continentScale, 5, 0.55, 2.0);
    const ridgeNoise = 1 - Math.abs(perlin2.octaveNoise(wx * 0.003, 300, wz * 0.003, 3, 0.5, 2.0));
    const continentalness = clamp(contBase + 0.4 + ridgeNoise * ridgeNoise * 0.3, 0, 1.5);
    
    const erosionNoise = perlin3.octaveNoise(wx * erosionScale, 0, wz * erosionScale, 3, 0.5, 2.0);
    const erosion = clamp((erosionNoise + 1) * 0.5, 0, 1);
    
    
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
    
    const baseN = perlin.octaveNoise(wx * scale, 0, wz * scale, octaves, persistence, lacunarity);
    const prelimH = Math.floor(clamp(continentHeight + baseN * amplitude * 0.3, MIN_Y, MAX_Y));
    const biome = getBiome(temperature, humidity, continentalness, erosion, prelimH, seaLevel);
    
    return {
      temperature, humidity, continentalness, erosion, continentHeight, biome,
      terrainScale: getBiomeTerrainScaleBase(biome),
      heightOffset: getBiomeHeightOffset(biome)
    };
  }

  function getBlendedParamsAt(wx, wz) {
    let totalWeight = 0;
    let blendedScale = 0;
    let blendedOffset = 0;
    let blendedErosion = 0;
    
    const sampleStep = 4;
    const blendRadius = BIOME_BLEND_RADIUS;
    
    for (let dx = -blendRadius; dx <= blendRadius; dx += sampleStep) {
      for (let dz = -blendRadius; dz <= blendRadius; dz += sampleStep) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > blendRadius) continue;
        
        const normalizedDist = dist / blendRadius;
        const weight = 1 - normalizedDist * normalizedDist;
        const smoothWeight = weight * weight;
        
        if (smoothWeight <= 0.001) continue;
        
        const sampleX = wx + dx;
        const sampleZ = wz + dz;
        
        
        const slx = sampleX - chunkWorldX;
        const slz = sampleZ - chunkWorldZ;
        
        let sampleData;
        if (slx >= 0 && slx < CHUNK_SIZE && slz >= 0 && slz < CHUNK_SIZE) {
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
          const climate = computeClimateAt(sampleX, sampleZ);
          sampleData = {
            terrainScale: climate.terrainScale,
            heightOffset: climate.heightOffset,
            erosion: climate.erosion
          };
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
    
    return { terrainScale: 0.4, heightOffset: 5, erosion: 0.5 };
  }
  
  function getHeightAt(wx, wz) {
    const lx = wx - chunkWorldX;
    const lz = wz - chunkWorldZ;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return heightMapCache[lx * CHUNK_SIZE + lz];
    }

    const climate = computeClimateAt(wx, wz);
    const {continentHeight} = climate;
    
    
    const noiseX = wx * scale;
    const noiseZ = wz * scale;
    const baseNoise = perlin.octaveNoise(noiseX, 0, noiseZ, octaves, persistence, lacunarity);
    const detailNoise = perlin2.octaveNoise(wx * scale * 2.5, 0, wz * scale * 2.5, 3, 0.5, 2.0) * 0.25;
    const combinedNoise = baseNoise + detailNoise;
    
    
    const blendedParams = getBlendedParamsAt(wx, wz);
    const blendedScale = blendedParams.terrainScale * lerp(1.0, 0.4, blendedParams.erosion);
    const blendedOffset = blendedParams.heightOffset;
    
    
    const mountainInfluence = blendedParams.terrainScale > 1.2 ? (blendedParams.terrainScale - 1.2) / 0.6 : 0;
    const oceanInfluence = blendedParams.terrainScale < 0.2 ? (0.2 - blendedParams.terrainScale) / 0.15 : 0;
    const swampInfluence = blendedParams.heightOffset < 0 ? Math.min(1, -blendedParams.heightOffset / 3) : 0;
    
    
    let finalHeight = continentHeight + combinedNoise * amplitude * blendedScale + blendedOffset * 0.5;
    
    
    if (mountainInfluence > 0) {
      const mountainNoise = Math.abs(perlin.octaveNoise(wx * 0.015, 0, wz * 0.015, 4, 0.5, 2.0));
      const peakNoise = perlin2.octaveNoise(wx * 0.03, 50, wz * 0.03, 2, 0.5, 2.0);
      const mountainBonus = mountainNoise * 55 + Math.max(0, peakNoise) * 25;
      finalHeight += mountainBonus * smoothstep(mountainInfluence);
    }
    
    
    if (oceanInfluence > 0) {
      const oceanFloorNoise = perlin.octaveNoise(wx * 0.02, 0, wz * 0.02, 2, 0.5, 2.0);
      const oceanHeight = seaLevel - 18 + oceanFloorNoise * 12 + combinedNoise * 8;
      finalHeight = lerp(finalHeight, oceanHeight, smoothstep(oceanInfluence));
    }
    
    
    if (swampInfluence > 0) {
      const swampHeight = seaLevel + 1 + combinedNoise * 4 + detailNoise * 2;
      finalHeight = lerp(finalHeight, swampHeight, smoothstep(swampInfluence) * 0.7);
    }
    
    return Math.floor(clamp(finalHeight, MIN_Y, MAX_Y));
  }
  
  
  function getBiomeAt(wx, wz) {
    const lx = wx - chunkWorldX;
    const lz = wz - chunkWorldZ;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return biomeMapCache[lx * CHUNK_SIZE + lz];
    }
    
    const climate = computeClimateAt(wx, wz);
    return climate.biome;
  }
  
  
  function shouldTreeSpawnAt(wx, wz) {
    const biome = getBiomeAt(wx, wz);
    const height = getHeightAt(wx, wz);
    
    if (height <= seaLevel) return null;
    if (biome === BIOME.DESERT || biome === BIOME.BEACH || biome === BIOME.OCEAN) return null;
    
    
    const treeNoise1 = perlin4.octaveNoise(wx * 0.025, 100, wz * 0.025, 3, 0.5, 2.0);
    const treeNoise2 = perlin.octaveNoise(wx * 0.0625, 150, wz * 0.0625, 2, 0.6, 2.0);
    const localTreeDensity = clamp((treeNoise1 * 0.7 + treeNoise2 * 0.3 + 1) * 0.5, 0, 1);
    
    const biomeTreeDensity = getBiomeTreeDensity(biome);
    
    const effectiveTreeProb = biomeTreeDensity * (0.3 + localTreeDensity * 1.4) * treeProbability;
    
    const treeRand = seededRandom(wx, wz, seed + 3000);
    if (treeRand >= effectiveTreeProb) return null;
    
    
    let minH = treeMinHeight, maxH = treeMaxHeight;
    if (biome === BIOME.FOREST) { minH = 6; maxH = 10; }
    else if (biome === BIOME.SWAMP) { minH = 5; maxH = 8; }
    else if (biome === BIOME.SAVANNA) { minH = 4; maxH = 6; }
    
    const treeHeight = minH + Math.floor(seededRandom(wx, wz, seed + 3001) * (maxH - minH + 1));
    const leafRadius = biome === BIOME.SAVANNA ? 3 : 2;
    
    return { wx, wz, height, treeHeight, leafRadius, biome };
  }
  
  const TREE_SCAN_MARGIN = 8; 
  
  
  const potentialTrees = [];
  
  for (let wx = chunkWorldX - TREE_SCAN_MARGIN; wx < chunkWorldX + CHUNK_SIZE + TREE_SCAN_MARGIN; wx++) {
    for (let wz = chunkWorldZ - TREE_SCAN_MARGIN; wz < chunkWorldZ + CHUNK_SIZE + TREE_SCAN_MARGIN; wz++) {
      const treeInfo = shouldTreeSpawnAt(wx, wz);
      if (treeInfo) {
        
        treeInfo.priority = seededRandom(wx, wz, seed + 7000);
        potentialTrees.push(treeInfo);
      }
    }
  }

  const treesToPlace = [];
  
  for (const tree of potentialTrees) {
    const { wx, wz, biome, priority } = tree;
    const minSpacing = biome === BIOME.FOREST ? 3 : 5;
    let shouldPlace = true;
    
    
    for (const other of potentialTrees) {
      if (other === tree) continue;
      
      const dx = wx - other.wx;
      const dz = wz - other.wz;
      const distSq = dx * dx + dz * dz;
      const otherMinSpacing = other.biome === BIOME.FOREST ? 3 : 5;
      const effectiveMinSpacing = Math.max(minSpacing, otherMinSpacing);
      
      if (distSq < effectiveMinSpacing * effectiveMinSpacing) {
        if (other.priority > priority || 
            (other.priority === priority && (other.wx < wx || (other.wx === wx && other.wz < wz)))) {
          shouldPlace = false;
          break;
        }
      }
    }
    
    if (shouldPlace) {
      treesToPlace.push(tree);
    }
  }
  
  
  for (const tree of treesToPlace) {
    const { wx, wz, height, treeHeight, leafRadius, biome } = tree;
    const localX = wx - chunkWorldX;
    const localZ = wz - chunkWorldZ;
    const isInChunk = localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE;
    
    
    if (isInChunk) {
      const colBase = (localX * CHUNK_SIZE + localZ) * HEIGHT;
      for (let ty = 1; ty <= treeHeight; ty++) {
        const trunkIdx = colBase + (height + ty - MIN_Y);
        if (trunkIdx < size) data[trunkIdx] = BLOCK.WOOD;
      }
    }
    
    const maxLeafRadius = biome === BIOME.SAVANNA ? leafRadius : leafRadius + 1;
    const leafMinX = wx - maxLeafRadius;
    const leafMaxX = wx + maxLeafRadius;
    const leafMinZ = wz - maxLeafRadius;
    const leafMaxZ = wz + maxLeafRadius;
    const chunkMaxX = chunkWorldX + CHUNK_SIZE - 1;
    const chunkMaxZ = chunkWorldZ + CHUNK_SIZE - 1;
    const leavesIntersectChunk = !(leafMaxX < chunkWorldX || leafMinX > chunkMaxX || 
                                   leafMaxZ < chunkWorldZ || leafMinZ > chunkMaxZ);
    
    if (!leavesIntersectChunk) continue;
    
    const leafStart = biome === BIOME.SAVANNA ? treeHeight - 1 : treeHeight - 2;
    const leafEnd = biome === BIOME.SAVANNA ? treeHeight + 2 : treeHeight + 3;
    
    for (let ly = leafStart; ly <= leafEnd; ly++) {
      const radiusAtHeight = biome === BIOME.SAVANNA 
        ? leafRadius 
        : (ly > treeHeight ? 1 : leafRadius);
      
      for (let lx = -radiusAtHeight; lx <= radiusAtHeight; lx++) {
        for (let lz = -radiusAtHeight; lz <= radiusAtHeight; lz++) {
          if (lx === 0 && lz === 0 && ly <= treeHeight) continue; 
          
          const leafWorldX = wx + lx;
          const leafWorldZ = wz + lz;
          const leafLocalX = leafWorldX - chunkWorldX;
          const leafLocalZ = leafWorldZ - chunkWorldZ;
          
          
          if (leafLocalX >= 0 && leafLocalX < CHUNK_SIZE && leafLocalZ >= 0 && leafLocalZ < CHUNK_SIZE) {
            const dist = Math.abs(lx) + Math.abs(lz);
            const maxDist = radiusAtHeight + (biome === BIOME.SAVANNA ? 0 : 1);
            
            if (dist <= maxDist) {
              const leafY = height + ly;
              const leafColBase = (leafLocalX * CHUNK_SIZE + leafLocalZ) * HEIGHT;
              const leafIdx = leafColBase + (leafY - MIN_Y);
              
              if (leafIdx >= 0 && leafIdx < size && data[leafIdx] === BLOCK.AIR) {
                const actualTerrainHeight = getHeightAt(leafWorldX, leafWorldZ);
                if (leafY > actualTerrainHeight) {
                  const leafRand = hash3(leafWorldX, leafY, leafWorldZ);
                  if (leafRand > 0.12) {
                    data[leafIdx] = BLOCK.LEAVES;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  
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
      
      if (surfaceBlock !== BLOCK.SAND) continue;
      
      const cactusRand = seededRandom(worldX, worldZ, seed + 5000);
      const localDensity = vegetationDensityCache[idx];
      
      if (cactusRand < 0.012 * localDensity) {
        const cactusHeight = 1 + Math.floor(seededRandom(worldX, worldZ, seed + 5001) * 3);
        for (let cy = 1; cy <= cactusHeight; cy++) {
          const cactusIdx = colBase + (height + cy - MIN_Y);
          if (cactusIdx < size) data[cactusIdx] = BLOCK.CACTUS;
        }
      } else if (cactusRand < 0.035 * localDensity) {
        const bushIdx = colBase + (height + 1 - MIN_Y);
        if (bushIdx < size) data[bushIdx] = BLOCK.DEAD_BUSH;
      }
    }
  }
  
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const worldX = chunkWorldX + x;
    
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldZ = chunkWorldZ + z;
      const idx = x * CHUNK_SIZE + z;
      const height = heightMapCache[idx];
      const biome = biomeMapCache[idx];
      const colBase = idx * HEIGHT;
      
      
      if (height <= seaLevel) continue;
      if (biome === BIOME.DESERT || biome === BIOME.BEACH || biome === BIOME.OCEAN) continue;
      
      const surfaceIdx = colBase + (height - MIN_Y);
      const surfaceBlock = data[surfaceIdx];
      
      
      if (surfaceBlock !== BLOCK.GRASS && surfaceBlock !== BLOCK.GRASS_SNOW) continue;
      
      const aboveIdx = colBase + (height + 1 - MIN_Y);
      if (aboveIdx >= size || data[aboveIdx] !== BLOCK.AIR) continue;
      
      
      const localVegDensity = vegetationDensityCache[idx];
      const biomeVegDensity = getBiomeVegetationDensity(biome);
      
      
      
      const densityThreshold = 0.25;
      if (localVegDensity < densityThreshold) continue;
      
      
      const effectiveDensity = (localVegDensity - densityThreshold) / (1 - densityThreshold);
      const vegProb = biomeVegDensity * effectiveDensity;
      
      
      const vegRand = seededRandom(worldX, worldZ, seed + 4000);
      
      if (vegRand < vegProb) {
        
        const typeRand = seededRandom(worldX, worldZ, seed + 4001);
        
        if (biome === BIOME.SNOWY) {
          
          if (typeRand < 0.3) {
            data[aboveIdx] = BLOCK.TALL_GRASS;
          }
        } else if (biome === BIOME.SWAMP) {
          
          if (typeRand < 0.85) {
            data[aboveIdx] = BLOCK.TALL_GRASS;
          } else {
            data[aboveIdx] = BLOCK.ROSE_BUSH;
          }
        } else if (biome === BIOME.FOREST) {
          
          if (typeRand < 0.65) {
            data[aboveIdx] = BLOCK.TALL_GRASS;
          } else if (typeRand < 0.85) {
            data[aboveIdx] = BLOCK.ROSE_BUSH;
          } else {
            data[aboveIdx] = BLOCK.SUNFLOWER;
          }
        } else if (biome === BIOME.SAVANNA) {
          
          if (typeRand < 0.92) {
            data[aboveIdx] = BLOCK.TALL_GRASS;
          } else {
            data[aboveIdx] = BLOCK.DEAD_BUSH;
          }
        } else if (biome === BIOME.PLAINS) {
          
          if (typeRand < 0.60) {
            data[aboveIdx] = BLOCK.TALL_GRASS;
          } else if (typeRand < 0.80) {
            data[aboveIdx] = BLOCK.ROSE_BUSH;
          } else {
            data[aboveIdx] = BLOCK.SUNFLOWER;
          }
        } else {
          
          if (typeRand < 0.75) {
            data[aboveIdx] = BLOCK.TALL_GRASS;
          } else {
            data[aboveIdx] = BLOCK.ROSE_BUSH;
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

  
  const biomeId = getBiome(temperature, humidity, continentalness, erosion, height, seaLevel);

  
  const idToName = {};
  for (const k of Object.keys(BIOME)) idToName[BIOME[k]] = k.charAt(0) + k.slice(1).toLowerCase();
  return idToName[biomeId] || String(biomeId);
}