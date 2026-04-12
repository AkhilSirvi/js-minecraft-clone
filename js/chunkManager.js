import { generateChunk, CHUNK_SIZE, MIN_Y, MAX_Y, HEIGHT } from './chunkGen.js';
import { SEED, RENDER, DEBUG } from './config.js';
import * as THREE from './three.module.js';
import { calculateChunkLighting, lightToRenderBrightness } from './lighting.js';
import {BLOCK, BLOCK_TEXTURES, COLORS, MATERIAL_DEFINITIONS, MATERIAL_SET_DEFINITIONS, CROSS_BLOCK_IDS, PASSABLE_BLOCK_IDS, getChunkFaceMaterialKeys, getCrossMaterialKey, isBlockPassable as isBlockPassableFromData, isRenderTransparentBlock,} from '../data/blocks.js';

const BLOCK_AIR = BLOCK.AIR;
const BLOCK_STONE = BLOCK.STONE;
const BLOCK_GRASS = BLOCK.GRASS;
const BLOCK_WATER = BLOCK.WATER;
const BLOCK_WOOD = BLOCK.WOOD;
const BLOCK_LEAVES = BLOCK.LEAVES;
const BLOCK_GRASS_SNOW = BLOCK.GRASS_SNOW;
const BLOCK_SNOW = BLOCK.SNOW;
const BLOCK_ICE = BLOCK.ICE;
const BLOCK_CACTUS = BLOCK.CACTUS;

const DEBUG_DISABLE_STONE_RENDER = false;

const CROSS_BLOCKS = CROSS_BLOCK_IDS;
const PASSABLE_BLOCKS = PASSABLE_BLOCK_IDS;

export function isBlockPassable(blockId) {
  return isBlockPassableFromData(blockId);
}

const FACE_DIRS = [
  { dir: [1, 0, 0], corners: [[1,0,0], [1,1,0], [1,1,1], [1,0,1]], uvs: [[0,0], [0,1], [1,1], [1,0]] },   // +X
  { dir: [-1, 0, 0], corners: [[0,0,0], [0,0,1], [0,1,1], [0,1,0]], uvs: [[1,0], [0,0], [0,1], [1,1]] },  // -X
  { dir: [0, 1, 0], corners: [[0,1,0], [0,1,1], [1,1,1], [1,1,0]], uvs: [[0,0], [0,1], [1,1], [1,0]] },   // +Y (top)
  { dir: [0, -1, 0], corners: [[0,0,0], [1,0,0], [1,0,1], [0,0,1]], uvs: [[0,0], [1,0], [1,1], [0,1]] },  // -Y (bottom)
  { dir: [0, 0, 1], corners: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]], uvs: [[0,0], [1,0], [1,1], [0,1]] },   // +Z
  { dir: [0, 0, -1], corners: [[0,0,0], [0,1,0], [1,1,0], [1,0,0]], uvs: [[1,0], [1,1], [0,1], [0,0]] }   // -Z
];

const DEFAULT_UV_RECT = Object.freeze({ u0: 0, v0: 0, u1: 1, v1: 1 });

