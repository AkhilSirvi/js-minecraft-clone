// debugOverlay.js
export default function createDebugOverlay() {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.padding = '6px 10px';
  el.style.background = 'rgba(0,0,0,0.6)';
  el.style.color = '#fff';
  el.style.fontFamily = 'monospace';
  el.style.fontSize = '12px';
  el.style.lineHeight = '1.2';
  el.style.zIndex = '9999';
  el.style.whiteSpace = 'pre';
  el.style.display = 'none';

  document.body.appendChild(el);

  let lastUpdate = 0;
  let fpsSmoothed = 60;

  function formatNum(n, d=2) { return (Math.round(n * Math.pow(10,d)) / Math.pow(10,d)).toFixed(d); }

  function fmtVec(v, d=3) { if (!v) return '- / - / -'; return `${formatNum(v.x,d)} / ${formatNum(v.y,d)} / ${formatNum(v.z,d)}`; }
  function blockCoordsFromPos(p) {
    const bx = Math.floor(p.x);
    const by = Math.floor(p.y);
    const bz = Math.floor(p.z);
    return { x: bx, y: by, z: bz };
  }
  function chunkCoordsFromPos(p) {
    const cx = Math.floor(p.x / 16);
    const cz = Math.floor(p.z / 16);
    return { x: cx, z: cz };
  }
  function localBlockInChunk(p) {
    const bx = Math.floor(p.x);
    const bz = Math.floor(p.z);
    return { x: ((bx % 16) + 16) % 16, z: ((bz % 16) + 16) % 16 };
  }

  return {
    el,
    show(v = true) { el.style.display = v ? 'block' : 'none'; },
    toggle() { el.style.display = el.style.display === 'none' ? 'block' : 'none'; },
    update(info) {
      // info: { delta, playerPos, chunkX,chunkZ, fps, lookVec, target, loadedChunks }
      const time = performance.now();
      if (info && info.delta) {
        const instFPS = 1 / info.delta;
        fpsSmoothed = fpsSmoothed * 0.9 + instFPS * 0.1;
      }

      const lines = [];
      // FPS / timing
      if (info && typeof info.delta === 'number') {
        lines.push(`FPS: ${Math.round(fpsSmoothed)} (delta ${(info.delta*1000).toFixed(1)} ms) VSync: ON`);
      } else {
        lines.push(`FPS: ${Math.round(fpsSmoothed)}`);
      }

      // Optional general stats
      if (info && info.chunkUpdates !== undefined) lines.push(`Chunk updates: ${info.chunkUpdates}`);
      if (info && info.vbo !== undefined) lines.push(`VBO: ${info.vbo}`);
      if (info && info.ticks !== undefined) lines.push(`Integrated server: ${info.ticks} ticks`);

      // Position and block/chunk info
      if (info && info.playerPos) {
        const p = info.playerPos;
        const b = blockCoordsFromPos(p);
        const c = chunkCoordsFromPos(p);
        const local = localBlockInChunk(p);
        lines.push(`XYZ: ${fmtVec(p,3)}`);
        lines.push(`Block: ${b.x} ${b.y} ${b.z}`);
        lines.push(`Chunk: ${c.x} ${c.z} (${local.x} ${Math.floor(p.y)%256} ${local.z})`);
      }

      // Facing / look
      if (info && info.facing) {
        const f = info.facing; // { name, yaw, pitch }
        lines.push(`Facing: ${f.name || '-'} (${formatNum(f.yaw||0,1)} / ${formatNum(f.pitch||0,1)})`);
      } else if (info && info.lookVec) {
        lines.push(`Look vec: ${fmtVec(info.lookVec,2)}`);
      }

      // Light, biome, difficulty
      if (info && info.clientLight) {
        const cl = info.clientLight; // { sky, block }
        lines.push(`Client Light: ${cl.sky ?? '-'} (sky, ${cl.block ?? '-'} block)`);
      }
      if (info && info.biome) lines.push(`Biome: ${info.biome}`);
      if (info && info.localDifficulty !== undefined) lines.push(`Local Difficulty: ${formatNum(info.localDifficulty,2)}`);

      // Looking at block / liquid
      if (info && info.lookingAt) {
        const la = info.lookingAt; // { blockX, blockY, blockZ }
        lines.push(`Looking at block: ${la.blockX ?? '-'} ${la.blockY ?? '-'} ${la.blockZ ?? '-'}`);
      }
      if (info && info.lookingAtLiquid) {
        const lq = info.lookingAtLiquid;
        lines.push(`Looking at liquid: ${lq.blockX ?? '-'} ${lq.blockY ?? '-'} ${lq.blockZ ?? '-'}`);
      }

      // Targeted Block / Fluid (hovered)
      if (info && info.target) {
        const t = info.target;
        if (t.blockX !== undefined) lines.push(`Targeted Block: ${t.blockX} ${t.blockY} ${t.blockZ} ${t.id ? '#'+t.id : ''}`);
        if (t.fluid) lines.push(`Targeted Fluid: ${t.fluid}`);
      }

      if (info && info.headBlockId !== undefined) lines.push(`Head Block ID: ${info.headBlockId}`);

      // Renderer statistics
      if (info && info.rendererStats) {
        const rs = info.rendererStats;
        lines.push(`Renderer: geoms ${rs.geometries} tex ${rs.textures} calls ${rs.calls} tris ${rs.triangles}`);
      }

      if (typeof info.loadedChunks !== 'undefined') lines.push(`Loaded chunks: ${info.loadedChunks}`);
      if (info && info.memory) lines.push(`Mem: ${Math.round(info.memory.usedMB)}MB / ${Math.round(info.memory.totalMB)}MB`);

      el.textContent = lines.join('\n');
    }
  };
}
