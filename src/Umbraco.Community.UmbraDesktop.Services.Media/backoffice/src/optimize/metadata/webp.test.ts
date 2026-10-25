import { expect } from '@open-wc/testing';
import { stripWebp } from './webp.js';
import { readOrientation } from './exif.js';
import { bytes, encoded, exifBlock, riffChunk, webpChunks, webpWith } from './fixtures.test-helper.js';

/** The `VP8X` flags for a colour profile, EXIF and XMP. */
const ICC = 0x20;
const EXIF = 0x08;
const XMP = 0x04;

/**
 * Removing a WebP's metadata without encoding it again (design §6.3): its EXIF and XMP chunks go,
 * their flags are cleared and the RIFF size is fixed; the colour profile and the picture stay.
 */
describe('stripWebp', () => {
  it('removes EXIF and XMP, clears their flags and fixes the size, and still decodes', async () => {
    const file = await webpWith(EXIF | XMP, [], [riffChunk('EXIF', exifBlock({ gps: true, make: 'Pixel' })), riffChunk('XMP ', bytes('<x:xmpmeta/>'))]);
    const { bytes: out, removed } = stripWebp(file);
    expect(removed).to.equal(true);
    const types = webpChunks(out).map((c) => c.type);
    expect(types).to.not.include('EXIF');
    expect(types).to.not.include('XMP ');
    expect(out[20] & (EXIF | XMP), 'flags cleared').to.equal(0);
    expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true), 'RIFF size').to.equal(out.length - 8);
    const picture = await createImageBitmap(new Blob([out], { type: 'image/webp' }));
    expect([picture.width, picture.height]).to.deep.equal([8, 4]);
  });

  it('keeps the colour profile and its flag', async () => {
    const file = await webpWith(EXIF, [], [riffChunk('EXIF', exifBlock({ gps: true }))]);
    expect(webpChunks(file).map((c) => c.type)[1], "the canvas's own profile").to.equal('ICCP');
    const { bytes: out } = stripWebp(file);
    expect(webpChunks(out).map((c) => c.type)[1]).to.equal('ICCP');
    expect(out[20] & ICC).to.equal(ICC);
  });

  it('keeps the orientation alone, and its flag', async () => {
    const file = await webpWith(EXIF, [], [riffChunk('EXIF', bytes('Exif', [0, 0], exifBlock({ orientation: 6, gps: true })))]);
    const { bytes: out, removed } = stripWebp(file);
    expect(removed).to.equal(true);
    const exif = webpChunks(out).find((c) => c.type === 'EXIF')!;
    expect(readOrientation(exif.data)).to.equal(6);
    expect(exif.data.length).to.equal(26);
    expect(out[20] & EXIF).to.equal(EXIF);
  });

  it('returns a file with nothing worth removing as it is', async () => {
    const canvas = await encoded(8, 4, 'image/webp', 0.8);
    expect(stripWebp(canvas), "a canvas's WebP, with its profile only").to.deep.equal({ bytes: canvas, removed: false });
    const simple = bytes('RIFF', [12, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0]);
    expect(stripWebp(simple), 'a simple WebP').to.deep.equal({ bytes: simple, removed: false });
    const upright = await webpWith(EXIF, [], [riffChunk('EXIF', exifBlock({ orientation: 6 }))]);
    expect(stripWebp(upright).bytes).to.equal(upright);
  });

  it('leaves a file that is not a WebP untouched', () => {
    const other = bytes('RIFF', [4, 0, 0, 0], 'WAVE');
    expect(stripWebp(other)).to.deep.equal({ bytes: other, removed: false });
  });
});
