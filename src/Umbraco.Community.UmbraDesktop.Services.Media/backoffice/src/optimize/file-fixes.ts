import { DEFAULT_SETTINGS } from './remembered.js';
import type { OptimizeSettings } from './remembered.js';
import { normaliseOptions } from './options.js';
import type { NormalisedOptions, OptimizeFormat } from './options.js';
import type { RasterFormat } from './picture.js';
import type { OptimizeFilesRequest, OptimizeFix, OptimizeImageKind } from './types.js';

/**
 * What each file of a run on files gets (#179, design §5): only the fixes for what the caller found
 * it breaks, done the way the run's settings say, so a person who changes a setting for the batch
 * changes it for every file it applies to and no other.
 */

/** The kinds, in the order the window lists their rows. */
export const IMAGE_KINDS: readonly OptimizeImageKind[] = ['jpeg', 'png-photo', 'png-transparent', 'webp', 'gif'];

/** Every fix, for a file the caller said nothing about. */
const EVERY_FIX: readonly OptimizeFix[] = ['size', 'format', 'location'];

/** The formats a row may name. */
const FORMATS: readonly OptimizeFormat[] = ['keep', 'jpeg', 'png', 'webp'];

/**
 * A file's kind from its format, when the caller gave none: a PNG counts as a photo, as the Media
 * add-on's check counts one with no transparent pixel.
 * @param format The file's format.
 * @returns The kind, or undefined for a format no row is for.
 */
export function kindOfFormat(format: RasterFormat | undefined): OptimizeImageKind | undefined {
  switch (format) {
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return 'png-photo';
    case 'webp':
      return 'webp';
    case 'gif':
      return 'gif';
    default:
      return undefined;
  }
}

/**
 * The settings a run on files starts on, from the caller's: a field it leaves out is off and a row it
 * leaves out is Keep, so a caller sets the whole starting state, as `optimizeMedia`'s options do.
 * Convert is on, since the rows are what it does; a row on Keep converts nothing.
 * @param settings The caller's settings.
 * @returns The settings.
 */
export function filesSettings(settings: NonNullable<OptimizeFilesRequest['settings']>): OptimizeSettings {
  const options = normaliseOptions({ resize: settings.resize ?? null, quality: settings.quality });
  const formats = Object.fromEntries(
    IMAGE_KINDS.map((kind) => {
      const asked = settings.formats?.[kind];
      return [kind, FORMATS.includes(asked as OptimizeFormat) ? asked : 'keep'];
    }),
  ) as Record<OptimizeImageKind, OptimizeFormat>;
  return {
    resize: options.resize !== null,
    maxWidth: options.resize ? (options.resize.maxWidth ?? null) : DEFAULT_SETTINGS.maxWidth,
    maxHeight: options.resize ? (options.resize.maxHeight ?? null) : DEFAULT_SETTINGS.maxHeight,
    convert: true,
    format: 'keep',
    quality: options.quality,
    removeMetadata: settings.removeLocation === true,
    save: 'replace',
    formats,
  };
}

/**
 * What one file of a run on files is asked for, or null when nothing is left for it: the fixes the
 * person switched off were the only ones it needed, so it is uploaded as it was without being read.
 *
 * It is resized when it was found too large and Resize is on. It is converted by its row when it broke
 * Formats, and also when it is encoded anew anyway, since a row not on Keep is the format a file the
 * optimizer saves is saved in. A file over the upload limit is encoded anew at the quality, which is
 * what brings a camera's file under it. Its location goes when it records one and Remove is on; a file
 * encoded anew loses it anyway. A quality is only passed with an encode, so a file that only needs
 * its location removed is never saved again.
 * @param item The file: its format, its kind and what it breaks.
 * @param item.format Its format.
 * @param item.kind Its row; from its format when absent.
 * @param item.fix What it breaks; everything when absent.
 * @param settings The run's settings.
 * @returns The options, or null.
 */
export function optionsForFile(item: { format?: RasterFormat; kind?: OptimizeImageKind; fix?: readonly OptimizeFix[] }, settings: OptimizeSettings): NormalisedOptions | null {
  const fixes = new Set(item.fix ?? EVERY_FIX);
  const kind = item.kind ?? kindOfFormat(item.format);
  const resize =
    settings.resize && fixes.has('size') && (settings.maxWidth || settings.maxHeight)
      ? { ...(settings.maxWidth ? { maxWidth: settings.maxWidth } : {}), ...(settings.maxHeight ? { maxHeight: settings.maxHeight } : {}) }
      : null;
  const target: OptimizeFormat = !settings.convert ? 'keep' : settings.formats && kind ? settings.formats[kind] : settings.format;
  const shrinks = fixes.has('upload-limit');
  const format: OptimizeFormat = target !== 'keep' && (fixes.has('format') || resize !== null || shrinks) ? target : 'keep';
  const removeMetadata = settings.removeMetadata && fixes.has('location');
  const encodes = resize !== null || format !== 'keep' || shrinks;
  if (!encodes && !removeMetadata) return null;
  return normaliseOptions({ resize, format, ...(encodes ? { quality: settings.quality } : {}), removeMetadata });
}
