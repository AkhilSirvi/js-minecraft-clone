export const BLOCK = Object.freeze({
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  WATER: 4,
  SAND: 5,
  WOOD: 6,
  LEAVES: 7,
  GRASS_SNOW: 8,
  GRAVEL: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  GOLD_ORE: 12,
  DIAMOND_ORE: 13,
  BEDROCK: 14,
  CLAY: 15,
  RED_SAND: 16,
  SNOW: 17,
  ICE: 18,
  CACTUS: 19,
  DEAD_BUSH: 20,
  TALL_GRASS: 21,
  ROSE_BUSH: 22,
  SUNFLOWER: 23,
});

export const BLOCK_TEXTURES = Object.freeze({
  dirt: 'assets/textures/block/dirt.png',
  sand: 'assets/textures/block/sand.png',
  grassSide: 'assets/textures/block/grass_block_side.png',
  grassSideOverlay: 'assets/textures/block/grass_block_side_overlay.png',
  grassTop: 'assets/textures/block/grass_block_top.png',
  stone: 'assets/textures/block/stone.png',
  gravel: 'assets/textures/block/gravel.png',
  clay: 'assets/textures/block/clay.png',
  redSand: 'assets/textures/block/red_sand.png',
  bedrock: 'assets/textures/block/bedrock.png',
  snow: 'assets/textures/block/snow.png',
  ice: 'assets/textures/block/ice.png',
  coalOre: 'assets/textures/block/coal_ore.png',
  ironOre: 'assets/textures/block/iron_ore.png',
  goldOre: 'assets/textures/block/gold_ore.png',
  diamondOre: 'assets/textures/block/diamond_ore.png',
  oakSide: 'assets/textures/block/oak_log.png',
  oakTop: 'assets/textures/block/oak_log_top.png',
  cactus: 'assets/textures/block/cactus.png',
  grassSnowSide: 'assets/textures/block/grass_block_snow_side.png',
  deadBush: 'assets/textures/block/dead_bush.png',
  tallGrass: 'assets/textures/block/tall_grass_top.png',
  roseBush: 'assets/textures/block/rose_bush_top.png',
  sunflower: 'assets/textures/block/sunflower.png',
  oakLeaves: 'assets/textures/block/oak_leaves.png',
  waterStill: 'assets/textures/block/water_overlay.png',
});

export const COLORS = Object.freeze({
  grassTop: 0x77c05d,
  grassSide: 0x77c05d,
  leaves: 0x6bc24b,
  tallGrass: 0x77c05d,
  cactus: 0x3dc922,
});

export const MATERIAL_DEFINITIONS = Object.freeze({
  stone: { textureKey: 'stone' },
  dirt: { textureKey: 'dirt' },
  sand: { textureKey: 'sand' },
  water: {
    textureKey: 'waterStill',
    transparent: true,
    opacity: 0.6,
    side: 'double',
  },
  leaves: {
    textureKey: 'oakLeaves',
    alphaTest: 0.5,
    colorKey: 'leaves',
  },
  gravel: { textureKey: 'gravel' },
  clay: { textureKey: 'clay' },
  redSand: { textureKey: 'redSand' },
  bedrock: { textureKey: 'bedrock' },
  snow: { textureKey: 'snow' },
  ice: {
    textureKey: 'ice',
    transparent: true,
    opacity: 0.9,
    side: 'double',
  },
  coalOre: { textureKey: 'coalOre' },
  ironOre: { textureKey: 'ironOre' },
  goldOre: { textureKey: 'goldOre' },
  diamondOre: { textureKey: 'diamondOre' },
  oakSide: { textureKey: 'oakSide' },
  oakTop: { textureKey: 'oakTop' },
  cactus: {
    textureKey: 'cactus',
    colorKey: 'cactus',
  },
  grassSide: { textureKey: 'grassSide' },
  grassOverlay: {
    textureKey: 'grassSideOverlay',
    colorKey: 'grassSide',
    transparent: true,
    depthWrite: false,
  },
  grassTop: {
    textureKey: 'grassTop',
    colorKey: 'grassTop',
  },
  grassSnowSide: { textureKey: 'grassSnowSide' },
  deadBush: {
    textureKey: 'deadBush',
    transparent: true,
    alphaTest: 0.5,
    side: 'double',
  },
  tallGrass: {
    textureKey: 'tallGrass',
    colorKey: 'tallGrass',
    alphaTest: 0.5,
    side: 'double',
  },
  roseBush: {
    textureKey: 'roseBush',
    transparent: true,
    alphaTest: 0.5,
    side: 'double',
  },
  sunflower: {
    textureKey: 'sunflower',
    transparent: true,
    alphaTest: 0.5,
    side: 'double',
  },
});

