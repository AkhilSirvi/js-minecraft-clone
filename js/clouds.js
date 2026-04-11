import * as THREE from './three.module.js';

export function createClouds(scene, opts = {}) {
  const {
    texturePath = 'assets/textures/environment/clouds.png',
    centerY     = 192,   // cloud layer Y
    thickness    = 5,
    pixelScale   = 12,
    baseOpacity  = 0.85,
  } = opts;

  const tiledContainer = new THREE.Group();
  scene.add(tiledContainer);

  const topMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: baseOpacity,
    side: THREE.FrontSide, depthWrite: true,
  });
  const sideMat = new THREE.MeshBasicMaterial({
    color: 0xcccccc, transparent: true, opacity: 1.0,
    side: THREE.FrontSide, depthWrite: true,
  });
  const bottomMat = new THREE.MeshBasicMaterial({
    color: 0xb1b1b1, transparent: true, opacity: baseOpacity,
    side: THREE.FrontSide, depthWrite: true,
  });
  const materials = [topMat, sideMat, bottomMat];

  function buildGeometry(positions, indices) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  function pushQuad(pos, idx, v0, v1, v2, v3) {
    const base = pos.length / 3;
    pos.push(...v0, ...v1, ...v2, ...v3);
    idx.push(base, base + 1, base + 2,
             base, base + 2, base + 3);
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;

    const W = img.width, H = img.height;
    const isOpaque = (col, row) => {
      if (col < 0 || col >= W || row < 0 || row >= H) return false;
      return pixels[(row * W + col) * 4 + 3] > 128;
    };

    const hw = (W * pixelScale) / 2;   // X half-extent
    const hd = (H * pixelScale) / 2;   // Z half-extent
    const hy = thickness / 2;          // Y half-thickness

    const topPos  = [], topIdx  = [];
    const sidePos = [], sideIdx = [];
    const botPos  = [], botIdx  = [];

    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        if (!isOpaque(col, row)) continue;

        const x0 =  col      * pixelScale - hw;
        const x1 = (col + 1) * pixelScale - hw;
        const z0 =  row      * pixelScale - hd;
        const z1 = (row + 1) * pixelScale - hd;

        // Top face – normal +Y – CCW from above
        pushQuad(topPos, topIdx,
          [x0, hy, z0], [x0, hy, z1],
          [x1, hy, z1], [x1, hy, z0],
        );

        // Bottom face – normal -Y – CCW from below
        pushQuad(botPos, botIdx,
          [x0, -hy, z0], [x1, -hy, z0],
          [x1, -hy, z1], [x0, -hy, z1],
        );

        // +Z side – only on exterior edges
        if (!isOpaque(col, row + 1)) {
          pushQuad(sidePos, sideIdx,
            [x0, -hy, z1], [x1, -hy, z1],
            [x1,  hy, z1], [x0,  hy, z1],
          );
        }
        // -Z side
        if (!isOpaque(col, row - 1)) {
          pushQuad(sidePos, sideIdx,
            [x1, -hy, z0], [x0, -hy, z0],
            [x0,  hy, z0], [x1,  hy, z0],
          );
        }
        // +X side
        if (!isOpaque(col + 1, row)) {
          pushQuad(sidePos, sideIdx,
            [x1, -hy, z1], [x1, -hy, z0],
            [x1,  hy, z0], [x1,  hy, z1],
          );
        }
        // -X side
        if (!isOpaque(col - 1, row)) {
          pushQuad(sidePos, sideIdx,
            [x0, -hy, z0], [x0, -hy, z1],
            [x0,  hy, z1], [x0,  hy, z0],
          );
        }
      }
    }

    if (topPos.length === 0) return;

    const topGeom  = buildGeometry(topPos,  topIdx);
    const sideGeom = buildGeometry(sidePos, sideIdx);
    const botGeom  = buildGeometry(botPos,  botIdx);

    const tileWidth  = W * pixelScale;
    const tileHeight = H * pixelScale;

    for (let tx = 0; tx < 2; tx++) {
      for (let tz = 0; tz < 2; tz++) {
        const ox = tx * tileWidth;
        const oz = tz * tileHeight;

        const mBot = new THREE.Mesh(botGeom, bottomMat);
        mBot.position.set(ox, 0, oz);
        mBot.renderOrder   = 10;
        mBot.frustumCulled = false;

        const mTop = new THREE.Mesh(topGeom, topMat);
        mTop.position.set(ox, 0, oz);
        mTop.renderOrder   = 11;
        mTop.frustumCulled = false;

        const mSide = new THREE.Mesh(sideGeom, sideMat);
        mSide.position.set(ox, 0, oz);
        mSide.renderOrder   = 12;
        mSide.frustumCulled = false;

        tiledContainer.add(mBot, mTop, mSide);
      }
    }

    tiledContainer.frustumCulled  = false;
    tiledContainer.position.y     = centerY;
    tiledContainer.userData.width  = tileWidth;
    tiledContainer.userData.height = tileHeight;
  };

  img.onerror = () => console.error('failed to load cloud texture:', texturePath);
  img.src = texturePath;

  return {
    group:    tiledContainer,
    material: topMat,
    materials,
    pixelScale,
  };
}
