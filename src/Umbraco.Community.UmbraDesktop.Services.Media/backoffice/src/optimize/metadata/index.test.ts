import { expect } from '@open-wc/testing';
import { stripMetadata } from './index.js';
import { bytes, chunk, exifSegment, jpegWith, pngWith } from './fixtures.test-helper.js';

/** One way in for every format (design §6.3): GIF and BMP have no metadata to remove. */
describe('stripMetadata', () => {
  it('strips each format with its own walker', async () => {
    expect(stripMetadata(await jpegWith([exifSegment({ gps: true })]), 'jpeg').removed).to.equal(true);
    expect(stripMetadata(await pngWith([chunk('tEXt', bytes('a', [0], 'b'))]), 'png').removed).to.equal(true);
  });

  it('leaves a GIF and a BMP as they are', () => {
    const gif = bytes('GIF89a');
    expect(stripMetadata(gif, 'gif')).to.deep.equal({ bytes: gif, removed: false });
    const bmp = bytes('BM');
    expect(stripMetadata(bmp, 'bmp')).to.deep.equal({ bytes: bmp, removed: false });
  });
});
