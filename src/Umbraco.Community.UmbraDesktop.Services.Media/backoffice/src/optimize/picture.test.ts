import { expect } from '@open-wc/testing';
import { checkEncoded, decodePicture, encodePicture, formatOfExtension, isAnimated, renderPicture, startRenderWorker } from './picture.js';

/**
 * Reading a picture file (design §6.1 and §6.2): which format an extension is, whether a file moves,
 * and decoding and encoding it upright, at the size asked, without black where it was transparent.
 */

/**
 * A fixture's bytes.
 * @param name The file in `fixtures/`.
 * @returns Its contents.
 */
async function fixture(name: string): Promise<Blob> {
  return (await fetch(new URL(`./fixtures/${name}`, import.meta.url))).blob();
}

/**
 * Bytes from ASCII and numbers, for building a file's structure by hand.
 * @param parts Text, taken as ASCII, or bytes.
 * @returns The bytes, in order.
 */
function bytes(...parts: Array<string | number[]>): Uint8Array {
  const out: number[] = [];
  for (const part of parts) out.push(...(typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part));
  return new Uint8Array(out);
}

/**
 * A PNG chunk with a dummy checksum: nothing here reads the checksum.
 * @param type The four letters.
 * @param length The data's length, all zeros.
 * @returns The chunk.
 */
function pngChunk(type: string, length: number): number[] {
  return [...bytes([0, 0, 0, length], type, new Array(length).fill(0), [0, 0, 0, 0])];
}

/** A PNG's signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * An extended WebP's opening: the RIFF header and a `VP8X` chunk with the flags given.
 * @param flags The `VP8X` flags byte.
 * @returns The bytes.
 */
function webpX(flags: number): Uint8Array {
  return bytes('RIFF', [22, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [flags, 0, 0, 0], [0, 0, 0], [0, 0, 0]);
}

describe('formatOfExtension', () => {
  it('names the raster formats in any case, SVG as a vector, and nothing else', () => {
    expect(['jpg', 'JPEG', 'png', 'webp', 'gif', 'bmp', 'svg', 'pdf', ''].map(formatOfExtension)).to.deep.equal([
      'jpeg',
      'jpeg',
      'png',
      'webp',
      'gif',
      'bmp',
      'svg',
      null,
      null,
    ]);
  });
});

describe('isAnimated', () => {
  it('finds two frames in an animated GIF and one in a still one', async () => {
    expect(isAnimated(new Uint8Array(await (await fixture('two-frames.gif')).arrayBuffer()), 'gif')).to.equal(true);
    expect(isAnimated(new Uint8Array(await (await fixture('one-frame.gif')).arrayBuffer()), 'gif')).to.equal(false);
  });

  it('finds an animated PNG by its acTL chunk before the picture', () => {
    const animated = bytes(PNG_SIGNATURE, pngChunk('IHDR', 13), pngChunk('acTL', 8), pngChunk('IDAT', 2), pngChunk('IEND', 0));
    const still = bytes(PNG_SIGNATURE, pngChunk('IHDR', 13), pngChunk('IDAT', 2), pngChunk('IEND', 0));
    expect(isAnimated(animated, 'png')).to.equal(true);
    expect(isAnimated(still, 'png')).to.equal(false);
  });

  it('finds an animated WebP by its VP8X animation flag', () => {
    expect(isAnimated(webpX(0x02), 'webp')).to.equal(true);
    expect(isAnimated(webpX(0x08), 'webp')).to.equal(false);
    expect(isAnimated(bytes('RIFF', [4, 0, 0, 0], 'WEBP', 'VP8 '), 'webp')).to.equal(false);
  });

  it('calls a JPEG, a BMP and a file that is not what it says still', () => {
    expect(isAnimated(bytes([0xff, 0xd8, 0xff]), 'jpeg')).to.equal(false);
    expect(isAnimated(bytes('BM'), 'bmp')).to.equal(false);
    expect(isAnimated(bytes('nonsense'), 'png')).to.equal(false);
  });
});

describe('decodePicture', () => {
  /** The fixture is a 4 × 2 JPEG stored on its side with EXIF orientation 6: upright it is 2 × 4. */
  it('decodes a phone photo upright, with its sides swapped', async () => {
    const picture = await decodePicture(await fixture('exif-orientation-6.jpg'));
    expect([picture.width, picture.height]).to.deep.equal([2, 4]);
    picture.close();
  });

  /**
   * Review Focus 1: the size asked is the upright size. Applied to the stored 4 × 2 before turning
   * it, 1 × 2 would come out 2 × 1, a squashed sideways picture.
   */
  it('decodes a phone photo upright at the asked size', async () => {
    const picture = await decodePicture(await fixture('exif-orientation-6.jpg'), { width: 1, height: 2 });
    expect([picture.width, picture.height]).to.deep.equal([1, 2]);
    picture.close();
  });
});

/**
 * A photo-sized JPEG, noisy so it encodes like a photo rather than a flat colour.
 * @param width Its width.
 * @param height Its height.
 * @returns The file.
 */
async function bigJpeg(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const noise = context.createImageData(width, height);
  for (let i = 0; i < noise.data.length; i++) noise.data[i] = (i * 2654435761) >>> 24;
  context.putImageData(noise, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.9));
}

