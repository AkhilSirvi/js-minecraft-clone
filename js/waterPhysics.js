import * as THREE from './three.module.js';

export const WATER_CONFIG = {
  maxFlowDistance: 8,        // Water spreads 8 blocks horizontally from source
  flowSpeed: 0.35,           // Slightly slower for performance (was 0.25)
  verticalFlowSpeed: 0.0,    // Instant vertical flow (falls immediately)
  maxSpreadIterations: 1,    // Reduced from 2 for performance
  sourceLevel: 8,            // Full water source block
  minFlowLevel: 1,           // Minimum water level before disappearing
  sourceCreationEnabled: true,
  minAdjacentSources: 2,     // Minimum adjacent source blocks to create new source
  flowAnimSpeed: 1.0,        // Speed of flow texture animation
  transparency: 1,        // Water transparency (0-1)
  animationFPS: 10,          // Reduced animation FPS for performance (was ~20)

  // Level 8 (source) = 1 block, Level 1 = 0.125 blocks
  levelHeights: {
    8: 1.0,      // Source block - full height
    7: 0.875,    // 7/8 height
    6: 0.75,     // 6/8 height
    5: 0.625,    // 5/8 height
    4: 0.5,      // 4/8 height
    3: 0.375,    // 3/8 height
    2: 0.25,     // 2/8 height (minimum visible)
    1: 0.125,    // 1/8 height (essentially gone)
  },
  swimSpeed: 0.4,            // Base movement speed multiplier in water
  sinkSpeed: 0.02,           // Sink rate when not swimming (blocks/tick)
  buoyancy: 0.04,            // Upward force when pressing jump in water
  swimBuoyancy: 0.08,        // Upward force when actively swimming
  drag: 0.8,                 // Movement drag in water
  currentSpeed: 1.39,        // Speed at which water current pushes entities (blocks/sec)
  currentStrength: 0.014,    // Force applied per tick by water current
  preventsFallDamage: true,
};

export class WaterBlock {
  constructor(x, y, z, level = WATER_CONFIG.sourceLevel) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.level = level;           // Water level (0-8, 8=source)
    this.isSource = level === WATER_CONFIG.sourceLevel;
    this.isFalling = false;
    this.flowDirection = new THREE.Vector3(0, 0, 0); // Direction of current
    this.mesh = null;
    this.scheduledRemoval = false;
  }
  
  setLevel(newLevel) {
    this.level = Math.max(0, Math.min(WATER_CONFIG.sourceLevel, newLevel));
    this.needsUpdate = true;
    if (this.level === WATER_CONFIG.sourceLevel) {
      this.isSource = true;
      this.flowing = false;
    } else {
      this.isSource = false;
      this.flowing = this.level > 0;
    }
  }
  
  getHeight() {
    if (this.isFalling) {
      return 1.0; // Falling water is always full height
    }
    return WATER_CONFIG.levelHeights[this.level] || 0.125;
  }
  
  // Calculate the flow direction based on neighboring water levels
  calculateFlowDirection(waterPhysics) {
    this.flowDirection.set(0, 0, 0);
    
    // Check for downward flow first
    const below = waterPhysics.getWater(this.x, this.y - 1, this.z);
    const belowPassable = waterPhysics.isPassableBlock(this.x, this.y - 1, this.z);
    
    if (belowPassable || below) {
      // Has downward current
      this.flowDirection.y = -1;
    }
    
    // Calculate horizontal flow based on neighboring water levels
    const neighbors = [
      { dx: 1, dz: 0 },   // +X
      { dx: -1, dz: 0 },  // -X
      { dx: 0, dz: 1 },   // +Z
      { dx: 0, dz: -1 },  // -Z
    ];
    
    for (const { dx, dz } of neighbors) {
      const neighbor = waterPhysics.getWater(this.x + dx, this.y, this.z + dz);
      
      if (neighbor) {
        // Flow from higher to lower level
        const levelDiff = neighbor.level - this.level;
        if (levelDiff > 0) {
          // Water flows FROM this neighbor TO us
          this.flowDirection.x -= dx * levelDiff;
          this.flowDirection.z -= dz * levelDiff;
        } else if (levelDiff < 0) {
          // Water flows FROM us TO this neighbor
          this.flowDirection.x += dx * Math.abs(levelDiff);
          this.flowDirection.z += dz * Math.abs(levelDiff);
        }
      } else if (waterPhysics.isPassableBlock(this.x + dx, this.y, this.z + dz)) {
        // Flow toward empty space
        this.flowDirection.x += dx;
        this.flowDirection.z += dz;
      }
    }
    
    // Normalize horizontal component
    const horizLength = Math.hypot(this.flowDirection.x, this.flowDirection.z);
    if (horizLength > 0) {
      this.flowDirection.x /= horizLength;
      this.flowDirection.z /= horizLength;
    }
    
    return this.flowDirection;
  }
}

