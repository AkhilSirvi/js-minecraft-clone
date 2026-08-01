import { CHUNK_SIZE, MIN_Y, MAX_Y, HEIGHT } from './chunkGen.js';
import { BLOCK } from '../data/blocks.js';

const SOLID_DEFAULT = 'STONE';
const PLANT_DEFAULT = 'AIR';

const CONCEPT_SYNONYMS = {
  log: 'wood', wood: 'wood', stem: 'wood', hyphae: 'wood', planks: 'wood', plank: 'wood', bark: 'wood',
  grass_block: 'grass', mycelium: 'grass',
  podzol: 'dirt', farmland: 'dirt', path: 'dirt', dirt_path: 'dirt', rooted_dirt: 'dirt', coarse_dirt: 'dirt',
  sandstone: 'sand',
  red_sandstone: 'red_sand',
  packed_ice: 'ice', blue_ice: 'ice', frosted_ice: 'ice',
  snow_block: 'snow', powder_snow: 'snow',
  short_grass: 'tall_grass', fern: 'tall_grass', large_fern: 'tall_grass', grass: 'tall_grass',
  peony: 'rose_bush', lilac: 'rose_bush',
  cave_vines: 'cave_vine', cave_vines_plant: 'cave_vine', vine: 'cave_vine', vines: 'cave_vine',
  moss: 'moss_block',
  cobbled_deepslate: 'deepslate', polished_deepslate: 'deepslate',
  cobblestone: 'stone', granite: 'stone', diorite: 'stone', andesite: 'stone', tuff: 'stone', calcite: 'stone',
  bubble_column: 'water',
};

const ORE_METALS = ['coal', 'iron', 'gold', 'diamond', 'emerald', 'lapis', 'redstone', 'copper'];

const PLANT_LIKE_RE = /leaves|grass|flower|bush|fern|vine|sapling|coral|kelp|seagrass|torch|door|button|lever|rail|carpet|banner|sign|bed|pressure_plate|bloom/;

function buildBlockKeySet() {
  const set = new Set();
  for (const key of Object.keys(BLOCK)) set.add(key.toLowerCase());
  return set;
}
const BLOCK_KEYS_LOWER = buildBlockKeySet();

function tryKey(lowerKey) {
  if (!BLOCK_KEYS_LOWER.has(lowerKey)) return undefined;
  return BLOCK[lowerKey.toUpperCase()];
}

function resolveOre(tokens) {
  const metal = ORE_METALS.find(m => tokens.includes(m));
  if (!metal) return undefined;
  const isDeepslate = tokens.includes('deepslate');
  if (isDeepslate) {
    const id = tryKey(`deepslate_${metal}_ore`);
    if (id !== undefined) return id;
  }
  return tryKey(`${metal}_ore`);
}

function autoResolve(name) {
  const oreId = resolveOre(name.split('_'));
  if (oreId !== undefined) return oreId;

  const exact = tryKey(name);
  if (exact !== undefined) return exact;

  const wholeSynonym = CONCEPT_SYNONYMS[name];
  if (wholeSynonym) {
    const id = tryKey(wholeSynonym);
    if (id !== undefined) return id;
  }

  const tokens = name.split('_');
  for (const token of tokens) {
    if (CONCEPT_SYNONYMS[token]) {
      const id = tryKey(CONCEPT_SYNONYMS[token]);
      if (id !== undefined) return id;
    }
  }
  
  for (let windowSize = Math.min(3, tokens.length); windowSize >= 1; windowSize--) {
    const suffix = tokens.slice(tokens.length - windowSize).join('_');
    const id = tryKey(suffix);
    if (id !== undefined) return id;
    if (CONCEPT_SYNONYMS[suffix]) {
      const synId = tryKey(CONCEPT_SYNONYMS[suffix]);
      if (synId !== undefined) return synId;
    }
  }

  return undefined;
}

export function resolveBlockId(name, blockMap, unknownBlockDefault, warnedNames) {
  if (blockMap && blockMap[name] !== undefined) {
    const id = BLOCK[blockMap[name]];
    if (id !== undefined) return id;
  }

  const bare = name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;
  const auto = autoResolve(bare);
  if (auto !== undefined) return auto;

  if (warnedNames && !warnedNames.has(name)) {
    warnedNames.add(name);
    const isPlantLike = PLANT_LIKE_RE.test(bare);
    const fallbackKey = unknownBlockDefault ?? (isPlantLike ? PLANT_DEFAULT : SOLID_DEFAULT);
    console.warn(`mcaLoader: couldn't auto-resolve "${name}", using BLOCK.${fallbackKey}`);
  }
  const isPlantLike = PLANT_LIKE_RE.test(bare);
  const fallbackKey = unknownBlockDefault ?? (isPlantLike ? PLANT_DEFAULT : SOLID_DEFAULT);
  return BLOCK[fallbackKey] ?? BLOCK.AIR;
}