export const MATERIAL_SET_DEFINITIONS = Object.freeze({
  grass: Object.freeze([
    'grassSide',
    'grassSide',
    'grassTop',
    'dirt',
    'grassSide',
    'grassSide',
  ]),
  grassOverlay: Object.freeze([
    'grassOverlay',
    'grassOverlay',
    null,
    null,
    'grassOverlay',
    'grassOverlay',
  ]),
  grassSnow: Object.freeze([
    'grassSnowSide',
    'grassSnowSide',
    'snow',
    'dirt',
    'grassSnowSide',
    'grassSnowSide',
  ]),
  wood: Object.freeze([
    'oakSide',
    'oakSide',
    'oakTop',
    'oakTop',
    'oakSide',
    'oakSide',
  ]),
  cactus: Object.freeze([
    'cactus',
    'cactus',
    'cactus',
    'cactus',
    'cactus',
    'cactus',
  ]),
});

export const BLOCK_DEFINITIONS = Object.freeze([
  {
    id: BLOCK.AIR,
    key: 'air',
    name: 'Air',
    renderModel: 'empty',
    materialMode: 'none',
    materialSetKey: null,
    passable: true,
    renderTransparent: true,
    lightTransparent: true,
    lightFiltering: false,
    breakable: false,
    hardness: 0,
    flammable: false,
    lightEmission: 0,
    drop: null,
    textures: {},
  },
  {
    id: BLOCK.STONE,
    key: 'stone',
    name: 'Stone',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'stone',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 1.5,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.STONE, count: 1 },
    textures: { all: 'stone' },
  },
  {
    id: BLOCK.DIRT,
    key: 'dirt',
    name: 'Dirt',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'dirt',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 0.5,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.DIRT, count: 1 },
    textures: { all: 'dirt' },
  },
  {
    id: BLOCK.GRASS,
    key: 'grass',
    name: 'Grass Block',
    renderModel: 'cube',
    materialMode: 'face-array',
    materialSetKey: 'grass',
    overlaySetKey: 'grassOverlay',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 0.6,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.GRASS, count: 1 },
    textures: {
      side: 'grassSide',
      top: 'grassTop',
      bottom: 'dirt',
      sideOverlay: 'grassSideOverlay',
    },
  },
  {
    id: BLOCK.WATER,
    key: 'water',
    name: 'Water',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'water',
    passable: true,
    renderTransparent: true,
    lightTransparent: true,
    lightFiltering: true,
    breakable: true,
    hardness: 100,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.WATER, count: 1 },
    textures: { all: 'waterStill' },
  },
  {
    id: BLOCK.SAND,
    key: 'sand',
    name: 'Sand',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'sand',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 0.5,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.SAND, count: 1 },
    textures: { all: 'sand' },
  },
  {
    id: BLOCK.WOOD,
    key: 'wood',
    name: 'Oak Log',
    renderModel: 'cube',
    materialMode: 'face-array',
    materialSetKey: 'wood',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 2,
    flammable: true,
    lightEmission: 0,
    drop: { itemId: BLOCK.WOOD, count: 1 },
    textures: { side: 'oakSide', top: 'oakTop', bottom: 'oakTop' },
  },
  {
    id: BLOCK.LEAVES,
    key: 'leaves',
    name: 'Oak Leaves',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'leaves',
    passable: false,
    renderTransparent: true,
    lightTransparent: true,
    lightFiltering: true,
    breakable: true,
    hardness: 0.2,
    flammable: true,
    lightEmission: 0,
    drop: { itemId: BLOCK.LEAVES, count: 1 },
    textures: { all: 'oakLeaves' },
  },
  {
    id: BLOCK.GRASS_SNOW,
    key: 'grass_snow',
    name: 'Snowy Grass',
    renderModel: 'cube',
    materialMode: 'face-array',
    materialSetKey: 'grassSnow',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 0.6,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.GRASS_SNOW, count: 1 },
    textures: { side: 'grassSnowSide', top: 'snow', bottom: 'dirt' },
  },
  {
    id: BLOCK.GRAVEL,
    key: 'gravel',
    name: 'Gravel',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'gravel',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 0.6,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.GRAVEL, count: 1 },
    textures: { all: 'gravel' },
  },
  {
    id: BLOCK.COAL_ORE,
    key: 'coal_ore',
    name: 'Coal Ore',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'coalOre',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 3,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.COAL_ORE, count: 1 },
    textures: { all: 'coalOre' },
  },
  {
    id: BLOCK.IRON_ORE,
    key: 'iron_ore',
    name: 'Iron Ore',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'ironOre',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 3,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.IRON_ORE, count: 1 },
    textures: { all: 'ironOre' },
  },
  {
    id: BLOCK.GOLD_ORE,
    key: 'gold_ore',
    name: 'Gold Ore',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'goldOre',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 3,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.GOLD_ORE, count: 1 },
    textures: { all: 'goldOre' },
  },
  {
    id: BLOCK.DIAMOND_ORE,
    key: 'diamond_ore',
    name: 'Diamond Ore',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'diamondOre',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 3,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.DIAMOND_ORE, count: 1 },
    textures: { all: 'diamondOre' },
  },
  {
    id: BLOCK.BEDROCK,
    key: 'bedrock',
    name: 'Bedrock',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'bedrock',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: false,
    hardness: 10000,
    flammable: false,
    lightEmission: 0,
    drop: null,
    textures: { all: 'bedrock' },
  },
  {
    id: BLOCK.CLAY,
    key: 'clay',
    name: 'Clay',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'clay',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 0.6,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.CLAY, count: 1 },
    textures: { all: 'clay' },
  },
  {
    id: BLOCK.RED_SAND,
    key: 'red_sand',
    name: 'Red Sand',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'redSand',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 0.5,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.RED_SAND, count: 1 },
    textures: { all: 'redSand' },
  },
  {
    id: BLOCK.SNOW,
    key: 'snow',
    name: 'Snow',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'snow',
    passable: true,
    renderTransparent: false,
    lightTransparent: true,
    lightFiltering: false,
    breakable: true,
    hardness: 0.2,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.SNOW, count: 1 },
    textures: { all: 'snow' },
  },
  {
    id: BLOCK.ICE,
    key: 'ice',
    name: 'Ice',
    renderModel: 'cube',
    materialMode: 'single',
    materialSetKey: 'ice',
    passable: false,
    renderTransparent: true,
    lightTransparent: true,
    lightFiltering: true,
    breakable: true,
    hardness: 0.5,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.ICE, count: 1 },
    textures: { all: 'ice' },
  },
  {
    id: BLOCK.CACTUS,
    key: 'cactus',
    name: 'Cactus',
    renderModel: 'cube',
    materialMode: 'face-array',
    materialSetKey: 'cactus',
    passable: false,
    renderTransparent: false,
    lightTransparent: false,
    lightFiltering: false,
    breakable: true,
    hardness: 0.4,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.CACTUS, count: 1 },
    textures: { all: 'cactus' },
  },
  {
    id: BLOCK.DEAD_BUSH,
    key: 'dead_bush',
    name: 'Dead Bush',
    renderModel: 'cross',
    materialMode: 'single',
    materialSetKey: 'deadBush',
    passable: true,
    renderTransparent: true,
    lightTransparent: true,
    lightFiltering: false,
    breakable: true,
    hardness: 0,
    flammable: false,
    lightEmission: 0,
    drop: { itemId: BLOCK.DEAD_BUSH, count: 1 },
    textures: { all: 'deadBush' },
  },
  {
    id: BLOCK.TALL_GRASS,
    key: 'tall_grass',
    name: 'Tall Grass',
    renderModel: 'cross',
    materialMode: 'single',
    materialSetKey: 'tallGrass',
    passable: true,
    renderTransparent: true,
    lightTransparent: true,
    lightFiltering: false,
    breakable: true,
    hardness: 0,
    flammable: true,
    lightEmission: 0,
    drop: { itemId: BLOCK.TALL_GRASS, count: 1 },
    textures: { all: 'tallGrass' },
  },
  {
    id: BLOCK.ROSE_BUSH,
    key: 'rose_bush',
    name: 'Rose Bush',
    renderModel: 'cross',
    materialMode: 'single',
    materialSetKey: 'roseBush',
    passable: true,
    renderTransparent: true,
    lightTransparent: true,
    lightFiltering: false,
    breakable: true,
    hardness: 0,
    flammable: true,
    lightEmission: 0,
    drop: { itemId: BLOCK.ROSE_BUSH, count: 1 },
    textures: { all: 'roseBush' },
  },
  {
    id: BLOCK.SUNFLOWER,
    key: 'sunflower',
    name: 'Sunflower',
    renderModel: 'cross',
    materialMode: 'single',
    materialSetKey: 'sunflower',
    passable: true,
    renderTransparent: true,
    lightTransparent: true,
    lightFiltering: false,
    breakable: true,
    hardness: 0,
    flammable: true,
    lightEmission: 0,
    drop: { itemId: BLOCK.SUNFLOWER, count: 1 },
    textures: { all: 'sunflower' },
  },
]);

