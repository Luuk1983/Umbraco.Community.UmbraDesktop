import { expect } from '@open-wc/testing';
import { sizeWarning } from './size-warning.js';
import { normaliseOptions } from './options.js';

/**
 * The warning before a run that will make files larger (design §16, mock R3 and R5C). The settings
 * know each file's format before the run, so the warning comes before the button, not after the run.
 */
describe('sizeWarning', () => {
  const photos = ['jpeg', 'jpeg', 'webp', 'png'] as const;

  it('warns that JPEG and WebP photos converted to PNG will get much larger, counting them', () => {
    expect(sizeWarning(normaliseOptions({ format: 'png' }), [...photos])).to.deep.equal({ kind: 'png', count: 3 });
    expect(sizeWarning(normaliseOptions({ format: 'png', resize: { maxWidth: 2560 } }), [...photos]), 'resizing does not save it').to.deep.equal({ kind: 'png', count: 3 });
  });

  it('warns that quality 95 or more can make JPEG and WebP files larger', () => {
    expect(sizeWarning(normaliseOptions({ format: 'webp', quality: 95 }), [...photos])).to.deep.equal({ kind: 'quality', count: 3 });
    expect(sizeWarning(normaliseOptions({ format: 'webp', quality: 94 }), [...photos])).to.equal(null);
  });

  it('warns that WebP files converted to JPEG may get larger', () => {
    expect(sizeWarning(normaliseOptions({ format: 'jpeg' }), [...photos])).to.deep.equal({ kind: 'jpeg-from-webp', count: 1 });
  });

  it('says one thing at a time, the surest first', () => {
    expect(sizeWarning(normaliseOptions({ format: 'jpeg', quality: 98 }), [...photos])).to.deep.equal({ kind: 'quality', count: 3 });
  });

  it('says nothing when the files can only shrink', () => {
    expect(sizeWarning(normaliseOptions({ format: 'webp', quality: 80 }), [...photos]), 'WebP at 80').to.equal(null);
    expect(sizeWarning(normaliseOptions({ format: 'png' }), ['png', 'gif', 'bmp']), 'PNG from lossless files').to.equal(null);
    expect(sizeWarning(normaliseOptions({ resize: { maxWidth: 2560 } }), [...photos]), 'Keep').to.equal(null);
    expect(sizeWarning(normaliseOptions({ removeMetadata: true }), [...photos]), 'metadata only').to.equal(null);
  });
});