async function inflate(bytes, format) {
  const ds = new DecompressionStream(format);
  const stream = new Response(bytes).body.pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

const TAG = {
  End: 0, Byte: 1, Short: 2, Int: 3, Long: 4, Float: 5, Double: 6,
  ByteArray: 7, String: 8, List: 9, Compound: 10, IntArray: 11, LongArray: 12,
};

class NBTReader {
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.bytes = bytes;
    this.offset = 0;
    this._decoder = new TextDecoder('utf-8');
  }
  u8() { const v = this.view.getUint8(this.offset); this.offset += 1; return v; }
  i8() { const v = this.view.getInt8(this.offset); this.offset += 1; return v; }
  i16() { const v = this.view.getInt16(this.offset); this.offset += 2; return v; }
  i32() { const v = this.view.getInt32(this.offset); this.offset += 4; return v; }
  i64() { const v = this.view.getBigInt64(this.offset); this.offset += 8; return v; }
  f32() { const v = this.view.getFloat32(this.offset); this.offset += 4; return v; }
  f64() { const v = this.view.getFloat64(this.offset); this.offset += 8; return v; }
  str() {
    const len = this.view.getUint16(this.offset); this.offset += 2;
    const slice = this.bytes.subarray(this.offset, this.offset + len);
    this.offset += len;
    return this._decoder.decode(slice);
  }

  readPayload(tagType) {
    switch (tagType) {
      case TAG.Byte: return this.i8();
      case TAG.Short: return this.i16();
      case TAG.Int: return this.i32();
      case TAG.Long: return this.i64();
      case TAG.Float: return this.f32();
      case TAG.Double: return this.f64();
      case TAG.ByteArray: {
        const len = this.i32();
        const arr = new Int8Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.i8();
        return arr;
      }
      case TAG.String: return this.str();
      case TAG.List: {
        const elemType = this.u8();
        const len = this.i32();
        const arr = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.readPayload(elemType);
        return arr;
      }
      case TAG.Compound: {
        const obj = {};
        for (;;) {
          const t = this.u8();
          if (t === TAG.End) break;
          const name = this.str();
          obj[name] = this.readPayload(t);
        }
        return obj;
      }
      case TAG.IntArray: {
        const len = this.i32();
        const arr = new Int32Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.i32();
        return arr;
      }
      case TAG.LongArray: {
        const len = this.i32();
        const arr = new BigInt64Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.i64();
        return arr;
      }
      default:
        throw new Error(`Unsupported NBT tag type ${tagType} at offset ${this.offset}`);
    }
  }

  readNamedRoot() {
    const t = this.u8();
    if (t === TAG.End) return null;
    this.str(); 
    return this.readPayload(t);
  }
}

function parseNBT(bytes) {
  return new NBTReader(bytes).readNamedRoot();
}

const SECTOR_SIZE = 4096;

function listPresentChunks(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const header = new DataView(arrayBuffer, 0, SECTOR_SIZE);
  const slots = [];

  for (let i = 0; i < 1024; i++) {
    const entry = header.getUint32(i * 4);
    const sectorOffset = entry >>> 8;
    const sectorCount = entry & 0xff;
    if (sectorOffset === 0 || sectorCount === 0) continue;

    const byteOffset = sectorOffset * SECTOR_SIZE;
    const lenView = new DataView(arrayBuffer, byteOffset, 5);
    const length = lenView.getUint32(0);
    const compression = lenView.getUint8(4);
    const payload = buf.subarray(byteOffset + 5, byteOffset + 5 + (length - 1));

    slots.push({ rx: i % 32, rz: Math.floor(i / 32), compression, payload });
  }
  return slots;
}

async function decodeChunkSlot(slot) {
  const { rx, rz, compression, payload } = slot;

  let raw;
  if (compression === 1) raw = await inflate(payload, 'gzip');
  else if (compression === 2) raw = await inflate(payload, 'deflate');
  else if (compression === 3) raw = payload; 
  else { console.warn(`mcaLoader: unsupported compression type ${compression}, skipping chunk`); return null; }

  let root;
  try {
    root = parseNBT(raw);
  } catch (e) {
    console.warn(`mcaLoader: failed to parse NBT for region-local chunk (${rx},${rz}):`, e);
    return null;
  }
  if (!root || root.sections === undefined) {
    return null;
  }

  return { rx, rz, root };
}

async function* iterateRegionChunks(arrayBuffer) {
  const slots = listPresentChunks(arrayBuffer);
  const decoded = await Promise.all(slots.map(decodeChunkSlot));
  for (const chunk of decoded) {
    if (chunk) yield chunk;
  }
}

