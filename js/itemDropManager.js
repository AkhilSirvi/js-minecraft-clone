import * as THREE from './three.module.js';
import {
  getBlockDropId,
  getBlockMaterialSetKey,
  getChunkFaceMaterialKeys,
  isBlockPassable,
} from '../data/blocks.js';

export class ItemDrop {
  constructor(x, y, z, blockId, scene, materials = null) {
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      2,
      (Math.random() - 0.5) * 3
    );
    this.blockId = blockId;
    this.age = 0;
    this.pickupDelay = 1; // delay before item can be picked up (seconds)
    this.lifespan = 900; // 15 minutes before item despawns
    this.scene = scene;
    this.mesh = null;
    this.onGround = false;
    this.materials = materials;
    
    // Pickup animation state
    this.isBeingPickedUp = false;
    this.pickupStart = null;
    this.pickupTarget = null;
    this.pickupDuration = 0.4; // animation duration in seconds
    this.pickupElapsed = 0;
    
    this._createMesh();
  }

  _getBlockMaterialKey(blockId) {
    return getBlockMaterialSetKey(blockId) || 'dirt';
  }

  _applyAtlasFaceUVs(geometry, faceRects) {
    if (!geometry || !geometry.index || !geometry.attributes || !geometry.attributes.uv) return;
    const indexArray = geometry.index.array;
    const uvArray = geometry.attributes.uv.array;
    const groups = geometry.groups || [];

    for (const group of groups) {
      const rect = faceRects[group.materialIndex];
      if (!rect) continue;

      const touchedVertices = new Set();
      const end = group.start + group.count;
      for (let i = group.start; i < end; i++) {
        touchedVertices.add(indexArray[i]);
      }

      for (const vertexIndex of touchedVertices) {
        const uvIndex = vertexIndex * 2;
        const u = uvArray[uvIndex];
        const v = uvArray[uvIndex + 1];
        uvArray[uvIndex] = rect.u0 + u * (rect.u1 - rect.u0);
        uvArray[uvIndex + 1] = rect.v0 + v * (rect.v1 - rect.v0);
      }
    }

    geometry.attributes.uv.needsUpdate = true;
  }

  _createMesh() {
    const geometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    let materials = [];

    const faceRects = new Array(6).fill(null);

    for (let i = 0; i < 6; i++) {
      const fallbackKey = this._getBlockMaterialKey(this.blockId);
      const faceKeyInfo = getChunkFaceMaterialKeys(this.blockId, i);
      const matKey = faceKeyInfo.base || fallbackKey;

      let sourceMat = null;
      if (this.materials) {
        if (this.materials[matKey]) {
          const cmMat = this.materials[matKey];
          if (Array.isArray(cmMat)) {
            sourceMat = cmMat[i] || cmMat[0] || null;
          } else {
            sourceMat = cmMat;
          }
        }

        if (!sourceMat) {
          const setFaceMatch = /^(.+)_([0-5])$/.exec(matKey);
          if (setFaceMatch) {
            const setKey = setFaceMatch[1];
            const setFaceIdx = parseInt(setFaceMatch[2], 10);
            const setMaterials = this.materials[setKey];
            if (Array.isArray(setMaterials)) {
              sourceMat = setMaterials[setFaceIdx] || null;
            }
          }
        }
      }

      if (sourceMat) {
        const matConfig = {
          map: sourceMat.map || null,
          color: sourceMat.color || 0xFFFFFF,
          transparent: sourceMat.transparent || false,
          opacity: sourceMat.opacity !== undefined ? sourceMat.opacity : 1,
          side: sourceMat.side !== undefined ? sourceMat.side : THREE.FrontSide,
          depthWrite: sourceMat.depthWrite !== undefined ? sourceMat.depthWrite : true,
        };
        if (sourceMat.alphaTest !== undefined) {
          matConfig.alphaTest = sourceMat.alphaTest;
        }

        materials.push(new THREE.MeshLambertMaterial(matConfig));
        faceRects[i] = sourceMat.userData && sourceMat.userData.atlasRect
          ? sourceMat.userData.atlasRect
          : null;
      } else {
        materials.push(new THREE.MeshLambertMaterial({ color: 0xFFFFFF }));
      }
    }

    this._applyAtlasFaceUVs(geometry, faceRects);
    
    this.mesh = new THREE.Mesh(geometry, materials);
    this.mesh.position.copy(this.position);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }



  startPickupAnimation(targetPosition) {
    this.isBeingPickedUp = true;
    this.pickupStart = this.position.clone(); // Save starting position
    this.pickupTarget = targetPosition.clone();
    this.pickupElapsed = 0;
    this.velocity.set(0, 0, 0); // Stop physics movement during pickup
  }

  update(dt, gravity = 10, cm = null) {
    if (!this.mesh) return;

    this.age += dt;
    this.pickupDelay = Math.max(0, this.pickupDelay - dt);
    
    // Handle pickup animation
    if (this.isBeingPickedUp) {
      this.pickupElapsed += dt;
      const progress = Math.min(1, this.pickupElapsed / this.pickupDuration);
      
      // Ease-out cubic interpolation for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate position from start toward target
      this.position.lerpVectors(this.pickupStart, this.pickupTarget, easeProgress);
      
      // Scale down as it moves
      const scale = 1 - (easeProgress * 0.7); // shrink to 30%
      this.mesh.scale.set(scale, scale, scale);
      
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y += dt * 8; // Spin faster during pickup
      
      // Return true when animation is done
      return progress >= 1;

    }

    // Pause drop simulation when its chunk is unloaded so items persist when you return.
    if (cm && typeof cm.isChunkLoadedAtWorld === 'function') {
      const hostChunkLoaded = cm.isChunkLoadedAtWorld(this.position.x, this.position.z);
      if (!hostChunkLoaded) {
        this.mesh.visible = false;
        return false;
      }
      this.mesh.visible = true;
    }

    // Apply gravity if not on ground
    if (!this.onGround) {
      this.velocity.y -= gravity * dt;
    }

    // Simple collision: just check for ground/ceiling
    const itemRadius = 0.125;
    const newPos = this.position.clone().addScaledVector(this.velocity, dt);

    if (cm) {
      // Check block below for ground collision
      const blockBelowId = cm.getBlockAtWorld(newPos.x, newPos.y - itemRadius - 0.1, newPos.z, false, false);
      
      if (
        blockBelowId !== undefined &&
        !isBlockPassable(blockBelowId) &&
        newPos.y - itemRadius <= Math.ceil(newPos.y - itemRadius - 0.1)
      ) {
        // Hit ground
        const groundY = Math.floor(newPos.y - itemRadius - 0.1) + 1;
        newPos.y = groundY + itemRadius;
        this.velocity.y = 0;
        this.velocity.x *= 0.95;
        this.velocity.z *= 0.95;
        this.onGround = true;
      } else {
        this.onGround = false;
      }

      // Check block above for ceiling collision
      const blockAboveId = cm.getBlockAtWorld(newPos.x, newPos.y + itemRadius + 0.1, newPos.z, false, false);
      if (blockAboveId !== undefined && !isBlockPassable(blockAboveId) && this.velocity.y > 0) {
        // Hit ceiling
        this.velocity.y = 0;
      }

      // Simple side collision - bounce items off walls
      const checkRadius = itemRadius + 0.1;
      const blockLeftId = cm.getBlockAtWorld(newPos.x - checkRadius, newPos.y, newPos.z, false, false);
      const blockRightId = cm.getBlockAtWorld(newPos.x + checkRadius, newPos.y, newPos.z, false, false);
      const blockFrontId = cm.getBlockAtWorld(newPos.x, newPos.y, newPos.z - checkRadius, false, false);
      const blockBackId = cm.getBlockAtWorld(newPos.x, newPos.y, newPos.z + checkRadius, false, false);

      if (blockLeftId !== undefined && !isBlockPassable(blockLeftId)) {
        this.velocity.x = Math.abs(this.velocity.x) * 0.5;
      }
      if (blockRightId !== undefined && !isBlockPassable(blockRightId)) {
        this.velocity.x = -Math.abs(this.velocity.x) * 0.5;
      }
      if (blockFrontId !== undefined && !isBlockPassable(blockFrontId)) {
        this.velocity.z = Math.abs(this.velocity.z) * 0.5;
      }
      if (blockBackId !== undefined && !isBlockPassable(blockBackId)) {
        this.velocity.z = -Math.abs(this.velocity.z) * 0.5;
      }
    }

    this.position.copy(newPos);

    // Bobbing animation when on ground (only if not being picked up)
    if (!this.isBeingPickedUp) {
      if (this.onGround) {
        this.mesh.position.y = this.position.y + Math.sin(this.age * 2) * 0.05 + 0.15;
        this.mesh.rotation.y += dt * 0.6;
      } else {
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y += dt * 4;
      }
    }

    // Air resistance
    this.velocity.x *= 0.98;
    this.velocity.z *= 0.98;
    
    return false; // Animation not in progress
  }

  canBePickedUp() {
    return !this.isBeingPickedUp && this.pickupDelay <= 0 && this.age < this.lifespan;
  }

  hasExpired() {
    return this.age >= this.lifespan;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) {
        // Handle both single material and array of materials
        if (Array.isArray(this.mesh.material)) {
          this.mesh.material.forEach(mat => mat.dispose());
        } else {
          this.mesh.material.dispose();
        }
      }
      this.mesh = null;
    }
  }
}

