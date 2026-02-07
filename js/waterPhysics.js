// waterPhysics.js
// Advanced water physics system for Minecraft clone
// Handles water flow, spreading, interaction with blocks, and visual effects

import * as THREE from './three.module.js';
import { CHUNK_SIZE, HEIGHT, MIN_Y } from './chunkGen.js';

// ============================================
// WATER PHYSICS CONFIGURATION
// Based on Minecraft Wiki specifications
// ============================================

export const WATER_CONFIG = {
  // Flow mechanics (Minecraft: 5 game ticks per block, 20 ticks/sec = 0.25 sec/block)
  maxFlowDistance: 7,        // Water spreads 7 blocks horizontally from source
  flowSpeed: 0.35,           // Slightly slower for performance (was 0.25)
  verticalFlowSpeed: 0.0,    // Instant vertical flow (falls immediately)
  maxSpreadIterations: 1,    // Reduced from 2 for performance
  
  // Water levels (Minecraft: 0=source, 1-7=flowing with decreasing depth)
  // Note: In Minecraft blockstate, 0=source, 1-7=flow levels (7 is shallowest)
  // We use 7=source, 0=shallowest for easier height calculations
  sourceLevel: 7,            // Full water source block (level 0 in MC blockstate = 7 here)
  minFlowLevel: 1,           // Minimum water level before disappearing
  
  // Source block creation (Minecraft: 2+ adjacent sources on solid block creates new source)
  sourceCreationEnabled: true,
  minAdjacentSources: 2,     // Minimum adjacent source blocks to create new source
  
  // Visual properties
  waveSpeed: 0.5,            // Speed of wave animation
  waveHeight: 0.04,          // Height of waves (subtle)
  flowAnimSpeed: 1.0,        // Speed of flow texture animation (~20fps like MC)
  transparency: 0.65,        // Water transparency (0-1)
  refractionStrength: 0.02,  // Water distortion effect
  animationFPS: 10,          // Reduced animation FPS for performance (was ~20)
  
  // Block heights based on level (Minecraft accurate)
  // Level 7 (source) = 1 block, Level 1 = 0.125 blocks
  levelHeights: {
    7: 1.0,      // Source block - full height
    6: 0.875,    // 7/8 height
    5: 0.75,     // 6/8 height
    4: 0.625,    // 5/8 height
    3: 0.5,      // 4/8 height
    2: 0.375,    // 3/8 height
    1: 0.25,     // 2/8 height (minimum visible)
    0: 0.125,    // 1/8 height (essentially gone)
  },
  
  // Swimming physics (Minecraft accurate)
  swimSpeed: 0.4,            // Base movement speed multiplier in water
  swimSpeedWithDepthStrider: 0.91, // With Depth Strider III
  sinkSpeed: 0.02,           // Sink rate when not swimming (blocks/tick)
  buoyancy: 0.04,            // Upward force when pressing jump in water
  swimBuoyancy: 0.08,        // Upward force when actively swimming
  drag: 0.8,                 // Movement drag in water
  
  // Current/pushing physics (Minecraft: ~1.39 m/s = 25 blocks per 18 seconds)
  currentSpeed: 1.39,        // Speed at which water current pushes entities (blocks/sec)
  currentStrength: 0.014,    // Force applied per tick by water current
  
  // Drowning mechanics (Minecraft: 15 second breath, then 2 HP/second)
  breathDuration: 15.0,      // Seconds of breath before drowning starts
  drowningDamage: 2,         // Hearts of damage per second while drowning
  drowningInterval: 1.0,     // Seconds between drowning damage ticks
  
  // Submerged mining (Minecraft: 5x slower on ground, 25x slower floating)
  miningSpeedMultiplierGround: 0.2,   // 5x slower
  miningSpeedMultiplierFloating: 0.04, // 25x slower
  
  // Fall damage (water negates all fall damage at any depth)
  preventsFallDamage: true,
  
  // Particle effects
  particleSpawnRate: 0.15,   // Probability of spawning drip particles
  bubbleSpawnRate: 0.08,     // Probability of spawning bubble particles
  splashParticleCount: 8,    // Particles when entity enters water
};

// ============================================
// WATER BLOCK DATA STRUCTURE
// ============================================

