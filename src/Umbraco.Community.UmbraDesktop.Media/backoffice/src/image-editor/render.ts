import { adjustMatrix, applyMatrix, isIdentity } from './adjust.js';
import { redact, redactionBlock } from './redact.js';
import { orientedSize, outputSize } from './state.js';
import type { EditorState, Mark, Rect, Size } from './state.js';

/** A decoded picture: what `decodePicture` answers, or anything else a canvas can draw. */
export type Picture = CanvasImageSource & { width: number; height: number };

/** How to render. */
export interface RenderOptions {
  /**
   * The size to draw at, as a share of the saved size: 1 for the file itself, less for a view or a
   * preview, which is drawn at the reduced size from the start rather than shrunk afterwards.
   */
  scale?: number;
  /**
   * Whether to flatten the marks and regions in. True for the file; false for the editing view,
   * which draws them as objects it can still move (design §4.2).
   */
  withOverlays?: boolean;
}

/** Rows the colour matrix reads and writes at a time, so a 24-megapixel picture is not copied whole. */
const STRIP_ROWS = 256;

/**
 * A new canvas.
 * @param size Its size, rounded, at least a pixel.
 * @returns The canvas and a context that reads back quickly, which the matrix and redaction need.
 */
function canvasOf(size: Size): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.w));
  canvas.height = Math.max(1, Math.round(size.h));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('A canvas could not be created for the picture.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/**
 * Point the context at the picture turned and flipped, so drawing the decoded picture at 0, 0 lays
 * it down in oriented space. Canvas transforms apply last call first, so the flip is set before the
 * turn: a point is turned, then flipped, which is the order the state records.
 * @param ctx The context, already scaled and moved to the crop.
 * @param state The document.
 */
function orient(ctx: CanvasRenderingContext2D, state: EditorState): void {
  const { w, h } = state.source;
  const turned = orientedSize(state.source, state.rotation);
  if (state.flipH) ctx.transform(-1, 0, 0, 1, turned.w, 0);
  if (state.flipV) ctx.transform(1, 0, 0, -1, 0, turned.h);
  switch (state.rotation) {
    case 90:
      ctx.transform(0, 1, -1, 0, h, 0);
      break;
    case 180:
      ctx.transform(-1, 0, 0, -1, w, h);
      break;
    case 270:
      ctx.transform(0, -1, 1, 0, 0, w);
      break;
  }
}

/**
 * Draw one mark, in oriented space.
 * @param ctx The context, transformed to oriented space.
 * @param mark The mark.
 */
export function drawMark(ctx: CanvasRenderingContext2D, mark: Mark): void {
  ctx.save();
  ctx.strokeStyle = mark.colour;
  ctx.fillStyle = mark.colour;
  ctx.lineWidth = mark.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (mark.kind) {
    case 'box':
      ctx.lineJoin = 'miter';
      ctx.strokeRect(mark.data.x, mark.data.y, mark.data.w, mark.data.h);
      break;
    case 'pen': {
      const [first, ...rest] = mark.data.points;
      if (!first) break;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const point of rest) ctx.lineTo(point.x, point.y);
      if (!rest.length) ctx.lineTo(first.x + 0.01, first.y);
      ctx.stroke();
      break;
    }
    case 'arrow': {
      const { from, to } = mark.data;
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = Math.max(12, mark.width * 4);
      const path = new Path2D();
      path.moveTo(from.x, from.y);
      path.lineTo(to.x, to.y);
      path.moveTo(to.x - head * Math.cos(angle - 0.45), to.y - head * Math.sin(angle - 0.45));
      path.lineTo(to.x, to.y);
      path.lineTo(to.x - head * Math.cos(angle + 0.45), to.y - head * Math.sin(angle + 0.45));
      // A light halo under the arrow, as in the mocks, so it reads on a dark photo and a light one.
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = mark.width + 4;
      ctx.stroke(path);
      ctx.restore();
      ctx.stroke(path);
      break;
    }
    case 'text': {
      const { at, text, size } = mark.data;
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      text.split('\n').forEach((line, index) => ctx.fillText(line, at.x, at.y + index * size * 1.2));
      break;
    }
  }
  ctx.restore();
}

/**
 * Draw the document, in the fixed order: turn and flip, crop, adjust, redact, marks, resize
 * (plan Task 14).
 *
 * **The file is drawn at full resolution, always.** The colour matrix runs on the CPU over the
 * pixels, in strips, rather than through a GPU texture, so a 6000 × 4000 photo is adjusted at
 * 6000 × 4000: a WebGL texture has a size limit (4096 by default in Fabric) past which a GPU filter
 * either downscales the picture or skips it, silently (Review Focus 1). The editing view uses
 * Fabric's WebGL filter with the same matrix, on a screen-sized picture where the limit never bites.
 * @param picture The decoded picture.
 * @param state The document.
 * @param options The size and whether to flatten.
 * @returns A canvas of `outputSize(state)` times the scale.
 */
export function renderDocument(picture: Picture, state: EditorState, options: RenderOptions = {}): HTMLCanvasElement {
  const scale = options.scale ?? 1;
  const withOverlays = options.withOverlays ?? true;
  const oriented = orientedSize(state.source, state.rotation);
  const crop: Rect = state.crop ?? { x: 0, y: 0, w: oriented.w, h: oriented.h };
  const out = outputSize(state);
  // The working scale against oriented pixels: the file is worked on at full size and resized last;
  // a view is worked on at its own size, so a fit view of a large photo never touches every pixel.
  const k = scale === 1 ? 1 : Math.min(1, (scale * out.w) / crop.w);

  const work = canvasOf({ w: crop.w * k, h: crop.h * k });
  const toCrop = () => work.ctx.setTransform(k, 0, 0, k, -crop.x * k, -crop.y * k);
  toCrop();
  orient(work.ctx, state);
  work.ctx.drawImage(picture, 0, 0);
  work.ctx.setTransform(1, 0, 0, 1, 0, 0);

  const matrix = adjustMatrix(state.adjust);
  if (!isIdentity(matrix)) {
    const { width, height } = work.canvas;
    for (let y = 0; y < height; y += STRIP_ROWS) {
      const rows = Math.min(STRIP_ROWS, height - y);
      const strip = work.ctx.getImageData(0, y, width, rows);
      applyMatrix(strip.data, matrix);
      work.ctx.putImageData(strip, 0, y);
    }
  }

  if (withOverlays) {
    for (const region of state.regions) {
      const rect = {
        x: (region.rect.x - crop.x) * k,
        y: (region.rect.y - crop.y) * k,
        w: region.rect.w * k,
        h: region.rect.h * k,
      };
      redact(work.ctx, rect, region.style, redactionBlock(oriented, region.strength) * k);
    }
    toCrop();
    for (const mark of state.marks) drawMark(work.ctx, mark);
    work.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const final = { w: Math.max(1, Math.round(out.w * scale)), h: Math.max(1, Math.round(out.h * scale)) };
  if (final.w === work.canvas.width && final.h === work.canvas.height) return work.canvas;
  const resized = canvasOf(final);
  resized.ctx.drawImage(work.canvas, 0, 0, final.w, final.h);
  return resized.canvas;
}
