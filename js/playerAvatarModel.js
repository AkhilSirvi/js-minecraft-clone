import * as THREE from "./three.module.js";

function uvmapper(geom, faceRects, cols = 16, rows = 16) {
  const uvs = geom.attributes.uv.array;

  for (let f = 0; f < 6; f++) {
    const [i1, i2] = faceRects[f];

    const c1 = i1 % cols;
    const r1 = Math.floor(i1 / cols);
    const c2 = i2 % cols;
    const r2 = Math.floor(i2 / cols);

    const minCol = Math.min(c1, c2);
    const maxCol = Math.max(c1, c2);
    const minRow = Math.min(r1, r2);
    const maxRow = Math.max(r1, r2);

    const uMin = minCol / cols;
    const uMax = (maxCol + 1) / cols;
    const vMin = minRow / rows;
    const vMax = (maxRow + 1) / rows;

    for (let i = 0; i < 6; i++) {
      const j = (f * 6 + i) * 2;

      const u = uvs[j];
      const v = uvs[j + 1];

      uvs[j] = uMin + u * (uMax - uMin);
      uvs[j + 1] = 1 - (vMin + (1 - v) * (vMax - vMin));
    }
  }

  geom.attributes.uv.needsUpdate = true;
}

function createPart(material, size, faceImages) {
  const geom = new THREE.BoxGeometry(...size).toNonIndexed();
  uvmapper(geom, faceImages);
  return new THREE.Mesh(geom, material);
}

function loadFallbackSkinTexture() {
  const texture = new THREE.TextureLoader().load(
    "assets/entity/player/wide/steve.png",
  );
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPlayerAvatarParts(skinTexture = null) {
  const resolvedSkin = skinTexture || loadFallbackSkinTexture();
  const playerMaterial = new THREE.MeshStandardMaterial({
    map: resolvedSkin,
    transparent: true,
  });

  return {
    head: createPart(playerMaterial, [0.5, 0.5, 0.5], [
      [32, 49],
      [36, 53],
      [2, 19],
      [4, 21],
      [38, 55],
      [34, 51],
    ]),
    body: createPart(playerMaterial, [0.5, 0.75, 0.25], [
      [84, 116],
      [87, 119],
      [69, 70],
      [71, 72],
      [88, 121],
      [85, 118],
    ]),
    leftArm: createPart(playerMaterial, [0.25, 0.75, 0.25], [
      [216, 248],
      [218, 250],
      [201, 201],
      [202, 202],
      [219, 250],
      [217, 249],
    ]),
    rightArm: createPart(playerMaterial, [0.25, 0.75, 0.25], [
      [90, 122],
      [92, 124],
      [75, 75],
      [76, 76],
      [93, 125],
      [91, 123],
    ]),
    leftLeg: createPart(playerMaterial, [0.25, 0.75, 0.25], [
      [212, 244],
      [214, 246],
      [197, 197],
      [198, 198],
      [215, 247],
      [213, 245],
    ]),
    rightLeg: createPart(playerMaterial, [0.25, 0.75, 0.25], [
      [80, 112],
      [82, 114],
      [65, 65],
      [66, 66],
      [83, 115],
      [81, 113],
    ]),
  };
}