export class ItemDropManager {
  constructor(scene, cm = null, materials = null) {
    this.scene = scene;
    this.cm = cm;
    this.materials = materials;
    this.drops = [];
  }

  addDrop(x, y, z, blockId) {
    const dropBlockId = getBlockDropId(blockId);
    if (dropBlockId === null) return null;
    const drop = new ItemDrop(x, y, z, dropBlockId, this.scene, this.materials);
    this.drops.push(drop);
    return drop;
  }

  update(dt) {
    // Update all drops and remove expired ones
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      const pickupComplete = drop.update(dt, 10, this.cm);

      if (pickupComplete) {
        // Pickup animation finished
        drop.dispose();
        this.drops.splice(i, 1);
      } else if (drop.hasExpired()) {
        drop.dispose();
        this.drops.splice(i, 1);
      }
    }
  }

  getDropsNear(position, radius = 1.5) {
    const nearby = [];
    for (const drop of this.drops) {
      if (drop.canBePickedUp()) {
        const dist = position.distanceTo(drop.position);
        if (dist < radius) {
          nearby.push(drop);
        }
      }
    }
    return nearby;
  }
  
  startPickup(drop, targetPosition) {
    if (drop && drop.canBePickedUp()) {
      drop.startPickupAnimation(targetPosition);
    }
  }

  clear() {
    for (const drop of this.drops) {
      drop.dispose();
    }
    this.drops = [];
  }

  dispose() {
    this.clear();
  }
}
