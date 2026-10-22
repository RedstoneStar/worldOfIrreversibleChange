// Deterministic 2D value noise + fractal variants (arithmetic only).
import { hash2i } from './rng.js';

export function makeNoise(seed) {
  seed = seed | 0;

  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2i(ix, iy, seed);
    const b = hash2i(ix + 1, iy, seed);
    const c = hash2i(ix, iy + 1, seed);
    const d = hash2i(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  /** Fractal Brownian motion, returns ~[0, 1]. */
  function fbm(x, y, octaves = 4) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq + i * 17.31, y * freq - i * 9.71);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  /** Ridged noise (sharp crests) for mountain ranges, returns ~[0, 1]. */
  function ridge(x, y, octaves = 4) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(noise(x * freq + i * 31.7, y * freq + i * 3.3) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm;
  }

  return { noise, fbm, ridge };
}
