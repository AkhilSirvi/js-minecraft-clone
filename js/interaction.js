import * as THREE from './three.module.js';
import { isBlockPassable } from './chunkManager.js';
import { PLAYER, CAMERA } from './config.js';

// Initialize mouse interactions for mining (left click) and placing (right click)
export function initInteraction(cm, camera, domElement, opts = {}) {
  const reach = opts.reach ?? 6.0;
  let placeBlockId = opts.placeBlockId ?? 2; // default to dirt

  // prevent context menu on right click
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  function performAction(evt) {
    // Require pointer lock for interactions (consistent with mouse look)
    if (document.pointerLockElement !== domElement) return;

    const button = evt.button; // 0 = left (break), 2 = right (place)
    if (button !== 0 && button !== 2) return;

    // Ray-march from camera position along view direction
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const step = 0.1;
    const maxT = reach;
    const prev = origin.clone();

    for (let t = 0; t <= maxT; t += step) {
      const p = origin.clone().addScaledVector(dir, t);
      const bid = cm.getBlockAtWorld(p.x, p.y, p.z);

      if (bid !== 0 && bid !== 14) {
        // Hit a solid block at world position p
        const hx = Math.floor(p.x);
        const hy = Math.floor(p.y);
        const hz = Math.floor(p.z);

        if (button === 0) {
          // Break block
          cm.setBlockAtWorld(hx + 0.5, hy + 0.5, hz + 0.5, 0);
        } else if (button === 2) {
          // Place block at previous empty position (but prevent placing inside player)
          const px = Math.floor(prev.x);
          const py = Math.floor(prev.y);
          const pz = Math.floor(prev.z);

          // Check if the block would intersect the player's bounding box
          // Camera world position corresponds to player's eye position
          const camPos = origin; // already obtained above
          const playerHeight = PLAYER.height;
          const playerWidth = PLAYER.width;
          const playerCenterY = camPos.y - (playerHeight * CAMERA.eyeHeight);
          const halfH = playerHeight / 2;
          const rad = playerWidth / 2;

          const blockMinX = px;
          const blockMaxX = px + 1;
          const blockMinY = py;
          const blockMaxY = py + 1;
          const blockMinZ = pz;
          const blockMaxZ = pz + 1;

          const playerMinX = camPos.x - rad;
          const playerMaxX = camPos.x + rad;
          const playerMinY = playerCenterY - halfH;
          const playerMaxY = playerCenterY + halfH;
          const playerMinZ = camPos.z - rad;
          const playerMaxZ = camPos.z + rad;

          const intersects = !(blockMaxX <= playerMinX || blockMinX >= playerMaxX ||
                               blockMaxY <= playerMinY || blockMinY >= playerMaxY ||
                               blockMaxZ <= playerMinZ || blockMinZ >= playerMaxZ);

          if (intersects) {
            // Don't place block where it would intersect the player
            return;
          }

          cm.setBlockAtWorld(px + 0.5, py + 0.5, pz + 0.5, placeBlockId);
        }
        return;
      }
      prev.copy(p);
    }
  }

  domElement.addEventListener('mousedown', performAction);

  return {
    setPlaceBlock(id) { placeBlockId = id; },
    dispose() {
      domElement.removeEventListener('mousedown', performAction);
    }
  };
}

export default initInteraction;