// Rotate a UV coordinate around the tile center (0.5, 0.5). Used so the
// flow texture's animated scroll direction visually matches each water
// block's actual flow direction instead of always scrolling the same way.
function rotateUV(u, v, angle) {
  if (!angle) return [u, v];
  const cu = u - 0.5;
  const cv = v - 0.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cu * cos - cv * sin + 0.5, cu * sin + cv * cos + 0.5];
}

// ============================================
// WATER PHYSICS MANAGER
// ============================================

export class WaterPhysics {
  constructor(chunkManager, scene) {
    this.chunkManager = chunkManager;
    this.scene = scene;
    this.waterBlocks = new Map();
    this.updateQueue = [];

    this.flowTickTimer = 0;
    
    // Water materials
    this.materials = this.createWaterMaterials();
    
    // Particle system
    this.particles = [];
    this.maxParticles = 500;
    
    // Player breath/drowning state
    this.playerBreath = WATER_CONFIG.breathDuration;
    this.drowningTimer = 0;
    this.isPlayerSubmerged = false; // Head underwater
  }
  
  createWaterMaterials() {
    try {
      const textureLoader = new THREE.TextureLoader();
      
      const stillTexture = textureLoader.load('assets/textures/block/water_still.png',undefined,undefined);
      const flowTexture = textureLoader.load('assets/textures/block/water_flow.png',undefined,undefined);
      const overlayTexture = textureLoader.load('assets/textures/block/water_overlay.png',undefined,undefined);
      
      // Configure texture settings
      [stillTexture, flowTexture, overlayTexture].forEach(texture => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
      });
      
      // water_still.png is 16x512 (32 frames of 16x16)
      // water_flow.png is 32x1024 (32 frames of 32x32)
      // Set repeat to show only one frame at a time
      stillTexture.repeat.set(1, 1 / 32);
      flowTexture.repeat.set(1, 1 / 32);
      
      // Store frame count for animation
      this.animationFrame = 0;
      this.animationTimer = 0;
      
      // Water source block material
      const sourceMaterial = new THREE.MeshStandardMaterial({
        map: stillTexture,
        transparent: true,
        opacity: WATER_CONFIG.transparency,
        color: 0x3366ff,
        side: THREE.DoubleSide,
      });
      
      // Flowing water material
      const flowMaterial = new THREE.MeshStandardMaterial({
        map: flowTexture,
        transparent: true,
        opacity: WATER_CONFIG.transparency,
        color: 0x3366ff,
        side: THREE.DoubleSide,
      });
      
      // Water overlay for underwater effects
      const overlayMaterial = new THREE.MeshBasicMaterial({
        map: overlayTexture,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      
      return {
        source: sourceMaterial,
        flow: flowMaterial,
        overlay: overlayMaterial,
        stillTexture,
        flowTexture,
      };
    } catch (error) {
      console.error('Error creating water materials:', error);
      return {
        source: new THREE.MeshStandardMaterial({ color: 0x3366ff, transparent: true, opacity: 0.7 }),
        flow: new THREE.MeshStandardMaterial({ color: 0x3366ff, transparent: true, opacity: 0.7 }),
        overlay: new THREE.MeshBasicMaterial({ color: 0x3366ff, transparent: true, opacity: 0.3 }),
        stillTexture: null,
        flowTexture: null,
      };
    }
  }
  
  // ============================================
  // WATER PLACEMENT & REMOVAL
  // ============================================
  
  placeWater(x, y, z, isSource = true) {
    try {
      const key = `${x},${y},${z}`;
      
      if (this.waterBlocks.has(key)) {
        console.log('Water already exists');
        return null;
      }
      
      const waterBlock = new WaterBlock(x, y, z, WATER_CONFIG.sourceLevel);
      this.waterBlocks.set(key, waterBlock);
      
      const mesh = this.createWaterMesh(waterBlock);
      
      // Mesh can be null if all faces are hidden, but block is still valid
      // Update neighbor meshes to hide their adjacent faces
      this.scheduleNeighborUpdates(x, y, z);
      
      return waterBlock;
    } catch (error) {
      console.error('Error in placeWater:', error.message);
      console.error(error.stack);
      return null;
    }
  }
  
  placeWaterQuiet(x, y, z, isSource = true) {
    try {
      const key = `${x},${y},${z}`;
      
      if (this.waterBlocks.has(key)) {
        return null;
      }
      
      if (!this.materials || !this.materials.source || !this.materials.flow) {
        return null;
      }
      
      const waterLevel = isSource ? WATER_CONFIG.sourceLevel : WATER_CONFIG.sourceLevel - 1;
      const waterBlock = new WaterBlock(x, y, z, waterLevel);
      
      this.waterBlocks.set(key, waterBlock);
      
      // Create visual mesh
      const mesh = this.createWaterMesh(waterBlock);
      
      // Mesh can be null if all faces are hidden, but block is still valid
      // Update neighbor meshes to hide their adjacent faces
      this.scheduleNeighborUpdates(x, y, z);
      
      return waterBlock;
    } catch (error) {
      console.error('Error in placeWaterQuiet:', error);
      return null;
    }
  }
  
  removeWater(x, y, z) {
    const key = `${x},${y},${z}`;
    const waterBlock = this.waterBlocks.get(key);
    
    if (!waterBlock) return;
    
    // Remove mesh from scene
    if (waterBlock.mesh) {
      waterBlock.mesh.parent?.remove(waterBlock.mesh);
      waterBlock.mesh.geometry.dispose();
      waterBlock.mesh = null;
    }
    
    this.waterBlocks.delete(key);
    
    // Trigger neighbor updates
    this.scheduleNeighborUpdates(x, y, z);
  }
  
  getWater(x, y, z) {
    return this.waterBlocks.get(`${x},${y},${z}`);
  }
  
  // ============================================
  // MESH CREATION
  // ============================================
  
  // Check if a face should be rendered (not adjacent to water or solid block)
  shouldRenderFace(x, y, z, dx, dy, dz) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    
    // Check if neighbor is water
    if (this.getWater(nx, ny, nz)) {
      return false; // Don't render face adjacent to water
    }
    
    // Check if neighbor is a solid block
    return this.isPassableBlock(nx, ny, nz);
    
     // Render face (adjacent to air)
  }
  
