import { isAnimatedGif } from '../image-editor/formats.js';

/**
 * What the media guidelines check reads from a dropped file before it is uploaded (#179): its
 * format, its size and whether it records where it was taken, all from the file's header and never by
 * decoding the picture, so a drop of a hundred camera photos is checked in the time it takes to read
 * a few hundred kilobytes of each (measured in the design doc, §8). The one fact a header cannot
 * settle, whether a PNG with an alpha channel uses it, has {@link isOpaquePng}, which the check calls
 * only when the answer decides something.
 *
 * The format comes from the bytes, not the name: a PNG renamed `.jpg` is a PNG to the browser, to
 * core's upload and to the optimizer, so it is one here too. Anything unreadable is the safe answer
 * for the check: no size, no location, so a broken file is uploaded as it would have been and core's
 * upload has its say.
 */

/** The formats the check knows. `other` is everything else: a PDF, an SVG, a HEIC. */
export type UploadFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'other';

/** What a dropped file is. */
export interface UploadFacts {
  /** Its format, from its bytes. */
  format: UploadFormat;
  /** Its width as people see it, upright, in pixels; undefined when the header did not say. */
  width?: number;
  /** Its height as people see it, upright. */
  height?: number;
  /** Whether it records where it was taken: an EXIF GPS block with a position, or XMP that has one. */
  location: boolean;
  /** Whether it moves: an animated GIF, PNG or WebP, which is always left alone. */
  animated: boolean;
  /**
   * Whether its header gives it transparency to use: a PNG with an alpha channel or a `tRNS` chunk, a
   * WebP with alpha. Whether any pixel is actually transparent is {@link isOpaquePng}'s question.
   */
  alphaChannel: boolean;
}

/**
 * How much of a file is read at first: enough for every header seen on real cameras and phones, whose
 * EXIF segment is at most 64 KB with its thumbnail, with a colour profile beside it. A header that
 * runs past it is read further, chunk by chunk, never the whole picture.
 */
const HEAD_BYTES = 256 * 1024;

/** What an XMP packet calls a position. */
const XMP_LATITUDE = 'GPSLatitude';

/** IFD0's tag for the orientation. */
const ORIENTATION_TAG = 0x0112;

/** IFD0's tag pointing at the GPS directory. */
const GPS_IFD_TAG = 0x8825;

/** The GPS directory's version tag: the one tag a camera writes with no position. */
const GPS_VERSION_TAG = 0x0000;

/** A JPEG's frame markers (SOF0 to SOF15, less DHT, JPG and DAC), which carry its size. */
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/**
 * Reads a file a range at a time, holding its head once read, so a header walker can step past what
 * it does not need without reading the picture.
 */
class ByteSource {
  /** The file. */
  readonly #file: Blob;

  /** Its first {@link HEAD_BYTES}, once read. */
  #head?: Uint8Array;

  /**
   * @param file The file.
   */
  constructor(file: Blob) {
    this.#file = file;
  }

  /** The file's size. */
  get size(): number {
    return this.#file.size;
  }

  /** @returns The file's first {@link HEAD_BYTES}. */
  async head(): Promise<Uint8Array> {
    this.#head ??= new Uint8Array(await this.#file.slice(0, HEAD_BYTES).arrayBuffer());
    return this.#head;
  }

