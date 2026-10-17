import type { SaveFormat } from './types.js';

/*
 * What each save format means for the file: its MIME type, its extension, whether choosing it moves
 * the file to a new address. Design §6: Keep is the item's own format when a canvas can write it,
 * GIF and BMP cannot be kept, AVIF is never offered because not every browser's canvas encodes it.
 */

/** The quality JPEG and WebP are saved at unless the person chose another: high, and a third the size of 100. */
export const DEFAULT_QUALITY = 90;

/** The formats offered, in the order Save as lists them after Keep. */
export const SAVE_FORMATS: readonly SaveFormat[] = ['jpeg', 'png', 'webp'];

/**
 * The format Keep means for a file, or null when a canvas cannot write that format back.
 * @param extension The file's extension, without the dot, in any case.
 * @returns The format, or null for GIF, BMP and anything else.
 */
export function keepFormatFor(extension: string): SaveFormat | null {
  switch (extension.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    default:
      return null;
  }
}

/**
 * The MIME type a canvas encodes a format with.
 * @param format The format.
 * @returns Its MIME type.
 */
export function mimeFor(format: SaveFormat): string {
  return `image/${format}`;
}

/**
 * The extension a saved file gets. An unchanged format keeps the file's own spelling, so a `.jpeg`
 * stays `.jpeg` rather than moving to a new address for nothing; a changed one gets the usual one.
 * @param format The format saved in.
 * @param originalExtension The file's extension now.
 * @returns The extension, lower case, without the dot.
 */
export function extensionFor(format: SaveFormat, originalExtension: string): string {
  const original = originalExtension.toLowerCase();
  if (keepFormatFor(original) === format) return original;
  return format === 'jpeg' ? 'jpg' : format;
}

/**
 * Whether saving in a format changes the file's address: its extension changes, so its path does,
 * and a link someone pasted to the old file breaks. Save as warns when it does.
 * @param extension The file's extension now.
 * @param format The format chosen.
 * @returns True when the address changes.
 */
export function addressChanges(extension: string, format: SaveFormat): boolean {
  return keepFormatFor(extension) !== format;
}

/**
 * The name Save as suggests for a copy.
 * @param name The original's name.
 * @param pattern The dictionary's pattern, with `%0%` where the name goes.
 * @returns The copy's name.
 */
export function copyNameFor(name: string, pattern: string): string {
  return pattern.replace('%0%', name);
}

/**
 * A file size the way a file manager writes it: decimal units, as macOS's Finder writes them, and
 * one decimal place only in megabytes, where "6.1 MB" says more than "6 MB" and kilobytes need none.
 * @param bytes The size.
 * @param locale The language to write the number in.
 * @returns The size, with its unit.
 */
export function formatBytes(bytes: number, locale: string): string {
  const number = (value: number, digits: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  if (bytes < 1000) return `${number(bytes, 0)} B`;
  if (bytes < 1_000_000) return `${number(bytes / 1000, 0)} KB`;
  return `${number(bytes / 1_000_000, 1)} MB`;
}

/**
 * A file format's name for people, from its extension: JPEG for both of its spellings, WebP as
 * Google writes it, and the extension in capitals for anything else.
 * @param extension The extension or format, without the dot.
 * @returns The name.
 */
export function formatLabel(extension: string): string {
  const lower = extension.toLowerCase();
  if (lower === 'jpg' || lower === 'jpeg') return 'JPEG';
  if (lower === 'webp') return 'WebP';
  return lower.toUpperCase();
}
