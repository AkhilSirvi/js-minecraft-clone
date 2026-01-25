import * as THREE from './three.module.js';
import { generateChunk, CHUNK_SIZE, HEIGHT, MIN_Y, getBiomeAtWorld } from './chunkGen.js';
import ChunkManager, { isBlockPassable } from './chunkManager.js';
import { initInteraction } from './interaction.js';
import createDebugOverlay from './debugOverlay.js';
import { SEED, PLAYER, PHYSICS, RENDER, DAY_NIGHT, CAMERA, DEBUG } from './config.js';

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
  if (gameSettings.showFPS) {
    fpsDisplay = document.createElement('div');
    fpsDisplay.style.cssText = 'position:fixed;top:10px;left:10px;background:rgba(0,0,0,0.7);color:#0f0;padding:5px 10px;font-family:monospace;font-size:14px;z-index:1000;pointer-events:none;';
    document.body.appendChild(fpsDisplay);
  }

  // Procedural chunk streaming manager
  // Use block-coordinate units: 1 block == 1 world unit
  const blockSize = 1; // blocks per unit
  if (DEBUG.showStartupInfo) console.log('Creating ChunkManager (seed, blockSize, viewDistance)=', SEED, blockSize, gameSettings.viewDistance);
  const cm = new ChunkManager(scene, { seed: SEED, blockSize, viewDistance: gameSettings.viewDistance });
  // initial load around origin
  if (DEBUG.showStartupInfo) console.log('Initial chunk load around origin starting');
  if (DEBUG.showStartupInfo) console.log('Initial chunk load completed');

  // Debug overlay (F3)
  const debugOverlay = createDebugOverlay();
  let showDebug = false;
  let lastDebugUpdate = 0;
  const debugUpdateInterval = 250; // Update debug info 4 times per second
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { debugOverlay.toggle(); showDebug = !showDebug; }
  });

  // reusable raycaster and temp vectors to avoid per-frame allocations
  const raycaster = new THREE.Raycaster();
  const tempLocalPoint = new THREE.Vector3();
  const tempWorldPoint = new THREE.Vector3();
  const tempVec2 = new THREE.Vector2();

    // Highlight box for block the player is looking at
    const highlightMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      depthTest: true,
      transparent: true,
      opacity: 0.5
    });
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
          // Use isBlockPassable to check if this block allows player passage
          if (!isBlockPassable(id)) return false; // blocked by solid block
        }
      }
    }
    return true;
  }

  // Push player out of solid blocks if stuck
  function resolvePlayerCollision() {
    const bs = blockSize;
    const maxPushDist = 2.0; // max distance to search for free space
    const pushStep = 0.001;
    
    // If already free, nothing to do
    if (isPlayerPositionFree(player.position.x, player.position.y, player.position.z)) {
      return;
    }
    
    // Try pushing up first (most common case - stuck in ground)
    for (let dy = pushStep; dy <= maxPushDist; dy += pushStep) {
      if (isPlayerPositionFree(player.position.x, player.position.y + dy, player.position.z)) {
        player.position.y += dy;
        velY = 0;
        return;
      }
    }
    
    // Try pushing horizontally in all directions
    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];
    for (let dist = pushStep; dist <= maxPushDist; dist += pushStep) {
      for (const [dx, dz] of directions) {
        const len = Math.hypot(dx, dz);
        const pushX = player.position.x + (dx / len) * dist;
        const pushZ = player.position.z + (dz / len) * dist;
        if (isPlayerPositionFree(pushX, player.position.y, pushZ)) {
          player.position.x = pushX;
          player.position.z = pushZ;
          velocity.x = 0;
          velocity.z = 0;
          return;
        }
      }
    }
    
    // Try pushing up + horizontal as last resort
    for (let dy = pushStep; dy <= maxPushDist; dy += pushStep) {
      for (let dist = pushStep; dist <= maxPushDist; dist += pushStep) {
        for (const [dx, dz] of directions) {
          const len = Math.hypot(dx, dz);
          const pushX = player.position.x + (dx / len) * dist;
          const pushZ = player.position.z + (dz / len) * dist;
          if (isPlayerPositionFree(pushX, player.position.y + dy, pushZ)) {
            player.position.x = pushX;
            player.position.y += dy;
            player.position.z = pushZ;
            velocity.x = 0;
            velocity.z = 0;
            velY = 0;
            return;
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
  let fovLerpSpeed = 0.15; // How quickly FOV changes

  // player collision size (from config)
  const playerWidth = blockSize * PLAYER.width;
  const playerRadius = playerWidth / 2;
  const playerHeight = blockSize * PLAYER.height;
  
  // Player hitbox half-extents for rectangular collision (width x height x depth)
  const playerHalfWidth = playerWidth / 2;  // X half-extent
  const playerHalfDepth = playerWidth / 2;  // Z half-extent (same as width for square hitbox)

  // third-person / first-person toggle state
  let isThirdPerson = false;
  const fpCameraLocalPos = new THREE.Vector3(0, 0, 0);
  const tpCameraLocalPos = new THREE.Vector3(0, playerHeight * CAMERA.thirdPersonHeight, CAMERA.thirdPersonDistance);
  // create player root before constructing a visible model (avoid TDZ error)
  const player = new THREE.Object3D();

  // simple player model (visible in third-person)
  const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const playerGeometry = new THREE.BoxGeometry(playerWidth, playerHeight, playerWidth);
  const playerModel = new THREE.Mesh(playerGeometry, playerMaterial);
  playerModel.castShadow = true;
  playerModel.receiveShadow = true;
  // center the model on player's origin (player.position is center)
  playerModel.position.set(0, 0, 0);
  playerModel.visible = false; // start in first-person
  player.add(playerModel);

  function toggleThirdPerson() {
    isThirdPerson = !isThirdPerson;
    // prevent browser F5 default
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
    playerModel.visible = isThirdPerson;
    if (isThirdPerson) {
      camera.position.copy(tpCameraLocalPos);
    } else {
      camera.position.copy(fpCameraLocalPos);
    }
  }

  // Player object: yaw rotates this, pitch rotates the camera child.
  // place player at computed spawn above terrain (centered by height)
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

    // Step along the ray from the eye to the desired camera position and find first blocking block
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

  // Console teleport command: use in DevTools console: `teleport(x,y,z)` or `tp(x,y,z)`
  // If `y` is omitted, teleport to top of terrain at x,z. Pass `opts = { safe: false }` to skip searching for free space.
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

  const renderer = new THREE.WebGLRenderer({ antialias: true , alpha: false });
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

  // Initialize interaction (mining/placing)
  const interaction = initInteraction(cm, camera, renderer.domElement, {
    placeBlockId: 2,
    reach: PLAYER.blockreach,
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
    if (wantsToCrouch && !isCrouching) {
      // Start crouching
      isCrouching = true;
      currentPlayerHeight = crouchingHeight;
      // Adjust player position so feet stay on ground
      const heightDiff = standingHeight - crouchingHeight;
      player.position.y -= heightDiff / 2;
      // Update player model
      playerModel.scale.y = crouchingHeight / standingHeight;
      playerModel.position.y = 0;
      // Update camera position
      pitchObject.position.y = crouchingHeight * CAMERA.eyeHeight;
    } else if (!wantsToCrouch && isCrouching) {
      // Try to stand up - check if there's room using rectangular hitbox
      const heightDiff = standingHeight - crouchingHeight;
      const newY = player.position.y + heightDiff / 2;
      // Check if we can stand (head won't hit ceiling) at all corners
      const headY = newY + standingHeight / 2;
      const hx = playerHalfWidth * 0.95;
      const hz = playerHalfDepth * 0.95;
      const standSamples = [
        [0, 0],
        [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]
      ];
      let canStand = true;
      for (const [ox, oz] of standSamples) {
        const sx = player.position.x + ox;
        const sz = player.position.z + oz;
        const headBlockId = cm.getBlockAtWorld(sx, headY, sz);
        if (!isBlockPassable(headBlockId)) {
          canStand = false;
          break;
        }
      }
      if (canStand) {
        // Can stand up
        isCrouching = false;
        currentPlayerHeight = standingHeight;
        player.position.y = newY;
        playerModel.scale.y = 1;
        playerModel.position.y = 0;
        pitchObject.position.y = standingHeight * CAMERA.eyeHeight;
      }
      // else: stay crouched (blocked by ceiling)
    }
    
    // Determine current speed based on sprint/crouch state
    let currentMaxSpeed = maxSpeed;
    if (isCrouching) {
      currentMaxSpeed = maxSpeed * crouchMultiplier;
    } else if (move.sprint && (move.forward)) {
      currentMaxSpeed = maxSpeed * sprintMultiplier;
    }
    // FOV sprint logic
    if (move.sprint && move.forward && !isCrouching) {
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
      // Prevent accidentally stepping off edges while crouching: require target ground not to drop far
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
    
    // Apply vertical movement
    const moveY = velY * dt;
    player.position.y += moveY;
    
    // Ceiling collision - check all corners of rectangular hitbox
    if (velY > 0) {
      const playerTopY = player.position.y + currentPlayerHeight / 2;
      const hx = playerHalfWidth * 0.95;
      const hz = playerHalfDepth * 0.95;
      const ceilingSamples = [
        [0, 0],
        [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]
      ];
      let hitCeiling = false;
      let lowestCeilingY = Infinity;
      for (const [ox, oz] of ceilingSamples) {
        const sx = player.position.x + ox;
        const sz = player.position.z + oz;
        const headBlockId = cm.getBlockAtWorld(sx, playerTopY, sz);
        if (!isBlockPassable(headBlockId)) {
          hitCeiling = true;
          const bs = blockSize;
          const gyBlock = Math.floor((playerTopY - MIN_Y * bs) / bs) + MIN_Y;
          const blockBottomWorldY = gyBlock * bs;
          if (blockBottomWorldY < lowestCeilingY) lowestCeilingY = blockBottomWorldY;
        }
      }
      if (hitCeiling) {
        player.position.y = lowestCeilingY - 0.001 - currentPlayerHeight / 2;
        velY = 0;
      }
    }
    
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
    // process a small number of queued chunk loads per frame to avoid stalls
    if (typeof cm.processLoadQueue === 'function') cm.processLoadQueue();

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
      ambientRatio = 1.0;
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

    sunLight.intensity = Math.max(0, sunIntensity);
    moonLight.intensity = Math.max(0, 0.25 * moonIntensity);
    ambient.intensity = 0.25 + 0.75 * ambientRatio;

    // sky color blend (reuse skyColor to avoid allocation)
    skyColor.copy(skyNight).lerp(skyDay, ambientRatio);
    scene.background = skyColor;

    // Always update highlight box and target block every frame
    raycaster.setFromCamera(tempVec2.set(0, 0), camera);
    raycaster.far = PLAYER.blockreach;
    let targetInfo = null;
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

      // Head block id (block where player's eye is located)
      const headY = player.position.y + currentPlayerHeight * CAMERA.eyeHeight;
      const headBlockId = cm.getBlockAtWorld(player.position.x, headY, player.position.z);

      // Simple client light estimate: sky light (exposed to sky?) and block light (nearby light sources)
      const topY = cm.getTopAtWorld(player.position.x, player.position.z);
      const skyLight = (topY <= Math.floor(player.position.y)) ? 15 : Math.max(0, 15 - (Math.floor(topY) - Math.floor(player.position.y)));
      const blockLight = (targetInfo && targetInfo.id === 4) ? 5 : 0; // crude: if looking at water show some block light

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
    // If third-person, update camera position with collision and make it look at player's head
    if (isThirdPerson) {
      updateThirdPersonCameraCollision();
      const lookY = player.position.y + currentPlayerHeight * CAMERA.eyeHeight;
      camera.lookAt(player.position.x, lookY, player.position.z);
    }
    renderer.render(scene, camera);
    prevTime = time;
  }
  animate();
}

// mark startTime for first-frame log
const startTimeMarker = performance.now();

// Initialize menu instead of starting game directly
initMenu();
