// Deterministic world generator, shared by server and browser.
// Produces a circular forest basin ringed by mountains, a central lake with islands,
// braided rivers that branch off the lake and reconnect, scattered ponds, clearings,
// and every plant / stone / log in the world.
import { WORLD, T, FIELD } from './config.js';
import { RNG, strSeed } from './rng.js';
import { makeNoise } from './noise.js';
import { dsin, dcos, clamp, smoothstep, lerp, dist, TAU } from './dmath.js';
import { SPECIES } from './species.js';

export function seedFrom(input) {
  return typeof input === 'number' ? input >>> 0 : strSeed(String(input));
}

export function generateWorld(seedInput = WORLD.defaultSeed) {
  const seed = seedFrom(seedInput);
  const N = WORLD.size, R = WORLD.radius, C = N / 2, NN = N * N;
  const rng = new RNG(seed);
  const nA = makeNoise(seed ^ 0x51ed270b);
  const nB = makeNoise((Math.imul(seed, 7) + 13) | 0);
  const nC = makeNoise((Math.imul(seed, 31) + 7) | 0);
  const nD = makeNoise((seed ^ 0x2545f491) | 0);

  const rim = new Float32Array(NN); // warped normalized radius (0 center .. 1 mountain crest)
  const elev = new Float32Array(NN); // meters
  const water = new Float32Array(NN).fill(FIELD.sdMax); // signed distance to water edge (neg = in water)
  const clear = new Float32Array(NN); // clearing-ness 0..1
  const terrain = new Uint8Array(NN);

  const idx = (x, y) => (y | 0) * N + (x | 0);
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  // ------------------------------------------------------------------ 1. basin + mountains
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = x + 0.5 - C, dy = y + 0.5 - C;
      const d = Math.sqrt(dx * dx + dy * dy);
      const warp = (nA.fbm(x * 0.0045, y * 0.0045, 4) - 0.5) * 0.16 + (nA.noise(x * 0.02 + 300, y * 0.02) - 0.5) * 0.03;
      const r = d / R + warp;
      rim[i] = r;
      let e = 2 + 20 * r * r + (nB.fbm(x * 0.012, y * 0.012, 3) - 0.5) * 7;
      if (r > 0.78) {
        const t = (r - 0.78) / 0.22;
        const rr = nC.ridge(x * 0.011, y * 0.011, 4);
        e += t * Math.sqrt(t) * (150 + 190 * rr) + t * 30;
      }
      elev[i] = e;
    }
  }

  // ------------------------------------------------------------------ 2. central lake + islands
  const lake = { x: C + rng.float(-14, 14), y: C + rng.float(-14, 14), r: R * 0.17 };
  const islands = [];
  {
    const a0 = rng.float(0, TAU);
    const off = lake.r * rng.float(0.05, 0.22);
    islands.push({ x: lake.x + dcos(a0) * off, y: lake.y + dsin(a0) * off, r: rng.float(15, 21) });
    const count = rng.int(2, 3);
    let tries = 0;
    while (islands.length < count + 1 && tries++ < 60) {
      const a = rng.float(0, TAU);
      const o = lake.r * rng.float(0.42, 0.62);
      const isl = { x: lake.x + dcos(a) * o, y: lake.y + dsin(a) * o, r: rng.float(6.5, 12) };
      let ok = true;
      for (const j of islands) if (dist(isl.x, isl.y, j.x, j.y) < isl.r + j.r + 9) ok = false;
      if (ok) islands.push(isl);
    }
    const ext = Math.ceil(lake.r * 1.5);
    for (let y = Math.floor(lake.y - ext); y < lake.y + ext; y++) {
      for (let x = Math.floor(lake.x - ext); x < lake.x + ext; x++) {
        if (!inBounds(x, y)) continue;
        const px = x + 0.5, py = y + 0.5;
        const mod = 1 + (nD.fbm(px * 0.014 + 40, py * 0.014 + 40, 3) - 0.5) * 0.6;
        let sd = dist(px, py, lake.x, lake.y) - lake.r * mod;
        for (let k = 0; k < islands.length; k++) {
          const isl = islands[k];
          const dI = dist(px, py, isl.x, isl.y) - isl.r * (1 + (nD.fbm(px * 0.05 + k * 10, py * 0.05, 2) - 0.5) * 0.7);
          if (-dI > sd) sd = -dI;
        }
        const i = y * N + x;
        if (sd < water[i]) water[i] = sd;
      }
    }
  }

  // ------------------------------------------------------------------ 3. ponds
  const ponds = [];
  {
    const count = rng.int(9, 13);
    let tries = 0;
    while (ponds.length < count && tries++ < 400) {
      const a = rng.float(0, TAU), rf = rng.float(0.3, 0.74);
      const p = { x: C + dcos(a) * rf * R, y: C + dsin(a) * rf * R, r: rng.float(5, 15) };
      if (!inBounds(p.x, p.y) || water[idx(p.x, p.y)] < 20) continue;
      if (rim[idx(p.x, p.y)] > 0.76) continue;
      let ok = true;
      for (const q of ponds) if (dist(p.x, p.y, q.x, q.y) < 60) ok = false;
      if (!ok) continue;
      ponds.push(p);
      const k = ponds.length;
      const ext = Math.ceil(p.r * 1.6 + 6);
      for (let y = Math.floor(p.y - ext); y < p.y + ext; y++) {
        for (let x = Math.floor(p.x - ext); x < p.x + ext; x++) {
          if (!inBounds(x, y)) continue;
          const px = x + 0.5, py = y + 0.5;
          const sd = dist(px, py, p.x, p.y) - p.r * (1 + (nD.fbm(px * 0.08 + k * 20, py * 0.08, 2) - 0.5) * 0.6);
          const i = y * N + x;
          if (sd < water[i]) water[i] = sd;
        }
      }
    }
  }

  // ------------------------------------------------------------------ 4. braided rivers
  const OCC = N / 4;
  const occ = new Int16Array(OCC * OCC).fill(-1);
  const rivers = [];
  const STEP = 2;
  const occAt = (x, y) => (inBounds(x, y) ? occ[Math.floor(y / 4) * OCC + Math.floor(x / 4)] : -1);
  const markOcc = (x, y, w, id) => {
    const rr = w * 0.5 + 3;
    for (let gy = Math.floor((y - rr) / 4); gy <= Math.floor((y + rr) / 4); gy++)
      for (let gx = Math.floor((x - rr) / 4); gx <= Math.floor((x + rr) / 4); gx++)
        if (gx >= 0 && gy >= 0 && gx < OCC && gy < OCC && occ[gy * OCC + gx] < 0) occ[gy * OCC + gx] = id;
  };

  const queue = [];
  const mainCount = rng.int(5, 6);
  const angle0 = rng.float(0, TAU);
  for (let k = 0; k < mainCount; k++) {
    const a = angle0 + (k / mainCount) * TAU + rng.float(-0.35, 0.35);
    queue.push({
      x: lake.x + dcos(a) * lake.r * 0.6, y: lake.y + dsin(a) * lake.r * 0.6,
      hx: dcos(a), hy: dsin(a), w: 8, parent: -1, main: true, depth: 0, curv: 0, maxSteps: 420,
    });
  }
  let branchCount = 0;
  const maxBranches = 13;

  while (queue.length) {
    const sp = queue.shift();
    const id = rivers.length;
    const pts = [];
    let { x, y, hx, hy } = sp;
    let leftWater = !sp.main;
    let joined = -1;
    for (let s = 0; s < sp.maxSteps; s++) {
      if (!inBounds(x, y)) break;
      const r = rim[idx(x, y)];
      const ww = sp.main
        ? lerp(8.5, 3.2, clamp((r - 0.2) / 0.62, 0, 1)) * (0.85 + nB.noise(s * 0.05, id * 7.7) * 0.3)
        : sp.w * (0.85 + nB.noise(s * 0.06, id * 5.1) * 0.3);
      pts.push(x, y, ww);
      if (r > (sp.main ? 0.87 : 0.82)) break;
      const inWater = water[idx(x, y)] < -1;
      if (!leftWater) {
        if (!inWater) leftWater = true;
      } else if (sp.main) {
        // main rivers run all the way to the mountains, passing through ponds
      } else {
        if (inWater && s > 3) break; // flowed into the lake or a pond
        const ax = x + hx * 3, ay = y + hy * 3;
        const o = occAt(ax, ay);
        if (s > 6 && o >= 0 && o !== id && (o !== sp.parent || s > 14)) {
          pts.push(ax, ay, ww);
          joined = o;
          break;
        }
      }
      // spawn branches
      if (leftWater && branchCount < maxBranches && s > 30 && r < 0.68) {
        const p = sp.main ? 0.012 : sp.depth < 2 ? 0.004 : 0;
        if (p > 0 && rng.chance(p)) {
          const side = rng.chance(0.5) ? 1 : -1;
          const a = side * rng.float(0.55, 1.1);
          const ca = dcos(a), sa = dsin(a);
          queue.push({
            x, y, hx: hx * ca - hy * sa, hy: hx * sa + hy * ca,
            w: ww * rng.float(0.55, 0.75), parent: id, main: false, depth: sp.depth + 1,
            curv: side * rng.float(0.004, 0.014), maxSteps: rng.int(90, 260),
          });
          branchCount++;
        }
      }
      if (leftWater) markOcc(x, y, ww, id);
      // meander (gentle, fast-alternating bends) + pull back toward a slowly curving base course
      const a = (nB.noise(s * 0.07 + id * 13.7, id * 3.1) - 0.5) * 0.28 + (nC.noise(s * 0.02 + id * 5.3, 9.1) - 0.5) * 0.08;
      const ca = dcos(a), sa = dsin(a);
      let nhx = hx * ca - hy * sa, nhy = hx * sa + hy * ca;
      const bc = dcos(sp.curv), bs = dsin(sp.curv);
      const bhx = sp.bhx ?? sp.hx, bhy = sp.bhy ?? sp.hy;
      sp.bhx = bhx * bc - bhy * bs; sp.bhy = bhx * bs + bhy * bc;
      nhx += sp.bhx * 0.06; nhy += sp.bhy * 0.06;
      const dx = x - C, dy = y - C, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      if (sp.main) {
        nhx += (dx / dl) * 0.035; nhy += (dy / dl) * 0.035;
      } else if (r > 0.74) {
        nhx -= (dx / dl) * 0.08; nhy -= (dy / dl) * 0.08;
      }
      const hl = Math.sqrt(nhx * nhx + nhy * nhy) || 1;
      hx = nhx / hl; hy = nhy / hl;
      x += hx * STEP; y += hy * STEP;
    }
    rivers.push({ id, parent: sp.parent, main: sp.main, joined, pts });
  }

  // stamp rivers into the water field (with 1 m interpolation) and carve their valleys
  for (const rv of rivers) {
    const p = rv.pts;
    if (p.length < 18) continue; // tiny stubs swallowed by ponds
    for (let j = 0; j < p.length; j += 3) {
      const subs = j + 3 < p.length ? 2 : 1;
      for (let sub = 0; sub < subs; sub++) {
        const t = sub / 2;
        const px = sub ? lerp(p[j], p[j + 3], t) : p[j];
        const py = sub ? lerp(p[j + 1], p[j + 4], t) : p[j + 1];
        const hw = (sub ? lerp(p[j + 2], p[j + 5], t) : p[j + 2]) * 0.5;
        const ext = Math.ceil(hw + 12);
        for (let y = Math.floor(py - ext); y <= py + ext; y++) {
          for (let x = Math.floor(px - ext); x <= px + ext; x++) {
            if (!inBounds(x, y)) continue;
            const i = y * N + x;
            const dd = dist(x + 0.5, y + 0.5, px, py) - hw;
            if (dd < water[i]) water[i] = dd;
            if (dd < 12) {
              const carve = ((12 - dd) / 12) * Math.min(elev[i] * 0.25, 25);
              const target = elev[i] - carve;
              if (target < elev[i]) elev[i] = target;
            }
          }
        }
      }
    }
  }
  for (let i = 0; i < NN; i++) if (water[i] < FIELD.sdMin) water[i] = FIELD.sdMin;

  // ------------------------------------------------------------------ 5. clearings
  const clearings = [];
  {
    // the genesis clearing: close to the lake, away from rivers
    let best = null;
    for (let k = 0; k < 28; k++) {
      const a = rng.float(0, TAU);
      const d = lake.r + rng.float(38, 60);
      const x = lake.x + dcos(a) * d, y = lake.y + dsin(a) * d;
      const w = water[idx(x, y)];
      if (!best || w > best.w) best = { x, y, w };
    }
    clearings.push({ x: best.x, y: best.y, r: 24, genesis: true });
    let tries = 0;
    const want = rng.int(12, 16);
    while (clearings.length < want && tries++ < 500) {
      const a = rng.float(0, TAU), rf = rng.float(0.22, 0.76);
      const c = { x: C + dcos(a) * rf * R, y: C + dsin(a) * rf * R, r: rng.float(12, 30) };
      if (water[idx(c.x, c.y)] < 8) continue;
      let ok = true;
      for (const o of clearings) if (dist(c.x, c.y, o.x, o.y) < 55) ok = false;
      if (ok) clearings.push(c);
    }
    for (let k = 0; k < clearings.length; k++) {
      const c = clearings[k];
      const ext = Math.ceil(c.r * 1.7);
      for (let y = Math.floor(c.y - ext); y <= c.y + ext; y++) {
        for (let x = Math.floor(c.x - ext); x <= c.x + ext; x++) {
          if (!inBounds(x, y)) continue;
          const i = y * N + x;
          const rr = c.r * (0.8 + nA.noise(x * 0.06 + k * 9, y * 0.06) * 0.45);
          const f = 1 - smoothstep(0.55, 1.25, dist(x + 0.5, y + 0.5, c.x, c.y) / rr);
          if (f > clear[i]) clear[i] = f;
        }
      }
    }
    // open meadows from large-scale noise
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const i = y * N + x;
        if (rim[i] > 0.8) continue;
        const m = nD.fbm(x * 0.006, y * 0.006, 3);
        if (m > 0.64) {
          const f = smoothstep(0.64, 0.76, m) * 0.75;
          if (f > clear[i]) clear[i] = f;
        }
      }
    }
  }

  // ------------------------------------------------------------------ 6. terrain classes
  for (let i = 0; i < NN; i++) {
    const r = rim[i], sd = water[i];
    let t;
    if (r > 1.0) t = T.VOID;
    else if (r > 0.95) t = T.PEAK;
    else if (sd < -2.5) t = T.DEEP;
    else if (sd < 0) t = T.SHALLOW;
    else if (r > 0.87) t = T.MOUNTAIN;
    else if (r > 0.81) t = T.FOOTHILL;
    else if (sd < 1.5) t = T.SHORE;
    else if (clear[i] > 0.5) t = T.CLEARING;
    else t = T.FOREST;
    terrain[i] = t;
  }

  // ------------------------------------------------------------------ 7. flora + objects
  const flora = [];
  const add = (s, x, y, size, v) => flora.push({ id: flora.length, s, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, size, v });
  const zone = (x, y) => ({
    conifer: nC.fbm(x * 0.004 + 11, y * 0.004 + 5, 3),
    blossom: nA.fbm(x * 0.005 + 71, y * 0.005 + 3, 3),
    maple: nB.fbm(x * 0.005 - 41, y * 0.005 + 19, 3),
    bamboo: nD.fbm(x * 0.008 + 5, y * 0.008 - 77, 3),
    broad: nD.fbm(x * 0.004 - 9, y * 0.004 + 33, 3),
  });

  // trees
  {
    const S = 4.4;
    const G = Math.floor(N / S);
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const x = (gx + 0.15 + rng.next() * 0.7) * S;
        const y = (gy + 0.15 + rng.next() * 0.7) * S;
        const roll = rng.next();
        const i = idx(x, y);
        const r = rim[i], sd = water[i];
        if (r > 0.92 || sd < 0.8) continue;
        let dens = 0.35 + nD.fbm(x * 0.01 + 200, y * 0.01, 3) * 0.8;
        dens *= 1 - clear[i] * 0.95;
        if (r > 0.8) dens *= clamp((0.92 - r) / 0.12, 0, 1) * 0.8;
        if (roll > dens) continue;
        const z = zone(x, y);
        const edge = clear[i] > 0.12 && clear[i] < 0.6 ? 1 : 0;
        const species = rng.weighted([
          ['willow', sd < 7 ? 12 * (1 - sd / 7) : 0],
          ['pine', 0.6 + z.conifer * 1.5 + (r > 0.74 ? 3 : 0)],
          ['cedar', Math.max(0, z.conifer - 0.45) * 6 + (r > 0.7 ? 1 : 0)],
          ['sakura', Math.max(0, z.blossom - 0.5) * 8 + edge * 1.5],
          ['maple', Math.max(0, z.maple - 0.45) * 6 + 0.4],
          ['oak', 0.5 + z.broad * 1.2],
          ['chestnut', Math.max(0, z.broad - 0.5) * 3],
          ['ginkgo', 0.15],
          ['persimmon', 0.2 + edge * 0.8],
          ['bamboo', z.bamboo > 0.68 && sd > 3 ? 9 : 0],
        ]);
        const size = rng.float(0.75, 1.2);
        const v = rng.int(0, 4);
        if (species === 'bamboo') {
          const n = rng.int(2, 4);
          for (let k = 0; k < n; k++) add('bamboo', x + rng.float(-1.6, 1.6), y + rng.float(-1.6, 1.6), rng.float(0.8, 1.15), rng.int(0, 4));
        } else add(species, x, y, size, v);
      }
    }
  }

  // undergrowth, reeds, stones, logs
  {
    const S = 5.5;
    const G = Math.floor(N / S);
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const x = (gx + 0.1 + rng.next() * 0.8) * S;
        const y = (gy + 0.1 + rng.next() * 0.8) * S;
        const roll = rng.next();
        const pick = rng.next();
        const i = idx(x, y);
        const r = rim[i], sd = water[i], cl = clear[i];
        if (r > 0.9) continue;
        const z = zone(x, y);
        if (sd < 0.3) {
          if (sd > -1.6 && r < 0.85 && roll < 0.55) add('reeds', x, y, rng.float(0.8, 1.2), rng.int(0, 4));
          continue;
        }
        // stones & minerals along banks
        if (sd < 3.5) {
          const gravel = nC.noise(x * 0.03 + 50, y * 0.03);
          if (roll < 0.05) { add('stones', x, y, rng.float(0.7, 1.3), rng.int(0, 4)); continue; }
          if (gravel > 0.6 && roll < 0.22) { add('flint', x, y, rng.float(0.7, 1.2), rng.int(0, 4)); continue; }
          if (gravel < 0.3 && roll < 0.2) { add('clay', x, y, rng.float(0.8, 1.3), rng.int(0, 4)); continue; }
        }
        if (r > 0.78 && roll < 0.16) {
          add(pick < 0.25 ? 'ironstone' : pick < 0.5 ? 'stones' : 'boulder', x, y, rng.float(0.7, 1.4), rng.int(0, 4));
          continue;
        }
        if (roll > 0.36) continue;
        const shade = 1 - cl;
        const sp = rng.weighted([
          ['bramble', 0.6 + cl * 1.6 + (sd < 10 ? 0.5 : 0)],
          ['bilberry', 0.8 * shade + z.conifer * 0.8],
          ['elder', 0.45],
          ['yew', 0.18 * shade],
          ['hazel', 0.35 + z.broad * 0.6],
          ['fern', 1.4 * shade + (sd < 12 ? 0.6 : 0)],
          ['wildgarlic', sd < 15 ? 0.9 * shade : 0.1],
          ['deadwood', 0.7 * shade],
          ['log', 0.45 * shade],
          ['boulder', 0.25],
          ['mushroom_brown', 0.35 * shade],
          ['mushroom_red', 0.16 * shade],
          ['mushroom_pale', 0.1 * shade],
        ]);
        add(sp, x, y, rng.float(0.7, 1.3), rng.int(0, 4));
      }
    }
  }

  // wildflowers in clearings
  {
    const S = 3;
    const G = Math.floor(N / S);
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const x = (gx + rng.next()) * S;
        const y = (gy + rng.next()) * S;
        const roll = rng.next();
        const i = idx(x, y);
        const cl = clear[i];
        if (cl < 0.3 || water[i] < 1 || rim[i] > 0.82) continue;
        if (roll > cl * 0.3) continue;
        const f = nB.noise(x * 0.05 + 7, y * 0.05 - 3);
        add(f < 0.33 ? 'chrysanthemum' : f < 0.6 ? 'violet' : 'wildflower', x, y, rng.float(0.8, 1.3), rng.int(0, 4));
      }
    }
  }

  // ------------------------------------------------------------------ 8. checksum
  let h = 0x811c9dc5;
  for (let i = 0; i < NN; i += 13) {
    h ^= Math.round(water[i] * 16) & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= Math.round(elev[i]) & 0xffff;
    h = Math.imul(h, 0x01000193);
  }
  for (let k = 0; k < flora.length; k += 7) {
    h ^= Math.round(flora[k].x * 10) ^ (Math.round(flora[k].y * 10) << 12);
    h = Math.imul(h, 0x01000193);
  }
  h ^= flora.length;
  const checksum = (h >>> 0).toString(16);

  const genesis = clearings[0];
  return {
    seed, N, R, C, rim, elev, water, clear, terrain,
    lake, islands, ponds, rivers, clearings, flora,
    spawn: { x: genesis.x, y: genesis.y },
    checksum,
  };
}

