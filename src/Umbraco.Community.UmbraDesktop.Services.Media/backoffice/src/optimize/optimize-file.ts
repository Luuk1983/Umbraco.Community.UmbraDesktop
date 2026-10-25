import { extensionFor, keepFormatFor, mimeFor } from '../file-menu/formats.js';
import type { SaveFormat } from '../file-menu/types.js';
import { extensionOf } from '../files/extension.js';
import { stripMetadata } from './metadata/index.js';
import { normaliseOptions } from './options.js';
import type { NormalisedOptions } from './options.js';
import { decodePicture, formatOfExtension, isAnimated, renderPicture } from './picture.js';
import { fitInside } from './resize.js';
import type { ImageFacts, OptimizeFileResult, OptimizeOptions, UnchangedReason } from './types.js';

/**
 * What is done to one image, decided before anything is done. The list-of-steps seam the design
 * keeps for steps other add-ons may add later (§2, §6.2): today it is one of three.
 */
export type OptimizePlan =
  /**
   * Draw it at a size and encode it in a format, which drops its metadata. `onlyIfSmaller` when only
   * the quality changes, so a file that would come out no smaller is kept as it was.
   */
  | { kind: 'encode'; size: { width: number; height: number }; format: SaveFormat; onlyIfSmaller?: true }
  /** Remove its metadata from the bytes, leaving the picture as it is (D8). */
  | { kind: 'strip' }
  /** Nothing would change (D9). */
  | { kind: 'unchanged'; reason: UnchangedReason };

/**
 * Decide what to do to an image (design §6.1, "Nothing to do", and §6.2).
 *
 * It is encoded when it is larger than the box or another format is asked for; Keep is the file's own
 * format, and PNG for a GIF or BMP, which a canvas cannot write (image editor design §6). Otherwise its
 * metadata is stripped when that is asked for and there is some. Otherwise nothing is done, and the
 * reason says which: every option was off, only metadata was asked for and it has none, or it already
 * fits.
 * @param facts What the image is.
 * @param extension Its file's extension.
 * @param options What was asked.
 * @param hasMetadata Whether it carries metadata worth removing.
 * @returns The plan.
 */
export function planFor(facts: ImageFacts, extension: string, options: NormalisedOptions, hasMetadata: boolean): OptimizePlan {
  const own = keepFormatFor(extension);
  const format: SaveFormat = options.format === 'keep' ? (own ?? 'png') : options.format;
  const size = fitInside(facts.width, facts.height, options.resize);
  const converts = options.format !== 'keep' && options.format !== own;
  if (size.scaled || converts) return { kind: 'encode', size: { width: size.width, height: size.height }, format };
  // A quality asked for a JPEG or WebP in its own format: encode it again, and keep it only if smaller.
  if (options.recompress && own !== null && own !== 'png' && format === own) {
    return { kind: 'encode', size: { width: size.width, height: size.height }, format, onlyIfSmaller: true };
  }
  if (options.removeMetadata && hasMetadata) return { kind: 'strip' };
  if (options.resize === null && options.format === 'keep' && !options.recompress) return { kind: 'unchanged', reason: options.removeMetadata ? 'no-metadata' : 'nothing-asked' };
  return { kind: 'unchanged', reason: 'fits' };
}

/**
 * A file's extension from its name, or from its MIME type when the name has none.
 * @param file The file.
 * @returns The extension, lower case, without the dot.
 */
function extensionOfFile(file: File): string {
  return extensionOf(file.name) || (file.type.startsWith('image/') ? file.type.slice(6).replace('svg+xml', 'svg') : '');
}

/**
 * A file's name without its extension.
 * @param name The file's name.
 * @returns The name before its last dot.
 */
function baseOf(name: string): string {
  return name.replace(/\.[^.]*$/, '') || name;
}

/**
 * Optimize one image file: resize it, convert it, or strip its metadata, as asked (design §8.1). No
 * window, nothing saved, nothing on screen; the run in a window is built on exactly this.
 *
 * A file it cannot or should not write (not a raster image, a vector image, an animated one unless
 * its first frame is all that is wanted) is skipped, untouched. An image with nothing to do comes back
 * unchanged, with its facts. A file the browser cannot decode or encode fails with the browser's
 * words. One picture's pixels are held at a time, and released before this answers.
 * @param file The file, whose name or type says its format.
 * @param options What to do.
 * @returns How it went, with the new file when there is one.
 */
export async function optimizeFile(file: File, options?: OptimizeOptions): Promise<OptimizeFileResult> {
  const settings = normaliseOptions(options);
  const extension = extensionOfFile(file);
  const format = formatOfExtension(extension);
  if (format === null) return { status: 'skipped', reason: 'not-an-image' };
  if (format === 'svg') return { status: 'skipped', reason: 'vector' };
  try {
    const original = new Uint8Array(await file.arrayBuffer());
    if (settings.animated === 'skip' && isAnimated(original, format)) return { status: 'skipped', reason: 'animated' };

    const upright = await decodePicture(file);
    const before: ImageFacts = { width: upright.width, height: upright.height, size: file.size, format };
    upright.close();

    const stripped = settings.removeMetadata ? stripMetadata(original, format) : { bytes: original, removed: false };
    const plan = planFor(before, extension, settings, stripped.removed);
    if (plan.kind === 'unchanged') return { status: 'unchanged', reason: plan.reason, before };
    if (plan.kind === 'strip') {
      const out = new File([stripped.bytes], file.name, { type: file.type || mimeFor(keepFormatFor(extension) ?? 'png') });
      return { status: 'optimized', file: out, before, after: { ...before, size: out.size } };
    }

    // Off the page where the browser allows, so a run does not make the desktop hitch (§15).
    const blob = await renderPicture(file, plan.size, plan.format, settings.quality);
    if (plan.onlyIfSmaller && blob.size >= file.size) {
      // No smaller at that quality: keep the picture as it was, without its metadata if that was asked.
      if (stripped.removed) {
        const out = new File([stripped.bytes], file.name, { type: file.type || mimeFor(plan.format) });
        return { status: 'optimized', file: out, before, after: { ...before, size: out.size } };
      }
      return { status: 'unchanged', reason: 'not-smaller', before };
    }
    const out = new File([blob], `${baseOf(file.name)}.${extensionFor(plan.format, extension)}`, { type: mimeFor(plan.format) });
    return { status: 'optimized', file: out, before, after: { ...plan.size, size: out.size, format: plan.format } };
  } catch (error) {
    return { status: 'failed', message: (error as Error)?.message || String(error) };
  }
}
