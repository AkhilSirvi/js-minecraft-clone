//   FIELDS
//   key            Block ids are assigned in table order (0, 1, 2, ...) so
//                  always add new blocks at the END of the list
//   name           Display name.
//   model          'cube' (default) | 'cross' (flowers/plants) | 'empty'
//   texture        One texture file for all 6 faces.
//   textures       { top, side, bottom } for a cube with different faces
//                  per side
//   color          Tint (hex) applied to `texture`
//   colors         { top, side, bottom } per-face tints for `textures` blocks.
//   overlay        A second, tinted, semi-transparent texture.
//   transparent / opacity / alphaTest / side / depthWrite
//                  Passed straight through to the renderer's material.
//   passable       Can entities walk through it? default: false
//   renderTransparent / lightTransparent / lightFiltering
//                  Rendering/lighting flags based on `model` and `transparent`, override if needed.
//   breakable      Can it be mined? default: true
//   hardness       Relative mining time. default: 1
//   flammable      default: false
//   light          Light level emitted(0-15)default: 0
//   drop           Block KEY this drops when broken (e.g. 'COAL_ORE'), 'SELF' (default, drops itself), or null for nothing.

const TEX_DIR = 'assets/textures/block/';

const BLOCK_DEFAULTS = Object.freeze({
  model: 'cube',
  passable: false,
  breakable: true,
  hardness: 1,
  flammable: false,
  light: 0,
  drop: 'SELF',
});

const MODEL_DEFAULTS = Object.freeze({
  cube: { renderTransparent: false, lightTransparent: false, lightFiltering: false },
  cross: { passable: true, renderTransparent: true, lightTransparent: true, lightFiltering: false },
  empty: { renderTransparent: true, lightTransparent: true, lightFiltering: false },
});

