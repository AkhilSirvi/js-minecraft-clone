// debugOverlay.js
export default function createDebugOverlay() {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.left = '8px';
  el.style.top = '8px';
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
      lines.push(`FPS: ${Math.round(fpsSmoothed)} (delta ${(info.delta*1000).toFixed(1)} ms)`);
      if (info && info.playerPos) {
        lines.push(`XYZ: ${formatNum(info.playerPos.x,3)} / ${formatNum(info.playerPos.y,3)} / ${formatNum(info.playerPos.z,3)}`);
      }
      if (typeof info.chunkX !== 'undefined') {
        lines.push(`Chunk: ${info.chunkX} ${info.chunkZ}`);
      }
      if (info && info.target) {
        const t = info.target;
        lines.push(`Target: ${t.blockX ?? '-'} ${t.blockY ?? '-'} ${t.blockZ ?? '-'} id:${t.id ?? '-'} dist:${formatNum(t.dist||0,2)}`);
      }
      if (typeof info.loadedChunks !== 'undefined') lines.push(`Loaded chunks: ${info.loadedChunks}`);
      if (info && info.memory) lines.push(`Mem: ${Math.round(info.memory.usedMB)}MB / ${Math.round(info.memory.totalMB)}MB`);

      el.textContent = lines.join('\n');
    }
  };
}
