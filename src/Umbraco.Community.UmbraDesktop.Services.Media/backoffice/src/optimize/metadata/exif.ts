/*
 * The one EXIF tag a stripped image keeps: its orientation (design §6.3). A phone stores a portrait
 * photo on its side and says so in EXIF; drop that tag with the rest and the photo turns sideways,
 * which is one of the design's anti-goals. Everything else in EXIF (GPS, camera, date) goes.
 *
 * EXIF is a TIFF block: a byte-order mark (`II` Intel, `MM` Motorola), 42, the offset of the first
 * directory (IFD0), and directories of 12-byte entries. Orientation is IFD0's tag 0x0112.
 */

/**
 * A file's bytes, over an ordinary `ArrayBuffer`, so what the walkers return can become a `Blob`
 * (TypeScript 5.9 keeps a shared buffer apart, and a `Blob` refuses one).
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/** IFD0's orientation tag. */
const ORIENTATION_TAG = 0x0112;

/** The TIFF type of a 16-bit unsigned value. */
const SHORT = 3;

/**
 * Where a TIFF block's first directory is, and how to read its numbers.
 * @param tiff The block.
 * @returns Its byte order and IFD0's entry count and offset, or undefined when it is not a TIFF block.
 */
function ifd0Of(tiff: Uint8Array): { view: DataView; little: boolean; at: number; count: number } | undefined {
  if (tiff.length < 8) return undefined;
  const order = String.fromCharCode(tiff[0], tiff[1]);
  if (order !== 'II' && order !== 'MM') return undefined;
  const little = order === 'II';
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (view.getUint16(2, little) !== 42) return undefined;
  const at = view.getUint32(4, little);
  if (at + 2 > tiff.length) return undefined;
  const count = view.getUint16(at, little);
  if (at + 2 + count * 12 + 4 > tiff.length) return undefined;
  return { view, little, at, count };
}

/**
 * The orientation an EXIF block says the picture is stored in.
 * @param tiff The TIFF block, without the `Exif\0\0` before it in a JPEG.
 * @returns 1 to 8 as EXIF numbers them; 1 (stored upright) when absent or unreadable.
 */
export function readOrientation(tiff: Uint8Array): number {
  const ifd = ifd0Of(tiff);
  if (!ifd) return 1;
  for (let index = 0; index < ifd.count; index++) {
    const entry = ifd.at + 2 + index * 12;
    if (ifd.view.getUint16(entry, ifd.little) !== ORIENTATION_TAG) continue;
    const value = ifd.view.getUint16(entry + 8, ifd.little);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

/**
 * Whether an EXIF block holds nothing but the orientation: the block a strip writes back, so a file
 * already stripped has nothing worth removing (design §6.1, "Nothing to do").
 * @param tiff The TIFF block.
 * @returns True when IFD0 has the orientation alone and points to no further directory.
 */
export function isOrientationOnly(tiff: Uint8Array): boolean {
  const ifd = ifd0Of(tiff);
  if (!ifd || ifd.count !== 1) return false;
  const entry = ifd.at + 2;
  return ifd.view.getUint16(entry, ifd.little) === ORIENTATION_TAG && ifd.view.getUint32(entry + 12, ifd.little) === 0;
}

/**
 * The smallest EXIF block that keeps a photo upright: Intel byte order, IFD0 with the orientation
 * tag alone, no further directory. 26 bytes.
 * @param orientation The orientation to keep, 2 to 8.
 * @returns The TIFF block.
 */
export function orientationTiff(orientation: number): Bytes {
  const out = new Uint8Array(26);
  const view = new DataView(out.buffer);
  out[0] = 0x49;
  out[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, ORIENTATION_TAG, true);
  view.setUint16(12, SHORT, true);
  view.setUint32(14, 1, true);
  view.setUint16(18, orientation, true);
  view.setUint32(22, 0, true);
  return out;
}
