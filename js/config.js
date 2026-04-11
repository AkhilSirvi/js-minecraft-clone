// config.js
// All configurable game parameters in one place

function seedToNumber(str) {
  if (!isNaN(str)) return Number(str);
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}
export const SEED = seedToNumber('14897592187543434');
export const TERRAIN = {
  scale: 0.01,           // horizontal noise scale (smaller = smoother terrain)
  octaves: 5,            // noise detail layers
  persistence: 0.5,      // how much each octave contributes
  lacunarity: 2.0,       // frequency multiplier per octave
  amplitude: 80,         // how tall hills are
  baseHeight: 64,        // baseline terrain height
  seaLevel: 62,          // water level
};

export const CAVES = {
  scale: 0.06,           // cave noise scale
  octaves: 3,            // cave noise layers
  threshold: 0.5,        // cave carving threshold (higher = fewer caves)
  maxY: 72,              // max height caves can generate (seaLevel + 10)
  openToSurface: true,   // whether caves can open to surface
};

export const TREES = {
  probability: 0.04,     // chance per grass block to spawn tree (0-1)
  minHeight: 4,          // minimum tree trunk height
  maxHeight: 6,          // maximum tree trunk height
};

export const BIOMES = {
  temperatureScale: 0.0015,  // Large scale for temperature (latitude-like bands)
  humidityScale: 0.0025,     // Medium scale for humidity variation
  continentScale: 0.008,    // Very large scale for continent shapes
  erosionScale: 0.004,       // Local terrain roughness variation
  vegetationScale: 0.8,     // Fine-grained vegetation patches
  treeClusterScale: 0.025,   // Medium-grained tree clustering
  blendDistance: 16,         // Blocks for biome blending
};

export const ORES = {
  coal: { minY: -64, maxY: 128, veinSize: 6, rarity: 0.06 },
  iron: { minY: -64, maxY: 64, veinSize: 5, rarity: 0.06 },
  gold: { minY: -64, maxY: 32, veinSize: 4, rarity: 0.015 },
  diamond: { minY: -64, maxY: 16, veinSize: 4, rarity: 0.005 },
};

export const RENDER = {
  viewDistance: 6,       // chunk render distance
  fov: 75,               // camera field of view
  nearClip: 0.1,         // near clipping plane
  farClip: 1000,         // far clipping plane
  maxPixelRatio: 1.5,    // max device pixel ratio
  smoothLighting: false,  // toggle smooth per-vertex lighting
  enableFrustumCulling: true,  // GPU frustum culling
  mergeGeometry: true,   // merge chunk geometry for fewer draw calls
};

export const PLAYER = {
  width: 0.6,            // player width in blocks
  height: 1.8,           // player height in blocks
  crouchHeight: 1.5,     // player height when crouching
  spawnX: 0,             // spawn X coordinate
  spawnZ: 0,             // spawn Z coordinate
  blockreach: 4.5,      // how far the player can reach to interact with blocks
};

export const PHYSICS = {
  gravity: -28.42,          // blocks/s² (negative = down)
  jumpSpeed: 8.436,          // initial jump velocity (blocks/s)
  terminalVelocity: -50, // max fall speed (blocks/s)
  safeFallDistance: 3, // blocks you can fall without taking damage
  fallDamageMultiplier: 1, // damage per block beyond safe fall distance
  
  // Movement
  maxSpeed: 4.317,           // max horizontal speed (blocks/s)
  sprintMultiplier: 1.428, // speed multiplier when sprinting
  crouchMultiplier: 0.3, // speed multiplier when crouching
  
  // Acceleration
  groundAccel: 50,       // ground acceleration (blocks/s²)
  airAccel: 10,          // air acceleration (blocks/s²)
  
  // Friction/deceleration
  groundFriction: 12,    // ground friction multiplier
  airFriction: 1,        // air friction multiplier
  
  // Fixed timestep
  physicsFPS: 60,        // physics updates per second (60 is smooth enough)
};

export const CAMERA = {
  mouseSensitivity: 0.002,  // mouse look sensitivity
  thirdPersonDistance: 3,   // distance behind player in 3rd person
  thirdPersonHeight: 0.35,  // height offset (multiplied by player height)
  eyeHeight: 0.5,           // eye position (multiplied by player height)
};

export const DAY_NIGHT = {
  cycleLength: 20 * 60,     // full day/night cycle (seconds) - 20 minutes
  dayLength: 10 * 60,       // daytime duration (seconds) - 10 minutes
  transitionLength: 3 * 60, // total dawn+dusk time (seconds) - 3 minutes
  nightLength: 7 * 60,      // night duration (seconds) - 7 minutes
  

  skyDayColor: 0x9bbdfa,         
  skyDayHorizonColor: 0xB8D4FF,  
  skyNightColor: 0x000000,       
  skyNightHorizonColor: 0x122a5b,
  skyDawnColor: 0xFFA46E,        
  skyDuskColor: 0xFF7840,        
  skyDawnHorizonColor: 0xFF8C2A, 
  skyDuskHorizonColor: 0xFF4D10, 
  
  // Stars
  starCount: 780,          // number of stars in the sky
  starSize: 1.5,            // base star point size (pixels)
  starTwinkleSpeed: 1.8,    // how fast stars twinkle
  
  // Sun/Moon
  sunColor: 0xffee88,
  sunBackdropColor: 0x000000,
  moonColor: 0xccccff,
  sunSize: 500,
  moonSize: 300,
  orbitDistance: 600,
};

export const COLORS = {
  grassTop: 0x77c05d,       // grass block top color
  grassSide: 0x77c05d,      // grass block side color
  leaves: 0x6bc24b,         // tree leaves color
  tallGrass: 0x77c05d,      // tall grass color
  cactus: 0x3dc922,         // cactus color
};

export const DEBUG = {
  logChunkLoading: true,   // log chunk load/unload
  showStartupInfo: true,    // show startup console logs
};
