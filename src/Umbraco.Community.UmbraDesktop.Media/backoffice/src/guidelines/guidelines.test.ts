import { expect } from '@open-wc/testing';
import { DEFAULT_GUIDELINES, anyOn, fromServer, toServer } from './guidelines.js';

/** The site's media guidelines, as the browser holds them and as the server sends them (#179). */

describe('media guidelines', () => {
  it('default to every guideline on: 2560 px, PNG photos to WebP at 80, the rest kept', () => {
    expect(DEFAULT_GUIDELINES.maxSize).to.deep.equal({ on: true, longestSide: 2560 });
    expect(DEFAULT_GUIDELINES.formats.on).to.equal(true);
    expect(DEFAULT_GUIDELINES.formats.quality).to.equal(80);
    expect(DEFAULT_GUIDELINES.formats.rows).to.deep.equal({ jpeg: 'keep', 'png-photo': 'webp', 'png-transparent': 'keep', webp: 'keep', gif: 'keep' });
    expect(DEFAULT_GUIDELINES.location.on).to.equal(true);
  });

  it('read the server\'s shape, formats by name', () => {
    const read = fromServer({
      maxSize: { on: false, longestSide: 1920 },
      formats: { on: true, quality: 70, jpeg: 'Webp', pngPhoto: 'Jpeg', pngTransparent: 'Keep', webp: 'Keep', gif: 'Png' },
      location: { on: false },
    });
    expect(read).to.deep.equal({
      maxSize: { on: false, longestSide: 1920 },
      formats: { on: true, quality: 70, rows: { jpeg: 'webp', 'png-photo': 'jpeg', 'png-transparent': 'keep', webp: 'keep', gif: 'png' } },
      location: { on: false },
    });
  });

  it('write the server\'s shape back, so a read of a write is what was written', () => {
    const changed = { ...DEFAULT_GUIDELINES, formats: { ...DEFAULT_GUIDELINES.formats, rows: { ...DEFAULT_GUIDELINES.formats.rows, gif: 'webp' as const } } };
    expect(toServer(changed).formats.gif).to.equal('Webp');
    expect(fromServer(toServer(changed))).to.deep.equal(changed);
  });

  it('read anything unusable as that field\'s default, so one bad field never costs the rest', () => {
    const read = fromServer({ maxSize: { on: 'yes', longestSide: -3 }, formats: { quality: 500, jpeg: 'Avif' }, location: null });
    expect(read).to.deep.equal(DEFAULT_GUIDELINES);
    expect(fromServer(undefined)).to.deep.equal(DEFAULT_GUIDELINES);
  });

  it('say whether anything is checked at all', () => {
    expect(anyOn(DEFAULT_GUIDELINES)).to.equal(true);
    const off = { maxSize: { ...DEFAULT_GUIDELINES.maxSize, on: false }, formats: { ...DEFAULT_GUIDELINES.formats, on: false }, location: { on: false } };
    expect(anyOn(off)).to.equal(false);
  });
});
