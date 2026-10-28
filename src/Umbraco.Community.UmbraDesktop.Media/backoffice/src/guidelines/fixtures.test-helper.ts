/** A file's bytes, over an ordinary `ArrayBuffer`. */
export type Bytes = Uint8Array<ArrayBuffer>;

/*
 * Builders for the guidelines' tests, copied from Services.Media's metadata walkers' (nothing is
 * imported between packages): files with exactly the headers a test is about, made in
 * the test rather than kept as binaries, so each test says what is in its file. The picture data
 * comes from the browser's own canvas encoder, so it is a real image that decodes.
 */

/**
 * Bytes from ASCII and numbers.
 * @param parts Text, taken as ASCII, or bytes.
 * @returns The bytes, in order.
 */
export function bytes(...parts: Array<string | ArrayLike<number>>): Bytes {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') for (const c of part) out.push(c.charCodeAt(0));
    else out.push(...Array.from(part));
  }
  return new Uint8Array(out);
}

/** What an EXIF block built for a test holds. */
export interface ExifFixture {
  /** The orientation tag, if any. */
  orientation?: number;
  /** A GPS block with a latitude reference, pointed at from IFD0. */
  gps?: boolean;
  /** The camera's make, as text stored after the IFD. */
  make?: string;
  /** Motorola byte order, as some cameras write. */
  bigEndian?: boolean;
}

/**
 * A TIFF block as EXIF holds it, with the tags asked for in IFD0.
 * @param fixture What to put in it.
 * @returns The block, without the `Exif\0\0` that precedes it in a JPEG.
 */
export function exifBlock(fixture: ExifFixture): Bytes {
  const little = !fixture.bigEndian;
  const entries: Array<{ tag: number; type: number; count: number; value: number | Uint8Array }> = [];
  if (fixture.make !== undefined) entries.push({ tag: 0x010f, type: 2, count: fixture.make.length + 1, value: bytes(fixture.make, [0]) });
  if (fixture.orientation !== undefined) entries.push({ tag: 0x0112, type: 3, count: 1, value: fixture.orientation });
  if (fixture.gps) entries.push({ tag: 0x8825, type: 4, count: 1, value: 0 });
  const ifdSize = 2 + entries.length * 12 + 4;
  const gpsSize = fixture.gps ? 2 + 12 + 4 : 0;
  const extra = entries.reduce((sum, entry) => sum + (entry.value instanceof Uint8Array && entry.value.length > 4 ? entry.value.length : 0), 0);
  const out = new Uint8Array(8 + ifdSize + gpsSize + extra);
  const view = new DataView(out.buffer);
  out.set(bytes(little ? 'II' : 'MM'));
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, entries.length, little);
  const gpsAt = 8 + ifdSize;
  let dataAt = gpsAt + gpsSize;
  entries.forEach((entry, index) => {
    const at = 10 + index * 12;
    view.setUint16(at, entry.tag, little);
    view.setUint16(at + 2, entry.type, little);
    view.setUint32(at + 4, entry.count, little);
    if (entry.tag === 0x8825) view.setUint32(at + 8, gpsAt, little);
    else if (entry.value instanceof Uint8Array) {
      if (entry.value.length <= 4) out.set(entry.value, at + 8);
      else {
        view.setUint32(at + 8, dataAt, little);
        out.set(entry.value, dataAt);
        dataAt += entry.value.length;
      }
    } else view.setUint16(at + 8, entry.value, little);
  });
  view.setUint32(10 + entries.length * 12, 0, little);
  if (fixture.gps) {
    view.setUint16(gpsAt, 1, little);
    view.setUint16(gpsAt + 2, 0x0001, little);
    view.setUint16(gpsAt + 4, 2, little);
    view.setUint32(gpsAt + 6, 2, little);
    out.set(bytes('N', [0]), gpsAt + 10);
  }
  return out;
}

/**
 * A JPEG segment: its marker, its length (which counts itself) and its payload.
 * @param marker The marker's second byte, such as `0xE1` for APP1.
 * @param payload What it carries.
 * @returns The segment.
 */
