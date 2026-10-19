import { orientedSize } from './state.js';
import type { EditorState, Mark, Point, Rect, Region, Rotation, Size } from './state.js';

export { orientedSize };

/*
 * The editor's geometry, as pure functions: no state is ever changed, each answers a new one.
 * Design §4.1 (Crop, Resize) and §4.2 (zoom).
 */

/**
 * A change of orientation as a map of points in the oriented picture, with what it does to the
 * picture's size.
 */
interface Reorientation {
  /** Where a point goes. */
  point(point: Point): Point;
  /** Where a rectangle goes. */
  rect(rect: Rect): Rect;
}

/**
 * The map for one operation on a picture of the given oriented size.
 * @param op The operation.
 * @param size The oriented size before it.
 * @returns The map.
 */
function reorientation(op: 'right' | 'left' | 'h' | 'v', size: Size): Reorientation {
  const { w, h } = size;
  switch (op) {
    case 'right':
      return { point: ({ x, y }) => ({ x: h - y, y: x }), rect: (r) => ({ x: h - r.y - r.h, y: r.x, w: r.h, h: r.w }) };
    case 'left':
      return { point: ({ x, y }) => ({ x: y, y: w - x }), rect: (r) => ({ x: r.y, y: w - r.x - r.w, w: r.h, h: r.w }) };
    case 'h':
      return { point: ({ x, y }) => ({ x: w - x, y }), rect: (r) => ({ x: w - r.x - r.w, y: r.y, w: r.w, h: r.h }) };
    case 'v':
      return { point: ({ x, y }) => ({ x, y: h - y }), rect: (r) => ({ x: r.x, y: h - r.y - r.h, w: r.w, h: r.h }) };
  }
}

/**
 * A mark, moved by a map.
 * @param mark The mark.
 * @param map The map.
 * @returns The moved mark. Text turns its position, not its letters, which stay upright.
 */
function moveMark(mark: Mark, map: Reorientation): Mark {
  switch (mark.kind) {
    case 'text':
      return { ...mark, data: { ...mark.data, at: map.point(mark.data.at) } };
    case 'arrow':
      return { ...mark, data: { from: map.point(mark.data.from), to: map.point(mark.data.to) } };
    case 'box':
      return { ...mark, data: map.rect(mark.data) };
    case 'pen':
      return { ...mark, data: { points: mark.data.points.map((point) => map.point(point)) } };
  }
}

/**
 * Apply a map to everything in oriented space.
 * @param state The document.
 * @param map The map.
 * @returns The crop, marks and regions moved.
 */
function moveAll(state: EditorState, map: Reorientation): Pick<EditorState, 'crop' | 'marks' | 'regions'> {
  return {
    crop: state.crop ? map.rect(state.crop) : null,
    marks: state.marks.map((mark) => moveMark(mark, map)),
    regions: state.regions.map((region): Region => ({ ...region, rect: map.rect(region.rect) })),
  };
}

/**
 * Turn the picture a quarter, and everything on it with it.
 *
 * The state records its orientation as "turn, then flip", so a turn after a flip is written as the
 * flip on the other axis after the turn: a quarter turn of a mirrored picture is the turned picture
 * mirrored top to bottom. That keeps every orientation one of the eight the state can say.
 * @param state The document.
 * @param dir Which way.
 * @returns The turned document.
 */
export function rotate(state: EditorState, dir: 'left' | 'right'): EditorState {
  const map = reorientation(dir, orientedSize(state.source, state.rotation));
  const rotation = (((state.rotation + (dir === 'right' ? 90 : 270)) % 360) as Rotation);
  return {
    ...state,
    ...moveAll(state, map),
    rotation,
    flipH: state.flipV,
    flipV: state.flipH,
    size: state.size ? { w: state.size.h, h: state.size.w } : null,
  };
}

/**
 * Flip the turned picture, and everything on it with it.
 * @param state The document.
 * @param axis `h` mirrors left to right, `v` top to bottom.
 * @returns The flipped document.
 */
export function flip(state: EditorState, axis: 'h' | 'v'): EditorState {
  const map = reorientation(axis, orientedSize(state.source, state.rotation));
  return {
    ...state,
    ...moveAll(state, map),
    flipH: axis === 'h' ? !state.flipH : state.flipH,
    flipV: axis === 'v' ? !state.flipV : state.flipV,
  };
}

/**
 * Where a point of the upright picture is once the picture is turned and flipped: for something
 * the item stores against its file, such as its focal point, drawn on the turned picture.
 * @param state The document, for its turn and flips.
 * @param point The point, in the upright picture's pixels.
 * @returns The point in oriented space.
 */
export function orientPoint(state: EditorState, point: Point): Point {
  const { w, h } = state.source;
  const turned: Point =
    state.rotation === 90
      ? { x: h - point.y, y: point.x }
      : state.rotation === 180
        ? { x: w - point.x, y: h - point.y }
        : state.rotation === 270
          ? { x: point.y, y: w - point.x }
          : { ...point };
  const size = orientedSize(state.source, state.rotation);
  return { x: state.flipH ? size.w - turned.x : turned.x, y: state.flipV ? size.h - turned.y : turned.y };
}

