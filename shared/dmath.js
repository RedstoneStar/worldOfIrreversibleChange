// Deterministic math helpers.
// World generation runs on BOTH the server and every visitor's browser, and the results
// must match bit-for-bit. Basic IEEE arithmetic (+ - * /), Math.floor, Math.sqrt and
// Math.imul are deterministic across JS engines, but Math.sin/cos/exp/pow are not
// guaranteed to be. So world generation only uses the functions in this file.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/** Deterministic sine (Taylor series after range reduction, ~1e-10 accuracy). */
export function dsin(x) {
  x = x - Math.floor((x + PI) / TAU) * TAU; // -> [-PI, PI)
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - (x2 / 110) * (1 - x2 / 156))))));
}

export function dcos(x) {
  return dsin(x + HALF_PI);
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
