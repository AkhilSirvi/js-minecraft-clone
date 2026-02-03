import * as THREE from './three.module.js';
import { generateChunk, CHUNK_SIZE, HEIGHT, MIN_Y, getBiomeAtWorld } from './chunkGen.js';
import ChunkManager, { isBlockPassable } from './chunkManager.js';
import { initInteraction } from './interaction.js';
import BlockBreaker from './blockBreaker.js';
import createDebugOverlay from './debugOverlay.js';
import { SEED, PLAYER, PHYSICS, RENDER, DAY_NIGHT, CAMERA, DEBUG } from './config.js';
import WaterPhysics from './waterPhysics.js';

// Game settings (modifiable via settings menu)
const gameSettings = {
  viewDistance: RENDER.viewDistance,
  fov: RENDER.fov,
  showFPS: RENDER.showFPS,
  mouseSensitivity: CAMERA.mouseSensitivity,
  volume: 1.0
};

// Load saved settings from localStorage
function loadSettings() {
  try {
    const saved = localStorage.getItem('minecraftjs_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(gameSettings, parsed);
    }
  } catch (e) {
    console.warn('Could not load settings:', e);
  }
}

// Save settings to localStorage
function saveSettings() {
  try {
    localStorage.setItem('minecraftjs_settings', JSON.stringify(gameSettings));
  } catch (e) {
    console.warn('Could not save settings:', e);
  }
}

// Menu handling
let gameStarted = false;

function initMenu() {
  const mainMenu = document.getElementById('main-menu');
  const playButton = document.getElementById('play-button');
  const settingsButton = document.getElementById('settings-button');
  const settingsMenu = document.getElementById('settings-menu');
  const settingsBack = document.getElementById('settings-back');
  const settingsSave = document.getElementById('settings-save');
  const loadingText = document.getElementById('loading-text');
  const crosshair = document.getElementById('crosshair');

  // Settings inputs
  const viewDistanceInput = document.getElementById('setting-view-distance');
  const viewDistanceValue = document.getElementById('view-distance-value');
  const fovInput = document.getElementById('setting-fov');
  const fovValue = document.getElementById('fov-value');
  const showFpsInput = document.getElementById('setting-show-fps');
  const sensitivityInput = document.getElementById('setting-sensitivity');
  const sensitivityValue = document.getElementById('sensitivity-value');
  const volumeInput = document.getElementById('setting-volume');
  const volumeValue = document.getElementById('volume-value');

  // Load saved settings
  loadSettings();

  // Apply loaded settings to UI
  function updateSettingsUI() {
    viewDistanceInput.value = gameSettings.viewDistance;
    viewDistanceValue.textContent = gameSettings.viewDistance;
    fovInput.value = gameSettings.fov;
    fovValue.textContent = gameSettings.fov + '°';
    showFpsInput.checked = gameSettings.showFPS;
    // Convert sensitivity back to slider value (0.001-0.004 -> 1-20)
    const sensSlider = Math.round((gameSettings.mouseSensitivity - 0.0005) / 0.00025);
    sensitivityInput.value = Math.max(1, Math.min(20, sensSlider));
    sensitivityValue.textContent = sensitivityInput.value;
    volumeInput.value = Math.round(gameSettings.volume * 100);
    volumeValue.textContent = volumeInput.value + '%';
  }

  updateSettingsUI();

  // Hide crosshair until game starts
  if (crosshair) crosshair.style.display = 'none';

  // Settings input handlers
  viewDistanceInput.addEventListener('input', () => {
    viewDistanceValue.textContent = viewDistanceInput.value;
  });

  fovInput.addEventListener('input', () => {
    fovValue.textContent = fovInput.value + '°';
  });

  sensitivityInput.addEventListener('input', () => {
    sensitivityValue.textContent = sensitivityInput.value;
  });

  volumeInput.addEventListener('input', () => {
    volumeValue.textContent = volumeInput.value + '%';
  });

  // Open settings
  settingsButton.addEventListener('click', () => {
    updateSettingsUI();
    settingsMenu.classList.remove('hidden');
  });

  // Close settings without saving
  settingsBack.addEventListener('click', () => {
    settingsMenu.classList.add('hidden');
    updateSettingsUI(); // Reset to saved values
  });

  // Save settings
  settingsSave.addEventListener('click', () => {
    gameSettings.viewDistance = parseInt(viewDistanceInput.value);
    gameSettings.fov = parseInt(fovInput.value);
    gameSettings.showFPS = showFpsInput.checked;
    // Convert slider (1-20) to sensitivity (0.00075-0.005)
    gameSettings.mouseSensitivity = 0.0005 + (parseInt(sensitivityInput.value) * 0.00025);
    gameSettings.volume = parseInt(volumeInput.value) / 100;
    
    saveSettings();
    settingsMenu.classList.add('hidden');
  });

  // Play button
  playButton.addEventListener('click', () => {
    if (gameStarted) return;
    gameStarted = true;
    
    // Show loading indicator
    playButton.disabled = true;
    playButton.textContent = 'Loading...';
    loadingText.classList.add('visible');

    // Small delay to show loading state, then start game
    setTimeout(() => {
      mainMenu.classList.add('hidden');
      if (crosshair) crosshair.style.display = '';
      main();
    }, 100);
  });
}

