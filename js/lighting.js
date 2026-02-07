import { CHUNK_SIZE, HEIGHT, MIN_Y, MAX_Y } from './chunkGen.js';

// Light-emitting blocks and their light levels
export const LIGHT_EMITTING_BLOCKS = {
  // ID: light level
  // Currently just placeholders - add more as needed
  // 4: 0,  // Water doesn't emit light but could have special handling
};

// Check if any light-emitting blocks exist
const HAS_LIGHT_EMITTERS = Object.keys(LIGHT_EMITTING_BLOCKS).length > 0;

const BLOCK_AIR = 0;
const BLOCK_WATER = 4;
const BLOCK_LEAVES = 7;
const BLOCK_ICE = 18;

// Pre-computed lookup tables for fast block property checks (max block ID 256)
const TRANSPARENT_LOOKUP = new Uint8Array(256);
const LIGHT_FILTERING_LOOKUP = new Uint8Array(256);
const LIGHT_EMISSION_LOOKUP = new Uint8Array(256);

// Initialize transparent blocks lookup
[BLOCK_AIR, BLOCK_WATER, BLOCK_LEAVES, BLOCK_ICE, 17, 20, 21, 22, 23].forEach(id => {
  TRANSPARENT_LOOKUP[id] = 1;
});

// Initialize light-filtering blocks lookup
[BLOCK_WATER, BLOCK_LEAVES, BLOCK_ICE].forEach(id => {
  LIGHT_FILTERING_LOOKUP[id] = 1;
});

// Initialize light emission lookup
for (const [id, level] of Object.entries(LIGHT_EMITTING_BLOCKS)) {
  LIGHT_EMISSION_LOOKUP[parseInt(id)] = level;
}

// Direction offsets for 6-connectivity (pre-computed)
const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 0, 0, 1, -1];
const DZ = [0, 0, 1, -1, 0, 0];

/**
 * Calculate lighting for a chunk
 * Returns an object with skyLight and blockLight arrays
 * Each array has CHUNK_SIZE * CHUNK_SIZE * HEIGHT elements
 * 
 * @param {Uint8Array} chunkData - The chunk's block data
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @param {function} getNeighborBlock - Function to get blocks from neighboring chunks
 * @returns {{skyLight: Uint8Array, blockLight: Uint8Array}}
 */
export function calculateChunkLighting(chunkData, cx, cz, getNeighborBlock = null) {
  const size = CHUNK_SIZE * CHUNK_SIZE * HEIGHT;
  const skyLight = new Uint8Array(size);
  const blockLight = new Uint8Array(size);
  
  // Initialize sky light - start from top and propagate down
  calculateSkyLight(chunkData, skyLight);
  
  // Calculate block light from light-emitting blocks (skip if none exist)
  if (HAS_LIGHT_EMITTERS) {
    calculateBlockLight(chunkData, blockLight);
  }
  
  return { skyLight, blockLight };
}

/**
 * Get array index for block at local coordinates (kept for getCombinedLight)
 */
function getIndex(lx, ly, lz) {
  return (lx * CHUNK_SIZE + lz) * HEIGHT + (ly - MIN_Y);
}

/**
 * Check if a block is transparent (allows light to pass)
 * Uses lookup table for performance
 */
function isTransparent(blockId) {
  return TRANSPARENT_LOOKUP[blockId] === 1;
}

/**
 * Calculate sky light using optimized flood fill from the top
 * Uses typed array queue and lookup tables for performance
 */