export function segment(marker: number, payload: Uint8Array): Bytes {
  const length = payload.length + 2;
  return bytes([0xff, marker, length >> 8, length & 0xff], payload);
}

/**
 * An APP1 EXIF segment.
 * @param fixture What its TIFF block holds.
 * @returns The segment.
 */
export function exifSegment(fixture: ExifFixture): Bytes {
  return segment(0xe1, bytes('Exif', [0, 0], exifBlock(fixture)));
}

/**
 * A real picture, encoded by the browser: a red square on blue, so it is not one flat colour.
 * @param width Its width.
 * @param height Its height.
 * @param mime The format to encode.
 * @param quality 0 to 1, for JPEG and WebP.
 * @returns The file's bytes.
 */
export async function encoded(width: number, height: number, mime: string, quality = 0.9): Promise<Bytes> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#2040c0';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#e02020';
  context.fillRect(0, 0, Math.ceil(width / 2), Math.ceil(height / 3));
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), mime, quality));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * A JPEG with the given segments just after its start marker, where cameras write theirs, and
 * whatever the browser's encoder wrote after them.
 * @param segments The segments, in order.
 * @param size The picture's stored size.
 * @param size.width Its width.
 * @param size.height Its height.
 * @returns The file.
 */
export async function jpegWith(segments: Uint8Array[], size = { width: 40, height: 20 }): Promise<Bytes> {
  const plain = await encoded(size.width, size.height, 'image/jpeg');
  return bytes(plain.subarray(0, 2), ...segments, plain.subarray(2));
}

/**
 * Where a JPEG's scan starts: its SOS marker. Everything from there is the compressed picture.
 * @param file The JPEG.
 * @returns The offset, or -1.
 */
export function scanStart(file: Bytes): number {
  let position = 2;
  while (position + 4 <= file.length) {
    if (file[position] !== 0xff) return -1;
    const marker = file[position + 1];
    if (marker === 0xda) return position;
    position += 2 + ((file[position + 2] << 8) | file[position + 3]);
  }
  return -1;
}

/**
 * The markers of a JPEG's segments before its scan, in order, with the first bytes of each payload
 * so two APP1s can be told apart.
 * @param file The JPEG.
 * @returns One `XX:payload start` per segment.
 */
export function segmentsOf(file: Bytes): string[] {
  const out: string[] = [];
  let position = 2;
  while (position + 4 <= file.length) {
    const marker = file[position + 1];
    if (marker === 0xda) break;
    const length = (file[position + 2] << 8) | file[position + 3];
    out.push(`${marker.toString(16).toUpperCase()}:${String.fromCharCode(...file.subarray(position + 4, position + 8))}`);
    position += 2 + length;
  }
  return out;
}

/**
 * The payload of a JPEG's first APP1 EXIF segment's TIFF block, or undefined without one.
 * @param file The JPEG.
 * @returns The TIFF block.
 */
export function exifOf(file: Bytes): Bytes | undefined {
  let position = 2;
  while (position + 4 <= file.length) {
    const marker = file[position + 1];
    if (marker === 0xda) return undefined;
    const length = (file[position + 2] << 8) | file[position + 3];
    if (marker === 0xe1 && String.fromCharCode(...file.subarray(position + 4, position + 8)) === 'Exif') {
      return file.subarray(position + 10, position + 2 + length);
    }
    position += 2 + length;
  }
  return undefined;
}

/**
 * CRC-32 as PNG computes it, bit by bit: written apart from the walker's own table-driven one, so a
 * test that checks the walker's checksums is not checking it against itself.
 * @param data The chunk's type and data.
 * @returns The checksum.
 */