  // Height of the water surface at a shared world-space corner. Every corner
  // is touched by up to 4 water blocks; averaging across whichever of them
  // exist keeps neighboring blocks' surfaces flush with each other so there's
  // no gap/seam where two water faces meet.
  getSurfaceCornerHeight(waterBlock, cx, cz) {
    const { x, y, z } = waterBlock;
    
    if (waterBlock.isSource || waterBlock.isFalling) {
      return waterBlock.getHeight();
    }
    
    let total = 0;
    let count = 0;
    let touchesSource = false;
    
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) {
        const nx = x + cx - 1 + dx;
        const nz = z + cz - 1 + dz;
        const block = (nx === x && nz === z) ? waterBlock : this.getWater(nx, y, nz);
        if (!block) continue;
        if (block.isSource) touchesSource = true;
        total += block.getHeight();
        count++;
      }
    }
    
    if (touchesSource) return 1.0;
    if (count === 0) return waterBlock.getHeight();
    return total / count;
  }
  
  createWaterGeometry(waterBlock) {
    const { x, y, z } = waterBlock;
    
    const h00 = this.getSurfaceCornerHeight(waterBlock, 0, 0);
    const h01 = this.getSurfaceCornerHeight(waterBlock, 0, 1);
    const h11 = this.getSurfaceCornerHeight(waterBlock, 1, 1);
    const h10 = this.getSurfaceCornerHeight(waterBlock, 1, 0);
    const isFlat = h00 === h01 && h01 === h11 && h11 === h10;
    
    // Angle (around Y) to rotate the flow texture so its baked-in flow
    // pattern points the direction this block is actually flowing.
    //
    // Tracing through: on the top face, corner (localX, localZ) is given
    // UV (localX, localZ) before any rotation (see baseUVs vs. the top
    // face's corner order below) - i.e. at angle 0, U tracks world X and
    // V tracks world Z, so the texture's "flow" (its V axis) points along
    // world +Z by convention. To make the displayed pattern point along
    // flowDir=(fx, fz) instead of +Z, the content must be rotated by
    // atan2(fx, fz) - but since we're rotating the UV *sample* coordinates
    // (not the content itself), the sample rotation is the inverse of
    // that, which after simplifying signs comes out to atan2(fx, fz).
    const flowDir = waterBlock.flowDirection;
    const horizLen = Math.hypot(flowDir.x, flowDir.z);
    const isAnimatedFlow = !waterBlock.isSource && !waterBlock.isFalling && horizLen > 0.001;
    const flowAngle = isAnimatedFlow ? Math.atan2(flowDir.x, flowDir.z) : 0;
    
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    
    // Face definitions. 'h00'/'h01'/'h11'/'h10' placeholders are resolved to the
    // (possibly tilted) corner height for that (x,z) corner below.
    const faces = [
      // Right face (+X)
      { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 'h10', 0], [1, 'h11', 1], [1, 0, 1]] },
      // Left face (-X)
      { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 'h01', 1], [0, 'h00', 0], [0, 0, 0]] },
      // Top face (+Y)
      { dir: [0, 1, 0], corners: [[0, 'h00', 0], [0, 'h01', 1], [1, 'h11', 1], [1, 'h10', 0]] },
      // Bottom face (-Y)
      { dir: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
      // Front face (+Z)
      { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 'h11', 1], [0, 'h01', 1], [0, 0, 1]] },
      // Back face (-Z)
      { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 'h00', 0], [1, 'h10', 0], [1, 0, 0]] },
    ];
    
    const cornerHeightByKey = { h00, h01, h11, h10 };
    const baseUVs = [[0, 0], [0, 1], [1, 1], [1, 0]];
    
    let vertexIndex = 0;
    
    for (const face of faces) {
      const [dx, dy, dz] = face.dir;
      
      // Check if this face should be rendered
      if (!this.shouldRenderFace(x, y, z, dx, dy, dz)) {
        continue;
      }
      
      const isTopFace = dy === 1;
      
      // Add 4 vertices for this face
      for (const corner of face.corners) {
        const cy = typeof corner[1] === 'string' ? cornerHeightByKey[corner[1]] : corner[1];
        positions.push(corner[0] - 0.5, cy - 0.5, corner[2] - 0.5);
        normals.push(dx, dy, dz);
      }
      
      // For the top face, tilt the normal to roughly match the slope so
      // lighting reacts to the direction the water is flowing.
      if (isTopFace && !isFlat) {
        const nStart = normals.length - 12; // 4 verts * 3 components
        const slopeNormalX = -(h11 + h10 - h00 - h01) * 0.5;
        const slopeNormalZ = -(h01 + h11 - h00 - h10) * 0.5;
        for (let i = 0; i < 4; i++) {
          normals[nStart + i * 3] = slopeNormalX;
          normals[nStart + i * 3 + 1] = 1;
          normals[nStart + i * 3 + 2] = slopeNormalZ;
        }
      }
      
      // UV coordinates for the face, rotated to point the flow-texture
      // animation in the direction this block is actually flowing.
      for (const [u, v] of baseUVs) {
        const [ru, rv] = rotateUV(u, v, flowAngle);
        uvs.push(ru, rv);
      }
      
      // Two triangles for the quad
      indices.push(
        vertexIndex, vertexIndex + 1, vertexIndex + 2,
        vertexIndex, vertexIndex + 2, vertexIndex + 3
      );
      
      vertexIndex += 4;
    }
    
    // If no faces to render, return null
    if (positions.length === 0) {
      return null;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.normalizeNormals();
    
    return geometry;
  }
  
  createWaterMesh(waterBlock) {
    try {
      const { x, y, z, isSource } = waterBlock;
      
      const geometry = this.createWaterGeometry(waterBlock);
      
      // No visible faces, don't create mesh
      if (!geometry) {
        waterBlock.mesh = null;
        return null;
      }
      
      const material = isSource ? this.materials.source : this.materials.flow;
      
      const mesh = new THREE.Mesh(geometry, material);
      // Position at block center
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      
      waterBlock.mesh = mesh;
      
      if (this.scene) {
        this.scene.add(mesh);
      }
      
      return mesh;
    } catch (error) {
      console.error('Error in createWaterMesh:', error.message);
      return null;
    }
  }
  
  updateWaterMesh(waterBlock) {
    try {
      const oldGeometry = waterBlock.mesh?.geometry;
      
      const newGeometry = this.createWaterGeometry(waterBlock);
      
      if (!newGeometry) {
        // No visible faces, remove mesh if exists
        if (waterBlock.mesh) {
          waterBlock.mesh.parent?.remove(waterBlock.mesh);
          oldGeometry?.dispose();
          waterBlock.mesh = null;
        }
        return;
      }
      
      if (!waterBlock.mesh) {
        // Create new mesh if it didn't exist
        const material = waterBlock.isSource ? this.materials.source : this.materials.flow;
        const mesh = new THREE.Mesh(newGeometry, material);
        mesh.position.set(waterBlock.x + 0.5, waterBlock.y + 0.5, waterBlock.z + 0.5);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        waterBlock.mesh = mesh;
        if (this.scene) {
          this.scene.add(mesh);
        }
      } else {
        waterBlock.mesh.geometry = newGeometry;
        oldGeometry?.dispose();
        
        // Update material based on source/flow
        waterBlock.mesh.material = waterBlock.isSource ? 
          this.materials.source : this.materials.flow;
      }
    } catch (error) {
      console.error('Error in updateWaterMesh:', error);
    }
  }
  
  // ============================================
  // FLOW SIMULATION
  // ============================================
  
  scheduleUpdate(waterBlock) {
    try {
      if (waterBlock && !this.updateQueue.includes(waterBlock)) {
        this.updateQueue.push(waterBlock);
      }
    } catch (error) {
      console.error('Error in scheduleUpdate:', error);
    }
  }
  
  scheduleNeighborUpdates(x, y, z) {
    try {
      const offsets = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1],
        // Diagonal (same-Y) neighbors also share a top corner with this
        // block, so they need their surface geometry refreshed too or
        // their corner heights go stale and a seam appears between them.
        [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
      ];
      
      for (const [dx, dy, dz] of offsets) {
        const neighbor = this.getWater(x + dx, y + dy, z + dz);
        if (neighbor) {
          this.scheduleUpdate(neighbor);
          // Also update the mesh to recalculate visible faces
          this.updateWaterMesh(neighbor);
        }
      }
    } catch (error) {
      console.error('Error in scheduleNeighborUpdates:', error);
    }
  }
  
  update(deltaTime) {
    try {
      this.flowTickTimer += deltaTime;
      if (this.flowTickTimer >= WATER_CONFIG.flowSpeed) {
        this.processWaterFlow();
        this.flowTickTimer = 0;
      }
      
      // Update visual animations
      this.updateWaterAnimation(deltaTime);
      
      // Update flow directions for all water blocks, and refresh the mesh
      // whenever the flow direction changes enough to change the surface tilt
      for (const waterBlock of this.waterBlocks.values()) {
        const prevX = waterBlock.flowDirection.x;
        const prevZ = waterBlock.flowDirection.z;
        waterBlock.calculateFlowDirection(this);
        
        if (waterBlock.mesh && !waterBlock.isSource && !waterBlock.isFalling) {
          const dx = waterBlock.flowDirection.x - prevX;
          const dz = waterBlock.flowDirection.z - prevZ;
          if (dx * dx + dz * dz > 0.001) {
            this.updateWaterMesh(waterBlock);
          }
        }
      }
    } catch (error) {
      console.error('Error in water physics update:', error);
    }
  }
  
  processWaterFlow() {
    try {
      // If a solid block has been placed where tracked water used to be
      // (source or flowing, doesn't matter), clear that water out first.
      // This also means the BFS-based spread/weight calculations below
      // immediately see the obstruction and route around it.
      this.removeObstructedWater();
      
      let iterations = 0;
      const maxIterations = WATER_CONFIG.maxSpreadIterations || 2;
      let newWaterCreated = true;
      
      while (newWaterCreated && iterations < maxIterations) {
        newWaterCreated = false;
        iterations++;
        if (WATER_CONFIG.sourceCreationEnabled) {
          this.processSourceCreation();
        }
        
        const waterBlocksArray = Array.from(this.waterBlocks.values());
        for (const waterBlock of waterBlocksArray) {
          if (!waterBlock || waterBlock.scheduledRemoval) continue;
          
          try {
            const beforeCount = this.waterBlocks.size;
            const flowedDown = this.flowDown(waterBlock);
            if (!flowedDown) {
              this.flowHorizontallyWeighted(waterBlock);
            }
            
            if (this.waterBlocks.size > beforeCount) {
              newWaterCreated = true;
            }
          } catch (error) {
            console.error('Error processing water block:', error);
          }
        }
        
        // Clean up removed water blocks
        this.cleanupRemovedWater();
      }
      
      // Any flowing water with no source feeding it anymore (e.g. the
      // source that fed it just got obstructed) dries up one level per
      // tick instead of vanishing all at once.
      this.decayUnsuppliedWater();
    } catch (error) {
      console.error('Error in processWaterFlow:', error);
    }
  }
  
  // Remove any tracked water whose cell now contains a solid block - e.g.
  // the player placed a block directly into a source or flowing water block.
  removeObstructedWater() {
    try {
      const waterBlocksArray = Array.from(this.waterBlocks.values());
      for (const waterBlock of waterBlocksArray) {
        if (!this.isPassableBlock(waterBlock.x, waterBlock.y, waterBlock.z)) {
          this.removeWater(waterBlock.x, waterBlock.y, waterBlock.z);
        }
      }
    } catch (error) {
      console.error('Error in removeObstructedWater:', error);
    }
  }
  
  // Flood-fill outward from every remaining source to find which water
  // blocks are still legitimately fed by one (through a valid downhill/
  // downstream chain). Anything left over has been cut off from its
  // source (usually because the source got obstructed) and needs to dry up.
  computeSuppliedWater() {
    const supplied = new Set();
    const queue = [];
    
    for (const block of this.waterBlocks.values()) {
      if (block.isSource) {
        supplied.add(block);
        queue.push(block);
      }
    }
    
    while (queue.length > 0) {
      const block = queue.shift();
      
      // Water directly below a supplied block is always fed by it (falling)
      const below = this.getWater(block.x, block.y - 1, block.z);
      if (below && !supplied.has(below)) {
        supplied.add(below);
        queue.push(below);
      }
      
      // Horizontal neighbors at a strictly lower level are fed by this block
      const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of offsets) {
        const neighbor = this.getWater(block.x + dx, block.y, block.z + dz);
        if (neighbor && !supplied.has(neighbor) && neighbor.level < block.level) {
          supplied.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    
    return supplied;
  }
  
  decayUnsuppliedWater() {
    try {
      const supplied = this.computeSuppliedWater();
      const waterBlocksArray = Array.from(this.waterBlocks.values());
      let anyChanged = false;
      
      for (const block of waterBlocksArray) {
        if (block.isSource || supplied.has(block)) continue;
        
        // No source reaches this block anymore - drop one level this tick
        // rather than deleting it outright, so the body of water visibly
        // dries up step by step instead of popping out of existence.
        if (block.level - 1 < WATER_CONFIG.minFlowLevel) {
          block.scheduledRemoval = true;
        } else {
          block.setLevel(block.level - 1);
          this.updateWaterMesh(block);
          this.scheduleNeighborUpdates(block.x, block.y, block.z);
        }
        anyChanged = true;
      }
      
      if (anyChanged) {
        this.cleanupRemovedWater();
      }
    } catch (error) {
      console.error('Error in decayUnsuppliedWater:', error);
    }
  }
  
  processSourceCreation() {
    const waterBlocksArray = Array.from(this.waterBlocks.values());
    
    for (const waterBlock of waterBlocksArray) {
      if (!waterBlock || waterBlock.isSource) continue;
      
      // Check if on solid block or source block below
      const below = this.getWater(waterBlock.x, waterBlock.y - 1, waterBlock.z);
      const belowSolid = !this.isPassableBlock(waterBlock.x, waterBlock.y - 1, waterBlock.z);
      const onValidBase = belowSolid || (below && below.isSource);
      
      if (!onValidBase) continue;
      
      // Count adjacent horizontal source blocks
      let adjacentSources = 0;
      const neighbors = [
        [1, 0], [-1, 0], [0, 1], [0, -1]
      ];
      
      for (const [dx, dz] of neighbors) {
        const neighbor = this.getWater(waterBlock.x + dx, waterBlock.y, waterBlock.z + dz);
        if (neighbor && neighbor.isSource) {
          adjacentSources++;
        }
      }
      
      // Also check if there's a source directly above
      const above = this.getWater(waterBlock.x, waterBlock.y + 1, waterBlock.z);
      if (above && above.isSource) {
        adjacentSources++;
      }
      
      // Convert to source if enough adjacent sources
      if (adjacentSources >= WATER_CONFIG.minAdjacentSources) {
        waterBlock.setLevel(WATER_CONFIG.sourceLevel);
        this.updateWaterMesh(waterBlock);
        this.scheduleNeighborUpdates(waterBlock.x, waterBlock.y, waterBlock.z);
      }
    }
  }
  
  cleanupRemovedWater() {
    for (const [key, waterBlock] of this.waterBlocks.entries()) {
      if (waterBlock.scheduledRemoval) {
        this.removeWater(waterBlock.x, waterBlock.y, waterBlock.z);
      }
    }
  }
  
  flowDown(waterBlock) {
    try {
      if (!this.isPassableBlock(waterBlock.x, waterBlock.y - 1, waterBlock.z)) {
        return false;
      }

      const below = this.getWater(waterBlock.x, waterBlock.y - 1, waterBlock.z);

      if (!below) {
        this.placeWaterQuiet(waterBlock.x, waterBlock.y - 1, waterBlock.z, true);
        return true;
      }

      return true;
    } catch (error) {
      console.error('Error in flowDown:', error);
      return false;
    }
  }
  
  flowHorizontallyWeighted(waterBlock) {
    try {
      if (!waterBlock) {
        return;
      }
      
      // Water needs at least level 2 to spread (level 1 is minimum, won't spread)
      if (waterBlock.level <= WATER_CONFIG.minFlowLevel) {
        return;
      }
      
      const directions = [
        { dx: 1, dz: 0, name: '+X' },
        { dx: -1, dz: 0, name: '-X' },
        { dx: 0, dz: 1, name: '+Z' },
        { dx: 0, dz: -1, name: '-Z' },
      ];
      
      const flowWeights = [];
      
      for (const dir of directions) {
        const nx = waterBlock.x + dir.dx;
        const ny = waterBlock.y;
        const nz = waterBlock.z + dir.dz;
        
        // Check if neighbor position is passable
        if (!this.isPassableBlock(nx, ny, nz)) {
          continue; // Can't flow this direction
        }
        
        // Calculate weight: find shortest path to a drop within 4 blocks
        const weight = this.calculateFlowWeight(nx, ny, nz, 4);
        flowWeights.push({ dx: dir.dx, dz: dir.dz, weight, nx, ny, nz });
      }
      
      if (flowWeights.length === 0) return;

      const minWeight = Math.min(...flowWeights.map(f => f.weight));
      
      // Flow in all directions with minimum weight
      const nextLevel = waterBlock.isSource ? WATER_CONFIG.sourceLevel - 1 : waterBlock.level - 1;
      
      if (nextLevel < WATER_CONFIG.minFlowLevel) {
        return;
      }
      
      for (const flow of flowWeights) {
        // Only flow in directions with minimum weight (toward nearest drop)
        if (flow.weight !== minWeight) continue;
        
        const { nx, ny, nz, dx, dz } = flow;
        const neighbor = this.getWater(nx, ny, nz);
        const key = `${nx},${ny},${nz}`;
        
        // Place or update water
        if (!neighbor) {
          // Create new flowing water with decreased level
          const newWater = new WaterBlock(nx, ny, nz, nextLevel);
          // Check if this water should be "falling" (has water above)
          const hasWaterAbove = this.getWater(nx, ny + 1, nz);
          newWater.isFalling = false;
          this.waterBlocks.set(key, newWater);
          this.createWaterMesh(newWater);
          this.scheduleNeighborUpdates(nx, ny, nz);
        } else if (!neighbor.isSource && neighbor.level < nextLevel) {
          // Update existing water if new level is higher
          neighbor.setLevel(nextLevel);
          this.updateWaterMesh(neighbor);
          this.scheduleNeighborUpdates(nx, ny, nz);
        }
      }
    } catch (error) {
      console.error('Error in flowHorizontallyWeighted:', error);
    }
  }
  
  calculateFlowWeight(x, y, z, maxDepth) {
    // BFS to find shortest path to a drop
    const visited = new Set();
    const queue = [{ x, z, depth: 0 }];
    
    while (queue.length > 0) {
      const current = queue.shift();
      
      if (current.depth > maxDepth) continue;
      
      const key = `${current.x},${current.z}`;
      if (visited.has(key)) continue;
      visited.add(key);
      
      // Check if there's a drop here
      if (this.isPassableBlock(current.x, y - 1, current.z)) {
        return current.depth;
      }
      
      // Check neighbors
      const neighbors = [
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
        { dx: 0, dz: 1 },
        { dx: 0, dz: -1 },
      ];
      
      for (const { dx, dz } of neighbors) {
        const nx = current.x + dx;
        const nz = current.z + dz;
        
        if (!this.isPassableBlock(nx, y, nz)) continue;
        
        queue.push({ x: nx, z: nz, depth: current.depth + 1 });
      }
    }
    
    return 1000; // No drop found
  }
  
  
  hasWaterAbove(x, y, z) {
    const above = this.getWater(x, y + 1, z);
    return above && above.level > 0;
  }
  
  
  isPassableBlock(x, y, z) {
    try {
      // Check with chunk manager if block is passable (air, etc.)
      if (!this.chunkManager || !this.chunkManager.getBlockAtWorld) {
        return false;
      }
      const worldX = x + 0.5;
      const worldZ = z + 0.5;
      
      // Never let water spread into a chunk that hasn't loaded yet. Without
      // this, getBlockAtWorld reports unloaded cells as air (see
      // chunkManager.getBlockAtWorld's `conservativeUnloaded` default),
      // which would let water leak/flow into terrain the game hasn't
      // generated or loaded, leaving water tracked nowhere near real chunk data.
      if (
        this.chunkManager.isChunkLoadedAtWorld &&
        !this.chunkManager.isChunkLoadedAtWorld(worldX, worldZ)
      ) {
        return false;
      }
      
      const block = this.chunkManager.getBlockAtWorld(worldX, y + 0.5, worldZ);
      return !block || block === 0; // 0 = air
    } catch (error) {
      console.error('Error in isPassableBlock:', error);
      return false;
    }
  }
  
  updateWaterAnimation(deltaTime) {
    const time = Date.now() * 0.001;
    this.animationTimer = (this.animationTimer || 0) + deltaTime;
    const frameInterval = 1 / WATER_CONFIG.animationFPS;
    
    if (this.animationTimer >= frameInterval) {
      this.animationTimer -= frameInterval;
      this.animationFrame = ((this.animationFrame || 0) + 1) % 32;
      
      // Update still water texture frame
      if (this.materials.stillTexture && this.materials.stillTexture.offset) {
        // Each frame is 1/32 of the texture height
        this.materials.stillTexture.offset.y = this.animationFrame / 32;
      }
      
      // Update flowing water texture frame
      if (this.materials.flowTexture && this.materials.flowTexture.offset) {
        this.materials.flowTexture.offset.y = this.animationFrame / 32;
      }
    }
    
  }
  
  // ============================================
  // PARTICLE EFFECTS
  // ============================================
  
  spawnDripParticle(x, y, z) {
    if (this.particles.length >= this.maxParticles) return;
    
    const particle = {
      type: 'drip',
      position: new THREE.Vector3(x + Math.random(), y - 0.5, z + Math.random()),
      velocity: new THREE.Vector3(0, -0.5, 0),
      life: 2.0,
      maxLife: 2.0,
    };
    
    this.particles.push(particle);
  }

  
  // ============================================
  // PLAYER INTERACTION
  // ============================================
  
  isPlayerInWater(playerPosition) {
    const x = Math.floor(playerPosition.x);
    const y = Math.floor(playerPosition.y);
    const z = Math.floor(playerPosition.z);
    
    // Check current position and slightly above (for swimming)
    return this.getWater(x, y, z) || this.getWater(x, y + 1, z);
  }
  
  // Check if player's head (eye level) is submerged
  isPlayerHeadSubmerged(playerPosition, eyeHeight = 1.62) {
    const eyeY = playerPosition.y + eyeHeight;
    const x = Math.floor(playerPosition.x);
    const y = Math.floor(eyeY);
    const z = Math.floor(playerPosition.z);
    
    const waterBlock = this.getWater(x, y, z);
    if (!waterBlock) return false;
    
    // Check if eye level is below water surface
    const waterTopY = y + waterBlock.getHeight();
    return eyeY < waterTopY;
  }
  
  // Get the water block at a specific position
  getWaterAtPosition(position) {
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    const z = Math.floor(position.z);
    return this.getWater(x, y, z);
  }
  
  // Get the current (flow direction) at a position
  getWaterCurrentAt(position) {
    const waterBlock = this.getWaterAtPosition(position);
    if (!waterBlock) {
      return new THREE.Vector3(0, 0, 0);
    }
    return waterBlock.flowDirection.clone();
  }
  
  dispose() {
    for (const waterBlock of this.waterBlocks.values()) {
      if (waterBlock.mesh) {
        waterBlock.mesh.parent?.remove(waterBlock.mesh);
        waterBlock.mesh.geometry.dispose();
      }
    }
    
    // Dispose materials
    if (this.materials.source) this.materials.source.dispose();
    if (this.materials.flow) this.materials.flow.dispose();
    if (this.materials.overlay) this.materials.overlay.dispose();
    
    // Dispose textures
    if (this.materials.stillTexture) this.materials.stillTexture.dispose();
    if (this.materials.flowTexture) this.materials.flowTexture.dispose();
    
    this.waterBlocks.clear();
    this.updateQueue = [];
    this.particles = [];
  }
}

export default WaterPhysics;