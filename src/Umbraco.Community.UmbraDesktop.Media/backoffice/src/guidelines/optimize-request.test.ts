import { expect } from '@open-wc/testing';
import { optimizeRequest } from './optimize-request.js';
import { DEFAULT_GUIDELINES } from './guidelines.js';
import type { MediaGuidelines } from './guidelines.js';
import type { CheckedFile } from './check.js';

/** What the Media Manager hands Optimize images for the ticked files (#179). */

/**
 * A checked file.
 * @param name Its name.
 * @param kind Its row.
 * @param breaks What it breaks.
 * @returns It.
 */
const checked = (name: string, kind: CheckedFile['kind'], breaks: CheckedFile['breaks']): CheckedFile => ({
  file: new File(['x'], name),
  facts: { format: 'jpeg', location: false, animated: false, alphaChannel: false },
  kind,
  breaks,
});

describe('the request to optimize files before upload', () => {
  it('names each file\'s kind and the only fixes it gets: what it breaks', () => {
    const request = optimizeRequest([checked('a.jpg', 'jpeg', ['size', 'location']), checked('b.png', 'png-photo', ['format'])], DEFAULT_GUIDELINES, { name: 'Products' }, 'Set from the media guidelines.', async () => ({ ok: true }));
    expect(request.files.map((each) => [each.file.name, each.kind, each.fix])).to.deep.equal([
      ['a.jpg', 'jpeg', ['size', 'location']],
      ['b.png', 'png-photo', ['format']],
    ]);
    expect(request.destination).to.deep.equal({ name: 'Products' });
    expect(request.note).to.equal('Set from the media guidelines.');
  });

  it('opens the optimizer set from the guidelines: the longest side as a box, the rows, the quality, the location', () => {
    const request = optimizeRequest([checked('a.jpg', 'jpeg', ['size'])], DEFAULT_GUIDELINES, { name: 'Products' }, undefined, async () => ({ ok: true }));
    expect(request.settings).to.deep.equal({
      resize: { maxWidth: 2560, maxHeight: 2560 },
      formats: { jpeg: 'keep', 'png-photo': 'webp', 'png-transparent': 'keep', webp: 'keep', gif: 'keep' },
      quality: 80,
      removeLocation: true,
    });
  });

  it('leaves out what a guideline that is off would fix: no resize, every row kept, the location left', () => {
    const off: MediaGuidelines = { maxSize: { on: false, longestSide: 2560 }, formats: { ...DEFAULT_GUIDELINES.formats, on: false }, location: { on: false } };
    const request = optimizeRequest([checked('a.jpg', 'jpeg', [])], off, { name: 'Products' }, undefined, async () => ({ ok: true }));
    expect(request.settings).to.deep.equal({
      resize: null,
      formats: { jpeg: 'keep', 'png-photo': 'keep', 'png-transparent': 'keep', webp: 'keep', gif: 'keep' },
      quality: 80,
      removeLocation: false,
    });
  });

  it('passes the upload through', async () => {
    const uploaded: string[] = [];
    const request = optimizeRequest([checked('a.jpg', 'jpeg', ['size'])], DEFAULT_GUIDELINES, { name: 'Products' }, undefined, async (file) => (uploaded.push(file.name), { ok: true }));
    expect(await request.upload(new File(['y'], 'a.webp'))).to.deep.equal({ ok: true });
    expect(uploaded).to.deep.equal(['a.webp']);
  });
});
