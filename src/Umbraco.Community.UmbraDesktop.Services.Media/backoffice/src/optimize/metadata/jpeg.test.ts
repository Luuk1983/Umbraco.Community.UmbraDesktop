import { expect } from '@open-wc/testing';
import { stripJpeg } from './jpeg.js';
import { readOrientation } from './exif.js';
import { bytes, exifOf, exifSegment, jpegWith, scanStart, segment, segmentsOf } from './fixtures.test-helper.js';
import { decodePicture } from '../picture.js';

/**
 * Removing a JPEG's metadata without encoding it again (design §6.3, D8): EXIF, XMP, IPTC and
 * comments go; JFIF, the colour profile and Adobe's segment stay; the picture's bytes are untouched.
 */

/** An XMP packet's APP1, as Lightroom writes one. */
const XMP = segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/', [0], '<x:xmpmeta/>'));

/** An IPTC block's APP13, as Photoshop writes one. */
const IPTC = segment(0xed, bytes('Photoshop 3.0', [0], '8BIM'));

/** A comment. */
const COMMENT = segment(0xfe, bytes('Taken at home'));

/** A JFIF header. */
const JFIF = segment(0xe0, bytes('JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));

/** An ICC profile's APP2, which keeps the colours right. */
const ICC = segment(0xe2, bytes('ICC_PROFILE', [0, 1, 1], 'profile'));

/** Adobe's APP14, which says how the colours are stored. */
const ADOBE = segment(0xee, bytes('Adobe', [0, 100, 0, 0, 0, 0, 1]));

describe('stripJpeg', () => {
  it('removes EXIF with GPS, XMP, IPTC and comments', async () => {
    const file = await jpegWith([exifSegment({ make: 'Pixel', gps: true }), XMP, IPTC, COMMENT]);
    const { bytes: out, removed } = stripJpeg(file);
    expect(removed).to.equal(true);
    const markers = segmentsOf(out);
    expect(markers.filter((m) => m.startsWith('E1:')), 'no APP1').to.deep.equal([]);
    expect(markers.filter((m) => m.startsWith('ED:') || m.startsWith('FE:')), 'no IPTC, no comment').to.deep.equal([]);
  });

  it("keeps JFIF, the ICC profile and Adobe's segment, in order", async () => {
    const file = await jpegWith([JFIF, exifSegment({ gps: true }), ICC, ADOBE]);
    const before = segmentsOf(file).filter((m) => !m.startsWith('E1:'));
    const { bytes: out } = stripJpeg(file);
    expect(segmentsOf(out)).to.deep.equal(before);
  });

  it("leaves the picture's bytes untouched", async () => {
    const file = await jpegWith([exifSegment({ make: 'Pixel', gps: true }), COMMENT]);
    const { bytes: out } = stripJpeg(file);
    expect(Array.from(out.subarray(scanStart(out)))).to.deep.equal(Array.from(file.subarray(scanStart(file))));
  });

  /** Review Focus 1, on the strip path. */
  it('keeps a phone photo upright, with nothing else of its EXIF', async () => {
    const file = await jpegWith([JFIF, exifSegment({ orientation: 6, gps: true, make: 'Pixel' })], { width: 40, height: 20 });
    const before = await decodePicture(new Blob([file]));
    expect([before.width, before.height], 'the fixture is upright as 20 × 40').to.deep.equal([20, 40]);
    const { bytes: out, removed } = stripJpeg(file);
    expect(removed).to.equal(true);
    const exif = exifOf(out)!;
    expect(readOrientation(exif)).to.equal(6);
    expect(exif.length, 'only the orientation tag').to.be.below(40);
    expect(segmentsOf(out)[0], 'JFIF stays first').to.match(/^E0:/);
    const after = await decodePicture(new Blob([out]));
    expect([after.width, after.height]).to.deep.equal([20, 40]);
  });

  it('returns a file with nothing worth removing as it is', async () => {
    const plain = await jpegWith([JFIF]);
    expect(stripJpeg(plain)).to.deep.equal({ bytes: plain, removed: false });
    const upright = await jpegWith([exifSegment({ orientation: 6 })]);
    const result = stripJpeg(upright);
    expect(result.removed, 'an orientation alone is not worth removing').to.equal(false);
    expect(result.bytes).to.equal(upright);
  });

  it('leaves a file that is not a JPEG, or ends early, untouched', async () => {
    const other = bytes('GIF89a');
    expect(stripJpeg(other)).to.deep.equal({ bytes: other, removed: false });
    const file = await jpegWith([exifSegment({ gps: true })]);
    const cut = file.subarray(0, 12);
    expect(stripJpeg(cut)).to.deep.equal({ bytes: cut, removed: false });
  });
});
