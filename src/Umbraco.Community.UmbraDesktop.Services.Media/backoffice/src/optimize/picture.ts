import { mimeFor } from '../file-menu/formats.js';
import type { SaveFormat } from '../file-menu/types.js';

/*
 * Reading and writing a picture for Optimize images (#139, design §6). The decoder, the encoder and the
 * GIF walk are **copies** of the Media add-on's Image Editor's (`image-editor/decode.ts`, `encode.ts`
 * and `formats.ts`), since nothing is imported between packages, changed only where a batch run needs
 * more: a size to decode at, and white under a JPEG.
 */

/** The raster formats a run reads, by the names `ImageFacts.format` carries. */
export type RasterFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp';

/**
 * The file extensions a run optimizes, without dots: a copy of the Image Editor's `ACCEPT`, what a
 * canvas can decode and write again.
 */
export const RASTER_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];

/**
 * The format a file extension names.
 * @param extension The extension, without the dot, in any case.
 * @returns The raster format, `svg` for a vector image, or null for anything a run does not read.
 */
export function formatOfExtension(extension: string): RasterFormat | 'svg' | null {
  const lower = extension.toLowerCase();
  if (lower === 'svg') return 'svg';
  if (!RASTER_EXTENSIONS.includes(lower)) return null;
  return lower === 'jpg' ? 'jpeg' : (lower as RasterFormat);
}

/**
 * Four bytes as ASCII, for a file's chunk names.
 * @param bytes The file.
 * @param at Where the four start.
 * @returns The text.
 */
function ascii(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}

/**
 * Whether a file moves, so a run can skip it rather than keep its first frame (design §6.1, D13).
 *
 * A GIF by counting image descriptors; a PNG by the `acTL` chunk an animated PNG carries before its
 * first `IDAT`; a WebP by its `VP8X` header's animation flag. A JPEG and a BMP never move. Anything
 * that is not the format it says, or ends early, is called still: a file that cannot be decoded fails
 * on decode with the browser's words, not here.
 * @param bytes The file.
 * @param format What its extension says it is.
 * @returns True for an animated image.
 */
export function isAnimated(bytes: Uint8Array, format: RasterFormat): boolean {
  switch (format) {
    case 'gif':
      return isAnimatedGif(bytes);
    case 'png':
      return isAnimatedPng(bytes);
    case 'webp':
      return bytes.length >= 21 && ascii(bytes, 0) === 'RIFF' && ascii(bytes, 8) === 'WEBP' && ascii(bytes, 12) === 'VP8X' && (bytes[20] & 0x02) !== 0;
    default:
      return false;
  }
}

/**
 * Whether a PNG is an animated PNG: an `acTL` chunk before the first `IDAT`, where the format puts it.
 * @param bytes The file.
 * @returns True when it is.
 */
function isAnimatedPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8 || bytes[0] !== 0x89 || ascii(bytes, 1) !== 'PNG\r') return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 8;
  while (position + 8 <= bytes.length) {
    const type = ascii(bytes, position + 4);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    position += 12 + view.getUint32(position);
  }
  return false;
}

/**
 * Whether a GIF holds more than one frame. A copy of the Image Editor's `isAnimatedGif`: it walks the
 * block structure (header, screen descriptor and colour table, then extension and image blocks, each
 * sub-block length-prefixed) counting image descriptors, and stops at the second, because the
 * descriptor's byte turns up inside compressed data and colour tables all the time.
 * @param bytes The file.
 * @returns True for two or more frames.
 */
function isAnimatedGif(bytes: Uint8Array): boolean {
  const header = String.fromCharCode(...bytes.subarray(0, 6));
  if (header !== 'GIF87a' && header !== 'GIF89a') return false;
  if (bytes.length < 13) return false;

  /** The size of a colour table a packed byte's top bit says follows, or 0. */
  const tableSize = (packed: number) => (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);

  /**
   * Skip a run of sub-blocks, each a length byte then that many bytes, ended by a zero length.
   * @param at Where the run starts.
   * @returns Where it ends, or -1 if the file ends first.
   */
  const skipSubBlocks = (at: number): number => {
    let position = at;
    while (position < bytes.length) {
      const length = bytes[position];
      position += 1;
      if (length === 0) return position;
      position += length;
    }
    return -1;
  };

  let position = 13 + tableSize(bytes[10]);
  let frames = 0;
  while (position < bytes.length) {
    const block = bytes[position];
    if (block === 0x3b) return false;
    if (block === 0x21) {
      position = skipSubBlocks(position + 2);
    } else if (block === 0x2c) {
      frames += 1;
      if (frames > 1) return true;
      if (position + 10 > bytes.length) return false;
      position = skipSubBlocks(position + 10 + tableSize(bytes[position + 9]) + 1);
    } else {
      return false;
    }
    if (position < 0) return false;
  }
  return false;
}

/**
 * Decode a file into a picture, upright, at a size if one is asked.
 *
 * `imageOrientation: 'from-image'` has the browser apply the file's EXIF orientation, as the Image
 * Editor's decoder does, so a phone photo stored on its side comes out upright with its sides
 * swapped; named rather than left to the default, which a browser could change. A size is the
 * upright size, and the browser's own high-quality resampling scales to it, which from 6000 to 2560
 * pixels does not alias as one plain `drawImage` does (design §6.2, measured in §15).
 * @param blob The file.
 * @param size The upright size to decode at; the file's own when absent.
 * @returns The picture. It throws for a file the browser cannot decode.
 */