function main() {
  if (DEBUG.showStartupInfo) console.log('Initializing renderer and scene');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DAY_NIGHT.skyDayColor);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.position.set(100, 200, 100);
  scene.add(sunLight);

  const moonLight = new THREE.DirectionalLight(0x88aaff, 0.2);
  moonLight.position.set(-100, -200, -100);
  scene.add(moonLight);

  // visual sun and moon
  const sunMesh = new THREE.Mesh(new THREE.BoxGeometry(1, DAY_NIGHT.sunSize, DAY_NIGHT.sunSize), new THREE.MeshBasicMaterial({ color: DAY_NIGHT.sunColor }));
  const moonMesh = new THREE.Mesh(new THREE.BoxGeometry(1, DAY_NIGHT.moonSize, DAY_NIGHT.moonSize), new THREE.MeshBasicMaterial({ color: DAY_NIGHT.moonColor }));
  scene.add(sunMesh);
  scene.add(moonMesh);

  // Day-night cycle parameters (from config)
  const CYCLE_LENGTH = DAY_NIGHT.cycleLength;
  const DAY_LENGTH = DAY_NIGHT.dayLength;
  const TRANSITION_TOTAL = DAY_NIGHT.transitionLength;
  const DUSK_LENGTH = TRANSITION_TOTAL / 2;
  const DAWN_LENGTH = TRANSITION_TOTAL / 2;
  const NIGHT_LENGTH = DAY_NIGHT.nightLength;

  const skyDay = new THREE.Color(DAY_NIGHT.skyDayColor);
  const skyNight = new THREE.Color(DAY_NIGHT.skyNightColor);
  const skyColor = new THREE.Color(); // reusable for lerping

  const cycleStart = performance.now() / 1000  - 320; // seconds

  // Reusable vectors for sun/moon positioning (avoid allocations in render loop)
  const sunPos = new THREE.Vector3();
  const moonPos = new THREE.Vector3();

  // FPS counter
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let currentFPS = 0;
  let fpsDisplay = null;

  const blockSize = 1; // blocks per unit
  const cm = new ChunkManager(scene, { seed: SEED, blockSize, viewDistance: gameSettings.viewDistance });
  if (DEBUG.showStartupInfo) console.log('Creating ChunkManager (seed, blockSize, viewDistance)=', SEED, blockSize, gameSettings.viewDistance);
  if (DEBUG.showStartupInfo) console.log('Initial chunk load around origin starting');
  if (DEBUG.showStartupInfo) console.log('Initial chunk load completed');

  // Initialize water physics system
  let waterPhysics = null;
  try {
    waterPhysics = new WaterPhysics(cm, scene);
  } catch (error) {
    console.error('Failed to initialize water physics:', error);
    console.error('Error stack:', error.stack);
  }

  // Debug overlay (F3)
  const debugOverlay = createDebugOverlay();
  let showDebug = false;
  let lastDebugUpdate = 0;
  const debugUpdateInterval = 250; // Update debug info 4 times per second
  window.addEventListener('keydown', (e) => {if (e.code === 'F3') { debugOverlay.toggle(); showDebug = !showDebug; }});

  // reusable raycaster and temp vectors to avoid per-frame allocations
  const raycaster = new THREE.Raycaster();
  const tempLocalPoint = new THREE.Vector3();
  const tempWorldPoint = new THREE.Vector3();
  const tempVec2 = new THREE.Vector2();

  // Highlight box for block the player is looking at
  const highlightMaterial = new THREE.LineBasicMaterial({color: 0x000000, depthTest: true, transparent: true, opacity: 0.6});
  const highlightGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.00, 1.00, 1.00));
  const highlightBox = new THREE.LineSegments(highlightGeometry, highlightMaterial);
  highlightBox.renderOrder = 9999;
  highlightBox.visible = false;
  scene.add(highlightBox);
  
  // helper: test whether player's rectangular box at given world x,z and center y would intersect any solid block
  function isPlayerPositionFree(testX, testY, testZ, height = null) {
    // Player as axis-aligned rectangular box from bottomY to topY with half-extents
    const bs = blockSize;
    const checkHeight = height !== null ? height : currentPlayerHeight;
    const halfHeight = checkHeight / 2;
    const bottomY = testY - halfHeight;
    const topY = testY + halfHeight;
    // Player AABB bounds
    const playerMinX = testX - playerHalfWidth;
    const playerMaxX = testX + playerHalfWidth;
    const playerMinZ = testZ - playerHalfDepth;
    const playerMaxZ = testZ + playerHalfDepth;
    // Get block range that could intersect (shrink slightly to avoid floating point edge issues)
    const epsilon = 0.001;
    const minBlockX = Math.floor((playerMinX + epsilon) / bs);
    const maxBlockX = Math.floor((playerMaxX - epsilon) / bs);
    const minBlockZ = Math.floor((playerMinZ + epsilon) / bs);
    const maxBlockZ = Math.floor((playerMaxZ - epsilon) / bs);
    const minBlockY = Math.floor((bottomY + epsilon - MIN_Y * bs) / bs) + MIN_Y;
    const maxBlockY = Math.floor((topY - epsilon - MIN_Y * bs) / bs) + MIN_Y;
    for (let bx = minBlockX; bx <= maxBlockX; bx++) {
      for (let bz = minBlockZ; bz <= maxBlockZ; bz++) {
        for (let by = minBlockY; by <= maxBlockY; by++) {
          const id = cm.getBlockAtWorld(bx * bs + 0.5 * bs, by * bs + 0.5 * bs, bz * bs + 0.5 * bs);
          if (!isBlockPassable(id)) return false; // blocked by solid block
        }
      }
    }
    return true;
  }

  // Push player out of solid blocks if stuck
  function resolvePlayerCollision() {
    const bs = blockSize; const maxPushDist = 2.0; const pushStep = 0.001;
    if (isPlayerPositionFree(player.position.x, player.position.y, player.position.z)) {return;}
    for (let dy = pushStep; dy <= maxPushDist; dy += pushStep) {
      if (isPlayerPositionFree(player.position.x, player.position.y + dy, player.position.z)) {player.position.y += dy; velY = 0; return;}
    }
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1],[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let dist = pushStep; dist <= maxPushDist; dist += pushStep) {
      for (const [dx, dz] of directions) {
        const len = Math.hypot(dx, dz);
        const pushX = player.position.x + (dx / len) * dist;
        const pushZ = player.position.z + (dz / len) * dist;
        if (isPlayerPositionFree(pushX, player.position.y, pushZ)) { player.position.x = pushX; player.position.z = pushZ; velocity.x = 0; velocity.z = 0; return;}
      }
    }
    for (let dy = pushStep; dy <= maxPushDist; dy += pushStep) {
      for (let dist = pushStep; dist <= maxPushDist; dist += pushStep) {
        for (const [dx, dz] of directions) {
          const len = Math.hypot(dx, dz);
          const pushX = player.position.x + (dx / len) * dist;
          const pushZ = player.position.z + (dz / len) * dist;
          if (isPlayerPositionFree(pushX, player.position.y + dy, pushZ)) {
            player.position.x = pushX; player.position.y += dy; player.position.z = pushZ; velocity.x = 0; velocity.z = 0; velY = 0; return;
          }
        }
      }
    }
  }

  // compute spawn position on top of terrain
  const spawnWorldX = PLAYER.spawnX, spawnWorldZ = PLAYER.spawnZ;
  let spawnY = cm.getTopAtWorld(spawnWorldX, spawnWorldZ);
  if (!isFinite(spawnY)) spawnY = (MIN_Y + 1) * blockSize;
  const spawnX = spawnWorldX;
  const spawnZ = spawnWorldZ;
  const camera = new THREE.PerspectiveCamera(gameSettings.fov, window.innerWidth / window.innerHeight, RENDER.nearClip, RENDER.farClip);
  let defaultFov = gameSettings.fov;
  let sprintFov = defaultFov + 15; // Increase FOV by 15 when sprinting
  let targetFov = defaultFov;
  let fovLerpSpeed = 0.15;
  const playerWidth = blockSize * PLAYER.width;
  const playerHeight = blockSize * PLAYER.height;
  // Player hitbox half-extents for rectangular collision (width x height x depth)
  const playerHalfWidth = playerWidth / 2;  // X half-extent
  const playerHalfDepth = playerWidth / 2;  // Z half-extent
  // third-person / first-person toggle state
  let isThirdPerson = false;
  const fpCameraLocalPos = new THREE.Vector3(0, 0, 0);
  const tpCameraLocalPos = new THREE.Vector3(0, 0, CAMERA.thirdPersonDistance);
  const player = new THREE.Object3D();

  const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const playerGeometry = new THREE.BoxGeometry(playerWidth, playerHeight, playerWidth);
  const playerModel = new THREE.Mesh(playerGeometry, playerMaterial);
  playerModel.castShadow = true;
  playerModel.receiveShadow = true;
  // center the model on player's origin (player.position is center)
  playerModel.position.set(0, 0, 0);
  playerModel.visible = false;
  player.add(playerModel);

  function toggleThirdPerson() {
    isThirdPerson = !isThirdPerson;
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
    playerModel.visible = isThirdPerson;
    if (isThirdPerson) {
      camera.position.copy(tpCameraLocalPos);
    } else {
      camera.position.copy(fpCameraLocalPos);
      camera.rotation.set(0, 0, 0);
    }
  }

  // Player object: yaw rotates this, pitch rotates the camera child.
  player.position.set(spawnX, spawnY + playerHeight / 2, spawnZ);
  scene.add(player);

  const pitchObject = new THREE.Object3D();
  pitchObject.position.y = playerHeight * CAMERA.eyeHeight; // camera near top of player's head
  pitchObject.add(camera);
  player.add(pitchObject);

  // Keep third-person camera from clipping through world blocks.
  function updateThirdPersonCameraCollision() {
    if (!isThirdPerson) return;
    // head/eye world position
    const headWorld = new THREE.Vector3(player.position.x, player.position.y + currentPlayerHeight * CAMERA.eyeHeight, player.position.z);
    // desired camera local position relative to pitchObject
    const desiredLocal = tpCameraLocalPos.clone();
    // convert to world space (accounts for player yaw and camera pitch)
    const desiredWorld = desiredLocal.clone();
    pitchObject.localToWorld(desiredWorld);

    const dir = desiredWorld.clone().sub(headWorld);
    const dist = dir.length();
    if (dist <= 0.0001) { camera.position.copy(tpCameraLocalPos); return; }
    dir.normalize();

    const step = 0.1; // meters per sample
    let lastFree = headWorld.clone();
    let blocked = false;
    for (let d = 0; d <= dist; d += step) {
      const sx = headWorld.x + dir.x * d;
      const sy = headWorld.y + dir.y * d;
      const sz = headWorld.z + dir.z * d;
      const id = cm.getBlockAtWorld(sx, sy, sz);
      if (!isBlockPassable(id)) { blocked = true; break; }
      lastFree.set(sx, sy, sz);
    }

    // Ensure camera keeps a small offset from blocking geometry and from the player's head
    const MIN_DIST = 0.5;
    const BACKOFF = 0.25;
    let finalWorld = desiredWorld;
    if (blocked) {
      const toLast = lastFree.clone().sub(headWorld);
      const len = toLast.length();
      if (len < MIN_DIST) {
        finalWorld = headWorld.clone().add(dir.clone().multiplyScalar(MIN_DIST));
      } else {
        finalWorld = lastFree.clone().add(dir.clone().multiplyScalar(-BACKOFF));
      }
    }

    // Convert selected world position back into pitchObject-local coordinates and apply
    const newLocal = finalWorld.clone();
    pitchObject.worldToLocal(newLocal);
    camera.position.copy(newLocal);
  }

  function updateFirstPersonCameraCollision() {
    if (isThirdPerson) return;
    const eyeWorldY = player.position.y + pitchObject.position.y;
    const eyeWorldX = player.position.x;
    const eyeWorldZ = player.position.z;
    
    // Get camera look direction in world space
    const lookDir = new THREE.Vector3(0, 0, -1);
    camera.getWorldDirection(lookDir);
    
    const nearClipDist = 0.25; // check distance (more than near clip of 0.1)
    const checkX = eyeWorldX + lookDir.x * nearClipDist;
    const checkY = eyeWorldY + lookDir.y * nearClipDist;
    const checkZ = eyeWorldZ + lookDir.z * nearClipDist;
    const eyeBlockId = cm.getBlockAtWorld(eyeWorldX, eyeWorldY, eyeWorldZ);
    const lookBlockId = cm.getBlockAtWorld(checkX, checkY, checkZ);
    const aboveBlockId = cm.getBlockAtWorld(eyeWorldX, eyeWorldY + 0.25, eyeWorldZ);
    const eyeBlocked = !isBlockPassable(eyeBlockId);
    const lookBlocked = !isBlockPassable(lookBlockId);
    const aboveBlocked = !isBlockPassable(aboveBlockId);
    
    if (!eyeBlocked && !lookBlocked && !aboveBlocked) {
      camera.position.set(0, 0, 0);
      return;
    }
    
    const bs = blockSize;
    
    if (eyeBlocked || aboveBlocked) {
      const testY = aboveBlocked ? eyeWorldY + 0.25 : eyeWorldY;
      const blockY = Math.floor((testY - MIN_Y * bs) / bs) + MIN_Y;
      const blockBottomY = blockY * bs;
      const safeEyeY = blockBottomY - 0.12;
      const pushDownAmount = eyeWorldY - safeEyeY;
      
      if (pushDownAmount > 0 && pushDownAmount < 1.0) {
        camera.position.y = -pushDownAmount;
      } else {
        camera.position.set(0, 0, 0);
      }
    } else if (lookBlocked) {
      let safeOffset = 0;
      for (let d = nearClipDist; d >= 0; d -= 0.02) {
        const testX = eyeWorldX + lookDir.x * d;
        const testY = eyeWorldY + lookDir.y * d;
        const testZ = eyeWorldZ + lookDir.z * d;
        const testBlockId = cm.getBlockAtWorld(testX, testY, testZ);
        if (isBlockPassable(testBlockId)) {
          safeOffset = nearClipDist - d;
          break;
        }
      }
      if (safeOffset > 0) {
        camera.position.z = safeOffset;
      }
    }
  }

  window.teleport = function(x, y, z, opts = {}) {
    const nx = Number(x);
    const nz = Number(z);
    if (isNaN(nx) || isNaN(nz)) { console.error('teleport: invalid x or z'); return; }
    let ny;
    if (y === undefined || y === null || isNaN(Number(y))) {
      const top = cm.getTopAtWorld(nx, nz);
      ny = isFinite(top) ? top + currentPlayerHeight / 2 : (MIN_Y + 1) * blockSize + currentPlayerHeight / 2;
    } else {
      ny = Number(y);
    }
    const safe = opts.safe !== false;
    if (safe) {
      const maxUp = 100;
      let placed = false;
      for (let dy = 0; dy <= maxUp; dy++) {
        const testY = ny + dy;
        if (isPlayerPositionFree(nx, testY, nz)) {
          ny = testY;
          placed = true;
          break;
        }
      }
      if (!placed) console.warn('teleport: no free space found above target, placing at requested Y');
    }
    player.position.set(nx, ny, nz);
    velocity.set(0, 0, 0);
    velY = 0;
    onGround = false;
    cm.update(player.position.x, player.position.z);
    resolvePlayerCollision();
    console.log(`Teleported player to (${nx}, ${ny}, ${nz})`);
  };
  window.tp = window.teleport;
  
  // Expose waterPhysics to console for testing
  window.waterPhysics = waterPhysics;
  window.placeWater = (x, y, z) => {
    if (!waterPhysics) {
      console.error('Water physics not initialized');
      return null;
    }
    try {
      const waterBlock = waterPhysics.placeWater(x, y, z, true);
      console.log(`Water source placed at (${x}, ${y}, ${z})`);
      return waterBlock;
    } catch (error) {
      console.error('Error placing water:', error);
      return null;
    }
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true , alpha: false,powerPreference: "high-performance", stencil: false, depth: true, preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(DAY_NIGHT.skyDayColor, 1);
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.zIndex = '0';
  document.body.appendChild(renderer.domElement);
  if (DEBUG.showStartupInfo) console.log('Renderer initialized and appended to document');

  // Click to lock pointer for mouse look
  renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
  });

  function getFirstPersonRay() {
    const eyeY = player.position.y + pitchObject.position.y;
    const origin = new THREE.Vector3(player.position.x, eyeY, player.position.z);
    const pitch = pitchObject.rotation.x;
    const yaw = player.rotation.y;
    const dir = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch)
    );
    dir.normalize();
    
    return { origin, dir };
  }

  const blockBreaker = new BlockBreaker(cm, scene, camera, { 
    reach: PLAYER.blockreach,
    getFirstPersonRay
  });

  // Initialize interaction (mining/placing)
  const interaction = initInteraction(cm, camera, renderer.domElement, {
    placeBlockId: 2,
    reach: PLAYER.blockreach,
    blockBreaker,
    getFirstPersonRay,  // Use first-person perspective even in third-person mode
    // Provide current player AABB so interaction can respect crouch/height changes
    getPlayerAABB: () => ({
      minX: player.position.x - playerHalfWidth,
      maxX: player.position.x + playerHalfWidth,
      minY: player.position.y - currentPlayerHeight / 2,
      maxY: player.position.y + currentPlayerHeight / 2,
      minZ: player.position.z - playerHalfDepth,
      maxZ: player.position.z + playerHalfDepth
    })
  });

  // Movement state
  const move = { forward: false, backward: false, left: false, right: false, sprint: false, crouch: false };
  
  // Target block info (updated in animate loop, used by interaction)
  let targetInfo = null;

  // Crouch state
  let isCrouching = false;
  const standingHeight = playerHeight;
  const crouchingHeight = blockSize * PLAYER.crouchHeight;
  let currentPlayerHeight = standingHeight;

  // Mouse look
  const PI_2 = Math.PI / 2;
  function onMouseMove(e) {
    if (document.pointerLockElement !== renderer.domElement) return;
    const movementX = e.movementX || 0;
    const movementY = e.movementY || 0;
    player.rotation.y -= movementX * gameSettings.mouseSensitivity;
    pitchObject.rotation.x -= movementY * gameSettings.mouseSensitivity;
    pitchObject.rotation.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, pitchObject.rotation.x));
  }

  function onKeyDown(e) {
    switch (e.code) {
      case 'F5':
        e.preventDefault();
        toggleThirdPerson();
        break;
      case 'KeyB':
        // Toggle chunk borders (Box3Helpers showing full chunk boundaries)
        try { cm.toggleChunkBorders(); } catch (err) { console.warn('toggleChunkBorders error', err); }
        break;
      case 'KeyQ':
        // Place water adjacent to target block (Q key)
        e.preventDefault();
        if (!waterPhysics) {
          console.log('Water physics not initialized');
          break;
        }
        if (targetInfo) {
          const { blockX, blockY, blockZ } = targetInfo;
          const origin = camera.getWorldPosition(new THREE.Vector3());
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          let hitPoint = null;
          const step = 0.01;
          for (let t = 0; t <= PLAYER.blockreach; t += step) {
            const p = origin.clone().addScaledVector(dir, t);
            const bid = cm.getBlockAtWorld(p.x, p.y, p.z);
            if (bid !== 0 && Math.floor(p.x) === blockX && Math.floor(p.y) === blockY && Math.floor(p.z) === blockZ) {
              hitPoint = p;
              break;
            }
          }
          
          if (!hitPoint) {
            console.log('Could not find hit point');
            break;
          }
          
          // Determine which face based on hit point position within the block
          const localX = hitPoint.x - blockX;
          const localY = hitPoint.y - blockY;
          const localZ = hitPoint.z - blockZ;
          
          
          let placeX = blockX;
          let placeY = blockY;
          let placeZ = blockZ;
          
          // Find which face is closest
          const faces = [
            { name: 'left', dist: localX, dx: -1, dy: 0, dz: 0 },
            { name: 'right', dist: 1 - localX, dx: 1, dy: 0, dz: 0 },
            { name: 'bottom', dist: localY, dx: 0, dy: -1, dz: 0 },
            { name: 'top', dist: 1 - localY, dx: 0, dy: 1, dz: 0 },
            { name: 'front', dist: localZ, dx: 0, dy: 0, dz: -1 },
            { name: 'back', dist: 1 - localZ, dx: 0, dy: 0, dz: 1 }
          ];
          
          faces.sort((a, b) => a.dist - b.dist);
          const closestFace = faces[0];
          
          
          placeX += closestFace.dx;
          placeY += closestFace.dy;
          placeZ += closestFace.dz;
          
          // Verify placement position is air
          const checkBlockId = cm.getBlockAtWorld(placeX + 0.5, placeY + 0.5, placeZ + 0.5);
          
          if (checkBlockId !== 0) {
            console.log('Cannot place water - position occupied by block', checkBlockId);
            break;
          }
          
          try {
            const waterBlock = waterPhysics.placeWater(placeX, placeY, placeZ, true);
          } catch (error) {
            console.error('Error placing water:', error);
          }
        }
        break;
      case 'KeyW': move.forward = true; break;
      case 'KeyS': move.backward = true; break;
      case 'KeyA': move.left = true; break;
      case 'KeyD': move.right = true; break;
      case 'ControlLeft': case 'ControlRight': move.sprint = true; break;
      case 'ShiftLeft': case 'ShiftRight': 
        move.crouch = true; 
        break;
      case 'Space':
        e.preventDefault();
        if (onGround || (velY <= 0 && velY > -2)) {
            // Double-check we have ground beneath using rectangular samples
            const bottomY = player.position.y - currentPlayerHeight / 2;
            const hx = playerHalfWidth * 0.98;
            const hz = playerHalfDepth * 0.98;
            const jumpSamples = [
              [0, 0], [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz],
              [0, -hz], [0, hz], [-hx, 0], [hx, 0]
            ];
            let hasGroundNearby = onGround;
            if (!hasGroundNearby) {
              for (const [ox, oz] of jumpSamples) {
                const sx = player.position.x + ox;
                const sz = player.position.z + oz;
                const gy = cm.getGroundAtWorld(sx, bottomY, sz);
                if (isFinite(gy) && (bottomY - gy) < 0.35) {
                  hasGroundNearby = true;
                  break;
                }
              }
            }
            if (hasGroundNearby) {
              velY = jumpSpeed;
              onGround = false;
            }
        }
        
        break;
    }
  }

  function onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': move.forward = false; break;
      case 'KeyS': move.backward = false; break;
      case 'KeyA': move.left = false; break;
      case 'KeyD': move.right = false; break;
      case 'ControlLeft': case 'ControlRight': move.sprint = false; break;
      case 'ShiftLeft': case 'ShiftRight': 
        move.crouch = false; 
        break;
    }
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Movement parameters
  const velocity = new THREE.Vector3(); // horizontal velocity (x, z in world space)
  const direction = new THREE.Vector3();
  let prevTime = performance.now();
  // Physics (in blocks units: 1 block = 1 unit)
  let velY = 0; // vertical velocity (blocks/sec)
  let onGround = true; // spawn placed on terrain
  
  // Physics constants (from config)
  const gravity = PHYSICS.gravity;
  const jumpSpeed = PHYSICS.jumpSpeed;
  const terminalVelocity = PHYSICS.terminalVelocity;
  const groundAccel = PHYSICS.groundAccel;
  const airAccel = PHYSICS.airAccel;
  const groundFriction = PHYSICS.groundFriction;
  const airFriction = PHYSICS.airFriction;
  const maxSpeed = PHYSICS.maxSpeed;
  const sprintMultiplier = PHYSICS.sprintMultiplier;
  const crouchMultiplier = PHYSICS.crouchMultiplier;

  // Fixed timestep for consistent physics
  const FIXED_DT = 1 / PHYSICS.physicsFPS;
  let accumulator = 0;

  // Physics update function - called at fixed timestep
  function updatePhysics(dt) {
    // First, resolve any stuck-in-block situations
    resolvePlayerCollision();
    
    // Check if player is in water
    const inWater = waterPhysics ? waterPhysics.isPlayerInWater(player.position) : false;
    const isSwimming = inWater && move.forward; // Simple swimming detection
    
    // Calculate input direction from keys
    direction.set(0, 0, 0);
    if (move.forward) direction.z -= 1;
    if (move.backward) direction.z += 1;
    if (move.left) direction.x -= 1;
    if (move.right) direction.x += 1;
    
    // Convert local direction to world space
    if (direction.lengthSq() > 0) {
      direction.normalize();
      // Rotate direction by player's yaw
      const cos = Math.cos(player.rotation.y);
      const sin = Math.sin(player.rotation.y);
      const worldDirX = direction.x * cos + direction.z * sin;
      const worldDirZ = direction.z * cos - direction.x * sin;
      direction.x = worldDirX;
      direction.z = worldDirZ;
    }
    
    // Handle crouch state
    const wantsToCrouch = move.crouch;
    const targetPlayerHeight = wantsToCrouch ? crouchingHeight : standingHeight;
    const heightLerpSpeed = 10.5;
    const prevHeight = currentPlayerHeight;
    currentPlayerHeight += (targetPlayerHeight - currentPlayerHeight) * Math.min(1, heightLerpSpeed * dt);
    const heightDelta = currentPlayerHeight - prevHeight;
    player.position.y += heightDelta / 2;
    const heightThreshold = 0.01;
    isCrouching = Math.abs(currentPlayerHeight - crouchingHeight) < heightThreshold;
    playerModel.scale.y = currentPlayerHeight / standingHeight;
    playerModel.position.y = 0;
    pitchObject.position.y = currentPlayerHeight * CAMERA.eyeHeight;
    // Determine current speed based on sprint/crouch state
    let currentMaxSpeed = maxSpeed;
    if (isCrouching) {
      currentMaxSpeed = maxSpeed * crouchMultiplier;
    } else if (move.sprint && (move.forward)) {
      currentMaxSpeed = maxSpeed * sprintMultiplier;
    }
    // FOV sprint logic
    if (move.sprint && move.forward && !isCrouching && (velocity.x !== 0 || velocity.z !== 0)) {
      targetFov = sprintFov;
    } else {
      targetFov = defaultFov;
    }
    // Smoothly interpolate camera.fov
    camera.fov += (targetFov - camera.fov) * fovLerpSpeed;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.updateProjectionMatrix();
    } else {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
    
    // Target velocity based on input
    const targetSpeed = direction.lengthSq() > 0 ? currentMaxSpeed : 0;
    const targetVelX = direction.x * targetSpeed;
    const targetVelZ = direction.z * targetSpeed;
    
    // Acceleration and friction based on ground state
    const accel = onGround ? groundAccel : airAccel;
    const friction = onGround ? groundFriction : airFriction;
    
    // Apply acceleration toward target velocity
    if (direction.lengthSq() > 0) {
      velocity.x += (targetVelX - velocity.x) * Math.min(1, accel * dt);
      velocity.z += (targetVelZ - velocity.z) * Math.min(1, accel * dt);
    } else {
      // Apply friction when no input
      const frictionFactor = Math.max(0, 1 - friction * dt);
      velocity.x *= frictionFactor;
      velocity.z *= frictionFactor;
      // Stop completely if very slow
      if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
      if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
    }
    
    // Clamp horizontal speed
    const horizSpeed = Math.hypot(velocity.x, velocity.z);
    if (horizSpeed > currentMaxSpeed) {
      velocity.x = (velocity.x / horizSpeed) * currentMaxSpeed;
      velocity.z = (velocity.z / horizSpeed) * currentMaxSpeed;
    }
    
    // Apply gravity
    velY += gravity * dt;
    if (velY < terminalVelocity) velY = terminalVelocity;
    
    // Fast descent when holding shift
    if (move.down && !onGround) velY += gravity * dt; // double gravity
    
    // Apply water physics if in water
    if (inWater && waterPhysics) {
      const waterVel = new THREE.Vector3(velocity.x, velY, velocity.z);
      waterPhysics.applyWaterPhysics(waterVel, player.position, isSwimming);
      velocity.x = waterVel.x;
      velocity.z = waterVel.z;
      velY = waterVel.y;
    }
    
    // Move horizontally with collision (axis-separated for wall sliding)
    const moveX = velocity.x * dt;
    const moveZ = velocity.z * dt;
    // helper: get maximum ground Y under a position using rectangular corner/edge samples
    function getMaxGroundAtPosition(px, pz, bottomY) {
      // Sample at corners and edge midpoints of rectangular hitbox
      const hx = playerHalfWidth * 0.95; // slightly inset to avoid edge issues
      const hz = playerHalfDepth * 0.95;
      const samplesLocal = [
        [0, 0],                     // center
        [-hx, -hz], [hx, -hz],      // front corners
        [-hx, hz], [hx, hz],        // back corners
        [0, -hz], [0, hz],          // front/back edge midpoints
        [-hx, 0], [hx, 0]           // left/right edge midpoints
      ];
      let maxG = -Infinity;
      for (const [ox, oz] of samplesLocal) {
        const sx = px + ox;
        const sz = pz + oz;
        const gy = cm.getGroundAtWorld(sx, bottomY, sz);
        if (isFinite(gy) && gy > maxG) maxG = gy;
      }
      return maxG;
    }
    
    // Try X movement
    if (moveX !== 0) {
      const newX = player.position.x + moveX;
      const currentBottomY = player.position.y - currentPlayerHeight / 2;
      const currentMaxGround = getMaxGroundAtPosition(player.position.x, player.position.z, currentBottomY);
      const targetMaxGround = getMaxGroundAtPosition(newX, player.position.z, currentBottomY);
      const CROUCH_MAX_DROP = 0.5; // blocks - max allowed drop when crouching
      if (onGround && isCrouching && isFinite(currentMaxGround) && isFinite(targetMaxGround) && (currentMaxGround - targetMaxGround) > CROUCH_MAX_DROP) {
        // Block horizontal movement to avoid falling off edge while crouched
        velocity.x = 0;
      } else if (isPlayerPositionFree(newX, player.position.y, player.position.z)) {
        player.position.x = newX;
      } else {
        velocity.x = 0; // Hit wall, stop X velocity
      }
    }
    
    // Try Z movement
    if (moveZ !== 0) {
      const newZ = player.position.z + moveZ;
      // Prevent accidentally stepping off edges while crouching
      const currentBottomYz = player.position.y - currentPlayerHeight / 2;
      const currentMaxGroundZ = getMaxGroundAtPosition(player.position.x, player.position.z, currentBottomYz);
      const targetMaxGroundZ = getMaxGroundAtPosition(player.position.x, newZ, currentBottomYz);
      const CROUCH_MAX_DROP_Z = 0.5;
      if (onGround && isCrouching && isFinite(currentMaxGroundZ) && isFinite(targetMaxGroundZ) && (currentMaxGroundZ - targetMaxGroundZ) > CROUCH_MAX_DROP_Z) {
        velocity.z = 0;
      } else if (isPlayerPositionFree(player.position.x, player.position.y, newZ)) {
        player.position.z = newZ;
      } else {
        velocity.z = 0; // Hit wall, stop Z velocity
      }
    }
    
    let moveY = velY * dt;
    if (velY > 0) {
      const currentTopY = player.position.y + currentPlayerHeight / 2;
      const projectedTopY = currentTopY + moveY;
      const hx = playerHalfWidth * 0.95;
      const hz = playerHalfDepth * 0.95;
      const ceilingSamples = [
        [0, 0],
        [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz],
        [0, -hz], [0, hz], [-hx, 0], [hx, 0]
      ];
      
      // Find the lowest ceiling that would block our upward movement
      let lowestCeilingY = Infinity;
      const bs = blockSize;
      
      // Check each block layer we might pass through
      const startBlockY = Math.floor((currentTopY - MIN_Y * bs) / bs) + MIN_Y;
      const endBlockY = Math.floor((projectedTopY - MIN_Y * bs) / bs) + MIN_Y;
      
      for (let blockY = startBlockY; blockY <= endBlockY + 1; blockY++) {
        const checkY = blockY * bs + bs * 0.5; // center of block
        for (const [ox, oz] of ceilingSamples) {
          const sx = player.position.x + ox;
          const sz = player.position.z + oz;
          const headBlockId = cm.getBlockAtWorld(sx, checkY, sz);
          if (!isBlockPassable(headBlockId)) {
            // This block's bottom is the ceiling
            const blockBottomWorldY = blockY * bs;
            if (blockBottomWorldY < lowestCeilingY && blockBottomWorldY > currentTopY - 0.01) {
              lowestCeilingY = blockBottomWorldY;
            }
          }
        }
      }
      
      // If we found a ceiling, limit our upward movement
      if (isFinite(lowestCeilingY)) {
        const maxAllowedTopY = lowestCeilingY - 0.15; // gap to prevent camera clipping when looking up
        const maxAllowedMove = maxAllowedTopY - currentTopY;
        if (maxAllowedMove < moveY) {
          // Clamp movement to stop at ceiling
          moveY = Math.max(0, maxAllowedMove);
          velY = 0; // Stop upward velocity
        }
      }
    }
    
    player.position.y += moveY;
    
    // Ground collision using rectangular hitbox corners and edges
    const playerBottomY = player.position.y - currentPlayerHeight / 2;
    // Sample at corners and edge midpoints of rectangular hitbox
    const hx = playerHalfWidth * 0.98; // slightly inset to avoid floating point edge issues
    const hz = playerHalfDepth * 0.98;
    const samples = [
      [0, 0],                     // center
      [-hx, -hz], [hx, -hz],      // front corners
      [-hx, hz], [hx, hz],        // back corners
      [0, -hz], [0, hz],          // front/back edge midpoints
      [-hx, 0], [hx, 0]           // left/right edge midpoints
    ];

    let maxGroundY = -Infinity;
    for (const [ox, oz] of samples) {
      const sx = player.position.x + ox;
      const sz = player.position.z + oz;
      const gy = cm.getGroundAtWorld(sx, playerBottomY, sz);
      if (isFinite(gy) && gy > maxGroundY) maxGroundY = gy;
    }

    if (isFinite(maxGroundY)) {
      if (playerBottomY < maxGroundY) {
        // player partially buried - snap up
        player.position.y = maxGroundY + currentPlayerHeight / 2;
        velY = 0;
        onGround = true;
      } else {
        // Use a more generous threshold for onGround detection to fix edge jumping
        // Also check if we're falling (velY < 0) to be more lenient
        const groundThreshold = velY <= 0 ? 0.25 : 0.1;
        onGround = (playerBottomY - maxGroundY) < groundThreshold;
      }
    } else {
      onGround = false;
    }
  }

  function calculateAdvancedLight(x, y, z) {
    const directions = [
      { dx: 0, dz: 0, weight: 1.0 },      // straight up (most important)
      { dx: 1, dz: 0, weight: 0.7 },      // up-east
      { dx: -1, dz: 0, weight: 0.7 },     // up-west
      { dx: 0, dz: 1, weight: 0.7 },      // up-north
      { dx: 0, dz: -1, weight: 0.7 },     // up-south
      { dx: 1, dz: 1, weight: 0.5 },      // up-northeast
      { dx: -1, dz: 1, weight: 0.5 },     // up-northwest
      { dx: 1, dz: -1, weight: 0.5 },     // up-southeast
      { dx: -1, dz: -1, weight: 0.5 }     // up-southwest
    ];
    
    let maxLight = 0;
    let totalWeight = 0;
    let weightedLightSum = 0;
    
    for (const dir of directions) {
      const sampleX = x + dir.dx * blockSize * 0.5;
      const sampleZ = z + dir.dz * blockSize * 0.5;
      const topY = cm.getTopAtWorld(sampleX, sampleZ);
      
      if (!isFinite(topY)) continue;
      
      let dirLight = 0;
      if (topY <= Math.floor(y)) {
        // Player is above or at surface level in this direction
        dirLight = 15;
      } else {
        // Calculate light based on distance to surface
        const distanceToSurface = Math.floor(topY) - Math.floor(y);
        // Light decreases more gradually: 1 light level per 2 blocks instead of 1:1
        dirLight = Math.max(0, 15 - Math.floor(distanceToSurface / 2));
      }
      
      // Track maximum light from any direction
      if (dirLight > maxLight) {
        maxLight = dirLight;
      }
      
      // Also calculate weighted average
      weightedLightSum += dirLight * dir.weight;
      totalWeight += dir.weight;
    }
    
    // Use weighted average but ensure we keep some of the max light
    const avgLight = totalWeight > 0 ? weightedLightSum / totalWeight : 0;
    // Blend 70% weighted average with 30% max light for more natural feel
    const finalLight = Math.round(avgLight * 0.7 + maxLight * 0.3);
    
    return Math.max(0, Math.min(15, finalLight));
  }

  function animate() {
    requestAnimationFrame(animate);
    
    if (prevTime === startTimeMarker) {
      if (DEBUG.showStartupInfo) console.log('Main loop starting');
    }
    const time = performance.now();
    let frameDelta = (time - prevTime) / 1000;
    prevTime = time;
    
    // Update FPS counter
    frameCount++;
    if (time - lastFpsUpdate >= 1000) {
      currentFPS = frameCount;
      frameCount = 0;
      lastFpsUpdate = time;
      if (fpsDisplay) {
        fpsDisplay.textContent = `FPS: ${currentFPS}`;
      }
    }
    
    // Clamp frame delta to prevent spiral of death
    if (frameDelta > 0.1) frameDelta = 0.1;
    
    accumulator += frameDelta;
    
    // Run physics at fixed timestep for consistency
    let didUpdate = false;
    while (accumulator >= FIXED_DT) {
      updatePhysics(FIXED_DT);
      accumulator -= FIXED_DT;
      didUpdate = true;
    }
    // If at high FPS and accumulator is too small, force at least one update per frame
    if (!didUpdate && accumulator > 0) {
      updatePhysics(accumulator);
      accumulator = 0;
    }

    // Update chunk manager around current player position (queue loads)
    cm.update(player.position.x, player.position.z);
    // Chunk loading is now handled by a timer, not per-frame
    
    // Update water physics system
    if (waterPhysics) {
      try {
        waterPhysics.update(frameDelta);
      } catch (error) {
        console.error('Water physics update error:', error);
      }
    }

    // Day / night update
    const now = performance.now() / 1000;
    let t = (now - cycleStart) % CYCLE_LENGTH; // seconds into cycle
    if (t < 0) t += CYCLE_LENGTH;

    // compute sun angle around sky (0..CYCLE_LENGTH) -> angle -PI/2 .. 3PI/2
    const angle = (t / CYCLE_LENGTH) * Math.PI * 2 - Math.PI / 2;
    const sunDist = DAY_NIGHT.orbitDistance;
    sunPos.set(Math.cos(angle) * sunDist + player.position.x, Math.sin(angle) * sunDist, Math.sin(angle * 0.5) * -200 + player.position.z);
    sunMesh.position.copy(sunPos);
    sunLight.position.copy(sunPos);
    sunMesh.rotation.set(0, 0, angle);

    // moon opposite the sun
    const moonAngle = angle + Math.PI;
    moonPos.set(Math.cos(moonAngle) * sunDist + player.position.x, Math.sin(moonAngle) * sunDist, Math.sin(moonAngle * 0.5) * -200 + player.position.z);
    moonMesh.position.copy(moonPos);
    moonLight.position.copy(moonPos);
    moonMesh.rotation.set(0, 0, moonAngle);

    // determine phase: day, dusk, night, dawn (we split TRANSITION_TOTAL in half for dusk/dawn)
    let sunIntensity = 0;
    let moonIntensity = 0;
    let ambientRatio = 0;

    // timeline: dawn (DAWN_LENGTH) -> day (DAY_LENGTH) -> dusk (DUSK_LENGTH) -> night (NIGHT_LENGTH)
    // compute offsets assuming dawn at t=0
    const dawnEnd = DAWN_LENGTH;
    const dayEnd = dawnEnd + DAY_LENGTH;
    const duskEnd = dayEnd + DUSK_LENGTH;
    // nightEnd == CYCLE_LENGTH

    if (t < dawnEnd) {
      // dawn rising
      const p = t / DAWN_LENGTH; // 0..1
      sunIntensity = p;
      moonIntensity = 1 - p;
      ambientRatio = 0.2 + 0.8 * p;
    } else if (t < dayEnd) {
      // day
      sunIntensity = 1;
      moonIntensity = 0;
      ambientRatio = 2.0;
    } else if (t < duskEnd) {
      // dusk fading
      const p = (t - dayEnd) / DUSK_LENGTH; // 0..1
      sunIntensity = 1 - p;
      moonIntensity = p;
      ambientRatio = 1.0 - 0.8 * p;
    } else {
      // night
      sunIntensity = 0;
      moonIntensity = 1;
      ambientRatio = 0.2;
    }
    // smooth skylight-driven intensity changes using advanced multi-directional sampling
    const desiredSkyLight = calculateAdvancedLight(
      player.position.x,
      player.position.y,
      player.position.z
    );

    // persistent smoothed skylight stored on cm to survive frames
    if (cm._smoothedSkyLight === undefined) cm._smoothedSkyLight = desiredSkyLight;
    // smoothing speed (per second)
    const SKY_SMOOTH_SPEED = 6.0;
    const skyAlpha = Math.min(1, SKY_SMOOTH_SPEED * frameDelta);
    cm._smoothedSkyLight += (desiredSkyLight - cm._smoothedSkyLight) * skyAlpha;
    const smoothedSkyLight = cm._smoothedSkyLight;

    // compute target intensities from smoothed skylight
    const targetSunIntensity = Math.max(0, (smoothedSkyLight / 15) * sunIntensity);
    const targetMoonIntensity = Math.max(0, 0.25 * (smoothedSkyLight / 15) * moonIntensity);
    const targetAmbient = 0.1 + 0.75 * (smoothedSkyLight / 15) * ambientRatio;

    // smoothly apply to actual lights
    const LIGHT_SMOOTH_SPEED = 8.0;
    const lightAlpha = Math.min(1, LIGHT_SMOOTH_SPEED * frameDelta);
    sunLight.intensity += (targetSunIntensity - sunLight.intensity) * lightAlpha;
    moonLight.intensity += (targetMoonIntensity - moonLight.intensity) * lightAlpha;
    ambient.intensity += (targetAmbient - ambient.intensity) * lightAlpha;

    // sky color blend (reuse skyColor to avoid allocation)
    skyColor.copy(skyNight).lerp(skyDay, ambientRatio);
    scene.background = skyColor;

    // Always update highlight box and target block every frame
    raycaster.setFromCamera(tempVec2.set(0, 0), camera);
    raycaster.far = PLAYER.blockreach;
    targetInfo = null;
    camera.getWorldPosition(tempLocalPoint);
    camera.getWorldDirection(tempWorldPoint);
    const maxDist = raycaster.far || 50;
    const step = 0.1;
    for (let d = 0; d <= maxDist; d += step) {
      const sx = tempLocalPoint.x + tempWorldPoint.x * d;
      const sy = tempLocalPoint.y + tempWorldPoint.y * d;
      const sz = tempLocalPoint.z + tempWorldPoint.z * d;
      const id2 = cm.getBlockAtWorld(sx, sy, sz);
      if (id2 !== 0) {
        const bx2 = Math.floor(sx / blockSize);
        const by2 = Math.floor((sy - MIN_Y * blockSize) / blockSize) + MIN_Y;
        const bz2 = Math.floor(sz / blockSize);
        targetInfo = { blockX: bx2, blockY: by2, blockZ: bz2, id: id2, dist: d };
        break;
      }
    }

    // Highlight the block the player is looking at
    if (targetInfo) {
      highlightBox.visible = true;
      highlightBox.position.set(
        targetInfo.blockX + 0.5,
        targetInfo.blockY + 0.5,
        targetInfo.blockZ + 0.5
      );
    } else {
      highlightBox.visible = false;
    }

    // update debug overlay (throttled to reduce raycast overhead)
    if (showDebug && time - lastDebugUpdate > debugUpdateInterval) {
      lastDebugUpdate = time;
      // Compute look vector, yaw/pitch and facing name
      const lookVec = new THREE.Vector3();
      camera.getWorldDirection(lookVec);
      const yawRad = player.rotation.y || 0;
      const pitchRad = pitchObject.rotation.x || 0;
      const yawDeg = (yawRad * 180 / Math.PI) % 360;
      const pitchDeg = (pitchRad * 180 / Math.PI) % 360;
      // Facing name (coarse)
      const normYaw = (yawDeg + 360) % 360;
      let facingName = 'Unknown';
      if (normYaw >= 315 || normYaw < 45) facingName = 'South (Towards -Z)';
      else if (normYaw >= 45 && normYaw < 135) facingName = 'West (Towards -X)';
      else if (normYaw >= 135 && normYaw < 225) facingName = 'North (Towards +Z)';
      else facingName = 'East (Towards +X)';

      const headY = player.position.y + currentPlayerHeight * CAMERA.eyeHeight;
      const headBlockId = cm.getBlockAtWorld(player.position.x, headY, player.position.z);

      const skyLight = calculateAdvancedLight(player.position.x, player.position.y, player.position.z);
      const blockLight = (targetInfo && targetInfo.id === 4) ? 5 : 0;

      // Renderer statistics
      const rinfo = renderer.info || { memory: {}, render: {} };
      const rendererStats = {
        geometries: rinfo.memory.geometries || 0,
        textures: rinfo.memory.textures || 0,
        calls: rinfo.render.calls || 0,
        triangles: rinfo.render.triangles || 0
      };
      const mem = (performance && performance.memory) ? { usedMB: performance.memory.usedJSHeapSize/1024/1024, totalMB: performance.memory.jsHeapSizeLimit/1024/1024 } : null;
      debugOverlay.update({
        delta: frameDelta,
        playerPos: player.position,
        chunkX: Math.floor(player.position.x / (CHUNK_SIZE*blockSize)),
        chunkZ: Math.floor(player.position.z / (CHUNK_SIZE*blockSize)),
        target: targetInfo,
        loadedChunks: cm.chunks.size,
        memory: mem,
        biome: getBiomeAtWorld(player.position.x, player.position.z, SEED),
        lookVec,
        facing: { name: facingName, yaw: yawDeg.toFixed(1), pitch: pitchDeg.toFixed(1) },
        headBlockId,
        clientLight: { sky: skyLight, block: blockLight },
        rendererStats
      });
    }

    if (isThirdPerson) {
      updateThirdPersonCameraCollision();
      const headWorld = new THREE.Vector3(
        player.position.x,
        player.position.y + currentPlayerHeight * CAMERA.eyeHeight,
        player.position.z
      );
      const camWorld = new THREE.Vector3();
      camera.getWorldPosition(camWorld);
      const camLocalPos = camera.position.clone();
      const lookDir = camLocalPos.clone().negate().normalize();
      if (camLocalPos.lengthSq() > 0.001) {
        const localYaw = Math.atan2(-lookDir.x, -lookDir.z);
        const localPitch = Math.asin(lookDir.y);
        camera.rotation.set(localPitch, localYaw, 0, 'YXZ');
      }
    } else {
      updateFirstPersonCameraCollision();
    }
    // Update block breaker (timed-break + overlay)
    try { if (typeof blockBreaker !== 'undefined' && blockBreaker) blockBreaker.update(frameDelta); } catch (e) {}
    renderer.render(scene, camera);
    prevTime = time;
  }
  animate();

  if (typeof cm.processLoadQueue === 'function') {
    setInterval(() => {
      cm.processLoadQueue();
    }, 33); // ~30 times per second
  }
}

// mark startTime for first-frame log
const startTimeMarker = performance.now();

// Initialize menu instead of starting game directly
initMenu();