export const BLOCKS = [
  { key: 'AIR', name: 'Air', model: 'empty', passable: true, breakable: false, hardness: 0, drop: null },
  { key: 'STONE', name: 'Stone', texture: 'stone.png', hardness: 1.5 },
  { key: 'DIRT', name: 'Dirt', texture: 'dirt.png', hardness: 0.5 },
  { key: 'GRASS', name: 'Grass Block', textures: { top: 'grass_block_top.png', side: 'grass_block_side.png', bottom: 'dirt.png' }, colors: { top: 0x77c05d }, overlay: { texture: 'grass_block_side_overlay.png', color: 0x77c05d }, hardness: 0.6,},
  { key: 'WATER', name: 'Water', texture: 'water_overlay.png', transparent: true, opacity: 0.6, side: 'double', passable: true, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 100, drop: 'WATER', },
  { key: 'SAND', name: 'Sand', texture: 'sand.png', hardness: 0.5 },
  { key: 'WOOD', name: 'Oak Log', textures: { top: 'oak_log_top.png', side: 'oak_log.png' }, hardness: 2, flammable: true, },
  { key: 'LEAVES', name: 'Oak Leaves', texture: 'oak_leaves.png', color: 0x6bc24b, alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: true, },
  { key: 'GRASS_SNOW', name: 'Snowy Grass', textures: { top: 'snow.png', side: 'grass_block_snow.png', bottom: 'dirt.png' }, hardness: 0.6, },
  { key: 'GRAVEL', name: 'Gravel', texture: 'gravel.png', hardness: 0.6 },
  { key: 'COAL_ORE', name: 'Coal Ore', texture: 'coal_ore.png', hardness: 3 },
  { key: 'IRON_ORE', name: 'Iron Ore', texture: 'iron_ore.png', hardness: 3 },
  { key: 'GOLD_ORE', name: 'Gold Ore', texture: 'gold_ore.png', hardness: 3 },
  { key: 'DIAMOND_ORE', name: 'Diamond Ore', texture: 'diamond_ore.png', hardness: 3 },
  { key: 'BEDROCK', name: 'Bedrock', texture: 'bedrock.png', breakable: false, hardness: 10000, drop: null },
  { key: 'CLAY', name: 'Clay', texture: 'clay.png', hardness: 0.6 },
  { key: 'RED_SAND', name: 'Red Sand', texture: 'red_sand.png', hardness: 0.5 },
  { key: 'SNOW', name: 'Snow', texture: 'snow.png', passable: true, lightTransparent: true, hardness: 0.2, },
  { key: 'ICE', name: 'Ice', texture: 'ice.png', transparent: true, opacity: 0.9, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.5, },
  { key: 'DEAD_BUSH', name: 'Dead Bush', model: 'cross', texture: 'dead_bush.png', transparent: true, alphaTest: 0.5, side: 'double', hardness: 0, },
  { key: 'TALL_GRASS', name: 'Tall Grass', model: 'cross', texture: 'tall_grass_top.png', color: 0x77c05d, alphaTest: 0.5, side: 'double', hardness: 0, flammable: true, },
  { key: 'ROSE_BUSH', name: 'Rose Bush', model: 'cross', texture: 'rose_bush_top.png', transparent: true, alphaTest: 0.5, side: 'double', hardness: 0, flammable: true, },
  { key: 'SUNFLOWER', name: 'Sunflower', model: 'cross', texture: 'sunflower_front.png', transparent: true, alphaTest: 0.5, side: 'double', hardness: 0, flammable: true, },
  { key: 'DEEPSLATE', name: 'Deepslate', texture: 'deepslate.png', hardness: 3 },
  { key: 'DEEPSLATE_COAL_ORE', name: 'Deepslate Coal Ore', texture: 'deepslate_coal_ore.png', hardness: 4.5, drop: 'COAL_ORE' },
  { key: 'DEEPSLATE_IRON_ORE', name: 'Deepslate Iron Ore', texture: 'deepslate_iron_ore.png', hardness: 4.5, drop: 'IRON_ORE' },
  { key: 'DEEPSLATE_GOLD_ORE', name: 'Deepslate Gold Ore', texture: 'deepslate_gold_ore.png', hardness: 4.5, drop: 'GOLD_ORE' },
  { key: 'DEEPSLATE_DIAMOND_ORE', name: 'Deepslate Diamond Ore', texture: 'deepslate_diamond_ore.png', hardness: 4.5, drop: 'DIAMOND_ORE' },
  { key: 'MOSS_BLOCK', name: 'Moss Block', texture: 'moss_block.png', hardness: 0.6 },
  { key: 'CAVE_VINE', name: 'Cave Vine', model: 'cross', texture: 'cave_vines_plant.png', transparent: true, alphaTest: 0.5, side: 'double', hardness: 0, },
  { key: 'LAVA', name: 'Lava', texture: 'lava_still.png', transparent: true, opacity: 0.97, side: 'double', passable: true, renderTransparent: true, lightTransparent: true, lightFiltering: true, breakable: false, hardness: 100, light: 14, drop: null, },
  { key: 'ACACIA_LEAVES', name: 'Acacia Leaves', texture: 'acacia_leaves.png', color: 0x6bc24b, alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'ACACIA_LOG', name: 'Acacia Log', textures: { top: 'acacia_log_top.png', side: 'acacia_log.png' }, hardness: 2, flammable: true },
  { key: 'ACACIA_PLANKS', name: 'Acacia Planks', texture: 'acacia_planks.png', hardness: 2, flammable: true },
  { key: 'ACACIA_SAPLING', name: 'Acacia Sapling', model: 'cross', texture: 'acacia_sapling.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'ALLIUM', name: 'Allium', model: 'cross', texture: 'allium.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'AMETHYST_BLOCK', name: 'Amethyst Block', texture: 'amethyst_block.png', hardness: 1.5, flammable: false },
  { key: 'AMETHYST_CLUSTER', name: 'Amethyst Cluster', model: 'cross', texture: 'amethyst_cluster.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'ANCIENT_DEBRIS', name: 'Ancient Debris', textures: { top: 'ancient_debris_top.png', side: 'ancient_debris_side.png' }, hardness: 1.5, flammable: false },
  { key: 'ANDESITE', name: 'Andesite', texture: 'andesite.png', hardness: 1.5, flammable: false },
  { key: 'ANVIL', name: 'Anvil', textures: { top: 'anvil_top.png', side: 'anvil.png' }, hardness: 5, flammable: false },
  { key: 'ATTACHED_MELON_STEM', name: 'Attached Melon Stem', model: 'cross', texture: 'attached_melon_stem.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'ATTACHED_PUMPKIN_STEM', name: 'Attached Pumpkin Stem', model: 'cross', texture: 'attached_pumpkin_stem.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'AZALEA', name: 'Azalea', textures: { top: 'azalea_top.png', side: 'azalea_side.png' }, hardness: 1.5, flammable: false },
  { key: 'AZALEA_LEAVES', name: 'Azalea Leaves', texture: 'azalea_leaves.png', alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'AZALEA_PLANT', name: 'Azalea Plant', texture: 'azalea_plant.png', hardness: 1.5, flammable: false },
  { key: 'AZURE_BLUET', name: 'Azure Bluet', model: 'cross', texture: 'azure_bluet.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'BAMBOO', name: 'Bamboo', texture: 'bamboo_stalk.png', hardness: 1.5, flammable: true },
  { key: 'BAMBOO_BLOCK', name: 'Bamboo Block', textures: { top: 'bamboo_block_top.png', side: 'bamboo_block.png' }, hardness: 2, flammable: true },
  { key: 'BAMBOO_LARGE_LEAVES', name: 'Bamboo Large Leaves', texture: 'bamboo_large_leaves.png', alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: true },
  { key: 'BAMBOO_MOSAIC', name: 'Bamboo Mosaic', texture: 'bamboo_mosaic.png', hardness: 2, flammable: true },
  { key: 'BAMBOO_PLANKS', name: 'Bamboo Planks', texture: 'bamboo_planks.png', hardness: 2, flammable: true },
  { key: 'BAMBOO_SINGLELEAF', name: 'Bamboo Singleleaf', model: 'cross', texture: 'bamboo_singleleaf.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'BAMBOO_SMALL_LEAVES', name: 'Bamboo Small Leaves', texture: 'bamboo_small_leaves.png', alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: true },
  { key: 'BARREL', name: 'Barrel', textures: { top: 'barrel_top.png', side: 'barrel_side.png', bottom: 'barrel_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'BASALT', name: 'Basalt', textures: { top: 'basalt_top.png', side: 'basalt_side.png' }, hardness: 3, flammable: false },
  { key: 'BEACON', name: 'Beacon', texture: 'beacon.png', hardness: 1.5, flammable: false },
  { key: 'BEE_NEST', name: 'Bee Nest', textures: { top: 'bee_nest_top.png', side: 'bee_nest_side.png', bottom: 'bee_nest_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'BEEHIVE', name: 'Beehive', texture: 'beehive_side.png', hardness: 1.5, flammable: false },
  { key: 'BELL', name: 'Bell', textures: { top: 'bell_top.png', side: 'bell_side.png', bottom: 'bell_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'BIG_DRIPLEAF', name: 'Big Dripleaf', textures: { top: 'big_dripleaf_top.png', side: 'big_dripleaf_side.png' }, hardness: 1.5, flammable: false },
  { key: 'BIG_DRIPLEAF_STEM', name: 'Big Dripleaf Stem', model: 'cross', texture: 'big_dripleaf_stem.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'BIG_DRIPLEAF_TIP', name: 'Big Dripleaf Tip', texture: 'big_dripleaf_tip.png', hardness: 1.5, flammable: false },
  { key: 'BIRCH_LEAVES', name: 'Birch Leaves', texture: 'birch_leaves.png', color: 0x6bc24b, alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'BIRCH_LOG', name: 'Birch Log', textures: { top: 'birch_log_top.png', side: 'birch_log.png' }, hardness: 2, flammable: true },
  { key: 'BIRCH_PLANKS', name: 'Birch Planks', texture: 'birch_planks.png', hardness: 2, flammable: true },
  { key: 'BIRCH_SAPLING', name: 'Birch Sapling', model: 'cross', texture: 'birch_sapling.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'BLACK_CONCRETE', name: 'Black Concrete', texture: 'black_concrete.png', hardness: 1.8, flammable: false },
  { key: 'BLACK_CONCRETE_POWDER', name: 'Black Concrete Powder', texture: 'black_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'BLACK_GLAZED_TERRACOTTA', name: 'Black Glazed Terracotta', texture: 'black_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'BLACK_SHULKER_BOX', name: 'Black Shulker Box', texture: 'black_shulker_box.png', hardness: 2, flammable: false },
  { key: 'BLACK_STAINED_GLASS', name: 'Black Stained Glass', texture: 'black_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'BLACK_TERRACOTTA', name: 'Black Terracotta', texture: 'black_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'BLACK_WOOL', name: 'Black Wool', texture: 'black_wool.png', hardness: 0.8, flammable: true },
  { key: 'BLACKSTONE', name: 'Blackstone', textures: { top: 'blackstone_top.png', side: 'blackstone.png' }, hardness: 3, flammable: false },
  { key: 'BLAST_FURNACE', name: 'Blast Furnace', textures: { top: 'blast_furnace_top.png', side: 'blast_furnace_side.png' }, hardness: 1.5, flammable: false },
  { key: 'BLUE_CONCRETE', name: 'Blue Concrete', texture: 'blue_concrete.png', hardness: 1.8, flammable: false },
  { key: 'BLUE_CONCRETE_POWDER', name: 'Blue Concrete Powder', texture: 'blue_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'BLUE_GLAZED_TERRACOTTA', name: 'Blue Glazed Terracotta', texture: 'blue_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'BLUE_ICE', name: 'Blue Ice', texture: 'blue_ice.png', transparent: true, opacity: 0.9, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.5, flammable: false },
  { key: 'BLUE_ORCHID', name: 'Blue Orchid', model: 'cross', texture: 'blue_orchid.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'BLUE_SHULKER_BOX', name: 'Blue Shulker Box', texture: 'blue_shulker_box.png', hardness: 2, flammable: false },
  { key: 'BLUE_STAINED_GLASS', name: 'Blue Stained Glass', texture: 'blue_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'BLUE_TERRACOTTA', name: 'Blue Terracotta', texture: 'blue_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'BLUE_WOOL', name: 'Blue Wool', texture: 'blue_wool.png', hardness: 0.8, flammable: true },
  { key: 'BONE_BLOCK', name: 'Bone Block', textures: { top: 'bone_block_top.png', side: 'bone_block_side.png' }, hardness: 1.5, flammable: false },
  { key: 'BRAIN_CORAL', name: 'Brain Coral', model: 'cross', texture: 'brain_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'BRAIN_CORAL_BLOCK', name: 'Brain Coral Block', texture: 'brain_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'BRAIN_CORAL_FAN', name: 'Brain Coral Fan', model: 'cross', texture: 'brain_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'BREWING_STAND', name: 'Brewing Stand', texture: 'brewing_stand.png', hardness: 1.5, flammable: false },
  { key: 'BRICKS', name: 'Bricks', texture: 'bricks.png', hardness: 2.5, flammable: false },
  { key: 'BROWN_CONCRETE', name: 'Brown Concrete', texture: 'brown_concrete.png', hardness: 1.8, flammable: false },
  { key: 'BROWN_CONCRETE_POWDER', name: 'Brown Concrete Powder', texture: 'brown_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'BROWN_GLAZED_TERRACOTTA', name: 'Brown Glazed Terracotta', texture: 'brown_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'BROWN_MUSHROOM', name: 'Brown Mushroom', model: 'cross', texture: 'brown_mushroom.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'BROWN_MUSHROOM_BLOCK', name: 'Brown Mushroom Block', texture: 'brown_mushroom_block.png', hardness: 1.5, flammable: false },
  { key: 'BROWN_SHULKER_BOX', name: 'Brown Shulker Box', texture: 'brown_shulker_box.png', hardness: 2, flammable: false },
  { key: 'BROWN_STAINED_GLASS', name: 'Brown Stained Glass', texture: 'brown_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'BROWN_TERRACOTTA', name: 'Brown Terracotta', texture: 'brown_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'BROWN_WOOL', name: 'Brown Wool', texture: 'brown_wool.png', hardness: 0.8, flammable: true },
  { key: 'BUBBLE_CORAL', name: 'Bubble Coral', model: 'cross', texture: 'bubble_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'BUBBLE_CORAL_BLOCK', name: 'Bubble Coral Block', texture: 'bubble_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'BUBBLE_CORAL_FAN', name: 'Bubble Coral Fan', model: 'cross', texture: 'bubble_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'BUDDING_AMETHYST', name: 'Budding Amethyst', texture: 'budding_amethyst.png', hardness: 1.5, flammable: false },
  { key: 'BUSH', name: 'Bush', model: 'cross', texture: 'bush.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'CACTUS', name: 'Cactus', textures: { top: 'cactus_top.png', side: 'cactus_side.png', bottom: 'cactus_bottom.png' }, hardness: 0.4 , flammable: false},
  { key: 'CACTUS_FLOWER', name: 'Cactus Flower', texture: 'cactus_flower.png', hardness: 1.5, flammable: false },
  { key: 'CALCITE', name: 'Calcite', texture: 'calcite.png', hardness: 3, flammable: false },
  { key: 'CAMPFIRE_LOG', name: 'Campfire Log', texture: 'campfire_log.png', hardness: 2, flammable: true },
  { key: 'CARVED_PUMPKIN', name: 'Carved Pumpkin', texture: 'carved_pumpkin.png', hardness: 1.5, flammable: false },
  { key: 'CAULDRON', name: 'Cauldron', textures: { top: 'cauldron_top.png', side: 'cauldron_side.png', bottom: 'cauldron_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'CHERRY_LEAVES', name: 'Cherry Leaves', texture: 'cherry_leaves.png', alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'CHERRY_LOG', name: 'Cherry Log', textures: { top: 'cherry_log_top.png', side: 'cherry_log.png' }, hardness: 2, flammable: true },
  { key: 'CHERRY_PLANKS', name: 'Cherry Planks', texture: 'cherry_planks.png', hardness: 2, flammable: true },
  { key: 'CHERRY_SAPLING', name: 'Cherry Sapling', model: 'cross', texture: 'cherry_sapling.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'CHIPPED_ANVIL', name: 'Chipped Anvil', textures: { top: 'chipped_anvil_top.png', side: 'chipped_anvil_top.png' }, hardness: 5, flammable: false },
  { key: 'CHISELED_COPPER', name: 'Chiseled Copper', texture: 'chiseled_copper.png', hardness: 1.5, flammable: false },
  { key: 'CHISELED_DEEPSLATE', name: 'Chiseled Deepslate', texture: 'chiseled_deepslate.png', hardness: 3, flammable: false },
  { key: 'CHISELED_NETHER_BRICKS', name: 'Chiseled Nether Bricks', texture: 'chiseled_nether_bricks.png', hardness: 2.5, flammable: false },
  { key: 'CHISELED_POLISHED_BLACKSTONE', name: 'Chiseled Polished Blackstone', texture: 'chiseled_polished_blackstone.png', hardness: 3, flammable: false },
  { key: 'CHISELED_QUARTZ_BLOCK', name: 'Chiseled Quartz Block', textures: { top: 'chiseled_quartz_block_top.png', side: 'chiseled_quartz_block.png' }, hardness: 1.5, flammable: false },
  { key: 'CHISELED_RED_SANDSTONE', name: 'Chiseled Red Sandstone', texture: 'chiseled_red_sandstone.png', hardness: 0.5, flammable: false },
  { key: 'CHISELED_RESIN_BRICKS', name: 'Chiseled Resin Bricks', texture: 'chiseled_resin_bricks.png', hardness: 2.5, flammable: false },
  { key: 'CHISELED_SANDSTONE', name: 'Chiseled Sandstone', texture: 'chiseled_sandstone.png', hardness: 0.5, flammable: false },
  { key: 'CHISELED_STONE_BRICKS', name: 'Chiseled Stone Bricks', texture: 'chiseled_stone_bricks.png', hardness: 2.5, flammable: false },
  { key: 'CHISELED_TUFF', name: 'Chiseled Tuff', textures: { top: 'chiseled_tuff_top.png', side: 'chiseled_tuff.png' }, hardness: 3, flammable: false },
  { key: 'CHISELED_TUFF_BRICKS', name: 'Chiseled Tuff Bricks', textures: { top: 'chiseled_tuff_bricks_top.png', side: 'chiseled_tuff_bricks.png' }, hardness: 2.5, flammable: false },
  { key: 'CHORUS_FLOWER', name: 'Chorus Flower', texture: 'chorus_flower.png', hardness: 1.5, flammable: false },
  { key: 'CHORUS_FLOWER_DEAD', name: 'Chorus Flower Dead', texture: 'chorus_flower_dead.png', hardness: 1.5, flammable: false },
  { key: 'CHORUS_PLANT', name: 'Chorus Plant', texture: 'chorus_plant.png', hardness: 1.5, flammable: false },
  { key: 'CLOSED_EYEBLOSSOM', name: 'Closed Eyeblossom', model: 'cross', texture: 'closed_eyeblossom.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'COAL_BLOCK', name: 'Coal Block', texture: 'coal_block.png', hardness: 5, flammable: false },
  { key: 'COARSE_DIRT', name: 'Coarse Dirt', texture: 'coarse_dirt.png', hardness: 0.5, flammable: false },
  { key: 'COBBLED_DEEPSLATE', name: 'Cobbled Deepslate', texture: 'cobbled_deepslate.png', hardness: 3, flammable: false },
  { key: 'COBBLESTONE', name: 'Cobblestone', texture: 'cobblestone.png', hardness: 1.5, flammable: false },
  { key: 'COBWEB', name: 'Cobweb', model: 'cross', texture: 'cobweb.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'COMPOSTER', name: 'Composter', textures: { top: 'composter_top.png', side: 'composter_side.png', bottom: 'composter_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'CONDUIT', name: 'Conduit', model: 'cross', texture: 'conduit.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'COPPER_BARS', name: 'Copper Bars', model: 'cross', texture: 'copper_bars.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'COPPER_BLOCK', name: 'Copper Block', texture: 'copper_block.png', hardness: 5, flammable: false },
  { key: 'COPPER_CHAIN', name: 'Copper Chain', model: 'cross', texture: 'copper_chain.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'COPPER_LANTERN', name: 'Copper Lantern', model: 'cross', texture: 'copper_lantern.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'COPPER_ORE', name: 'Copper Ore', texture: 'copper_ore.png', hardness: 3, flammable: false },
  { key: 'COPPER_TORCH', name: 'Copper Torch', model: 'cross', texture: 'copper_torch.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'CORNFLOWER', name: 'Cornflower', model: 'cross', texture: 'cornflower.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'CRACKED_DEEPSLATE_BRICKS', name: 'Cracked Deepslate Bricks', texture: 'cracked_deepslate_bricks.png', hardness: 2.5, flammable: false },
  { key: 'CRACKED_DEEPSLATE_TILES', name: 'Cracked Deepslate Tiles', texture: 'cracked_deepslate_tiles.png', hardness: 2.5, flammable: false },
  { key: 'CRACKED_NETHER_BRICKS', name: 'Cracked Nether Bricks', texture: 'cracked_nether_bricks.png', hardness: 2.5, flammable: false },
  { key: 'CRACKED_POLISHED_BLACKSTONE_BRICKS', name: 'Cracked Polished Blackstone Bricks', texture: 'cracked_polished_blackstone_bricks.png', hardness: 2.5, flammable: false },
  { key: 'CRACKED_STONE_BRICKS', name: 'Cracked Stone Bricks', texture: 'cracked_stone_bricks.png', hardness: 2.5, flammable: false },
  { key: 'CRAFTING_TABLE', name: 'Crafting Table', textures: { top: 'crafting_table_top.png', side: 'crafting_table_side.png' }, hardness: 1.5, flammable: false },
  { key: 'CREAKING_HEART', name: 'Creaking Heart', textures: { top: 'creaking_heart_top.png', side: 'creaking_heart.png' }, hardness: 1.5, flammable: false },
  { key: 'CRIMSON_FUNGUS', name: 'Crimson Fungus', texture: 'crimson_fungus.png', hardness: 1.5, flammable: false },
  { key: 'CRIMSON_NYLIUM', name: 'Crimson Nylium', texture: 'crimson_nylium_side.png', hardness: 0.5, flammable: false },
  { key: 'CRIMSON_PLANKS', name: 'Crimson Planks', texture: 'crimson_planks.png', hardness: 2, flammable: true },
  { key: 'CRIMSON_ROOTS', name: 'Crimson Roots', model: 'cross', texture: 'crimson_roots.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'CRIMSON_ROOTS_POT', name: 'Crimson Roots Pot', model: 'cross', texture: 'crimson_roots_pot.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'CRIMSON_STEM', name: 'Crimson Stem', textures: { top: 'crimson_stem_top.png', side: 'crimson_stem.png' }, hardness: 2, flammable: false },
  { key: 'CRYING_OBSIDIAN', name: 'Crying Obsidian', texture: 'crying_obsidian.png', hardness: 50, flammable: false },
  { key: 'CUT_COPPER', name: 'Cut Copper', texture: 'cut_copper.png', hardness: 1.5, flammable: false },
  { key: 'CUT_RED_SANDSTONE', name: 'Cut Red Sandstone', texture: 'cut_red_sandstone.png', hardness: 0.5, flammable: false },
  { key: 'CUT_SANDSTONE', name: 'Cut Sandstone', texture: 'cut_sandstone.png', hardness: 0.5, flammable: false },
  { key: 'CYAN_CONCRETE', name: 'Cyan Concrete', texture: 'cyan_concrete.png', hardness: 1.8, flammable: false },
  { key: 'CYAN_CONCRETE_POWDER', name: 'Cyan Concrete Powder', texture: 'cyan_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'CYAN_GLAZED_TERRACOTTA', name: 'Cyan Glazed Terracotta', texture: 'cyan_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'CYAN_SHULKER_BOX', name: 'Cyan Shulker Box', texture: 'cyan_shulker_box.png', hardness: 2, flammable: false },
  { key: 'CYAN_STAINED_GLASS', name: 'Cyan Stained Glass', texture: 'cyan_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'CYAN_TERRACOTTA', name: 'Cyan Terracotta', texture: 'cyan_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'CYAN_WOOL', name: 'Cyan Wool', texture: 'cyan_wool.png', hardness: 0.8, flammable: true },
  { key: 'DAMAGED_ANVIL', name: 'Damaged Anvil', textures: { top: 'damaged_anvil_top.png', side: 'damaged_anvil_top.png' }, hardness: 5, flammable: false },
  { key: 'DANDELION', name: 'Dandelion', model: 'cross', texture: 'dandelion.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DARK_OAK_LEAVES', name: 'Dark Oak Leaves', texture: 'dark_oak_leaves.png', color: 0x6bc24b, alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'DARK_OAK_LOG', name: 'Dark Oak Log', textures: { top: 'dark_oak_log_top.png', side: 'dark_oak_log.png' }, hardness: 2, flammable: true },
  { key: 'DARK_OAK_PLANKS', name: 'Dark Oak Planks', texture: 'dark_oak_planks.png', hardness: 2, flammable: true },
  { key: 'DARK_OAK_SAPLING', name: 'Dark Oak Sapling', model: 'cross', texture: 'dark_oak_sapling.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'DARK_PRISMARINE', name: 'Dark Prismarine', texture: 'dark_prismarine.png', hardness: 1.5, flammable: false },
  { key: 'DAYLIGHT_DETECTOR', name: 'Daylight Detector', textures: { top: 'daylight_detector_top.png', side: 'daylight_detector_side.png' }, hardness: 1.5, flammable: false },
  { key: 'DEAD_BRAIN_CORAL', name: 'Dead Brain Coral', model: 'cross', texture: 'dead_brain_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_BRAIN_CORAL_BLOCK', name: 'Dead Brain Coral Block', texture: 'dead_brain_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'DEAD_BRAIN_CORAL_FAN', name: 'Dead Brain Coral Fan', model: 'cross', texture: 'dead_brain_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_BUBBLE_CORAL', name: 'Dead Bubble Coral', model: 'cross', texture: 'dead_bubble_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_BUBBLE_CORAL_BLOCK', name: 'Dead Bubble Coral Block', texture: 'dead_bubble_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'DEAD_BUBBLE_CORAL_FAN', name: 'Dead Bubble Coral Fan', model: 'cross', texture: 'dead_bubble_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_FIRE_CORAL', name: 'Dead Fire Coral', model: 'cross', texture: 'dead_fire_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_FIRE_CORAL_BLOCK', name: 'Dead Fire Coral Block', texture: 'dead_fire_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'DEAD_FIRE_CORAL_FAN', name: 'Dead Fire Coral Fan', model: 'cross', texture: 'dead_fire_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_HORN_CORAL', name: 'Dead Horn Coral', model: 'cross', texture: 'dead_horn_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_HORN_CORAL_BLOCK', name: 'Dead Horn Coral Block', texture: 'dead_horn_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'DEAD_HORN_CORAL_FAN', name: 'Dead Horn Coral Fan', model: 'cross', texture: 'dead_horn_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_TUBE_CORAL', name: 'Dead Tube Coral', model: 'cross', texture: 'dead_tube_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEAD_TUBE_CORAL_BLOCK', name: 'Dead Tube Coral Block', texture: 'dead_tube_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'DEAD_TUBE_CORAL_FAN', name: 'Dead Tube Coral Fan', model: 'cross', texture: 'dead_tube_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DEEPSLATE_BRICKS', name: 'Deepslate Bricks', texture: 'deepslate_bricks.png', hardness: 2.5, flammable: false },
  { key: 'DEEPSLATE_COPPER_ORE', name: 'Deepslate Copper Ore', texture: 'deepslate_copper_ore.png', hardness: 3, flammable: false },
  { key: 'DEEPSLATE_EMERALD_ORE', name: 'Deepslate Emerald Ore', texture: 'deepslate_emerald_ore.png', hardness: 3, flammable: false },
  { key: 'DEEPSLATE_LAPIS_ORE', name: 'Deepslate Lapis Ore', texture: 'deepslate_lapis_ore.png', hardness: 3, flammable: false },
  { key: 'DEEPSLATE_REDSTONE_ORE', name: 'Deepslate Redstone Ore', texture: 'deepslate_redstone_ore.png', hardness: 3, flammable: false },
  { key: 'DEEPSLATE_TILES', name: 'Deepslate Tiles', texture: 'deepslate_tiles.png', hardness: 2.5, flammable: false },
  { key: 'DIAMOND_BLOCK', name: 'Diamond Block', texture: 'diamond_block.png', hardness: 5, flammable: false },
  { key: 'DIORITE', name: 'Diorite', texture: 'diorite.png', hardness: 1.5, flammable: false },
  { key: 'DIRT_PATH', name: 'Dirt Path', textures: { top: 'dirt_path_top.png', side: 'dirt_path_side.png' }, hardness: 0.5, flammable: false },
  { key: 'DISPENSER', name: 'Dispenser', texture: 'dispenser_front.png', hardness: 1.5, flammable: false },
  { key: 'DRIED_KELP', name: 'Dried Kelp', model: 'cross', texture: 'dried_kelp_side.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'DRIPSTONE_BLOCK', name: 'Dripstone Block', texture: 'dripstone_block.png', hardness: 3, flammable: false },
  { key: 'DROPPER', name: 'Dropper', texture: 'dropper_front.png', hardness: 1.5, flammable: false },
  { key: 'EMERALD_BLOCK', name: 'Emerald Block', texture: 'emerald_block.png', hardness: 5, flammable: false },
  { key: 'EMERALD_ORE', name: 'Emerald Ore', texture: 'emerald_ore.png', hardness: 3, flammable: false },
  { key: 'ENCHANTING_TABLE', name: 'Enchanting Table', textures: { top: 'enchanting_table_top.png', side: 'enchanting_table_side.png', bottom: 'enchanting_table_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'END_ROD', name: 'End Rod', model: 'cross', texture: 'end_rod.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'END_STONE', name: 'End Stone', texture: 'end_stone.png', hardness: 1.5, flammable: false },
  { key: 'END_STONE_BRICKS', name: 'End Stone Bricks', texture: 'end_stone_bricks.png', hardness: 2.5, flammable: false },
  { key: 'EXPOSED_CHISELED_COPPER', name: 'Exposed Chiseled Copper', texture: 'exposed_chiseled_copper.png', hardness: 1.5, flammable: false },
  { key: 'EXPOSED_COPPER', name: 'Exposed Copper', texture: 'exposed_copper.png', hardness: 1.5, flammable: false },
  { key: 'EXPOSED_COPPER_BARS', name: 'Exposed Copper Bars', model: 'cross', texture: 'exposed_copper_bars.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'EXPOSED_COPPER_CHAIN', name: 'Exposed Copper Chain', model: 'cross', texture: 'exposed_copper_chain.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'EXPOSED_COPPER_LANTERN', name: 'Exposed Copper Lantern', model: 'cross', texture: 'exposed_copper_lantern.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'EXPOSED_CUT_COPPER', name: 'Exposed Cut Copper', texture: 'exposed_cut_copper.png', hardness: 1.5, flammable: false },
  { key: 'EXPOSED_LIGHTNING_ROD', name: 'Exposed Lightning Rod', model: 'cross', texture: 'exposed_lightning_rod.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'FARMLAND', name: 'Farmland', texture: 'farmland.png', hardness: 0.5, flammable: false },
  { key: 'FARMLAND_MOIST', name: 'Farmland Moist', texture: 'farmland_moist.png', hardness: 0.5, flammable: false },
  { key: 'FERN', name: 'Fern', model: 'cross', texture: 'fern.png', color: 0x77c05d, alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'FIRE_CORAL', name: 'Fire Coral', model: 'cross', texture: 'fire_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'FIRE_CORAL_BLOCK', name: 'Fire Coral Block', texture: 'fire_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'FIRE_CORAL_FAN', name: 'Fire Coral Fan', model: 'cross', texture: 'fire_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'FIREFLY_BUSH', name: 'Firefly Bush', model: 'cross', texture: 'firefly_bush.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'FLETCHING_TABLE', name: 'Fletching Table', textures: { top: 'fletching_table_top.png', side: 'fletching_table_side.png' }, hardness: 1.5, flammable: false },
  { key: 'FLOWERING_AZALEA', name: 'Flowering Azalea', textures: { top: 'flowering_azalea_top.png', side: 'flowering_azalea_side.png' }, hardness: 1.5, flammable: false },
  { key: 'FLOWERING_AZALEA_LEAVES', name: 'Flowering Azalea Leaves', texture: 'flowering_azalea_leaves.png', alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'FROGSPAWN', name: 'Frogspawn', model: 'cross', texture: 'frogspawn.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'FROSTED_ICE_0', name: 'Frosted Ice 0', texture: 'frosted_ice_0.png', hardness: 0.5, flammable: false },
  { key: 'FROSTED_ICE_1', name: 'Frosted Ice 1', texture: 'frosted_ice_1.png', hardness: 0.5, flammable: false },
  { key: 'FROSTED_ICE_2', name: 'Frosted Ice 2', texture: 'frosted_ice_2.png', hardness: 0.5, flammable: false },
  { key: 'FROSTED_ICE_3', name: 'Frosted Ice 3', texture: 'frosted_ice_3.png', hardness: 0.5, flammable: false },
  { key: 'FURNACE', name: 'Furnace', textures: { top: 'furnace_top.png', side: 'furnace_side.png' }, hardness: 1.5, flammable: false },
  { key: 'GILDED_BLACKSTONE', name: 'Gilded Blackstone', texture: 'gilded_blackstone.png', hardness: 3, flammable: false },
  { key: 'GLASS', name: 'Glass', texture: 'glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'GLOW_LICHEN', name: 'Glow Lichen', model: 'cross', texture: 'glow_lichen.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'GLOWSTONE', name: 'Glowstone', texture: 'glowstone.png', hardness: 0.3, flammable: false, light: 15 },
  { key: 'GOLD_BLOCK', name: 'Gold Block', texture: 'gold_block.png', hardness: 5, flammable: false },
  { key: 'GRANITE', name: 'Granite', texture: 'granite.png', hardness: 1.5, flammable: false },
  { key: 'GRAY_CONCRETE', name: 'Gray Concrete', texture: 'gray_concrete.png', hardness: 1.8, flammable: false },
  { key: 'GRAY_CONCRETE_POWDER', name: 'Gray Concrete Powder', texture: 'gray_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'GRAY_GLAZED_TERRACOTTA', name: 'Gray Glazed Terracotta', texture: 'gray_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'GRAY_SHULKER_BOX', name: 'Gray Shulker Box', texture: 'gray_shulker_box.png', hardness: 2, flammable: false },
  { key: 'GRAY_STAINED_GLASS', name: 'Gray Stained Glass', texture: 'gray_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'GRAY_TERRACOTTA', name: 'Gray Terracotta', texture: 'gray_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'GRAY_WOOL', name: 'Gray Wool', texture: 'gray_wool.png', hardness: 0.8, flammable: true },
  { key: 'GREEN_CONCRETE', name: 'Green Concrete', texture: 'green_concrete.png', hardness: 1.8, flammable: false },
  { key: 'GREEN_CONCRETE_POWDER', name: 'Green Concrete Powder', texture: 'green_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'GREEN_GLAZED_TERRACOTTA', name: 'Green Glazed Terracotta', texture: 'green_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'GREEN_SHULKER_BOX', name: 'Green Shulker Box', texture: 'green_shulker_box.png', hardness: 2, flammable: false },
  { key: 'GREEN_STAINED_GLASS', name: 'Green Stained Glass', texture: 'green_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'GREEN_TERRACOTTA', name: 'Green Terracotta', texture: 'green_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'GREEN_WOOL', name: 'Green Wool', texture: 'green_wool.png', hardness: 0.8, flammable: true },
  { key: 'GRINDSTONE', name: 'Grindstone', texture: 'grindstone_side.png', hardness: 1.5, flammable: false },
  { key: 'HANGING_ROOTS', name: 'Hanging Roots', model: 'cross', texture: 'hanging_roots.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'HAY_BLOCK', name: 'Hay Block', textures: { top: 'hay_block_top.png', side: 'hay_block_side.png' }, hardness: 1.5, flammable: true },
  { key: 'HEAVY_CORE', name: 'Heavy Core', texture: 'heavy_core.png', hardness: 3, flammable: false },
  { key: 'HONEY_BLOCK', name: 'Honey Block', textures: { top: 'honey_block_top.png', side: 'honey_block_side.png', bottom: 'honey_block_bottom.png' }, hardness: 0.4, flammable: false },
  { key: 'HONEYCOMB_BLOCK', name: 'Honeycomb Block', texture: 'honeycomb_block.png', hardness: 1.5, flammable: false },
  { key: 'HOPPER', name: 'Hopper', textures: { top: 'hopper_top.png', side: 'hopper_top.png' }, hardness: 1.5, flammable: false },
  { key: 'HORN_CORAL', name: 'Horn Coral', model: 'cross', texture: 'horn_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'HORN_CORAL_BLOCK', name: 'Horn Coral Block', texture: 'horn_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'HORN_CORAL_FAN', name: 'Horn Coral Fan', model: 'cross', texture: 'horn_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'IRON_BARS', name: 'Iron Bars', model: 'cross', texture: 'iron_bars.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'IRON_BLOCK', name: 'Iron Block', texture: 'iron_block.png', hardness: 5, flammable: false },
  { key: 'IRON_CHAIN', name: 'Iron Chain', model: 'cross', texture: 'iron_chain.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'JACK_O_LANTERN', name: 'Jack O Lantern', model: 'cross', texture: 'jack_o_lantern.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 15 },
  { key: 'JUKEBOX', name: 'Jukebox', textures: { top: 'jukebox_top.png', side: 'jukebox_side.png' }, hardness: 1.5, flammable: false },
  { key: 'JUNGLE_LEAVES', name: 'Jungle Leaves', texture: 'jungle_leaves.png', color: 0x6bc24b, alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'JUNGLE_LOG', name: 'Jungle Log', textures: { top: 'jungle_log_top.png', side: 'jungle_log.png' }, hardness: 2, flammable: true },
  { key: 'JUNGLE_PLANKS', name: 'Jungle Planks', texture: 'jungle_planks.png', hardness: 2, flammable: true },
  { key: 'JUNGLE_SAPLING', name: 'Jungle Sapling', model: 'cross', texture: 'jungle_sapling.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'KELP', name: 'Kelp', model: 'cross', texture: 'kelp.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'KELP_PLANT', name: 'Kelp Plant', model: 'cross', texture: 'kelp_plant.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'LADDER', name: 'Ladder', model: 'cross', texture: 'ladder.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'LANTERN', name: 'Lantern', model: 'cross', texture: 'lantern.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'LAPIS_BLOCK', name: 'Lapis Block', texture: 'lapis_block.png', hardness: 5, flammable: false },
  { key: 'LAPIS_ORE', name: 'Lapis Ore', texture: 'lapis_ore.png', hardness: 3, flammable: false },
  { key: 'LARGE_AMETHYST_BUD', name: 'Large Amethyst Bud', model: 'cross', texture: 'large_amethyst_bud.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'LARGE_FERN', name: 'Large Fern', model: 'cross', texture: 'large_fern_top.png', color: 0x77c05d, alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'LEVER', name: 'Lever', model: 'cross', texture: 'lever.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'LIGHT_BLUE_CONCRETE', name: 'Light Blue Concrete', texture: 'light_blue_concrete.png', hardness: 1.8, flammable: false },
  { key: 'LIGHT_BLUE_CONCRETE_POWDER', name: 'Light Blue Concrete Powder', texture: 'light_blue_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'LIGHT_BLUE_GLAZED_TERRACOTTA', name: 'Light Blue Glazed Terracotta', texture: 'light_blue_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'LIGHT_BLUE_SHULKER_BOX', name: 'Light Blue Shulker Box', texture: 'light_blue_shulker_box.png', hardness: 2, flammable: false },
  { key: 'LIGHT_BLUE_STAINED_GLASS', name: 'Light Blue Stained Glass', texture: 'light_blue_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'LIGHT_BLUE_TERRACOTTA', name: 'Light Blue Terracotta', texture: 'light_blue_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'LIGHT_BLUE_WOOL', name: 'Light Blue Wool', texture: 'light_blue_wool.png', hardness: 0.8, flammable: true },
  { key: 'LIGHT_GRAY_CONCRETE', name: 'Light Gray Concrete', texture: 'light_gray_concrete.png', hardness: 1.8, flammable: false },
  { key: 'LIGHT_GRAY_CONCRETE_POWDER', name: 'Light Gray Concrete Powder', texture: 'light_gray_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'LIGHT_GRAY_GLAZED_TERRACOTTA', name: 'Light Gray Glazed Terracotta', texture: 'light_gray_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'LIGHT_GRAY_SHULKER_BOX', name: 'Light Gray Shulker Box', texture: 'light_gray_shulker_box.png', hardness: 2, flammable: false },
  { key: 'LIGHT_GRAY_STAINED_GLASS', name: 'Light Gray Stained Glass', texture: 'light_gray_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'LIGHT_GRAY_TERRACOTTA', name: 'Light Gray Terracotta', texture: 'light_gray_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'LIGHT_GRAY_WOOL', name: 'Light Gray Wool', texture: 'light_gray_wool.png', hardness: 0.8, flammable: true },
  { key: 'LIGHTNING_ROD', name: 'Lightning Rod', model: 'cross', texture: 'lightning_rod.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'LILAC', name: 'Lilac', model: 'cross', texture: 'lilac_top.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'LILY_OF_THE_VALLEY', name: 'Lily Of The Valley', model: 'cross', texture: 'lily_of_the_valley.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'LILY_PAD', name: 'Lily Pad', model: 'cross', texture: 'lily_pad.png', color: 0x77c05d, alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'LIME_CONCRETE', name: 'Lime Concrete', texture: 'lime_concrete.png', hardness: 1.8, flammable: false },
  { key: 'LIME_CONCRETE_POWDER', name: 'Lime Concrete Powder', texture: 'lime_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'LIME_GLAZED_TERRACOTTA', name: 'Lime Glazed Terracotta', texture: 'lime_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'LIME_SHULKER_BOX', name: 'Lime Shulker Box', texture: 'lime_shulker_box.png', hardness: 2, flammable: false },
  { key: 'LIME_STAINED_GLASS', name: 'Lime Stained Glass', texture: 'lime_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'LIME_TERRACOTTA', name: 'Lime Terracotta', texture: 'lime_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'LIME_WOOL', name: 'Lime Wool', texture: 'lime_wool.png', hardness: 0.8, flammable: true },
  { key: 'LODESTONE', name: 'Lodestone', textures: { top: 'lodestone_top.png', side: 'lodestone_side.png' }, hardness: 1.5, flammable: false },
  { key: 'LOOM', name: 'Loom', textures: { top: 'loom_top.png', side: 'loom_side.png', bottom: 'loom_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'MAGENTA_CONCRETE', name: 'Magenta Concrete', texture: 'magenta_concrete.png', hardness: 1.8, flammable: false },
  { key: 'MAGENTA_CONCRETE_POWDER', name: 'Magenta Concrete Powder', texture: 'magenta_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'MAGENTA_GLAZED_TERRACOTTA', name: 'Magenta Glazed Terracotta', texture: 'magenta_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'MAGENTA_SHULKER_BOX', name: 'Magenta Shulker Box', texture: 'magenta_shulker_box.png', hardness: 2, flammable: false },
  { key: 'MAGENTA_STAINED_GLASS', name: 'Magenta Stained Glass', texture: 'magenta_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'MAGENTA_TERRACOTTA', name: 'Magenta Terracotta', texture: 'magenta_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'MAGENTA_WOOL', name: 'Magenta Wool', texture: 'magenta_wool.png', hardness: 0.8, flammable: true },
  { key: 'MAGMA', name: 'Magma', texture: 'magma.png', hardness: 1.5, flammable: false, light: 3 },
  { key: 'MANGROVE_LEAVES', name: 'Mangrove Leaves', texture: 'mangrove_leaves.png', color: 0x6bc24b, alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'MANGROVE_LOG', name: 'Mangrove Log', textures: { top: 'mangrove_log_top.png', side: 'mangrove_log.png' }, hardness: 2, flammable: true },
  { key: 'MANGROVE_PLANKS', name: 'Mangrove Planks', texture: 'mangrove_planks.png', hardness: 2, flammable: true },
  { key: 'MANGROVE_PROPAGULE', name: 'Mangrove Propagule', texture: 'mangrove_propagule.png', hardness: 1.5, flammable: false },
  { key: 'MANGROVE_PROPAGULE_HANGING', name: 'Mangrove Propagule Hanging', texture: 'mangrove_propagule_hanging.png', hardness: 1.5, flammable: false },
  { key: 'MANGROVE_ROOTS', name: 'Mangrove Roots', model: 'cross', texture: 'mangrove_roots_side.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'MEDIUM_AMETHYST_BUD', name: 'Medium Amethyst Bud', model: 'cross', texture: 'medium_amethyst_bud.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'MELON', name: 'Melon', textures: { top: 'melon_top.png', side: 'melon_side.png' }, hardness: 1.5, flammable: false },
  { key: 'MELON_STEM', name: 'Melon Stem', model: 'cross', texture: 'melon_stem.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'MOSSY_COBBLESTONE', name: 'Mossy Cobblestone', texture: 'mossy_cobblestone.png', hardness: 1.5, flammable: true },
  { key: 'MOSSY_STONE_BRICKS', name: 'Mossy Stone Bricks', texture: 'mossy_stone_bricks.png', hardness: 2.5, flammable: true },
  { key: 'MUD', name: 'Mud', texture: 'mud.png', hardness: 0.5, flammable: false },
  { key: 'MUD_BRICKS', name: 'Mud Bricks', texture: 'mud_bricks.png', hardness: 2.5, flammable: false },
  { key: 'MUDDY_MANGROVE_ROOTS', name: 'Muddy Mangrove Roots', model: 'cross', texture: 'muddy_mangrove_roots_side.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'MUSHROOM_BLOCK_INSIDE', name: 'Mushroom Block Inside', texture: 'mushroom_block_inside.png', hardness: 1.5, flammable: false },
  { key: 'MUSHROOM_STEM', name: 'Mushroom Stem', texture: 'mushroom_stem.png', hardness: 2, flammable: false },
  { key: 'MYCELIUM', name: 'Mycelium', textures: { top: 'mycelium_top.png', side: 'mycelium_side.png' }, hardness: 0.5, flammable: false },
  { key: 'NETHER_BRICKS', name: 'Nether Bricks', texture: 'nether_bricks.png', hardness: 2.5, flammable: false },
  { key: 'NETHER_GOLD_ORE', name: 'Nether Gold Ore', texture: 'nether_gold_ore.png', hardness: 3, flammable: false },
  { key: 'NETHER_PORTAL', name: 'Nether Portal', texture: 'nether_portal.png', hardness: 1.5, flammable: false },
  { key: 'NETHER_QUARTZ_ORE', name: 'Nether Quartz Ore', texture: 'nether_quartz_ore.png', hardness: 3, flammable: false },
  { key: 'NETHER_SPROUTS', name: 'Nether Sprouts', model: 'cross', texture: 'nether_sprouts.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'NETHER_WART_BLOCK', name: 'Nether Wart Block', texture: 'nether_wart_block.png', hardness: 1.5, flammable: false },
  { key: 'NETHERITE_BLOCK', name: 'Netherite Block', texture: 'netherite_block.png', hardness: 50, flammable: false },
  { key: 'NETHERRACK', name: 'Netherrack', texture: 'netherrack.png', hardness: 1.5, flammable: false },
  { key: 'NOTE_BLOCK', name: 'Note Block', texture: 'note_block.png', hardness: 1.5, flammable: false },
  { key: 'OAK_PLANKS', name: 'Oak Planks', texture: 'oak_planks.png', hardness: 2, flammable: true },
  { key: 'OAK_SAPLING', name: 'Oak Sapling', model: 'cross', texture: 'oak_sapling.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'OBSIDIAN', name: 'Obsidian', texture: 'obsidian.png', hardness: 50, flammable: false },
  { key: 'OCHRE_FROGLIGHT', name: 'Ochre Froglight', textures: { top: 'ochre_froglight_top.png', side: 'ochre_froglight_side.png' }, hardness: 0.3, flammable: false, light: 15 },
  { key: 'OPEN_EYEBLOSSOM', name: 'Open Eyeblossom', model: 'cross', texture: 'open_eyeblossom.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'ORANGE_CONCRETE', name: 'Orange Concrete', texture: 'orange_concrete.png', hardness: 1.8, flammable: false },
  { key: 'ORANGE_CONCRETE_POWDER', name: 'Orange Concrete Powder', texture: 'orange_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'ORANGE_GLAZED_TERRACOTTA', name: 'Orange Glazed Terracotta', texture: 'orange_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'ORANGE_SHULKER_BOX', name: 'Orange Shulker Box', texture: 'orange_shulker_box.png', hardness: 2, flammable: false },
  { key: 'ORANGE_STAINED_GLASS', name: 'Orange Stained Glass', texture: 'orange_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'ORANGE_TERRACOTTA', name: 'Orange Terracotta', texture: 'orange_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'ORANGE_TULIP', name: 'Orange Tulip', model: 'cross', texture: 'orange_tulip.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'ORANGE_WOOL', name: 'Orange Wool', texture: 'orange_wool.png', hardness: 0.8, flammable: true },
  { key: 'OXEYE_DAISY', name: 'Oxeye Daisy', texture: 'oxeye_daisy.png', hardness: 1.5, flammable: false },
  { key: 'OXIDIZED_CHISELED_COPPER', name: 'Oxidized Chiseled Copper', texture: 'oxidized_chiseled_copper.png', hardness: 1.5, flammable: false },
  { key: 'OXIDIZED_COPPER', name: 'Oxidized Copper', texture: 'oxidized_copper.png', hardness: 1.5, flammable: false },
  { key: 'OXIDIZED_COPPER_BARS', name: 'Oxidized Copper Bars', model: 'cross', texture: 'oxidized_copper_bars.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'OXIDIZED_COPPER_CHAIN', name: 'Oxidized Copper Chain', model: 'cross', texture: 'oxidized_copper_chain.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'OXIDIZED_COPPER_LANTERN', name: 'Oxidized Copper Lantern', model: 'cross', texture: 'oxidized_copper_lantern.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'OXIDIZED_CUT_COPPER', name: 'Oxidized Cut Copper', texture: 'oxidized_cut_copper.png', hardness: 1.5, flammable: false },
  { key: 'OXIDIZED_LIGHTNING_ROD', name: 'Oxidized Lightning Rod', model: 'cross', texture: 'oxidized_lightning_rod.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'PACKED_ICE', name: 'Packed Ice', texture: 'packed_ice.png', transparent: true, opacity: 0.9, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.5, flammable: false },
  { key: 'PACKED_MUD', name: 'Packed Mud', texture: 'packed_mud.png', hardness: 0.5, flammable: false },
  { key: 'PALE_HANGING_MOSS', name: 'Pale Hanging Moss', model: 'cross', texture: 'pale_hanging_moss.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'PALE_HANGING_MOSS_TIP', name: 'Pale Hanging Moss Tip', model: 'cross', texture: 'pale_hanging_moss_tip.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'PALE_MOSS_BLOCK', name: 'Pale Moss Block', texture: 'pale_moss_block.png', hardness: 1.5, flammable: true },
  { key: 'PALE_OAK_LEAVES', name: 'Pale Oak Leaves', texture: 'pale_oak_leaves.png', alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'PALE_OAK_LOG', name: 'Pale Oak Log', textures: { top: 'pale_oak_log_top.png', side: 'pale_oak_log.png' }, hardness: 2, flammable: true },
  { key: 'PALE_OAK_PLANKS', name: 'Pale Oak Planks', texture: 'pale_oak_planks.png', hardness: 2, flammable: true },
  { key: 'PALE_OAK_SAPLING', name: 'Pale Oak Sapling', model: 'cross', texture: 'pale_oak_sapling.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'PEARLESCENT_FROGLIGHT', name: 'Pearlescent Froglight', textures: { top: 'pearlescent_froglight_top.png', side: 'pearlescent_froglight_side.png' }, hardness: 0.3, flammable: false, light: 15 },
  { key: 'PEONY', name: 'Peony', model: 'cross', texture: 'peony_top.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'PINK_CONCRETE', name: 'Pink Concrete', texture: 'pink_concrete.png', hardness: 1.8, flammable: false },
  { key: 'PINK_CONCRETE_POWDER', name: 'Pink Concrete Powder', texture: 'pink_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'PINK_GLAZED_TERRACOTTA', name: 'Pink Glazed Terracotta', texture: 'pink_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'PINK_PETALS', name: 'Pink Petals', model: 'cross', texture: 'pink_petals.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'PINK_PETALS_STEM', name: 'Pink Petals Stem', model: 'cross', texture: 'pink_petals_stem.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'PINK_SHULKER_BOX', name: 'Pink Shulker Box', texture: 'pink_shulker_box.png', hardness: 2, flammable: false },
  { key: 'PINK_STAINED_GLASS', name: 'Pink Stained Glass', texture: 'pink_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'PINK_TERRACOTTA', name: 'Pink Terracotta', texture: 'pink_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'PINK_TULIP', name: 'Pink Tulip', model: 'cross', texture: 'pink_tulip.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'PINK_WOOL', name: 'Pink Wool', texture: 'pink_wool.png', hardness: 0.8, flammable: true },
  { key: 'PITCHER_CROP', name: 'Pitcher Crop', textures: { top: 'pitcher_crop_top.png', side: 'pitcher_crop_side.png', bottom: 'pitcher_crop_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'PODZOL', name: 'Podzol', textures: { top: 'podzol_top.png', side: 'podzol_side.png' }, hardness: 0.5, flammable: false },
  { key: 'POINTED_DRIPSTONE_DOWN_BASE', name: 'Pointed Dripstone Down Base', model: 'cross', texture: 'pointed_dripstone_down_base.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_DOWN_FRUSTUM', name: 'Pointed Dripstone Down Frustum', model: 'cross', texture: 'pointed_dripstone_down_frustum.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_DOWN_MIDDLE', name: 'Pointed Dripstone Down Middle', model: 'cross', texture: 'pointed_dripstone_down_middle.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_DOWN_TIP', name: 'Pointed Dripstone Down Tip', model: 'cross', texture: 'pointed_dripstone_down_tip.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_DOWN_TIP_MERGE', name: 'Pointed Dripstone Down Tip Merge', model: 'cross', texture: 'pointed_dripstone_down_tip_merge.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_UP_BASE', name: 'Pointed Dripstone Up Base', model: 'cross', texture: 'pointed_dripstone_up_base.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_UP_FRUSTUM', name: 'Pointed Dripstone Up Frustum', model: 'cross', texture: 'pointed_dripstone_up_frustum.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_UP_MIDDLE', name: 'Pointed Dripstone Up Middle', model: 'cross', texture: 'pointed_dripstone_up_middle.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_UP_TIP', name: 'Pointed Dripstone Up Tip', model: 'cross', texture: 'pointed_dripstone_up_tip.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POINTED_DRIPSTONE_UP_TIP_MERGE', name: 'Pointed Dripstone Up Tip Merge', model: 'cross', texture: 'pointed_dripstone_up_tip_merge.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POLISHED_ANDESITE', name: 'Polished Andesite', texture: 'polished_andesite.png', hardness: 3, flammable: false },
  { key: 'POLISHED_BASALT', name: 'Polished Basalt', textures: { top: 'polished_basalt_top.png', side: 'polished_basalt_side.png' }, hardness: 3, flammable: false },
  { key: 'POLISHED_BLACKSTONE', name: 'Polished Blackstone', texture: 'polished_blackstone.png', hardness: 3, flammable: false },
  { key: 'POLISHED_BLACKSTONE_BRICKS', name: 'Polished Blackstone Bricks', texture: 'polished_blackstone_bricks.png', hardness: 2.5, flammable: false },
  { key: 'POLISHED_DEEPSLATE', name: 'Polished Deepslate', texture: 'polished_deepslate.png', hardness: 3, flammable: false },
  { key: 'POLISHED_DIORITE', name: 'Polished Diorite', texture: 'polished_diorite.png', hardness: 3, flammable: false },
  { key: 'POLISHED_GRANITE', name: 'Polished Granite', texture: 'polished_granite.png', hardness: 3, flammable: false },
  { key: 'POLISHED_TUFF', name: 'Polished Tuff', texture: 'polished_tuff.png', hardness: 3, flammable: false },
  { key: 'POPPY', name: 'Poppy', model: 'cross', texture: 'poppy.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'POWDER_SNOW', name: 'Powder Snow', texture: 'powder_snow.png', hardness: 1.5, flammable: false },
  { key: 'PRISMARINE', name: 'Prismarine', texture: 'prismarine.png', hardness: 1.5, flammable: false },
  { key: 'PRISMARINE_BRICKS', name: 'Prismarine Bricks', texture: 'prismarine_bricks.png', hardness: 2.5, flammable: false },
  { key: 'PUMPKIN', name: 'Pumpkin', textures: { top: 'pumpkin_top.png', side: 'pumpkin_side.png' }, hardness: 1.5, flammable: false },
  { key: 'PUMPKIN_STEM', name: 'Pumpkin Stem', model: 'cross', texture: 'pumpkin_stem.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'PURPLE_CONCRETE', name: 'Purple Concrete', texture: 'purple_concrete.png', hardness: 1.8, flammable: false },
  { key: 'PURPLE_CONCRETE_POWDER', name: 'Purple Concrete Powder', texture: 'purple_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'PURPLE_GLAZED_TERRACOTTA', name: 'Purple Glazed Terracotta', texture: 'purple_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'PURPLE_SHULKER_BOX', name: 'Purple Shulker Box', texture: 'purple_shulker_box.png', hardness: 2, flammable: false },
  { key: 'PURPLE_STAINED_GLASS', name: 'Purple Stained Glass', texture: 'purple_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'PURPLE_TERRACOTTA', name: 'Purple Terracotta', texture: 'purple_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'PURPLE_WOOL', name: 'Purple Wool', texture: 'purple_wool.png', hardness: 0.8, flammable: true },
  { key: 'PURPUR_BLOCK', name: 'Purpur Block', texture: 'purpur_block.png', hardness: 1.5, flammable: false },
  { key: 'PURPUR_PILLAR', name: 'Purpur Pillar', textures: { top: 'purpur_pillar_top.png', side: 'purpur_pillar.png' }, hardness: 1.5, flammable: false },
  { key: 'QUARTZ_BLOCK', name: 'Quartz Block', textures: { top: 'quartz_block_top.png', side: 'quartz_block_side.png', bottom: 'quartz_block_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'QUARTZ_BRICKS', name: 'Quartz Bricks', texture: 'quartz_bricks.png', hardness: 2.5, flammable: false },
  { key: 'QUARTZ_PILLAR', name: 'Quartz Pillar', textures: { top: 'quartz_pillar_top.png', side: 'quartz_pillar.png' }, hardness: 1.5, flammable: false },
  { key: 'RAW_COPPER_BLOCK', name: 'Raw Copper Block', texture: 'raw_copper_block.png', hardness: 5, flammable: false },
  { key: 'RAW_GOLD_BLOCK', name: 'Raw Gold Block', texture: 'raw_gold_block.png', hardness: 5, flammable: false },
  { key: 'RAW_IRON_BLOCK', name: 'Raw Iron Block', texture: 'raw_iron_block.png', hardness: 5, flammable: false },
  { key: 'RED_CONCRETE', name: 'Red Concrete', texture: 'red_concrete.png', hardness: 1.8, flammable: false },
  { key: 'RED_CONCRETE_POWDER', name: 'Red Concrete Powder', texture: 'red_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'RED_GLAZED_TERRACOTTA', name: 'Red Glazed Terracotta', texture: 'red_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'RED_MUSHROOM', name: 'Red Mushroom', model: 'cross', texture: 'red_mushroom.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'RED_MUSHROOM_BLOCK', name: 'Red Mushroom Block', texture: 'red_mushroom_block.png', hardness: 1.5, flammable: false },
  { key: 'RED_NETHER_BRICKS', name: 'Red Nether Bricks', texture: 'red_nether_bricks.png', hardness: 2.5, flammable: false },
  { key: 'RED_SANDSTONE', name: 'Red Sandstone', textures: { top: 'red_sandstone_top.png', side: 'red_sandstone.png', bottom: 'red_sandstone_bottom.png' }, hardness: 0.5, flammable: false },
  { key: 'RED_SHULKER_BOX', name: 'Red Shulker Box', texture: 'red_shulker_box.png', hardness: 2, flammable: false },
  { key: 'RED_STAINED_GLASS', name: 'Red Stained Glass', texture: 'red_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'RED_TERRACOTTA', name: 'Red Terracotta', texture: 'red_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'RED_TULIP', name: 'Red Tulip', model: 'cross', texture: 'red_tulip.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'RED_WOOL', name: 'Red Wool', texture: 'red_wool.png', hardness: 0.8, flammable: true },
  { key: 'REDSTONE_BLOCK', name: 'Redstone Block', texture: 'redstone_block.png', hardness: 5, flammable: false },
  { key: 'REDSTONE_LAMP', name: 'Redstone Lamp', texture: 'redstone_lamp.png', hardness: 1.5, flammable: false, light: 15 },
  { key: 'REDSTONE_ORE', name: 'Redstone Ore', texture: 'redstone_ore.png', hardness: 3, flammable: false },
  { key: 'REDSTONE_TORCH', name: 'Redstone Torch', model: 'cross', texture: 'redstone_torch.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'REINFORCED_DEEPSLATE', name: 'Reinforced Deepslate', textures: { top: 'reinforced_deepslate_top.png', side: 'reinforced_deepslate_side.png', bottom: 'reinforced_deepslate_bottom.png' }, hardness: 3, flammable: false },
  { key: 'RESIN_BLOCK', name: 'Resin Block', texture: 'resin_block.png', hardness: 1.5, flammable: false },
  { key: 'RESIN_BRICKS', name: 'Resin Bricks', texture: 'resin_bricks.png', hardness: 2.5, flammable: false },
  { key: 'RESIN_CLUMP', name: 'Resin Clump', model: 'cross', texture: 'resin_clump.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'RESPAWN_ANCHOR', name: 'Respawn Anchor', textures: { top: 'respawn_anchor_top.png', side: 'respawn_anchor_top.png', bottom: 'respawn_anchor_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'ROOTED_DIRT', name: 'Rooted Dirt', texture: 'rooted_dirt.png', hardness: 0.5, flammable: false },
  { key: 'SANDSTONE', name: 'Sandstone', textures: { top: 'sandstone_top.png', side: 'sandstone.png', bottom: 'sandstone_bottom.png' }, hardness: 0.5, flammable: false },
  { key: 'SCAFFOLDING', name: 'Scaffolding', textures: { top: 'scaffolding_top.png', side: 'scaffolding_side.png', bottom: 'scaffolding_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'SCULK', name: 'Sculk', texture: 'sculk.png', hardness: 1.5, flammable: false, light: 1 },
  { key: 'SCULK_CATALYST', name: 'Sculk Catalyst', textures: { top: 'sculk_catalyst_top.png', side: 'sculk_catalyst_side.png', bottom: 'sculk_catalyst_bottom.png' }, hardness: 1.5, flammable: false, light: 1 },
  { key: 'SCULK_VEIN', name: 'Sculk Vein', texture: 'sculk_vein.png', hardness: 1.5, flammable: false },
  { key: 'SEA_LANTERN', name: 'Sea Lantern', model: 'cross', texture: 'sea_lantern.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 15 },
  { key: 'SEA_PICKLE', name: 'Sea Pickle', model: 'cross', texture: 'sea_pickle.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'SEAGRASS', name: 'Seagrass', model: 'cross', texture: 'seagrass.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'SHORT_DRY_GRASS', name: 'Short Dry Grass', model: 'cross', texture: 'short_dry_grass.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'SHORT_GRASS', name: 'Short Grass', model: 'cross', texture: 'short_grass.png', color: 0x77c05d, alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'SHROOMLIGHT', name: 'Shroomlight', texture: 'shroomlight.png', hardness: 0.3, flammable: false, light: 15 },
  { key: 'SHULKER_BOX', name: 'Shulker Box', texture: 'shulker_box.png', hardness: 2, flammable: false },
  { key: 'SLIME_BLOCK', name: 'Slime Block', texture: 'slime_block.png', hardness: 0.4, flammable: false },
  { key: 'SMALL_AMETHYST_BUD', name: 'Small Amethyst Bud', model: 'cross', texture: 'small_amethyst_bud.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'SMALL_DRIPLEAF', name: 'Small Dripleaf', textures: { top: 'small_dripleaf_top.png', side: 'small_dripleaf_side.png' }, hardness: 1.5, flammable: false },
  { key: 'SMALL_DRIPLEAF_STEM', name: 'Small Dripleaf Stem', model: 'cross', texture: 'small_dripleaf_stem_top.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'SMITHING_TABLE', name: 'Smithing Table', textures: { top: 'smithing_table_top.png', side: 'smithing_table_side.png', bottom: 'smithing_table_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'SMOKER', name: 'Smoker', textures: { top: 'smoker_top.png', side: 'smoker_side.png', bottom: 'smoker_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'SMOOTH_BASALT', name: 'Smooth Basalt', texture: 'smooth_basalt.png', hardness: 3, flammable: false },
  { key: 'SMOOTH_STONE', name: 'Smooth Stone', texture: 'smooth_stone.png', hardness: 1.5, flammable: false },
  { key: 'SOUL_LANTERN', name: 'Soul Lantern', model: 'cross', texture: 'soul_lantern.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'SOUL_SAND', name: 'Soul Sand', texture: 'soul_sand.png', hardness: 0.5, flammable: false },
  { key: 'SOUL_SOIL', name: 'Soul Soil', texture: 'soul_soil.png', hardness: 0.5, flammable: false },
  { key: 'SOUL_TORCH', name: 'Soul Torch', model: 'cross', texture: 'soul_torch.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'SPAWNER', name: 'Spawner', texture: 'spawner.png', hardness: 1.5, flammable: false },
  { key: 'SPONGE', name: 'Sponge', texture: 'sponge.png', hardness: 0.6, flammable: false },
  { key: 'SPORE_BLOSSOM', name: 'Spore Blossom', model: 'cross', texture: 'spore_blossom.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'SPORE_BLOSSOM_BASE', name: 'Spore Blossom Base', model: 'cross', texture: 'spore_blossom_base.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'SPRUCE_LEAVES', name: 'Spruce Leaves', texture: 'spruce_leaves.png', color: 0x6bc24b, alphaTest: 0.5, renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.2, flammable: false },
  { key: 'SPRUCE_LOG', name: 'Spruce Log', textures: { top: 'spruce_log_top.png', side: 'spruce_log.png' }, hardness: 2, flammable: true },
  { key: 'SPRUCE_PLANKS', name: 'Spruce Planks', texture: 'spruce_planks.png', hardness: 2, flammable: true },
  { key: 'SPRUCE_SAPLING', name: 'Spruce Sapling', model: 'cross', texture: 'spruce_sapling.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'STONE_BRICKS', name: 'Stone Bricks', texture: 'stone_bricks.png', hardness: 2.5, flammable: false },
  { key: 'STONECUTTER', name: 'Stonecutter', textures: { top: 'stonecutter_top.png', side: 'stonecutter_side.png', bottom: 'stonecutter_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'STONECUTTER_SAW', name: 'Stonecutter Saw', texture: 'stonecutter_saw.png', hardness: 1.5, flammable: false },
  { key: 'STRIPPED_ACACIA_LOG', name: 'Stripped Acacia Log', textures: { top: 'stripped_acacia_log_top.png', side: 'stripped_acacia_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_BAMBOO_BLOCK', name: 'Stripped Bamboo Block', textures: { top: 'stripped_bamboo_block_top.png', side: 'stripped_bamboo_block.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_BIRCH_LOG', name: 'Stripped Birch Log', textures: { top: 'stripped_birch_log_top.png', side: 'stripped_birch_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_CHERRY_LOG', name: 'Stripped Cherry Log', textures: { top: 'stripped_cherry_log_top.png', side: 'stripped_cherry_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_CRIMSON_STEM', name: 'Stripped Crimson Stem', textures: { top: 'stripped_crimson_stem_top.png', side: 'stripped_crimson_stem.png' }, hardness: 2, flammable: false },
  { key: 'STRIPPED_DARK_OAK_LOG', name: 'Stripped Dark Oak Log', textures: { top: 'stripped_dark_oak_log_top.png', side: 'stripped_dark_oak_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_JUNGLE_LOG', name: 'Stripped Jungle Log', textures: { top: 'stripped_jungle_log_top.png', side: 'stripped_jungle_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_MANGROVE_LOG', name: 'Stripped Mangrove Log', textures: { top: 'stripped_mangrove_log_top.png', side: 'stripped_mangrove_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_OAK_LOG', name: 'Stripped Oak Log', textures: { top: 'stripped_oak_log_top.png', side: 'stripped_oak_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_PALE_OAK_LOG', name: 'Stripped Pale Oak Log', textures: { top: 'stripped_pale_oak_log_top.png', side: 'stripped_pale_oak_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_SPRUCE_LOG', name: 'Stripped Spruce Log', textures: { top: 'stripped_spruce_log_top.png', side: 'stripped_spruce_log.png' }, hardness: 2, flammable: true },
  { key: 'STRIPPED_WARPED_STEM', name: 'Stripped Warped Stem', textures: { top: 'stripped_warped_stem_top.png', side: 'stripped_warped_stem.png' }, hardness: 2, flammable: false },
  { key: 'SUGAR_CANE', name: 'Sugar Cane', model: 'cross', texture: 'sugar_cane.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'TALL_DRY_GRASS', name: 'Tall Dry Grass', model: 'cross', texture: 'tall_dry_grass.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'TALL_SEAGRASS', name: 'Tall Seagrass', model: 'cross', texture: 'tall_seagrass_top.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'TARGET', name: 'Target', textures: { top: 'target_top.png', side: 'target_side.png' }, hardness: 1.5, flammable: false },
  { key: 'TERRACOTTA', name: 'Terracotta', texture: 'terracotta.png', hardness: 1.25, flammable: false },
  { key: 'TINTED_GLASS', name: 'Tinted Glass', texture: 'tinted_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'TNT', name: 'Tnt', textures: { top: 'tnt_top.png', side: 'tnt_side.png', bottom: 'tnt_bottom.png' }, hardness: 1.5, flammable: false },
  { key: 'TORCH', name: 'Torch', model: 'cross', texture: 'torch.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'TORCHFLOWER', name: 'Torchflower', model: 'cross', texture: 'torchflower.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'TUBE_CORAL', name: 'Tube Coral', model: 'cross', texture: 'tube_coral.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'TUBE_CORAL_BLOCK', name: 'Tube Coral Block', texture: 'tube_coral_block.png', hardness: 1.5, flammable: false },
  { key: 'TUBE_CORAL_FAN', name: 'Tube Coral Fan', model: 'cross', texture: 'tube_coral_fan.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'TUFF', name: 'Tuff', texture: 'tuff.png', hardness: 3, flammable: false },
  { key: 'TUFF_BRICKS', name: 'Tuff Bricks', texture: 'tuff_bricks.png', hardness: 2.5, flammable: false },
  { key: 'TWISTING_VINES', name: 'Twisting Vines', model: 'cross', texture: 'twisting_vines.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'TWISTING_VINES_PLANT', name: 'Twisting Vines Plant', model: 'cross', texture: 'twisting_vines_plant.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'VERDANT_FROGLIGHT', name: 'Verdant Froglight', textures: { top: 'verdant_froglight_top.png', side: 'verdant_froglight_side.png' }, hardness: 0.3, flammable: false, light: 15 },
  { key: 'VINE', name: 'Vine', model: 'cross', texture: 'vine.png', color: 0x77c05d, alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'WARPED_FUNGUS', name: 'Warped Fungus', texture: 'warped_fungus.png', hardness: 1.5, flammable: false },
  { key: 'WARPED_NYLIUM', name: 'Warped Nylium', texture: 'warped_nylium_side.png', hardness: 0.5, flammable: false },
  { key: 'WARPED_PLANKS', name: 'Warped Planks', texture: 'warped_planks.png', hardness: 2, flammable: true },
  { key: 'WARPED_ROOTS', name: 'Warped Roots', model: 'cross', texture: 'warped_roots.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'WARPED_ROOTS_POT', name: 'Warped Roots Pot', model: 'cross', texture: 'warped_roots_pot.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'WARPED_STEM', name: 'Warped Stem', textures: { top: 'warped_stem_top.png', side: 'warped_stem.png' }, hardness: 2, flammable: false },
  { key: 'WARPED_WART_BLOCK', name: 'Warped Wart Block', texture: 'warped_wart_block.png', hardness: 1.5, flammable: false },
  { key: 'WATER_STILL', name: 'Water Still', texture: 'water_still.png', hardness: 1.5, flammable: false },
  { key: 'WEATHERED_CHISELED_COPPER', name: 'Weathered Chiseled Copper', texture: 'weathered_chiseled_copper.png', hardness: 1.5, flammable: false },
  { key: 'WEATHERED_COPPER', name: 'Weathered Copper', texture: 'weathered_copper.png', hardness: 1.5, flammable: false },
  { key: 'WEATHERED_COPPER_BARS', name: 'Weathered Copper Bars', model: 'cross', texture: 'weathered_copper_bars.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'WEATHERED_COPPER_CHAIN', name: 'Weathered Copper Chain', model: 'cross', texture: 'weathered_copper_chain.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'WEATHERED_COPPER_LANTERN', name: 'Weathered Copper Lantern', model: 'cross', texture: 'weathered_copper_lantern.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false, light: 14 },
  { key: 'WEATHERED_CUT_COPPER', name: 'Weathered Cut Copper', texture: 'weathered_cut_copper.png', hardness: 1.5, flammable: false },
  { key: 'WEATHERED_LIGHTNING_ROD', name: 'Weathered Lightning Rod', model: 'cross', texture: 'weathered_lightning_rod.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'WEEPING_VINES', name: 'Weeping Vines', model: 'cross', texture: 'weeping_vines.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'WEEPING_VINES_PLANT', name: 'Weeping Vines Plant', model: 'cross', texture: 'weeping_vines_plant.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: true },
  { key: 'WET_SPONGE', name: 'Wet Sponge', texture: 'wet_sponge.png', hardness: 0.6, flammable: false },
  { key: 'WHITE_CONCRETE', name: 'White Concrete', texture: 'white_concrete.png', hardness: 1.8, flammable: false },
  { key: 'WHITE_CONCRETE_POWDER', name: 'White Concrete Powder', texture: 'white_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'WHITE_GLAZED_TERRACOTTA', name: 'White Glazed Terracotta', texture: 'white_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'WHITE_SHULKER_BOX', name: 'White Shulker Box', texture: 'white_shulker_box.png', hardness: 2, flammable: false },
  { key: 'WHITE_STAINED_GLASS', name: 'White Stained Glass', texture: 'white_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'WHITE_TERRACOTTA', name: 'White Terracotta', texture: 'white_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'WHITE_TULIP', name: 'White Tulip', model: 'cross', texture: 'white_tulip.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'WHITE_WOOL', name: 'White Wool', texture: 'white_wool.png', hardness: 0.8, flammable: true },
  { key: 'WILDFLOWERS', name: 'Wildflowers', model: 'cross', texture: 'wildflowers.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'WILDFLOWERS_STEM', name: 'Wildflowers Stem', model: 'cross', texture: 'wildflowers_stem.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'WITHER_ROSE', name: 'Wither Rose', model: 'cross', texture: 'wither_rose.png', alphaTest: 0.5, side: 'double', hardness: 0, flammable: false },
  { key: 'YELLOW_CONCRETE', name: 'Yellow Concrete', texture: 'yellow_concrete.png', hardness: 1.8, flammable: false },
  { key: 'YELLOW_CONCRETE_POWDER', name: 'Yellow Concrete Powder', texture: 'yellow_concrete_powder.png', hardness: 0.5, flammable: false },
  { key: 'YELLOW_GLAZED_TERRACOTTA', name: 'Yellow Glazed Terracotta', texture: 'yellow_glazed_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'YELLOW_SHULKER_BOX', name: 'Yellow Shulker Box', texture: 'yellow_shulker_box.png', hardness: 2, flammable: false },
  { key: 'YELLOW_STAINED_GLASS', name: 'Yellow Stained Glass', texture: 'yellow_stained_glass.png', transparent: true, opacity: 0.85, side: 'double', renderTransparent: true, lightTransparent: true, lightFiltering: true, hardness: 0.3, flammable: false },
  { key: 'YELLOW_TERRACOTTA', name: 'Yellow Terracotta', texture: 'yellow_terracotta.png', hardness: 1.25, flammable: false },
  { key: 'YELLOW_WOOL', name: 'Yellow Wool', texture: 'yellow_wool.png', hardness: 0.8, flammable: true },
];



function toCamelCase(upperSnakeKey) {
  return upperSnakeKey
    .toLowerCase()
    .split('_')
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

function toTitleCaseFallbackName(upperSnakeKey) {
  return upperSnakeKey
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const blockIdByKey = {};
BLOCKS.forEach((b, id) => { blockIdByKey[b.key] = id; });

export const BLOCK = Object.freeze(blockIdByKey);

const textureKeyByPath = new Map();
const texturesOut = {};

function registerTexture(filename) {
  if (!filename) return null;
  const path = filename.includes('/') ? filename : TEX_DIR + filename;
  if (textureKeyByPath.has(path)) return textureKeyByPath.get(path);
  const base = filename.split('/').pop().replace(/\.[^.]+$/, '');
  let key = toCamelCase(base.replace(/-/g, '_'));
  let uniqueKey = key;
  let n = 2;
  const usedKeys = new Set(Object.keys(texturesOut));
  while (usedKeys.has(uniqueKey)) { uniqueKey = `${key}${n++}`; }
  textureKeyByPath.set(path, uniqueKey);
  texturesOut[uniqueKey] = path;
  return uniqueKey;
}

const colorsOut = {};
let colorCounter = 0;
function registerColor(hex, hintKey) {
  if (hex === undefined || hex === null) return null;
  const key = hintKey ? `${hintKey}Tint` : `tint${colorCounter++}`;
  colorsOut[key] = hex;
  return key;
}

const materialDefsOut = {};
const materialSetsOut = {};

function faceOrder(spec, colorSpec) {
  const bottom = spec.bottom ?? spec.top;
  return {
    faces: [spec.side, spec.side, spec.top, bottom, spec.side, spec.side],
    faceColors: colorSpec
      ? [colorSpec.side, colorSpec.side, colorSpec.top, colorSpec.bottom, colorSpec.side, colorSpec.side]
      : [null, null, null, null, null, null],
  };
}

const blockDefs = [];

for (const raw of BLOCKS) {
  const def = { ...BLOCK_DEFAULTS, ...MODEL_DEFAULTS[raw.model || 'cube'], ...raw };
  const id = blockIdByKey[def.key];
  const materialSetKey = def.model === 'empty' ? null : toCamelCase(def.key);
  const isFaceArray = !!def.textures;

  if (def.model !== 'empty') {
    const commonMatOpts = {
      transparent: def.transparent,
      opacity: def.opacity,
      alphaTest: def.alphaTest,
      side: def.side,
      depthWrite: def.depthWrite,
    };

    if (isFaceArray) {
      const { faces, faceColors } = faceOrder(def.textures, def.colors);
      const faceMatKeys = faces.map((filename, i) => {
        if (!filename) return null;
        const textureKey = registerTexture(filename);
        const colorKey = registerColor(faceColors[i], materialSetKey + i);
        const matKey = `${materialSetKey}_${textureKey}_${colorKey || 'plain'}`;
        if (!materialDefsOut[matKey]) {
          materialDefsOut[matKey] = { textureKey, ...(colorKey ? { colorKey } : {}), ...commonMatOpts };
        }
        return matKey;
      });
      materialSetsOut[materialSetKey] = faceMatKeys;

      if (def.overlay) {
        const overlayTextureKey = registerTexture(def.overlay.texture);
        const overlayColorKey = registerColor(def.overlay.color, materialSetKey + 'Overlay');
        const overlaySetKey = `${materialSetKey}Overlay`;
        const overlayMatKey = overlaySetKey;
        materialDefsOut[overlayMatKey] = {
          textureKey: overlayTextureKey,
          ...(overlayColorKey ? { colorKey: overlayColorKey } : {}),
          transparent: true,
          depthWrite: false,
        };
        materialSetsOut[overlaySetKey] = [overlayMatKey, overlayMatKey, null, null, overlayMatKey, overlayMatKey];
        def._overlaySetKey = overlaySetKey;
      }
    } else {
      const textureKey = registerTexture(def.texture);
      const colorKey = registerColor(def.color, materialSetKey);
      materialDefsOut[materialSetKey] = {
        textureKey,
        ...(colorKey ? { colorKey } : {}),
        ...commonMatOpts,
      };
    }
  }

  const drop = def.drop === null
    ? null
    : def.drop === 'SELF'
      ? { itemId: id, count: 1 }
      : { itemId: blockIdByKey[def.drop], count: 1 };

  blockDefs.push({
    id,
    key: def.key.toLowerCase(),
    name: def.name || toTitleCaseFallbackName(def.key),
    renderModel: def.model || 'cube',
    materialMode: def.model === 'empty' ? 'none' : (isFaceArray ? 'face-array' : 'single'),
    materialSetKey,
    overlaySetKey: def._overlaySetKey || undefined,
    passable: !!def.passable,
    renderTransparent: !!def.renderTransparent,
    lightTransparent: !!def.lightTransparent,
    lightFiltering: !!def.lightFiltering,
    breakable: !!def.breakable,
    hardness: def.hardness,
    flammable: !!def.flammable,
    lightEmission: def.light || 0,
    drop,
  });
}

for (const matKey of Object.keys(materialDefsOut)) {
  const d = materialDefsOut[matKey];
  for (const k of Object.keys(d)) {
    if (d[k] === undefined) delete d[k];
  }
}

export const BLOCK_TEXTURES = Object.freeze(texturesOut);
export const COLORS = Object.freeze(colorsOut);
export const MATERIAL_DEFINITIONS = Object.freeze(materialDefsOut);
export const MATERIAL_SET_DEFINITIONS = Object.freeze(
  Object.fromEntries(Object.entries(materialSetsOut).map(([k, v]) => [k, Object.freeze(v)])),
);
export const BLOCK_DEFINITIONS = Object.freeze(blockDefs);

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