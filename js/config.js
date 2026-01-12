// config.js
// All configurable game parameters in one place

// ============================================
// WORLD GENERATION
// ============================================

// Seed for procedural generation (change for different worlds)
export const SEED = 14897592187543434;

// Terrain generation parameters
export const TERRAIN = {
  scale: 0.01,           // horizontal noise scale (smaller = smoother terrain)
  octaves: 5,            // noise detail layers
  persistence: 0.5,      // how much each octave contributes
  lacunarity: 2.0,       // frequency multiplier per octave
  amplitude: 80,         // how tall hills are
  baseHeight: 64,        // baseline terrain height
  seaLevel: 62,          // water level
};

// Cave generation parameters
export const CAVES = {
  scale: 0.06,           // cave noise scale
  octaves: 3,            // cave noise layers
  threshold: 0.5,        // cave carving threshold (higher = fewer caves)
  maxY: 72,              // max height caves can generate (seaLevel + 10)
  openToSurface: true,   // whether caves can open to surface
};

// Tree generation
export const TREES = {
  probability: 0.06,     // chance per grass block to spawn tree (0-1)
  minHeight: 4,          // minimum tree trunk height
  maxHeight: 6,          // maximum tree trunk height
};

// Biome generation
export const BIOMES = {
  climateScale: 0.002,     // scale for temperature/humidity noise
  continentScale: 0.001,   // scale for continent shape noise
  blendDistance: 8,        // blocks for biome blending (not yet used)
};

// Ore generation - [minY, maxY, veinSize, rarity]
export const ORES = {
  coal: { minY: -64, maxY: 128, veinSize: 12, rarity: 0.08 },
  iron: { minY: -64, maxY: 64, veinSize: 8, rarity: 0.06 },
  gold: { minY: -64, maxY: 32, veinSize: 6, rarity: 0.015 },
  diamond: { minY: -64, maxY: 16, veinSize: 4, rarity: 0.005 },
};

// ============================================
// RENDERING
// ============================================

export const RENDER = {
  viewDistance: 6,       // chunk render distance (in chunks) - increased thanks to optimizations
  maxLoadsPerFrame: 3,   // chunks to load per frame (increased for faster loading)
  fov: 75,               // camera field of view
  nearClip: 0.1,         // near clipping plane
  farClip: 2000,         // far clipping plane
  maxPixelRatio: 1.5,    // max device pixel ratio (performance)
  showFPS: true,         // show FPS counter on screen
  chunkHysteresis: 1,    // extra chunk margin before unloading
};

// ============================================
// PLAYER
// ============================================

export const PLAYER = {
  width: 0.6,            // player width in blocks
  height: 1.8,           // player height in blocks
  crouchHeight: 1.4,     // player height when crouching
  spawnX: 0,             // spawn X coordinate
  spawnZ: 0,             // spawn Z coordinate
};

// ============================================
// PHYSICS
// ============================================

export const PHYSICS = {
  gravity: -32,          // blocks/s² (negative = down)
  jumpSpeed: 9,          // initial jump velocity (blocks/s)
  terminalVelocity: -50, // max fall speed (blocks/s)
  
  // Movement
  maxSpeed: 6,           // max horizontal speed (blocks/s)
  sprintMultiplier: 1.6, // speed multiplier when sprinting
  crouchMultiplier: 0.4, // speed multiplier when crouching
  
  // Acceleration
  groundAccel: 50,       // ground acceleration (blocks/s²)
  airAccel: 10,          // air acceleration (blocks/s²)
  
  // Friction/deceleration
  groundFriction: 12,    // ground friction multiplier
  airFriction: 1,        // air friction multiplier
  
  // Fixed timestep
  physicsFPS: 60,        // physics updates per second (60 is smooth enough)
};

// ============================================
// CAMERA
// ============================================

export const CAMERA = {
  mouseSensitivity: 0.002,  // mouse look sensitivity
  thirdPersonDistance: 5,   // distance behind player in 3rd person
  thirdPersonHeight: 0.35,  // height offset (multiplied by player height)
  eyeHeight: 0.9,           // eye position (multiplied by player height)
};

// ============================================
// DAY/NIGHT CYCLE
// ============================================

export const DAY_NIGHT = {
  cycleLength: 20 * 60,     // full day/night cycle (seconds) - 20 minutes
  dayLength: 10 * 60,       // daytime duration (seconds) - 10 minutes
  transitionLength: 3 * 60, // total dawn+dusk time (seconds) - 3 minutes
  nightLength: 7 * 60,      // night duration (seconds) - 7 minutes
  
  // Sky colors (hex)
  skyDayColor: 0x87ceeb,    // daytime sky color
  skyNightColor: 0x001022,  // nighttime sky color
  
  // Sun/Moon
  sunColor: 0xffee88,
  moonColor: 0xccccff,
  sunSize: 8,
  moonSize: 6,
  orbitDistance: 600,
};

// ============================================
// DEBUG
// ============================================

export const DEBUG = {
  logChunkLoading: false,   // log chunk load/unload
  showStartupInfo: true,    // show startup console logs
};
