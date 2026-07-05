// Game settings (modifiable via settings menu)
import {main} from './main.js';
import {RENDER, CAMERA, SEED, seedToNumber} from './config.js';

const defaultChunkStreamingSettings = {
  loadQueueIntervalMs: RENDER.chunkStreaming?.loadQueueIntervalMs ?? 50,
  idleCallbackTimeoutMs: RENDER.chunkStreaming?.idleCallbackTimeoutMs ?? 16,
  idleMinTimeMs: RENDER.chunkStreaming?.idleMinTimeMs ?? 2,
  maxLoadsPerIdle: RENDER.chunkStreaming?.maxLoadsPerIdle ?? 1,
  maxFinalizationsPerFrame: RENDER.chunkStreaming?.maxFinalizationsPerFrame ?? 1,
  maxNeighborRebuildsPerFrame: RENDER.chunkStreaming?.maxNeighborRebuildsPerFrame ?? 1,
  maxUnloadsPerFrame: RENDER.chunkStreaming?.maxUnloadsPerFrame ?? 2,
  loadQueueRetryDelayMs: RENDER.chunkStreaming?.loadQueueRetryDelayMs ?? 8,
  loadQueueForceProgressMs: RENDER.chunkStreaming?.loadQueueForceProgressMs ?? 120
};

export const gameSettings = {
  viewDistance: RENDER.viewDistance,
  fov: RENDER.fov,
  nearClip: RENDER.nearClip,
  farClip: RENDER.farClip,
  maxPixelRatio: RENDER.maxPixelRatio,
  smoothLighting: RENDER.smoothLighting,
  enableFrustumCulling: RENDER.enableFrustumCulling,
  chunkStreaming: { ...defaultChunkStreamingSettings },
  mouseSensitivity: CAMERA.mouseSensitivity,
  keyBindings: {
    toggleDebug: 'F3',
    openChat: 'KeyT',
    toggleSpectator: 'KeyH',
    toggleThirdPerson: 'F5',
    toggleChunkBorders: 'KeyB',
    attack: 'Mouse0',
    place: 'Mouse2',
    placeWater: 'KeyQ',
    moveForward: 'KeyW',
    moveBackward: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    sprint: 'ControlLeft',
    crouch: 'ShiftLeft',
    jump: 'Space',
    inventory: 'KeyE',
    slot1: 'Digit1',
    slot2: 'Digit2',
    slot3: 'Digit3',
    slot4: 'Digit4',
    slot5: 'Digit5',
    slot6: 'Digit6',
    slot7: 'Digit7',
    slot8: 'Digit8',
    slot9: 'Digit9',
  },
};

