//Renders items as 3D blocks in inventory/hotbar
import * as THREE from './three.module.js';
import { getBlockMaterialSetKey, getChunkFaceMaterialKeys } from '../data/blocks.js';

export class ItemRenderer {
  constructor(chunkManager) {
    this.cm = chunkManager;
    this.canvases = new Map();
    this.scenes = new Map();
    this.renderers = new Map();
    this.meshes = new Map();
    this.itemSize = 512; // Canvas size for each item quality
  }

  getItemCanvas(blockId) {
    if (this.canvases.has(blockId)) {
      return this.canvases.get(blockId);
    }

    const scene = new THREE.Scene();
    scene.background = null;
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight1.position.set(5, 5, 5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);

    const camera = new THREE.OrthographicCamera(
      -0.8, 0.8, 0.8, -0.8, 0.1, 1000
    );
    camera.position.set(1, 1, 1);
    camera.lookAt(0, 0, 0);

    const canvas = document.createElement('canvas');
    canvas.width = this.itemSize;
    canvas.height = this.itemSize;
    
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvas, 
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(this.itemSize, this.itemSize);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const mesh = this._createBlockMesh(blockId);
    if (mesh) {
      scene.add(mesh);
    }

    this.scenes.set(blockId, scene);
    this.renderers.set(blockId, renderer);
    this.meshes.set(blockId, mesh);
    this.canvases.set(blockId, canvas);

    renderer.render(scene, camera);
    renderer.render(scene, camera);

    return canvas;
  }

  _applyAtlasFaceUVs(geometry, faceRects) {
    if (!geometry || !geometry.index || !geometry.attributes || !geometry.attributes.uv) return;
    const indexArray = geometry.index.array;
    const uvArray = geometry.attributes.uv.array;
    const groups = geometry.groups || [];

    for (const group of groups) {
      const rect = faceRects[group.materialIndex];
      if (!rect) continue;

      const touchedVertices = new Set();
      const end = group.start + group.count;
      for (let i = group.start; i < end; i++) {
        touchedVertices.add(indexArray[i]);
      }

      for (const vertexIndex of touchedVertices) {
        const uvIndex = vertexIndex * 2;
        const u = uvArray[uvIndex];
        const v = uvArray[uvIndex + 1];
        uvArray[uvIndex] = rect.u0 + u * (rect.u1 - rect.u0);
        uvArray[uvIndex + 1] = rect.v0 + v * (rect.v1 - rect.v0);
      }
    }

    geometry.attributes.uv.needsUpdate = true;
  }

  _createBlockMesh(blockId) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    let materials = [];
    const materialSetKey = getBlockMaterialSetKey(blockId) || 'dirt';
    const faceRects = new Array(6).fill(null);

    for (let i = 0; i < 6; i++) {
      const faceKeyInfo = getChunkFaceMaterialKeys(blockId, i);
      const matKey = faceKeyInfo.base || materialSetKey;
      let material = null;
      let sourceMat = null;

      if (this.cm && this.cm.materials) {
        if (this.cm.materials[matKey]) {
          const cmMat = this.cm.materials[matKey];
          sourceMat = Array.isArray(cmMat)
            ? (cmMat[i] || cmMat[0] || null)
            : cmMat;
        }

        if (!sourceMat) {
          const setFaceMatch = /^(.+)_([0-5])$/.exec(matKey);
          if (setFaceMatch) {
            const setKey = setFaceMatch[1];
            const setFaceIdx = parseInt(setFaceMatch[2], 10);
            const setMaterials = this.cm.materials[setKey];
            if (Array.isArray(setMaterials)) {
              sourceMat = setMaterials[setFaceIdx] || null;
            }
          }
        }

        if (sourceMat) {
          material = new THREE.MeshPhongMaterial({
            map: sourceMat.map || null,
            color: sourceMat.color || 0xffffff,
            emissive: 0x0a0a0a,
            shininess: 0,
            side: sourceMat.side !== undefined ? sourceMat.side : THREE.FrontSide,
            transparent: sourceMat.transparent || false,
            opacity: sourceMat.opacity !== undefined ? sourceMat.opacity : 1,
            depthWrite: sourceMat.depthWrite !== undefined ? sourceMat.depthWrite : true,
          });
          if (sourceMat.alphaTest !== undefined) {
            material.alphaTest = sourceMat.alphaTest;
          }
          faceRects[i] = sourceMat.userData && sourceMat.userData.atlasRect
            ? sourceMat.userData.atlasRect
            : null;
        }
      }

      if (!material) {
        material = new THREE.MeshPhongMaterial({
          color: 0xcccccc,
          emissive: 0x0a0a0a,
          shininess: 0,
          side: THREE.FrontSide
        });
      }

      materials.push(material);
    }

    this._applyAtlasFaceUVs(geometry, faceRects);

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.rotation.x = Math.PI / 4; 
    mesh.rotation.y = Math.PI / 2; 
    mesh.rotation.z = -Math.PI / 4;
    mesh.userData.baseRotation = {
      x: mesh.rotation.x,
      y: mesh.rotation.y,
      z: mesh.rotation.z
    };
    
    return mesh;
  }

  getItemImage(blockId) {
    const canvas = this.getItemCanvas(blockId);
    const scene = this.scenes.get(blockId);
    const renderer = this.renderers.get(blockId);
    if (scene && renderer) {
      let camera = scene.getObjectByProperty('isCamera', true);
      if (!camera) {
        camera = new THREE.OrthographicCamera(-0.8, 0.8, 0.8, -0.8, 0.1, 1000);
        camera.position.set(1, 1, 1);
        camera.lookAt(0, 0, 0);
        scene.add(camera);
      }
      renderer.render(scene, camera);
    }
    return canvas.toDataURL();
  }

  dispose() {
    for (const renderer of this.renderers.values()) {
      renderer.dispose();
    }
    this.canvases.clear();
    this.scenes.clear();
    this.renderers.clear();
    this.meshes.clear();
  }
}
