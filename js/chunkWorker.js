import { generateChunk } from './chunkGen.js';

// Worker receives { cx, cz, seed, opts }
self.onmessage = (e) => {
  try {
    const { cx, cz, seed, opts } = e.data;
    const chunk = generateChunk(cx, cz, seed, opts);
    // Transfer ArrayBuffer backing the typed arrays to main thread
    const transfers = [];
    const payload = { cx, cz };
    if (chunk && chunk.data) {
      payload.data = chunk.data.buffer;
      transfers.push(chunk.data.buffer);
    }
    if (chunk && chunk.heightMap) {
      payload.heightMap = chunk.heightMap.buffer;
      transfers.push(chunk.heightMap.buffer);
    }
    if (chunk && chunk.biomeMap) {
      payload.biomeMap = chunk.biomeMap.buffer;
      transfers.push(chunk.biomeMap.buffer);
    }
    self.postMessage(payload, transfers);
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
