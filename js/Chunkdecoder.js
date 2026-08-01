//  chunkDecoder.js decodes a minecraft chunk network payload
//  Uses `prismarine-chunk` + `prismarine-block` + `minecraft-data`
//  to install package command: npm install prismarine-chunk prismarine-block prismarine-registry minecraft-data

'use strict';

function createChunkDecoder(minecraftVersion) {
  const registry = require('prismarine-registry')(minecraftVersion);
  const mcData = require('minecraft-data')(minecraftVersion);
  const ChunkColumn = require('prismarine-chunk')(registry);
  const Block = require('prismarine-block')(registry);

  const MIN_Y = -64;
  const WORLD_HEIGHT = 384;

  function packLongArray(indices, bitsPerEntry) {
    const valuesPerLong = Math.floor(64 / bitsPerEntry);
    const longCount = Math.ceil(indices.length / valuesPerLong);
    const longs = new Array(longCount).fill(0n);
    for (let i = 0; i < indices.length; i++) {
      const longIndex = Math.floor(i / valuesPerLong);
      const bitOffset = BigInt((i % valuesPerLong) * bitsPerEntry);
      longs[longIndex] |= BigInt(indices[i]) << bitOffset;
    }
    return longs;
  }

  function longsToBase64(longs) {
    const buf = Buffer.alloc(longs.length * 8);
    for (let i = 0; i < longs.length; i++) {
      buf.writeBigUInt64BE(BigInt.asUintN(64, longs[i]), i * 8);
    }
    return buf.toString('base64');
  }

  function extractSection(section) {
    const localPalette = [];
    const paletteIndexOf = new Map();
    const indices = new Uint16Array(4096);
    let anyNonAir = false;

    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const idx = (y << 8) | (z << 4) | x;
          const stateId = section.get({ x, y, z });
          if (stateId !== 0) anyNonAir = true;
          let li = paletteIndexOf.get(stateId);
          if (li === undefined) {
            li = localPalette.length;
            localPalette.push(stateId);
            paletteIndexOf.set(stateId, li);
          }
          indices[idx] = li;
        }
      }
    }

    if (!anyNonAir) return null;

    const names = localPalette.map((id) => Block.fromStateId(id, 0).name);

    if (names.length === 1) {
      return { palette: names };
    }

    const bitsPerEntry = Math.max(4, Math.ceil(Math.log2(names.length)));
    const longs = packLongArray(indices, bitsPerEntry);
    return { palette: names, bitsPerEntry, dataB64: longsToBase64(longs) };
  }

  function decode(x, z, chunkDataBuffer) {
    const column = new ChunkColumn({ minY: MIN_Y, worldHeight: WORLD_HEIGHT });
    column.load(chunkDataBuffer);

    const sections = [];
    for (let s = 0; s < column.numSections; s++) {
      const sectionY = s + (MIN_Y >> 4);
      const extracted = extractSection(column.sections[s]);
      if (extracted) sections.push({ sectionY, ...extracted });
    }
    return { cx: x, cz: z, sections };
  }

  function resolveBlockName(stateId) {
    return Block.fromStateId(stateId, 0).name;
  }

  return { decode, resolveBlockName };
}

module.exports = { createChunkDecoder };