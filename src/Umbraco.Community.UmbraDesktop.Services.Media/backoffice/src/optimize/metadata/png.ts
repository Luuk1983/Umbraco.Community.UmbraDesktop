import { isOrientationOnly, orientationTiff, readOrientation } from './exif.js';
import type { Bytes } from './exif.js';
import type { StripResult } from './jpeg.js';

/** The chunks that carry metadata people would not want shared (design §6.3). */
const REMOVED = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/** A PNG's eight-byte signature. */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** CRC-32's table, built the first time a checksum is needed. */
let table: Uint32Array | undefined;

/**
 * CRC-32, as PNG puts after every chunk's type and data: a rewritten `eXIf` chunk needs a right one,
 * or a strict decoder drops it and the photo turns sideways.
 * @param data The chunk's type and data.
 * @returns The checksum.
 */
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A PNG chunk with its length and checksum.
 * @param type The four letters.
 * @param data What it carries.
 * @returns The chunk.
 */
function pngChunk(type: string, data: Uint8Array): Bytes {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Remove a PNG's metadata without touching its picture (design §6.3): EXIF (`eXIf`), text (`tEXt`,
 * `zTXt`, `iTXt`, which also carry XMP) and the time it was saved (`tIME`) go; the colour chunks
 * (`iCCP`, `sRGB`, `gAMA`, `cHRM`), the physical size (`pHYs`) and every critical chunk stay, in
 * order and as they were. An `eXIf` with an orientation other than 1 is replaced, in place, by one
 * holding that tag alone. A file with nothing worth removing, or that is not a PNG or ends early,
 * comes back as it is.
 * @param bytes The file.
 * @returns The file without its metadata, and whether anything was removed.
 */
export function stripPng(bytes: Bytes): StripResult {
  const untouched = { bytes, removed: false };
  if (bytes.length < 8 || SIGNATURE.some((byte, index) => bytes[index] !== byte)) return untouched;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Bytes[] = [bytes.subarray(0, 8)];
  let removed = false;
  let position = 8;
  let ended = false;
  while (position + 12 <= bytes.length) {
    const length = view.getUint32(position);
    const end = position + 12 + length;
    if (end > bytes.length) return untouched;
    const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
    if (REMOVED.has(type)) {
      if (type === 'eXIf') {
        const tiff = bytes.subarray(position + 8, position + 8 + length);
        if (!isOrientationOnly(tiff)) removed = true;
        const orientation = readOrientation(tiff);
        if (orientation !== 1) kept.push(pngChunk('eXIf', orientationTiff(orientation)));
      } else {
        removed = true;
      }
    } else {
      kept.push(bytes.subarray(position, end));
    }
    position = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended || !removed) return untouched;
  const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0) + (bytes.length - position));
  let at = 0;
  for (const part of kept) {
    out.set(part, at);
    at += part.length;
  }
  out.set(bytes.subarray(position), at);
  return { bytes: out, removed: true };
}