export class WaterBlock {
  constructor(x, y, z, level = WATER_CONFIG.sourceLevel) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.level = level;           // Water level (0-7, 7=source)
    this.isSource = level === WATER_CONFIG.sourceLevel;
    this.flowing = !this.isSource && level > 0;
    this.isFalling = false;       // True if water is falling (Minecraft "falling" blockstate)
    this.needsUpdate = true;
    this.flowDirection = new THREE.Vector3(0, 0, 0); // Direction of current
    this.mesh = null;
    this.scheduledRemoval = false; // Mark for removal when flow recalculates
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
  
  // Get height using Minecraft-accurate level heights
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

// ============================================
// WATER PHYSICS MANAGER
// ============================================

export class WaterPhysics {
  constructor(chunkManager, scene) {
    this.chunkManager = chunkManager;
    this.scene = scene;
    this.waterBlocks = new Map();
    this.updateQueue = [];
    this.tickAccumulator = 0;
    this.lastUpdate = Date.now();
    
    // Flow tick counter (Minecraft uses game ticks)
    this.flowTickTimer = 0;
    this.ticksPerSecond = 20; // Minecraft runs at 20 ticks per second
    
    // Water materials
    this.materials = this.createWaterMaterials();
    
    // Particle system
    this.particles = [];
    this.maxParticles = 500;
    
    // Player breath/drowning state
    this.playerBreath = WATER_CONFIG.breathDuration;
    this.drowningTimer = 0;
    this.isPlayerSubmerged = false; // Head underwater
    this.lastDrowningDamage = 0;
    
    // Entity tracking for water physics
    this.entitiesInWater = new Set();
    
    // Fall damage prevention tracking
    this.wasInWaterLastFrame = false;
  }
  
  // ============================================
  // MATERIAL CREATION
  // ============================================
  
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
      this.stillFrameCount = 32;
      this.flowFrameCount = 32;
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
    if (!this.isPassableBlock(nx, ny, nz)) {
      return false; // Don't render face adjacent to solid block
    }
    
    return true; // Render face (adjacent to air)
  }
  
  createWaterGeometry(waterBlock) {
    const { x, y, z } = waterBlock;
    const height = waterBlock.getHeight();
    
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    
    // Face definitions: [dx, dy, dz, vertices, normal]
    // Each face has 4 vertices defined as offsets from block origin
    const faces = [
      // Right face (+X)
      { dir: [1, 0, 0], corners: [[1, 0, 0], [1, height, 0], [1, height, 1], [1, 0, 1]] },
      // Left face (-X)
      { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, height, 1], [0, height, 0], [0, 0, 0]] },
      // Top face (+Y)
      { dir: [0, 1, 0], corners: [[0, height, 0], [0, height, 1], [1, height, 1], [1, height, 0]] },
      // Bottom face (-Y)
      { dir: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
      // Front face (+Z)
      { dir: [0, 0, 1], corners: [[1, 0, 1], [1, height, 1], [0, height, 1], [0, 0, 1]] },
      // Back face (-Z)
      { dir: [0, 0, -1], corners: [[0, 0, 0], [0, height, 0], [1, height, 0], [1, 0, 0]] },
    ];
    
    let vertexIndex = 0;
    
