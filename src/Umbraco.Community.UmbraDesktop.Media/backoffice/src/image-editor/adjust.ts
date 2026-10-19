import type { Adjust } from './state.js';

/**
 * The four adjustments as one 4 × 5 colour matrix, row by row, for red, green, blue and alpha: each
 * output channel is the four input channels times the row's first four numbers, plus its fifth.
 * Channels are 0 to 1, so the fifth number is a fraction of full light. The layout Fabric's
 * `filters.ColorMatrix` takes, which draws the live preview, so the preview and the export are one
 * matrix and what is seen is what is saved.
 *
 * Pinned mapping (plan Task 14), applied in this order: exposure multiplies the light by
 * `2 ** (exposure / 100)`, a camera stop per hundred; brightness adds `brightness / 200`; contrast
 * scales round mid grey by `1 + contrast / 100`; saturation moves each colour from its luminance
 * (Rec. 709 weights, the sRGB primaries') by `1 + saturation / 100`, so -100 is grey.
 */

/** Rec. 709 luminance weights for red, green and blue. */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** A 4 × 5 colour matrix as a 5 × 5 affine one, so two compose by multiplying. */
type Affine = number[][];

/**
 * A 4 × 5 matrix as a 5 × 5 one.
 * @param m The 20 numbers.
 * @returns The rows.
 */
function affine(m: readonly number[]): Affine {
  return [m.slice(0, 5), m.slice(5, 10), m.slice(10, 15), m.slice(15, 20), [0, 0, 0, 0, 1]];
}

/**
 * Apply `a` after `b`.
 * @param a The later matrix.
 * @param b The earlier one.
 * @returns Their product.
 */
function compose(a: Affine, b: Affine): Affine {
  return a.map((row) => b[0].map((_, column) => row.reduce((sum, value, k) => sum + value * b[k][column], 0)));
}

/**
 * The adjustments' colour matrix.
 * @param adjust The slider values, -100 to 100.
 * @returns The 20 numbers; the identity when every slider is at zero.
 */
export function adjustMatrix(adjust: Adjust): number[] {
  const e = 2 ** (adjust.exposure / 100);
  const b = adjust.brightness / 200;
  const c = 1 + adjust.contrast / 100;
  const s = 1 + adjust.saturation / 100;
  const [lr, lg, lb] = LUMA;
  const exposure = affine([e, 0, 0, 0, 0, 0, e, 0, 0, 0, 0, 0, e, 0, 0, 0, 0, 0, 1, 0]);
  const brightness = affine([1, 0, 0, 0, b, 0, 1, 0, 0, b, 0, 0, 1, 0, b, 0, 0, 0, 1, 0]);
  const offset = 0.5 * (1 - c);
  const contrast = affine([c, 0, 0, 0, offset, 0, c, 0, 0, offset, 0, 0, c, 0, offset, 0, 0, 0, 1, 0]);
  const saturation = affine([
    lr + s * (1 - lr), lg - s * lg, lb - s * lb, 0, 0,
    lr - s * lr, lg + s * (1 - lg), lb - s * lb, 0, 0,
    lr - s * lr, lg - s * lg, lb + s * (1 - lb), 0, 0,
    0, 0, 0, 1, 0,
  ]);
  const all = compose(saturation, compose(contrast, compose(brightness, exposure)));
  return all.slice(0, 4).flat();
}

/**
 * Whether a matrix is the identity, so the export can skip a pass over every pixel.
 * @param m The 20 numbers.
 * @returns True for the identity.
 */
export function isIdentity(m: readonly number[]): boolean {
  return m.every((value, index) => Math.abs(value - (index % 6 === 0 ? 1 : 0)) < 1e-9);
}

/**
 * Apply a colour matrix to RGBA bytes in place, clamped to a byte, as the canvas 2D filter backend
 * does. The export's path: exact at any size, where a GPU texture has a limit (Review Focus 1).
 * @param data The pixels, four bytes each.
 * @param m The 20 numbers.
 */
export function applyMatrix(data: Uint8ClampedArray, m: readonly number[]): void {
  const [a0, a1, a2, a3, a4, b0, b1, b2, b3, b4, c0, c1, c2, c3, c4, d0, d1, d2, d3, d4] = m;
  const o0 = a4 * 255;
  const o1 = b4 * 255;
  const o2 = c4 * 255;
  const o3 = d4 * 255;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    // A Uint8ClampedArray rounds and clamps on write.
    data[i] = r * a0 + g * a1 + b * a2 + a * a3 + o0;
    data[i + 1] = r * b0 + g * b1 + b * b2 + a * b3 + o1;
    data[i + 2] = r * c0 + g * c1 + b * c2 + a * c3 + o2;
    data[i + 3] = r * d0 + g * d1 + b * d2 + a * d3 + o3;
  }
}
