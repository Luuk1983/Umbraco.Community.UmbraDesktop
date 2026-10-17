import type { Rect, Size } from './state.js';

/**
 * Redaction that cannot be undone from the saved file (design §4.1, the anti-goal "a redaction that
 * can be undone"). **Both styles are built only from block means**: the region is cut into square
 * blocks, each block's mean colour is all that survives, and the original pixels are gone. Pixelate
 * fills each block with its mean; Blur draws the same means back up smoothly and blurs once more, so
 * it looks soft but holds no more of the original than pixelate does. A plain Gaussian blur is not
 * used: a light one is reversible by deconvolution, which is exactly the redaction that fails.
 */

/** The strength a new region starts at, on the 1 to 10 scale: strong, per the design. */
export const REDACT_DEFAULT_STRENGTH = 8;

/** The smallest block, in px, below which a face or a number plate can still be made out. */
const MIN_BLOCK = 8;

/**
 * A region's block size: a share of the picture's shorter side, so a strength looks the same on a
 * phone photo and a thumbnail, never below {@link MIN_BLOCK}.
 * @param picture The picture's size.
 * @param strength 1 to 10.
 * @returns The block's side, in px.
 */
export function redactionBlock(picture: Size, strength: number): number {
  return Math.max(MIN_BLOCK, Math.round((Math.min(picture.w, picture.h) * strength) / 200));
}

/**
 * The mean colour of each block of a region.
 * @param data The region's pixels.
 * @param w Its width.
 * @param h Its height.
 * @param block The block side.
 * @returns The grid's size in blocks, and four channels per block.
 */
function blockMeans(data: Uint8ClampedArray, w: number, h: number, block: number) {
  const cols = Math.ceil(w / block);
  const rows = Math.ceil(h / block);
  const means = new Float64Array(cols * rows * 4);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const x0 = bx * block;
      const y0 = by * block;
      const x1 = Math.min(w, x0 + block);
      const y1 = Math.min(h, y0 + block);
      const sum = [0, 0, 0, 0];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sum[0] += data[i];
          sum[1] += data[i + 1];
          sum[2] += data[i + 2];
          sum[3] += data[i + 3];
        }
      }
      const count = (x1 - x0) * (y1 - y0);
      const at = (by * cols + bx) * 4;
      for (let c = 0; c < 4; c++) means[at + c] = sum[c] / count;
    }
  }
  return { cols, rows, means };
}

/**
 * The means drawn back up smoothly: each pixel takes the four nearest block centres' means,
 * weighted by distance, clamped at the edges.
 * @param target The region's pixels, overwritten.
 * @param w Its width.
 * @param h Its height.
 * @param block The block side.
 * @param grid The block means.
 */
function smoothUp(
  target: Uint8ClampedArray,
  w: number,
  h: number,
  block: number,
  grid: ReturnType<typeof blockMeans>,
): void {
  const { cols, rows, means } = grid;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  for (let y = 0; y < h; y++) {
    const gy = clamp((y + 0.5) / block - 0.5, rows - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(rows - 1, y0 + 1);
    const fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = clamp((x + 0.5) / block - 0.5, cols - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(cols - 1, x0 + 1);
      const fx = gx - x0;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = means[(y0 * cols + x0) * 4 + c] * (1 - fx) + means[(y0 * cols + x1) * 4 + c] * fx;
        const bottom = means[(y1 * cols + x0) * 4 + c] * (1 - fx) + means[(y1 * cols + x1) * 4 + c] * fx;
        target[i + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
}

/**
 * A box blur in place, across then down, clamped at the edges so nothing from outside the region is
 * mixed in and nothing from inside leaks out.
 *
 * A running sum along each line: the window moves one pixel by adding the pixel entering it and
 * taking away the one leaving, so the cost is the same at any radius. Summing the whole window for
 * every pixel cost 3 seconds for a 2000 × 1500 region at strength 8 on a 6000 × 4000 photo, on every
 * save (found by review, 2026-10-17).
 * @param data The region's pixels.
 * @param w Its width.
 * @param h Its height.
 * @param radius The blur's radius, in px.
 */
function boxBlur(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius < 1) return;
  const span = radius * 2 + 1;
  const line = new Float64Array(Math.max(w, h) * 4);
  const pass = (length: number, lines: number, index: (line: number, at: number) => number) => {
    const clamp = (at: number) => (at < 0 ? 0 : at >= length ? length - 1 : at);
    for (let l = 0; l < lines; l++) {
      for (let at = 0; at < length; at++) {
        const i = index(l, at);
        line[at * 4] = data[i];
        line[at * 4 + 1] = data[i + 1];
        line[at * 4 + 2] = data[i + 2];
        line[at * 4 + 3] = data[i + 3];
      }
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += line[clamp(k) * 4 + c];
        for (let at = 0; at < length; at++) {
          data[index(l, at) + c] = sum / span;
          sum += line[clamp(at + radius + 1) * 4 + c] - line[clamp(at - radius) * 4 + c];
        }
      }
    }
  };
  pass(w, h, (l, at) => (l * w + at) * 4);
  pass(h, w, (l, at) => (at * w + l) * 4);
}

/**
 * Redact one region of a canvas in place.
 * @param ctx The canvas's context, holding the picture.
 * @param rect The region, in the canvas's pixels; clipped to the canvas.
 * @param style Pixelate or blur.
 * @param block The block side, in the canvas's pixels.
 */
export function redact(ctx: CanvasRenderingContext2D, rect: Rect, style: 'pixelate' | 'blur', block: number): void {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(ctx.canvas.width, Math.ceil(rect.x + rect.w)) - x;
  const h = Math.min(ctx.canvas.height, Math.ceil(rect.y + rect.h)) - y;
  if (w <= 0 || h <= 0) return;
  const size = Math.max(1, Math.round(block));
  const image = ctx.getImageData(x, y, w, h);
  const grid = blockMeans(image.data, w, h, size);
  if (style === 'pixelate') {
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const at = (Math.floor(py / size) * grid.cols + Math.floor(px / size)) * 4;
        const i = (py * w + px) * 4;
        for (let c = 0; c < 4; c++) image.data[i + c] = grid.means[at + c];
      }
    }
  } else {
    smoothUp(image.data, w, h, size, grid);
    boxBlur(image.data, w, h, Math.max(1, Math.round(size / 2)));
  }
  ctx.putImageData(image, x, y);
}