const BLOCK_BY_ID = new Map(BLOCK_DEFINITIONS.map((block) => [block.id, block]));

export const PASSABLE_BLOCK_IDS = new Set(
  BLOCK_DEFINITIONS.filter((block) => block.passable).map((block) => block.id),
);

export const RENDER_TRANSPARENT_BLOCK_IDS = new Set(
  BLOCK_DEFINITIONS
    .filter((block) => block.renderTransparent)
    .map((block) => block.id),
);

export const LIGHT_TRANSPARENT_BLOCK_IDS = new Set(
  BLOCK_DEFINITIONS
    .filter((block) => block.lightTransparent)
    .map((block) => block.id),
);

export const LIGHT_FILTERING_BLOCK_IDS = new Set(
  BLOCK_DEFINITIONS
    .filter((block) => block.lightFiltering)
    .map((block) => block.id),
);

export const CROSS_BLOCK_IDS = new Set(
  BLOCK_DEFINITIONS
    .filter((block) => block.renderModel === 'cross')
    .map((block) => block.id),
);

export const UNBREAKABLE_BLOCK_IDS = new Set(
  BLOCK_DEFINITIONS
    .filter((block) => !block.breakable)
    .map((block) => block.id),
);

const LIGHT_EMISSION_LOOKUP_MAP = new Map(
  BLOCK_DEFINITIONS
    .filter((block) => block.lightEmission > 0)
    .map((block) => [block.id, block.lightEmission]),
);

