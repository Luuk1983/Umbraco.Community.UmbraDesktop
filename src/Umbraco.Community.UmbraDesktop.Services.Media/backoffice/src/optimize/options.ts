import type { ResizeBox } from './resize.js';
import type { OptimizeOptions } from './types.js';

/** The format a run writes. `keep` is the file's own, or PNG where a canvas cannot write it back. */
export type OptimizeFormat = NonNullable<OptimizeOptions['format']>;

/**
 * A caller's options with every field decided: what the run and `optimizeFile` work from, so neither
 * has to know which fields a caller may leave out.
 */
export interface NormalisedOptions {
  /** The box to fit in, or null for no resize. */
  resize: ResizeBox | null;
  /** The format to write. */
  format: OptimizeFormat;
  /** 1 to 100, whole. */
  quality: number;
  /** Whether metadata goes. True whenever the picture is encoded anew (D8). */
  removeMetadata: boolean;
  /** What to do with an animated image. */
  animated: 'skip' | 'first-frame';
  /**
   * Whether a quality was asked for, so a JPEG or WebP is encoded again at it even in its own format,
   * and kept only if smaller. Without it, a Keep at quality 15 left every JPEG as it was (found by the
   * owner, 2026-10-25).
   */
  recompress: boolean;
}

/** The quality a caller gets for JPEG and WebP without asking: small files that still look right. */
const DEFAULT_QUALITY = 80;

/**
 * What a run starts on before the person has chosen anything (D11): resize to 2560 × 2560, WebP at
 * 80, metadata removed. A photo from a camera shrinks by about twenty times, and 2560 is still sharp
 * on a wide screen at twice the pixel density. Saving over the originals is the store's default.
 */
export const OPTIMIZE_DEFAULTS = {
  resize: { maxWidth: 2560, maxHeight: 2560 },
  format: 'webp',
  quality: DEFAULT_QUALITY,
  removeMetadata: true,
  animated: 'skip',
  recompress: true,
} as const satisfies NormalisedOptions;

/** The formats a caller may ask for. */
const FORMATS: readonly OptimizeFormat[] = ['keep', 'jpeg', 'png', 'webp'];

/**
 * A limit that means something: a positive number of whole pixels, or nothing.
 * @param value What the caller gave.
 * @returns The limit, or undefined.
 */
function limitOf(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded >= 1 ? rounded : undefined;
}

/**
 * Decide every option. Read defensively, since a caller's copy of the types may lag behind and its
 * values come from wherever it got them: anything unusable is the field's default.
 * @param options What the caller asked for.
 * @returns The options to work from.
 */
export function normaliseOptions(options?: OptimizeOptions): NormalisedOptions {
  const maxWidth = limitOf(options?.resize?.maxWidth);
  const maxHeight = limitOf(options?.resize?.maxHeight);
  const resize = maxWidth || maxHeight ? { ...(maxWidth ? { maxWidth } : {}), ...(maxHeight ? { maxHeight } : {}) } : null;
  const format = FORMATS.includes(options?.format as OptimizeFormat) ? (options!.format as OptimizeFormat) : 'keep';
  const asked = options?.quality;
  const quality = typeof asked === 'number' && Number.isFinite(asked) ? Math.min(100, Math.max(1, Math.round(asked))) : DEFAULT_QUALITY;
  const normalised: NormalisedOptions = {
    resize,
    format,
    quality,
    removeMetadata: options?.removeMetadata === true,
    animated: options?.animated === 'first-frame' ? 'first-frame' : 'skip',
    recompress: typeof asked === 'number' && Number.isFinite(asked),
  };
  if (reencodes(normalised)) normalised.removeMetadata = true;
  return normalised;
}

/**
 * Whether the options encode the picture anew: a resize, a format other than the file's own, or a
 * quality. Encoding through a canvas drops metadata anyway, which is why Remove metadata is locked on.
 * @param options The options.
 * @returns True when a resize, a convert or a quality is asked for.
 */
export function reencodes(options: Pick<NormalisedOptions, 'resize' | 'format'> & Partial<Pick<NormalisedOptions, 'recompress'>>): boolean {
  return options.resize !== null || options.format !== 'keep' || options.recompress === true;
}
