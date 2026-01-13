// chunkManager.js
// Manage procedural chunk generation and streaming around a center position.
// OPTIMIZED: Uses merged BufferGeometry with face culling for minimal draw calls.

import { generateChunk, CHUNK_SIZE, MIN_Y, HEIGHT } from './chunkGen.js';
import { SEED, RENDER, TREES, DEBUG } from './config.js';
import * as THREE from './three.module.js';

// Block IDs
const BLOCK_AIR = 0;
const BLOCK_STONE = 1;
const BLOCK_DIRT = 2;
const BLOCK_GRASS = 3;
const BLOCK_WATER = 4;
const BLOCK_SAND = 5;
const BLOCK_WOOD = 6;
const BLOCK_LEAVES = 7;
const BLOCK_GRASS_SNOW = 8;
const BLOCK_GRAVEL = 9;
const BLOCK_COAL_ORE = 10;
const BLOCK_IRON_ORE = 11;
const BLOCK_GOLD_ORE = 12;
const BLOCK_DIAMOND_ORE = 13;
const BLOCK_BEDROCK = 14;
const BLOCK_CLAY = 15;
const BLOCK_RED_SAND = 16;
const BLOCK_SNOW = 17;
const BLOCK_ICE = 18;
const BLOCK_CACTUS = 19;
const BLOCK_DEAD_BUSH = 20;
const BLOCK_TALL_GRASS = 21;
const BLOCK_ROSE_BUSH = 22;
const BLOCK_SUNFLOWER = 23;

// Cross-model blocks (rendered as X-shaped billboards)
const CROSS_BLOCKS = new Set([BLOCK_DEAD_BUSH, BLOCK_TALL_GRASS, BLOCK_ROSE_BUSH, BLOCK_SUNFLOWER]);

// Passable blocks - no collision (vegetation, water, etc.)
const PASSABLE_BLOCKS = new Set([
  BLOCK_AIR, BLOCK_WATER, BLOCK_DEAD_BUSH, BLOCK_TALL_GRASS, 
  BLOCK_ROSE_BUSH, BLOCK_SUNFLOWER, BLOCK_SNOW
]);

// Check if a block is passable (no collision)
export function isBlockPassable(blockId) {
  return PASSABLE_BLOCKS.has(blockId);
}

// Face directions: +X, -X, +Y, -Y, +Z, -Z
// Corners ordered so (v1-v0) × (v2-v0) = face normal direction
// Triangle indices (0,1,2) and (0,2,3) form the quad
// UVs are per-face to ensure textures are oriented correctly
const FACE_DIRS = [
  { dir: [1, 0, 0], corners: [[1,0,0], [1,1,0], [1,1,1], [1,0,1]], uvs: [[0,0], [0,1], [1,1], [1,0]] },   // +X
  { dir: [-1, 0, 0], corners: [[0,0,0], [0,0,1], [0,1,1], [0,1,0]], uvs: [[1,0], [0,0], [0,1], [1,1]] },  // -X
  { dir: [0, 1, 0], corners: [[0,1,0], [0,1,1], [1,1,1], [1,1,0]], uvs: [[0,0], [0,1], [1,1], [1,0]] },   // +Y (top)
  { dir: [0, -1, 0], corners: [[0,0,0], [1,0,0], [1,0,1], [0,0,1]], uvs: [[0,0], [1,0], [1,1], [0,1]] },  // -Y (bottom)
  { dir: [0, 0, 1], corners: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]], uvs: [[0,0], [1,0], [1,1], [0,1]] },   // +Z
  { dir: [0, 0, -1], corners: [[0,0,0], [0,1,0], [1,1,0], [1,0,0]], uvs: [[1,0], [1,1], [0,1], [0,0]] }   // -Z
];

