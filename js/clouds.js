import * as THREE from './three.module.js';

/**
 * Creates Minecraft-style 3D clouds from a texture.
 * Each opaque pixel in the texture becomes a 3D block.
 * Blocks have different face brightness: top (bright), sides (medium), bottom (dark).
 */
export function createClouds(scene, opts = {}) {
  const {
    texturePath = 'assets/textures/environment/clouds.png',
    centerY = 192,        // Cloud layer height
    thickness = 5,        // Block height in world units
    pixelScale = 12,      // Each texture pixel = this many world units
    baseOpacity = 0.85
  } = opts;

  // Create tiled container for seamless looping
  const tiledContainer = new THREE.Group();
  scene.add(tiledContainer);

  // === MATERIALS ===
  // Top face: brightest (white)
  const topMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: baseOpacity,
    side: THREE.FrontSide,
    depthWrite: true
  });

  // Side faces: medium brightness (gray)
  const sideMat = new THREE.MeshBasicMaterial({
    color: 0xcccccc,
    transparent: true,
    opacity: baseOpacity,
    side: THREE.DoubleSide,
    depthWrite: true
  });

  // Bottom face: darkest (dark gray)
  const bottomMat = new THREE.MeshBasicMaterial({
    color: 0xb1b1b1,
    transparent: true,
    opacity: baseOpacity,
    side: THREE.FrontSide,
    depthWrite: true
  });

  const materials = [topMat, sideMat, bottomMat];

  // === GEOMETRIES ===
  // All geometries are centered at origin; instance matrix handles positioning

  // Top face: horizontal plane facing UP (+Y)
  const topGeom = new THREE.PlaneGeometry(pixelScale, pixelScale);
  topGeom.rotateX(-Math.PI / 2);

  // Bottom face: horizontal plane facing DOWN (-Y)
  const bottomGeom = new THREE.PlaneGeometry(pixelScale, pixelScale);
  bottomGeom.rotateX(Math.PI / 2);

  // Side faces: vertical planes
  // PlaneGeometry default normal is +Z

  // Front face: at +Z edge, facing +Z (outward)
  const sidePosZ = new THREE.PlaneGeometry(pixelScale, thickness);
  // No rotation needed - already faces +Z

  // Back face: at -Z edge, facing -Z (outward)
  const sideNegZ = new THREE.PlaneGeometry(pixelScale, thickness);
  sideNegZ.rotateY(Math.PI);

  // Right face: at +X edge, facing +X (outward)
  const sidePosX = new THREE.PlaneGeometry(pixelScale, thickness);
  sidePosX.rotateY(-Math.PI / 2);

  // Left face: at -X edge, facing -X (outward)
  const sideNegX = new THREE.PlaneGeometry(pixelScale, thickness);
  sideNegX.rotateY(Math.PI / 2);

  // === LOAD TEXTURE AND BUILD GEOMETRY ===
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // Read pixel data
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;

    // Build lookup of opaque pixels
    const isOpaque = (x, y) => {
      if (x < 0 || x >= img.width || y < 0 || y >= img.height) return false;
      const i = (y * img.width + x) * 4;
      return pixels[i + 3] > 128;
    };

    // Collect block positions and count faces
    const blocks = [];
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (isOpaque(x, y)) {
          blocks.push({
            x,
            y,
            needsPosZ: !isOpaque(x, y + 1), // +Z neighbor (image Y+ = world Z+)
            needsNegZ: !isOpaque(x, y - 1),
            needsPosX: !isOpaque(x + 1, y),
            needsNegX: !isOpaque(x - 1, y)
          });
        }
      }
    }

    if (blocks.length === 0) return;

    // Count faces for each type
    const topCount = blocks.length;
    const bottomCount = blocks.length;
    const posZCount = blocks.filter(b => b.needsPosZ).length;
    const negZCount = blocks.filter(b => b.needsNegZ).length;
    const posXCount = blocks.filter(b => b.needsPosX).length;
    const negXCount = blocks.filter(b => b.needsNegX).length;

    // Create instanced meshes
    const topMesh = new THREE.InstancedMesh(topGeom, topMat, topCount);
    const bottomMesh = new THREE.InstancedMesh(bottomGeom, bottomMat, bottomCount);

    let posZMat = sideMat, negZMat = sideMat, posXMat = sideMat, negXMat = sideMat;

    const posZMesh = posZCount > 0 ? new THREE.InstancedMesh(sidePosZ, posZMat, posZCount) : null;
    const negZMesh = negZCount > 0 ? new THREE.InstancedMesh(sideNegZ, negZMat, negZCount) : null;
    const posXMesh = posXCount > 0 ? new THREE.InstancedMesh(sidePosX, posXMat, posXCount) : null;
    const negXMesh = negXCount > 0 ? new THREE.InstancedMesh(sideNegX, negXMat, negXCount) : null;

    // Disable frustum culling for clouds (they're always big)
    [topMesh, bottomMesh, posZMesh, negZMesh, posXMesh, negXMesh].forEach(m => {
      if (m) m.frustumCulled = false;
    });

    // Position all instances
    const matrix = new THREE.Matrix4();
    const centerOffsetX = (img.width * pixelScale) / 2;
    const centerOffsetZ = (img.height * pixelScale) / 2;

    let topIdx = 0, bottomIdx = 0;
    let posZIdx = 0, negZIdx = 0, posXIdx = 0, negXIdx = 0;

    for (const block of blocks) {
      // World position for this block
      const wx = block.x * pixelScale - centerOffsetX + pixelScale / 2;
      const wz = block.y * pixelScale - centerOffsetZ + pixelScale / 2;

      // Top face (at top of block)
      matrix.makeTranslation(wx, thickness / 2, wz);
      topMesh.setMatrixAt(topIdx++, matrix);

      // Bottom face (at bottom of block)
      matrix.makeTranslation(wx, -thickness / 2, wz);
      bottomMesh.setMatrixAt(bottomIdx++, matrix);

      // Side faces (only exterior ones)
      if (block.needsPosZ && posZMesh) {
        matrix.makeTranslation(wx, 0, wz + pixelScale / 2);
        posZMesh.setMatrixAt(posZIdx++, matrix);
      }
      if (block.needsNegZ && negZMesh) {
        matrix.makeTranslation(wx, 0, wz - pixelScale / 2);
        negZMesh.setMatrixAt(negZIdx++, matrix);
      }
      if (block.needsPosX && posXMesh) {
        matrix.makeTranslation(wx + pixelScale / 2, 0, wz);
        posXMesh.setMatrixAt(posXIdx++, matrix);
      }
      if (block.needsNegX && negXMesh) {
        matrix.makeTranslation(wx - pixelScale / 2, 0, wz);
        negXMesh.setMatrixAt(negXIdx++, matrix);
      }
    }

    // Mark instance matrices as needing update
    topMesh.instanceMatrix.needsUpdate = true;
    bottomMesh.instanceMatrix.needsUpdate = true;
    if (posZMesh) posZMesh.instanceMatrix.needsUpdate = true;
    if (negZMesh) negZMesh.instanceMatrix.needsUpdate = true;
    if (posXMesh) posXMesh.instanceMatrix.needsUpdate = true;
    if (negXMesh) negXMesh.instanceMatrix.needsUpdate = true;

    // Create a single cloud tile group
    const cloudTile = new THREE.Group();
    cloudTile.add(topMesh);
    cloudTile.add(bottomMesh);
    if (posZMesh) cloudTile.add(posZMesh);
    if (negZMesh) cloudTile.add(negZMesh);
    if (posXMesh) cloudTile.add(posXMesh);
    if (negXMesh) cloudTile.add(negXMesh);

    // Calculate cloud tile dimensions
    const tileWidth = img.width * pixelScale;
    const tileHeight = img.height * pixelScale;

    // Create a 2x2 tiled pattern (balanced performance and coverage)
    for (let tx = 0; tx < 2; tx++) {
      for (let tz = 0; tz < 2; tz++) {
        const tile = cloudTile.clone();
        tile.position.set(tx * tileWidth, 0, tz * tileHeight);
        // Disable frustum culling on all meshes in cloned tile
        tile.traverse((obj) => {
          if (obj.isMesh) obj.frustumCulled = false;
        });
        tiledContainer.add(tile);
      }
    }
    
    // Disable frustum culling on container itself
    tiledContainer.frustumCulled = false;
    
    // Set cloud layer height
    tiledContainer.position.y = centerY;
    
    // Store dimensions for looping calculations
    tiledContainer.userData.width = tileWidth;
    tiledContainer.userData.height = tileHeight;
  };

  img.onerror = () => {
    console.error('Failed to load cloud texture:', texturePath);
  };

  img.src = texturePath;

  // Return object for animation updates
  return {
    group: tiledContainer,
    texture: { offset: { x: 0, y: 0 } }, // Dummy for compatibility
    material: topMat,
    materials: materials,
    // Store dimensions for looping
    width: 0,
    height: 0,
    pixelScale: pixelScale
  };
}