// ------------------------------------------------------------------ sampling helpers

/** Bilinear sample of a per-cell field at world position (meters). */
export function sampleField(world, field, x, y) {
  const N = world.N;
  const fx = clamp(x - 0.5, 0, N - 1.001), fy = clamp(y - 0.5, 0, N - 1.001);
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const i = iy * N + ix;
  const a = field[i], b = field[i + 1], c = field[i + N], d = field[i + N + 1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export function terrainAt(world, x, y) {
  if (x < 0 || y < 0 || x >= world.N || y >= world.N) return T.VOID;
  return world.terrain[Math.floor(y) * world.N + Math.floor(x)];
}

/** Uniform-grid spatial index over flora for fast area queries. */
export function buildFloraGrid(flora, size, cs = 16) {
  const cols = Math.ceil(size / cs);
  const cells = new Array(cols * cols);
  for (let i = 0; i < cells.length; i++) cells[i] = [];
  for (const f of flora) {
    const gx = clamp(Math.floor(f.x / cs), 0, cols - 1), gy = clamp(Math.floor(f.y / cs), 0, cols - 1);
    cells[gy * cols + gx].push(f);
  }
  return {
    cs, cols, cells,
    query(x0, y0, x1, y1, cb) {
      const gx0 = clamp(Math.floor(x0 / cs), 0, cols - 1), gx1 = clamp(Math.floor(x1 / cs), 0, cols - 1);
      const gy0 = clamp(Math.floor(y0 / cs), 0, cols - 1), gy1 = clamp(Math.floor(y1 / cs), 0, cols - 1);
      for (let gy = gy0; gy <= gy1; gy++)
        for (let gx = gx0; gx <= gx1; gx++) {
          const cell = cells[gy * cols + gx];
          for (let k = 0; k < cell.length; k++) {
            const f = cell[k];
            if (f.x >= x0 && f.x <= x1 && f.y >= y0 && f.y <= y1) cb(f);
          }
        }
    },
  };
}

export { SPECIES };
