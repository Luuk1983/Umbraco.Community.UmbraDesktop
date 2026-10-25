import { isOrientationOnly, orientationTiff, readOrientation } from './exif.js';
import type { Bytes } from './exif.js';
import type { StripResult } from './jpeg.js';

/** The `VP8X` flag that says an `EXIF` chunk follows. */
const EXIF_FLAG = 0x08;

/** The `VP8X` flag that says an `XMP ` chunk follows. */
const XMP_FLAG = 0x04;

/** Where the `VP8X` flags byte is: after the RIFF header (12), the chunk's type and size (8). */
const FLAGS_AT = 20;

/** What some writers put before the TIFF block in a WebP's `EXIF` chunk, as in a JPEG. */
const EXIF_HEADER = 'Exif\0\0';

/**
 * Four bytes as ASCII.
 * @param bytes The file.
 * @param at Where they start.
 * @returns The text.
 */
function ascii(bytes: Bytes, at: number, length = 4): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

/**
 * A RIFF chunk, padded to an even length as RIFF requires; the pad is not counted in its size.
 * @param type The four letters.
 * @param data What it carries.
 * @returns The chunk.
 */
function riffChunk(type: string, data: Uint8Array): Bytes {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

/**
 * Remove a WebP's metadata without touching its picture (design §6.3): the `EXIF` and `XMP ` chunks
 * go, their flags in the `VP8X` header are cleared, and the RIFF size is written again; the colour
 * profile (`ICCP`) and the picture's chunks stay. An `EXIF` with an orientation other than 1 is
 * replaced, in place, by one holding that tag alone, and its flag stays set. A simple WebP (a bare
 * `VP8 ` or `VP8L` chunk, as a canvas writes) cannot hold metadata and comes back as it is, as does
 * a file with nothing worth removing, or one that is not a WebP or ends early.
 * @param bytes The file.
 * @returns The file without its metadata, and whether anything was removed.
 */
export function stripWebp(bytes: Bytes): StripResult {
  const untouched = { bytes, removed: false };
  if (bytes.length < 30 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WEBP' || ascii(bytes, 12) !== 'VP8X') return untouched;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Bytes[] = [];
  let removed = false;
  let flags = bytes[FLAGS_AT];
  let position = 12;
  while (position + 8 <= bytes.length) {
    const type = ascii(bytes, position);
    const length = view.getUint32(position + 4, true);
    const end = position + 8 + length + (length % 2);
    if (position + 8 + length > bytes.length) return untouched;
    const data = bytes.subarray(position + 8, position + 8 + length);
    if (type === 'EXIF') {
      const tiff = ascii(data, 0, 6) === EXIF_HEADER ? data.subarray(6) : data;
      if (!isOrientationOnly(tiff)) removed = true;
      const orientation = readOrientation(tiff);
      if (orientation !== 1) kept.push(riffChunk('EXIF', orientationTiff(orientation)));
      else flags &= ~EXIF_FLAG;
    } else if (type === 'XMP ') {
      removed = true;
      flags &= ~XMP_FLAG;
    } else {
      kept.push(bytes.subarray(position, Math.min(end, bytes.length)));
    }
    position = end;
  }
  if (!removed) return untouched;
  const size = 4 + kept.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(8 + size);
  out.set(bytes.subarray(0, 4));
  new DataView(out.buffer).setUint32(4, size, true);
  out.set(bytes.subarray(8, 12), 8);
  let at = 12;
  for (const part of kept) {
    out.set(part, at);
    at += part.length;
  }
  out[FLAGS_AT] = flags;
  return { bytes: out, removed: true };
}
