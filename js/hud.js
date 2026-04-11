import * as THREE from './three.module.js';
import { createPlayerAvatarParts } from './playerAvatarModel.js';

export class HUD {
  constructor(itemRenderer = null, playerSkinTexture = null) {
    this.health = 20;
    this.maxHealth = 20;
    this.hunger = 20;
    this.maxHunger = 20;
    this.saturation = 5;
    this.xp = 0;
    this.xpLevel = 0;
    this.xpPercentage = 0;
    
    this.itemRenderer = itemRenderer;
    this.playerSkinTexture = playerSkinTexture;
    this.inventoryAvatarPreview = null;
    this.draggedItem = null;
    
    this.selectedSlot = 0;
    this.inventory = new Array(36).fill(null).map((_, i) => ({
      id: null,
      count: 0,
      index: i
    }));
    this.showInventory = false;
    this.initHUDElements();
    this.loadTextures();
  }

  initHUDElements() {
    let hudContainer = document.getElementById('hud-container');
    if (!hudContainer) {
      hudContainer = document.createElement('div');
      hudContainer.id = 'hud-container';
      document.body.appendChild(hudContainer);
      this.addHUDStyles();
    }

    const heartsContainer = document.createElement('div');
    heartsContainer.id = 'hearts-container';
    heartsContainer.className = 'hud-element hud-left-top';
    hudContainer.appendChild(heartsContainer);
    this.heartsContainer = heartsContainer;

    const hungerContainer = document.createElement('div');
    hungerContainer.id = 'hunger-container';
    hungerContainer.className = 'hud-element hud-right-top';
    hudContainer.appendChild(hungerContainer);
    this.hungerContainer = hungerContainer;

    // XP bar container (bottom-center, above hotbar)
    const xpContainer = document.createElement('div');
    xpContainer.id = 'xp-container';
    xpContainer.className = 'hud-element';
    hudContainer.appendChild(xpContainer);
    
    const xpBar = document.createElement('div');
    xpBar.id = 'xp-bar';
    xpBar.className = 'xp-bar-bg';

    xpContainer.appendChild(xpBar);
    this.xpBar = xpBar;

    // Hotbar container (bottom-center)
    const hotbarContainer = document.createElement('div');
    hotbarContainer.id = 'hotbar-container';
    hotbarContainer.className = 'hud-element';
    hudContainer.appendChild(hotbarContainer);
    this.hotbarContainer = hotbarContainer;

    const inventoryOverlay = document.createElement('div');
    inventoryOverlay.id = 'inventory-overlay';
    inventoryOverlay.className = 'hidden';
    hudContainer.appendChild(inventoryOverlay);
    this.inventoryOverlay = inventoryOverlay;
  }

  addHUDStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #hud-container {
        position: fixed;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
        font-family: 'Minecraftia', 'Arial', sans-serif;
      }

      .hud-element {
        pointer-events: auto;
      }

      /* Hearts - Bottom Left (Near Hotbar) */
      #hearts-container {
        position: fixed;
        left: 50%;
        transform: translateX(calc(-50% - 100px));
        bottom: 51px;
        display: flex;
        gap: 0px;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        pointer-events: none;
        justify-content: center;
      }

      .heart {
        width: 14px;
        height: 16px;
        background-size: contain;
        background-repeat: no-repeat;
        image-rendering: pixelated;
      }

      /* Hunger - Bottom Right (Near Hotbar) */
      #hunger-container {
        position: fixed;
        left: 50%;
        transform: translateX(calc(-50% + 100px));
        bottom: 52px;
        display: flex;
        gap: 0px;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        pointer-events: none;
        justify-content: center;
      }

      .hunger-icon {
        width: 14px;
        height: 16px;
        background-size: contain;
        background-repeat: no-repeat;
        image-rendering: pixelated;
      }

      #xp-container {
        position: fixed;
        bottom: 43px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }

      .xp-bar-bg {
        width: 345px;
        height: 9px;
        background: url('assets/textures/gui/sprites/hud/experience_bar_background.png') no-repeat center / 100% 100%;
        image-rendering: pixelated;
        overflow: hidden;
        position: relative;
      }

      /* Hotbar - Bottom Center */
      #hotbar-container {
        background: url('assets/textures/gui/sprites/hud/hotbar.png') no-repeat center / 100% 100%;
        position: fixed;
        bottom: 0px;
        left: 50%;
        transform: translateX(-50%);
        width: 345px;
        height: 40px;
        background-size: 100% 100%;
        background-repeat: no-repeat;
        background-position: center;
        image-rendering: pixelated;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .hotbar-slots {
        position: absolute;
        width: 99%;
        height: 100%;
        display: flex;
      }

      .hotbar-slot {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        overflow: hidden;
      }

      .hotbar-slot.selected {
        background: url('assets/textures/gui/sprites/hud/hotbar_selection.png') no-repeat center / 100% 100%;
        image-rendering: pixelated;
      }

      .hotbar-slot-item {
        width: 75%;
        height: 75%;
        margin: auto;
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        image-rendering: pixelated;
      }

      /* Inventory - Center Overlay */
      #inventory-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        z-index: 2000;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
      }

      #inventory-overlay.visible {
        display: flex;
      }

      #inventory-overlay.hidden {
        display: none;
      }

      #inventory-window {
        background: url('assets/textures/gui/sprites/hud/inventory.png') no-repeat center / 100% 100%;
        background-size: 100% 100%;
        image-rendering: pixelated;
        box-sizing: border-box;
        padding: 16px 16px;
        width: 352px;
        height: 332px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
      }

      .inventory-grid {
        display: grid;
        grid-template-columns: repeat(9, 35px);
        column-gap: 1px;
        row-gap: 4px;
      }

      .inventory-content {
        display: flex;
        flex-direction: column;
        
        align-items: center;
        justify-content: space-between;
        width: 100%;
        box-sizing: border-box;
      }

      .top-panel {
        display: flex;
        width: 100%;
        justify-content: flex-start;
        align-items: flex-end;
      }

      .bottom-panel {
        display: flex;
        width: 100%;
        justify-content: flex-end;
        align-items: flex-start;
        gap: 12px;
        flex-direction: column;
        margin-top: 12px;
      }

      .armor-container {
        display: grid;
        grid-auto-rows: min-content;
        gap: 4px;
        align-items: center;
      }

      .avatar-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100%;
        margin-left: 4px;
      }

      .inventory-avatar-shell {
        border: 1px solid #00000000;
        overflow: hidden;
        background: #00000000;
        box-shadow: none;
        pointer-events: none;
        width: 96px;
        height: 138px;
      }

      .inventory-avatar-canvas {
        width: 100%;
        height: 100%;
        display: block;
        pointer-events: auto;
      }

      .right-stack {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        margin-left: 4px;
      }

      .middle-stack {
        display: flex;
        flex-direction: row;
        gap: 26px;
        align-items: center;
        justify-content: center;
      }

      .crafting-container {
        display: flex;
        gap: 44px;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
        margin-left: 42px;
      }

      .crafting-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 4px;
      }

      .crafting-output {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 4px;
      }

      .inventory-slot {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 9px;
        font-weight: bold;
        cursor: pointer;
        position: relative;
        overflow: hidden;
      }

      .inventory-slot-item {
        width: 90%;
        height: 90%;
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        image-rendering: pixelated;
      }

      .inventory-slot-count {
        position: absolute;
        bottom: 1px;
        right: 1px;
        color: #fff;
        font-size: 8px;
        font-weight: bold;
        background: rgba(0, 0, 0, 0.6);
        padding: 0 1px;
        line-height: 1;
      }

      .inventory-slot:hover {
        background: #aeaeae;
      }

      .inventory-slot.selected {
        border: 1px solid #ffff00;
        box-shadow: inset 0 1px 2px rgba(255, 255, 0, 0.6), 0 0 4px rgba(255, 255, 0, 0.6);
      }

      .inventory-slot.dragging {
        opacity: 0.5;
        transform: scale(0.95);
      }

      .inventory-slot.drop-target {
        background: rgba(255, 255, 255, 0.2);
        border: 2px solid #ffff00;
      }

      .drag-preview {
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        border-radius: 4px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      }
    `.trim();
    document.head.appendChild(style);
  }

  loadTextures() {
    this.updateHearts();
    this.updateHunger();
    this.updateXP();
    this.updateHotbar();
  }

  updateHearts() {
    const heartsContainer = this.heartsContainer;
    heartsContainer.innerHTML = '';
    
    const fullHearts = Math.floor(this.health / 2);
    const hasHalfHeart = this.health % 2 === 1;
    
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement('div');
      heart.className = 'heart';
      
      if (i < fullHearts) {
        heart.style.backgroundImage = `url('assets/textures/gui/sprites/hud/heart/full.png')`;
      } else if (i === fullHearts && hasHalfHeart) {
        heart.style.backgroundImage = `url('assets/textures/gui/sprites/hud/heart/half.png')`;
      } else {
        heart.style.backgroundImage = `url('assets/textures/gui/sprites/hud/heart/container.png')`;
      }
      
      heartsContainer.appendChild(heart);
    }
  }

  updateHunger() {
    const hungerContainer = this.hungerContainer;
    hungerContainer.innerHTML = '';
    
    const fullDrumsticks = Math.floor(this.hunger / 2);
    const hasHalfDrumstick = this.hunger % 2 === 1;
    
    for (let i = 0; i < 10; i++) {
      const drumstick = document.createElement('div');
      drumstick.className = 'hunger-icon';
      
      if (i < fullDrumsticks) {
        drumstick.style.backgroundImage = "url('assets/textures/gui/sprites/hud/food_full.png')";
      } else if (i === fullDrumsticks && hasHalfDrumstick) {
        drumstick.style.backgroundImage = "url('assets/textures/gui/sprites/hud/food_half.png')";
      } else {
        drumstick.style.backgroundImage = "url('assets/textures/gui/sprites/hud/food_empty.png')";
      }
      drumstick.style.backgroundRepeat = 'no-repeat';
      drumstick.style.backgroundPosition = 'center';
      drumstick.style.backgroundSize = 'contain';
      
      hungerContainer.appendChild(drumstick);
    }
  }

  updateXP() {
   
  }

  updateHotbar() {
    const container = this.hotbarContainer;
    
    let slotsDiv = container.querySelector('.hotbar-slots');
    if (!slotsDiv) {
      slotsDiv = document.createElement('div');
      slotsDiv.className = 'hotbar-slots';
      container.appendChild(slotsDiv);
    }
    
    slotsDiv.innerHTML = '';
    
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      if (i === this.selectedSlot) {
        slot.classList.add('selected');
      }
      slot.dataset.slot = i;
      
      const item = this.inventory[i];
      
      if (item && item.id) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'hotbar-slot-item';
        
        // Use 3D rendering if available
        if (this.itemRenderer) {
          itemDiv.style.backgroundImage = `url('${this.itemRenderer.getItemImage(item.id)}')`;
        }
        
        slot.appendChild(itemDiv);
      }
      
      slot.addEventListener('click', () => this.selectSlot(i));
      slotsDiv.appendChild(slot);
    }
  }

  selectSlot(index) {
    this.selectedSlot = index;
    this.updateHotbar();
  }

  stopInventoryAvatarAnimation() {
    if (!this.inventoryAvatarPreview) return;

    if (this.inventoryAvatarPreview.frameId) {
      cancelAnimationFrame(this.inventoryAvatarPreview.frameId);
      this.inventoryAvatarPreview.frameId = 0;
    }
  }

  startInventoryAvatarAnimation() {
    const preview = this.inventoryAvatarPreview;
    if (!preview || preview.frameId) return;

    preview.startAt = performance.now();

    const renderFrame = () => {
      const activePreview = this.inventoryAvatarPreview;
      if (!activePreview) return;

      const elapsed = (performance.now() - activePreview.startAt) * 0.001;

      // Keep a fixed facing direction in the inventory preview.
      activePreview.avatarRoot.rotation.y = Math.PI;
      activePreview.avatarHead.rotation.y = activePreview.headYaw || 0;
      activePreview.avatarHead.rotation.x = activePreview.headPitch || 0;

      activePreview.renderer.render(activePreview.scene, activePreview.camera);
      activePreview.frameId = requestAnimationFrame(renderFrame);
    };

    renderFrame();
  }

  disposeInventoryAvatar() {
    if (!this.inventoryAvatarPreview) return;

    const preview = this.inventoryAvatarPreview;
    this.stopInventoryAvatarAnimation();

    // Remove inventory mouse event listener
    if (this.inventoryMouseHandler) {
      if (this.inventoryOverlay) {
        this.inventoryOverlay.removeEventListener('mousemove', this.inventoryMouseHandler);
      }
      this.inventoryMouseHandler = null;
    }

    this.inventoryAvatarPreview = null;

    if (preview.shell && preview.shell.parentNode) {
      preview.shell.parentNode.removeChild(preview.shell);
    }

    preview.scene.traverse((object) => {
      if (!object.isMesh) return;

      if (object.geometry) object.geometry.dispose();

      if (!object.material) return;
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat && mat.dispose && mat.dispose());
      } else if (object.material.dispose) {
        object.material.dispose();
      }
    });

    preview.renderer.dispose();
  }

  createInventoryAvatar(container) {
    if (!this.showInventory) return;
    if (!this.inventoryAvatarPreview) {
      const avatarShell = document.createElement('div');
      avatarShell.className = 'inventory-avatar-shell';

      const avatarWidth = 86;
      const avatarHeight = 138;
      const avatarCanvas = document.createElement('canvas');
      avatarCanvas.className = 'inventory-avatar-canvas';
      avatarShell.appendChild(avatarCanvas);

      const renderer = new THREE.WebGLRenderer({
        canvas: avatarCanvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(avatarWidth, avatarHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        34,
        avatarWidth / avatarHeight,
        0.1,
        10,
      );
      camera.position.set(0, -0.6, 4);
      camera.lookAt(0, -0.6, 0);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
      keyLight.position.set(2, 4, 3);
      scene.add(keyLight);

      const {
        head: avatarHead,
        body: avatarBody,
        leftArm: avatarLeftArm,
        rightArm: avatarRightArm,
        leftLeg: avatarLeftLeg,
        rightLeg: avatarRightLeg,
      } = createPlayerAvatarParts(this.playerSkinTexture);

      const avatarRoot = new THREE.Group();
      const leftArmPivot = new THREE.Object3D();
      const rightArmPivot = new THREE.Object3D();
      const leftLegPivot = new THREE.Object3D();
      const rightLegPivot = new THREE.Object3D();

      const previewPlayerHeight = 1.8;
      avatarHead.position.set(0, previewPlayerHeight - 1, 0);
      avatarBody.position.set(0, previewPlayerHeight / 2 - 0.7, 0);

      const armOffsetX = 0.4;
      const armCenterY = previewPlayerHeight / 2 - 0.75;
      const armHeight = 0.9;
      const armTopY = armCenterY + armHeight / 2;
      avatarLeftArm.position.set(0, -armHeight / 2, 0);
      avatarRightArm.position.set(0, -armHeight / 2, 0);
      leftArmPivot.position.set(-armOffsetX, armTopY, 0);
      rightArmPivot.position.set(armOffsetX, armTopY, 0);
      leftArmPivot.add(avatarLeftArm);
      rightArmPivot.add(avatarRightArm);

      const legOffsetX = 0.125;
      const legHeight = 0.75;
      const legCenterY = -0.272;
      const legTopY = legCenterY + legHeight / 2;
      avatarLeftLeg.position.set(0, -legHeight / 2 + legCenterY, 0);
      avatarRightLeg.position.set(0, -legHeight / 2 + legCenterY, 0);
      leftLegPivot.position.set(-legOffsetX, legTopY, 0);
      rightLegPivot.position.set(legOffsetX, legTopY, 0);
      leftLegPivot.add(avatarLeftLeg);
      rightLegPivot.add(avatarRightLeg);

      avatarRoot.add(avatarHead);
      avatarRoot.add(avatarBody);
      avatarRoot.add(leftArmPivot);
      avatarRoot.add(rightArmPivot);
      avatarRoot.add(leftLegPivot);
      avatarRoot.add(rightLegPivot);
      avatarRoot.position.y = -0.78;
      scene.add(avatarRoot);

      // Add mouse tracking for head rotation
      const mouseHandler = (event) => {
        const rect = avatarCanvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const x = event.clientX - rect.left - centerX;
        const y = event.clientY - rect.top - centerY;
        
        // Horizontal angle (yaw)
        const maxYaw = Math.PI / 4; // 45 degrees max
        const yaw = (x / centerX) * maxYaw;
        
        // Vertical angle (pitch)
        const maxPitch = Math.PI / 6; // 30 degrees max
        const pitch = -(y / centerY) * maxPitch; // Negative because up should tilt head up
        
        this.inventoryAvatarPreview.headYaw = yaw;
        this.inventoryAvatarPreview.headPitch = pitch;
      };
      // Note: Mouse handler will be added to inventory window instead

      this.inventoryAvatarPreview = {
        renderer,
        scene,
        camera,
        shell: avatarShell,
        frameId: 0,
        startAt: 0,
        avatarRoot,
        avatarHead,
        leftArmPivot,
        rightArmPivot,
        leftLegPivot,
        rightLegPivot,
        headYaw: 0,
        headPitch: 0,
      };
    }

    container.innerHTML = '';
    container.appendChild(this.inventoryAvatarPreview.shell);
    this.startInventoryAvatarAnimation();
  }

  toggleInventory() {
    this.showInventory = !this.showInventory;
    const overlay = this.inventoryOverlay;
    
    if (this.showInventory) {
      // Unlock the cursor and hide the crosshair while inventory is open
      try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
      const crosshair = document.getElementById('crosshair');
      if (crosshair) crosshair.style.display = 'none';

      overlay.classList.remove('hidden');
      overlay.classList.add('visible');
      this.updateInventoryDisplay();
    } else {
      this.stopInventoryAvatarAnimation();
      overlay.classList.add('hidden');
      overlay.classList.remove('visible');

      // Unhide crosshair and attempt to re-lock pointer to the game canvas
      const crosshair = document.getElementById('crosshair');
      if (crosshair) crosshair.style.display = '';

      try {
        // Try to request pointer lock on the first canvas element (Three renderer)
        const canvas = document.querySelector('canvas');
        if (!document.pointerLockElement && canvas && canvas.requestPointerLock) {
          const maybePromise = canvas.requestPointerLock();
          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {});
          }
        }
      } catch (e) {}
    }
  }

  updateInventoryDisplay() {
    this.stopInventoryAvatarAnimation();
    const overlay = this.inventoryOverlay;
    overlay.innerHTML = '';
    
    const window = document.createElement('div');
    window.id = 'inventory-window';

    const content = document.createElement('div');
    content.className = 'inventory-content';

    const topPanel = document.createElement('div');
    topPanel.className = 'top-panel';

    const armorContainer = document.createElement('div');
    armorContainer.className = 'armor-container';
    topPanel.appendChild(armorContainer);

    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'avatar-container';
    topPanel.appendChild(avatarContainer);

    const middleStack = document.createElement('div');
    middleStack.className = 'middle-stack';

    const craftingContainer = document.createElement('div');
    craftingContainer.className = 'crafting-container';
    const craftingGrid = document.createElement('div');
    craftingGrid.className = 'crafting-grid';
    const craftingOutput = document.createElement('div');
    craftingOutput.className = 'crafting-output';
    craftingContainer.appendChild(craftingGrid);
    craftingContainer.appendChild(craftingOutput);

    const rightStack = document.createElement('div');
    rightStack.className = 'right-stack';
    rightStack.appendChild(craftingContainer);
    rightStack.appendChild(middleStack);
    topPanel.appendChild(rightStack);

    const bottomPanel = document.createElement('div');
    bottomPanel.className = 'bottom-panel';

    const grid = document.createElement('div');
    grid.className = 'inventory-grid';
    bottomPanel.appendChild(grid);

    const hotbarGrid = document.createElement('div');
    hotbarGrid.className = 'inventory-grid hotbar-grid';
    bottomPanel.appendChild(hotbarGrid);

    content.appendChild(topPanel);
    content.appendChild(bottomPanel);
    window.appendChild(content);

    // Append window now, then size and populate based on the background image
    overlay.appendChild(window);

    const img = new Image();
    img.onload = () => {
      if (!this.showInventory || !overlay.contains(window)) return;
      // Compute available inner width for grids (accounting for window padding)
      const gridCS = getComputedStyle(grid);
      const gap = parseFloat(gridCS.columnGap || gridCS.gap) || 1;
      
      grid.innerHTML = '';
      let slotpxsize = 32;
      for (let i = 0; i < 27; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.style.width = slot.style.height = slotpxsize + 'px';
        slot.dataset.slot = i;
        slot.dataset.type = 'inventory';

        const item = this.inventory[i + 9];

        if (item && item.id) {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'inventory-slot-item';
          
          // Use 3D rendering if available
          if (this.itemRenderer) {
            itemDiv.style.backgroundImage = `url('${this.itemRenderer.getItemImage(item.id)}')`;
          }
          
          slot.appendChild(itemDiv);

          if (item.count > 1) {
            const countDiv = document.createElement('div');
            countDiv.className = 'inventory-slot-count';
            countDiv.textContent = item.count;
            slot.appendChild(countDiv);
          }

          // Add custom drag and drop functionality
          this.setupCustomDrag(slot, 'inventory', i, item);
        }

        // Add drop zone functionality
        this.setupDropZone(slot, 'inventory', i);

        grid.appendChild(slot);
      }

      armorContainer.innerHTML = '';
      const armorNames = ['helmet', 'chest', 'legs', 'boots'];
      for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.style.width = slot.style.height = slotpxsize + 'px';
        slot.dataset.slot = i;
        slot.dataset.type = 'armor';
        slot.dataset.armor = armorNames[i];

        // Add drop zone functionality
        this.setupDropZone(slot, 'armor', i);

        armorContainer.appendChild(slot);
      }

      this.createInventoryAvatar(avatarContainer, slotpxsize);

      // Add mouse tracking for head rotation to the inventory overlay
      const mouseHandler = (event) => {
        const rect = window.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const x = event.clientX - rect.left - centerX;
        const y = event.clientY - rect.top - centerY;
        
        // Horizontal angle (yaw)
        const maxYaw = Math.PI / 8; // 22.5 degrees max
        const yaw = (x / centerX) * maxYaw;
        
        // Vertical angle (pitch)
        const maxPitch = Math.PI / 6; // 30 degrees max
        const pitch = -(y / centerY) * maxPitch;
        
        if (this.inventoryAvatarPreview) {
          this.inventoryAvatarPreview.headYaw = yaw;
          this.inventoryAvatarPreview.headPitch = pitch;
        }
      };
      this.inventoryOverlay.addEventListener('mousemove', mouseHandler);
      // Store the handler for cleanup
      this.inventoryMouseHandler = mouseHandler;

      middleStack.innerHTML = '';
      const offhandSlot = document.createElement('div');
      offhandSlot.className = 'inventory-slot';
      offhandSlot.style.width = offhandSlot.style.height = slotpxsize + 'px';
      offhandSlot.dataset.type = 'offhand';
      middleStack.appendChild(offhandSlot);

      const recipeSlot = document.createElement('div');
      recipeSlot.className = 'inventory-slot';
      recipeSlot.style.width = recipeSlot.style.height = slotpxsize + 'px';
      recipeSlot.dataset.type = 'recipe';
      middleStack.appendChild(recipeSlot);

      craftingGrid.innerHTML = '';
      craftingOutput.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.style.width = slot.style.height = slotpxsize + 'px';
        slot.dataset.type = 'crafting';
        slot.dataset.slot = i;
        craftingGrid.appendChild(slot);
      }
      const outputSlot = document.createElement('div');
      outputSlot.className = 'inventory-slot';
      outputSlot.style.width = outputSlot.style.height = slotpxsize + 'px';
      outputSlot.dataset.type = 'crafting-output';
      craftingOutput.appendChild(outputSlot);

      hotbarGrid.innerHTML = '';
      
      hotbarGrid.style.gap = `${gap}px`;

      for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        if (i === this.selectedSlot) slot.classList.add('selected');
        slot.style.width = slot.style.height = slotpxsize + 'px';
        slot.dataset.slot = i;
        slot.dataset.type = 'hotbar';

        const item = this.inventory[i];

        if (item && item.id) {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'inventory-slot-item';
          
          // Use 3D rendering if available
          if (this.itemRenderer) {
            itemDiv.style.backgroundImage = `url('${this.itemRenderer.getItemImage(item.id)}')`;
          }
          
          slot.appendChild(itemDiv);

          if (item.count > 1) {
            const countDiv = document.createElement('div');
            countDiv.className = 'inventory-slot-count';
            countDiv.textContent = item.count;
            slot.appendChild(countDiv);
          }

          // Add custom drag and drop functionality
          this.setupCustomDrag(slot, 'hotbar', i, item);
        }

        // Add drop zone functionality
        this.setupDropZone(slot, 'hotbar', i);

        slot.addEventListener('click', () => this.selectSlot(i));
        hotbarGrid.appendChild(slot);
      }
    };
    img.onerror = () => {
      if (!this.showInventory || !overlay.contains(window)) return;
      // If image fails, still populate grids with reasonable default sizes
      grid.innerHTML = '';
      this.createInventoryAvatar(avatarContainer, 36);
      
      // Add mouse tracking for head rotation to the inventory overlay
      const mouseHandler = (event) => {
        const rect = window.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const x = event.clientX - rect.left - centerX;
        const y = event.clientY - rect.top - centerY;
        
        // Horizontal angle (yaw)
        const maxYaw = Math.PI / 8; // 22.5 degrees max
        const yaw = (x / centerX) * maxYaw;
        
        // Vertical angle (pitch)
        const maxPitch = Math.PI / 6; // 30 degrees max
        const pitch = -(y / centerY) * maxPitch;
        
        if (this.inventoryAvatarPreview) {
          this.inventoryAvatarPreview.headYaw = yaw;
          this.inventoryAvatarPreview.headPitch = pitch;
        }
      };
      this.inventoryOverlay.addEventListener('mousemove', mouseHandler);
      // Store the handler for cleanup
      this.inventoryMouseHandler = mouseHandler;

      armorContainer.innerHTML = '';
      const armorNames = ['helmet', 'chest', 'legs', 'boots'];
      for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.style.width = slot.style.height = '36px';
        slot.dataset.slot = i;
        slot.dataset.type = 'armor';
        slot.dataset.armor = armorNames[i];

        // Add drop zone functionality
        this.setupDropZone(slot, 'armor', i);

        armorContainer.appendChild(slot);
      }
      
      for (let i = 0; i < 27; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.style.width = slot.style.height = '36px';
        slot.dataset.slot = i;
        slot.dataset.type = 'inventory';

        const item = this.inventory[i + 9];

        if (item && item.id) {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'inventory-slot-item';
          
          // Use 3D rendering if available
          if (this.itemRenderer) {
            itemDiv.style.backgroundImage = `url('${this.itemRenderer.getItemImage(item.id)}')`;
          }
          
          slot.appendChild(itemDiv);

          if (item.count > 1) {
            const countDiv = document.createElement('div');
            countDiv.className = 'inventory-slot-count';
            countDiv.textContent = item.count;
            slot.appendChild(countDiv);
          }

          // Add custom drag and drop functionality
          this.setupCustomDrag(slot, 'inventory', i, item);
        }

        // Add drop zone functionality
        this.setupDropZone(slot, 'inventory', i);

        grid.appendChild(slot);
      }

      hotbarGrid.innerHTML = '';
      
      for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        if (i === this.selectedSlot) slot.classList.add('selected');
        slot.style.width = slot.style.height = '36px';
        slot.dataset.slot = i;
        slot.dataset.type = 'hotbar';

        const item = this.inventory[i];

        if (item && item.id) {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'inventory-slot-item';
          
          // Use 3D rendering if available
          if (this.itemRenderer) {
            itemDiv.style.backgroundImage = `url('${this.itemRenderer.getItemImage(item.id)}')`;
          }
          
          slot.appendChild(itemDiv);

          if (item.count > 1) {
            const countDiv = document.createElement('div');
            countDiv.className = 'inventory-slot-count';
            countDiv.textContent = item.count;
            slot.appendChild(countDiv);
          }

          // Add custom drag and drop functionality
          this.setupCustomDrag(slot, 'hotbar', i, item);
        }

        // Add drop zone functionality
        this.setupDropZone(slot, 'hotbar', i);

        slot.addEventListener('click', () => this.selectSlot(i));
        hotbarGrid.appendChild(slot);
      }
    };
    img.src = 'assets/textures/gui/sprites/hud/inventory.png';
  }


  // Hotbar item management (unified inventory)
  setHotbarItem(slot, itemId, count = 1) {
    if (slot >= 0 && slot < 9) {
      // Hotbar is slots 0-8
      this.inventory[slot] = { id: itemId, count: Math.max(1, count), index: slot };
      this.updateHotbar();
    }
  }

  setInventoryItem(slot, itemId, count = 1) {
    if (slot >= 0 && slot < 27) {
      // Main inventory is slots 9-35 (offset by 9)
      this.inventory[slot + 9] = { id: itemId, count: Math.max(1, count), index: slot + 9 };
    }
  }

  setupCustomDrag(slotElement, slotType, slotIndex, itemData) {
    let isDragging = false;
    let dragElement = null;
    let startX = 0;
    let startY = 0;

    const handleMouseDown = (e) => {
      if (e.button !== 0) return; // Only left mouse button
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);
      
      if (!isDragging && (deltaX > 5 || deltaY > 5)) {
        // Start dragging
        isDragging = true;
        this.startCustomDrag(slotElement, slotType, slotIndex, itemData, e);
      }
      
      if (isDragging) {
        this.updateCustomDrag(e);
      }
    };

    const handleMouseUp = (e) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (isDragging) {
        this.endCustomDrag(e);
      }
      
      isDragging = false;
    };

    slotElement.addEventListener('mousedown', handleMouseDown);
  }

  setupDropZone(slotElement, slotType, slotIndex) {
    slotElement.addEventListener('mouseenter', () => {
      if (this.draggedItem) {
        slotElement.classList.add('drop-target');
      }
    });
    
    slotElement.addEventListener('mouseleave', () => {
      slotElement.classList.remove('drop-target');
    });
  }

  startCustomDrag(slotElement, slotType, slotIndex, itemData, mouseEvent) {
    // Create drag preview
    const dragPreview = document.createElement('div');
    dragPreview.className = 'drag-preview';
    dragPreview.style.backgroundImage = slotElement.querySelector('.inventory-slot-item').style.backgroundImage;
    dragPreview.style.width = '32px';
    dragPreview.style.height = '32px';
    dragPreview.style.position = 'fixed';
    dragPreview.style.pointerEvents = 'none';
    dragPreview.style.zIndex = '10000';
    dragPreview.style.opacity = '0.8';
    
    document.body.appendChild(dragPreview);
    
    this.draggedItem = {
      element: dragPreview,
      sourceType: slotType,
      sourceSlot: slotIndex,
      itemData: itemData
    };
    
    slotElement.classList.add('dragging');
    this.updateCustomDrag(mouseEvent);
  }

  updateCustomDrag(mouseEvent) {
    if (!this.draggedItem) return;
    
    const dragElement = this.draggedItem.element;
    dragElement.style.left = (mouseEvent.clientX - 16) + 'px';
    dragElement.style.top = (mouseEvent.clientY - 16) + 'px';
  }

  endCustomDrag(mouseEvent) {
    if (!this.draggedItem) return;
    
    const dragElement = this.draggedItem.element;
    const sourceType = this.draggedItem.sourceType;
    const sourceSlot = this.draggedItem.sourceSlot;
    const itemData = this.draggedItem.itemData;
    
    // Find drop target
    const dropTarget = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
    const slotElement = dropTarget.closest('.inventory-slot');
    
    if (slotElement) {
      const targetType = slotElement.dataset.type;
      const targetSlot = parseInt(slotElement.dataset.slot);
      
      this.handleCustomItemDrop(sourceType, sourceSlot, targetType, targetSlot);
    }
    
    // Clean up
    document.body.removeChild(dragElement);
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    
    this.draggedItem = null;
  }

  handleCustomItemDrop(sourceType, sourceSlot, targetType, targetSlot) {
    // Don't drop on the same slot
    if (sourceType === targetType && sourceSlot === targetSlot) return;
    
    // Get source and target indices
    let sourceIndex, targetIndex;
    
    if (sourceType === 'inventory') {
      sourceIndex = sourceSlot + 9; // inventory slots start at index 9
    } else if (sourceType === 'hotbar') {
      sourceIndex = sourceSlot; // hotbar slots are 0-8
    }
    
    if (targetType === 'inventory') {
      targetIndex = targetSlot + 9;
    } else if (targetType === 'hotbar') {
      targetIndex = targetSlot;
    } else if (targetType === 'armor') {
      // For now, armor slots are not implemented in the inventory array
      return;
    }
    
    // Swap items
    const temp = this.inventory[sourceIndex];
    this.inventory[sourceIndex] = this.inventory[targetIndex];
    this.inventory[targetIndex] = temp;
    
    // Update the display
    this.updateInventoryDisplay();
    this.updateHotbar();
  }

  addItemToHotbar(itemId, count = 1) {
    for (let i = 0; i < 9; i++) {
      const item = this.inventory[i];
      if (!item || !item.id) {
        this.setHotbarItem(i, itemId, count);
        return true;
      }
    }
    return false;
  }

  addItem(itemId, count = 1) {
    // Try hotbar first (slots 0-8)
    for (let i = 0; i < 9; i++) {
      const item = this.inventory[i];
      if (!item.id || item.id === itemId) {
        const currentCount = item.count || 0;
        this.setHotbarItem(i, itemId, currentCount + count);
        return true;
      }
    }
    
    // Try main inventory (slots 9-35)
    for (let i = 0; i < 27; i++) {
      const item = this.inventory[i + 9];
      if (!item.id || item.id === itemId) {
        const currentCount = item.count || 0;
        this.setInventoryItem(i, itemId, currentCount + count);
        return true;
      }
    }
    console.log(`Failed to pick up item ${itemId} - inventory full`);
    return false;
  }
}

// Initialize HUD singleton (will be updated after ItemRenderer is created)
export let hud;

export function initializeHUD(itemRenderer, playerSkinTexture = null) {
  hud = new HUD(itemRenderer, playerSkinTexture);
  return hud;
}