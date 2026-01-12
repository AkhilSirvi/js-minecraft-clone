import * as THREE from './three.module.js';
import { generateChunk, CHUNK_SIZE, HEIGHT, MIN_Y } from './chunkGen.js';
import ChunkManager from './chunkManager.js';
import createDebugOverlay from './debugOverlay.js';
import { 
  SEED, 
  PLAYER, 
  PHYSICS, 
  RENDER, 
  DAY_NIGHT, 
  CAMERA,
  DEBUG 
} from './config.js';

{
  if (DEBUG.showStartupInfo) {
    console.log('Game startup: beginning quick chunk sample');
    console.log('Using seed:', SEED);
  }
  const seed = SEED;
  const chunk = generateChunk(0, 0, seed);
  if (DEBUG.showStartupInfo) {
    console.log('Sample chunk generated');
    console.log('Generated chunk (0,0) summary:', chunk.stats);
  }
  const heights = [];
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < 1; z++) {
      let topY = null;
      for (let y = MIN_Y + HEIGHT - 1; y >= MIN_Y; y--) {
        const idx = ((x * CHUNK_SIZE + z) * HEIGHT) + (y - MIN_Y);
        if (chunk.data[idx] !== 0) { topY = y; break; }
      }
      heights.push(topY === null ? null : topY);
    }
  }
  if (DEBUG.showStartupInfo) {
    console.log('Sample column top Y for x=0..15 (z=0):', heights);
  }
}