export const worldSettings = {
  name: 'New World',
  seedText: String(SEED),
  seed: SEED
};

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clampInt(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

function normalizeBindingValue(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function formatBindingLabel(value) {
  if (!value) return '';
  if (value.startsWith('Mouse')) {
    const button = value.slice(5);
    if (button === '0') return 'Mouse Left';
    if (button === '1') return 'Mouse Middle';
    if (button === '2') return 'Mouse Right';
    return `Mouse ${button}`;
  }
  return value;
}

function normalizeSettings() {
  gameSettings.viewDistance = clampInt(gameSettings.viewDistance, RENDER.viewDistance, 2, 32);
  gameSettings.fov = clampInt(gameSettings.fov, RENDER.fov, 60, 110);
  gameSettings.nearClip = clampNumber(gameSettings.nearClip, RENDER.nearClip, 0.01, 10);
  gameSettings.farClip = clampNumber(gameSettings.farClip, RENDER.farClip, 100, 5000);
  if (gameSettings.farClip <= gameSettings.nearClip) {
    gameSettings.farClip = Math.max(100, gameSettings.nearClip + 10);
  }
  gameSettings.maxPixelRatio = clampNumber(gameSettings.maxPixelRatio, RENDER.maxPixelRatio, 0.5, 3.0);
  gameSettings.smoothLighting = Boolean(gameSettings.smoothLighting);
  gameSettings.enableFrustumCulling = Boolean(gameSettings.enableFrustumCulling);
  gameSettings.mouseSensitivity = clampNumber(gameSettings.mouseSensitivity, CAMERA.mouseSensitivity, 0.0005, 0.0055);

  if (!gameSettings.chunkStreaming || typeof gameSettings.chunkStreaming !== 'object') {
    gameSettings.chunkStreaming = { ...defaultChunkStreamingSettings };
  }
  const stream = gameSettings.chunkStreaming;
  stream.loadQueueIntervalMs = clampInt(stream.loadQueueIntervalMs, defaultChunkStreamingSettings.loadQueueIntervalMs, 1, 1000);
  stream.idleCallbackTimeoutMs = clampInt(stream.idleCallbackTimeoutMs, defaultChunkStreamingSettings.idleCallbackTimeoutMs, 1, 1000);
  stream.idleMinTimeMs = clampInt(stream.idleMinTimeMs, defaultChunkStreamingSettings.idleMinTimeMs, 1, 100);
  stream.maxLoadsPerIdle = clampInt(stream.maxLoadsPerIdle, defaultChunkStreamingSettings.maxLoadsPerIdle, 1, 50);
  stream.maxFinalizationsPerFrame = clampInt(stream.maxFinalizationsPerFrame, defaultChunkStreamingSettings.maxFinalizationsPerFrame, 1, 50);
  stream.maxNeighborRebuildsPerFrame = clampInt(stream.maxNeighborRebuildsPerFrame, defaultChunkStreamingSettings.maxNeighborRebuildsPerFrame, 1, 50);
  stream.maxUnloadsPerFrame = clampInt(stream.maxUnloadsPerFrame, defaultChunkStreamingSettings.maxUnloadsPerFrame, 1, 100);
  stream.loadQueueRetryDelayMs = clampInt(stream.loadQueueRetryDelayMs, defaultChunkStreamingSettings.loadQueueRetryDelayMs, 1, 1000);
  stream.loadQueueForceProgressMs = clampInt(stream.loadQueueForceProgressMs, defaultChunkStreamingSettings.loadQueueForceProgressMs, 1, 5000);

  if (!gameSettings.keyBindings || typeof gameSettings.keyBindings !== 'object') {
    gameSettings.keyBindings = {};
  }
  const defaultBindings = {
    toggleDebug: 'F3',
    openChat: 'KeyT',
    toggleSpectator: 'KeyH',
    toggleThirdPerson: 'F5',
    toggleChunkBorders: 'KeyB',
    attack: 'Mouse0',
    place: 'Mouse2',
    placeWater: 'KeyQ',
    moveForward: 'KeyW',
    moveBackward: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    sprint: 'ControlLeft',
    crouch: 'ShiftLeft',
    jump: 'Space',
    inventory: 'KeyE',
    slot1: 'Digit1',
    slot2: 'Digit2',
    slot3: 'Digit3',
    slot4: 'Digit4',
    slot5: 'Digit5',
    slot6: 'Digit6',
    slot7: 'Digit7',
    slot8: 'Digit8',
    slot9: 'Digit9',
  };
  for (const [key, value] of Object.entries(defaultBindings)) {
    if (typeof gameSettings.keyBindings[key] !== 'string' || !gameSettings.keyBindings[key].trim()) {
      gameSettings.keyBindings[key] = value;
    } else {
      gameSettings.keyBindings[key] = gameSettings.keyBindings[key].trim();
    }
  }
}

// Load saved settings from localStorage
function loadSettings() {
  try {
    const saved = localStorage.getItem('minecraftjs_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const { chunkStreaming, ...topLevel } = parsed;
        Object.assign(gameSettings, topLevel);
        if (chunkStreaming && typeof chunkStreaming === 'object') {
          Object.assign(gameSettings.chunkStreaming, chunkStreaming);
        }
      }
    }
  } catch (e) {
    console.warn('Could not load settings:', e);
  }
  normalizeSettings();
}

// Save settings to localStorage
function saveSettings() {
  normalizeSettings();
  try {
    localStorage.setItem('minecraftjs_settings', JSON.stringify(gameSettings));
  } catch (e) {
    console.warn('Could not save settings:', e);
  }
}

function loadWorldSettings() {
  try {
    const saved = localStorage.getItem('minecraftjs_world_settings');
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return;

    const worldName = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const seedText = typeof parsed.seedText === 'string' ? parsed.seedText.trim() : '';

    worldSettings.name = worldName || 'New World';
    worldSettings.seedText = seedText || String(SEED);
    worldSettings.seed = seedToNumber(worldSettings.seedText);
  } catch (e) {
    console.warn('Could not load world settings:', e);
  }
}

function saveWorldSettings() {
  try {
    localStorage.setItem('minecraftjs_world_settings', JSON.stringify({
      name: worldSettings.name,
      seedText: worldSettings.seedText
    }));
  } catch (e) {
    console.warn('Could not save world settings:', e);
  }
}

// Menu handling
let gameStarted = false;

export function initMenu() {
  const mainMenu = document.getElementById('main-menu');
  const playButton = document.getElementById('play-button');
  const settingsButton = document.getElementById('settings-button');
  const settingsMenu = document.getElementById('settings-menu');
  const settingsBack = document.getElementById('settings-back');
  const settingsSave = document.getElementById('settings-save');
  const loadingText = document.getElementById('loading-text');
  const crosshair = document.getElementById('crosshair');
  const worldCreateMenu = document.getElementById('world-create-menu');
  const worldBackButton = document.getElementById('world-back-button');
  const createWorldButton = document.getElementById('create-world-button');
  const worldNameInput = document.getElementById('world-name-input');
  const worldSeedInput = document.getElementById('world-seed-input');

  // Settings inputs
  const viewDistanceInput = document.getElementById('setting-view-distance');
  const viewDistanceValue = document.getElementById('view-distance-value');
  const fovInput = document.getElementById('setting-fov');
  const fovValue = document.getElementById('fov-value');
  const nearClipInput = document.getElementById('setting-near-clip');
  const farClipInput = document.getElementById('setting-far-clip');
  const maxPixelRatioInput = document.getElementById('setting-max-pixel-ratio');
  const maxPixelRatioValue = document.getElementById('max-pixel-ratio-value');
  const smoothLightingInput = document.getElementById('setting-smooth-lighting');
  const frustumCullingInput = document.getElementById('setting-frustum-culling');
  const loadQueueIntervalInput = document.getElementById('setting-load-queue-interval');
  const idleTimeoutInput = document.getElementById('setting-idle-timeout');
  const idleMinTimeInput = document.getElementById('setting-idle-min-time');
  const maxLoadsPerIdleInput = document.getElementById('setting-max-loads-per-idle');
  const maxFinalizationsInput = document.getElementById('setting-max-finalizations-per-frame');
  const maxNeighborRebuildsInput = document.getElementById('setting-max-neighbor-rebuilds-per-frame');
  const maxUnloadsInput = document.getElementById('setting-max-unloads-per-frame');
  const loadQueueRetryDelayInput = document.getElementById('setting-load-queue-retry-delay');
  const loadQueueForceProgressInput = document.getElementById('setting-load-queue-force-progress');
  const sensitivityInput = document.getElementById('setting-sensitivity');
  const sensitivityValue = document.getElementById('sensitivity-value');
  const keyBindingInputs = {
    toggleDebug: document.getElementById('setting-key-toggle-debug'),
    openChat: document.getElementById('setting-key-open-chat'),
    toggleSpectator: document.getElementById('setting-key-toggle-spectator'),
    toggleThirdPerson: document.getElementById('setting-key-third-person'),
    toggleChunkBorders: document.getElementById('setting-key-chunk-borders'),
    attack: document.getElementById('setting-key-attack'),
    place: document.getElementById('setting-key-place'),
    placeWater: document.getElementById('setting-key-place-water'),
    moveForward: document.getElementById('setting-key-move-forward'),
    moveBackward: document.getElementById('setting-key-move-backward'),
    moveLeft: document.getElementById('setting-key-move-left'),
    moveRight: document.getElementById('setting-key-move-right'),
    sprint: document.getElementById('setting-key-sprint'),
    crouch: document.getElementById('setting-key-crouch'),
    jump: document.getElementById('setting-key-jump'),
    inventory: document.getElementById('setting-key-inventory'),
    slot1: document.getElementById('setting-key-slot-1'),
    slot2: document.getElementById('setting-key-slot-2'),
    slot3: document.getElementById('setting-key-slot-3'),
    slot4: document.getElementById('setting-key-slot-4'),
    slot5: document.getElementById('setting-key-slot-5'),
    slot6: document.getElementById('setting-key-slot-6'),
    slot7: document.getElementById('setting-key-slot-7'),
    slot8: document.getElementById('setting-key-slot-8'),
    slot9: document.getElementById('setting-key-slot-9'),
  };

  function setKeyBindingInputValue(input, value) {
    if (!input) return;
    input.value = formatBindingLabel(value);
  }

  function captureKeyBindingInput(input, currentKey) {
    if (!input) return;
    input.value = formatBindingLabel(currentKey);
    input.readOnly = true;
    const finishCapture = (nextValue) => {
      input.value = formatBindingLabel(nextValue);
      input.dataset.binding = nextValue;
      input.readOnly = false;
      input.blur();
      input.removeEventListener('keydown', handleKeyDown);
      input.removeEventListener('mousedown', handleMouseDown);
      input.removeEventListener('contextmenu', handleContextMenu);
    };
    const handleKeyDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        finishCapture(currentKey);
      } else {
        finishCapture(event.code);
      }
    };
    const handleMouseDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      finishCapture(`Mouse${event.button}`);
    };
    const handleContextMenu = (event) => {
      event.preventDefault();
    };
    input.addEventListener('keydown', handleKeyDown);
    input.addEventListener('mousedown', handleMouseDown);
    input.addEventListener('contextmenu', handleContextMenu);
    input.addEventListener('blur', () => {
      input.readOnly = false;
      input.removeEventListener('keydown', handleKeyDown);
      input.removeEventListener('mousedown', handleMouseDown);
      input.removeEventListener('contextmenu', handleContextMenu);
    }, { once: true });
  }

  // Load saved settings
  loadSettings();
  loadWorldSettings();


  // Apply loaded settings to UI
  function updateSettingsUI() {
    normalizeSettings();
    viewDistanceInput.value = gameSettings.viewDistance;
    viewDistanceValue.textContent = gameSettings.viewDistance;
    fovInput.value = gameSettings.fov;
    fovValue.textContent = gameSettings.fov + '°';
    nearClipInput.value = gameSettings.nearClip.toFixed(2);
    farClipInput.value = String(Math.round(gameSettings.farClip));
    maxPixelRatioInput.value = gameSettings.maxPixelRatio;
    maxPixelRatioValue.textContent = gameSettings.maxPixelRatio.toFixed(2) + 'x';
    smoothLightingInput.checked = gameSettings.smoothLighting;
    frustumCullingInput.checked = gameSettings.enableFrustumCulling;

    loadQueueIntervalInput.value = String(gameSettings.chunkStreaming.loadQueueIntervalMs);
    idleTimeoutInput.value = String(gameSettings.chunkStreaming.idleCallbackTimeoutMs);
    idleMinTimeInput.value = String(gameSettings.chunkStreaming.idleMinTimeMs);
    maxLoadsPerIdleInput.value = String(gameSettings.chunkStreaming.maxLoadsPerIdle);
    maxFinalizationsInput.value = String(gameSettings.chunkStreaming.maxFinalizationsPerFrame);
    maxNeighborRebuildsInput.value = String(gameSettings.chunkStreaming.maxNeighborRebuildsPerFrame);
    maxUnloadsInput.value = String(gameSettings.chunkStreaming.maxUnloadsPerFrame);
    loadQueueRetryDelayInput.value = String(gameSettings.chunkStreaming.loadQueueRetryDelayMs);
    loadQueueForceProgressInput.value = String(gameSettings.chunkStreaming.loadQueueForceProgressMs);

    // Convert sensitivity back to slider value (0.001-0.004 -> 1-20)
    const sensSlider = Math.round((gameSettings.mouseSensitivity - 0.0005) / 0.00025);
    sensitivityInput.value = Math.max(1, Math.min(20, sensSlider));
    sensitivityValue.textContent = sensitivityInput.value;

    for (const [action, input] of Object.entries(keyBindingInputs)) {
      setKeyBindingInputValue(input, gameSettings.keyBindings[action]);
      if (input) input.dataset.binding = gameSettings.keyBindings[action];
    }
  }

  function updateWorldSettingsUI() {
    worldNameInput.value = worldSettings.name;
    worldSeedInput.value = worldSettings.seedText;
  }

  function createWorldFromForm() {
    if (gameStarted) return;

    const worldName = worldNameInput.value.trim() || 'New World';
    let seedText = worldSeedInput.value.trim();
    if (!seedText) {
      seedText = String(Math.floor(Math.random() * 0xffffffff));
    }

    worldSettings.name = worldName;
    worldSettings.seedText = seedText;
    worldSettings.seed = seedToNumber(seedText);
    saveWorldSettings();

    gameStarted = true;
    createWorldButton.disabled = true;
    createWorldButton.textContent = 'Creating...';
    playButton.disabled = true;
    loadingText.classList.add('visible');

    setTimeout(() => {
      worldCreateMenu.classList.add('hidden');
      mainMenu.classList.add('hidden');
      if (crosshair) crosshair.style.display = '';
      main({
        seed: worldSettings.seed,
        worldName: worldSettings.name
      });
    }, 100);
  }

  updateSettingsUI();
  updateWorldSettingsUI();

  if (crosshair) crosshair.style.display = 'none';
  viewDistanceInput.addEventListener('input', () => {viewDistanceValue.textContent = viewDistanceInput.value;});
  fovInput.addEventListener('input', () => {fovValue.textContent = fovInput.value + '°';});
  maxPixelRatioInput.addEventListener('input', () => {
    maxPixelRatioValue.textContent = Number(maxPixelRatioInput.value).toFixed(2) + 'x';
  });
  sensitivityInput.addEventListener('input', () => {sensitivityValue.textContent = sensitivityInput.value;});
  settingsButton.addEventListener('click', () => {updateSettingsUI();settingsMenu.classList.remove('hidden');});
  settingsBack.addEventListener('click', () => {settingsMenu.classList.add('hidden');updateSettingsUI();});
  worldBackButton.addEventListener('click', () => {
    if (gameStarted) return;
    worldCreateMenu.classList.add('hidden');
    updateWorldSettingsUI();
  });

  // Save settings
  settingsSave.addEventListener('click', () => {
    gameSettings.viewDistance = parseInt(viewDistanceInput.value, 10);
    gameSettings.fov = parseInt(fovInput.value, 10);
    gameSettings.nearClip = parseFloat(nearClipInput.value);
    gameSettings.farClip = parseFloat(farClipInput.value);
    gameSettings.maxPixelRatio = parseFloat(maxPixelRatioInput.value);
    gameSettings.smoothLighting = smoothLightingInput.checked;
    gameSettings.enableFrustumCulling = frustumCullingInput.checked;

    gameSettings.chunkStreaming.loadQueueIntervalMs = parseInt(loadQueueIntervalInput.value, 10);
    gameSettings.chunkStreaming.idleCallbackTimeoutMs = parseInt(idleTimeoutInput.value, 10);
    gameSettings.chunkStreaming.idleMinTimeMs = parseInt(idleMinTimeInput.value, 10);
    gameSettings.chunkStreaming.maxLoadsPerIdle = parseInt(maxLoadsPerIdleInput.value, 10);
    gameSettings.chunkStreaming.maxFinalizationsPerFrame = parseInt(maxFinalizationsInput.value, 10);
    gameSettings.chunkStreaming.maxNeighborRebuildsPerFrame = parseInt(maxNeighborRebuildsInput.value, 10);
    gameSettings.chunkStreaming.maxUnloadsPerFrame = parseInt(maxUnloadsInput.value, 10);
    gameSettings.chunkStreaming.loadQueueRetryDelayMs = parseInt(loadQueueRetryDelayInput.value, 10);
    gameSettings.chunkStreaming.loadQueueForceProgressMs = parseInt(loadQueueForceProgressInput.value, 10);

    gameSettings.mouseSensitivity = 0.0005 + (parseInt(sensitivityInput.value, 10) * 0.00025);

    for (const [action, input] of Object.entries(keyBindingInputs)) {
      if (!input) continue;
      const value = normalizeBindingValue(input.dataset.binding || input.value, gameSettings.keyBindings[action]);
      if (value) {
        gameSettings.keyBindings[action] = value;
      }
    }
    
    saveSettings();
    settingsMenu.classList.add('hidden');
  });

  // Play button
  playButton.addEventListener('click', () => {
    if (gameStarted) return;
    updateWorldSettingsUI();
    worldCreateMenu.classList.remove('hidden');
    worldNameInput.focus();
    worldNameInput.select();
  });

  createWorldButton.addEventListener('click', createWorldFromForm);
  worldNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      createWorldFromForm();
    }
  });
  worldSeedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      createWorldFromForm();
    }
  });

  for (const [action, input] of Object.entries(keyBindingInputs)) {
    if (!input) continue;
    input.addEventListener('focus', () => {
      captureKeyBindingInput(input, gameSettings.keyBindings[action]);
    });
  }
}