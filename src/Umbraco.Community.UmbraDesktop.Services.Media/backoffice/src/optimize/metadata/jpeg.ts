import { isOrientationOnly, orientationTiff, readOrientation } from './exif.js';
import type { Bytes } from './exif.js';

/** What a strip did: the file, and whether anything worth removing was removed. */
export interface StripResult {
  /** The file without its metadata; the very input when nothing was removed. */
  bytes: Bytes;
  /** True when anything was removed, apart from an EXIF block that held only the orientation. */
  removed: boolean;
}

/** The APP1 marker: EXIF, and XMP after it. */
const APP1 = 0xe1;

/** The markers whose segments carry metadata people would not want shared (design §6.3). */
const REMOVED = new Set([APP1, 0xed /* APP13, IPTC */, 0xfe /* COM, comments */]);

/** The APP0 marker: JFIF, which stays first. */
const APP0 = 0xe0;

/** What an APP1 EXIF segment's payload starts with. */
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0];

/**
 * Remove a JPEG's metadata without touching its picture (design §6.3, D8): EXIF and XMP (APP1), IPTC
 * (APP13) and comments (COM) go; JFIF (APP0), the colour profile (APP2), Adobe's segment (APP14) and
 * everything else stays, in order, and from the scan on the file is copied byte for byte, so the
 * quality is exactly what it was.
 *
 * A photo whose EXIF orientation is not 1 gets a minimal EXIF segment back with that tag alone, after
 * JFIF, so it stays upright. A file with nothing worth removing (none of those segments, or only an
 * orientation-only EXIF, which is what this writes) comes back as it is, so it is reported unchanged
 * rather than saved again. So does a file that is not a JPEG or ends early: a strip is never the place
 * to report a broken file.
 * @param bytes The file.
 * @returns The file without its metadata, and whether anything was removed.
 */
export function stripJpeg(bytes: Bytes): StripResult {
  const untouched = { bytes, removed: false };
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return untouched;

  const kept: Bytes[] = [];
  let orientation = 1;
  let removed = false;
  let position = 2;
  let rest = -1;
  while (position + 2 <= bytes.length) {
    if (bytes[position] !== 0xff) return untouched;
    const marker = bytes[position + 1];
    if (marker === 0xff) {
      // A fill byte before a marker.
      position += 1;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      // The scan, or the end: everything from here is the picture, copied as it is.
      rest = position;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(position, position + 2));
      position += 2;
      continue;
    }
    if (position + 4 > bytes.length) return untouched;
    const end = position + 2 + ((bytes[position + 2] << 8) | bytes[position + 3]);
    if (end > bytes.length) return untouched;
    const whole = bytes.subarray(position, end);
    if (REMOVED.has(marker)) {
      const payload = bytes.subarray(position + 4, end);
      const exif = marker === APP1 && EXIF_HEADER.every((byte, index) => payload[index] === byte);
      if (exif) {
        const tiff = payload.subarray(EXIF_HEADER.length);
        if (orientation === 1) orientation = readOrientation(tiff);
        if (!isOrientationOnly(tiff)) removed = true;
      } else {
        removed = true;
      }
    } else {
      kept.push(whole);
    }
    position = end;
  }
  if (rest < 0 || !removed) return untouched;

  if (orientation !== 1) {
    const tiff = orientationTiff(orientation);
    const length = 2 + EXIF_HEADER.length + tiff.length;
    const exif = new Uint8Array(2 + length);
    exif.set([0xff, APP1, length >> 8, length & 0xff]);
    exif.set(EXIF_HEADER, 4);
    exif.set(tiff, 4 + EXIF_HEADER.length);
    const afterJfif = kept[0]?.[1] === APP0 ? 1 : 0;
    kept.splice(afterJfif, 0, exif);
  }
  const tail = bytes.subarray(rest);
  const out = new Uint8Array(2 + kept.reduce((sum, part) => sum + part.length, 0) + tail.length);
  out.set([0xff, 0xd8]);
  let at = 2;
  for (const part of kept) {
    out.set(part, at);
    at += part.length;
  }
  out.set(tail, at);
  return { bytes: out, removed: true };
}