export function referenceCrc(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A PNG chunk with a correct checksum.
 * @param type The four letters.
 * @param data What it carries.
 * @returns The chunk.
 */
export function chunk(type: string, data: Uint8Array): Bytes {
  const body = bytes(type, data);
  const crc = referenceCrc(body);
  const length = data.length;
  return bytes([length >>> 24, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff], body, [crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff]);
}

/**
 * A real PNG with the given chunks just after its header, where ancillary chunks go.
 * @param chunks The chunks, in order.
 * @returns The file.
 */
export async function pngWith(chunks: Uint8Array[]): Promise<Bytes> {
  const plain = await encoded(8, 4, 'image/png');
  // The signature (8) and the IHDR chunk (4 + 4 + 13 + 4).
  const header = 8 + 25;
  return bytes(plain.subarray(0, header), ...chunks, plain.subarray(header));
}

/**
 * A PNG's chunks, in order, by type.
 * @param file The PNG.
 * @returns The chunk types, and whether each one's checksum is right.
 */
export function pngChunks(file: Bytes): Array<{ type: string; crcOk: boolean; data: Bytes }> {
  const out: Array<{ type: string; crcOk: boolean; data: Bytes }> = [];
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let position = 8;
  while (position + 12 <= file.length) {
    const length = view.getUint32(position);
    const type = String.fromCharCode(...file.subarray(position + 4, position + 8));
    const crc = view.getUint32(position + 8 + length);
    out.push({ type, crcOk: crc === referenceCrc(file.subarray(position + 4, position + 8 + length)), data: file.subarray(position + 8, position + 8 + length) });
    position += 12 + length;
  }
  return out;
}

/**
 * A RIFF chunk as WebP lays one out: its four letters, its little-endian size, its data, and a pad
 * byte when the size is odd.
 * @param type The four letters.
 * @param data What it carries.
 * @returns The chunk.
 */
export function riffChunk(type: string, data: Uint8Array): Bytes {
  const length = data.length;
  return bytes(type, [length & 0xff, (length >>> 8) & 0xff, (length >>> 16) & 0xff, length >>> 24], data, length % 2 ? [0] : []);
}

/**
 * A real extended WebP: a `VP8X` header with the flags given, chunks before the picture, what the
 * browser encoded, and chunks after it (EXIF and XMP go there). Chrome's canvas already writes the
 * extended form with an sRGB colour profile (`ICCP`), so its own header is replaced and its profile
 * kept, with the profile's flag.
 * @param flags The `VP8X` flags, besides the profile's.
 * @param before Chunks before the picture, after the profile.
 * @param after Chunks after it.
 * @returns The file, 8 × 4 pixels.
 */
export async function webpWith(flags: number, before: Uint8Array[], after: Uint8Array[]): Promise<Bytes> {
  const plain = await encoded(8, 4, 'image/webp', 0.8);
  const extended = String.fromCharCode(...plain.subarray(12, 16)) === 'VP8X';
  const picture = plain.subarray(extended ? 30 : 12);
  const vp8x = riffChunk('VP8X', bytes([flags | (extended ? plain[20] : 0), 0, 0, 0], [7, 0, 0], [3, 0, 0]));
  const [profile, ...rest] = webpChunks(bytes('RIFF', [0, 0, 0, 0], 'WEBP', picture));
  const head = profile?.type === 'ICCP' ? [riffChunk('ICCP', profile.data)] : [];
  const image = profile?.type === 'ICCP' ? rest.map((c) => riffChunk(c.type, c.data)) : [picture];
  const body = bytes('WEBP', vp8x, ...head, ...before, ...image, ...after);
  const size = body.length;
  return bytes('RIFF', [size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, size >>> 24], body);
}

/**
 * A WebP's chunks after its header, by type.
 * @param file The WebP.
 * @returns The types, in order, each with its data.
 */
export function webpChunks(file: Bytes): Array<{ type: string; data: Bytes }> {
  const out: Array<{ type: string; data: Bytes }> = [];
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let position = 12;
  while (position + 8 <= file.length) {
    const length = view.getUint32(position + 4, true);
    out.push({ type: String.fromCharCode(...file.subarray(position, position + 4)), data: file.subarray(position + 8, position + 8 + length) });
    position += 8 + length + (length % 2);
  }
  return out;
}
