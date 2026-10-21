import { expect } from '@open-wc/testing';
import { isOrientationOnly, orientationTiff, readOrientation } from './exif.js';
import { bytes, exifBlock } from './fixtures.test-helper.js';

/**
 * The one EXIF tag a stripped file keeps (design §6.3, Orientation): read in either byte order, and
 * written back on its own so a phone photo stays upright after everything else went.
 */
describe('EXIF orientation', () => {
  it('reads the orientation in Intel and Motorola byte order', () => {
    expect(readOrientation(exifBlock({ orientation: 6, gps: true }))).to.equal(6);
    expect(readOrientation(exifBlock({ orientation: 8, make: 'Canon', bigEndian: true }))).to.equal(8);
  });

  it('reads 1 when there is no orientation, or the block is not one', () => {
    expect(readOrientation(exifBlock({ make: 'Canon' }))).to.equal(1);
    expect(readOrientation(bytes('nonsense'))).to.equal(1);
    expect(readOrientation(new Uint8Array(0))).to.equal(1);
  });

  it('writes a block with the orientation alone, which reads back', () => {
    const block = orientationTiff(6);
    expect(readOrientation(block)).to.equal(6);
    expect(isOrientationOnly(block)).to.equal(true);
  });

  it('tells a block with only the orientation from one with more', () => {
    expect(isOrientationOnly(exifBlock({ orientation: 6 }))).to.equal(true);
    expect(isOrientationOnly(exifBlock({ orientation: 6, gps: true }))).to.equal(false);
    expect(isOrientationOnly(exifBlock({ orientation: 6, make: 'Pixel' }))).to.equal(false);
    expect(isOrientationOnly(bytes('nonsense'))).to.equal(false);
  });
});
