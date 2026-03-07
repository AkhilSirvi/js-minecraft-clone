// Game settings (modifiable via settings menu)
import {main} from './main.js';
import {RENDER, CAMERA} from './config.js';

export const gameSettings = {
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

export function initMenu() {
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

  if (crosshair) crosshair.style.display = 'none';
  viewDistanceInput.addEventListener('input', () => {viewDistanceValue.textContent = viewDistanceInput.value;});
  fovInput.addEventListener('input', () => {fovValue.textContent = fovInput.value + '°';});
  sensitivityInput.addEventListener('input', () => {sensitivityValue.textContent = sensitivityInput.value;});
  volumeInput.addEventListener('input', () => {volumeValue.textContent = volumeInput.value + '%';});
  settingsButton.addEventListener('click', () => {updateSettingsUI();settingsMenu.classList.remove('hidden');});
  settingsBack.addEventListener('click', () => {settingsMenu.classList.add('hidden');updateSettingsUI();});

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