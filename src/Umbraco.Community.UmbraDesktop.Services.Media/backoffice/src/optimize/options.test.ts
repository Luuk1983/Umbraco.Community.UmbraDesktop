import { expect } from '@open-wc/testing';
import { OPTIMIZE_DEFAULTS, normaliseOptions, reencodes } from './options.js';

/**
 * What a caller's options mean (design §8.1): absent fields have their documented defaults, numbers
 * are held to what makes sense, and metadata always goes with a resize or a convert (D8).
 */
describe('optimize options', () => {
  it('starts a run on the designed defaults (D11)', () => {
    expect(OPTIMIZE_DEFAULTS).to.deep.equal({
      resize: { maxWidth: 2560, maxHeight: 2560 },
      format: 'webp',
      quality: 80,
      removeMetadata: true,
      animated: 'skip',
      recompress: true,
    });
  });

  it('reads no options as nothing asked: keep, quality 80, no resize, metadata kept, animated skipped', () => {
    expect(normaliseOptions(undefined)).to.deep.equal({
      resize: null,
      format: 'keep',
      quality: 80,
      removeMetadata: false,
      animated: 'skip',
      recompress: false,
    });
  });

  /** Found by the owner, 2026-10-25: Keep at quality 15 left JPEGs unchanged. A quality asked is applied. */
  it('encodes again at a quality that was asked for, also in the file format', () => {
    expect(normaliseOptions({ quality: 15 }).recompress).to.equal(true);
    expect(normaliseOptions({ format: 'keep', quality: 15 }).recompress).to.equal(true);
    expect(normaliseOptions({ format: 'keep' }).recompress).to.equal(false);
    expect(normaliseOptions({ quality: 15, removeMetadata: false }).removeMetadata, 'an encode drops it anyway').to.equal(true);
    expect(reencodes(normaliseOptions({ quality: 15 }))).to.equal(true);
  });

  it('reads options it already decided as they are, so deciding twice asks for nothing more (#179)', () => {
    const once = normaliseOptions({ removeMetadata: true });
    expect(normaliseOptions(once)).to.deep.equal(once);
    const asked = normaliseOptions({ quality: 60 });
    expect(normaliseOptions(asked)).to.deep.equal(asked);
  });

  it('removes metadata whenever the picture is encoded again', () => {
    expect(normaliseOptions({ format: 'webp', removeMetadata: false }).removeMetadata).to.equal(true);
    expect(normaliseOptions({ resize: { maxWidth: 100 }, removeMetadata: false }).removeMetadata).to.equal(true);
    expect(normaliseOptions({ format: 'keep', removeMetadata: false }).removeMetadata).to.equal(false);
  });

  it('holds the quality to 1 to 100, in whole steps', () => {
    expect(normaliseOptions({ quality: 0 }).quality).to.equal(1);
    expect(normaliseOptions({ quality: 150 }).quality).to.equal(100);
    expect(normaliseOptions({ quality: 79.6 }).quality).to.equal(80);
    expect(normaliseOptions({ quality: Number.NaN }).quality).to.equal(80);
  });

  it('reads a resize without a usable limit as no resize', () => {
    expect(normaliseOptions({ resize: {} }).resize).to.equal(null);
    expect(normaliseOptions({ resize: { maxWidth: 0, maxHeight: -5 } }).resize).to.equal(null);
    expect(normaliseOptions({ resize: { maxWidth: 1200.4 } }).resize).to.deep.equal({ maxWidth: 1200 });
  });

  it('knows when the picture is encoded again', () => {
    expect(reencodes(normaliseOptions({ removeMetadata: true }))).to.equal(false);
    expect(reencodes(normaliseOptions({ format: 'jpeg' }))).to.equal(true);
    expect(reencodes(normaliseOptions({ resize: { maxHeight: 10 } }))).to.equal(true);
  });

  it('keeps only the first frame of an animated image when asked to', () => {
    expect(normaliseOptions({ animated: 'first-frame' }).animated).to.equal('first-frame');
    expect(normaliseOptions({ animated: 'nonsense' as never }).animated).to.equal('skip');
  });
});
