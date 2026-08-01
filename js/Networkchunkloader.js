//  networkChunkLoader.js — converts a chunk message from bridgeServer.js

import { CHUNK_SIZE, MIN_Y, MAX_Y, HEIGHT } from './chunkGen.js';
import { BLOCK } from '../data/blocks.js';
import { resolveBlockId, unpackLongArray } from './mcaLoader.js';

function base64ToLongs(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  const longs = [];
  for (let i = 0; i < bytes.length; i += 8) {
    longs.push(dv.getBigUint64(i, false));
  }
  return longs;
}

const warnedNames = new Set();

export function resolveNetworkBlockId(name, blockMap = null, unknownBlockDefault = null) {
  return name === 'air' ? BLOCK.AIR : resolveBlockId(name, blockMap, unknownBlockDefault, warnedNames);
}

export function convertNetworkChunk(cx, cz, sections, blockMap = null, unknownBlockDefault = null) {
  const size = CHUNK_SIZE * CHUNK_SIZE * HEIGHT;
  const data = new Uint16Array(size);

  for (const section of sections) {
    const sectionY = section.sectionY;
    const paletteIds = section.palette.map((name) => resolveNetworkBlockId(name, blockMap, unknownBlockDefault));

    let indices = null;
    if (section.dataB64) {
      const longs = base64ToLongs(section.dataB64);
      indices = unpackLongArray(longs, section.bitsPerEntry, 4096);
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

  return { chunkX: cx, chunkZ: cz, data, heightMap, biomeMap };
}