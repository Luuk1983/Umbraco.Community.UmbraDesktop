import { expect } from '@open-wc/testing';
import { UmbraDesktopMediaTypes } from './media-types.js';

/** Each media type's insert options, read once, and the types that make places (#158, design §19). */

/**
 * A server's Structure settings: what each type allows under it, '' for the root, recording each read.
 * @param allows What each type allows.
 * @param failing A type the server does not answer for, once.
 * @returns The reader and its record.
 */
function structure(allows: Record<string, string[]>, failing?: string) {
  const asked: Array<string | null> = [];
  let failed = false;
  const read = async (type: string | null) => {
    asked.push(type);
    if (type === failing && !failed) {
      failed = true;
      return undefined;
    }
    return allows[type ?? ''] ?? [];
  };
  return { read, asked };
}

describe('a media type’s insert options', () => {
  it('are read once per type, however often they are asked for, at once or later', async () => {
    const types = new UmbraDesktopMediaTypes();
    const { read, asked } = structure({ image: ['image'] });
    const [first, second] = await Promise.all([types.allowedChildren('image', read), types.allowedChildren('image', read)]);
    await types.allowedChildren('image', read);
    expect([...first!]).to.deep.equal(['image']);
    expect(second).to.equal(first);
    expect(asked).to.deep.equal(['image']);
  });

  it('are read again after the server did not answer, rather than kept as nothing', async () => {
    const types = new UmbraDesktopMediaTypes();
    const { read, asked } = structure({ folder: ['image'] }, 'folder');
    expect(await types.allowedChildren('folder', read)).to.equal(undefined);
    expect([...(await types.allowedChildren('folder', read))!]).to.deep.equal(['image']);
    expect(asked).to.deep.equal(['folder', 'folder']);
  });

  it('say whether a type holds items, once read, and nothing before', async () => {
    const types = new UmbraDesktopMediaTypes();
    const { read } = structure({ folder: ['image'] });
    expect(types.holdsItems('folder')).to.equal(undefined);
    await types.allowedChildren('folder', read);
    await types.allowedChildren('image', read);
    expect(types.holdsItems('folder')).to.equal(true);
    expect(types.holdsItems('image')).to.equal(false);
  });
});

describe('the types that make places', () => {
  it('are every type that may hold items, found from the root down, and what Umbraco calls folders', async () => {
    const types = new UmbraDesktopMediaTypes();
    const { read } = structure({ '': ['folder', 'image', 'file'], folder: ['folder', 'image', 'banjo'], banjo: ['tattoo'], image: [] });
    const places = await types.placeTypes(read, async () => ['folder', 'gallery']);
    expect(places).to.have.members(['folder', 'banjo', 'gallery']);
  });

  it('are worked out once, and again after a read failed', async () => {
    const types = new UmbraDesktopMediaTypes();
    const { read, asked } = structure({ '': ['folder'], folder: ['image'] }, 'image');
    expect(await types.placeTypes(read, async () => [])).to.equal(undefined);
    expect(await types.placeTypes(read, async () => [])).to.deep.equal(['folder']);
    const reads = asked.length;
    await types.placeTypes(read, async () => []);
    expect(asked.length).to.equal(reads);
  });
});
