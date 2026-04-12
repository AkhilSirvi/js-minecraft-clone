import * as THREE from "./three.module.js";
import { initMenu, gameSettings } from "./GUI.js";
import { createClouds } from "./clouds.js";
import { CHUNK_SIZE, MIN_Y, getBiomeAtWorld } from "./chunkGen.js";
import ChunkManager, { isBlockPassable } from "./chunkManager.js";
import { initInteraction } from "./interaction.js";
import BlockBreaker from "./blockBreaker.js";
import { ItemDropManager } from "./itemDropManager.js";
import { ItemRenderer } from "./itemRenderer.js";
import createDebugOverlay from "./debugOverlay.js";
import { hud, initializeHUD } from "./hud.js";
import { createPlayerAvatarParts } from "./playerAvatarModel.js";
import createChat from "./chat.js";
import {
  SEED,
  PLAYER,
  PHYSICS,
  RENDER,
  DAY_NIGHT,
  CAMERA,
} from "./config.js";
import WaterPhysics, { WATER_CONFIG } from "./waterPhysics.js";

export function main() {
  const scene = new THREE.Scene();
  scene.background = null;

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  //Star Field
  const _starCount = DAY_NIGHT.starCount || 1500;
  const _starRadius = DAY_NIGHT.orbitDistance * 0.95;
  const _starPositions = new Float32Array(_starCount * 3);
  const _starPhases = new Float32Array(_starCount);
  const _starBrightness = new Float32Array(_starCount);

  const _starSeed = (typeof SEED === "number" ? SEED : 0) ^ 0x9e3779b9;
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const _starRng = mulberry32(_starSeed);

  for (let i = 0; i < _starCount; i++) {
    const theta = _starRng() * Math.PI * 2;
    const phi = Math.acos(_starRng()); // upper hemisphere only (0 to PI/2)
    _starPositions[i * 3] = _starRadius * Math.sin(phi) * Math.cos(theta);
    _starPositions[i * 3 + 1] = _starRadius * Math.cos(phi);
    _starPositions[i * 3 + 2] = _starRadius * Math.sin(phi) * Math.sin(theta);
    _starPhases[i] = _starRng() * Math.PI * 2;
    _starBrightness[i] = 0.3 + _starRng() * 0.7;
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(_starPositions, 3),
  );
  starGeometry.setAttribute(
    "aPhase",
    new THREE.BufferAttribute(_starPhases, 1),
  );
  starGeometry.setAttribute(
    "aBrightness",
    new THREE.BufferAttribute(_starBrightness, 1),
  );

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aBrightness;
      uniform float uTime;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = 1.5 + aBrightness * ${((DAY_NIGHT.starSize || 2.5) - 1.5).toFixed(1)};
        float twinkle = sin(uTime * ${(DAY_NIGHT.starTwinkleSpeed || 1.8).toFixed(1)} + aPhase * 6.2831) * 0.35 + 0.65;
        vAlpha = uOpacity * twinkle * aBrightness;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(0.95, 0.95, 1.0, vAlpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  const starField = new THREE.Points(starGeometry, starMaterial);
  starField.renderOrder = -1;
  scene.add(starField);

  const skyColorDay = new THREE.Color(DAY_NIGHT.skyDayColor);
  const skyColorNight = new THREE.Color(DAY_NIGHT.skyNightColor);
  const skyColorDawn = new THREE.Color(DAY_NIGHT.skyDawnColor || 0xffa46e);
  const skyColorDusk = new THREE.Color(DAY_NIGHT.skyDuskColor || 0xff7840);
  const currentSkyColor = new THREE.Color(DAY_NIGHT.skyDayColor);

  // Horizon color variants
  const skyColorDayHorizon = new THREE.Color(
    DAY_NIGHT.skyDayHorizonColor || 0xb8d4ff,
  );
  const skyColorNightHorizon = new THREE.Color(
    DAY_NIGHT.skyNightHorizonColor || 0x060d1a,
  );
  const skyColorDawnHorizon = new THREE.Color(
    DAY_NIGHT.skyDawnHorizonColor || 0xff8c2a,
  );
  const skyColorDuskHorizon = new THREE.Color(
    DAY_NIGHT.skyDuskHorizonColor || 0xff4d10,
  );
  const currentSkyZenith = new THREE.Color(DAY_NIGHT.skyDayColor);
  const currentSkyHorizon = new THREE.Color(
    DAY_NIGHT.skyDayHorizonColor || 0xb8d4ff,
  );

  const _skyDomeRadius = DAY_NIGHT.orbitDistance * 1.18;
  const skyDomeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uZenithColor: { value: currentSkyZenith },
      uHorizonColor: { value: currentSkyHorizon },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      varying vec3 vDir;
      void main() {
        float h = vDir.y; // -1 (nadir) to 1 (zenith); 0 = horizon
        // Blend from horizon (h=0) up to zenith (h=1)
        float t = smoothstep(0.0, 0.5, h);
        vec3 color = mix(uHorizonColor, uZenithColor, t);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(_skyDomeRadius, 20, 14),
    skyDomeMaterial,
  );
  skyDome.renderOrder = -2;
  scene.add(skyDome);

  // Cloud tinting (pre-allocated)
  const _cloudDayColor = new THREE.Color(0xffffff);
  const _cloudNightColor = new THREE.Color(0x191933);
  const _cloudWarmColor = new THREE.Color(0xffd4a0);
  const _cloudTint = new THREE.Color();

  const clouds = createClouds(scene, {
    planeSize: 2048,
    centerY: 192,
    thickness: 5,
    pixelScale: 10,
  });

  const CYCLE_LENGTH = DAY_NIGHT.cycleLength;
  const BASE_TICKS_PER_SECOND = 20; // baseline tick rate (normal speed)
  let ticksPerSecond = 20; // adjustable tick speed
  let tickCount = 0;
  let tickRemainder = 0;
  const cycleStart = 850;

  const celestialPos = new THREE.Vector3();

  let frameCount = 0;
  let lastFpsUpdate = performance.now();

  const blockSize = 1;
  const debugOverlay = createDebugOverlay();
  const chat = createChat();
  
  // Connect chat to debug overlay
  debugOverlay.setChat(chat);
  
  let showDebug = false;
  let lastDebugUpdate = 0;
  const debugUpdateInterval = 150;
  window.addEventListener("keydown", (e) => {
    if (e.code === "F3") {
      debugOverlay.toggle();
      showDebug = !showDebug;
    }
    // Open chat with 'T' key (when not already in chat input)
    if (e.code === "KeyT" && !chat.isOpen) {
      chat.open();
      e.preventDefault();
    }
  });

  const cm = new ChunkManager(scene, {
    seed: SEED,
    blockSize,
    viewDistance: gameSettings.viewDistance,
    debugOverlay,
  });

  // Make chat accessible globally
  window.gameChat = chat;
  const originalConsoleError = console.error;
  console.error = function(...args) {
    originalConsoleError.apply(console, args);
    const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    chat.log(`[ERROR] ${message}`, 'error');
  };

  // Initialize 3D item renderer and HUD
  const itemRenderer = new ItemRenderer(cm);
  initializeHUD(itemRenderer, cm.materials?.playerskin?.map || null);

  const sunTexture =
    cm.materials && cm.materials.sun && cm.materials.sun.map
      ? cm.materials.sun.map
      : null;
  const sunMaterial = new THREE.MeshBasicMaterial({
    map: sunTexture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  if (sunMaterial) sunMaterial.toneMapped = false;
  const sunMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(DAY_NIGHT.sunSize, DAY_NIGHT.sunSize),
    sunMaterial,
  );
  sunMesh.renderOrder = 9998;
  scene.add(sunMesh);
  const sunBackdropMaterial = new THREE.MeshBasicMaterial({
    color:
      DAY_NIGHT.sunBackdropColor !== undefined
        ? DAY_NIGHT.sunBackdropColor
        : 0x000000,
    side: THREE.DoubleSide,
    depthWrite: false,
    transparent: true,
    opacity: 0,
  });
  if (sunBackdropMaterial) sunBackdropMaterial.toneMapped = false;
  const sunBackdropMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(DAY_NIGHT.sunSize * 0.25, DAY_NIGHT.sunSize * 0.25),
    sunBackdropMaterial,
  );
  sunBackdropMesh.renderOrder = 9997;
  scene.add(sunBackdropMesh);

  // === MOON WITH PHASES TEXTURE (4 cols x 2 rows sprite sheet) ===
  const moonPhasesTexture =
    cm.materials && cm.materials.moonPhases && cm.materials.moonPhases.map
      ? cm.materials.moonPhases.map
      : null;
  if (moonPhasesTexture) {
    moonPhasesTexture.repeat.set(1 / 4, 1 / 2);
    moonPhasesTexture.offset.set(0, 0.5);
  }
  const moonMaterial = new THREE.MeshBasicMaterial({
    map: moonPhasesTexture,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  if (moonMaterial) moonMaterial.toneMapped = false;
  const moonMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(DAY_NIGHT.moonSize, DAY_NIGHT.moonSize),
    moonMaterial,
  );
  moonMesh.renderOrder = 9998;
  scene.add(moonMesh);
  let lastMoonCycleIndex = -1;
  let currentMoonPhase = 0;
  const MOON_PHASE_COUNT = 8;
  const MOON_COLS = 4;
  const MOON_ROWS = 2;

  let waterPhysics = null;
  try {
    waterPhysics = new WaterPhysics(cm, scene);
  } catch (error) {
    console.error("Failed to initialize water physics:", error);
    console.error("Error stack:", error.stack);
  }

  const raycaster = new THREE.Raycaster();
  const tempLocalPoint = new THREE.Vector3();
  const tempWorldPoint = new THREE.Vector3();
  const tempVec2 = new THREE.Vector2();

  const highlightMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    depthTest: true,
    transparent: true,
    opacity: 0.6,
  });
  const highlightGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(1.0, 1.0, 1.0),
  );
  const highlightBox = new THREE.LineSegments(
    highlightGeometry,
    highlightMaterial,
  );
  highlightBox.renderOrder = 9999;
  highlightBox.visible = false;
  scene.add(highlightBox);

  function isPlayerPositionFree(testX, testY, testZ, height = null) {
    const bs = blockSize;
    const checkHeight = height !== null ? height : currentPlayerHeight;
    const halfHeight = checkHeight / 2;
    const bottomY = testY - halfHeight;
    const topY = testY + halfHeight;
    const playerMinX = testX - playerHalfWidth;
    const playerMaxX = testX + playerHalfWidth;
    const playerMinZ = testZ - playerHalfDepth;
    const playerMaxZ = testZ + playerHalfDepth;
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
          // Use conservative mode: treat unloaded chunks as solid to prevent phasing through
          const id = cm.getBlockAtWorld(
            bx * bs + 0.5 * bs,
            by * bs + 0.5 * bs,
            bz * bs + 0.5 * bs,
            true,
          );
          if (!isBlockPassable(id)) return false;
        }
      }
    }
    return true;
  }

  function resolvePlayerCollision() {
    const bs = blockSize;
    const maxPushDist = 2.0;
    const pushStep = 0.001;
    if (
      isPlayerPositionFree(
        player.position.x,
        player.position.y,
        player.position.z,
      )
    ) {
      return;
    }
    for (let dy = pushStep; dy <= maxPushDist; dy += pushStep) {
      if (
        isPlayerPositionFree(
          player.position.x,
          player.position.y + dy,
          player.position.z,
        )
      ) {
        player.position.y += dy;
        velY = 0;
        return;
      }
    }
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
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

  const spawnWorldX = PLAYER.spawnX,
    spawnWorldZ = PLAYER.spawnZ;
  // Use synchronous loading for spawn to ensure chunk is loaded before player spawns
  let spawnY = cm.getTopAtWorld(spawnWorldX, spawnWorldZ, true);
  if (!isFinite(spawnY)) spawnY = (MIN_Y + 1) * blockSize;
  const spawnX = spawnWorldX;
  const spawnZ = spawnWorldZ;
  const camera = new THREE.PerspectiveCamera(
    gameSettings.fov,
    window.innerWidth / window.innerHeight,
    RENDER.nearClip,
    RENDER.farClip,
  );
  let defaultFov = gameSettings.fov;
  let sprintFov = defaultFov + 15;
  let targetFov = defaultFov;
  let fovLerpSpeed = 0.15;
  const playerWidth = blockSize * PLAYER.width;
  const playerHeight = blockSize * PLAYER.height;
  const playerHalfWidth = playerWidth / 2;
  const playerHalfDepth = playerWidth / 2;
  let isThirdPerson = false;
  let isSpectator = false;
  const spectatorPos = new THREE.Vector3();
  let spectatorYaw = 0;
  let spectatorPitch = 0;
  const spectatorSpeedBase = 10.0;
  let spectatorSpeedMultiplier = 1.0; // adjusted via mouse wheel while spectating
  const fpCameraLocalPos = new THREE.Vector3(0, 0, 0);
  const tpCameraLocalPos = new THREE.Vector3(0, 0, CAMERA.thirdPersonDistance);
  const player = new THREE.Object3D();

  const playerMaterial = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0,
    alphaTest: 0.1,
  });
  const playerGeometry = new THREE.BoxGeometry(
    playerWidth,
    playerHeight,
    playerWidth,
  );
  const playerModel = new THREE.Mesh(playerGeometry, playerMaterial);
  playerModel.castShadow = true;
  playerModel.receiveShadow = true;
  playerModel.position.set(0, 0, 0);
  playerModel.visible = false;
  player.add(playerModel);

  const {
    head: player_head,
    body: player_body,
    leftArm: player_leftArm,
    rightArm: player_rightArm,
    leftLeg: player_leftLeg,
    rightLeg: player_rightLeg,
  } = createPlayerAvatarParts(cm.materials?.playerskin?.map || null);

  // Create pivot objects so limbs rotate about their top ends
  const player_leftArmPivot = new THREE.Object3D();
  const player_rightArmPivot = new THREE.Object3D();
  const player_leftLegPivot = new THREE.Object3D();
  const player_rightLegPivot = new THREE.Object3D();

  function toggleThirdPerson() {
    isThirdPerson = !isThirdPerson;
    try {
      document.exitPointerLock && document.exitPointerLock();
    } catch (e) {}
    playerModel.visible = isThirdPerson;
    player_head.visible = isThirdPerson;
    player_body.visible = isThirdPerson;
    player_leftArmPivot.visible = isThirdPerson;
    player_rightArmPivot.visible = isThirdPerson;
    player_leftLegPivot.visible = isThirdPerson;
    player_rightLegPivot.visible = isThirdPerson;
    if (isThirdPerson) {
      camera.position.copy(tpCameraLocalPos);
    } else {
      camera.position.copy(fpCameraLocalPos);
      camera.rotation.set(0, 0, 0);
    }
  }

  player.position.set(spawnX, spawnY + playerHeight / 2, spawnZ);
  scene.add(player);

  const pitchObject = new THREE.Object3D();
  pitchObject.position.y = playerHeight * CAMERA.eyeHeight;
  pitchObject.add(camera);
  player.add(pitchObject);

  // Attach head mesh to player so it follows position and yaw.
  player_head.position.set(0, playerHeight - 1, 0);
  player.add(player_head);
  player_head.visible = false;
  player_body.position.set(0, playerHeight / 2 - 0.7, 0);
  player.add(player_body);
  player_body.visible = false;
  // Position and attach arms using pivots (rotate about top end)
  const armOffsetX = 0.4;
  const armCenterY = playerHeight / 2 - 0.75; // previous center-based Y
  const armHeight = 0.9;
  const armTopY = armCenterY + armHeight / 2;
  // place mesh inside pivot so top of mesh is at pivot (mesh local Y is -halfHeight)
  player_leftArm.position.set(0, -armHeight / 2, 0);
  player_rightArm.position.set(0, -armHeight / 2, 0);
  player_leftArmPivot.position.set(-armOffsetX, armTopY, 0);
  player_rightArmPivot.position.set(armOffsetX, armTopY, 0);
  player_leftArmPivot.add(player_leftArm);
  player_rightArmPivot.add(player_rightArm);
  player.add(player_leftArmPivot);
  player.add(player_rightArmPivot);
  player_leftArmPivot.visible = false;
  player_rightArmPivot.visible = false;
  // Position and attach legs using pivots (rotate about top/hip)
  const legOffsetX = 0.125;
  const legHeight = 0.75;
  const legCenterY = -0.272; // previous center-based Y
  const legTopY = legCenterY + legHeight / 2;
  player_leftLeg.position.set(0, -legHeight / 2 + legCenterY, 0);
  player_rightLeg.position.set(0, -legHeight / 2 + legCenterY, 0);
  player_leftLegPivot.position.set(-legOffsetX, legTopY, 0);
  player_rightLegPivot.position.set(legOffsetX, legTopY, 0);
  player_leftLegPivot.add(player_leftLeg);
  player_rightLegPivot.add(player_rightLeg);
  player.add(player_leftLegPivot);
  player.add(player_rightLegPivot);
  player_leftLegPivot.visible = false;
  player_rightLegPivot.visible = false;

  function updateThirdPersonCameraCollision() {
    if (!isThirdPerson) return;
    const headWorld = new THREE.Vector3(
      player.position.x,
      player.position.y + currentPlayerHeight * CAMERA.eyeHeight,
      player.position.z,
    );
    const desiredLocal = tpCameraLocalPos.clone();
    const desiredWorld = desiredLocal.clone();
    pitchObject.localToWorld(desiredWorld);

    const dir = desiredWorld.clone().sub(headWorld);
    const dist = dir.length();
    if (dist <= 0.0001) {
      camera.position.copy(tpCameraLocalPos);
      return;
    }
    dir.normalize();

    const step = 0.1;
    let lastFree = headWorld.clone();
    let blocked = false;
    for (let d = 0; d <= dist; d += step) {
      const sx = headWorld.x + dir.x * d;
      const sy = headWorld.y + dir.y * d;
      const sz = headWorld.z + dir.z * d;
      // Use conservative mode to prevent camera clipping through unloaded chunks
      const id = cm.getBlockAtWorld(sx, sy, sz, true);
      if (!isBlockPassable(id)) {
        blocked = true;
        break;
      }
      lastFree.set(sx, sy, sz);
    }

    const MIN_DIST = 0.5;
    const BACKOFF = 0.25;
    let finalWorld = desiredWorld;
    if (blocked) {
      const toLast = lastFree.clone().sub(headWorld);
      const len = toLast.length();
      if (len < MIN_DIST) {
        finalWorld = headWorld
          .clone()
          .add(dir.clone().multiplyScalar(MIN_DIST));
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

    const lookDir = new THREE.Vector3(0, 0, -1);
    camera.getWorldDirection(lookDir);

    const nearClipDist = 0.25;
    const checkX = eyeWorldX + lookDir.x * nearClipDist;
    const checkY = eyeWorldY + lookDir.y * nearClipDist;
    const checkZ = eyeWorldZ + lookDir.z * nearClipDist;
    // Use conservative mode for camera collision to prevent clipping through unloaded chunks
    const eyeBlockId = cm.getBlockAtWorld(
      eyeWorldX,
      eyeWorldY,
      eyeWorldZ,
      true,
    );
    const lookBlockId = cm.getBlockAtWorld(checkX, checkY, checkZ, true);
    const aboveBlockId = cm.getBlockAtWorld(
      eyeWorldX,
      eyeWorldY + 0.25,
      eyeWorldZ,
      true,
    );
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
        // Use conservative mode for camera collision
        const testBlockId = cm.getBlockAtWorld(testX, testY, testZ, true);
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

  window.teleport = function (x, y, z, opts = {}) {
    const nx = Number(x);
    const nz = Number(z);
    if (isNaN(nx) || isNaN(nz)) {
      console.error("teleport: invalid x or z");
      return;
    }

    cm.update(nx, nz);
    if (typeof cm.processLoadQueue === "function") {
      cm.processLoadQueue();
    }

    let ny;
    if (y === undefined || y === null || isNaN(Number(y))) {
      // Load destination chunk synchronously so getTopAtWorld returns a real value
      const top = cm.getTopAtWorld(nx, nz, true);
      ny = isFinite(top)
        ? top + currentPlayerHeight / 2
        : (MIN_Y + 1) * blockSize + currentPlayerHeight / 2;
    } else {
      ny = Number(y);
    }

    const safe = opts.safe !== false;
    if (safe) {
      const destCx = Math.floor(nx / (CHUNK_SIZE * blockSize));
      const destCz = Math.floor(nz / (CHUNK_SIZE * blockSize));
      if (cm.chunks && cm.chunks.has(cm._key(destCx, destCz))) {
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
        if (!placed)
          console.warn(
            "teleport: no free space found above target, placing at requested Y",
          );
      }
    }

    player.position.set(nx, ny, nz);
    velocity.set(0, 0, 0);
    velY = 0;
    onGround = false;
    fallDistance = 0;
    console.log(`Teleported player to (${nx}, ${ny}, ${nz})`);
  };
  window.tp = window.teleport;

  window.waterPhysics = waterPhysics;
  window.placeWater = (x, y, z) => {
    if (!waterPhysics) {
      console.error("Water physics not initialized");
      return null;
    }
    try {
      const waterBlock = waterPhysics.placeWater(x, y, z, true);
      console.log(`Water source placed at (${x}, ${y}, ${z})`);
      return waterBlock;
    } catch (error) {
      console.error("Error placing water:", error);
      return null;
    }
  };

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    preserveDrawingBuffer: false,
  });
  
  // HUD testing functions
  window.hud = hud;
  window.setHealth = (value) => {
    const previousHealth = hud.health;
    hud.health = Math.max(0, Math.min(hud.maxHealth, value));
    if (hud.health < previousHealth) {
      triggerDamageTilt(previousHealth - hud.health);
    }
    hud.updateHearts();
    console.log(`Health set to ${hud.health}`);
  };
  window.setHunger = (value) => {
    hud.hunger = Math.max(0, Math.min(hud.maxHunger, value));
    hud.updateHunger();
    console.log(`Hunger set to ${hud.hunger}`);
  };
  window.addXP = (value) => {
    hud.addXP(value);
    console.log(`Added ${value} XP. Level: ${hud.xpLevel}`);
  };

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(RENDER.maxPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(DAY_NIGHT.skyDayColor, 1);
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.left = "0";
  renderer.domElement.style.top = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.zIndex = "0";
  document.body.appendChild(renderer.domElement);

  const loadingOverlay = document.createElement("div");
  loadingOverlay.style.position = "fixed";
  loadingOverlay.style.inset = "0";
  loadingOverlay.style.display = "flex";
  loadingOverlay.style.flexDirection = "column";
  loadingOverlay.style.alignItems = "center";
  loadingOverlay.style.justifyContent = "center";
  loadingOverlay.style.gap = "10px";
  loadingOverlay.style.background = "linear-gradient(180deg, rgba(14,24,38), rgba(9,15,24))";
  loadingOverlay.style.color = "#e8f3ff";
  loadingOverlay.style.fontFamily = "Minecraftia, monospace";
  loadingOverlay.style.zIndex = "12000";
  loadingOverlay.style.pointerEvents = "auto";

  const loadingTitle = document.createElement("div");
  loadingTitle.textContent = "Loading world";
  loadingTitle.style.fontSize = "22px";
  loadingTitle.style.letterSpacing = "1px";

  const loadingStatus = document.createElement("div");
  loadingStatus.style.fontSize = "13px";
  loadingStatus.textContent = "Preparing chunks...";

  const loadingHint = document.createElement("div");
  loadingHint.style.fontSize = "11px";
  loadingHint.textContent = "Please wait";

  loadingOverlay.appendChild(loadingTitle);
  loadingOverlay.appendChild(loadingStatus);
  loadingOverlay.appendChild(loadingHint);
  document.body.appendChild(loadingOverlay);

  let worldReady = false;
  let loadingOverlayHidden = false;
  const loadingStartedAt = performance.now();
  const MIN_LOADING_VISIBLE_MS = 4800;
  const READY_HOLD_MS = 700;
  const MAX_LOADING_VISIBLE_MS = 7000;
  let chunksReadyAt = null;

  function countLoadedChunksInRenderRange() {
    const playerChunkX = Math.floor(player.position.x / (CHUNK_SIZE * blockSize));
    const playerChunkZ = Math.floor(player.position.z / (CHUNK_SIZE * blockSize));
    const radius = cm.viewDistance;
    let totalInRange = 0;
    let loadedInRange = 0;

    for (let cx = playerChunkX - radius; cx <= playerChunkX + radius; cx++) {
      for (let cz = playerChunkZ - radius; cz <= playerChunkZ + radius; cz++) {
        const dx = cx - playerChunkX;
        const dz = cz - playerChunkZ;
        if (dx * dx + dz * dz > radius * radius) continue;
        totalInRange++;
        if (cm.chunks.has(`${cx},${cz}`)) loadedInRange++;
      }
    }

    return { loadedInRange, totalInRange };
  }

  function hideLoadingOverlay() {
    if (loadingOverlayHidden) return;
    loadingOverlayHidden = true;
    loadingOverlay.style.transition = "opacity 220ms ease";
    loadingOverlay.style.opacity = "0";
    setTimeout(() => {
      if (loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
      }
    }, 240);
  }

  function updateLoadingOverlay() {
    const nowMs = performance.now();
    const totalVisibleElapsed = nowMs - loadingStartedAt;
    const { loadedInRange, totalInRange } = countLoadedChunksInRenderRange();
    const requiredChunks = Math.min(3, Math.max(1, totalInRange));

    loadingStatus.textContent = `Chunks loading`;

    if (!loadingOverlayHidden && totalVisibleElapsed >= MAX_LOADING_VISIBLE_MS) {
      worldReady = true;
      loadingHint.textContent = "Loading continued in background...";
      hideLoadingOverlay();
      return true;
    }
    

    if (!worldReady && loadedInRange >= requiredChunks) {
      worldReady = true;
      chunksReadyAt = nowMs;
      loadingHint.textContent = "Finalizing world...";
    }

    if (worldReady && !loadingOverlayHidden) {
      const readyElapsed = chunksReadyAt === null ? 0 : nowMs - chunksReadyAt;
      const canClose = readyElapsed >= READY_HOLD_MS && totalVisibleElapsed >= MIN_LOADING_VISIBLE_MS;
      if (!canClose) return false;

      hideLoadingOverlay();
    }

    return worldReady;
  }

  renderer.domElement.addEventListener("click", () => {
    if (!chat.isOpen) {
      renderer.domElement.requestPointerLock();
    }
  });

  function getFirstPersonRay() {
    if (isSpectator) {
      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      return { origin, dir };
    }
    const eyeY = player.position.y + pitchObject.position.y;
    const origin = new THREE.Vector3(
      player.position.x,
      eyeY,
      player.position.z,
    );
    const pitch = pitchObject.rotation.x;
    const yaw = player.rotation.y;
    const dir = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    dir.normalize();

    return { origin, dir };
  }

  const blockBreaker = new BlockBreaker(cm, scene, camera, {
    reach: PLAYER.blockreach,
    getFirstPersonRay,
  });

  // Initialize item drop manager with chunk manager for collision detection
  const itemDropManager = new ItemDropManager(scene, cm, cm.materials);

  // Set up block broken callback to drop items
  blockBreaker.onBlockBroken = (x, y, z, blockId) => {
    itemDropManager.addDrop(x, y, z, blockId);
  };

  initInteraction(cm, camera, renderer.domElement, {
    placeBlockId: 2,
    reach: PLAYER.blockreach,
    blockBreaker,
    getFirstPersonRay,
    shouldDisableInput: () => chat.isOpen,
    getPlaceBlockId: () => {
      // Get the block ID from selected hotbar item
      const selectedItem = hud.inventory[hud.selectedSlot];
      return selectedItem && selectedItem.id ? selectedItem.id : 0;
    },
    onPlaceBlock: (blockId) => {
      // Decrease item count when block is placed
      const selectedItem = hud.inventory[hud.selectedSlot];
      if (selectedItem && selectedItem.id === blockId && selectedItem.count > 1) {
        selectedItem.count--;
        hud.updateHotbar();
      } else if (selectedItem && selectedItem.id === blockId && selectedItem.count === 1) {
        // Remove item if count reaches 0
        selectedItem.id = null;
        selectedItem.count = 0;
        hud.updateHotbar();
      }
    },
    getPlayerAABB: () => ({
      minX: player.position.x - playerHalfWidth,
      maxX: player.position.x + playerHalfWidth,
      minY: player.position.y - currentPlayerHeight / 2,
      maxY: player.position.y + currentPlayerHeight / 2,
      minZ: player.position.z - playerHalfDepth,
      maxZ: player.position.z + playerHalfDepth,
    }),
  });

  const move = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    up: false,
    down: false,
  };

  let targetInfo = null;

  let isCrouching = false;
  const standingHeight = playerHeight;
  const crouchingHeight = blockSize * PLAYER.crouchHeight;
  let currentPlayerHeight = standingHeight;

  const PI_2 = Math.PI / 2;
  function onMouseMove(e) {
    if (document.pointerLockElement !== renderer.domElement) return;
    if (chat.isOpen) return;
    const movementX = e.movementX || 0;
    const movementY = e.movementY || 0;
    if (isSpectator) {
      spectatorYaw -= movementX * gameSettings.mouseSensitivity;
      spectatorPitch -= movementY * gameSettings.mouseSensitivity;
      spectatorPitch = Math.max(
        -PI_2 + 0.01,
        Math.min(PI_2 - 0.01, spectatorPitch),
      );
      camera.rotation.set(spectatorPitch, spectatorYaw, 0, "YXZ");
    } else {
      player.rotation.y -= movementX * gameSettings.mouseSensitivity;
      pitchObject.rotation.x -= movementY * gameSettings.mouseSensitivity;
      pitchObject.rotation.x = Math.max(
        -PI_2 + 0.01,
        Math.min(PI_2 - 0.01, pitchObject.rotation.x),
      );
    }
  }

  function onKeyDown(e) {
    // Skip game input if chat is open
    if (chat.isOpen) return;
    
    switch (e.code) {
      case "KeyH":
        e.preventDefault();
        // Toggle spectator mode
        isSpectator = !isSpectator;
        if (isSpectator) {
          // Save current visibility state so we can restore on exit
          const _saved = {
            model: playerModel.visible,
            head: player_head.visible,
            body: player_body.visible,
            leftArmPivot: player_leftArmPivot.visible,
            rightArmPivot: player_rightArmPivot.visible,
            leftLegPivot: player_leftLegPivot.visible,
            rightLegPivot: player_rightLegPivot.visible,
            _marker: true,
          };
          // attach to camera userdata so it's accessible when exiting
          camera.userData._spectatorSavedVisibility = _saved;

          // Detach camera from player and place at current world position
          const worldPos = new THREE.Vector3();
          camera.getWorldPosition(worldPos);
          const worldQuat = camera.getWorldQuaternion(new THREE.Quaternion());
          pitchObject.remove(camera);
          scene.add(camera);
          camera.position.copy(worldPos);
          camera.quaternion.copy(worldQuat);
          // initialize spectator yaw/pitch from camera
          const euler = new THREE.Euler().setFromQuaternion(worldQuat, "YXZ");
          spectatorYaw = euler.y;
          spectatorPitch = euler.x;
          spectatorPos.copy(worldPos);

          // Ensure the player's body remains visible while spectating
          playerModel.visible = true;
          player_head.visible = true;
          player_body.visible = true;
          player_leftArmPivot.visible = true;
          player_rightArmPivot.visible = true;
          player_leftLegPivot.visible = true;
          player_rightLegPivot.visible = true;
        } else {
          // Re-attach camera to player
          scene.remove(camera);
          pitchObject.add(camera);
          camera.position.set(0, 0, 0);
          camera.rotation.set(0, 0, 0);

          // Restore previously saved visibility state
          const saved = camera.userData._spectatorSavedVisibility;
          if (saved && saved._marker) {
            playerModel.visible = saved.model;
            player_head.visible = saved.head;
            player_body.visible = saved.body;
            player_leftArmPivot.visible = saved.leftArmPivot;
            player_rightArmPivot.visible = saved.rightArmPivot;
            player_leftLegPivot.visible = saved.leftLegPivot;
            player_rightLegPivot.visible = saved.rightLegPivot;
            delete camera.userData._spectatorSavedVisibility;
          }
        }
        break;
      case "F5":
        e.preventDefault();
        toggleThirdPerson();
        break;
      case "KeyB":
        try {
          cm.toggleChunkBorders();
        } catch (err) {
          console.warn("toggleChunkBorders error", err);
        }
        break;
      case "KeyQ":
        e.preventDefault();
        if (!waterPhysics) {
          console.log("Water physics not initialized");
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
            if (
              bid !== 0 &&
              Math.floor(p.x) === blockX &&
              Math.floor(p.y) === blockY &&
              Math.floor(p.z) === blockZ
            ) {
              hitPoint = p;
              break;
            }
          }

          if (!hitPoint) {
            console.log("Could not find hit point");
            break;
          }

          const localX = hitPoint.x - blockX;
          const localY = hitPoint.y - blockY;
          const localZ = hitPoint.z - blockZ;

          let placeX = blockX;
          let placeY = blockY;
          let placeZ = blockZ;

          const faces = [
            { name: "left", dist: localX, dx: -1, dy: 0, dz: 0 },
            { name: "right", dist: 1 - localX, dx: 1, dy: 0, dz: 0 },
            { name: "bottom", dist: localY, dx: 0, dy: -1, dz: 0 },
            { name: "top", dist: 1 - localY, dx: 0, dy: 1, dz: 0 },
            { name: "front", dist: localZ, dx: 0, dy: 0, dz: -1 },
            { name: "back", dist: 1 - localZ, dx: 0, dy: 0, dz: 1 },
          ];

          faces.sort((a, b) => a.dist - b.dist);
          const closestFace = faces[0];

          placeX += closestFace.dx;
          placeY += closestFace.dy;
          placeZ += closestFace.dz;

          // Use conservative mode: prevent placing blocks in unloaded chunks
          const checkBlockId = cm.getBlockAtWorld(
            placeX + 0.5,
            placeY + 0.5,
            placeZ + 0.5,
            true,
          );

          if (checkBlockId !== 0) {
            console.log(
              "Cannot place water - position occupied by block",
              checkBlockId,
            );
            break;
          }

          try {
            const waterBlock = waterPhysics.placeWater(
              placeX,
              placeY,
              placeZ,
              true,
            );
          } catch (error) {
            console.error("Error placing water:", error);
          }
        }
        break;
      case "KeyW":
        move.forward = true;
        break;
      case "KeyS":
        move.backward = true;
        break;
      case "KeyA":
        move.left = true;
        break;
      case "KeyD":
        move.right = true;
        break;
      case "ControlLeft":
      case "ControlRight":
        move.sprint = true;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        if (isSpectator) move.down = true;
        else move.crouch = true;
        break;
      case "Space":
        e.preventDefault();
        if (isSpectator) {
          move.up = true;
          break;
        }
        if (onGround || (velY <= 0 && velY > -2)) {
          const bottomY = player.position.y - currentPlayerHeight / 2;
          const hx = playerHalfWidth * 0.98;
          const hz = playerHalfDepth * 0.98;
          const jumpSamples = [
            [0, 0],
            [-hx, -hz],
            [hx, -hz],
            [-hx, hz],
            [hx, hz],
            [0, -hz],
            [0, hz],
            [-hx, 0],
            [hx, 0],
          ];
          let hasGroundNearby = onGround;
          if (!hasGroundNearby) {
            for (const [ox, oz] of jumpSamples) {
              const sx = player.position.x + ox;
              const sz = player.position.z + oz;
              const gy = cm.getGroundAtWorld(sx, bottomY, sz);
              if (isFinite(gy) && bottomY - gy < 0.35) {
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
      case "Digit1":
      case "Digit2":
      case "Digit3":
      case "Digit4":
      case "Digit5":
      case "Digit6":
      case "Digit7":
      case "Digit8":
      case "Digit9":
        // Hotbar selection (1-9)
        const slotNum = parseInt(e.code[5]) - 1;
        hud.selectSlot(slotNum);
        e.preventDefault();
        break;
      case "KeyE":
        hud.toggleInventory();
        e.preventDefault();
        break;
    }
  }

  function onKeyUp(e) {
    // Skip if chat is open
    if (chat.isOpen) return;
    
    switch (e.code) {
      case "KeyW":
        move.forward = false;
        break;
      case "KeyS":
        move.backward = false;
        break;
      case "KeyA":
        move.left = false;
        break;
      case "KeyD":
        move.right = false;
        break;
      case "ControlLeft":
      case "ControlRight":
        move.sprint = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        if (isSpectator) move.down = false;
        else move.crouch = false;
        break;
      case "Space":
        if (isSpectator) {
          move.up = false;
        }
        break;
    }
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  // Adjust spectator movement speed with mouse wheel when spectating
  function onWheel(e) {
    if (!isSpectator) return;
    // Scrolling up -> increase speed, scrolling down -> decrease speed.
    const factor = e.deltaY < 0 ? 1.01 : 0.99;
    spectatorSpeedMultiplier = Math.max(0.05, spectatorSpeedMultiplier * factor)

  }
  document.addEventListener("wheel", onWheel, { passive: true });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let prevTime = performance.now();
  const LOAD_QUEUE_INTERVAL_MS = 33;
  let lastLoadQueueProcessAt = prevTime;
  let walkTimer = 0;
  let velY = 0;
  let onGround = true;
  let fallDistance = 0;

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
  const safeFallDistance = PHYSICS.safeFallDistance ?? 3;
  const fallDamageMultiplier = PHYSICS.fallDamageMultiplier ?? 1;
  const fallDamageFeetOffset = 0.05;

  let damageTilt = 0;
  let damageTiltVelocity = 0;
  const damageTiltMaxAngle = 0.22;
  const damageTiltMinKick = 0.04;
  const damageTiltPerDamage = 0.015;
  const damageTiltMaxKick = 0.13;
  const damageTiltSpring = 280;
  const damageTiltDamping = 15;

  const tempFeetPos = new THREE.Vector3();

  function triggerDamageTilt(amount = 1) {
    const direction = Math.random() < 0.5 ? -1 : 1;
    const kick = Math.min(
      damageTiltMaxKick,
      damageTiltMinKick + Math.max(0, amount - 1) * damageTiltPerDamage,
    );
    damageTiltVelocity += direction * kick * 12;
  }

  function updateDamageTilt(dt) {
    damageTiltVelocity += -damageTilt * damageTiltSpring * dt;
    damageTiltVelocity *= Math.exp(-damageTiltDamping * dt);
    damageTilt += damageTiltVelocity * dt;

    if (damageTilt > damageTiltMaxAngle) damageTilt = damageTiltMaxAngle;
    if (damageTilt < -damageTiltMaxAngle) damageTilt = -damageTiltMaxAngle;

    if (Math.abs(damageTilt) < 0.0001 && Math.abs(damageTiltVelocity) < 0.0001) {
      damageTilt = 0;
      damageTiltVelocity = 0;
    }
  }

  function applyPlayerDamage(amount, source = "damage") {
    const damage = Math.max(0, Math.floor(amount));
    if (damage <= 0) return;

    triggerDamageTilt(damage);
    hud.health = Math.max(0, hud.health - damage);
    hud.updateHearts();
    console.log(
      `Player took ${damage} ${source}. Health: ${hud.health}/${hud.maxHealth}`,
    );
  }

  function calculateFallDamage(distance) {
    return Math.max(
      0,
      Math.ceil((distance - safeFallDistance) * fallDamageMultiplier),
    );
  }

  function shouldNegateFallDamage() {
    if (!waterPhysics || !WATER_CONFIG.preventsFallDamage) return false;
    if (typeof waterPhysics.isPlayerInWater !== "function") return false;

    tempFeetPos.set(
      player.position.x,
      player.position.y - currentPlayerHeight / 2 + fallDamageFeetOffset,
      player.position.z,
    );
    return Boolean(waterPhysics.isPlayerInWater(tempFeetPos));
  }

  const FIXED_DT = 1 / PHYSICS.physicsFPS;
  let accumulator = 0; // accumulator measured in GAME seconds (scaled by tick speed)

  function updatePhysics(dt) {
    if (isSpectator) {
      fallDistance = 0;
      const speed =
        spectatorSpeedBase *
        spectatorSpeedMultiplier *
        (move.sprint ? sprintMultiplier : 1) *
        (move.crouch ? crouchMultiplier : 1);
      // local inputs
      const mx = (move.right ? 1 : 0) - (move.left ? 1 : 0);
      const mz = (move.backward ? 1 : 0) - (move.forward ? 1 : 0);
      const mv = (move.up ? 1 : 0) - (move.down ? 1 : 0);
      let localDir = new THREE.Vector3();
      if (mx !== 0 || mz !== 0) {
        // rotate in XZ by spectatorYaw
        const cos = Math.cos(spectatorYaw);
        const sin = Math.sin(spectatorYaw);
        const worldX = mx * cos + mz * sin;
        const worldZ = mz * cos - mx * sin;
        localDir.set(worldX, mv, worldZ);
      } else {
        localDir.set(0, mv, 0);
      }
      if (localDir.lengthSq() > 0) {
        localDir.normalize();
        spectatorPos.addScaledVector(localDir, speed * dt);
      }
      camera.position.copy(spectatorPos);
      return;
    }
    const wasOnGround = onGround;
    resolvePlayerCollision();

    direction.set(0, 0, 0);
    if (move.forward) direction.z -= 1;
    if (move.backward) direction.z += 1;
    if (move.left) direction.x -= 1;
    if (move.right) direction.x += 1;

    if (direction.lengthSq() > 0) {
      direction.normalize();
      const cos = Math.cos(player.rotation.y);
      const sin = Math.sin(player.rotation.y);
      const worldDirX = direction.x * cos + direction.z * sin;
      const worldDirZ = direction.z * cos - direction.x * sin;
      direction.x = worldDirX;
      direction.z = worldDirZ;
    }

    const wantsToCrouch = move.crouch;
    const targetPlayerHeight = wantsToCrouch ? crouchingHeight : standingHeight;
    const heightLerpSpeed = 10.5;
    const prevHeight = currentPlayerHeight;
    currentPlayerHeight +=
      (targetPlayerHeight - currentPlayerHeight) *
      Math.min(1, heightLerpSpeed * dt);
    const heightDelta = currentPlayerHeight - prevHeight;
    player.position.y += heightDelta / 2;
    const heightThreshold = 0.01;
    isCrouching =
      Math.abs(currentPlayerHeight - crouchingHeight) < heightThreshold;
    playerModel.scale.y = currentPlayerHeight / standingHeight;
    playerModel.position.y = 0;
    pitchObject.position.y = currentPlayerHeight * CAMERA.eyeHeight;
    let currentMaxSpeed = maxSpeed;
    if (wantsToCrouch) {
      currentMaxSpeed = maxSpeed * crouchMultiplier;
    } else if (move.sprint && move.forward) {
      currentMaxSpeed = maxSpeed * sprintMultiplier;
    }
    if (
      move.sprint &&
      move.forward &&
      !wantsToCrouch &&
      (velocity.x !== 0 || velocity.z !== 0)
    ) {
      targetFov = sprintFov;
    } else {
      targetFov = defaultFov;
    }
    camera.fov += (targetFov - camera.fov) * fovLerpSpeed;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.updateProjectionMatrix();
    } else {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }

    const startBottomY = player.position.y - currentPlayerHeight / 2;

    const targetSpeed = direction.lengthSq() > 0 ? currentMaxSpeed : 0;
    const targetVelX = direction.x * targetSpeed;
    const targetVelZ = direction.z * targetSpeed;

    const accel = onGround ? groundAccel : airAccel;
    const friction = onGround ? groundFriction : airFriction;

    if (direction.lengthSq() > 0) {
      velocity.x += (targetVelX - velocity.x) * Math.min(1, accel * dt);
      velocity.z += (targetVelZ - velocity.z) * Math.min(1, accel * dt);
    } else {
      const frictionFactor = Math.max(0, 1 - friction * dt);
      velocity.x *= frictionFactor;
      velocity.z *= frictionFactor;
      if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
      if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
    }

    const horizSpeed = Math.hypot(velocity.x, velocity.z);
    if (horizSpeed > currentMaxSpeed) {
      velocity.x = (velocity.x / horizSpeed) * currentMaxSpeed;
      velocity.z = (velocity.z / horizSpeed) * currentMaxSpeed;
    }

    velY += gravity * dt;
    if (velY < terminalVelocity) velY = terminalVelocity;

    const moveX = velocity.x * dt;
    const moveZ = velocity.z * dt;
    function getMaxGroundAtPosition(px, pz, bottomY) {
      const hx = playerHalfWidth * 0.95;
      const hz = playerHalfDepth * 0.95;
      const samplesLocal = [
        [0, 0],
        [-hx, -hz],
        [hx, -hz],
        [-hx, hz],
        [hx, hz],
        [0, -hz],
        [0, hz],
        [-hx, 0],
        [hx, 0],
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

    if (moveX !== 0) {
      const newX = player.position.x + moveX;
      const currentBottomY = player.position.y - currentPlayerHeight / 2;
      const currentMaxGround = getMaxGroundAtPosition(
        player.position.x,
        player.position.z,
        currentBottomY,
      );
      const targetMaxGround = getMaxGroundAtPosition(
        newX,
        player.position.z,
        currentBottomY,
      );
      const CROUCH_MAX_DROP = 0.5;
      if (
        onGround &&
        wantsToCrouch &&
        isFinite(currentMaxGround) &&
        isFinite(targetMaxGround) &&
        currentMaxGround - targetMaxGround > CROUCH_MAX_DROP
      ) {
        velocity.x = 0;
      } else if (
        isPlayerPositionFree(newX, player.position.y, player.position.z)
      ) {
        player.position.x = newX;
      } else {
        velocity.x = 0;
      }
    }

    if (moveZ !== 0) {
      const newZ = player.position.z + moveZ;
      const currentBottomYz = player.position.y - currentPlayerHeight / 2;
      const currentMaxGroundZ = getMaxGroundAtPosition(
        player.position.x,
        player.position.z,
        currentBottomYz,
      );
      const targetMaxGroundZ = getMaxGroundAtPosition(
        player.position.x,
        newZ,
        currentBottomYz,
      );
      const CROUCH_MAX_DROP_Z = 0.5;
      if (
        onGround &&
        wantsToCrouch &&
        isFinite(currentMaxGroundZ) &&
        isFinite(targetMaxGroundZ) &&
        currentMaxGroundZ - targetMaxGroundZ > CROUCH_MAX_DROP_Z
      ) {
        velocity.z = 0;
      } else if (
        isPlayerPositionFree(player.position.x, player.position.y, newZ)
      ) {
        player.position.z = newZ;
      } else {
        velocity.z = 0;
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
        [-hx, -hz],
        [hx, -hz],
        [-hx, hz],
        [hx, hz],
        [0, -hz],
        [0, hz],
        [-hx, 0],
        [hx, 0],
      ];

      let lowestCeilingY = Infinity;
      const bs = blockSize;

      const startBlockY = Math.floor((currentTopY - MIN_Y * bs) / bs) + MIN_Y;
      const endBlockY = Math.floor((projectedTopY - MIN_Y * bs) / bs) + MIN_Y;

      for (let blockY = startBlockY; blockY <= endBlockY + 1; blockY++) {
        const checkY = blockY * bs + bs * 0.5;
        for (const [ox, oz] of ceilingSamples) {
          const sx = player.position.x + ox;
          const sz = player.position.z + oz;
          // Use conservative mode to prevent phasing through unloaded ceilings
          const headBlockId = cm.getBlockAtWorld(sx, checkY, sz, true);
          if (!isBlockPassable(headBlockId)) {
            const blockBottomWorldY = blockY * bs;
            if (
              blockBottomWorldY < lowestCeilingY &&
              blockBottomWorldY > currentTopY - 0.01
            ) {
              lowestCeilingY = blockBottomWorldY;
            }
          }
        }
      }

      if (isFinite(lowestCeilingY)) {
        const maxAllowedTopY = lowestCeilingY - 0.15;
        const maxAllowedMove = maxAllowedTopY - currentTopY;
        if (maxAllowedMove < moveY) {
          moveY = Math.max(0, maxAllowedMove);
          velY = 0;
        }
      }
    }

    player.position.y += moveY;

    const playerBottomY = player.position.y - currentPlayerHeight / 2;
    const hx = playerHalfWidth * 0.98;
    const hz = playerHalfDepth * 0.98;
    const samples = [
      [0, 0],
      [-hx, -hz],
      [hx, -hz],
      [-hx, hz],
      [hx, hz],
      [0, -hz],
      [0, hz],
      [-hx, 0],
      [hx, 0],
    ];

    let maxGroundY = -Infinity;
    let hasValidGroundData = false; // Track if any chunks are loaded beneath player
    for (const [ox, oz] of samples) {
      const sx = player.position.x + ox;
      const sz = player.position.z + oz;
      const gy = cm.getGroundAtWorld(sx, playerBottomY, sz);
      if (isFinite(gy)) {
        hasValidGroundData = true;
        if (gy > maxGroundY) maxGroundY = gy;
      }
    }

    if (isFinite(maxGroundY)) {
      if (playerBottomY < maxGroundY) {
        player.position.y = maxGroundY + currentPlayerHeight / 2;
        velY = 0;
        onGround = true;
      } else {
        const groundThreshold = velY <= 0 ? 0.25 : 0.1;
        onGround = playerBottomY - maxGroundY < groundThreshold;
      }
    } else {
      // No valid ground data - chunks not loaded yet
      if (!hasValidGroundData) {
        // Safety: chunks aren't loaded beneath player, reduce gravity to prevent falling through
        if (velY < 0) {
          velY *= 0.5; // Slow down falling while chunks load
        }
        // Keep onGround state to prevent freefall
        // onGround remains as it was (don't set to false)
      } else {
        onGround = false;
      }
    }

    const endBottomY = player.position.y - currentPlayerHeight / 2;
    if (!onGround) {
      const downwardDelta = startBottomY - endBottomY;
      if (downwardDelta > 0) {
        fallDistance += downwardDelta;
      }
    } else {
      if (!wasOnGround) {
        const fallDamage = calculateFallDamage(fallDistance);
        if (fallDamage > 0 && !shouldNegateFallDamage()) {
          applyPlayerDamage(fallDamage, "fall damage");
        }
      }
      fallDistance = 0;
    }
  }

  function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    let frameDelta = (time - prevTime) / 1000;
    prevTime = time;

    frameCount++;
    if (time - lastFpsUpdate >= 1000) {
      frameCount = 0;
      lastFpsUpdate = time;
    }

    if (frameDelta > 0.1) frameDelta = 0.1;

    // Keep chunk streaming active even while startup loading screen is visible.
    const streamDir = new THREE.Vector3();
    camera.getWorldDirection(streamDir);
    cm.update(player.position.x, player.position.z, { x: streamDir.x, z: streamDir.z });
    if (typeof cm.processLoadQueue === "function") {
      const elapsedMs = time - lastLoadQueueProcessAt;
      if (elapsedMs >= LOAD_QUEUE_INTERVAL_MS) {
        cm.processLoadQueue();
        lastLoadQueueProcessAt = time;
      }
    }
    if (!updateLoadingOverlay()) {
      renderer.render(scene, camera);
      return;
    }

    updateDamageTilt(frameDelta);

    const ticksFloat = frameDelta * ticksPerSecond + tickRemainder;
    const ticksThisFrame = Math.floor(ticksFloat);
    tickRemainder = ticksFloat - ticksThisFrame;
    tickCount += ticksThisFrame;
    const gameDelta = (ticksThisFrame + tickRemainder) / BASE_TICKS_PER_SECOND;

    accumulator += frameDelta;

    let didUpdate = false;
    while (accumulator >= FIXED_DT) {
      updatePhysics(FIXED_DT);
      accumulator -= FIXED_DT;
      didUpdate = true;
    }
    if (!didUpdate && accumulator > 0) {
      updatePhysics(accumulator);
      accumulator = 0;
    }

    if (waterPhysics) {
      waterPhysics.update(gameDelta);
    }

    // Update item drops and check for pickups
    itemDropManager.update(gameDelta);
    
    // Pickup detection - use player's feet position as the pickup center
    const nearbyDrops = itemDropManager.getDropsNear(player.position, 1.5);
    
    if (nearbyDrops.length > 0) {
      for (const drop of nearbyDrops) {
        const pickupTarget = player.position.clone().add(new THREE.Vector3(0, 0.7, 0));
        itemDropManager.startPickup(drop, pickupTarget);
        // Add item to inventory
        hud.addItem(drop.blockId, 1);
      }
    }

    // Walking animation
    const horizSpeed = Math.hypot(velocity.x, velocity.z);
    const speedFactor = Math.min(1, horizSpeed / Math.max(0.0001, maxSpeed));

    if (horizSpeed > 0.01 && onGround) {
      walkTimer += gameDelta * (4 + speedFactor * 6);
    } else {
      walkTimer += gameDelta * 1.5; // decay back to idle
    }
    const walkFreq = 1.0; // base frequency multiplier
    const armAmp = 0.6; // radians
    const legAmp = 0.6; // radians

    if (typeof player_leftArmPivot !== "undefined")
      player_leftArmPivot.rotation.x =
        Math.sin(walkTimer * walkFreq) * armAmp * speedFactor;
    if (typeof player_rightArmPivot !== "undefined")
      player_rightArmPivot.rotation.x =
        Math.sin(walkTimer * walkFreq + Math.PI) * armAmp * speedFactor;
    if (typeof player_leftLegPivot !== "undefined")
      player_leftLegPivot.rotation.x =
        Math.sin(walkTimer * walkFreq + Math.PI) * legAmp * speedFactor;
    if (typeof player_rightLegPivot !== "undefined")
      player_rightLegPivot.rotation.x =
        Math.sin(walkTimer * walkFreq) * legAmp * speedFactor;

    const now = (tickCount + tickRemainder) / BASE_TICKS_PER_SECOND;
    let t = (now - cycleStart) % CYCLE_LENGTH;
    if (t < 0) t += CYCLE_LENGTH;

    const angle = (t / CYCLE_LENGTH) * Math.PI * 2 - Math.PI / 2;
    const sunDist = DAY_NIGHT.orbitDistance;
    celestialPos.set(
      Math.cos(angle) * sunDist + player.position.x,
      Math.sin(angle) * sunDist,
      Math.sin(angle * 0.5) + player.position.z,
    );
    sunMesh.position.copy(celestialPos);
    // Orient the sun plane according to orbit angle so it behaves as a world object
    sunMesh.rotation.set(Math.PI / 2, angle - Math.PI / 2, 0);
    try {
      if (sunBackdropMesh) {
        const BACK_OFFSET = Math.max(5, DAY_NIGHT.sunSize * 0.02);
        sunBackdropMesh.position.copy(sunMesh.position);
        sunBackdropMesh.rotation.copy(sunMesh.rotation);
        sunBackdropMesh.translateZ(-BACK_OFFSET);
        sunBackdropMesh.visible = sunMesh.visible;

        const _backdropSunH = Math.sin(angle);
        const backdropOpacity = Math.pow(
          Math.max(0, 1 - _backdropSunH / 0.25),
          2,
        );
        sunBackdropMesh.material.opacity = backdropOpacity;
      }
    } catch (err) {
      console.warn("sun backdrop update failed", err);
    }

    const moonAngle = angle + Math.PI;
    celestialPos.set(
      Math.cos(moonAngle) * sunDist + player.position.x,
      Math.sin(moonAngle) * sunDist,
      Math.sin(moonAngle * 0.5) + player.position.z,
    );
    moonMesh.position.copy(celestialPos);
    moonMesh.rotation.set(Math.PI / 2, moonAngle - Math.PI / 2, 0);

    const currentCycleIndex = Math.round((now - cycleStart) / CYCLE_LENGTH);
    if (currentCycleIndex !== lastMoonCycleIndex) {
      lastMoonCycleIndex = currentCycleIndex;
      currentMoonPhase =
        ((currentCycleIndex % MOON_PHASE_COUNT) + MOON_PHASE_COUNT) %
        MOON_PHASE_COUNT;
      if (moonPhasesTexture) {
        const col = currentMoonPhase % MOON_COLS;
        const row = Math.floor(currentMoonPhase / MOON_COLS);
        moonPhasesTexture.offset.set(
          col / MOON_COLS,
          (MOON_ROWS - 1 - row) / MOON_ROWS,
        );
      }
    }

    // === DERIVE ALL LIGHTING FROM SUN'S ACTUAL HEIGHT ===
    // sunHeight: -1 (nadir/midnight) to +1 (zenith/noon), 0 = horizon
    const sunHeight = Math.sin(angle);

    // Smooth step helper: 0 when x<=edge0, 1 when x>=edge1, smooth in between
    const smoothstep = (edge0, edge1, x) => {
      const ct = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return ct * ct * (3 - 2 * ct);
    };

    let sunIntensity = smoothstep(-0.05, 0.3, sunHeight);
    let moonIntensity = smoothstep(0.05, -0.3, sunHeight);
    let ambientRatio = 0.2 + 1.8 * smoothstep(-0.1, 0.25, sunHeight);

    if (sunMesh && sunMesh.material) {
      sunMesh.material.opacity = Math.max(0, Math.min(1, sunIntensity));
      sunMesh.visible = sunIntensity > 0.01;
    }

    // Moon fade in/out
    if (moonMesh && moonMesh.material) {
      moonMesh.material.opacity = Math.max(0, Math.min(1, moonIntensity));
      moonMesh.visible = moonIntensity > 0.01;
    }

    const isRising = Math.cos(angle) < 0;

    if (sunHeight > 0.3) {
      currentSkyZenith.copy(skyColorDay);
    } else if (sunHeight > 0) {
      const p = sunHeight / 0.3;
      const warmZenith = isRising ? skyColorDawn : skyColorDusk;
      // zenith only gets a mild warm tint at transition
      currentSkyZenith.copy(warmZenith).lerp(skyColorDay, p * p);
    } else if (sunHeight > -0.2) {
      const p = -sunHeight / 0.2;
      const warmZenith = isRising ? skyColorDawn : skyColorDusk;
      currentSkyZenith.copy(warmZenith).lerp(skyColorNight, p);
    } else {
      currentSkyZenith.copy(skyColorNight);
    }

    if (sunHeight > 0.3) {
      currentSkyHorizon.copy(skyColorDayHorizon);
    } else if (sunHeight > 0) {
      const p = sunHeight / 0.3; // 0 at horizon, 1 at full day
      const warmHorizon = isRising ? skyColorDawnHorizon : skyColorDuskHorizon;
      currentSkyHorizon.copy(warmHorizon).lerp(skyColorDayHorizon, p * p);
    } else if (sunHeight > -0.25) {
      const p = -sunHeight / 0.25;
      const warmHorizon = isRising ? skyColorDawnHorizon : skyColorDuskHorizon;
      currentSkyHorizon.copy(warmHorizon).lerp(skyColorNightHorizon, p);
    } else {
      currentSkyHorizon.copy(skyColorNightHorizon);
    }

    currentSkyColor.copy(currentSkyHorizon);

    skyDomeMaterial.uniforms.uZenithColor.value.copy(currentSkyZenith);
    skyDomeMaterial.uniforms.uHorizonColor.value.copy(currentSkyHorizon);

    renderer.setClearColor(currentSkyZenith, 1);

    // === STAR FIELD UPDATE ===
    const starOpacity = Math.pow(Math.max(0, 1 - sunIntensity * 1.8), 1.5);
    starMaterial.uniforms.uOpacity.value = starOpacity;
    starMaterial.uniforms.uTime.value = now;
    starField.visible = starOpacity > 0.005;

    starField.position.set(
      player.position.x,
      player.position.y,
      player.position.z,
    );
    skyDome.position.set(
      player.position.x,
      player.position.y,
      player.position.z,
    );
    starField.rotation.z = (t / CYCLE_LENGTH) * Math.PI * 2;

    const timeOfDay = t / CYCLE_LENGTH;
    cm.setTimeOfDay(timeOfDay);
    ambient.intensity = 0.3 + ambientRatio * 0.3;

    if (typeof clouds !== "undefined" && clouds && clouds.group) {
      const cloudWidth = clouds.group.userData.width || 2048;
      const cloudHeight = clouds.group.userData.height || 2048;

      const driftSpeedX = 0.5;

      const totalDriftX = now * driftSpeedX;
      const driftOffsetX =
        ((totalDriftX % cloudWidth) + cloudWidth) % cloudWidth;
      const playerTileX =
        Math.floor(
          (player.position.x - driftOffsetX + cloudWidth) / cloudWidth,
        ) * cloudWidth;

      clouds.group.position.x = playerTileX + driftOffsetX - cloudWidth;
      clouds.group.position.z = player.position.z - cloudHeight;
      if (clouds.materials) {
        _cloudTint
          .copy(_cloudDayColor)
          .lerp(_cloudNightColor, 1 - Math.min(1, ambientRatio / 2.0));
        if (sunIntensity > 0.01 && sunIntensity < 0.95) {
          const warmth = Math.sin(sunIntensity * Math.PI) * 0.4;
          _cloudTint.lerp(_cloudWarmColor, warmth);
        }
        const sideRatio = 0.8;
        const bottomRatio = 0.7;
        clouds.materials.forEach((mat, idx) => {
          if (idx === 0) mat.color.copy(_cloudTint);
          else if (idx === 1)
            mat.color.copy(_cloudTint).multiplyScalar(sideRatio);
          else mat.color.copy(_cloudTint).multiplyScalar(bottomRatio);
        });
      }
    }

    raycaster.setFromCamera(tempVec2.set(0, 0), camera);
    raycaster.far = PLAYER.blockreach;
    targetInfo = null;
    camera.getWorldPosition(tempLocalPoint);
    camera.getWorldDirection(tempWorldPoint);
    const maxDist = raycaster.far;
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
        targetInfo = {
          blockX: bx2,
          blockY: by2,
          blockZ: bz2,
          id: id2,
          dist: d,
        };
        break;
      }
    }

    if (targetInfo) {
      highlightBox.visible = true;
      highlightBox.position.set(
        targetInfo.blockX + 0.5,
        targetInfo.blockY + 0.5,
        targetInfo.blockZ + 0.5,
      );
    } else {
      highlightBox.visible = false;
    }

    if (showDebug && time - lastDebugUpdate > debugUpdateInterval) {
      lastDebugUpdate = time;
      const lookVec = new THREE.Vector3();
      camera.getWorldDirection(lookVec);
      const yawRad = player.rotation.y || 0;
      const pitchRad = pitchObject.rotation.x || 0;
      const yawDeg = ((yawRad * 180) / Math.PI) % 360;
      const pitchDeg = ((pitchRad * 180) / Math.PI) % 360;
      const normYaw = (yawDeg + 360) % 360;
      let facingName;
      if (normYaw >= 315 || normYaw < 45) facingName = "South (Towards -Z)";
      else if (normYaw >= 45 && normYaw < 135) facingName = "West (Towards -X)";
      else if (normYaw >= 135 && normYaw < 225)
        facingName = "North (Towards +Z)";
      else facingName = "East (Towards +X)";

      const headY = player.position.y + currentPlayerHeight * CAMERA.eyeHeight;
      // Use conservative mode for head block check to detect swimming/suffocation
      const headBlockId = cm.getBlockAtWorld(
        player.position.x,
        headY,
        player.position.z,
        true,
      );

      const lightInfo = cm.getLightAtWorld(
        player.position.x,
        player.position.y,
        player.position.z,
      );

      const rinfo = renderer.info || { memory: {}, render: {} };
      const rendererStats = {
        geometries: rinfo.memory.geometries || 0,
        textures: rinfo.memory.textures || 0,
        calls: rinfo.render.calls || 0,
        triangles: rinfo.render.triangles || 0,
      };
      const mem =
        performance && performance.memory
          ? {
              usedMB: performance.memory.usedJSHeapSize / 1024 / 1024,
              totalMB: performance.memory.jsHeapSizeLimit / 1024 / 1024,
            }
          : null;
      debugOverlay.update({
        delta: gameDelta,
        playerPos: player.position,
        chunkX: Math.floor(player.position.x / (CHUNK_SIZE * blockSize)),
        chunkZ: Math.floor(player.position.z / (CHUNK_SIZE * blockSize)),
        target: targetInfo,
        loadedChunks: cm.chunks.size,
        memory: mem,
        biome: getBiomeAtWorld(player.position.x, player.position.z, SEED),
        lookVec,
        facing: {
          name: facingName,
          yaw: yawDeg.toFixed(1),
          pitch: pitchDeg.toFixed(1),
        },
        headBlockId,
        clientLight: { sky: lightInfo.skyLight, block: lightInfo.blockLight },
        rendererStats,
      });
    }

    if (isSpectator) {
      // spectator handles camera itself
    } else if (isThirdPerson) {
      updateThirdPersonCameraCollision();
      const camWorld = new THREE.Vector3();
      camera.getWorldPosition(camWorld);
      const camLocalPos = camera.position.clone();
      const lookDir = camLocalPos.clone().negate().normalize();
      if (camLocalPos.lengthSq() > 0.001) {
        const localYaw = Math.atan2(-lookDir.x, -lookDir.z);
        const localPitch = Math.asin(lookDir.y);
        camera.rotation.set(localPitch, localYaw, 0, "YXZ");
      }
      player_head.rotation.x = pitchObject.rotation.x;
    } else {
      updateFirstPersonCameraCollision();
    }
    camera.rotation.z = damageTilt;
    try {
      if (typeof blockBreaker !== "undefined" && blockBreaker)
        blockBreaker.update(gameDelta);
    } catch (e) {}
    renderer.render(scene, camera);
    prevTime = time;
  }
  animate();
}

initMenu();
