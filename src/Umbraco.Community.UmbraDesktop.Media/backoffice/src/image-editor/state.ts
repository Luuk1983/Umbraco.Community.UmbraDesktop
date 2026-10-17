/**
 * The editor's document: everything an edit changes, as plain data, so the undo history keeps whole
 * states and every operation is a pure function from one state to the next (design §4.2).
 *
 * **Oriented space.** The picture is turned and flipped first, and everything after that (the crop,
 * the marks, the regions) is in the turned picture's pixels. So a crop never moves a mark, and a turn
 * moves all three together (`geometry.ts`). The decoded picture itself is never in the state: it is
 * the same for every state of one file, and a state stays small enough to keep hundreds of.
 */

/** A size in pixels. */
export interface Size {
  /** Width. */
  w: number;
  /** Height. */
  h: number;
}

/** A point in pixels. */
export interface Point {
  /** From the left. */
  x: number;
  /** From the top. */
  y: number;
}

/** A rectangle in pixels. */
export interface Rect extends Point, Size {}

/** A quarter turn, clockwise. */
export type Rotation = 0 | 90 | 180 | 270;

/** The four adjustments, each -100 to 100 with 0 neutral. */
export interface Adjust {
  /** Exposure: multiplies the light, as a camera stop does. */
  exposure: number;
  /** Brightness: adds light evenly. */
  brightness: number;
  /** Contrast: spreads or gathers the tones round the middle. */
  contrast: number;
  /** Saturation: more colour, or less, down to grey. */
  saturation: number;
}

/** What every mark has. */
interface MarkBase {
  /** Stable across edits, so a selected mark stays selected through undo. */
  id: string;
  /** Its colour, as a CSS colour. */
  colour: string;
  /** Its line width in picture pixels; a text's size is its own. */
  width: number;
}

/** A markup mark: text, an arrow, a box or a freehand line, each with its own geometry. */
export type Mark =
  | (MarkBase & { kind: 'text'; data: { at: Point; text: string; size: number } })
  | (MarkBase & { kind: 'arrow'; data: { from: Point; to: Point } })
  | (MarkBase & { kind: 'box'; data: Rect })
  | (MarkBase & { kind: 'pen'; data: { points: Point[] } });

/** A redacted region: what should not be seen, pixelated or blurred, each with its own strength. */
export interface Region {
  /** Stable across edits, as a mark's is. */
  id: string;
  /** How it is hidden. */
  style: 'pixelate' | 'blur';
  /** 1 to 10; the default is strong, because a light blur can be undone by software. */
  strength: number;
  /** Where, in oriented space. */
  rect: Rect;
}

/** The document. */
export interface EditorState {
  /** The decoded picture's size, upright (the browser has applied its EXIF orientation). */
  source: Size;
  /** The quarter turns applied, clockwise. */
  rotation: Rotation;
  /** Flipped left to right, in the turned picture. */
  flipH: boolean;
  /** Flipped top to bottom, in the turned picture. */
  flipV: boolean;
  /** The crop in oriented space, or null for the whole picture. */
  crop: Rect | null;
  /** The size to save at, or null for the cropped size. */
  size: Size | null;
  /** The adjustments. */
  adjust: Adjust;
  /** The marks, in oriented space. */
  marks: Mark[];
  /** The redacted regions, in oriented space. */
  regions: Region[];
}

/** Every adjustment at zero: the picture as it was. */
export const NEUTRAL_ADJUST: Adjust = Object.freeze({ exposure: 0, brightness: 0, contrast: 0, saturation: 0 });

/**
 * A just-opened picture, with nothing changed.
 * @param source The decoded picture's size.
 * @returns The state.
 */
export function initialState(source: Size): EditorState {
  return {
    source: { ...source },
    rotation: 0,
    flipH: false,
    flipV: false,
    crop: null,
    size: null,
    adjust: { ...NEUTRAL_ADJUST },
    marks: [],
    regions: [],
  };
}

/**
 * The picture's size once turned: a quarter turn swaps the sides.
 * @param source The upright size.
 * @param rotation The turn.
 * @returns The turned size.
 */
export function orientedSize(source: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270 ? { w: source.h, h: source.w } : { w: source.w, h: source.h };
}

/**
 * The size the picture is saved at: the resize when one is set, else the crop, else the turned
 * picture.
 * @param state The document.
 * @returns The size, in pixels.
 */
export function outputSize(state: EditorState): Size {
  if (state.size) return { ...state.size };
  if (state.crop) return { w: state.crop.w, h: state.crop.h };
  return orientedSize(state.source, state.rotation);
}
