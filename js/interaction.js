import * as THREE from './three.module.js';
import { PLAYER, CAMERA } from './config.js';

// Initialize mouse interactions for mining (left click) and placing (right click)
export function initInteraction(cm, camera, domElement, opts = {}) {
  const reach = opts.reach ?? 6.0;
  let placeBlockId = opts.placeBlockId ?? 2; // default to dirt
  const mouseButtons = { left: false, right: false };
  let placeInterval = null;
  const onContextMenu = (e) => e.preventDefault();
  const onMouseDown = (evt) => {
    if (evt.button === 0) {
      performAction(evt);
    } else if (evt.button === 2) {
      performAction(evt);
      mouseButtons.right = true;
      startPlacing();
    }
  };
  const onMouseUp = (evt) => {
    if (evt.button === 2) {
      mouseButtons.right = false;
      stopPlacing();
    }
  };

  domElement.addEventListener('contextmenu', onContextMenu);

  function performAction(evt) {
    if (document.pointerLockElement !== domElement) return;
    const button = evt.button; // 0 = left (break), 2 = right (place)
    if (button !== 0 && button !== 2) return;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const step = 0.1;
    const maxT = reach;
    const prev = origin.clone();

    for (let t = 0; t <= maxT; t += step) {
      const p = origin.clone().addScaledVector(dir, t);
      const bid = cm.getBlockAtWorld(p.x, p.y, p.z);

      if (bid !== 0) {
        const hx = Math.floor(p.x);
        const hy = Math.floor(p.y);
        const hz = Math.floor(p.z);

        if (button === 0 && bid !== 14) {
          // Break block
          cm.setBlockAtWorld(hx + 0.5, hy + 0.5, hz + 0.5, 0);
        } else if (button === 2) {

            const px = Math.floor(prev.x);
            const py = Math.floor(prev.y);
            const pz = Math.floor(prev.z);
            const camPos = origin;

            // Only allow placement if the hit is on a single axis (not edge/corner)
            const dx = Math.abs(Math.floor(p.x) - px);
            const dy = Math.abs(Math.floor(p.y) - py);
            const dz = Math.abs(Math.floor(p.z) - pz);
            const axisHits = (dx > 0 ? 1 : 0) + (dy > 0 ? 1 : 0) + (dz > 0 ? 1 : 0);
            if (axisHits !== 1) {
              return;
            }

            let playerAABB;
            if (typeof opts.getPlayerAABB === 'function') {
              // Expect { minX,maxX,minY,maxY,minZ,maxZ }
              playerAABB = opts.getPlayerAABB();
            } else {
              const playerHeight = PLAYER.height;
              const playerWidth = PLAYER.width;
              const playerCenterY = camPos.y - (playerHeight * CAMERA.eyeHeight);
              const halfH = playerHeight / 2;
              const rad = playerWidth / 2;
              playerAABB = {
                minX: camPos.x - rad,
                maxX: camPos.x + rad,
                minY: playerCenterY - halfH,
                maxY: playerCenterY + halfH,
                minZ: camPos.z - rad,
                maxZ: camPos.z + rad
              };
            }

            const blockMinX = px;
            const blockMaxX = px + 1;
            const blockMinY = py;
            const blockMaxY = py + 1;
            const blockMinZ = pz;
            const blockMaxZ = pz + 1;

            const intersects = !(
              blockMaxX <= playerAABB.minX || blockMinX >= playerAABB.maxX ||
              blockMaxY <= playerAABB.minY || blockMinY >= playerAABB.maxY ||
              blockMaxZ <= playerAABB.minZ || blockMinZ >= playerAABB.maxZ
            );

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

  function startPlacing() {
    if (placeInterval) return;
    placeInterval = setInterval(() => {
      if (mouseButtons.right && document.pointerLockElement === domElement) {
        performAction({ button: 2 });
      }
    }, 200);
  }

  function stopPlacing() {
    if (placeInterval) {
      clearInterval(placeInterval);
      placeInterval = null;
    }
  }

  domElement.addEventListener('mousedown', onMouseDown);
  domElement.addEventListener('mouseup', onMouseUp);

  return {
    setPlaceBlock(id) { placeBlockId = id; },
    dispose() {
      stopPlacing();
      domElement.removeEventListener('contextmenu', onContextMenu);
      domElement.removeEventListener('mousedown', onMouseDown);
      domElement.removeEventListener('mouseup', onMouseUp);
    }
  };
}

export default initInteraction;
