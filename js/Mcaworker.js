import { loadMCABuffer, loadMCAFile } from './Mcaloader.js';

self.onmessage = async (e) => {
  const { reqId, source, options } = e.data;
  try {
    const chunks = (source instanceof ArrayBuffer)
      ? await loadMCABuffer(source, options)
      : await loadMCAFile(source, options);

    const entries = [];
    const transferables = [];
    for (const [key, chunk] of chunks) {
      entries.push({
        key,
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        data: chunk.data.buffer,
        heightMap: chunk.heightMap.buffer,
        biomeMap: chunk.biomeMap.buffer,
      });
      transferables.push(chunk.data.buffer, chunk.heightMap.buffer, chunk.biomeMap.buffer);
    }

    self.postMessage({ reqId, ok: true, entries }, transferables);
  } catch (err) {
    self.postMessage({ reqId, ok: false, error: (err && err.stack) || String(err) });
  }
};