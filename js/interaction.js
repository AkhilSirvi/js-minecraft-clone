import * as THREE from './three.module.js';
import { PLAYER, CAMERA } from './config.js';
import { voxelRaycast } from './voxelRaycast.js';
import { BLOCK, isBlockBreakable } from '../data/blocks.js';

export function initInteraction(cm, camera, domElement, opts = {}) {
  const reach = PLAYER.blockreach;
  let placeBlockId = opts.placeBlockId ?? 2;
  let getPlaceBlockId = opts.getPlaceBlockId || null;
  let onPlaceBlock = opts.onPlaceBlock || null;
  let shouldDisableInput = opts.shouldDisableInput || null;
  const bindings = opts.bindings || {};
  const attackBinding = opts.attackBinding || bindings.attack || 'Mouse0';
  const placeBinding = opts.placeBinding || bindings.place || 'Mouse2';
  const mouseButtons = { left: false, right: false };
  let placeInterval = null;

  function isMouseBinding(binding) {
    return typeof binding === 'string' && binding.startsWith('Mouse');
  }

  function mouseBindingToButton(binding) {
    if (!isMouseBinding(binding)) return null;
    const button = Number(binding.slice(5));
    return Number.isInteger(button) ? button : null;
  }

  function eventMatchesBinding(evt, binding) {
    if (!binding) return false;
    if (isMouseBinding(binding)) {
      return typeof evt.button === 'number' && evt.button === mouseBindingToButton(binding);
    }
    return evt.code === binding;
  }

  function startAttack() {
    if (mouseButtons.left) return;
    mouseButtons.left = true;
    if (opts.blockBreaker) opts.blockBreaker._mouseDown = true;
    if (opts.blockBreaker && typeof opts.blockBreaker.startBreaking === 'function') {
      opts.blockBreaker.startBreaking();
    } else {
      performAction({ button: 0 });
    }
  }

  function stopAttack() {
    mouseButtons.left = false;
    if (opts.blockBreaker) opts.blockBreaker._mouseDown = false;
    if (opts.blockBreaker && typeof opts.blockBreaker.stopBreaking === 'function') {
      opts.blockBreaker.stopBreaking();
    }
  }

  function startPlace() {
    if (mouseButtons.right) return;
    mouseButtons.right = true;
    performAction({ button: 2 });
    startPlacing();
  }

  function stopPlace() {
    mouseButtons.right = false;
    stopPlacing();
  }

  const onContextMenu = (e) => e.preventDefault();
  const onMouseDown = (evt) => {
    if (shouldDisableInput && shouldDisableInput()) return;
    if (eventMatchesBinding(evt, attackBinding)) {
      startAttack();
    } else if (eventMatchesBinding(evt, placeBinding)) {
      startPlace();
    }
  };
  const onMouseUp = (evt) => {
    if (eventMatchesBinding(evt, attackBinding)) {
      stopAttack();
    } else if (eventMatchesBinding(evt, placeBinding)) {
      stopPlace();
    }
  };

  const onKeyDown = (evt) => {
    if (shouldDisableInput && shouldDisableInput()) return;
    if (eventMatchesBinding(evt, attackBinding)) {
      evt.preventDefault();
      startAttack();
    } else if (eventMatchesBinding(evt, placeBinding)) {
      evt.preventDefault();
      startPlace();
    }
  };

  const onKeyUp = (evt) => {
    if (eventMatchesBinding(evt, attackBinding)) {
      evt.preventDefault();
      stopAttack();
    } else if (eventMatchesBinding(evt, placeBinding)) {
      evt.preventDefault();
      stopPlace();
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
    const hit = voxelRaycast(cm, origin, dir, reach);
    if (!hit) return;

    if (button === 0 && isBlockBreakable(hit.bid)) {
      if (opts.blockBreaker) {
        return;
      }
      cm.setBlockAtWorld(hit.bx + 0.5, hit.by + 0.5, hit.bz + 0.5, BLOCK.AIR);
    } else if (button === 2) {
      const px = hit.prev.x;
      const py = hit.prev.y;
      const pz = hit.prev.z;
      const camPos = origin;

      // Only allow placement if the hit is on a single axis (not edge/corner)
      const dx = Math.abs(hit.bx - px);
      const dy = Math.abs(hit.by - py);
      const dz = Math.abs(hit.bz - pz);
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

      // Get block ID to place (from callback if available, otherwise use default)
      const blockToPlace = getPlaceBlockId ? getPlaceBlockId() : placeBlockId;
      if (blockToPlace && blockToPlace > BLOCK.AIR) {
        cm.setBlockAtWorld(px + 0.5, py + 0.5, pz + 0.5, blockToPlace);
        // Call callback when block is placed
        if (onPlaceBlock && typeof onPlaceBlock === 'function') {
          onPlaceBlock(blockToPlace, { x: px, y: py, z: pz });
        }
      }
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
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return {
    dispose() {
      stopPlacing();
      domElement.removeEventListener('contextmenu', onContextMenu);
      domElement.removeEventListener('mousedown', onMouseDown);
      domElement.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    }
  };
}