  /**
   * Some bytes, from the head when they are in it.
   * @param offset Where they start.
   * @param length How many.
   * @returns The bytes; fewer at the end of the file.
   */
  async read(offset: number, length: number): Promise<Uint8Array> {
    const head = await this.head();
    if (offset + length <= head.length) return head.subarray(offset, offset + length);
    return new Uint8Array(await this.#file.slice(offset, offset + length).arrayBuffer());
  }

  /** @returns The whole file, for a format whose answer is spread through it. */
  async all(): Promise<Uint8Array> {
    if (this.#file.size <= HEAD_BYTES) return this.head();
    return new Uint8Array(await this.#file.arrayBuffer());
  }
}

/**
 * ASCII from bytes.
 * @param bytes The bytes.
 * @param at Where to start.
 * @param length How many.
 * @returns The text.
 */
function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

/**
 * Whether bytes hold text, read as Latin-1 so any byte is a character.
 * @param bytes The bytes.
 * @param text The text.
 * @returns True when it is in them.
 */
function holds(bytes: Uint8Array, text: string): boolean {
  return new TextDecoder('latin1').decode(bytes).includes(text);
}

/**
 * The format, from the first bytes.
 * @param head The file's first bytes.
 * @returns The format.
 */
function sniff(head: Uint8Array): UploadFormat {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && head[0] === 0x89 && ascii(head, 1, 3) === 'PNG') return 'png';
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'webp';
  if (head.length >= 6 && (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a')) return 'gif';
  return 'other';
}

/** What a TIFF block (EXIF) says that the check needs. */
interface ExifFacts {
  /** 1 to 8 as EXIF numbers them; 1 when absent. */
  orientation: number;
  /** Whether its GPS directory holds anything but its version. */
  location: boolean;
}

/**
 * Read the orientation and whether there is a position from a TIFF block.
 * @param tiff The block, without the `Exif\0\0` that may precede it.
 * @returns What it says; nothing for a block that is not one.
 */
export function readExif(tiff: Uint8Array): ExifFacts {
  const none = { orientation: 1, location: false };
  if (tiff.length >= 6 && ascii(tiff, 0, 4) === 'Exif' && tiff[4] === 0 && tiff[5] === 0) tiff = tiff.subarray(6);
  if (tiff.length < 8) return none;
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return none;
  const little = order === 'II';
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (view.getUint16(2, little) !== 42) return none;
  /**
   * A directory's entries.
   * @param at Where it starts.
   * @returns Each entry's tag and the offset of its value field.
   */
  const entries = (at: number): Array<{ tag: number; value: number }> => {
    if (at + 2 > tiff.length) return [];
    const count = view.getUint16(at, little);
    const out: Array<{ tag: number; value: number }> = [];
    for (let index = 0; index < count && at + 2 + index * 12 + 12 <= tiff.length; index++) {
      const entry = at + 2 + index * 12;
      out.push({ tag: view.getUint16(entry, little), value: entry + 8 });
    }
    return out;
  };
  let orientation = 1;
  let location = false;
  for (const entry of entries(view.getUint32(4, little))) {
    if (entry.tag === ORIENTATION_TAG) {
      const value = view.getUint16(entry.value, little);
      if (value >= 1 && value <= 8) orientation = value;
    } else if (entry.tag === GPS_IFD_TAG) {
      location = entries(view.getUint32(entry.value, little)).some((gps) => gps.tag !== GPS_VERSION_TAG);
    }
  }
  return { orientation, location };
}

/**
 * A JPEG's facts: its frame header's size, turned upright by EXIF's orientation, and a position from
 * EXIF or XMP, all in the segments before the picture.
 * @param source The file.
 * @returns The facts.
 */
async function jpegFacts(source: ByteSource): Promise<UploadFacts> {
  const facts: UploadFacts = { format: 'jpeg', location: false, animated: false, alphaChannel: false };
  let orientation = 1;
  let position = 2;
  while (position + 4 <= source.size) {
    const header = await source.read(position, 4);
    if (header.length < 4 || header[0] !== 0xff) break;
    const marker = header[1];
    if (marker === 0xff) {
      position += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      position += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = (header[2] << 8) | header[3];
    if (SOF_MARKERS.has(marker)) {
      const frame = await source.read(position + 4, 5);
      facts.height = (frame[1] << 8) | frame[2];
      facts.width = (frame[3] << 8) | frame[4];
      break;
    }
    if (marker === 0xe1) {
      const payload = await source.read(position + 4, length - 2);
      if (ascii(payload, 0, 4) === 'Exif') {
        const exif = readExif(payload);
        orientation = exif.orientation;
        facts.location ||= exif.location;
      } else if (holds(payload.subarray(0, 64), 'ns.adobe.com/xap')) {
        facts.location ||= holds(payload, XMP_LATITUDE);
      }
    }
    position += 2 + length;
  }
  if (orientation >= 5 && facts.width !== undefined && facts.height !== undefined) [facts.width, facts.height] = [facts.height, facts.width];
  return facts;
}

/**
 * A PNG's facts, from the chunks before its picture: `IHDR`'s size and colour type, `tRNS`, an
 * animation's `acTL`, and a position from `eXIf` or an XMP text chunk.
 * @param source The file.
 * @returns The facts.
 */
async function pngFacts(source: ByteSource): Promise<UploadFacts> {
  const facts: UploadFacts = { format: 'png', location: false, animated: false, alphaChannel: false };
  let position = 8;
  while (position + 8 <= source.size) {
    const header = await source.read(position, 8);
    if (header.length < 8) break;
    const length = new DataView(header.buffer, header.byteOffset, 8).getUint32(0);
    const type = ascii(header, 4, 4);
    if (type === 'IDAT' || type === 'IEND') break;
    if (type === 'IHDR') {
      const data = await source.read(position + 8, 13);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      facts.width = view.getUint32(0);
      facts.height = view.getUint32(4);
      // Colour types 4 and 6 carry an alpha channel.
      facts.alphaChannel = data[9] === 4 || data[9] === 6;
    } else if (type === 'tRNS') {
      facts.alphaChannel = true;
    } else if (type === 'acTL') {
      facts.animated = true;
    } else if (type === 'eXIf') {
      facts.location ||= readExif(await source.read(position + 8, length)).location;
    } else if (type === 'iTXt' || type === 'tEXt') {
      const data = await source.read(position + 8, length);
      if (holds(data.subarray(0, 24), 'XML:com.adobe.xmp')) facts.location ||= holds(data, XMP_LATITUDE);
    }
    position += 12 + length;
  }
  return facts;
}

/**
 * A WebP's facts: the size from its first chunk (`VP8X`'s canvas, or the picture's own for a plain
 * file), animation and alpha from `VP8X`'s flags, and a position from the EXIF and XMP chunks, which
 * the format puts after the picture, so the walk steps over it by its chunk headers.
 * @param source The file.
 * @returns The facts.
 */
async function webpFacts(source: ByteSource): Promise<UploadFacts> {
  const facts: UploadFacts = { format: 'webp', location: false, animated: false, alphaChannel: false };
  const first = await source.read(12, 18);
  const type = ascii(first, 0, 4);
  const data = first.subarray(8);
  let metadata = false;
  if (type === 'VP8X' && data.length >= 10) {
    facts.animated = (data[0] & 0x02) !== 0;
    facts.alphaChannel = (data[0] & 0x10) !== 0;
    metadata = (data[0] & 0x0c) !== 0;
    facts.width = 1 + (data[4] | (data[5] << 8) | (data[6] << 16));
    facts.height = 1 + (data[7] | (data[8] << 8) | (data[9] << 16));
  } else if (type === 'VP8 ' && data.length >= 10) {
    facts.width = (data[6] | (data[7] << 8)) & 0x3fff;
    facts.height = (data[8] | (data[9] << 8)) & 0x3fff;
  } else if (type === 'VP8L' && data.length >= 5) {
    const bits = data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
    facts.width = (bits & 0x3fff) + 1;
    facts.height = ((bits >>> 14) & 0x3fff) + 1;
    facts.alphaChannel = ((bits >>> 28) & 1) === 1;
  }
  if (!metadata) return facts;
  let position = 12;
  while (position + 8 <= source.size) {
    const header = await source.read(position, 8);
    if (header.length < 8) break;
    const length = new DataView(header.buffer, header.byteOffset, 8).getUint32(4, true);
    const chunk = ascii(header, 0, 4);
    if (chunk === 'EXIF') facts.location ||= readExif(await source.read(position + 8, length)).location;
    else if (chunk === 'XMP ') facts.location ||= holds(await source.read(position + 8, length), XMP_LATITUDE);
    position += 8 + length + (length % 2);
  }
  return facts;
}

/**
 * A GIF's facts: its logical screen's size, and whether it has more than one frame, which needs the
 * whole file, since frames are spread through it.
 * @param source The file.
 * @returns The facts.
 */
async function gifFacts(source: ByteSource): Promise<UploadFacts> {
  const head = await source.head();
  const facts: UploadFacts = { format: 'gif', location: false, animated: false, alphaChannel: false };
  if (head.length >= 10) {
    facts.width = head[6] | (head[7] << 8);
    facts.height = head[8] | (head[9] << 8);
  }
  facts.animated = isAnimatedGif(await source.all());
  return facts;
}

/**
 * What a dropped file is, from its header (design §3).
 * @param file The file.
 * @returns Its facts; an unreadable header gives what was read before it ended.
 */
export async function readFacts(file: File): Promise<UploadFacts> {
  const source = new ByteSource(file);
  const format = sniff(await source.head());
  switch (format) {
    case 'jpeg':
      return jpegFacts(source);
    case 'png':
      return pngFacts(source);
    case 'webp':
      return webpFacts(source);
    case 'gif':
      return gifFacts(source);
    default:
      return { format: 'other', location: false, animated: false, alphaChannel: false };
  }
}

/**
 * The most pixels {@link isOpaquePng} looks at: a 16 megapixel picture is read whole. A larger one is
 * decoded smaller, nearest neighbour so no pixel is blended with its neighbours, which can miss a
 * stray transparent pixel but not a logo's transparent background.
 */
const OPACITY_PIXELS = 16_000_000;

/** How many rows are read out of the canvas at a time, so the copy is never the whole picture again. */
const OPACITY_STRIP_ROWS = 256;

/**
 * Whether no pixel of a PNG is transparent, even a little: what makes it a PNG photo rather than a
 * PNG with transparency (#179). A screenshot is opaque too, so it counts as a photo; the warning lets
 * the editor untick it. Decoded at its own size up to {@link OPACITY_PIXELS}, with the browser told not
 * to premultiply, so an alpha of 254 stays 254.
 * @param file The PNG.
 * @returns True when every pixel is opaque; false when one is not, or the file cannot be decoded.
 */
export async function isOpaquePng(file: Blob): Promise<boolean> {
  let picture: ImageBitmap | undefined;
  try {
    const probe = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const scale = Math.min(1, Math.sqrt(OPACITY_PIXELS / (probe.width * probe.height)));
    if (scale < 1) {
      probe.close();
      picture = await createImageBitmap(file, {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
        resizeWidth: Math.max(1, Math.floor(probe.width * scale)),
        resizeHeight: Math.max(1, Math.floor(probe.height * scale)),
        resizeQuality: 'pixelated',
      });
    } else {
      picture = probe;
    }
    const canvas = new OffscreenCanvas(picture.width, picture.height);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(picture, 0, 0);
    for (let top = 0; top < picture.height; top += OPACITY_STRIP_ROWS) {
      const rows = Math.min(OPACITY_STRIP_ROWS, picture.height - top);
      const pixels = context.getImageData(0, top, picture.width, rows).data;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    picture?.close();
  }
}
