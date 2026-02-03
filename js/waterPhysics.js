// waterPhysics.js
// Advanced water physics system for Minecraft clone
// Handles water flow, spreading, interaction with blocks, and visual effects

import * as THREE from './three.module.js';
import { CHUNK_SIZE, HEIGHT, MIN_Y } from './chunkGen.js';

// ============================================
// WATER PHYSICS CONFIGURATION
// ============================================

export const WATER_CONFIG = {
  // Flow mechanics
  maxFlowDistance: 7,        // How far water spreads horizontally
  flowSpeed: 0.6,            // Seconds between flow updates (higher = slower)
  verticalFlowSpeed: 0.3,    // Speed water falls downward
  // How many spread iterations to perform per flow tick. Lower values slow spread.
  maxSpreadIterations: 1,
  
  // Water levels (0-7, where 7 is source block)
  sourceLevel: 7,            // Full water source block
  minFlowLevel: 1,           // Minimum water level before evaporating
  
  // Visual properties
  waveSpeed: 0.5,            // Speed of wave animation
  waveHeight: 0.08,          // Height of waves
  flowAnimSpeed: 1.2,        // Speed of flow texture animation
  transparency: 0.7,         // Water transparency (0-1)
  refractionStrength: 0.05,  // Water distortion effect
  
  // Physics interaction
  swimSpeed: 0.4,            // Player movement speed multiplier in water
  sinkSpeed: 0.02,           // How fast entities sink in water
  buoyancy: 0.08,            // Upward force when swimming
  drag: 0.85,                // Movement drag in water
  
  // Particle effects
  particleSpawnRate: 0.2,    // Probability of spawning drip particles
  bubbleSpawnRate: 0.1,      // Probability of spawning bubble particles
};

// ============================================
// WATER BLOCK DATA STRUCTURE
// ============================================

export class WaterBlock {
  constructor(x, y, z, level = WATER_CONFIG.sourceLevel) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.level = level;           // Water level (0-7)
    this.isSource = level === WATER_CONFIG.sourceLevel;
    this.flowing = false;
    this.needsUpdate = true;
    this.flowDirection = new THREE.Vector3(0, 0, 0);
    this.mesh = null;
  }
  
  setLevel(newLevel) {
    this.level = Math.max(0, Math.min(WATER_CONFIG.sourceLevel, newLevel));
    this.needsUpdate = true;
    if (this.level === WATER_CONFIG.sourceLevel) {
      this.isSource = true;
      this.flowing = false;
    } else {
      this.flowing = this.level > 0;
    }
  }
  
  getHeight() {
    return (this.level + 1) / (WATER_CONFIG.sourceLevel + 1);
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
    
    // Water materials
    this.materials = this.createWaterMaterials();
    
    // Particle system
    this.particles = [];
    this.maxParticles = 500;
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
      
      if (!mesh) {
        this.waterBlocks.delete(key);
        return null;
      }
      
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
      
      if (!mesh) {
        this.waterBlocks.delete(key);
        return null;
      }
      
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
  
  createWaterMesh(waterBlock) {
    try {
      const { x, y, z, isSource } = waterBlock;
      const height = waterBlock.getHeight();
      
      const geometry = new THREE.BoxGeometry(1, height, 1);
      // Adjust geometry so bottom is at block position
      geometry.translate(0, (height - 1) / 2, 0);
      
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
      if (!waterBlock.mesh) return;
      
      const height = waterBlock.getHeight();
      const oldGeometry = waterBlock.mesh.geometry;
      
      const newGeometry = new THREE.BoxGeometry(1, height, 1);
      newGeometry.translate(0, (height - 1) / 2, 0);
      
      waterBlock.mesh.geometry = newGeometry;
      oldGeometry.dispose();
      
      // Update material based on source/flow
      waterBlock.mesh.material = waterBlock.isSource ? 
        this.materials.source : this.materials.flow;
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
        }
      }
    } catch (error) {
      console.error('Error in scheduleNeighborUpdates:', error);
    }
  }
  
  update(deltaTime) {
    try {
      // Accumulate time for tick-based updates
      this.tickAccumulator += deltaTime;
      
      // Update water flow physics (Minecraft-style)
      if (this.tickAccumulator >= WATER_CONFIG.flowSpeed) {
        this.processWaterFlow();
        this.tickAccumulator = 0;
      }
      
      // Update visual animations
      this.updateWaterAnimation(deltaTime);
    } catch (error) {
      console.error('Error in water physics update:', error);
    }
  }
  
  processWaterFlow() {
    try {
      let iterations = 0;
      const maxIterations = 10;
      let newWaterCreated = true;
      const configuredMax = WATER_CONFIG.maxSpreadIterations || maxIterations;
      while (newWaterCreated && iterations < configuredMax) {
        newWaterCreated = false;
        iterations++;
        const waterBlocksArray = Array.from(this.waterBlocks.values());
        for (const waterBlock of waterBlocksArray) {
          if (!waterBlock) continue; 
          try {
            const beforeCount = this.waterBlocks.size;
            const flowedDown = this.flowDown(waterBlock);
            if (!flowedDown) {
              this.flowHorizontally(waterBlock);
            }
            
            if (this.waterBlocks.size > beforeCount) {
              newWaterCreated = true;
            }
          } catch (error) {
            console.error('Error processing water block:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error in processWaterFlow:', error);
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
    
    // Animate still water texture (waves)
    if (this.materials.stillTexture && this.materials.stillTexture.offset) {
      this.materials.stillTexture.offset.x = Math.sin(time * WATER_CONFIG.waveSpeed) * 0.02;
      this.materials.stillTexture.offset.y = time * 0.05;
    }
    
    // Animate flowing water texture
    if (this.materials.flowTexture && this.materials.flowTexture.offset) {
      this.materials.flowTexture.offset.y = time * WATER_CONFIG.flowAnimSpeed;
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
  
  applyWaterPhysics(velocity, playerPosition, isSwimming) {
    if (!this.isPlayerInWater(playerPosition)) {
      return velocity;
    }
    
    // Apply drag
    velocity.multiplyScalar(WATER_CONFIG.drag);
    
    // Apply swim speed reduction to horizontal movement
    velocity.x *= WATER_CONFIG.swimSpeed;
    velocity.z *= WATER_CONFIG.swimSpeed;
    
    // Apply buoyancy when swimming, sink when not
    if (isSwimming) {
      velocity.y += WATER_CONFIG.buoyancy;
    } else {
      velocity.y -= WATER_CONFIG.sinkSpeed;
    }
    
    return velocity;
  }
  
  getWaterDragMultiplier() {
    return WATER_CONFIG.drag;
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
