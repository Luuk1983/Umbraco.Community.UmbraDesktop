import { expect } from '@open-wc/testing';
import { triage, windowTitle } from './triage.js';
import type { ItemFacts } from './triage.js';

/** What every item is, unless a test says otherwise: an image in the Products folder. */
const IMAGE: ItemFacts = { unique: 'banjo', name: 'Banjo', parent: 'products', isTrashed: false, mediaType: 'image', extension: 'jpg', hasUrl: true };

/** The folder media types. */
const FOLDERS = new Set(['folder']);

/**
 * What an item gets before it is opened (design §6.1): the rows of the table that the item's name,
 * type and file extension decide, so the settings page and the report count the same things.
 */
describe('triage', () => {
  it('lets an image through, its extension in any case', () => {
    expect(triage(IMAGE, FOLDERS)).to.equal(null);
    expect(triage({ ...IMAGE, extension: 'JPG' }, FOLDERS)).to.equal(null);
    for (const extension of ['jpeg', 'png', 'webp', 'gif', 'bmp']) expect(triage({ ...IMAGE, extension }, FOLDERS), extension).to.equal(null);
  });

  it('skips a folder, whatever else it is', () => {
    expect(triage({ ...IMAGE, mediaType: 'folder', hasUrl: false, extension: undefined }, FOLDERS)).to.equal('folder');
  });

  it('skips an item in the recycle bin', () => {
    expect(triage({ ...IMAGE, isTrashed: true }, FOLDERS)).to.equal('trashed');
  });

  it('skips an item without a file', () => {
    expect(triage({ ...IMAGE, hasUrl: false, extension: undefined }, FOLDERS)).to.equal('no-file');
  });

  it('skips a file that is not an image, and a vector image', () => {
    expect(triage({ ...IMAGE, extension: 'pdf' }, FOLDERS)).to.equal('not-an-image');
    expect(triage({ ...IMAGE, extension: 'svg' }, FOLDERS)).to.equal('vector');
  });

  it('skips an item the media library did not return', () => {
    expect(triage(undefined, FOLDERS)).to.equal('missing');
  });
});

/** The two ways a title is written, as the dictionary has them. */
const WORDS = {
  titled: (name: string, count: number) => `Optimize images: ${name} (${count})`,
  mixed: (count: number) => `Optimize images (${count} images)`,
};

/** A window's title names what is in it (D3), so two runs can be told apart on the taskbar. */
describe('windowTitle', () => {
  it("names the folder when the images are all in one", () => {
    expect(windowTitle(WORDS, [{ parent: 'products' }, { parent: 'products' }], 'Products')).to.equal('Optimize images: Products (2)');
  });

  it('counts them when they come from more than one folder', () => {
    expect(windowTitle(WORDS, [{ parent: 'products' }, { parent: 'people' }], 'Products')).to.equal('Optimize images (2 images)');
  });

  it('names the media library root by the name it is given', () => {
    expect(windowTitle(WORDS, [{ parent: null }], 'Media')).to.equal('Optimize images: Media (1)');
  });

  it("counts them when the folder's name is not known", () => {
    expect(windowTitle(WORDS, [{ parent: 'products' }], undefined)).to.equal('Optimize images (1 images)');
  });

  it("uses a caller's title instead of the folder", () => {
    expect(windowTitle(WORDS, [{ parent: 'products' }, { parent: 'people' }], 'Products', 'Product shots')).to.equal('Optimize images: Product shots (2)');
  });
});
