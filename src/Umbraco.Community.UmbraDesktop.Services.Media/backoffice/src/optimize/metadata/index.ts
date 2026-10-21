import type { RasterFormat } from '../picture.js';
import type { Bytes } from './exif.js';
import { stripJpeg } from './jpeg.js';
import type { StripResult } from './jpeg.js';
import { stripPng } from './png.js';
import { stripWebp } from './webp.js';

export type { StripResult };

/**
 * Remove an image's metadata without encoding it again (design §6.3, D8), with the walker for its
 * format. GIF and BMP carry nothing worth removing and come back as they are.
 * @param bytes The file.
 * @param format Its format.
 * @returns The file without its metadata, and whether anything was removed.
 */
export function stripMetadata(bytes: Bytes, format: RasterFormat): StripResult {
  switch (format) {
    case 'jpeg':
      return stripJpeg(bytes);
    case 'png':
      return stripPng(bytes);
    case 'webp':
      return stripWebp(bytes);
    default:
      return { bytes, removed: false };
  }
}
