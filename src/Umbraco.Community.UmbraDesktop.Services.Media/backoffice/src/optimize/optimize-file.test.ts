import { expect } from '@open-wc/testing';
import { optimizeFile, planFor } from './optimize-file.js';
import { normaliseOptions } from './options.js';
import { decodePicture } from './picture.js';
import { bytes, encoded, exifSegment, jpegWith, scanStart } from './metadata/fixtures.test-helper.js';
import type { ImageFacts } from './types.js';

/**
 * One file in, one file out (design §6.2 and §8.1): what is done to it is decided from what it is and
 * what was asked, and nothing is done when nothing would change.
 */

/** A photo larger than the box, as a camera writes one. */
const LARGE: ImageFacts = { width: 6000, height: 4000, size: 8_400_000, format: 'jpeg' };

/** An image already inside the box. */
const SMALL: ImageFacts = { width: 1800, height: 1200, size: 140_000, format: 'webp' };

/** The designed defaults: 2560 × 2560, WebP at 80. */
const DEFAULTS = normaliseOptions({ resize: { maxWidth: 2560, maxHeight: 2560 }, format: 'webp', quality: 80 });

/**
 * A 24-bit BMP, which a canvas reads and cannot write back.
 * @param width Its width.
 * @param height Its height.
 * @returns The file.
 */