/** The crop ratios Crop offers. */
export type RatioChoice = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9';

/** The fixed ratios, as long side over short. */
const RATIOS: Record<Exclude<RatioChoice, 'free' | 'original'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
};

/**
 * A crop ratio as width over height.
 * @param choice The ratio.
 * @param orientation Portrait puts the short side across.
 * @param original The picture, for Original.
 * @returns Width over height, or null for Free.
 */
export function ratioFor(choice: RatioChoice, orientation: 'portrait' | 'landscape', original: Size): number | null {
  if (choice === 'free') return null;
  const long =
    choice === 'original' ? Math.max(original.w, original.h) / Math.min(original.w, original.h) : RATIOS[choice];
  return orientation === 'portrait' ? 1 / long : long;
}

/**
 * Keep a crop inside the picture and at its ratio, round its own centre: it is shrunk to the ratio,
 * then to the picture, and slid back inside. Whole pixels, at least one.
 * @param rect The crop as drawn.
 * @param bounds The oriented picture.
 * @param ratio Width over height, or null for free.
 * @returns The crop.
 */
export function constrainCrop(rect: Rect, bounds: Size, ratio: number | null): Rect {
  let w = Math.max(1, rect.w);
  let h = Math.max(1, rect.h);
  if (ratio) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
  }
  if (w > bounds.w) {
    w = bounds.w;
    if (ratio) h = w / ratio;
  }
  if (h > bounds.h) {
    h = bounds.h;
    if (ratio) w = h * ratio;
  }
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const cx = rect.x + Math.max(1, rect.w) / 2;
  const cy = rect.y + Math.max(1, rect.h) / 2;
  const x = Math.min(Math.max(0, Math.round(cx - w / 2)), bounds.w - w);
  const y = Math.min(Math.max(0, Math.round(cy - h / 2)), bounds.h - h);
  return { x, y, w, h };
}

/**
 * A new size from a typed width or height, keeping the proportions while linked.
 * @param size The size now.
 * @param change The side that was typed.
 * @param linked Whether the other side follows.
 * @returns The new size, in whole pixels, at least one each way.
 */
export function linkedResize(size: Size, change: { w?: number; h?: number }, linked: boolean): Size {
  const whole = (value: number) => Math.max(1, Math.round(value));
  if (change.w !== undefined) {
    const w = whole(change.w);
    return { w, h: linked ? whole((w * size.h) / size.w) : size.h };
  }
  if (change.h !== undefined) {
    const h = whole(change.h);
    return { w: linked ? whole((h * size.w) / size.h) : size.w, h };
  }
  return { ...size };
}

/** A common width, as Resize offers it. */
export interface PresetSize {
  /** The width, or Half. */
  key: '2560' | '1920' | '1280' | '800' | 'half';
  /** The size it gives, in proportion. */
  size: Size;
  /** Offered only when it shrinks the picture: enlarging is allowed by typing, not suggested. */
  enabled: boolean;
}

/** The common widths, widest first: a 4K-ish screen, full HD, a laptop, and a content column. */
const PRESET_WIDTHS = [2560, 1920, 1280, 800] as const;

/**
 * The common widths for a picture, each in proportion.
 * @param current The picture's size now.
 * @returns The presets, Half last.
 */
export function presetSizes(current: Size): PresetSize[] {
  const widths = PRESET_WIDTHS.map(
    (width): PresetSize => ({
      key: String(width) as PresetSize['key'],
      size: linkedResize(current, { w: width }, true),
      enabled: width < current.w,
    }),
  );
  return [
    ...widths,
    {
      key: 'half',
      size: { w: Math.max(1, Math.round(current.w / 2)), h: Math.max(1, Math.round(current.h / 2)) },
      enabled: current.w > 1 && current.h > 1,
    },
  ];
}

/** The furthest out the view zooms: a 6000px photo is 300px wide. */
export const MIN_ZOOM = 0.05;

/** The furthest in: eight screen pixels per picture pixel, enough to place a redaction exactly. */
export const MAX_ZOOM = 8;

/** The levels Zoom in and Zoom out step through, as Photoshop's and the Photos apps' do. */
export const ZOOM_STEPS: readonly number[] = [MIN_ZOOM, 0.1, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3, 4, 6, MAX_ZOOM];

/**
 * The zoom that fits a picture into the view, never above 100%: a small picture is shown at its
 * own size rather than blown up.
 * @param image The picture.
 * @param viewport The view.
 * @returns The zoom.
 */
export function fitZoom(image: Size, viewport: Size): number {
  return Math.max(MIN_ZOOM, Math.min(1, viewport.w / image.w, viewport.h / image.h));
}

/**
 * The next zoom level in or out from any zoom, including one between levels (a fit, a pinch).
 * @param current The zoom now.
 * @param dir In or out.
 * @returns The next level, within the limits.
 */
export function stepZoom(current: number, dir: 1 | -1): number {
  const epsilon = 1e-6;
  if (dir === 1) return ZOOM_STEPS.find((step) => step > current + epsilon) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((step) => step < current - epsilon) ?? MIN_ZOOM;
}