    for (const face of faces) {
      const [dx, dy, dz] = face.dir;
      
      // Check if this face should be rendered
      if (!this.shouldRenderFace(x, y, z, dx, dy, dz)) {
        continue;
      }
      
      // Add 4 vertices for this face
      for (const corner of face.corners) {
        positions.push(corner[0] - 0.5, corner[1] - 0.5, corner[2] - 0.5);
        normals.push(dx, dy, dz);
      }
      
      // UV coordinates for the face
      uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
      
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
      // Accumulate time for tick-based updates (Minecraft: 5 ticks per block spread)
      this.flowTickTimer += deltaTime;
      
      // Process water flow at Minecraft-accurate rate (5 ticks = 0.25 seconds)
      if (this.flowTickTimer >= WATER_CONFIG.flowSpeed) {
        this.processWaterFlow();
        this.flowTickTimer = 0;
      }
      
      // Update visual animations
      this.updateWaterAnimation(deltaTime);
      
      // Update flow directions for all water blocks
      for (const waterBlock of this.waterBlocks.values()) {
        waterBlock.calculateFlowDirection(this);
      }
    } catch (error) {
      console.error('Error in water physics update:', error);
    }
  }
  
  processWaterFlow() {
    try {
      let iterations = 0;
      const maxIterations = WATER_CONFIG.maxSpreadIterations || 2;
      let newWaterCreated = true;
      
      while (newWaterCreated && iterations < maxIterations) {
        newWaterCreated = false;
        iterations++;
        
        // Process source block creation first (Minecraft: 2 adjacent sources = new source)
        if (WATER_CONFIG.sourceCreationEnabled) {
          this.processSourceCreation();
        }
        
        const waterBlocksArray = Array.from(this.waterBlocks.values());
        for (const waterBlock of waterBlocksArray) {
          if (!waterBlock || waterBlock.scheduledRemoval) continue;
          
          try {
            const beforeCount = this.waterBlocks.size;
            
            // Priority: flow down first, then spread horizontally
            const flowedDown = this.flowDown(waterBlock);
            
            if (!flowedDown) {
              // Use weighted pathfinding for horizontal flow (Minecraft behavior)
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
    } catch (error) {
      console.error('Error in processWaterFlow:', error);
    }
  }
  
  // Minecraft-accurate source block creation:
  // A flowing water block adjacent to 2+ source blocks horizontally,
  // sitting on a solid block or another source, becomes a source
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
  
  canFlowDown(waterBlock) {
    try {
      const below = this.getWater(waterBlock.x, waterBlock.y - 1, waterBlock.z);
      if (below) {
        return false; // Already water below
      }
      
      // Check if block below is passable (air or similar)
      return this.isPassableBlock(waterBlock.x, waterBlock.y - 1, waterBlock.z);
    } catch (error) {
      console.error('Error in canFlowDown:', error);
      return false;
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
      
      // Minecraft weighted flow: assign weights to each direction
      // Weight = distance to nearest downward path (1000 if none found within 4 blocks)
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
      
      // Find minimum weight (Minecraft flows toward nearest drop)
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
        } else if (!neighbor.isSource && neighbor.level < nextLevel) {
          // Update existing water if new level is higher
          neighbor.setLevel(nextLevel);
          this.updateWaterMesh(neighbor);
        }
      }
    } catch (error) {
      console.error('Error in flowHorizontallyWeighted:', error);
    }
  }
  
  // Calculate flow weight: shortest path to a downward drop within maxDepth
  // Returns 1000 if no drop found (Minecraft behavior)
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
  
  // Legacy horizontal flow method (kept for reference)
  flowHorizontally(waterBlock) {
    try {
      if (!waterBlock) {
        return;
      }
      
      // Water needs at least level 2 to spread (level 1 is minimum, won't spread)
      if (waterBlock.level <= WATER_CONFIG.minFlowLevel) {
        return;
      }
      
      const horizontalOffsets = [
        [1, 0, 0, '+X'], [-1, 0, 0, '-X'],
        [0, 0, 1, '+Z'], [0, 0, -1, '-Z'],
      ];
      
      // Next level of water will be 1 less (unless it's a source)
      const nextLevel = waterBlock.isSource ? WATER_CONFIG.sourceLevel - 1 : waterBlock.level - 1;
      
      if (nextLevel < WATER_CONFIG.minFlowLevel) {
        return;
      }
      
      for (const [dx, dy, dz, dir] of horizontalOffsets) {
        const nx = waterBlock.x + dx;
        const ny = waterBlock.y;
        const nz = waterBlock.z + dz;
        
        // Check if neighbor position is passable
        if (!this.isPassableBlock(nx, ny, nz)) {
          continue;
        }
        
        const neighbor = this.getWater(nx, ny, nz);
        const key = `${nx},${ny},${nz}`;
        
        // Place or update water
        if (!neighbor) {
          // Create new flowing water with decreased level
          const newWater = new WaterBlock(nx, ny, nz, nextLevel);
          this.waterBlocks.set(key, newWater);
          this.createWaterMesh(newWater);
        } else if (!neighbor.isSource && neighbor.level < nextLevel) {
          // Update existing water if new level is higher
          neighbor.setLevel(nextLevel);
          this.updateWaterMesh(neighbor);
        }
      }
    } catch (error) {
      console.error('Error in flowHorizontally:', error);
    }
  }
  
  calculateFlowLevel(x, y, z) {
    // Find nearest source block and calculate level (Minecraft style)
    let minDistance = WATER_CONFIG.maxFlowDistance + 1;
    
    for (const waterBlock of this.waterBlocks.values()) {
      if (waterBlock.isSource && waterBlock.y === y) {
        const distance = Math.abs(waterBlock.x - x) + Math.abs(waterBlock.z - z);
        if (distance < minDistance) {
          minDistance = distance;
        }
      }
    }
    
    // Level decreases by 1 for each block distance from source
    const level = WATER_CONFIG.sourceLevel - minDistance;
    return Math.max(0, level);
  }
  
  hasWaterAbove(x, y, z) {
    const above = this.getWater(x, y + 1, z);
    return above && above.level > 0;
  }
  
  hasHigherNeighbor(waterBlock) {
    const offsets = [
      [1, 0, 0], [-1, 0, 0],
      [0, 0, 1], [0, 0, -1],
    ];
    
    for (const [dx, dz] of offsets) {
      const neighbor = this.getWater(
        waterBlock.x + dx,
        waterBlock.y,
        waterBlock.z + dz
      );
      
      if (neighbor && neighbor.level > waterBlock.level + 1) {
        return true;
      }
    }
    
    return false;
  }
  
  isPassableBlock(x, y, z) {
    try {
      // Check with chunk manager if block is passable (air, etc.)
      if (!this.chunkManager || !this.chunkManager.getBlockAtWorld) {
        return false;
      }
      const block = this.chunkManager.getBlockAtWorld(x + 0.5, y + 0.5, z + 0.5);
      return !block || block === 0; // 0 = air
    } catch (error) {
      console.error('Error in isPassableBlock:', error);
      return false;
    }
  }
  
  // ============================================
  // VISUAL ANIMATIONS
  // ============================================
  
  updateWaterAnimation(deltaTime) {
    const time = Date.now() * 0.001;
    
    // Animate sprite sheet frames (Minecraft-style animated textures)
    // Each texture is a vertical strip of 32 frames
    this.animationTimer = (this.animationTimer || 0) + deltaTime;
    const frameInterval = 0.05; // ~20 fps animation like Minecraft
    
    if (this.animationTimer >= frameInterval) {
      this.animationTimer = 0;
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
    
    // Update individual water block meshes with wave effect
    for (const waterBlock of this.waterBlocks.values()) {
      if (waterBlock.mesh) {
        // Add subtle wave motion to all water blocks
        const wave = Math.sin(time * 2 + waterBlock.x * 0.5 + waterBlock.z * 0.5);
        const baseY = waterBlock.y + 0.5;
        const waveOffset = waterBlock.isSource ? wave * WATER_CONFIG.waveHeight * 0.01 : 0;
        waterBlock.mesh.position.y = baseY + waveOffset;
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
  
  spawnBubbleParticle(x, y, z) {
    if (this.particles.length >= this.maxParticles) return;
    
    const particle = {
      type: 'bubble',
      position: new THREE.Vector3(
        x + Math.random(),
        y + Math.random(),
        z + Math.random()
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        0.2,
        (Math.random() - 0.5) * 0.1
      ),
      life: 3.0,
      maxLife: 3.0,
    };
    
    this.particles.push(particle);
  }
  
  updateParticles(deltaTime) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      
      // Update position
      particle.position.add(
        particle.velocity.clone().multiplyScalar(deltaTime)
      );
      
      // Update life
      particle.life -= deltaTime;
      
      // Remove dead particles
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
    
    // Spawn new particles
    if (Math.random() < WATER_CONFIG.particleSpawnRate * deltaTime) {
      for (const waterBlock of this.waterBlocks.values()) {
        if (this.hasWaterAbove(waterBlock.x, waterBlock.y, waterBlock.z)) {
          this.spawnDripParticle(waterBlock.x, waterBlock.y, waterBlock.z);
          break;
        }
      }
    }
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
  
  // Apply Minecraft-accurate water physics to player velocity
  applyWaterPhysics(velocity, playerPosition, inputState = {}) {
    const inWater = this.isPlayerInWater(playerPosition);
    
    if (!inWater) {
      // Track for fall damage prevention
      this.wasInWaterLastFrame = false;
      return velocity;
    }
    
    // Mark that we're in water (for fall damage prevention)
    this.wasInWaterLastFrame = true;
    
    const isSwimming = inputState.forward || inputState.jump;
    const isSneaking = inputState.crouch;
    
    // Apply water drag (Minecraft: reduces all velocities)
    velocity.multiplyScalar(WATER_CONFIG.drag);
    
    // Apply swim speed reduction to horizontal movement
    velocity.x *= WATER_CONFIG.swimSpeed;
    velocity.z *= WATER_CONFIG.swimSpeed;
    
    // Get water current and apply pushing force
    const current = this.getWaterCurrentAt(playerPosition);
    if (current.lengthSq() > 0) {
      // Minecraft: water pushes at ~1.39 m/s (25 blocks per 18 seconds)
      velocity.x += current.x * WATER_CONFIG.currentStrength;
      velocity.z += current.z * WATER_CONFIG.currentStrength;
      
      // Downward current
      if (current.y < 0) {
        velocity.y += current.y * WATER_CONFIG.currentStrength;
      }
    }
    
    // Handle vertical movement
    if (inputState.jump) {
      // Swimming up - apply buoyancy
      velocity.y += WATER_CONFIG.swimBuoyancy;
    } else if (isSneaking) {
      // Sinking faster when sneaking
      velocity.y -= WATER_CONFIG.sinkSpeed * 2;
    } else {
      // Natural sinking
      velocity.y -= WATER_CONFIG.sinkSpeed;
    }
    
    // Clamp vertical velocity in water
    if (velocity.y < -WATER_CONFIG.currentSpeed) {
      velocity.y = -WATER_CONFIG.currentSpeed;
    }
    if (velocity.y > WATER_CONFIG.buoyancy * 10) {
      velocity.y = WATER_CONFIG.buoyancy * 10;
    }
    
    return velocity;
  }
  
  // Update player breath and drowning (call every frame)
  updatePlayerBreath(deltaTime, playerPosition, eyeHeight = 1.62) {
    const wasSubmerged = this.isPlayerSubmerged;
    this.isPlayerSubmerged = this.isPlayerHeadSubmerged(playerPosition, eyeHeight);
    
    if (this.isPlayerSubmerged) {
      // Decrease breath
      this.playerBreath -= deltaTime;
      
      if (this.playerBreath <= 0) {
        // Drowning!
        this.drowningTimer += deltaTime;
        
        // Deal damage every drowningInterval seconds
        if (this.drowningTimer >= WATER_CONFIG.drowningInterval) {
          this.drowningTimer = 0;
          return {
            isDrowning: true,
            damage: WATER_CONFIG.drowningDamage,
            breath: 0,
            maxBreath: WATER_CONFIG.breathDuration
          };
        }
      }
    } else {
      // Restore breath when head is above water
      // Minecraft: breath restores instantly when surfacing
      this.playerBreath = WATER_CONFIG.breathDuration;
      this.drowningTimer = 0;
    }
    
    return {
      isDrowning: false,
      damage: 0,
      breath: Math.max(0, this.playerBreath),
      maxBreath: WATER_CONFIG.breathDuration,
      isSubmerged: this.isPlayerSubmerged
    };
  }
  
  // Check if fall damage should be prevented (player landed in water)
  shouldPreventFallDamage(playerPosition) {
    if (!WATER_CONFIG.preventsFallDamage) return false;
    return this.isPlayerInWater(playerPosition);
  }
  
  // Get mining speed multiplier when in water
  getMiningSpeedMultiplier(playerPosition, isOnGround) {
    if (!this.isPlayerHeadSubmerged(playerPosition)) {
      return 1.0; // Not submerged, normal speed
    }
    
    // Minecraft: 5x slower on ground, 25x slower floating
    if (isOnGround) {
      return WATER_CONFIG.miningSpeedMultiplierGround;
    }
    return WATER_CONFIG.miningSpeedMultiplierFloating;
  }
  
  getWaterDragMultiplier() {
    return WATER_CONFIG.drag;
  }
  
  // Get swim mode state (for prone swimming animation like Minecraft)
  getSwimModeState(playerPosition, inputState = {}) {
    const headSubmerged = this.isPlayerHeadSubmerged(playerPosition);
    const fullySubmerged = this.isPlayerInWater(playerPosition) && headSubmerged;
    const isSprinting = inputState.sprint && inputState.forward;
    
    // Minecraft: sprint in water while fully submerged = swim mode (horizontal)
    return {
      inSwimMode: fullySubmerged && isSprinting,
      fullySubmerged,
      headSubmerged,
      canSwim: this.isPlayerInWater(playerPosition)
    };
  }
  
  // ============================================
  // CLEANUP
  // ============================================
  
  dispose() {
    // Remove all water meshes
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
