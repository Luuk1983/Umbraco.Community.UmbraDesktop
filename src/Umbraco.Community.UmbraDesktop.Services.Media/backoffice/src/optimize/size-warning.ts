import type { NormalisedOptions } from './options.js';
import type { RasterFormat } from './picture.js';

/** A run's settings that will, or may, make files larger, and how many of the images it is about. */
export interface SizeWarning {
  /**
   * Why: `png`, photos converted to PNG, which keeps every pixel (measured 13 to 16 times larger);
   * `quality`, JPEG or WebP at 95 or more, which keeps almost everything and can beat a camera's own
   * compression; `jpeg-from-webp`, WebP converted to JPEG, which needs more bytes for the same picture.
   */
  kind: 'png' | 'quality' | 'jpeg-from-webp';
  /** How many of the images it is about. */
  count: number;
}

/** The quality from which JPEG and WebP can come out larger than they went in. */
const HIGH_QUALITY = 95;

/** The lossy formats: what a photo usually is, and what PNG blows up. */
const LOSSY = new Set<RasterFormat>(['jpeg', 'webp']);

/**
 * Whether the settings will make files larger, for the warning before a run (design §16, R5C). The
 * file's formats are known before anything is opened, so this needs no picture. One warning at a
 * time, the surest first: PNG from a photo always grows; a very high quality can; JPEG from WebP may.
 * A resize does not lift any of them, since an image already inside the box is not resized.
 * @param options What the run will do.
 * @param formats The format of each image the run optimizes.
 * @returns The warning, or null when the files can only shrink.
 */
export function sizeWarning(options: NormalisedOptions, formats: readonly RasterFormat[]): SizeWarning | null {
  const count = (which: (format: RasterFormat) => boolean) => formats.filter(which).length;
  if (options.format === 'png') {
    const photos = count((format) => LOSSY.has(format));
    return photos ? { kind: 'png', count: photos } : null;
  }
  if ((options.format === 'jpeg' || options.format === 'webp') && options.quality >= HIGH_QUALITY) {
    const lossy = count((format) => LOSSY.has(format));
    if (lossy) return { kind: 'quality', count: lossy };
  }
  if (options.format === 'jpeg') {
    const webp = count((format) => format === 'webp');
    if (webp) return { kind: 'jpeg-from-webp', count: webp };
  }
  return null;
}