/**
 * Found in the real run (design §15): a canvas's WebP encode blocks the page for about 300 ms per photo,
 * so a window dragged during a run hitched once per image. In a worker it blocks nothing.
 */
describe('renderPicture', () => {
  /**
   * Whether the page is blocked is measured, not asserted: a long-task count in a test also catches the
   * garbage collector and the test runner, and failed one run in four. The measurement is in design §15
   * (80 ms on the page in this test's case, 290 ms in the real run, none in the worker).
   */
  it('decodes, resizes and encodes a photo in a worker', async () => {
    const photo = await bigJpeg(4000, 3000);
    let started = 0;
    const blob = await renderPicture(photo, { width: 2560, height: 1920 }, 'webp', 80, () => (started++, startRenderWorker()));
    expect(started, 'the worker did the work').to.equal(1);
    expect(blob.type).to.equal('image/webp');
    const back = await createImageBitmap(blob);
    expect([back.width, back.height]).to.deep.equal([2560, 1920]);
  });

  it('keeps a phone photo upright in the worker too', async () => {
    const blob = await renderPicture(await fixture('exif-orientation-6.jpg'), { width: 1, height: 2 }, 'png', 80);
    const back = await createImageBitmap(blob);
    expect([back.width, back.height]).to.deep.equal([1, 2]);
  });

  it('paints a JPEG over white in the worker too', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const png = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    const blob = await renderPicture(png, { width: 4, height: 4 }, 'jpeg', 90);
    const check = document.createElement('canvas');
    check.width = 4;
    check.height = 4;
    const context = check.getContext('2d')!;
    context.drawImage(await createImageBitmap(blob), 0, 0);
    expect(Math.min(...context.getImageData(1, 1, 1, 1).data.slice(0, 3))).to.be.at.least(245);
  });

  it('falls back to the page where a site refuses workers', async () => {
    const blob = await renderPicture(await fixture('exif-orientation-6.jpg'), { width: 1, height: 2 }, 'png', 80, () => {
      throw new Error('Refused by the content security policy');
    });
    expect(blob.type).to.equal('image/png');
  });
});

describe('checkEncoded', () => {
  /** Safari's canvas cannot write WebP and hands back a PNG instead, which must not be saved as .webp. */
  it('refuses a file in another format than the one asked for', () => {
    expect(() => checkEncoded(new Blob(['x'], { type: 'image/png' }), 'webp')).to.throw(/WebP/);
    expect(checkEncoded(new Blob(['x'], { type: 'image/webp' }), 'webp').type).to.equal('image/webp');
  });
});

describe('encodePicture', () => {
  /** Review Focus 2: a JPEG has no transparency, and a canvas writes transparent pixels as black. */
  it('encodes a transparent picture to JPEG over white', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const transparent = await createImageBitmap(canvas);
    const blob = await encodePicture(transparent, 'jpeg', 90);
    expect(blob.type).to.equal('image/jpeg');
    const back = await createImageBitmap(blob);
    const check = document.createElement('canvas');
    check.width = 4;
    check.height = 4;
    const context = check.getContext('2d')!;
    context.drawImage(back, 0, 0);
    const [r, g, b] = context.getImageData(1, 1, 1, 1).data;
    expect(Math.min(r, g, b)).to.be.at.least(245);
  });

  it('keeps transparency in PNG and WebP', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const transparent = await createImageBitmap(canvas);
    for (const format of ['png', 'webp'] as const) {
      const back = await createImageBitmap(await encodePicture(transparent, format, 80));
      const check = document.createElement('canvas');
      check.width = 2;
      check.height = 2;
      const context = check.getContext('2d')!;
      context.drawImage(back, 0, 0);
      expect(context.getImageData(0, 0, 1, 1).data[3], format).to.equal(0);
    }
  });
});