export function decodePicture(blob: Blob, size?: { width: number; height: number }): Promise<ImageBitmap> {
  return createImageBitmap(
    blob,
    size
      ? { imageOrientation: 'from-image', resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' }
      : { imageOrientation: 'from-image' },
  );
}

/**
 * Encode a picture with the canvas's own encoder, which writes no metadata.
 *
 * A JPEG has no transparency, and a canvas writes a transparent pixel into one as black, so a logo on
 * a transparent background converted to JPEG would come out on black: it is drawn over white. The
 * canvas is emptied afterwards, so a run of fifty photos holds one picture's pixels at a time.
 * @param picture The picture.
 * @param format The format.
 * @param quality 1 to 100, for JPEG and WebP; PNG has none.
 * @returns The file's bytes.
 */
export async function encodePicture(picture: ImageBitmap, format: SaveFormat, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = picture.width;
  canvas.height = picture.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas to draw the picture on.');
    if (format === 'jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(picture, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(checkEncoded(blob, format)) : reject(new Error(`The picture could not be encoded as ${format}.`))),
        mimeFor(format),
        format === 'png' ? undefined : quality / 100,
      ),
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** The names people know the formats by, for the message when a browser cannot write one. */
const FORMAT_NAMES: Record<SaveFormat, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP' };

/**
 * Make sure an encoder wrote the format asked for. A canvas that cannot write a format writes PNG
 * instead without saying so, as Safari's does for WebP; saved under a `.webp` name, that is a PNG the
 * media library calls WebP. So it fails here, in words the person can act on.
 * @param blob What the encoder wrote.
 * @param format What was asked for.
 * @returns The blob, when it is that format.
 */
export function checkEncoded(blob: Blob, format: SaveFormat): Blob {
  if (blob.type !== mimeFor(format)) throw new Error(`This browser cannot write ${FORMAT_NAMES[format]} images. Choose another format, or use another browser.`);
  return blob;
}

/**
 * The worker that decodes, resizes and encodes one picture, as source, so the package needs no
 * separate worker file and the build no worker plugin. The same steps as {@link decodePicture} and
 * {@link encodePicture}: upright, the browser's high-quality resampling, white under a JPEG.
 */
const RENDER_WORKER = `
self.onmessage = async (event) => {
  const { blob, width, height, mime, quality } = event.data;
  try {
    const picture = await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    const canvas = new OffscreenCanvas(picture.width, picture.height);
    const context = canvas.getContext('2d');
    if (mime === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(picture, 0, 0);
    picture.close();
    const out = await canvas.convertToBlob(mime === 'image/png' ? { type: mime } : { type: mime, quality });
    self.postMessage({ ok: true, blob: out });
  } catch (error) {
    self.postMessage({ ok: false, message: (error && error.message) || String(error) });
  }
};
`;

/**
 * Start the render worker. A worker from a `blob:` address, which a site's content security policy may
 * refuse: then this throws, or the worker fails to start, and the page does the work instead.
 * @returns The worker.
 */
export function startRenderWorker(): Worker {
  const url = URL.createObjectURL(new Blob([RENDER_WORKER], { type: 'text/javascript' }));
  try {
    return new Worker(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The worker could not run at all, as opposed to failing on this picture. */
class WorkerUnavailable extends Error {}

/**
 * Decode a picture at a size and encode it, off the page where the browser allows (design §6.2, §15).
 *
 * Measured in the real run: a canvas's WebP encode of a 2560-pixel photo blocks the page for about
 * 300 ms, and the resized decode for another 90, so a window dragged while a run goes hitched once per
 * image. In a worker, with an `OffscreenCanvas`, the same work gives the same file and blocks nothing.
 * Where workers or `OffscreenCanvas` are not there, or the site refuses a worker, the page does it, as
 * {@link decodePicture} and {@link encodePicture} always did. A worker per picture, ended when it
 * answers, so its memory goes with it.
 * @param blob The file.
 * @param size The upright size to decode at.
 * @param size.width Its width.
 * @param size.height Its height.
 * @param format The format to write.
 * @param quality 1 to 100, for JPEG and WebP.
 * @param startWorker How to start the worker; for a test.
 * @returns The new file's bytes. It throws for a picture the browser cannot decode or encode.
 */
export async function renderPicture(
  blob: Blob,
  size: { width: number; height: number },
  format: SaveFormat,
  quality: number,
  startWorker: () => Worker = startRenderWorker,
): Promise<Blob> {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      return checkEncoded(await renderInWorker(blob, size, format, quality, startWorker), format);
    } catch (error) {
      if (!(error instanceof WorkerUnavailable)) throw error;
    }
  }
  const picture = await decodePicture(blob, size);
  try {
    return await encodePicture(picture, format, quality);
  } finally {
    picture.close();
  }
}

/**
 * One picture through the render worker.
 * @param blob The file.
 * @param size The size.
 * @param size.width Its width.
 * @param size.height Its height.
 * @param format The format.
 * @param quality The quality.
 * @param startWorker How to start the worker.
 * @returns The new file's bytes; a {@link WorkerUnavailable} when the worker could not run.
 */
function renderInWorker(blob: Blob, size: { width: number; height: number }, format: SaveFormat, quality: number, startWorker: () => Worker): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = startWorker();
    } catch (error) {
      reject(new WorkerUnavailable((error as Error)?.message));
      return;
    }
    worker.onmessage = (event: MessageEvent<{ ok: boolean; blob?: Blob; message?: string }>) => {
      worker.terminate();
      if (event.data.ok && event.data.blob) resolve(event.data.blob);
      else reject(new Error(event.data.message || `The picture could not be encoded as ${format}.`));
    };
    worker.onerror = (event) => {
      worker.terminate();
      event.preventDefault();
      reject(new WorkerUnavailable(event.message));
    };
    worker.postMessage({ blob, width: size.width, height: size.height, mime: mimeFor(format), quality: quality / 100 });
  });
}