function calculateSkyLight(chunkData, skyLight) {
  // Pre-allocate queue as typed arrays (max size = chunk volume, but usually much smaller)
  // Each entry: x, y, z, light packed into queue
  const maxQueueSize = CHUNK_SIZE * CHUNK_SIZE * HEIGHT;
  const queueX = new Uint8Array(maxQueueSize);
  const queueY = new Int16Array(maxQueueSize); // Y can be negative
  const queueZ = new Uint8Array(maxQueueSize);
  const queueLight = new Uint8Array(maxQueueSize);
  let queueHead = 0;
  let queueTail = 0;
  
  // First pass: Find all blocks directly exposed to sky (top-down propagation)
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const xOffset = x * CHUNK_SIZE;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let currentLight = 15;
      const columnBase = (xOffset + z) * HEIGHT;
      
      // Start from the very top of the world and go down
      for (let y = MAX_Y; y >= MIN_Y; y--) {
        const idx = columnBase + (y - MIN_Y);
        const blockId = chunkData[idx];
        
        if (blockId === BLOCK_AIR) {
          // Air block - propagate full sky light
          skyLight[idx] = currentLight;
          queueX[queueTail] = x;
          queueY[queueTail] = y;
          queueZ[queueTail] = z;
          queueLight[queueTail] = currentLight;
          queueTail++;
        } else if (TRANSPARENT_LOOKUP[blockId]) {
          // Transparent block - may filter light
          if (LIGHT_FILTERING_LOOKUP[blockId]) {
            currentLight = currentLight > 0 ? currentLight - 1 : 0;
          }
          skyLight[idx] = currentLight;
          queueX[queueTail] = x;
          queueY[queueTail] = y;
          queueZ[queueTail] = z;
          queueLight[queueTail] = currentLight;
          queueTail++;
        } else {
          // Opaque block - stops sky light propagation downward
          skyLight[idx] = 0;
          currentLight = 0;
        }
      }
    }
  }
  
  // Second pass: BFS to propagate light horizontally and into caves
  while (queueHead < queueTail) {
    const x = queueX[queueHead];
    const y = queueY[queueHead];
    const z = queueZ[queueHead];
    const light = queueLight[queueHead];
    queueHead++;
    
    if (light <= 1) continue; // Can't propagate further
    
    const newLightBase = light - 1;
    
    // Check all 6 directions using pre-computed offsets
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const nz = z + DZ[d];
      
      // Skip if out of bounds
      if (ny < MIN_Y || ny > MAX_Y) continue;
      if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) continue;
      
      const nIdx = (nx * CHUNK_SIZE + nz) * HEIGHT + (ny - MIN_Y);
      const neighborBlock = chunkData[nIdx];
      
      // Skip opaque blocks (use lookup table)
      if (!TRANSPARENT_LOOKUP[neighborBlock]) continue;
      
      // Calculate new light level (filter if needed)
      let newLight = newLightBase;
      if (LIGHT_FILTERING_LOOKUP[neighborBlock]) {
        newLight = newLight > 0 ? newLight - 1 : 0;
      }
      
      // Only update if new light is brighter
      if (newLight > skyLight[nIdx]) {
        skyLight[nIdx] = newLight;
        queueX[queueTail] = nx;
        queueY[queueTail] = ny;
        queueZ[queueTail] = nz;
        queueLight[queueTail] = newLight;
        queueTail++;
      }
    }
  }
}

/**
 * Calculate block light using optimized flood fill
 * Uses typed array queue and lookup tables for performance
 */
function calculateBlockLight(chunkData, blockLight) {
  // Pre-allocate queue (smaller than sky light since fewer sources)
  const maxQueueSize = CHUNK_SIZE * CHUNK_SIZE * 16; // Max 16 light levels * sources
  const queueX = new Uint8Array(maxQueueSize);
  const queueY = new Int16Array(maxQueueSize);
  const queueZ = new Uint8Array(maxQueueSize);
  const queueLight = new Uint8Array(maxQueueSize);
  let queueTail = 0;
  
  // Find all light-emitting blocks
  for (let x = 0; x < CHUNK_SIZE; x++) {
    const xOffset = x * CHUNK_SIZE;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const columnBase = (xOffset + z) * HEIGHT;
      for (let y = MIN_Y; y <= MAX_Y; y++) {
        const idx = columnBase + (y - MIN_Y);
        const emission = LIGHT_EMISSION_LOOKUP[chunkData[idx]];
        
        if (emission > 0) {
          blockLight[idx] = emission;
          queueX[queueTail] = x;
          queueY[queueTail] = y;
          queueZ[queueTail] = z;
          queueLight[queueTail] = emission;
          queueTail++;
        }
      }
    }
  }
  
  // BFS flood fill for block light
  let queueHead = 0;
  while (queueHead < queueTail) {
    const x = queueX[queueHead];
    const y = queueY[queueHead];
    const z = queueZ[queueHead];
    const light = queueLight[queueHead];
    queueHead++;
    
    if (light <= 1) continue;
    
    const newLight = light - 1;
    
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const nz = z + DZ[d];
      
      if (ny < MIN_Y || ny > MAX_Y) continue;
      if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) continue;
      
      const nIdx = (nx * CHUNK_SIZE + nz) * HEIGHT + (ny - MIN_Y);
      
      // Block light is blocked by opaque blocks
      if (!TRANSPARENT_LOOKUP[chunkData[nIdx]]) continue;
      
      if (newLight > blockLight[nIdx]) {
        blockLight[nIdx] = newLight;
        queueX[queueTail] = nx;
        queueY[queueTail] = ny;
        queueZ[queueTail] = nz;
        queueLight[queueTail] = newLight;
        queueTail++;
      }
    }
  }
}

