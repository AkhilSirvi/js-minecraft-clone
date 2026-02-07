import { SEED } from './config.js';

function javalcg(seed) {
  let s = BigInt(seed) & ((1n << 48n) - 1n);
  return function() {
    s = (s * 25214903917n + 11n) & ((1n << 48n) - 1n);
    const a = Number(s >> 22n);
    return a / (1 << 26);
  };
}

export function createPerlin(seed = SEED) {
  const rand = javalcg(seed);
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y, z) {
  switch (hash & 15) {
    case 0: return  x + y;
    case 1: return -x + y;
    case 2: return  x - y;
    case 3: return -x - y;
    case 4: return  x + z;
    case 5: return -x + z;
    case 6: return  x - z;
    case 7: return -x - z;
    case 8: return  y + z;
    case 9: return -y + z;
    case 10: return  y - z;
    case 11: return -y - z;
    case 12: return  x + y;
    case 13: return -x + y;
    case 14: return -x + y;
    case 15: return -x - y;
  }
  }

  function noise3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);

    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    const res = lerp(
      lerp(
        lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
        lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
    // Perlin returns in [-1,1]
    return res;
  }

  function octaveNoise(x, y, z, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let amplitude = 1;
    let frequency = 1;
    let max = 0;
    let total = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise3(x * frequency, y * frequency, z * frequency) * amplitude;
      max += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    // normalize to [-1,1]
    return total / max;
  }

  return { noise3, octaveNoise };
}