function bmp(width: number, height: number): File {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(bytes('BM'));
  view.setUint32(2, size, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  out.fill(0x80, 54);
  return new File([out], 'scan.bmp', { type: 'image/bmp' });
}

describe('planFor', () => {
  it('leaves an image inside the box, in its own format, with metadata kept, alone', () => {
    expect(planFor(SMALL, 'webp', normaliseOptions({ resize: { maxWidth: 2560 } }), false)).to.deep.equal({ kind: 'unchanged', reason: 'fits' });
  });

  it('leaves an image with no metadata alone when only metadata was asked for', () => {
    expect(planFor(SMALL, 'webp', normaliseOptions({ removeMetadata: true }), false)).to.deep.equal({ kind: 'unchanged', reason: 'no-metadata' });
  });

  it('does nothing with every option off', () => {
    expect(planFor(LARGE, 'jpg', normaliseOptions({}), true)).to.deep.equal({ kind: 'unchanged', reason: 'nothing-asked' });
  });

  it('strips an image inside the box rather than encoding it, when it has metadata', () => {
    expect(planFor(SMALL, 'webp', normaliseOptions({ resize: { maxWidth: 2560 } }), true)).to.deep.equal({ kind: 'strip' });
    expect(planFor(SMALL, 'webp', DEFAULTS, true), 'WebP chosen for a WebP').to.deep.equal({ kind: 'strip' });
  });

  it('encodes a large image at the fitted size, in the format asked', () => {
    expect(planFor(LARGE, 'jpg', DEFAULTS, true)).to.deep.equal({ kind: 'encode', size: { width: 2560, height: 1707 }, format: 'webp' });
  });

  it('keeps a JPEG a JPEG, and writes a GIF or BMP as PNG, when resizing on Keep', () => {
    const keep = normaliseOptions({ resize: { maxWidth: 100 } });
    expect(planFor(LARGE, 'jpg', keep, false)).to.deep.include({ kind: 'encode', format: 'jpeg' });
    expect(planFor({ ...LARGE, format: 'gif' }, 'gif', keep, false)).to.deep.include({ kind: 'encode', format: 'png' });
  });

  it('converts an image inside the box when another format is asked for', () => {
    expect(planFor(SMALL, 'webp', normaliseOptions({ format: 'jpeg' }), false)).to.deep.equal({ kind: 'encode', size: { width: 1800, height: 1200 }, format: 'jpeg' });
  });
});

describe('optimizeFile', () => {
  it('turns a large JPEG into a smaller WebP at the new size', async () => {
    const file = new File([await encoded(3000, 2000, 'image/jpeg', 0.95)], 'banjo.jpg', { type: 'image/jpeg' });
    const result = await optimizeFile(file, { resize: { maxWidth: 1200, maxHeight: 1200 }, format: 'webp', quality: 80 });
    if (result.status !== 'optimized') throw new Error(`expected optimized, got ${JSON.stringify(result)}`);
    expect(result.before).to.deep.equal({ width: 3000, height: 2000, size: file.size, format: 'jpeg' });
    expect(result.after).to.deep.include({ width: 1200, height: 800, format: 'webp' });
    expect(result.after.size).to.be.below(result.before.size);
    expect(result.file.name).to.equal('banjo.webp');
    expect(result.file.type).to.equal('image/webp');
    const picture = await decodePicture(result.file);
    expect([picture.width, picture.height]).to.deep.equal([1200, 800]);
  });

  it('writes Keep on a BMP as PNG', async () => {
    const result = await optimizeFile(bmp(4, 4), { resize: { maxWidth: 2 } });
    if (result.status !== 'optimized') throw new Error(`expected optimized, got ${JSON.stringify(result)}`);
    expect(result.after).to.deep.include({ width: 2, height: 2, format: 'png' });
    expect(result.file.name).to.equal('scan.png');
  });

  /** Review Focus 1, end to end: metadata gone, the picture's bytes and its upright size kept. */
  it('strips a phone photo without encoding it', async () => {
    const original = await jpegWith([exifSegment({ orientation: 6, gps: true, make: 'Pixel' })]);
    const file = new File([original], 'IMG_0042.jpg', { type: 'image/jpeg' });
    const result = await optimizeFile(file, { removeMetadata: true });
    if (result.status !== 'optimized') throw new Error(`expected optimized, got ${JSON.stringify(result)}`);
    expect(result.before).to.deep.include({ width: 20, height: 40 });
    expect(result.after).to.deep.include({ width: 20, height: 40, format: 'jpeg' });
    expect(result.file.name).to.equal('IMG_0042.jpg');
    const out = new Uint8Array(await result.file.arrayBuffer());
    expect(Array.from(out.subarray(scanStart(out)))).to.deep.equal(Array.from(original.subarray(scanStart(original))));
  });

  it('reports an image with nothing to do as unchanged, with its facts', async () => {
    const file = new File([await encoded(40, 20, 'image/png')], 'logo.png', { type: 'image/png' });
    expect(await optimizeFile(file, { resize: { maxWidth: 2560 } })).to.deep.equal({
      status: 'unchanged',
      reason: 'fits',
      before: { width: 40, height: 20, size: file.size, format: 'png' },
    });
  });

  it('skips SVG, PDF and an animated GIF with their reasons', async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' });
    const pdf = new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' });
    const gif = new File([await (await fetch(new URL('./fixtures/two-frames.gif', import.meta.url))).blob()], 'spinner.gif');
    expect(await optimizeFile(svg, { removeMetadata: true })).to.deep.equal({ status: 'skipped', reason: 'vector' });
    expect(await optimizeFile(pdf, { removeMetadata: true })).to.deep.equal({ status: 'skipped', reason: 'not-an-image' });
    expect(await optimizeFile(gif, { format: 'png' })).to.deep.equal({ status: 'skipped', reason: 'animated' });
  });

  it('keeps only the first frame of an animated GIF when asked to (D13)', async () => {
    const gif = new File([await (await fetch(new URL('./fixtures/two-frames.gif', import.meta.url))).blob()], 'spinner.gif');
    const result = await optimizeFile(gif, { format: 'png', animated: 'first-frame' });
    expect(result.status).to.equal('optimized');
    if (result.status === 'optimized') expect(result.file.name).to.equal('spinner.png');
  });

  it("fails, with the browser's words, on a file that will not decode", async () => {
    const broken = new File([bytes('not a picture at all')], 'broken.jpg', { type: 'image/jpeg' });
    const result = await optimizeFile(broken, { format: 'webp' });
    expect(result.status).to.equal('failed');
    if (result.status === 'failed') expect(result.message).to.be.a('string').and.not.equal('');
  });
});
