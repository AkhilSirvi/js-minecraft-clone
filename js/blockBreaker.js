import { PLAYER } from './config.js';
import * as THREE from './three.module.js';

export default class BlockBreaker {
  constructor(cm, scene, camera, opts = {}) {
    this.cm = cm;
    this.scene = scene;
    this.camera = camera;
    this.reach = PLAYER.blockreach;
    this.totalTime = opts.totalTime ?? 1000;
    this.stages = opts.stages ?? 10;
    this.textures = [];
    this.overlayMeshes = null;
    this.active = false;
    this.elapsed = 0;
    this.target = null;
    this._mouseDown = false;
    this._loadTextures();
  }

  _loadTextures() {
    const loader = new THREE.TextureLoader();
    for (let i = 0; i < this.stages; i++) {
      const path = `assets/textures/block_breaking/destroy_stage_${i}.png`;
      try {
        const tex = loader.load(path);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        this.textures.push(tex);
      } catch (e) {
        this.textures.push(null);
      }
    }
  }

  _findTarget() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const step = 0.1;
    const maxT = this.reach;
    const prev = origin.clone();
    for (let t = 0; t <= maxT; t += step) {
      const p = origin.clone().addScaledVector(dir, t);
      const bid = this.cm.getBlockAtWorld(p.x, p.y, p.z);
      if (bid !== 0) {
        const bx = Math.floor(p.x);
        const by = Math.floor(p.y);
        const bz = Math.floor(p.z);
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const dz = p.z - prev.z;
        let face = { x: 0, y: 0, z: 0 };
        const adx = Math.abs(dx), ady = Math.abs(dy), adz = Math.abs(dz);
        if (adx > ady && adx > adz) face.x = dx > 0 ? -1 : 1;
        else if (ady > adx && ady > adz) face.y = dy > 0 ? -1 : 1;
        else face.z = dz > 0 ? -1 : 1;
        return { bx, by, bz, bid, face, hitPos: p, prev: prev.clone() };
      }
      prev.copy(p);
    }
    return null;
  }

  startBreaking() {
    const t = this._findTarget();
    if (!t) return false;
    if (t.bid === 14) return false;
    this.active = true;
    this.elapsed = 0;
    this.target = t;
    this._ensureOverlay();
    this._updateOverlay(0);
    return true;
  }

  stopBreaking() {
    this.active = false;
    this.elapsed = 0;
    this.target = null;
    if (this.overlayMeshes && this.scene) {
      for (const entry of this.overlayMeshes) {
        const mesh = entry.mesh;
        try {
          this.scene.remove(mesh);
        } catch (e) {}
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (mesh.material.map) mesh.material.map.dispose && mesh.material.map.dispose();
          mesh.material.dispose();
        }
      }
    }
    this.overlayMeshes = null;
  }

  _ensureOverlay() {
    if (this.overlayMeshes) {
      for (const entry of this.overlayMeshes) {
        if (!entry.added) {
          this.scene.add(entry.mesh);
          entry.added = true;
        }
      }
      return;
    }
    const geom = new THREE.PlaneGeometry(1.0, 1.0);
    const baseMat = new THREE.MeshBasicMaterial({ transparent: true,opacity: 0.9, depthTest: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    const normals = [
      new THREE.Vector3(1,0,0),
      new THREE.Vector3(-1,0,0),
      new THREE.Vector3(0,1,0),
      new THREE.Vector3(0,-1,0),
      new THREE.Vector3(0,0,1),
      new THREE.Vector3(0,0,-1)
    ];
    this.overlayMeshes = [];
    for (let i = 0; i < normals.length; i++) {
      const mat = baseMat.clone();
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 9999;
      this.overlayMeshes.push({ mesh, normal: normals[i].clone(), added: true });
      this.scene.add(mesh);
    }
  }

  _updateOverlay(stageIndex) {
    if (!this.overlayMeshes || !this.target) return;
    const center = new THREE.Vector3(this.target.bx + 0.5, this.target.by + 0.5, this.target.bz + 0.5);
    const tex = this.textures[Math.max(0, Math.min(this.textures.length - 1, stageIndex))] || null;
    for (const entry of this.overlayMeshes) {
      const mesh = entry.mesh;
      const normal = entry.normal;
      const pos = center.clone().add(normal.clone().multiplyScalar(0.501));
      mesh.position.copy(pos);
      const lookAtTarget = pos.clone().add(normal);
      mesh.lookAt(lookAtTarget);
      mesh.material.map = tex;
      mesh.scale.set(1.002, 1.002, 1.002);
      mesh.material.needsUpdate = true;
    }
  }

  update(dt) {
    if (!this.active) {
      if (this._mouseDown) {
        const next = this._findTarget();
        if (next && next.bid !== 14) {
          this.target = next;
          this.active = true;
          this.elapsed = 0;
          this._ensureOverlay();
          this._updateOverlay(0);
        }
      }
      return;
    }

    if (!this.target) {
      if (!this._mouseDown) { this.stopBreaking(); return; }
      const next = this._findTarget();
      if (next && next.bid !== 14) {
        this.target = next; this.elapsed = 0; this._ensureOverlay(); this._updateOverlay(0); return;
      }
      if (this.overlayMeshes && this.scene) {
        for (const entry of this.overlayMeshes) {
          try { this.scene.remove(entry.mesh); } catch (e) {}
          entry.added = false;
        }
      }
      this.active = false;
      this.target = null;
      return;
    }

    const t = this._findTarget();
    if (!t) {
      if (!this._mouseDown) { this.stopBreaking(); return; }
      if (this.overlayMeshes && this.scene) {
        for (const entry of this.overlayMeshes) {
          try { this.scene.remove(entry.mesh); } catch (e) {}
          entry.added = false;
        }
      }
      this.active = false;
      this.target = null;
      return;
    }
    if (t.bx !== this.target.bx || t.by !== this.target.by || t.bz !== this.target.bz) {
      if (this._mouseDown) {
        this.target = t; this.elapsed = 0; this._ensureOverlay(); this._updateOverlay(0); return;
      } else { this.stopBreaking(); return; }
    }

    this.elapsed += dt * 1000;
    const pct = Math.min(1, this.elapsed / this.totalTime);
    const stage = Math.floor(pct * this.stages);
    this._updateOverlay(stage);
    if (this.elapsed >= this.totalTime) {
      const px = this.target.bx + 0.5;
      const py = this.target.by + 0.5;
      const pz = this.target.bz + 0.5;
      this.cm.setBlockAtWorld(px, py, pz, 0);
      if (this._mouseDown) {
        const newT = this._findTarget();
        if (newT && newT.bid !== 14) {
          this.target = newT; this.elapsed = 0; this._ensureOverlay(); this._updateOverlay(0); return;
        }
        if (this.overlayMeshes && this.scene) {
          for (const entry of this.overlayMeshes) {
            try { this.scene.remove(entry.mesh); } catch (e) {}
            entry.added = false;
          }
        }
        this.active = false; this.target = null; return;
      }
      this.stopBreaking();
    }
  }
}