export function unpackLongArray(dataLongs, bitsPerEntry, count) {
  const out = new Uint16Array(count);
  const valuesPerLong = Math.floor(64 / bitsPerEntry);

  if (bitsPerEntry <= 31) {
    const numLongs = dataLongs.length;
    const hi = new Uint32Array(numLongs);
    const lo = new Uint32Array(numLongs);
    for (let i = 0; i < numLongs; i++) {
      const v = dataLongs[i];
      hi[i] = Number(v >> 32n) >>> 0;
      lo[i] = Number(v & 0xffffffffn) >>> 0;
    }

    const entryMask = (1 << bitsPerEntry) - 1;
    for (let i = 0; i < count; i++) {
      const longIndex = (i / valuesPerLong) | 0;
      const bitOffset = (i - longIndex * valuesPerLong) * bitsPerEntry;

      if (bitOffset + bitsPerEntry <= 32) {
        out[i] = (lo[longIndex] >>> bitOffset) & entryMask;
      } else if (bitOffset >= 32) {
        out[i] = (hi[longIndex] >>> (bitOffset - 32)) & entryMask;
      } else {
        const lowBitCount = 32 - bitOffset;
        const lowPart = lo[longIndex] >>> bitOffset;
        const highPart = hi[longIndex] & ((1 << (bitsPerEntry - lowBitCount)) - 1);
        out[i] = lowPart | (highPart << lowBitCount);
      }
    }
    return out;
  }

  const mask = (1n << BigInt(bitsPerEntry)) - 1n;
  for (let i = 0; i < count; i++) {
    const longIndex = Math.floor(i / valuesPerLong);
    const bitOffset = BigInt((i % valuesPerLong) * bitsPerEntry);
    out[i] = Number((dataLongs[longIndex] >> bitOffset) & mask);
  }
  return out;
}

function convertChunk(root, blockMap, unknownBlockDefault, warnedNames) {
  const chunkX = root.xPos;
  const chunkZ = root.zPos;

  const size = CHUNK_SIZE * CHUNK_SIZE * HEIGHT;
  const data = new Uint16Array(size);

  for (const section of root.sections) {
    const sectionY = section.Y;
    const states = section.block_states;
    if (!states || !states.palette) continue;

    const palette = states.palette;
    const paletteNames = palette.map(p => p.Name);
    const paletteIds = paletteNames.map(name =>
      name === 'minecraft:air' ? BLOCK.AIR : resolveBlockId(name, blockMap, unknownBlockDefault, warnedNames)
    );

    let indices;
    if (!states.data) {
      indices = null;
    } else {
      const bits = Math.max(4, Math.ceil(Math.log2(palette.length)));
      indices = unpackLongArray(states.data, bits, 4096);
    }

    for (let i = 0; i < 4096; i++) {
      const paletteIndex = indices ? indices[i] : 0;
      const blockId = paletteIds[paletteIndex];
      if (blockId === BLOCK.AIR) continue;

      const lx = i & 15;
      const lz = (i >> 4) & 15;
      const ly = (i >> 8) & 15;

      const gy = sectionY * 16 + ly;
      if (gy < MIN_Y || gy > MAX_Y) continue;

      const idx = (lx * CHUNK_SIZE + lz) * HEIGHT + (gy - MIN_Y);
      data[idx] = blockId;
    }
  }

  const heightMap = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let topY = MIN_Y - 1;
      for (let y = MIN_Y + HEIGHT - 1; y >= MIN_Y; y--) {
        const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
        if (data[idx] !== BLOCK.AIR) { topY = y; break; }
      }
      heightMap[x * CHUNK_SIZE + z] = topY;
    }
  }

  const biomeMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

  return { chunkX, chunkZ, data, heightMap, biomeMap };
}

export async function loadMCABuffer(arrayBuffer, options = {}) {
  const blockMap = options.blockMap ?? null;
  const unknownBlockDefault = options.unknownBlockDefault ?? null;

  const result = new Map();
  const warnedNames = new Set();

  for await (const { root } of iterateRegionChunks(arrayBuffer)) {
    try {
      const chunk = convertChunk(root, blockMap, unknownBlockDefault, warnedNames);
      result.set(`${chunk.chunkX},${chunk.chunkZ}`, chunk);
    } catch (e) {
      console.warn('mcaLoader: failed to convert a chunk, skipping:', e);
    }
  }

  return result;
}

const MODULE_DIR = new URL('.', import.meta.url);

function resolveMCAUrl(pathOrFilename) {
  if (/^([a-z]+:)?\/\//i.test(pathOrFilename) || pathOrFilename.startsWith('/') || pathOrFilename.includes('/')) {
    return pathOrFilename;
  }
  return new URL(pathOrFilename, MODULE_DIR);
}

export async function loadMCAFile(pathOrFilename, options = {}) {
  const url = resolveMCAUrl(pathOrFilename);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mcaLoader: failed to fetch ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  return loadMCABuffer(buf, options);
}