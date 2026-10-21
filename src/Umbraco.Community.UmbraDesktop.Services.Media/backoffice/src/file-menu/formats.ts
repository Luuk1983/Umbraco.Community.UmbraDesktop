import type { SaveFormat } from './types.js';

/*
 * What each save format means for the file: its MIME type, its extension, and the name a save over an
 * item writes it under. Design §6: Keep is the item's own format when a canvas can write it,
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
 * The hash a save over an item puts at the end of the file's name: `-ud` and eight hex digits. The
 * `ud` marks it as ours, so only an earlier save's hash is replaced: a bare `-` and eight digits also
 * ends a name with a date in it (`scan-20241020`), which lost its date before the marker (found by the
 * reviewer of #137).
 */
const HASH_SUFFIX = /-ud[0-9a-f]{8}$/;

/**
 * A short hash of a file's contents: 32-bit FNV-1a, as eight hex digits.
 *
 * A cache buster, not a fingerprint (#137): it only has to differ between one image's successive
 * versions, which 32 bits do but for a chance of one in four billion. FNV rather than the browser's
 * SHA-256 because `crypto.subtle` exists only on https and localhost, and a backoffice served over
 * plain http must still save. A few milliseconds for a photo of several megabytes.
 * @param bytes The file's contents.
 * @returns The hash.
 */
export function contentHash(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * The name a save over an item writes its file under: the name it had, with the hash of the new
 * contents in place of the hash an earlier save put there (#137).
 *
 * Why a new name at all: Umbraco keeps a media item's file in one folder for good (the folder comes
 * from the item and property keys), so the file's name is all that can give it a new address, and
 * without a new address every browser cache, thumbnails included, goes on showing the old picture.
 * Core does the same when a person uploads a replacement: the file takes the uploaded file's name.
 * The same contents get the same name, so a save that changes nothing keeps the address.
 * @param base The file's name now, without its extension.
 * @param hash The new contents' {@link contentHash}.
 * @param extension The extension to write, without the dot.
 * @returns The file name.
 */
export function versionedFileName(base: string, hash: string, extension: string): string {
  return `${unversionedBase(base)}-ud${hash}.${extension}`;
}

/**
 * A file's name without the hash an earlier save over its item put there, for naming a copy after
 * the original (Optimize images, #139): `banjo-ud0badf00d` is `banjo`.
 * @param base The file's name now, without its extension.
 * @returns The name before the hash; the same name when it has none.
 */
export function unversionedBase(base: string): string {
  return base.replace(HASH_SUFFIX, '');
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