/**
 * Get the combined light level at a position (max of sky and block light)
 * 
 * @param {Uint8Array} skyLight 
 * @param {Uint8Array} blockLight 
 * @param {number} lx - Local X
 * @param {number} ly - World Y
 * @param {number} lz - Local Z
 * @param {number} timeOfDay - 0 to 1, where 0.5 is noon
 * @returns {number} Combined light level 0-15
 */
export function getCombinedLight(skyLight, blockLight, lx, ly, lz, timeOfDay = 0.5) {
  // Return full brightness for out-of-bounds positions (chunk edges facing outward)
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 15;
  if (ly < MIN_Y || ly > MAX_Y) return 15;
  
  // If lighting arrays don't exist, return full brightness
  if (!skyLight || !blockLight) return 15;
  
  const idx = getIndex(lx, ly, lz);
  
  // Bounds check for array access
  if (idx < 0 || idx >= skyLight.length) return 15;
  
  const sky = skyLight[idx] || 0;
  const block = blockLight[idx] || 0;
  
  // Apply time-of-day modifier to sky light
  // At noon (timeOfDay = 0.5), sky light is full
  // At midnight (timeOfDay = 0 or 1), sky light is reduced
  const dayBrightness = getDayBrightness(timeOfDay);
  const effectiveSky = Math.floor(sky * dayBrightness);
  
  return Math.max(effectiveSky, block);
}

/**
 * Get brightness multiplier based on time of day
 * Returns 0.25 to 1 (moonlight to full sun)
 */
function getDayBrightness(timeOfDay) {
  // timeOfDay 0.25 = 6 AM (sunrise), 0.5 = noon, 0.75 = 6 PM (sunset), 0/1 = midnight
  // Day is roughly 0.25-0.75, night is 0.75-0.25
  const t = timeOfDay % 1;
  const angle = (t - 0.25) * Math.PI * 2; // Shift so noon is at peak
  const raw = (Math.sin(angle) + 1) / 2; // 0 to 1
  return 0.25 + raw * 0.75;
}

/**
 * Convert light level (0-15) to a brightness multiplier for rendering
 * @param {number} lightLevel - Light level 0-15
 * @returns {number} Brightness multiplier 0-1
 */
export function lightToRenderBrightness(lightLevel) {
  const normalizedLevel = Math.max(0, Math.min(15, lightLevel)) / 15;
  const minBrightness = 0.05; // 5% at level 0
  const maxBrightness = 1.0;  // 100% at level 15
  const brightness = minBrightness * Math.pow(maxBrightness / minBrightness, normalizedLevel);
  return brightness;
}

/**
 * Get light level at a face of a block
 * Uses the light level of the adjacent block in the face's normal direction
 * 
 * @param {Uint8Array} skyLight 
 * @param {Uint8Array} blockLight 
 * @param {number} lx - Block local X
 * @param {number} ly - Block world Y
 * @param {number} lz - Block local Z
 * @param {number} faceIdx - Face index (0-5: +X, -X, +Y, -Y, +Z, -Z)
 * @param {number} timeOfDay - Time of day 0-1
 * @returns {number} Light level 0-15
 */
export function getFaceLight(skyLight, blockLight, lx, ly, lz, faceIdx, timeOfDay = 0.5) {
  // If no lighting data, return full brightness
  if (!skyLight || !blockLight) return 15;
  
  // Face directions: +X, -X, +Y, -Y, +Z, -Z
  const faceNormals = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1]
  ];
  
  const [dx, dy, dz] = faceNormals[faceIdx];
  const nlx = lx + dx;
  const nly = ly + dy;
  const nlz = lz + dz;
  
  return getCombinedLight(skyLight, blockLight, nlx, nly, nlz, timeOfDay);
}

// Export for use in chunkManager
export { BLOCK_AIR, isTransparent };
