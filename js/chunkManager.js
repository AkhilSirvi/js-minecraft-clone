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

    const dirtTex = loader.load('assets/textures/block/dirt.png');
    dirtTex.magFilter = nearest; dirtTex.minFilter = THREE.NearestMipMapNearestFilter;

    const sandTex = loader.load('assets/textures/block/sand.png');
    sandTex.magFilter = nearest; sandTex.minFilter = THREE.NearestMipMapNearestFilter;

    const grassSideTex = loader.load('assets/textures/block/grass_block_side.png');
    grassSideTex.magFilter = nearest; grassSideTex.minFilter = THREE.NearestMipMapNearestFilter;

    // Materials
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTex });
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x1E90FF, transparent: true, opacity: 0.6 });
    const sandMat = new THREE.MeshLambertMaterial({ map: sandTex });

    // Wood textures
    const oakSideTex = loader.load('assets/textures/block/oak_log.png');
    const oakTopTex = loader.load('assets/textures/block/oak_log_top.png');
    oakSideTex.magFilter = nearest; oakSideTex.minFilter = THREE.NearestMipMapNearestFilter;
    oakTopTex.magFilter = nearest; oakTopTex.minFilter = THREE.NearestMipMapNearestFilter;
    const woodSideMat = new THREE.MeshLambertMaterial({ map: oakSideTex });
    const woodTopMat = new THREE.MeshLambertMaterial({ map: oakTopTex });

    // Grass materials (per-face: side, side, top, bottom, side, side)
    const grassSideMat = new THREE.MeshLambertMaterial({ map: grassSideTex });
    const grassTopMat = new THREE.MeshLambertMaterial({ color: 0x44aa44 }); // Placeholder
    const grassBottomMat = new THREE.MeshLambertMaterial({ map: dirtTex });

    // Leaves material
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x22aa22, transparent: true, opacity: 0.9 });

    // Load and colorize grass top texture
    const grassTopTexPlaceholder = new THREE.Texture();
    const grassImg = new Image();
    grassImg.src = 'assets/textures/block/grass_block_top.png';
    grassImg.crossOrigin = '';
    grassImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = grassImg.width; canvas.height = grassImg.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(grassImg, 0, 0);
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gr = 77, gg = 220, gb = 57;
      for (let i = 0; i < id.data.length; i += 4) {
        const intensity = id.data[i] / 255;
        id.data[i] = Math.round(gr * intensity);
        id.data[i+1] = Math.round(gg * intensity);
        id.data[i+2] = Math.round(gb * intensity);
      }
      ctx.putImageData(id, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = nearest; tex.minFilter = THREE.NearestMipMapNearestFilter;
      grassTopMat.map = tex;
      grassTopMat.color.setHex(0xffffff);
      grassTopMat.needsUpdate = true;
    };

    // Colorize leaves texture
    const leafImg = new Image();
    leafImg.src = 'assets/textures/block/oak_leaves.png';
    leafImg.crossOrigin = '';
    leafImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = leafImg.width; canvas.height = leafImg.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(leafImg, 0, 0);
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gr = 30, gg = 220, gb = 30;
      for (let i = 0; i < id.data.length; i += 4) {
        const intensity = id.data[i] / 255;
        id.data[i] = Math.round(gr * intensity);
        id.data[i+1] = Math.round(gg * intensity);
        id.data[i+2] = Math.round(gb * intensity);
      }
      ctx.putImageData(id, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = nearest; tex.minFilter = THREE.NearestMipMapNearestFilter;
      leavesMat.map = tex;
      leavesMat.color.setHex(0xffffff);
      leavesMat.needsUpdate = true;
    };

    return {
      stone: stoneMat,
      dirt: dirtMat,
      sand: sandMat,
      water: waterMat,
      leaves: leavesMat,
      // Per-face materials for grass and wood
      grass: [grassSideMat, grassSideMat, grassTopMat, grassBottomMat, grassSideMat, grassSideMat],
      wood: [woodSideMat, woodSideMat, woodTopMat, woodTopMat, woodSideMat, woodSideMat]
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

  // Check if a block type is transparent (air, water, or leaves)
  _isTransparent(blockId) {
    return blockId === BLOCK_AIR || blockId === BLOCK_WATER || blockId === BLOCK_LEAVES;
  }

  _loadChunk(cx, cz) {
    const chunk = generateChunk(cx, cz, this.seed);
    const bs = this.blockSize;

    // Add trees to chunk data
    this._addTrees(chunk, cx, cz);

    // Compute top array for collision
    const top = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let topY = MIN_Y - 1;
        for (let y = MIN_Y + HEIGHT - 1; y >= MIN_Y; y--) {
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
          if (chunk.data[idx] !== BLOCK_AIR) { topY = y; break; }
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
    const chunkWorldX = cx * CHUNK_SIZE * bs;
    const chunkWorldZ = cz * CHUNK_SIZE * bs;

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

          // Check each face direction
          for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
            const dir = FACE_DIRS[faceIdx].dir;
            const nx = x + dir[0], ny = y + dir[1], nz = z + dir[2];
            const neighborId = this._getBlock(chunk.data, cx, cz, nx, ny, nz);

            // Only render face if neighbor is transparent (and we're not water looking at water)
            if (!this._isTransparent(neighborId)) continue;
            if (blockId === BLOCK_WATER && neighborId === BLOCK_WATER) continue;

            // Determine material key
            let matKey;
            if (blockId === BLOCK_GRASS) {
              matKey = `grass_${faceIdx}`;
            } else if (blockId === BLOCK_WOOD) {
              matKey = `wood_${faceIdx}`;
            } else if (blockId === BLOCK_STONE) {
              matKey = 'stone';
            } else if (blockId === BLOCK_DIRT) {
              matKey = 'dirt';
            } else if (blockId === BLOCK_SAND) {
              matKey = 'sand';
            } else if (blockId === BLOCK_WATER) {
              matKey = 'water';
            } else if (blockId === BLOCK_LEAVES) {
              matKey = 'leaves';
            } else {
              matKey = 'stone';
            }

            if (!faceLists[matKey]) faceLists[matKey] = [];

            // Add face vertices
            const corners = FACE_DIRS[faceIdx].corners;
            const worldX = chunkWorldX + x * bs;
            const worldY = (y - MIN_Y + MIN_Y) * bs; // = y * bs
            const worldZ = chunkWorldZ + z * bs;

            faceLists[matKey].push({
              x: worldX, y: worldY, z: worldZ,
              corners: corners,
              faceIdx: faceIdx
            });
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
      } else if (matKey.startsWith('wood_')) {
        const faceIdx = parseInt(matKey.split('_')[1]);
        material = this.materials.wood[faceIdx];
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
    // Scan downward from startBlockY to find the first solid block
    for (let by = startBlockY; by >= MIN_Y; by--) {
      const idx = ((localX * CHUNK_SIZE + localZ) * HEIGHT) + (by - MIN_Y);
      if (rec.data[idx] !== 0) {
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
}