export default class ChunkManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.seed = options.seed ?? SEED;
    this.blockSize = options.blockSize ?? 1;
    this.viewDistance = options.viewDistance ?? RENDER.viewDistance;
    this._smoothLighting = options.smoothLighting ?? (RENDER.smoothLighting ?? true);
    this._enableFrustumCulling = options.enableFrustumCulling ?? (RENDER.enableFrustumCulling ?? true);
    this.chunks = new Map(); // key -> { cx, cz, meshes, top, data, skyLight, blockLight, builtAtTime }
    this.showBorders = false;
    this._playerChunkX = null; // current player chunk X
    this._playerChunkZ = null; // current player chunk Z
    this._playerBorderHelper = null; // border helper for player chunk
    this._subGridHelpers = []; // array of sub grid helpers
    this._timeOfDay = 0.5;
    this._lightingRebuildQueue = []; // queue of chunk keys that need lighting rebuild
    this._lightingRebuildThreshold = 0.05; // rebuild when time changes by this amount 
    this._maxLightingRebuildsPerFrame = 2; // limit rebuilds per frame
    this._lastLightingRebuildTime = 0.5; // track when we last queued a full rebuild
    if (DEBUG.logChunkLoading) {
      const initMsg = `ChunkManager: init (seed=${this.seed}, blockSize=${this.blockSize}, viewDistance=${this.viewDistance})`;
      console.log(initMsg);
    }
    this._debugOverlay = options.debugOverlay ?? null;
    if (this._debugOverlay && DEBUG.logChunkLoading) this._debugOverlay.pushMessage(`ChunkManager init — view=${this.viewDistance}`, { duration: 2500 });
    const chunkStreaming = RENDER.chunkStreaming || {};
    this.materials = this._createMaterials();
    // async load queue to avoid blocking the main thread
    this._loadQueue = [];
    this._isProcessingQueue = false;
    // Finalization queue to spread expensive main-thread work across frames
    this._finalizationQueue = [];
    this._maxFinalizationsPerFrame = options.maxFinalizationsPerFrame ?? chunkStreaming.maxFinalizationsPerFrame ?? 2;
    // Neighbor rebuild queue to avoid remesh bursts when adjacent chunks stream in.
    this._neighborRebuildQueue = [];
    this._neighborRebuildSet = new Set();
    this._maxNeighborRebuildsPerFrame = options.maxNeighborRebuildsPerFrame ?? chunkStreaming.maxNeighborRebuildsPerFrame ?? 1;
    // Unload queue to spread chunk disposal across frames
    this._unloadQueue = [];
    this._maxUnloadsPerFrame = options.maxUnloadsPerFrame ?? chunkStreaming.maxUnloadsPerFrame ?? 2;
    // Idle callback timeout for load queue processing
    this._idleCallbackTimeout = options.idleCallbackTimeout ?? chunkStreaming.idleCallbackTimeoutMs ?? 16;
    this._idleMinTimeMs = options.idleMinTimeMs ?? chunkStreaming.idleMinTimeMs ?? 2;
    this._maxLoadsPerIdle = options.maxLoadsPerIdle ?? chunkStreaming.maxLoadsPerIdle ?? 1;
    this._loadQueueRetryDelayMs = options.loadQueueRetryDelayMs ?? chunkStreaming.loadQueueRetryDelayMs ?? 8;
    this._loadQueueForceProgressMs = options.loadQueueForceProgressMs ?? chunkStreaming.loadQueueForceProgressMs ?? 120;
    this._lastLoadQueueProgressAt = performance.now();
    // Per-chunk block overrides so mined/placed blocks survive unload/reload.
    // key -> Map(localBlockIndex -> blockId)
    this._chunkBlockOverrides = new Map();
    this._lastLoadQueueCleanupLogAt = 0;
    this._lastFinalizationCleanupLogAt = 0;
    this._lastPendingCancelLogAt = 0;
    this._workerRestartCancelThreshold = options.workerRestartCancelThreshold ?? 24;
    this._chunkWorker = null;
    this._pendingRequests = new Map(); // key -> { key, cx, cz, priority }
    this._initChunkWorker();
  }

  _initChunkWorker() {
    if (this._chunkWorker) return true;
    try {
      this._chunkWorker = new Worker('js/chunkWorker.js', { type: 'module' });
      this._chunkWorker.onmessage = (e) => {
        const msg = e.data;
        if (msg && msg.error) {
          console.warn('Chunk worker error:', msg.error);
          return;
        }
        const key = this._key(msg.cx, msg.cz);
        const pending = this._pendingRequests.get(key);
        this._pendingRequests.delete(key);
        if (!pending) return;

        if (this._playerChunkX !== null && this._playerChunkZ !== null) {
          const dx = msg.cx - this._playerChunkX;
          const dz = msg.cz - this._playerChunkZ;
          const distanceSquared = dx * dx + dz * dz;
          const maxDistanceSquared = this.viewDistance * this.viewDistance;

          if (distanceSquared > maxDistanceSquared) {
            return;
          }
        }

        const chunk = { data: null, heightMap: null, biomeMap: null };
        if (msg.data) chunk.data = new Uint8Array(msg.data);
        if (msg.heightMap) chunk.heightMap = new Int16Array(msg.heightMap);
        if (msg.biomeMap) chunk.biomeMap = new Uint8Array(msg.biomeMap);

        this._finalizationQueue.push({ chunk, cx: pending.cx, cz: pending.cz, meta: pending });
      };
      return true;
    } catch (e) {
      this._chunkWorker = null;
      return false;
    }
  }

  _restartChunkWorker(reason = '') {
    if (!this._chunkWorker) return false;
    try {
      this._chunkWorker.terminate();
    } catch (e) {
      // ignore errors
    }
    this._chunkWorker = null;
    this._pendingRequests.clear();
    const restarted = this._initChunkWorker();
    if (DEBUG.logChunkLoading) {
      const msg = restarted
        ? `Restarted chunk worker (${reason || 'stale request cleanup'})`
        : `Chunk worker restart failed (${reason || 'stale request cleanup'})`;
      console.log(`ChunkManager: ${msg}`);
      if (this._debugOverlay) this._debugOverlay.pushMessage(msg, { duration: 2400 });
    }
    return restarted;
  }

  _rotFromSeed(gx, gy, gz) {
    let h = (this.seed >>> 0);
    h = (h ^ ((gx * 374761393) >>> 0)) >>> 0;
    h = (h ^ ((gz * 668265263) >>> 0)) >>> 0;
    h = (h ^ ((gy * 2139062143) >>> 0)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h & 3;
  }

  _rotateUVPair(u, v, rot) {
    let ru = u, rv = v;
    for (let i = 0; i < rot; i++) {
      const nu = rv;
      const nv = 1 - ru;
      ru = nu; rv = nv;
    }
    return [ru, rv];
  }

  _createBlockAtlas() {
    const textureEntries = Object.entries(BLOCK_TEXTURES);
    const textureCount = textureEntries.length;
    const columns = Math.max(1, Math.ceil(Math.sqrt(textureCount)));
    const rows = Math.max(1, Math.ceil(textureCount / columns));
    const tileSize = 16;
    const gutter = 1;
    const cellSize = tileSize + gutter * 2;

    const canvas = document.createElement('canvas');
    canvas.width = columns * cellSize;
    canvas.height = rows * cellSize;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const atlasTexture = new THREE.CanvasTexture(canvas);
    atlasTexture.generateMipmaps = true;
    atlasTexture.colorSpace = THREE.SRGBColorSpace;
    atlasTexture.minFilter = THREE.NearestMipmapLinearFilter;
    atlasTexture.magFilter = THREE.NearestFilter;
    atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
    atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
    const rectByTextureKey = {};

    for (let i = 0; i < textureEntries.length; i++) {
      const [textureKey] = textureEntries[i];
      const col = i % columns;
      const row = Math.floor(i / columns);
      const pixelX = col * cellSize + gutter;
      const pixelY = row * cellSize + gutter;
      rectByTextureKey[textureKey] = {
        u0: pixelX / canvas.width,
        v0: 1 - ((pixelY + tileSize) / canvas.height),
        u1: (pixelX + tileSize) / canvas.width,
        v1: 1 - (pixelY / canvas.height),
      };
    }

    const imageLoader = new THREE.ImageLoader();
    for (let i = 0; i < textureEntries.length; i++) {
      const [textureKey, texturePath] = textureEntries[i];
      const col = i % columns;
      const row = Math.floor(i / columns);
      const pixelX = col * cellSize + gutter;
      const pixelY = row * cellSize + gutter;

      imageLoader.load(
        texturePath,
        (image) => {
          ctx.clearRect(pixelX - gutter, pixelY - gutter, tileSize + gutter * 2, tileSize + gutter * 2);
          ctx.drawImage(image, pixelX, pixelY, tileSize, tileSize);

          // Duplicate edge texels into a 1px gutter to avoid mipmap bleeding.
          ctx.drawImage(image, 0, 0, 1, image.height, pixelX - 1, pixelY, 1, tileSize);
          ctx.drawImage(image, image.width - 1, 0, 1, image.height, pixelX + tileSize, pixelY, 1, tileSize);
          ctx.drawImage(image, 0, 0, image.width, 1, pixelX, pixelY - 1, tileSize, 1);
          ctx.drawImage(image, 0, image.height - 1, image.width, 1, pixelX, pixelY + tileSize, tileSize, 1);

          // Fill gutter corners as well.
          ctx.drawImage(image, 0, 0, 1, 1, pixelX - 1, pixelY - 1, 1, 1);
          ctx.drawImage(image, image.width - 1, 0, 1, 1, pixelX + tileSize, pixelY - 1, 1, 1);
          ctx.drawImage(image, 0, image.height - 1, 1, 1, pixelX - 1, pixelY + tileSize, 1, 1);
          ctx.drawImage(image, image.width - 1, image.height - 1, 1, 1, pixelX + tileSize, pixelY + tileSize, 1, 1);

          atlasTexture.needsUpdate = true;
        },
        undefined,
        () => {
          console.warn('ChunkManager: Failed to load atlas tile:', texturePath, textureKey);
        },
      );
    }

    return {
      texture: atlasTexture,
      rectByTextureKey,
    };
  }

  _createMaterials() {
    const loader = new THREE.TextureLoader();

    // Helper to load and configure texture
    const loadTex = (path) => {
      const tex = loader.load(path);
      tex.generateMipmaps = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.NearestMipmapLinearFilter;
      tex.magFilter = THREE.NearestFilter;
      return tex;
    };

    const texturePaths = {
      sun: 'assets/textures/environment/sun.png',
      moonPhases: 'assets/textures/environment/moon_phases.png',
      playerskin: 'assets/entity/player/steve.png',
    };

    const T = {};
    for (const [k, p] of Object.entries(texturePaths)) T[k] = loadTex(p);

    const blockAtlas = this._createBlockAtlas();
    const atlasTexture = blockAtlas && blockAtlas.texture
      ? blockAtlas.texture
      : loadTex(BLOCK_TEXTURES.dirt);

    // Material factory helpers - all materials use vertex colors for smooth lighting.
    const mat = (opts) => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
    const sideFromConfig = (side) => {
      if (side === 'double') return THREE.DoubleSide;
      if (side === 'back') return THREE.BackSide;
      return THREE.FrontSide;
    };

    const buildVariantKey = (definition) => {
      const transparent = definition.transparent ? 't1' : 't0';
      const opacity = definition.opacity !== undefined ? `o${definition.opacity}` : 'o1';
      const alphaTest = definition.alphaTest !== undefined ? `a${definition.alphaTest}` : 'a0';
      const depthWrite = definition.depthWrite !== undefined ? (definition.depthWrite ? 'd1' : 'd0') : 'd1';
      const side = definition.side || 'front';
      return `${transparent}|${opacity}|${alphaTest}|${depthWrite}|${side}`;
    };

    const createChunkVariantMaterial = (definition) => {
      const opts = {
        map: atlasTexture,
        color: 0xffffff,
      };

      if (definition.transparent !== undefined) opts.transparent = definition.transparent;
      if (definition.opacity !== undefined) opts.opacity = definition.opacity;
      if (definition.alphaTest !== undefined) opts.alphaTest = definition.alphaTest;
      if (definition.depthWrite !== undefined) opts.depthWrite = definition.depthWrite;
      if (definition.side) opts.side = sideFromConfig(definition.side);

      return mat(opts);
    };

    const createCompatMaterial = (materialKey, definition) => {
      if (!definition) return null;

      const opts = {};
      opts.map = atlasTexture;
      if (definition.colorKey && COLORS[definition.colorKey] !== undefined) {
        opts.color = COLORS[definition.colorKey];
      }
      if (definition.transparent !== undefined) opts.transparent = definition.transparent;
      if (definition.opacity !== undefined) opts.opacity = definition.opacity;
      if (definition.alphaTest !== undefined) opts.alphaTest = definition.alphaTest;
      if (definition.depthWrite !== undefined) opts.depthWrite = definition.depthWrite;
      if (definition.side) opts.side = sideFromConfig(definition.side);

      const material = mat(opts);
      const uvRect = (definition.textureKey && blockAtlas && blockAtlas.rectByTextureKey[definition.textureKey])
        ? blockAtlas.rectByTextureKey[definition.textureKey]
        : DEFAULT_UV_RECT;
      material.userData.atlasRect = uvRect;
      material.userData.materialKey = materialKey;
      material.userData.textureKey = definition.textureKey || null;
      return material;
    };

    const blockMaterials = {};
    const chunkMaterialMeta = {};
    const chunkVariantMaterials = {};

    for (const [key, definition] of Object.entries(MATERIAL_DEFINITIONS)) {
      const material = createCompatMaterial(key, definition);
      if (material) blockMaterials[key] = material;

      const variantKey = buildVariantKey(definition);
      if (!chunkVariantMaterials[variantKey]) {
        chunkVariantMaterials[variantKey] = createChunkVariantMaterial(definition);
      }

      const tintColor = new THREE.Color(
        definition.colorKey && COLORS[definition.colorKey] !== undefined
          ? COLORS[definition.colorKey]
          : 0xffffff,
      );
      chunkMaterialMeta[key] = {
        variantKey,
        uvRect: (definition.textureKey && blockAtlas && blockAtlas.rectByTextureKey[definition.textureKey])
          ? blockAtlas.rectByTextureKey[definition.textureKey]
          : DEFAULT_UV_RECT,
        tint: [tintColor.r, tintColor.g, tintColor.b],
      };
    }

    // Expand face-array keys (e.g. grass_0) into concrete metadata entries.
    for (const [setKey, faces] of Object.entries(MATERIAL_SET_DEFINITIONS)) {
      for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
        const faceKey = faces[faceIdx];
        if (!faceKey) continue;
        const baseMeta = chunkMaterialMeta[faceKey];
        if (!baseMeta) continue;
        chunkMaterialMeta[`${setKey}_${faceIdx}`] = {
          variantKey: baseMeta.variantKey,
          uvRect: baseMeta.uvRect,
          tint: baseMeta.tint,
        };
      }
    }

    this._blockAtlas = blockAtlas;
    this._chunkMaterialMeta = chunkMaterialMeta;
    this._chunkVariantMaterials = chunkVariantMaterials;

    const materialSets = {};
    for (const [setKey, faces] of Object.entries(MATERIAL_SET_DEFINITIONS)) {
      materialSets[setKey] = faces.map((faceKey) => {
        if (!faceKey) return null;
        return blockMaterials[faceKey] || null;
      });
    }

    const playerskinMat = mat({ map: T.playerskin });
    const sunMat = mat({ map: T.sun, transparent: true, alphaTest: 0.1 });
    const moonPhasesMat = mat({
      map: T.moonPhases,
      transparent: true,
      alphaTest: 0.1,
    });

    return {
      playerskin: playerskinMat,
      sun: sunMat,
      moonPhases: moonPhasesMat,
      ...blockMaterials,
      ...materialSets,
    };
  }

  _key(cx, cz) { return `${cx},${cz}`; }

  _getChunkDistanceSqFromPlayer(cx, cz) {
    if (this._playerChunkX === null || this._playerChunkZ === null) return 0;
    const dx = cx - this._playerChunkX;
    const dz = cz - this._playerChunkZ;
    return dx * dx + dz * dz;
  }

  _isChunkNearActiveView(cx, cz, extraRadius = 0) {
    if (this._playerChunkX === null || this._playerChunkZ === null) return true;
    const radius = this.viewDistance + extraRadius;
    return this._getChunkDistanceSqFromPlayer(cx, cz) <= radius * radius;
  }

  _queueLoadIfNearActiveView(cx, cz, extraRadius = 1) {
    if (!this._isChunkNearActiveView(cx, cz, extraRadius)) return false;
    this.queueLoad(cx, cz, this._getChunkDistanceSqFromPlayer(cx, cz));
    return true;
  }

  isChunkLoadedAtWorld(worldX, worldZ) {
    const bs = this.blockSize;
    const gx = Math.floor(worldX / bs);
    const gz = Math.floor(worldZ / bs);
    const cx = Math.floor(gx / CHUNK_SIZE);
    const cz = Math.floor(gz / CHUNK_SIZE);
    return this.chunks.has(this._key(cx, cz));
  }

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

  _isTransparent(blockId) {
    return isRenderTransparentBlock(blockId);
  }

  _getLight(cx, cz, lx, ly, lz, skyLight, blockLight) {
    // Check Y bounds first
    if (ly < MIN_Y || ly > MIN_Y + HEIGHT - 1) {
      // Above world = full sky light, below = no light
      return { sky: ly > MAX_Y ? 15 : 0, block: 0 };
    }
    
    // Check if within this chunk
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      const idx = (lx * CHUNK_SIZE + lz) * HEIGHT + (ly - MIN_Y);
      return {
        sky: skyLight ? (skyLight[idx] || 0) : 15,
        block: blockLight ? (blockLight[idx] || 0) : 0
      };
    }
    
    // Need to look up from neighbor chunk
    const globalX = cx * CHUNK_SIZE + lx;
    const globalZ = cz * CHUNK_SIZE + lz;
    const neighborCX = Math.floor(globalX / CHUNK_SIZE);
    const neighborCZ = Math.floor(globalZ / CHUNK_SIZE);
    const localNX = ((globalX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localNZ = ((globalZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    const neighbor = this.chunks.get(this._key(neighborCX, neighborCZ));
    if (!neighbor || !neighbor.skyLight || !neighbor.blockLight) {
      return { sky: 15, block: 0 };
    }
    
    const idx = (localNX * CHUNK_SIZE + localNZ) * HEIGHT + (ly - MIN_Y);
    return {
      sky: neighbor.skyLight[idx] || 0,
      block: neighbor.blockLight[idx] || 0
    };
  }

  // Convert sampled sky/block light into a single level, applying current day brightness.
  _getCombinedLightAt(cx, cz, lx, ly, lz, skyLight, blockLight, dayBrightness) {
    const { sky, block } = this._getLight(cx, cz, lx, ly, lz, skyLight, blockLight);
    const effectiveSky = Math.floor(sky * dayBrightness);
    return Math.max(effectiveSky, block);
  }

  // Sample smooth corner light by averaging nearby light probes on the exposed side.
  _getVertexLight(cx, cz, lx, ly, lz, faceIdx, corner, skyLight, blockLight, dayBrightness) {
    const normal = FACE_DIRS[faceIdx].dir;
    const base = [lx + normal[0], ly + normal[1], lz + normal[2]];

    const tangentAxes = [];
    for (let axis = 0; axis < 3; axis++) {
      if (normal[axis] === 0) tangentAxes.push(axis);
    }

    const axisA = tangentAxes[0];
    const axisB = tangentAxes[1];
    const signA = corner[axisA] ? 1 : -1;
    const signB = corner[axisB] ? 1 : -1;

    const sampleA = base.slice();
    const sampleB = base.slice();
    const sampleCorner = base.slice();
    sampleA[axisA] += signA;
    sampleB[axisB] += signB;
    sampleCorner[axisA] += signA;
    sampleCorner[axisB] += signB;

    const l0 = this._getCombinedLightAt(
      cx,
      cz,
      base[0],
      base[1],
      base[2],
      skyLight,
      blockLight,
      dayBrightness,
    );
    const l1 = this._getCombinedLightAt(
      cx,
      cz,
      sampleA[0],
      sampleA[1],
      sampleA[2],
      skyLight,
      blockLight,
      dayBrightness,
    );
    const l2 = this._getCombinedLightAt(
      cx,
      cz,
      sampleB[0],
      sampleB[1],
      sampleB[2],
      skyLight,
      blockLight,
      dayBrightness,
    );
    const l3 = this._getCombinedLightAt(
      cx,
      cz,
      sampleCorner[0],
      sampleCorner[1],
      sampleCorner[2],
      skyLight,
      blockLight,
      dayBrightness,
    );

    let light = (l0 + l1 + l2 + l3) * 0.25;
    if (faceIdx === 0 || faceIdx === 1 || faceIdx === 2) {
      light = Math.min(15, light + 3);
    }
    return light;
  }

  // Get combined face light level considering time of day and neighbor chunks
  _getFaceLight(cx, cz, lx, ly, lz, faceIdx, skyLight, blockLight) {
    // Face directions: +X, -X, +Y, -Y, +Z, -Z
    const faceNormals = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1]
    ];
    
    const [dx, dy, dz] = faceNormals[faceIdx];
    const adjX = lx + dx;
    const adjY = ly + dy;
    const adjZ = lz + dz;
    
    const { sky, block } = this._getLight(cx, cz, adjX, adjY, adjZ, skyLight, blockLight);
    
    // Apply time-of-day modifier to sky light
    const dayBrightness = this._getDayBrightness(this._timeOfDay);
    const effectiveSky = Math.floor(sky * dayBrightness);
    let light = Math.max(effectiveSky, block);
    if (faceIdx === 0 || faceIdx === 1 || faceIdx === 2) {
      light = Math.min(15, light + 3);
    }
    return light;
  }

  // Get brightness multiplier based on time of day (0.25 to 1.0)
  _getDayBrightness(timeOfDay) {
    const t = timeOfDay % 1;
    const angle = (t - 0.25) * Math.PI * 2;
    const raw = (Math.sin(angle) + 1) / 2;
    return 0.25 + raw * 0.75;
  }

  _loadChunk(cx, cz) {
    // Legacy synchronous load (fallback). Prefer worker pipeline.
    const chunk = generateChunk(cx, cz, this.seed);
    this._finalizeChunkFromWorker(chunk, cx, cz);
  }

  // Finalize chunk data received/generated off-main-thread: compute top, build meshes, add to scene
  _finalizeChunkFromWorker(chunk, cx, cz, meta = null) {
    const bs = this.blockSize;

    // If chunk missing, abort
    if (!chunk || !chunk.data) return;
    // If a chunk with this key is already present, skip
    const fKey = this._key(cx, cz);
    if (this.chunks.has(fKey)) return;
    if (this._playerChunkX !== null && this._playerChunkZ !== null) {
      const dx = cx - this._playerChunkX;
      const dz = cz - this._playerChunkZ;
      const distanceSquared = dx * dx + dz * dz;
      const maxDistanceSquared = this.viewDistance * this.viewDistance;
      
      if (distanceSquared > maxDistanceSquared) {
        if (DEBUG.logChunkLoading) {
          const skipMsg = `ChunkManager: Skipping chunk ${cx},${cz} - outside view distance (${Math.sqrt(distanceSquared).toFixed(1)} > ${this.viewDistance})`;
          console.log(skipMsg);
          if (this._debugOverlay) this._debugOverlay.pushMessage(skipMsg, { duration: 2200 });
        }
        return;
      }
    }

    // Re-apply player edits (mined/placed blocks) after regeneration.
    this._applyChunkOverrides(cx, cz, chunk.data);

    // Compute top array for collision and rendering (highest non-air block)
    const top = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let topY = MIN_Y - 1;
        for (let y = MIN_Y + HEIGHT - 1; y >= MIN_Y; y--) {
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
          const blockId = chunk.data[idx];
          if (blockId !== BLOCK_AIR) { topY = y; break; }
        }
        top[x * CHUNK_SIZE + z] = topY;
      }
    }

    // Calculate per-block lighting
    const { skyLight, blockLight } = calculateChunkLighting(chunk.data, cx, cz, null);

    // Build optimized mesh with face culling and per-face lighting
    const meshes = this._buildChunkMesh(chunk, cx, cz, top, skyLight, blockLight);
    const group = new THREE.Group();
    for (const mesh of meshes) group.add(mesh);

    // Position the chunk group at its world origin so geometry can be local
    const chunkWorldX = cx * CHUNK_SIZE * bs;
    const chunkWorldZ = cz * CHUNK_SIZE * bs;
    group.position.set(chunkWorldX, 0, chunkWorldZ);

    this.scene.add(group);
    // Compute some diagnostics for logging
    if (DEBUG.logChunkLoading) {
      const now = performance.now();
      const queuedAt = meta && meta.queuedAt ? meta.queuedAt : null;
      const elapsed = queuedAt ? (now - queuedAt).toFixed(1) : null;
      // Count non-air blocks (simple byte scan)
      let nonAir = 0;
      const dataArr = chunk.data;
      for (let i = 0; i < dataArr.length; i++) if (dataArr[i] !== BLOCK_AIR) nonAir++;
      // Top stats
      let minTop = Infinity, maxTop = -Infinity, sumTop = 0, topCount = 0;
      for (let i = 0; i < top.length; i++) {
        const v = top[i];
        if (v > (MIN_Y - 1)) {
          minTop = Math.min(minTop, v);
          maxTop = Math.max(maxTop, v);
          sumTop += v;
          topCount++;
        }
      }
      const avgTop = topCount > 0 ? (sumTop / topCount) : -Infinity;
      const source = queuedAt ? (meta && meta.priority !== undefined ? 'worker' : 'queued') : 'sync';
      const loadMsg = `Loaded chunk ${cx},${cz} (${source}) ${elapsed !== null ? elapsed + 'ms' : 'sync'} nonAir=${nonAir}/${dataArr.length}`;
      console.log(`ChunkManager: ${loadMsg} topMin=${isFinite(minTop) ? minTop : 'n/a'} topMax=${isFinite(maxTop) ? maxTop : 'n/a'} topAvg=${isFinite(avgTop) ? avgTop.toFixed(1) : 'n/a'} loadedChunks=${this.chunks.size + 1}`);
      if (this._debugOverlay) this._debugOverlay.pushMessage(loadMsg, { duration: 4000 });
    }

    const key = this._key(cx, cz);
    this.chunks.set(key, { cx, cz, group, top, data: chunk.data, skyLight, blockLight, builtAtTime: this._timeOfDay });
    
    // Rebuild neighboring chunks to properly cull faces that are now hidden by this new chunk
    this._rebuildNeighborChunks(cx, cz);
    
    // Update player chunk borders if this is the player's current chunk
    if (cx === this._playerChunkX && cz === this._playerChunkZ && this.showBorders) {
      this._updatePlayerChunkBorders();
    }
  }

  // Rebuild neighboring chunks when a new chunk is loaded to properly cull border faces
  _rebuildNeighborChunks(cx, cz) {
    // Check all 4 neighboring chunks (N, S, E, W)
    const neighbors = [
      [cx + 1, cz],     // East
      [cx - 1, cz],     // West
      [cx, cz + 1],     // South
      [cx, cz - 1]      // North
    ];
    
    for (const [nx, nz] of neighbors) {
      const neighborKey = this._key(nx, nz);
      const neighbor = this.chunks.get(neighborKey);
      if (neighbor) {
        // Queue neighbor remesh; processing is throttled to avoid frame spikes.
        if (!this._neighborRebuildSet.has(neighborKey)) {
          this._neighborRebuildSet.add(neighborKey);
          this._neighborRebuildQueue.push({ key: neighborKey, cx: nx, cz: nz });
        }
      }
    }
  }

  _processNeighborRebuildQueue() {
    if (this._neighborRebuildQueue.length === 0) return 0;

    if (this._playerChunkX !== null && this._playerChunkZ !== null) {
      this._neighborRebuildQueue.sort((a, b) => {
        const aDist = (a.cx - this._playerChunkX) ** 2 + (a.cz - this._playerChunkZ) ** 2;
        const bDist = (b.cx - this._playerChunkX) ** 2 + (b.cz - this._playerChunkZ) ** 2;
        return aDist - bDist;
      });
    }

    let processedCount = 0;
    while (this._neighborRebuildQueue.length > 0 && processedCount < this._maxNeighborRebuildsPerFrame) {
      const item = this._neighborRebuildQueue.shift();
      this._neighborRebuildSet.delete(item.key);
      if (!item || !this.chunks.has(item.key)) continue;
      this._rebuildChunkMeshOnly(item.cx, item.cz);
      processedCount++;
    }

    return processedCount;
  }

  _buildChunkMesh(chunk, cx, cz, top, skyLight = null, blockLight = null) {
    const bs = this.blockSize;
    const dayBrightness = this._getDayBrightness(this._timeOfDay);
    const useSmoothLighting = this._smoothLighting !== false;
    const faceLists = {};

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const topY = top[x * CHUNK_SIZE + z];
        if (topY < MIN_Y) continue;

        for (let y = MIN_Y; y <= topY; y++) {
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
          const blockId = chunk.data[idx];
          if (blockId === BLOCK_AIR) continue;
          if (DEBUG_DISABLE_STONE_RENDER && blockId === BLOCK_STONE) continue;
          
          // Skip cross-model blocks in normal face rendering
          if (CROSS_BLOCKS.has(blockId)) continue;

          // Check each face direction
          for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
            const dir = FACE_DIRS[faceIdx].dir;
            const nx = x + dir[0], ny = y + dir[1], nz = z + dir[2];
            if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
              const globalX = cx * CHUNK_SIZE + nx;
              const globalZ = cz * CHUNK_SIZE + nz;
              const neighborCX = Math.floor(globalX / CHUNK_SIZE);
              const neighborCZ = Math.floor(globalZ / CHUNK_SIZE);
              const neighborKey = this._key(neighborCX, neighborCZ);
              if (!this.chunks.has(neighborKey)) {continue;
              }
            }

            const neighborId = this._getBlock(chunk.data, cx, cz, nx, ny, nz);

            const neighborRenderTransparent =
              this._isTransparent(neighborId)
              || (DEBUG_DISABLE_STONE_RENDER && neighborId === BLOCK_STONE);
            const blockRenderTransparent = this._isTransparent(blockId);

            // Only render face if neighbor is transparent or block is transparent
            if (!neighborRenderTransparent && !blockRenderTransparent) continue;
            if (blockId === BLOCK_WATER && neighborId === BLOCK_WATER) continue;
            if (blockId === BLOCK_ICE && neighborId === BLOCK_ICE) continue;

            // Determine material key
            const { base: matKey, overlay: overlayMatKey } = getChunkFaceMaterialKeys(
              blockId,
              faceIdx,
            );
            if (!matKey) continue;

            const baseMeta = this._chunkMaterialMeta[matKey];
            if (!baseMeta) continue;

            if (!faceLists[baseMeta.variantKey]) faceLists[baseMeta.variantKey] = [];

            // Add face vertices
            const corners = FACE_DIRS[faceIdx].corners;
            const worldX = x * bs;
            const worldY = y * bs;
            const worldZ = z * bs;

            // Compute deterministic UV rotation for top faces (+Y)
            let uvRot = 0;
            // global block coordinates (in blocks, not world units)
            const globalBlockX = cx * CHUNK_SIZE + x;
            const globalBlockY = y;
            const globalBlockZ = cz * CHUNK_SIZE + z;
            if ((faceIdx === 2 && blockId !== BLOCK_STONE)|| blockId === BLOCK_LEAVES) {
              uvRot = this._rotFromSeed(globalBlockX, globalBlockY, globalBlockZ);
            }

            let vertexLights;
            if (useSmoothLighting) {
              // Smooth lighting: sample one light value per corner so quads can interpolate.
              vertexLights = corners.map((corner) =>
                this._getVertexLight(cx, cz, x, y, z, faceIdx, corner, skyLight, blockLight, dayBrightness,),
              );
            } else {
              const faceLight = this._getFaceLight(cx, cz, x, y, z, faceIdx, skyLight, blockLight,
              );
              vertexLights = [faceLight, faceLight, faceLight, faceLight];
            }

            faceLists[baseMeta.variantKey].push({
              x: worldX, y: worldY, z: worldZ,
              corners: corners,
              faceIdx: faceIdx,
              uvRot: uvRot,
              vertexLights,
              uvRect: baseMeta.uvRect,
              tint: baseMeta.tint,
            });

            
            if (overlayMatKey) {
              const overlayMeta = this._chunkMaterialMeta[overlayMatKey];
              if (overlayMeta) {
                if (!faceLists[overlayMeta.variantKey]) faceLists[overlayMeta.variantKey] = [];
                faceLists[overlayMeta.variantKey].push({
                  x: worldX, y: worldY, z: worldZ,
                  corners: corners,
                  faceIdx: faceIdx,
                  uvRot: uvRot,
                  vertexLights,
                  uvRect: overlayMeta.uvRect,
                  tint: overlayMeta.tint,
                });
              }
            }
          }
        }
      }
    }

    // Collect cross-model blocks (plants rendered as X-shaped billboards)
    const crossBlocks = new Map();

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

          // Get light level for this plant (use the light at this position)
          const { sky, block } = this._getLight(cx, cz, x, y, z, skyLight, blockLight);
          const plantLight = Math.max(Math.floor(sky * dayBrightness), block);

          const matKey = getCrossMaterialKey(blockId);
          const crossMeta = matKey ? this._chunkMaterialMeta[matKey] : null;

          if (crossMeta) {
            if (!crossBlocks.has(crossMeta.variantKey)) crossBlocks.set(crossMeta.variantKey, []);
            crossBlocks.get(crossMeta.variantKey).push({
              x: worldX,
              y: worldY,
              z: worldZ,
              light: plantLight,
              uvRect: crossMeta.uvRect,
              tint: crossMeta.tint,
            });
          }
        }
      }
    }

    // Build meshes from face lists
    const meshes = [];
    for (const [variantKey, faces] of Object.entries(faceLists)) {
      if (faces.length === 0) continue;

      const positions = [];
      const normals = [];
      const uvs = [];
      const colors = []; // Vertex colors for smooth per-vertex lighting
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
          const rot = face.uvRot || 0;
          const [ru, rv] = this._rotateUVPair(faceUVs[i][0], faceUVs[i][1], rot);
          const uvRect = face.uvRect || DEFAULT_UV_RECT;
          const mappedU = uvRect.u0 + ru * (uvRect.u1 - uvRect.u0);
          const mappedV = uvRect.v0 + rv * (uvRect.v1 - uvRect.v0);
          uvs.push(mappedU, mappedV);
          const lightLevel =
            face.vertexLights && face.vertexLights[i] !== undefined
              ? face.vertexLights[i]
              : 15;
          const brightness = lightToRenderBrightness(lightLevel);
          const tint = face.tint || [1, 1, 1];
          colors.push(tint[0] * brightness, tint[1] * brightness, tint[2] * brightness);
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
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);

      // Get variant material
      const material = this._chunkVariantMaterials[variantKey] || null;

      // Skip if material is undefined
      if (!material) {
        console.warn('missing chunk variant material for', variantKey);
        geometry.dispose();
        continue;
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = this._enableFrustumCulling;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      meshes.push(mesh);
    }

    // Build cross-model meshes (X-shaped billboards for plants)
    for (const [variantKey, blocks] of crossBlocks.entries()) {
      if (blocks.length === 0) continue;

      const positions = [];
      const normals = [];
      const uvs = [];
      const colors = []; // Vertex colors for lighting
      const indices = [];

      let vertexOffset = 0;
      for (const block of blocks) {
        const cx = block.x + bs * 0.5;
        const cy = block.y;
        const cz = block.z + bs * 0.5;
        const halfSize = bs * 0.45;
        
        // Calculate brightness from light level
        const lightLevel = block.light !== undefined ? block.light : 15;
        const brightness = lightToRenderBrightness(lightLevel);
        const uvRect = block.uvRect || DEFAULT_UV_RECT;
        const tint = block.tint || [1, 1, 1];

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
          uvs.push(
            uvRect.u0, uvRect.v0,
            uvRect.u1, uvRect.v0,
            uvRect.u1, uvRect.v1,
            uvRect.u0, uvRect.v1,
          );
          // Vertex colors for lighting (4 vertices per quad)
          colors.push(tint[0] * brightness, tint[1] * brightness, tint[2] * brightness);
          colors.push(tint[0] * brightness, tint[1] * brightness, tint[2] * brightness);
          colors.push(tint[0] * brightness, tint[1] * brightness, tint[2] * brightness);
          colors.push(tint[0] * brightness, tint[1] * brightness, tint[2] * brightness);
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
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);

      const material = this._chunkVariantMaterials[variantKey] || null;
      if (material) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = this._enableFrustumCulling;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
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
    for (let i = 0; i < this._loadQueue.length; i++) {
      if (this._loadQueue[i].key === key) {
        if (priority < this._loadQueue[i].priority) {
          this._loadQueue[i].priority = priority;
        }
        return;
      }
    }
    this._loadQueue.push({ key, cx, cz, priority, queuedAt: performance.now() });
  }

  _applyChunkOverrides(cx, cz, data) {
    const key = this._key(cx, cz);
    const overrides = this._chunkBlockOverrides.get(key);
    if (!overrides || overrides.size === 0) return;
    for (const [idx, blockId] of overrides) {
      if (idx >= 0 && idx < data.length) data[idx] = blockId;
    }
  }

  _recordChunkOverride(cx, cz, localBlockIndex, blockId) {
    const key = this._key(cx, cz);
    let overrides = this._chunkBlockOverrides.get(key);
    if (!overrides) {
      overrides = new Map();
      this._chunkBlockOverrides.set(key, overrides);
    }
    overrides.set(localBlockIndex, blockId);
  }

  processLoadQueue() {
    if (this._loadQueue.length === 0) return;
    if (this._isProcessingQueue) return;
    this._loadQueue.sort((a, b) => a.priority - b.priority);
    this._isProcessingQueue = true;
    const scheduleNext = () => {
      if (this._loadQueue.length === 0) return;
      setTimeout(() => {
        this.processLoadQueue();
      }, this._loadQueueRetryDelayMs);
    };

    const processWhenIdle = (deadline) => {
      const now = performance.now();
      const stalledMs = now - this._lastLoadQueueProgressAt;
      const shouldForceProgress = stalledMs >= this._loadQueueForceProgressMs;

      if (!shouldForceProgress && deadline.timeRemaining() < this._idleMinTimeMs && !deadline.didTimeout) {
        this._isProcessingQueue = false;
        scheduleNext();
        return;
      }

      let submitted = 0;
      while (this._loadQueue.length > 0 && submitted < this._maxLoadsPerIdle) {
        const item = this._loadQueue.shift();
        if (!item || this.chunks.has(item.key)) continue;

        try {
          if (this._chunkWorker) {
            const key = item.key;
            if (!this._pendingRequests.has(key)) {
              this._pendingRequests.set(key, item);
              this._chunkWorker.postMessage({
                cx: item.cx,
                cz: item.cz,
                seed: this.seed,
                opts: {},
                priority: item.priority
              });
              submitted++;
            }
          } else {
            this._loadChunk(item.cx, item.cz);
            submitted++;
          }
        } catch (e) {
          console.warn('Chunk load failed for', item.key, e);
        }
      }

      if (submitted > 0) {
        this._lastLoadQueueProgressAt = performance.now();
      }

      this._isProcessingQueue = false;

      scheduleNext();
    };
    
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(processWhenIdle, { timeout: this._idleCallbackTimeout });
    } else {
      setTimeout(() => {
        processWhenIdle({ timeRemaining: () => 50, didTimeout: true });
      }, this._loadQueueRetryDelayMs);
    }
  }


  _processFinalizationQueue() {
    const baseRate = this._maxFinalizationsPerFrame;
    const extraWhenBacklogged = this._finalizationQueue.length > 8 ? 1 : 0;
    const maxToProcess = baseRate + extraWhenBacklogged;
    
    let processedCount = 0;

    if (this._playerChunkX !== null && this._playerChunkZ !== null) {
      this._finalizationQueue.sort((a, b) => {
        const aDist = (a.cx - this._playerChunkX) ** 2 + (a.cz - this._playerChunkZ) ** 2;
        const bDist = (b.cx - this._playerChunkX) ** 2 + (b.cz - this._playerChunkZ) ** 2;
        return aDist - bDist;
      });
    }
    
    while (this._finalizationQueue.length > 0 && processedCount < maxToProcess) {
      const item = this._finalizationQueue.shift();
      
      // Double-check chunk is still needed (player might have moved)
      if (this._playerChunkX !== null && this._playerChunkZ !== null) {
        const dx = item.cx - this._playerChunkX;
        const dz = item.cz - this._playerChunkZ;
        const distanceSquared = dx * dx + dz * dz;
        const maxDistanceSquared = this.viewDistance * this.viewDistance;
        
        if (distanceSquared > maxDistanceSquared) {
          continue;
        }
      }
      
      // Finalize the chunk (compute lighting, build mesh, add to scene)
      this._finalizeChunkFromWorker(item.chunk, item.cx, item.cz, item.meta);
      processedCount++;
    }

    return processedCount;
  }

  // Process unload queue - limit per frame to avoid lag spikes
  _processUnloadQueue() {
    // Increase unload rate when queue is large (player moving fast)
    const baseRate = this._maxUnloadsPerFrame;
    const urgentRate = this._unloadQueue.length > 10 ? Math.min(6, baseRate * 2) : baseRate;
    const maxToProcess = urgentRate;
    
    let unloadedCount = 0;
    
    while (this._unloadQueue.length > 0 && unloadedCount < maxToProcess) {
      const item = this._unloadQueue.shift();
      
      // Only unload if chunk still exists (might have been handled already)
      if (this.chunks.has(item.key)) {
        this._unloadChunk(item.cx, item.cz);
        unloadedCount++;
      }
    }
  }

  _unloadChunk(cx, cz) {
    const key = this._key(cx, cz);
    const rec = this.chunks.get(key);
    if (!rec) return;
    let meshCount = 0;
    rec.group.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.dispose();
        meshCount++;
      }
    });
    
    this.scene.remove(rec.group);
    this.chunks.delete(key);
    if (cx === this._playerChunkX && cz === this._playerChunkZ) {
      this._clearPlayerBorders();
    }
    if (DEBUG.logChunkLoading) {
      const unloadMsg = `Unloaded chunk ${cx},${cz} meshesRemoved=${meshCount}`;
      console.log(`ChunkManager: ${unloadMsg} loadedChunks=${this.chunks.size}`);
      if (this._debugOverlay) this._debugOverlay.pushMessage(unloadMsg, { duration: 3000 });
    }
  }

  update(centerWorldX, centerWorldZ, facingDir = null) {
    const bs = this.blockSize;
    const finalizedThisFrame = this._processFinalizationQueue();
    this._processUnloadQueue();
    if (finalizedThisFrame === 0) {
      this._processNeighborRebuildQueue();
    }

    // compute center chunk coords
    const centerChunkX = Math.floor(centerWorldX / (CHUNK_SIZE * bs));
    const centerChunkZ = Math.floor(centerWorldZ / (CHUNK_SIZE * bs));

    // Update player chunk borders if player moved to a different chunk
    if (this._playerChunkX !== centerChunkX || this._playerChunkZ !== centerChunkZ) {
      this._playerChunkX = centerChunkX;
      this._playerChunkZ = centerChunkZ;
      this._updatePlayerChunkBorders();
    }

    const radius = this.viewDistance;
    const radiusSq = radius * radius;
    const wanted = new Set();
    const hasFacing = !!facingDir && Number.isFinite(facingDir.x) && Number.isFinite(facingDir.z);
    const facingLen = hasFacing ? Math.hypot(facingDir.x, facingDir.z) : 0;
    const fx = hasFacing && facingLen > 1e-6 ? facingDir.x / facingLen : 0;
    const fz = hasFacing && facingLen > 1e-6 ? facingDir.z / facingLen : 0;
    
    for (let cx = centerChunkX - radius; cx <= centerChunkX + radius; cx++) {
      for (let cz = centerChunkZ - radius; cz <= centerChunkZ + radius; cz++) {
        const dx = cx - centerChunkX;
        const dz = cz - centerChunkZ;
        if (dx * dx + dz * dz > radiusSq) continue;

        wanted.add(this._key(cx, cz));
        if (!this.chunks.has(this._key(cx, cz))) {
          // Priority = distance squared (closer chunks load first)
          const distSq = dx * dx + dz * dz;
          let priority = distSq;

          // Directional bias: prioritize chunks in front of the player for the same distance.
          if (hasFacing && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const nz = dz / dist;
            const dot = nx * fx + nz * fz; // -1 behind, +1 in front
            const directionalPenalty = (1 - dot) * 0.75; // [0..1.5]
            priority += directionalPenalty;
          }

          this.queueLoad(cx, cz, priority);
        }
      }
    }

    // Unload chunks outside view distance
    const chunksToUnload = [];
    for (const [key, chunk] of this.chunks) {
      if (!wanted.has(key)) {
        chunksToUnload.push({ cx: chunk.cx, cz: chunk.cz });
      }
    }
    
    // Queue chunks for unloading instead of unloading all at once
    for (const { cx, cz } of chunksToUnload) {
      const key = this._key(cx, cz);
      // Avoid duplicate queue entries
      if (!this._unloadQueue.some(item => item.key === key)) {
        this._unloadQueue.push({ key, cx, cz });
      }
    }
    
    if (DEBUG.logChunkLoading && chunksToUnload.length > 0) {
      const uMsg = `Queued ${chunksToUnload.length} chunks for unloading`;
      console.log(`ChunkManager: ${uMsg}`);
      if (this._debugOverlay) this._debugOverlay.pushMessage(uMsg, { duration: 2600 });
    }

    // Clean up pending worker requests for chunks outside view distance
    if (this._chunkWorker && this._pendingRequests.size > 0) {
      const pendingToCancel = [];
      for (const [key, request] of this._pendingRequests) {
        if (!wanted.has(key)) {
          pendingToCancel.push(key);
        }
      }
      
      for (const key of pendingToCancel) {
        this._pendingRequests.delete(key);
      }

      if (pendingToCancel.length >= this._workerRestartCancelThreshold) {
        this._restartChunkWorker(`cancelled ${pendingToCancel.length} stale requests`);
      }
      
      if (DEBUG.logChunkLoading && pendingToCancel.length > 0) {
        const now = performance.now();
        const shouldLog = pendingToCancel.length > 1 || (now - this._lastPendingCancelLogAt) > 1000;
        if (shouldLog) {
          this._lastPendingCancelLogAt = now;
          const cMsg = `Cancelled ${pendingToCancel.length} pending worker requests`;
          console.log(`ChunkManager: ${cMsg} outside view distance`);
          if (this._debugOverlay) this._debugOverlay.pushMessage(cMsg, { duration: 2600 });
        }
      }
    }

    // Clean up load queue for chunks outside view distance
    const originalQueueLength = this._loadQueue.length;
    this._loadQueue = this._loadQueue.filter(item => wanted.has(item.key));
    const removedFromQueue = originalQueueLength - this._loadQueue.length;
    
    if (DEBUG.logChunkLoading && removedFromQueue > 0) {
      const now = performance.now();
      const shouldLog = removedFromQueue > 1 || (now - this._lastLoadQueueCleanupLogAt) > 1000;
      if (shouldLog) {
        this._lastLoadQueueCleanupLogAt = now;
        const rMsg = `Removed ${removedFromQueue} items from load queue`;
        console.log(`ChunkManager: ${rMsg} outside view distance`);
        if (this._debugOverlay) this._debugOverlay.pushMessage(rMsg, { duration: 2200 });
      }
    }

    // Clean up finalization queue for chunks outside view distance
    const originalFinalizationLength = this._finalizationQueue.length;
    this._finalizationQueue = this._finalizationQueue.filter(item => {
      const key = this._key(item.cx, item.cz);
      return wanted.has(key);
    });
    const removedFromFinalization = originalFinalizationLength - this._finalizationQueue.length;
    
    if (DEBUG.logChunkLoading && removedFromFinalization > 0) {
      const now = performance.now();
      const shouldLog = removedFromFinalization > 1 || (now - this._lastFinalizationCleanupLogAt) > 1000;
      if (shouldLog) {
        this._lastFinalizationCleanupLogAt = now;
        const fMsg = `Removed ${removedFromFinalization} items from finalization queue`;
        console.log(`ChunkManager: ${fMsg} outside view distance`);
        if (this._debugOverlay) this._debugOverlay.pushMessage(fMsg, { duration: 2200 });
      }
    }

    // Clean up neighbor rebuild queue for chunks outside view distance
    if (this._neighborRebuildQueue.length > 0) {
      this._neighborRebuildQueue = this._neighborRebuildQueue.filter(item => wanted.has(item.key));
      this._neighborRebuildSet.clear();
      for (const item of this._neighborRebuildQueue) this._neighborRebuildSet.add(item.key);
    }
  }

  getTopAtWorld(worldX, worldZ, allowSyncLoad = false) {
    const bs = this.blockSize;
    const globalColX = Math.floor(worldX / bs);
    const globalColZ = Math.floor(worldZ / bs);
    const cx = Math.floor(globalColX / CHUNK_SIZE);
    const cz = Math.floor(globalColZ / CHUNK_SIZE);
    const localX = ((globalColX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((globalColZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    let rec = this.chunks.get(this._key(cx, cz));
    if (!rec) {
      if (allowSyncLoad) {
        this._loadChunk(cx, cz);
        rec = this.chunks.get(this._key(cx, cz));
        if (!rec) return -Infinity;
      } else {
        this._queueLoadIfNearActiveView(cx, cz);
        return -Infinity; // Return sentinel until chunk loads
      }
    }
    const topBlockY = rec.top[localX * CHUNK_SIZE + localZ];
    if (topBlockY < MIN_Y) return -Infinity;
    return (topBlockY + 1) * bs;
  }

  getGroundAtWorld(worldX, worldY, worldZ, allowSyncLoad = false) {
    const bs = this.blockSize;
    const gx = Math.floor(worldX / bs);
    const gz = Math.floor(worldZ / bs);
    const startBlockY = Math.floor((worldY - MIN_Y * bs) / bs) + MIN_Y;
    const maxBlockY = MIN_Y + HEIGHT - 1;
    const startBlockYClamped = Math.min(startBlockY, maxBlockY);
    const cx = Math.floor(gx / CHUNK_SIZE);
    const cz = Math.floor(gz / CHUNK_SIZE);
    const localX = ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((gz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const recKey = this._key(cx, cz);
    let rec = this.chunks.get(recKey);
    if (!rec) {
      if (allowSyncLoad) {
        // Critical operation (spawn, etc.) - load synchronously
        this._loadChunk(cx, cz);
        rec = this.chunks.get(recKey);
        if (!rec) return -Infinity;
      } else {
        this._queueLoadIfNearActiveView(cx, cz);
        return -Infinity; // Return sentinel until chunk loads
      }
    }
    // Scan downward from startBlockY to find the first solid (non-passable) block
    for (let by = startBlockYClamped; by >= MIN_Y; by--) {
      const idx = ((localX * CHUNK_SIZE + localZ) * HEIGHT) + (by - MIN_Y);
      const blockId = rec.data[idx];
      if (blockId !== BLOCK_AIR && !PASSABLE_BLOCKS.has(blockId)) {
        // Found solid block, return top surface (one block above)
        return (by + 1) * bs;
      }
    }
    return -Infinity;
  }

  getBlockAtWorld(worldX, worldY, worldZ, conservativeUnloaded = false, queueIfUnloaded = true) {
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
      if (queueIfUnloaded) this._queueLoadIfNearActiveView(cx, cz);
      return conservativeUnloaded ? BLOCK_STONE : BLOCK_AIR;
    }
    const y = gyBlock;
    if (y < MIN_Y || y > (MIN_Y + HEIGHT - 1)) return BLOCK_AIR;
    const idx = ((localX * CHUNK_SIZE + localZ) * HEIGHT) + (y - MIN_Y);
    return rec.data[idx] || BLOCK_AIR;
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
      this._queueLoadIfNearActiveView(cx, cz);
      if (DEBUG.logChunkLoading) {
        console.warn(`Cannot set block at (${worldX}, ${worldY}, ${worldZ}) - chunk not loaded`);
      }
      return false; // Cannot modify unloaded chunk
    }

    const y = gyBlock;
    if (y < MIN_Y || y > (MIN_Y + HEIGHT - 1)) return false;
    const idx = ((localX * CHUNK_SIZE + localZ) * HEIGHT) + (y - MIN_Y);
    if (rec.data[idx] === blockId) return true;
    rec.data[idx] = blockId;
    this._recordChunkOverride(cx, cz, idx, blockId);

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

  
  _rebuildChunk(cx, cz) {
    const key = this._key(cx, cz);
    const rec = this.chunks.get(key);
    if (!rec) return;
    const bs = this.blockSize;

    
    if (rec.group) {
      
      while (rec.group.children.length > 0) {
        const child = rec.group.children[0];
        rec.group.remove(child);
        if (child.isMesh && child.geometry) {
          child.geometry.dispose();
        }
      }
      this.scene.remove(rec.group);
      rec.group = null;
    }

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let topY = MIN_Y - 1;
        for (let y = MIN_Y + HEIGHT - 1; y >= MIN_Y; y--) {
          const idx = (x * CHUNK_SIZE + z) * HEIGHT + (y - MIN_Y);
          const blockId = rec.data[idx];
          if (blockId !== BLOCK_AIR) {
            topY = y;
            break;
          }
        }
        rec.top[x * CHUNK_SIZE + z] = topY;
      }
    }

    const { skyLight, blockLight } = calculateChunkLighting(rec.data, cx, cz, null);
    rec.skyLight = skyLight;
    rec.blockLight = blockLight;

    const chunkLike = { data: rec.data };
    const meshes = this._buildChunkMesh(chunkLike, cx, cz, rec.top, skyLight, blockLight);
    const newGroup = new THREE.Group();
    for (const mesh of meshes) newGroup.add(mesh);
    const chunkWorldX = cx * CHUNK_SIZE * bs;
    const chunkWorldZ = cz * CHUNK_SIZE * bs;
    newGroup.position.set(chunkWorldX, 0, chunkWorldZ);

    this.scene.add(newGroup);
    rec.group = newGroup;
    rec.builtAtTime = this._timeOfDay;
    if (cx === this._playerChunkX && cz === this._playerChunkZ && this.showBorders) {
      this._updatePlayerChunkBorders();
    }
  }

  showChunkBorders(enable = true) {
    const want = !!enable;
    if (want === this.showBorders) return;
    this.showBorders = want;
    this._updatePlayerChunkBorders();
  }

  // Update player chunk borders and sub-grids
  _updatePlayerChunkBorders() {
    // Clear existing player chunk borders and sub-grids
    this._clearPlayerBorders();

    if (!this.showBorders || this._playerChunkX === null || this._playerChunkZ === null) return;
    const bs = this.blockSize;
    const cx = this._playerChunkX;
    const cz = this._playerChunkZ;
    this._createSubGrids(cx, cz, bs);
    
  }

  // Create sub-grids within the player's chunk
  _createSubGrids(cx, cz, bs) {
    const chunkWorldX = cx * CHUNK_SIZE * bs;
    const chunkWorldZ = cz * CHUNK_SIZE * bs;
    const gridSize = 16;
    const subChunkSize = CHUNK_SIZE / gridSize;

    for (let gx = 0; gx < gridSize; gx++) {
      for (let gz = 0; gz < gridSize; gz++) {
      if (gx !== 0 && gz !== 0 && gx !== gridSize - 1 && gz !== gridSize - 1) continue;

      const minX = chunkWorldX + gx * subChunkSize * bs;
      const maxX = chunkWorldX + (gx + 1) * subChunkSize * bs;
      const minZ = chunkWorldZ + gz * subChunkSize * bs;
      const maxZ = chunkWorldZ + (gz + 1) * subChunkSize * bs;

      const subBox = new THREE.Box3(
        new THREE.Vector3(minX, MIN_Y * bs, minZ),
        new THREE.Vector3(maxX, MAX_Y * bs, maxZ)
      );
      const subHelper = new THREE.Box3Helper(subBox, 0x00ff00);
      this.scene.add(subHelper);
      this._subGridHelpers.push(subHelper);
      }
    }
  }

  // Clear all player border helpers
  _clearPlayerBorders() {
    // Clear main border
    if (this._playerBorderHelper) {
      this.scene.remove(this._playerBorderHelper);
      if (this._playerBorderHelper.geometry) this._playerBorderHelper.geometry.dispose();
      if (this._playerBorderHelper.material) this._playerBorderHelper.material.dispose();
      this._playerBorderHelper = null;
    }

    // Clear sub-grids
    for (const helper of this._subGridHelpers) {
      this.scene.remove(helper);
      if (helper.geometry) helper.geometry.dispose();
      if (helper.material) helper.material.dispose();
    }
    this._subGridHelpers = [];
  }

  toggleChunkBorders() { this.showChunkBorders(!this.showBorders); }
  
  setTimeOfDay(time) {
    const newTime = time % 1;
    this._timeOfDay = newTime;
    const timeDiff = Math.min(
      Math.abs(newTime - this._lastLightingRebuildTime),
      1 - Math.abs(newTime - this._lastLightingRebuildTime)
    );
    
    if (timeDiff >= this._lightingRebuildThreshold) {
      this._queueAllChunksForLightingRebuild();
      this._lastLightingRebuildTime = newTime;
    }
    
    
    this._processLightingRebuildQueue();
  }
  

  _queueAllChunksForLightingRebuild() {
    for (const [key, rec] of this.chunks) {
      // Only queue if not already queued
      if (!this._lightingRebuildQueue.includes(key)) {
        this._lightingRebuildQueue.push(key);
      }
    }
  }
  
  _processLightingRebuildQueue() {
    let rebuiltCount = 0;
    while (this._lightingRebuildQueue.length > 0 && rebuiltCount < this._maxLightingRebuildsPerFrame) {
      const key = this._lightingRebuildQueue.shift();
      const rec = this.chunks.get(key);
      if (rec) {      
        this._rebuildChunkMeshOnly(rec.cx, rec.cz);
        rebuiltCount++;
      }
    }
  }
  
  _rebuildChunkMeshOnly(cx, cz) {
    const key = this._key(cx, cz);
    const rec = this.chunks.get(key);
    if (!rec) return;
    const bs = this.blockSize;

    // Dispose old geometries and remove from scene
    if (rec.group) {
      while (rec.group.children.length > 0) {
        const child = rec.group.children[0];
        rec.group.remove(child);
        if (child.isMesh && child.geometry) {
          child.geometry.dispose();
        }
      }
      this.scene.remove(rec.group);
      rec.group = null;
    }

    const chunkLike = { data: rec.data };
    const meshes = this._buildChunkMesh(chunkLike, cx, cz, rec.top, rec.skyLight, rec.blockLight);
    const newGroup = new THREE.Group();
    for (const mesh of meshes) newGroup.add(mesh);
    const chunkWorldX = cx * CHUNK_SIZE * bs;
    const chunkWorldZ = cz * CHUNK_SIZE * bs;
    newGroup.position.set(chunkWorldX, 0, chunkWorldZ);

    this.scene.add(newGroup);
    rec.group = newGroup;
    rec.builtAtTime = this._timeOfDay;

    // Update player chunk borders if this is the player's current chunk
    if (cx === this._playerChunkX && cz === this._playerChunkZ && this.showBorders) {
      this._updatePlayerChunkBorders();
    }
  }

  // Get light levels at a world position
  // Returns { skyLight, blockLight, combined } all 0-15
  getLightAtWorld(worldX, worldY, worldZ) {
    const bs = this.blockSize;
    const gx = Math.floor(worldX / bs);
    const gz = Math.floor(worldZ / bs);
    const gyBlock = Math.floor((worldY - MIN_Y * bs) / bs) + MIN_Y;
    const cx = Math.floor(gx / CHUNK_SIZE);
    const cz = Math.floor(gz / CHUNK_SIZE);
    const localX = ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((gz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    const recKey = this._key(cx, cz);
    const rec = this.chunks.get(recKey);
    
    if (!rec || !rec.skyLight || !rec.blockLight) {
      return { skyLight: 15, blockLight: 0, combined: 15 };
    }
    
    const y = gyBlock;
    if (y < MIN_Y || y > (MIN_Y + HEIGHT - 1)) {
      return { skyLight: 15, blockLight: 0, combined: 15 };
    }
    
    const idx = ((localX * CHUNK_SIZE + localZ) * HEIGHT) + (y - MIN_Y);
    const sky = rec.skyLight[idx] || 0;
    const block = rec.blockLight[idx] || 0;
    const dayBrightness = this._getDayBrightness(this._timeOfDay);
    const combined = Math.max(Math.floor(sky * dayBrightness), block);
    
    return { skyLight: sky, blockLight: block, combined };
  }

  // Dispose of ChunkManager resources (call when no longer needed)
  dispose() {
    // Terminate worker thread to prevent memory leak
    if (this._chunkWorker) {
      this._chunkWorker.terminate();
      this._chunkWorker = null;
    }
    
    // Clear pending requests
    this._pendingRequests.clear();
    
    // Clear load queue
    this._loadQueue = [];
    
    // Clear finalization queue
    this._finalizationQueue = [];

    // Clear neighbor rebuild queue
    this._neighborRebuildQueue = [];
    this._neighborRebuildSet.clear();
    
    // Clear unload queue
    this._unloadQueue = [];
    
    // Unload all chunks and dispose geometries
    for (const [key, rec] of this.chunks) {
      if (rec.group) {
        rec.group.traverse((child) => {
          if (child.isMesh && child.geometry) {
            child.geometry.dispose();
          }
        });
        this.scene.remove(rec.group);
      }
    }
    this.chunks.clear();
    
    // Clear borders
    this._clearPlayerBorders();
    
    const disposedMaterials = new Set();
    const disposedTextures = new Set();

    const disposeMaterial = (material) => {
      if (!material || !material.dispose || disposedMaterials.has(material)) return;
      disposedMaterials.add(material);
      if (material.map && material.map.dispose && !disposedTextures.has(material.map)) {
        disposedTextures.add(material.map);
        material.map.dispose();
      }
      material.dispose();
    };

    // Dispose compatibility materials
    for (const mat of Object.values(this.materials)) {
      if (Array.isArray(mat)) {
        for (const m of mat) disposeMaterial(m);
      } else {
        disposeMaterial(mat);
      }
    }

    // Dispose chunk variant materials
    for (const mat of Object.values(this._chunkVariantMaterials || {})) {
      disposeMaterial(mat);
    }

    if (this._blockAtlas && this._blockAtlas.texture && this._blockAtlas.texture.dispose) {
      this._blockAtlas.texture.dispose();
    }
    
    if (DEBUG.logChunkLoading) {
      console.log('ChunkManager: Disposed all resources');
    }
  }
}