function minimalTest() {
  if (DEBUG.showStartupInfo) console.log('Initializing minimalTest renderer and scene');
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
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(DAY_NIGHT.sunSize), new THREE.MeshBasicMaterial({ color: DAY_NIGHT.sunColor }));
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(DAY_NIGHT.moonSize), new THREE.MeshBasicMaterial({ color: DAY_NIGHT.moonColor }));
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

  const cycleStart = performance.now() / 1000; // seconds

  // Reusable vectors for sun/moon positioning (avoid allocations in render loop)
  const sunPos = new THREE.Vector3();
  const moonPos = new THREE.Vector3();

  // FPS counter
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let currentFPS = 0;
  let fpsDisplay = null;
  if (RENDER.showFPS) {
    fpsDisplay = document.createElement('div');
    fpsDisplay.style.cssText = 'position:fixed;top:10px;left:10px;background:rgba(0,0,0,0.7);color:#0f0;padding:5px 10px;font-family:monospace;font-size:14px;z-index:1000;pointer-events:none;';
    document.body.appendChild(fpsDisplay);
  }

  // Procedural chunk streaming manager
  // Use block-coordinate units: 1 block == 1 world unit
  const blockSize = 1; // blocks per unit
  if (DEBUG.showStartupInfo) console.log('Creating ChunkManager (seed, blockSize, viewDistance)=', SEED, blockSize, RENDER.viewDistance);
  const cm = new ChunkManager(scene, { seed: SEED, blockSize, viewDistance: RENDER.viewDistance });
  // initial load around origin
  if (DEBUG.showStartupInfo) console.log('Initial chunk load around origin starting');
  cm.update(0, 0);
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

  // helper: test whether player's capsule/box at given world x,z and center y would intersect any solid block
  function isPlayerPositionFree(testX, testY, testZ, height = null) {
    // approximate player as vertical column from bottomY to topY and radius playerRadius
    const bs = blockSize;
    const checkHeight = height !== null ? height : currentPlayerHeight;
    const bottomY = testY - checkHeight / 2;
    const topY = testY + checkHeight / 2;
    const minBlockX = Math.floor((testX - playerRadius) / bs);
    const maxBlockX = Math.floor((testX + playerRadius) / bs);
    const minBlockZ = Math.floor((testZ - playerRadius) / bs);
    const maxBlockZ = Math.floor((testZ + playerRadius) / bs);
    const minBlockY = Math.floor((bottomY - MIN_Y * bs) / bs) + MIN_Y;
    const maxBlockY = Math.floor((topY - MIN_Y * bs) / bs) + MIN_Y;
    for (let bx = minBlockX; bx <= maxBlockX; bx++) {
      for (let bz = minBlockZ; bz <= maxBlockZ; bz++) {
        for (let by = minBlockY; by <= maxBlockY; by++) {
          const id = cm.getBlockAtWorld(bx * bs + 0.5 * bs, by * bs + 0.5 * bs, bz * bs + 0.5 * bs);
          if (id !== 0) return false; // blocked
        }
      }
    }
    return true;
  }

  // Push player out of solid blocks if stuck
  function resolvePlayerCollision() {
    const bs = blockSize;
    const maxPushDist = 2.0; // max distance to search for free space
    const pushStep = 0.1;
    
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

  const camera = new THREE.PerspectiveCamera(RENDER.fov, window.innerWidth / window.innerHeight, RENDER.nearClip, RENDER.farClip);

  // player collision size (from config)
  const playerWidth = blockSize * PLAYER.width;
  const playerRadius = playerWidth / 2;
  const playerHeight = blockSize * PLAYER.height;

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

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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

  const grid = new THREE.GridHelper(400, 40, 0x444444, 0x888888);
  scene.add(grid);

  const axes = new THREE.AxesHelper(50);
  scene.add(axes);

  // (removed debug rotating cube)

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
    player.rotation.y -= movementX * CAMERA.mouseSensitivity;
    pitchObject.rotation.x -= movementY * CAMERA.mouseSensitivity;
    pitchObject.rotation.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, pitchObject.rotation.x));
  }

  function onKeyDown(e) {
    switch (e.code) {
      case 'F5':
        e.preventDefault();
        toggleThirdPerson();
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
        // jump if on ground (handled in animation loop)
        e.preventDefault();
        if (onGround && !isCrouching) {
          velY = jumpSpeed;
          onGround = false;
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
      // Try to stand up - check if there's room
      const heightDiff = standingHeight - crouchingHeight;
      const newY = player.position.y + heightDiff / 2;
      // Check if we can stand (head won't hit ceiling)
      const headY = newY + standingHeight / 2;
      const headBlockId = cm.getBlockAtWorld(player.position.x, headY, player.position.z);
      if (headBlockId === 0) {
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
    } else if (move.sprint && (move.forward || move.backward || move.left || move.right)) {
      currentMaxSpeed = maxSpeed * sprintMultiplier;
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
    
    // Try X movement
    if (moveX !== 0) {
      const newX = player.position.x + moveX;
      if (isPlayerPositionFree(newX, player.position.y, player.position.z)) {
        player.position.x = newX;
      } else {
        velocity.x = 0; // Hit wall, stop X velocity
      }
    }
    
    // Try Z movement
    if (moveZ !== 0) {
      const newZ = player.position.z + moveZ;
      if (isPlayerPositionFree(player.position.x, player.position.y, newZ)) {
        player.position.z = newZ;
      } else {
        velocity.z = 0; // Hit wall, stop Z velocity
      }
    }
    
    // Apply vertical movement
    const moveY = velY * dt;
    player.position.y += moveY;
    
    // Ceiling collision
    if (velY > 0) {
      const playerTopY = player.position.y + currentPlayerHeight / 2;
      const headBlockId = cm.getBlockAtWorld(player.position.x, playerTopY, player.position.z);
      if (headBlockId !== 0) {
        const bs = blockSize;
        const gyBlock = Math.floor((playerTopY - MIN_Y * bs) / bs) + MIN_Y;
        const blockBottomWorldY = gyBlock * bs;
        player.position.y = blockBottomWorldY - 0.001 - currentPlayerHeight / 2;
        velY = 0;
      }
    }
    
    // Ground collision
    const playerBottomY = player.position.y - currentPlayerHeight / 2;
    const groundSurfaceY = cm.getGroundAtWorld(player.position.x, playerBottomY, player.position.z);
    if (isFinite(groundSurfaceY)) {
      if (playerBottomY < groundSurfaceY) {
        player.position.y = groundSurfaceY + currentPlayerHeight / 2;
        velY = 0;
        onGround = true;
      } else {
        // Small margin check for "on ground" detection (for jumping)
        const groundCheckY = cm.getGroundAtWorld(player.position.x, playerBottomY - 0.05, player.position.z);
        onGround = isFinite(groundCheckY) && (playerBottomY - groundCheckY) < 0.1;
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
    while (accumulator >= FIXED_DT) {
      updatePhysics(FIXED_DT);
      accumulator -= FIXED_DT;
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
    sunPos.set(Math.cos(angle) * sunDist, Math.sin(angle) * sunDist, Math.sin(angle * 0.5) * -200);
    sunMesh.position.copy(sunPos);
    sunLight.position.copy(sunPos);

    // moon opposite the sun
    const moonAngle = angle + Math.PI;
    moonPos.set(Math.cos(moonAngle) * sunDist, Math.sin(moonAngle) * sunDist, Math.sin(moonAngle * 0.5) * -200);
    moonMesh.position.copy(moonPos);
    moonLight.position.copy(moonPos);

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

    // update debug overlay (throttled to reduce raycast overhead)
    if (showDebug && time - lastDebugUpdate > debugUpdateInterval) {
      lastDebugUpdate = time;
      // target center of screen - limit raycast distance for performance
      raycaster.setFromCamera(tempVec2.set(0, 0), camera);
      raycaster.far = 50; // Limit raycast distance
      const intersects = raycaster.intersectObjects(scene.children, true);
      let targetInfo = null;
      if (intersects.length > 0) {
        const p = intersects[0].point;
        const dist = intersects[0].distance;
        const bx = Math.floor(p.x / blockSize);
        const by = Math.floor((p.y - MIN_Y * blockSize) / blockSize) + MIN_Y;
        const bz = Math.floor(p.z / blockSize);
        const id = cm.getBlockAtWorld(p.x, p.y, p.z);
        targetInfo = { blockX: bx, blockY: by, blockZ: bz, id, dist };
      }
      const mem = (performance && performance.memory) ? { usedMB: performance.memory.usedJSHeapSize/1024/1024, totalMB: performance.memory.jsHeapSizeLimit/1024/1024 } : null;
      debugOverlay.update({ delta: frameDelta, playerPos: player.position, chunkX: Math.floor(player.position.x / (CHUNK_SIZE*blockSize)), chunkZ: Math.floor(player.position.z / (CHUNK_SIZE*blockSize)), target: targetInfo, loadedChunks: cm.chunks.size, memory: mem });
    }
    // If third-person, make sure camera looks at player's head
    if (isThirdPerson) {
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
let prevTime = startTimeMarker;
minimalTest();
