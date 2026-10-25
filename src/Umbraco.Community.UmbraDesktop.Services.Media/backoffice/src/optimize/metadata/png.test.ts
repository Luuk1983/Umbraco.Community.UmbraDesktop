import { expect } from '@open-wc/testing';
import { crc32, stripPng } from './png.js';
import { readOrientation } from './exif.js';
import { bytes, chunk, exifBlock, pngChunks, pngWith, referenceCrc } from './fixtures.test-helper.js';

/**
 * Removing a PNG's metadata without encoding it again (design §6.3): its EXIF, text and time chunks
 * go; the colour chunks and every critical chunk stay, in order, with right checksums.
 */
describe('stripPng', () => {
  it('computes the checksum PNG uses', () => {
    const data = bytes('IEND');
    expect(crc32(data)).to.equal(referenceCrc(data));
    expect(crc32(data)).to.equal(0xae426082);
  });

  it('removes EXIF, text and the time it was saved', async () => {
    const file = await pngWith([
      chunk('tEXt', bytes('Author', [0], 'Luuk')),
      chunk('zTXt', bytes('Comment', [0, 0], [0x78, 0x9c, 3, 0, 0, 0, 0, 1])),
      chunk('iTXt', bytes('XML:com.adobe.xmp', [0, 0, 0, 0, 0], '<x/>')),
      chunk('tIME', bytes([7, 234, 10, 20, 12, 0, 0])),
      chunk('eXIf', exifBlock({ gps: true, make: 'Pixel' })),
    ]);
    const { bytes: out, removed } = stripPng(file);
    expect(removed).to.equal(true);
    expect(pngChunks(out).map((c) => c.type)).to.deep.equal(pngChunks(await pngWith([])).map((c) => c.type));
  });

  it('keeps the colour chunks and the physical size, in order, with right checksums', async () => {
    const kept = ['iCCP', 'sRGB', 'gAMA', 'cHRM', 'pHYs'];
    const file = await pngWith([
      chunk('iCCP', bytes('icc', [0, 0], [0x78, 0x9c, 3, 0, 0, 0, 0, 1])),
      chunk('tEXt', bytes('Software', [0], 'Photoshop')),
      chunk('sRGB', bytes([0])),
      chunk('gAMA', bytes([0, 0, 0xb1, 0x8f])),
      chunk('cHRM', new Uint8Array(32)),
      chunk('pHYs', bytes([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])),
    ]);
    const { bytes: out } = stripPng(file);
    const chunks = pngChunks(out);
    const [header, ...picture] = pngChunks(await pngWith([])).map((c) => c.type);
    expect(chunks.map((c) => c.type)).to.deep.equal([header, ...kept, ...picture]);
    expect(chunks.every((c) => c.crcOk), 'every checksum right').to.equal(true);
  });

  it('keeps a sideways picture sideways-stored and upright, with only its orientation', async () => {
    const file = await pngWith([chunk('eXIf', exifBlock({ orientation: 6, gps: true }))]);
    const { bytes: out, removed } = stripPng(file);
    expect(removed).to.equal(true);
    const exif = pngChunks(out).find((c) => c.type === 'eXIf')!;
    expect(readOrientation(exif.data)).to.equal(6);
    expect(exif.data.length).to.equal(26);
    expect(exif.crcOk).to.equal(true);
  });

  it('returns a file with nothing worth removing as it is', async () => {
    const plain = await pngWith([chunk('pHYs', bytes([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]))]);
    expect(stripPng(plain)).to.deep.equal({ bytes: plain, removed: false });
    const upright = await pngWith([chunk('eXIf', exifBlock({ orientation: 6 }))]);
    expect(stripPng(upright).bytes).to.equal(upright);
  });

  it('leaves a file that is not a PNG, or ends early, untouched', async () => {
    const other = bytes('GIF89a');
    expect(stripPng(other)).to.deep.equal({ bytes: other, removed: false });
    const file = await pngWith([chunk('tEXt', bytes('a', [0], 'b'))]);
    const cut = file.subarray(0, 40);
    expect(stripPng(cut)).to.deep.equal({ bytes: cut, removed: false });
  });
});
