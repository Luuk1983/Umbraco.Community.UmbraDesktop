import { expect } from '@open-wc/testing';
import { isOpaquePng, readFacts } from './image-facts.js';
import { bytes, chunk, encoded, exifBlock, exifSegment, jpegWith, pngWith, riffChunk, webpWith } from './fixtures.test-helper.js';

/**
 * What the check reads from a dropped file before it is uploaded (#179): its format, its size and
 * whether it records a location, all from the file's header, never by decoding the picture. A PNG's
 * transparency is the one fact a header cannot settle, and has a function of its own.
 */

/**
 * A file from bytes.
 * @param data The bytes.
 * @param name Its name, whose extension a browser may not trust.
 * @param type Its MIME type.
 * @returns The file.
 */
function fileOf(data: Uint8Array<ArrayBuffer>, name: string, type = ''): File {
  return new File([data], name, { type });
}

/**
 * A PNG the browser encodes from a canvas, with some of it transparent or not.
 * @param transparent Whether a corner is left transparent, or how transparent the whole is.
 * @param size The picture's size.
 * @param size.width Its width.
 * @param size.height Its height.
 * @returns The file.
 */
async function pngFrom(transparent: 'corner' | 'none' | 'faint', size = { width: 40, height: 30 }): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = transparent === 'faint' ? 'rgba(32, 64, 192, 0.995)' : '#2040c0';
  context.fillRect(0, 0, size.width, size.height);
  if (transparent === 'corner') context.clearRect(0, 0, 1, 1);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new File([blob], 'picture.png', { type: 'image/png' });
}

describe('a dropped file\'s facts', () => {
  it('read a JPEG\'s size from its frame header', async () => {
    const facts = await readFacts(fileOf(await jpegWith([], { width: 64, height: 48 }), 'DSC_0412.jpg', 'image/jpeg'));
    expect(facts).to.include({ format: 'jpeg', width: 64, height: 48, location: false, animated: false });
  });

  it('read a JPEG\'s size upright, as people see it, when EXIF says it is stored on its side', async () => {
    const facts = await readFacts(fileOf(await jpegWith([exifSegment({ orientation: 6 })], { width: 64, height: 48 }), 'phone.jpg'));
    expect(facts).to.include({ width: 48, height: 64, location: false });
  });

  it('say a JPEG records a location when its EXIF has a GPS block with a position in it', async () => {
    const facts = await readFacts(fileOf(await jpegWith([exifSegment({ gps: true, make: 'NIKON' })]), 'DSC_0415.jpg'));
    expect(facts.location).to.equal(true);
  });

  it('say a JPEG does not when its EXIF has only a camera', async () => {
    const facts = await readFacts(fileOf(await jpegWith([exifSegment({ make: 'NIKON' })]), 'DSC_0416.jpg'));
    expect(facts.location).to.equal(false);
  });

  it('say a JPEG records a location when its XMP does', async () => {
    const xmp = bytes('http://ns.adobe.com/xap/1.0/', [0], '<x:xmpmeta><rdf:Description exif:GPSLatitude="52,5.1N"/></x:xmpmeta>');
    const facts = await readFacts(fileOf(await jpegWith([bytes([0xff, 0xe1, (xmp.length + 2) >> 8, (xmp.length + 2) & 0xff], xmp)]), 'xmp.jpg'));
    expect(facts.location).to.equal(true);
  });

  it('read a PNG\'s size and whether it has an alpha channel from its header', async () => {
    const facts = await readFacts(fileOf(await pngWith([]), 'team-day.png'));
    expect(facts.format).to.equal('png');
    expect(facts.width).to.equal(8);
    expect(facts.height).to.equal(4);
    expect(facts.alphaChannel).to.be.a('boolean');
  });

  it('say a PNG with a palette transparency chunk has an alpha channel', async () => {
    const plain = await pngWith([chunk('tRNS', bytes([0]))]);
    expect((await readFacts(fileOf(plain, 'logo.png'))).alphaChannel).to.equal(true);
  });

  it('say a PNG records a location when it carries EXIF with a GPS block', async () => {
    const facts = await readFacts(fileOf(await pngWith([chunk('eXIf', exifBlock({ gps: true }))]), 'map.png'));
    expect(facts.location).to.equal(true);
  });

  it('say an animated PNG is animated', async () => {
    const facts = await readFacts(fileOf(await pngWith([chunk('acTL', bytes([0, 0, 0, 2, 0, 0, 0, 0]))]), 'spinner.png'));
    expect(facts.animated).to.equal(true);
  });

  it('read a WebP\'s size from its VP8X header, and a location from its EXIF chunk after the picture', async () => {
    const exif = riffChunk('EXIF', exifBlock({ gps: true }));
    const facts = await readFacts(fileOf(await webpWith(0x08, [], [exif]), 'unicorn.webp'));
    expect(facts).to.include({ format: 'webp', width: 8, height: 4, location: true, animated: false });
  });

  it('read a plain WebP\'s size from its picture chunk', async () => {
    const facts = await readFacts(fileOf(await encoded(30, 20, 'image/webp'), 'plain.webp'));
    expect(facts).to.include({ format: 'webp', width: 30, height: 20, location: false });
  });

  it('say an animated GIF is animated, and a still one is not', async () => {
    const two = await fetch(new URL('../image-editor/fixtures/two-frames.gif', import.meta.url)).then((r) => r.blob());
    const one = await fetch(new URL('../image-editor/fixtures/one-frame.gif', import.meta.url)).then((r) => r.blob());
    expect((await readFacts(new File([two], 'two.gif'))).animated).to.equal(true);
    const still = await readFacts(new File([one], 'one.gif'));
    expect(still.animated).to.equal(false);
    expect(still.format).to.equal('gif');
    expect(still.width).to.be.greaterThan(0);
  });

  it('go by the bytes, not the name: a PNG named .jpg is a PNG', async () => {
    expect((await readFacts(fileOf(await pngWith([]), 'renamed.jpg'))).format).to.equal('png');
  });

  it('call anything else another kind of file, with no size', async () => {
    const facts = await readFacts(fileOf(bytes('%PDF-1.7 hello'), 'brochure.pdf', 'application/pdf'));
    expect(facts.format).to.equal('other');
    expect(facts.width).to.equal(undefined);
  });

  it('read only the start of a large file, not all of it', async () => {
    const head = await jpegWith([exifSegment({ gps: true })], { width: 64, height: 48 });
    const big = new File([head, new Uint8Array(40 * 1024 * 1024)], 'huge.jpg');
    const started = performance.now();
    const facts = await readFacts(big);
    expect(facts).to.include({ width: 64, height: 48, location: true });
    expect(performance.now() - started).to.be.lessThan(200);
  });
});

describe('a PNG\'s transparency', () => {
  it('is none when every pixel is opaque: a photo, or a screenshot', async () => {
    expect(await isOpaquePng(await pngFrom('none'))).to.equal(true);
  });

  it('is there when one pixel is transparent', async () => {
    expect(await isOpaquePng(await pngFrom('corner'))).to.equal(false);
  });

  it('is there when every pixel is very nearly opaque but not quite', async () => {
    expect(await isOpaquePng(await pngFrom('faint'))).to.equal(false);
  });

  it('is there for a file that cannot be decoded, so a broken file is never called a photo', async () => {
    expect(await isOpaquePng(new File([bytes([0x89, 'P'.charCodeAt(0)])], 'broken.png'))).to.equal(false);
  });
});
