import { expect } from '@open-wc/testing';
import { FOLDER_TREE_PAGE, foldersIn, foldersOf, hasFolder, readAll } from './folder-tree.js';
import type { UmbraDesktopTreePage } from './folder-tree.js';

/** The folders-only tree's rules (design §17), on a stand-in server. */

interface Item {
  unique: string;
  hasChildren: boolean;
  mediaType: { collection: { unique: string } | null };
}

const folder = (unique: string, hasChildren = false): Item => ({ unique, hasChildren, mediaType: { collection: { unique: 'list' } } });
const image = (unique: string): Item => ({ unique, hasChildren: false, mediaType: { collection: null } });
const images = (count: number) => Array.from({ length: count }, (_, i) => image(`i${i}`));

/**
 * A server that pages a list, recording each page asked for.
 * @param items Everything under the parent.
 * @returns The page reader and its record.
 */
function server(items: Item[]) {
  const asked: Array<[number, number]> = [];
  const page: UmbraDesktopTreePage<Item> = async (skip, take) => {
    asked.push([skip, take]);
    return { items: items.slice(skip, skip + take), total: items.length };
  };
  return { page, asked };
}

/**
 * The search index's answer for the folders under the same parent, recording each page asked for.
 * @param items Everything under the parent.
 * @param fails Whether the index does not answer.
 * @returns The search and its record.
 */
function index(items: Item[], fails = false) {
  const asked: Array<[number, number]> = [];
  const folders = items.filter((item) => item.mediaType.collection);
  const search: UmbraDesktopTreePage<Item> = async (skip, take) => {
    asked.push([skip, take]);
    return fails ? undefined : { items: folders.slice(skip, skip + take), total: folders.length };
  };
  return { search, asked };
}

describe('reading a folder’s children whole', () => {
  it('reads page after page until it has them all', async () => {
    const items = images(FOLDER_TREE_PAGE * 2 + 3);
    const { page, asked } = server(items);
    const read = await readAll(page);
    expect(read?.length).to.equal(items.length);
    expect(asked).to.deep.equal([
      [0, FOLDER_TREE_PAGE],
      [FOLDER_TREE_PAGE, FOLDER_TREE_PAGE],
      [FOLDER_TREE_PAGE * 2, FOLDER_TREE_PAGE],
    ]);
  });

  it('gives up when the server does not answer', async () => {
    expect(await readAll<Item>(async () => undefined)).to.equal(undefined);
  });
});

describe('the folders in a parent', () => {
  it('reads a parent that fits in one page directly, and never asks the index', async () => {
    const { page, asked } = server([folder('a'), image('x'), folder('b')]);
    const { search, asked: searched } = index([]);
    const read = await foldersIn(page, search);
    expect(read?.map((each) => each.unique)).to.deep.equal(['a', 'b']);
    expect([asked.length, searched.length]).to.deep.equal([1, 0]);
  });

  it('reads the first page of a bigger parent directly and asks the index for the folders after it', async () => {
    const items = [folder('a'), ...images(FOLDER_TREE_PAGE * 3), folder('late')];
    const { page, asked } = server(items);
    const { search, asked: searched } = index(items);
    const read = await foldersIn(page, search);
    expect(read?.map((each) => each.unique), 'each once, the first page’s first').to.deep.equal(['a', 'late']);
    expect(asked.length, 'one direct page, however big the parent').to.equal(1);
    expect(searched.length).to.equal(1);
  });

  it('reads a bigger parent whole when the index does not answer', async () => {
    const items = [...images(FOLDER_TREE_PAGE + 1), folder('late')];
    const { page } = server(items);
    const { search } = index(items, true);
    expect((await foldersIn(page, search))?.map((each) => each.unique)).to.deep.equal(['late']);
  });
});

describe('whether a folder has a folder inside', () => {
  it('reads one page directly, and says yes at a folder in it', async () => {
    const items = [image('a'), folder('b'), ...images(FOLDER_TREE_PAGE * 3)];
    const { page, asked } = server(items);
    const { search, asked: searched } = index(items);
    expect(await hasFolder(page, search)).to.equal(true);
    expect([asked.length, searched.length]).to.deep.equal([1, 0]);
  });

  it('says no for a folder that fits in a page with no folder in it, without the index', async () => {
    const { page } = server(images(3));
    const { search, asked: searched } = index([]);
    expect(await hasFolder(page, search)).to.equal(false);
    expect(searched.length).to.equal(0);
  });

  it('asks the index about a folder bigger than a page, once, whatever its size', async () => {
    for (const late of [true, false]) {
      const items = [...images(FOLDER_TREE_PAGE * 5), ...(late ? [folder('late')] : [])];
      const { page, asked } = server(items);
      const { search, asked: searched } = index(items);
      expect(await hasFolder(page, search), `a folder at the end: ${late}`).to.equal(late);
      expect([asked.length, searched], `${late}`).to.deep.equal([1, [[0, 1]]]);
    }
  });

  it('reads on directly when the index does not answer', async () => {
    const items = [...images(FOLDER_TREE_PAGE + 1), folder('late')];
    const { page } = server(items);
    const { search } = index(items, true);
    expect(await hasFolder(page, search)).to.equal(true);
  });
});

describe('the folders a tree shows', () => {
  it('keeps the folders, in the server’s order, and gives each an arrow only when a folder is inside', async () => {
    const children = [folder('photos', true), image('logo'), folder('empty'), folder('only-images', true), folder('archive', true)];
    const inside: Record<string, boolean> = { photos: true, 'only-images': false, archive: true };
    const probed: string[] = [];
    const shown = await foldersOf(children, async (unique) => {
      probed.push(unique);
      return inside[unique];
    });
    expect(shown.map((each) => [each.unique, each.hasChildren])).to.deep.equal([
      ['photos', true],
      ['empty', false],
      ['only-images', false],
      ['archive', true],
    ]);
    expect(probed, 'a folder the server says is empty is not asked about').to.have.members(['photos', 'only-images', 'archive']);
  });
});
