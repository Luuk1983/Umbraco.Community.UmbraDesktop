/** The box an image is fitted into: a limit per side, either of which may be absent. */
export interface ResizeBox {
  /** The widest the image may be, in pixels; absent for no limit. */
  maxWidth?: number;
  /** The tallest the image may be, in pixels; absent for no limit. */
  maxHeight?: number;
}

/**
 * The size an image is resized to so it fits inside a box, never made larger (design §6.2).
 *
 * The scale is the smallest of one and each limit over its side, so the side that hits its limit
 * first decides and the picture keeps its shape. Read on the upright size: a phone photo stored on
 * its side is fitted as people see it. Rounded to whole pixels and never below one, since a canvas
 * cannot be a fraction of a pixel and a zero-pixel picture cannot be encoded.
 * @param width The image's upright width.
 * @param height The image's upright height.
 * @param box The box, or null for no resize.
 * @returns The new size, and whether it differs from the old one.
 */
export function fitInside(width: number, height: number, box: ResizeBox | null): { width: number; height: number; scaled: boolean } {
  const scale = box ? Math.min(1, (box.maxWidth ?? Infinity) / width, (box.maxHeight ?? Infinity) / height) : 1;
  if (scale >= 1) return { width, height, scaled: false };
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scaled: true };
}