export default class ChunkManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.seed = options.seed ?? SEED;
    this.blockSize = options.blockSize ?? 1;
    this.viewDistance = options.viewDistance ?? RENDER.viewDistance;
    this.chunks = new Map(); // key -> { cx, cz, meshes, top, data }
    if (DEBUG.logChunkLoading) console.log(`ChunkManager: init (seed=${this.seed}, blockSize=${this.blockSize}, viewDistance=${this.viewDistance})`);
    this.materials = this._createMaterials();
    // async load queue to avoid blocking the main thread
    this._loadQueue = [];
    this.maxLoadsPerFrame = options.maxLoadsPerFrame ?? RENDER.maxLoadsPerFrame;
  }

  _createMaterials() {
    const loader = new THREE.TextureLoader();
    const nearest = THREE.NearestFilter;

    // Helper to load and configure texture
    const loadTex = (path) => {
      const tex = loader.load(path);
      tex.magFilter = nearest;
      tex.minFilter = THREE.NearestMipMapNearestFilter;
      return tex;
    };

    // Texture path map (reuse dirt for missing plant assets)
    const texturePaths = {
      dirt: 'assets/textures/block/dirt.png',
      sand: 'assets/textures/block/sand.png',
      grassSide: 'assets/textures/block/grass_block_side.png',
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
      oakLeaves: 'assets/textures/block/oak_leaves.png'
    };

    const T = {};
    for (const [k, p] of Object.entries(texturePaths)) T[k] = loadTex(p);

    // Material factory helpers
    const mat = (opts) => new THREE.MeshLambertMaterial(opts);
    const withMap = (key, opts = {}) => mat(Object.assign({ map: T[key] }, opts));

    // Create materials concisely
    const stoneMat = withMap('stone');
    const dirtMat = withMap('dirt');
    const waterMat = mat({ color: 0x1E90FF, transparent: true, opacity: 0.6 });
    const sandMat = withMap('sand');
    const gravelMat = withMap('gravel');
    const clayMat = withMap('clay');
    const redSandMat = withMap('redSand');
    const bedrockMat = withMap('bedrock');
    const snowMat = withMap('snow');
    const iceMat = mat({ map: T.ice, transparent: true, opacity: 0.9 });

    const coalOreMat = withMap('coalOre');
    const ironOreMat = withMap('ironOre');
    const goldOreMat = withMap('goldOre');
    const diamondOreMat = withMap('diamondOre');

    const woodSideMat = withMap('oakSide');
    const woodTopMat = withMap('oakTop');

    const cactusMat = withMap('cactus');

    const grassSideMat = withMap('grassSide');
    const grassTopMat = withMap('grassTop');
    const grassBottomMat = dirtMat;

    const grassSnowSideMat = withMap('grassSnowSide');
    const grassSnowTopMat = withMap('snow');

    const leavesMat = mat({ map: T.oakLeaves, transparent: true, opacity: 0.9, alphaTest: 0.5 });

    const deadBushMat = mat({ map: T.deadBush, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const tallGrassMat = mat({ map: T.tallGrass, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const roseBushMat = mat({ map: T.roseBush, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const sunflowerMat = mat({ map: T.sunflower, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });

    return {
      stone: stoneMat,
      dirt: dirtMat,
      sand: sandMat,
      water: waterMat,
      leaves: leavesMat,
      gravel: gravelMat,
      clay: clayMat,
      redSand: redSandMat,
      bedrock: bedrockMat,
      snow: snowMat,
      ice: iceMat,
      coalOre: coalOreMat,
      ironOre: ironOreMat,
      goldOre: goldOreMat,
      diamondOre: diamondOreMat,
      // Cross-model plants
      deadBush: deadBushMat,
      tallGrass: tallGrassMat,
      roseBush: roseBushMat,
      sunflower: sunflowerMat,
      // Per-face materials for grass, snowy grass, wood, and cactus
      grass: [grassSideMat, grassSideMat, grassTopMat, grassBottomMat, grassSideMat, grassSideMat],
      grassSnow: [grassSnowSideMat, grassSnowSideMat, grassSnowTopMat, grassBottomMat, grassSnowSideMat, grassSnowSideMat],
      wood: [woodSideMat, woodSideMat, woodTopMat, woodTopMat, woodSideMat, woodSideMat],
      cactus: [cactusMat, cactusMat, cactusMat, cactusMat, cactusMat, cactusMat]
    };
  }

  _key(cx, cz) { return `${cx},${cz}`; }

  // Get block at local chunk coords, or from neighbor chunk
  _getBlock(chunkData, cx, cz, lx, ly, lz) {
    // Check bounds within this chunk
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      if (ly < MIN_Y || ly > MIN_Y + HEIGHT - 1) return BLOCK_AIR;
      const idx = (lx * CHUNK_SIZE + lz) * HEIGHT + (ly - MIN_Y);
      return chunkData[idx];
    }
    // Check neighbor chunk if loaded
    const globalX = cx * CHUNK_SIZE + lx;
    const globalZ = cz * CHUNK_SIZE + lz;
    const neighborCX = Math.floor(globalX / CHUNK_SIZE);
    const neighborCZ = Math.floor(globalZ / CHUNK_SIZE);
    const localNX = ((globalX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localNZ = ((globalZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const neighbor = this.chunks.get(this._key(neighborCX, neighborCZ));
    if (!neighbor) return BLOCK_AIR; // Assume air if neighbor not loaded
    if (ly < MIN_Y || ly > MIN_Y + HEIGHT - 1) return BLOCK_AIR;
    const idx = (localNX * CHUNK_SIZE + localNZ) * HEIGHT + (ly - MIN_Y);
    return neighbor.data[idx];
  }

  // Check if a block type is transparent (air, water, leaves, ice, or cross-model plants)
  _isTransparent(blockId) {
    return blockId === BLOCK_AIR || blockId === BLOCK_WATER || blockId === BLOCK_LEAVES || 
           blockId === BLOCK_ICE || CROSS_BLOCKS.has(blockId);
  }

  _loadChunk(cx, cz) {
    const chunk = generateChunk(cx, cz, this.seed);
    const bs = this.blockSize;

    // Add trees to chunk data
    this._addTrees(chunk, cx, cz);

    // Compute top array for collision (ignoring passable blocks like vegetation)
    const top = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let topY = MIN_Y - 1;
        for (let y = MIN_Y + HEIGHT - 1; y >= MIN_Y; y--) {
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
          const blockId = chunk.data[idx];
          // Only count solid (non-passable) blocks for collision top
          if (blockId !== BLOCK_AIR && !PASSABLE_BLOCKS.has(blockId)) { 
            topY = y; 
            break; 
          }
        }
        top[x * CHUNK_SIZE + z] = topY;
      }
    }

    // Build optimized mesh with face culling
    const meshes = this._buildChunkMesh(chunk, cx, cz, top);
    
    const group = new THREE.Group();
    for (const mesh of meshes) {
      group.add(mesh);
    }
    // Position the chunk group at its world origin so geometry can be local
    const chunkWorldX = cx * CHUNK_SIZE * bs;
    const chunkWorldZ = cz * CHUNK_SIZE * bs;
    group.position.set(chunkWorldX, 0, chunkWorldZ);

    this.scene.add(group);
    this.chunks.set(this._key(cx, cz), { cx, cz, group, top, data: chunk.data });
  }

  _addTrees(chunk, cx, cz) {
    // Deterministic RNG per chunk
    const mulberry32 = (a) => {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    };
    const seedMix = (this.seed ^ ((cx * 73856093) >>> 0) ^ ((cz * 19349663) >>> 0)) >>> 0;
    const rng = mulberry32(seedMix);

    // Find grass tops and place trees
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        // Find top block in column
        let topY = MIN_Y - 1;
        for (let y = MIN_Y + HEIGHT - 1; y >= MIN_Y; y--) {
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
          if (chunk.data[idx] !== BLOCK_AIR) { topY = y; break; }
        }
        if (topY < MIN_Y) continue;

        const topIdx = (x * CHUNK_SIZE + z) * HEIGHT + (topY - MIN_Y);
        if (chunk.data[topIdx] !== BLOCK_GRASS) continue;
        if (rng() > TREES.probability) continue;

        // Tree trunk
        const tHeight = TREES.minHeight + Math.floor(rng() * (TREES.maxHeight - TREES.minHeight + 1));
        for (let h = 1; h <= tHeight; h++) {
          const by = topY + h;
          if (by < MIN_Y || by > MIN_Y + HEIGHT - 1) continue;
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (by - MIN_Y);
          chunk.data[idx] = BLOCK_WOOD;
        }

        // Leaves blob
        for (let lx = -1; lx <= 1; lx++) {
          for (let lz = -1; lz <= 1; lz++) {
            for (let ly = 0; ly <= 2; ly++) {
              if (ly === 2 && Math.abs(lx) === 1 && Math.abs(lz) === 1) continue;
              const px = x + lx, pz = z + lz;
              const by = topY + 1 + tHeight + ly;
              if (px < 0 || px >= CHUNK_SIZE || pz < 0 || pz >= CHUNK_SIZE) continue;
              if (by < MIN_Y || by > MIN_Y + HEIGHT - 1) continue;
              const idx = (px * CHUNK_SIZE + pz) * HEIGHT + (by - MIN_Y);
              if (chunk.data[idx] === BLOCK_AIR) chunk.data[idx] = BLOCK_LEAVES;
            }
          }
        }
      }
    }
  }

  _buildChunkMesh(chunk, cx, cz, top) {
    const bs = this.blockSize;
    // Build geometry using local chunk-space coordinates (0..CHUNK_SIZE*bs)
    // and let the caller position the returned group at the chunk world origin.

    // Collect faces per material type and face direction
    // For single-material blocks: key = 'stone', 'dirt', etc.
    // For multi-material blocks (grass, wood): key = 'grass_0', 'grass_1', etc.
    const faceLists = {};

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const topY = top[x * CHUNK_SIZE + z];
        if (topY < MIN_Y) continue;

        for (let y = MIN_Y; y <= topY; y++) {
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
          const blockId = chunk.data[idx];
          if (blockId === BLOCK_AIR) continue;
          
          // Skip cross-model blocks in normal face rendering
          if (CROSS_BLOCKS.has(blockId)) continue;

          // Check each face direction
          for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
            const dir = FACE_DIRS[faceIdx].dir;
            const nx = x + dir[0], ny = y + dir[1], nz = z + dir[2];
            const neighborId = this._getBlock(chunk.data, cx, cz, nx, ny, nz);

            // Only render face if neighbor is transparent (and we're not water looking at water)
            if (!this._isTransparent(neighborId)) continue;
            if (blockId === BLOCK_WATER && neighborId === BLOCK_WATER) continue;
            if (blockId === BLOCK_ICE && neighborId === BLOCK_ICE) continue;

            // Determine material key
            let matKey;
            switch (blockId) {
              case BLOCK_GRASS:
                matKey = `grass_${faceIdx}`;
                break;
              case BLOCK_GRASS_SNOW:
                matKey = `grassSnow_${faceIdx}`;
                break;
              case BLOCK_WOOD:
                matKey = `wood_${faceIdx}`;
                break;
              case BLOCK_CACTUS:
                matKey = `cactus_${faceIdx}`;
                break;
              case BLOCK_STONE:
                matKey = 'stone';
                break;
              case BLOCK_DIRT:
                matKey = 'dirt';
                break;
              case BLOCK_SAND:
                matKey = 'sand';
                break;
              case BLOCK_WATER:
                matKey = 'water';
                break;
              case BLOCK_LEAVES:
                matKey = 'leaves';
                break;
              case BLOCK_GRAVEL:
                matKey = 'gravel';
                break;
              case BLOCK_CLAY:
                matKey = 'clay';
                break;
              case BLOCK_RED_SAND:
                matKey = 'redSand';
                break;
              case BLOCK_BEDROCK:
                matKey = 'bedrock';
                break;
              case BLOCK_SNOW:
                matKey = 'snow';
                break;
              case BLOCK_ICE:
                matKey = 'ice';
                break;
              case BLOCK_COAL_ORE:
                matKey = 'coalOre';
                break;
              case BLOCK_IRON_ORE:
                matKey = 'ironOre';
                break;
              case BLOCK_GOLD_ORE:
                matKey = 'goldOre';
                break;
              case BLOCK_DIAMOND_ORE:
                matKey = 'diamondOre';
                break;
              default:
                matKey = 'stone';
            }

            if (!faceLists[matKey]) faceLists[matKey] = [];

            // Add face vertices
            const corners = FACE_DIRS[faceIdx].corners;
            const worldX = x * bs;
            const worldY = y * bs;
            const worldZ = z * bs;

            faceLists[matKey].push({
              x: worldX, y: worldY, z: worldZ,
              corners: corners,
              faceIdx: faceIdx
            });
          }
        }
      }
    }

    // Collect cross-model blocks (plants rendered as X-shaped billboards)
    const crossBlocks = {
      deadBush: [],
      tallGrass: [],
      roseBush: [],
      sunflower: []
    };

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const topY = top[x * CHUNK_SIZE + z];
        if (topY < MIN_Y) continue;

        for (let y = MIN_Y; y <= topY; y++) {
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
          const blockId = chunk.data[idx];
          
          if (!CROSS_BLOCKS.has(blockId)) continue;

          const worldX = x * bs;
          const worldY = y * bs;
          const worldZ = z * bs;

          let matKey;
          switch (blockId) {
            case BLOCK_DEAD_BUSH: matKey = 'deadBush'; break;
            case BLOCK_TALL_GRASS: matKey = 'tallGrass'; break;
            case BLOCK_ROSE_BUSH: matKey = 'roseBush'; break;
            case BLOCK_SUNFLOWER: matKey = 'sunflower'; break;
          }
          
          if (matKey && crossBlocks[matKey]) {
            crossBlocks[matKey].push({ x: worldX, y: worldY, z: worldZ });
          }
        }
      }
    }

    // Build meshes from face lists
    const meshes = [];
    for (const [matKey, faces] of Object.entries(faceLists)) {
      if (faces.length === 0) continue;

      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];

      let vertexOffset = 0;
      for (const face of faces) {
        const corners = face.corners;
        const faceData = FACE_DIRS[face.faceIdx];
        const dir = faceData.dir;
        const faceUVs = faceData.uvs;

        // Add 4 vertices for this face
        for (let i = 0; i < 4; i++) {
          const c = corners[i];
          positions.push(
            face.x + c[0] * this.blockSize,
            face.y + c[1] * this.blockSize,
            face.z + c[2] * this.blockSize
          );
          normals.push(dir[0], dir[1], dir[2]);
          uvs.push(faceUVs[i][0], faceUVs[i][1]);
        }

        // Add 2 triangles (6 indices)
        indices.push(
          vertexOffset, vertexOffset + 1, vertexOffset + 2,
          vertexOffset, vertexOffset + 2, vertexOffset + 3
        );
        vertexOffset += 4;
      }

      // Create geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);

      // Get material
      let material;
      if (matKey.startsWith('grass_')) {
        const faceIdx = parseInt(matKey.split('_')[1]);
        material = this.materials.grass[faceIdx];
      } else if (matKey.startsWith('grassSnow_')) {
        const faceIdx = parseInt(matKey.split('_')[1]);
        material = this.materials.grassSnow[faceIdx];
      } else if (matKey.startsWith('wood_')) {
        const faceIdx = parseInt(matKey.split('_')[1]);
        material = this.materials.wood[faceIdx];
      } else if (matKey.startsWith('cactus_')) {
        const faceIdx = parseInt(matKey.split('_')[1]);
        material = this.materials.cactus[faceIdx];
      } else {
        material = this.materials[matKey];
      }

      // Skip if material is undefined
      if (!material) {
        console.warn('Missing material for:', matKey);
        geometry.dispose();
        continue;
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = true;
      meshes.push(mesh);
    }

    // Build cross-model meshes (X-shaped billboards for plants)
    for (const [matKey, blocks] of Object.entries(crossBlocks)) {
      if (blocks.length === 0) continue;

      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];

      let vertexOffset = 0;
      for (const block of blocks) {
        const cx = block.x + bs * 0.5;
        const cy = block.y;
        const cz = block.z + bs * 0.5;
        const halfSize = bs * 0.45;

        // Two diagonal quads forming an X shape
        const quads = [
          // Diagonal 1 (NE-SW)
          [
            [cx - halfSize, cy, cz - halfSize],
            [cx + halfSize, cy, cz + halfSize],
            [cx + halfSize, cy + bs, cz + halfSize],
            [cx - halfSize, cy + bs, cz - halfSize]
          ],
          // Diagonal 2 (NW-SE)
          [
            [cx - halfSize, cy, cz + halfSize],
            [cx + halfSize, cy, cz - halfSize],
            [cx + halfSize, cy + bs, cz - halfSize],
            [cx - halfSize, cy + bs, cz + halfSize]
          ]
        ];

        for (const quad of quads) {
          // Add vertices
          positions.push(...quad[0], ...quad[1], ...quad[2], ...quad[3]);
          // Use up normal for all vertices
          normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
          // UVs
          uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
          // Indices
          indices.push(
            vertexOffset, vertexOffset + 1, vertexOffset + 2,
            vertexOffset, vertexOffset + 2, vertexOffset + 3
          );
          vertexOffset += 4;
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);

      const material = this.materials[matKey];
      if (material) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = true;
        meshes.push(mesh);
      } else {
        geometry.dispose();
      }
    }

    return meshes;
  }

  // queue a chunk to be loaded asynchronously (work spread across frames)
  queueLoad(cx, cz, priority = 0) {
    const key = this._key(cx, cz);
    if (this.chunks.has(key)) return;
    // avoid duplicate queue entries
    for (let i = 0; i < this._loadQueue.length; i++) {
      if (this._loadQueue[i].key === key) return;
    }
    this._loadQueue.push({ key, cx, cz, priority });
  }

  // process a small number of queued loads per frame to avoid jank
  processLoadQueue() {
    if (this._loadQueue.length === 0) return;
    
    // Sort by priority (lower = closer = higher priority)
    this._loadQueue.sort((a, b) => a.priority - b.priority);
    
    let count = 0;
    while (this._loadQueue.length > 0 && count < this.maxLoadsPerFrame) {
      const item = this._loadQueue.shift();
      try { this._loadChunk(item.cx, item.cz); } catch (e) { console.warn('Chunk load failed for', item.key, e); }
      count++;
    }
  }

  _unloadChunk(cx, cz) {
    const key = this._key(cx, cz);
    const rec = this.chunks.get(key);
    if (!rec) return;
    
    // Dispose geometries to free GPU memory (materials are shared, don't dispose)
    rec.group.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.dispose();
      }
    });
    
    this.scene.remove(rec.group);
    this.chunks.delete(key);
    if (DEBUG.logChunkLoading) console.log(`_unloadChunk: chunk ${cx},${cz} unloaded and removed`);
  }

  // update loaded chunks based on center world position
  update(centerWorldX, centerWorldZ) {
    const bs = this.blockSize;

    // compute center chunk coords
    const centerChunkX = Math.floor(centerWorldX / (CHUNK_SIZE * bs));
    const centerChunkZ = Math.floor(centerWorldZ / (CHUNK_SIZE * bs));

    const radius = this.viewDistance;
    const hysteresis = RENDER.chunkHysteresis ?? 1; // extra margin before unloading
    const wanted = new Set();
    
    for (let cx = centerChunkX - radius; cx <= centerChunkX + radius; cx++) {
      for (let cz = centerChunkZ - radius; cz <= centerChunkZ + radius; cz++) {
        wanted.add(this._key(cx, cz));
        if (!this.chunks.has(this._key(cx, cz))) {
          // Priority = distance squared (closer chunks load first)
          const dx = cx - centerChunkX;
          const dz = cz - centerChunkZ;
          const priority = dx * dx + dz * dz;
          this.queueLoad(cx, cz, priority);
        }
      }
    }
    
    // unload chunks only if they are outside radius + hysteresis
    for (const key of Array.from(this.chunks.keys())) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - centerChunkX) > radius + hysteresis || Math.abs(cz - centerChunkZ) > radius + hysteresis) {
        this._unloadChunk(cx, cz);
      }
    }
  }

  // Query top surface Y in world coordinates. Returns world Y of top surface (one unit above top block), or -Infinity.
  getTopAtWorld(worldX, worldZ) {
    const bs = this.blockSize;
    // compute global column indices relative to chunk grid used in _loadChunk
    // We don't use totalHalf now; instead compute chunk and local col directly
    const globalColX = Math.floor(worldX / bs);
    const globalColZ = Math.floor(worldZ / bs);
    const cx = Math.floor(globalColX / CHUNK_SIZE);
    const cz = Math.floor(globalColZ / CHUNK_SIZE);
    const localX = ((globalColX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((globalColZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    let rec = this.chunks.get(this._key(cx, cz));
    if (!rec) {
      // chunk not loaded yet — generate and load it synchronously so callers don't fall through
      this._loadChunk(cx, cz);
      rec = this.chunks.get(this._key(cx, cz));
      if (!rec) return -Infinity;
    }
    const topBlockY = rec.top[localX * CHUNK_SIZE + localZ];
    if (topBlockY < MIN_Y) return -Infinity;
    return (topBlockY + 1) * bs;
  }

  // Find the top of the highest solid block at or below the given world Y coordinate.
  // Returns the world Y of the top surface of that block, or -Infinity if none found.
  getGroundAtWorld(worldX, worldY, worldZ) {
    const bs = this.blockSize;
    const gx = Math.floor(worldX / bs);
    const gz = Math.floor(worldZ / bs);
    const startBlockY = Math.floor((worldY - MIN_Y * bs) / bs) + MIN_Y;
    const cx = Math.floor(gx / CHUNK_SIZE);
    const cz = Math.floor(gz / CHUNK_SIZE);
    const localX = ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((gz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const recKey = this._key(cx, cz);
    let rec = this.chunks.get(recKey);
    if (!rec) {
      this._loadChunk(cx, cz);
      rec = this.chunks.get(recKey);
      if (!rec) return -Infinity;
    }
    // Scan downward from startBlockY to find the first solid (non-passable) block
    for (let by = startBlockY; by >= MIN_Y; by--) {
      const idx = ((localX * CHUNK_SIZE + localZ) * HEIGHT) + (by - MIN_Y);
      const blockId = rec.data[idx];
      if (blockId !== 0 && !PASSABLE_BLOCKS.has(blockId)) {
        // Found solid block, return top surface (one block above)
        return (by + 1) * bs;
      }
    }
    return -Infinity;
  }

  // Return block id at world coords (x,y,z). Loads chunk if needed. 0 = air.
  getBlockAtWorld(worldX, worldY, worldZ) {
    const bs = this.blockSize;
    const gx = Math.floor(worldX / bs);
    const gz = Math.floor(worldZ / bs);
    const gyBlock = Math.floor((worldY - MIN_Y * bs) / bs) + MIN_Y;
    const cx = Math.floor(gx / CHUNK_SIZE);
    const cz = Math.floor(gz / CHUNK_SIZE);
    const localX = ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((gz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const recKey = this._key(cx, cz);
    let rec = this.chunks.get(recKey);
    if (!rec) {
      this._loadChunk(cx, cz);
      rec = this.chunks.get(recKey);
      if (!rec) return 0;
    }
    const y = gyBlock;
    if (y < MIN_Y || y > (MIN_Y + HEIGHT - 1)) return 0;
    const idx = ((localX * CHUNK_SIZE + localZ) * HEIGHT) + (y - MIN_Y);
    return rec.data[idx] || 0;
  }

  // Set a block at world coordinates (worldX/worldY/worldZ are world-space positions)
  setBlockAtWorld(worldX, worldY, worldZ, blockId) {
    const bs = this.blockSize;
    const gx = Math.floor(worldX / bs);
    const gz = Math.floor(worldZ / bs);
    const gyBlock = Math.floor((worldY - MIN_Y * bs) / bs) + MIN_Y;
    const cx = Math.floor(gx / CHUNK_SIZE);
    const cz = Math.floor(gz / CHUNK_SIZE);
    const localX = ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((gz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const recKey = this._key(cx, cz);
    let rec = this.chunks.get(recKey);
    if (!rec) {
      // load synchronously so change is immediate
      this._loadChunk(cx, cz);
      rec = this.chunks.get(recKey);
      if (!rec) return false;
    }

    const y = gyBlock;
    if (y < MIN_Y || y > (MIN_Y + HEIGHT - 1)) return false;
    const idx = ((localX * CHUNK_SIZE + localZ) * HEIGHT) + (y - MIN_Y);
    rec.data[idx] = blockId;

    // Recompute top for this column (ignore passable blocks)
    const colIndex = localX * CHUNK_SIZE + localZ;
    let topY = MIN_Y - 1;
    for (let ty = MIN_Y + HEIGHT - 1; ty >= MIN_Y; ty--) {
      const tIdx = (localX * CHUNK_SIZE + localZ) * HEIGHT + (ty - MIN_Y);
      const bid = rec.data[tIdx];
      if (bid !== BLOCK_AIR && !PASSABLE_BLOCKS.has(bid)) { topY = ty; break; }
    }
    rec.top[colIndex] = topY;

    // Rebuild this chunk's meshes in-place
    this._rebuildChunk(cx, cz);

    // If changed block is on chunk border, rebuild neighboring chunks too (to update faces)
    const rebuildIfNeighbour = (nx, nz) => {
      const nKey = this._key(nx, nz);
      const nRec = this.chunks.get(nKey);
      if (nRec) this._rebuildChunk(nx, nz);
    };
    if (localX === 0) rebuildIfNeighbour(cx - 1, cz);
    if (localX === CHUNK_SIZE - 1) rebuildIfNeighbour(cx + 1, cz);
    if (localZ === 0) rebuildIfNeighbour(cx, cz - 1);
    if (localZ === CHUNK_SIZE - 1) rebuildIfNeighbour(cx, cz + 1);

    return true;
  }

  // Rebuild chunk meshes for an already-loaded chunk (in-place replacement)
  _rebuildChunk(cx, cz) {
    const key = this._key(cx, cz);
    const rec = this.chunks.get(key);
    if (!rec) return;
    const bs = this.blockSize;

    // Dispose old geometries and remove from scene
    if (rec.group) {
      rec.group.traverse((child) => {
        if (child.isMesh && child.geometry) child.geometry.dispose();
      });
      this.scene.remove(rec.group);
    }

    // Build new meshes based on current data and top
    const chunkLike = { data: rec.data };
    const meshes = this._buildChunkMesh(chunkLike, cx, cz, rec.top);
    const newGroup = new THREE.Group();
    for (const mesh of meshes) newGroup.add(mesh);
    const chunkWorldX = cx * CHUNK_SIZE * bs;
    const chunkWorldZ = cz * CHUNK_SIZE * bs;
    newGroup.position.set(chunkWorldX, 0, chunkWorldZ);

    this.scene.add(newGroup);
    rec.group = newGroup;
  }
}