export function getBlockById(blockId) {
  return BLOCK_BY_ID.get(blockId) || null;
}

export function getBlockMaterialSetKey(blockId) {
  const block = getBlockById(blockId);
  return block ? block.materialSetKey : null;
}

export function getBlockDropId(blockId) {
  const block = getBlockById(blockId);
  if (!block) return null;
  return block.drop && Number.isFinite(block.drop.itemId) ? block.drop.itemId : null;
}

export function getAllLightEmitters() {
  return LIGHT_EMISSION_LOOKUP_MAP;
}

export function isBlockPassable(blockId) {
  return PASSABLE_BLOCK_IDS.has(blockId);
}

export function isRenderTransparentBlock(blockId) {
  return RENDER_TRANSPARENT_BLOCK_IDS.has(blockId);
}

export function isBlockBreakable(blockId) {
  const block = getBlockById(blockId);
  if (!block) return false;
  return !UNBREAKABLE_BLOCK_IDS.has(blockId);
}

export function getChunkFaceMaterialKeys(blockId, faceIdx) {
  const block = getBlockById(blockId);
  if (!block) {
    return { base: 'stone', overlay: null };
  }

  if (block.renderModel !== 'cube') {
    return { base: null, overlay: null };
  }

  if (block.materialMode === 'face-array') {
    const base = `${block.materialSetKey}_${faceIdx}`;
    let overlay = null;
    if (block.overlaySetKey && faceIdx !== 2 && faceIdx !== 3) {
      overlay = `${block.overlaySetKey}_${faceIdx}`;
    }
    return { base, overlay };
  }

  return {
    base: block.materialSetKey,
    overlay: null,
  };
}

export function getCrossMaterialKey(blockId) {
  const block = getBlockById(blockId);
  if (!block) return null;
  if (block.renderModel !== 'cross') return null;
  return block.materialSetKey;
}
