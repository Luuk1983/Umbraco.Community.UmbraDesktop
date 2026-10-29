import { expect } from '@open-wc/testing';
import { breakdownOf, placesOf } from './health-folders.js';
import type { HealthFolder } from './health.client.js';
import { MB, item } from './health.test-helper.js';

/**
 * Where the space goes, one folder at a time (design §16.15, mock scene 2): the folder's own figures,
 * the folders under it largest first, and the items directly in it.
 */

/** Campaigns with 2023 under it and Summer under that; People beside it. */
const FOLDERS: HealthFolder[] = [
  { key: 'campaigns', name: 'Campaigns', parentKey: null, path: '/Campaigns' },
  { key: '2023', name: '2023', parentKey: 'campaigns', path: '/Campaigns/2023' },
  { key: 'summer', name: 'Summer', parentKey: '2023', path: '/Campaigns/2023/Summer' },
  { key: 'banners', name: 'Banners', parentKey: '2023', path: '/Campaigns/2023/Banners' },
  { key: 'people', name: 'People', parentKey: null, path: '/People' },
];

/** Items in each folder: unused, oversized and fine, one at the root. */
const ITEMS = [
  item({ key: 's1', used: false, sizeBytes: 500, parentKey: 'summer' }),
  item({ key: 's2', sizeBytes: 3 * MB, parentKey: 'summer' }),
  item({ key: 'b1', sizeBytes: 200, parentKey: 'banners' }),
  item({ key: 'y1', used: false, sizeBytes: 50, parentKey: '2023' }),
  item({ key: 'c1', sizeBytes: 10, parentKey: 'campaigns' }),
  item({ key: 'p1', used: false, sizeBytes: null, extension: null, url: null, parentKey: 'people' }),
  item({ key: 'r1', sizeBytes: 7, parentKey: null }),
];

describe('the folder breakdown', () => {
  it('opens on the library: its top-level folders largest first, and the items at the root', () => {
    const at = breakdownOf(ITEMS, FOLDERS, null);
    expect(at.key).to.equal(null);
    expect(at.path).to.deep.equal([]);
    expect(at.bytes).to.equal(500 + 3 * MB + 200 + 50 + 10 + 7);
    expect(at.count).to.equal(7);
    expect(at.children.map((each) => each.key)).to.deep.equal(['campaigns', 'people']);
    expect(at.direct).to.deep.include({ count: 1, bytes: 7 });
  });

  it('sums a folder with everything under it, split by health, with counts of what can go', () => {
    const at = breakdownOf(ITEMS, FOLDERS, '2023');
    expect(at.name).to.equal('2023');
    expect(at.path.map((each) => each.key)).to.deep.equal(['campaigns', '2023']);
    expect(at).to.deep.include({ bytes: 500 + 3 * MB + 200 + 50, count: 4, unused: 550, oversized: 3 * MB, unusedCount: 2, oversizedCount: 1 });
    expect(at.fine).to.equal(200);
    expect(at.children.map((each) => [each.key, each.bytes, each.unusedCount, each.oversizedCount])).to.deep.equal([
      ['summer', 500 + 3 * MB, 1, 1],
      ['banners', 200, 0, 0],
    ]);
    expect(at.direct).to.deep.include({ count: 1, bytes: 50, unusedCount: 1 });
  });

  it('says whether a folder under it has folders of its own, so only those open further', () => {
    const at = breakdownOf(ITEMS, FOLDERS, null);
    expect(at.children.find((each) => each.key === 'campaigns')?.folders).to.equal(true);
    expect(at.children.find((each) => each.key === 'people')?.folders).to.equal(false);
  });

  it('keeps a folder with no items, and counts items of unknown size apart', () => {
    const empty = breakdownOf(ITEMS, [...FOLDERS, { key: 'empty', name: 'Empty', parentKey: null, path: '/Empty' }], null);
    expect(empty.children.map((each) => each.key)).to.deep.equal(['campaigns', 'people', 'empty']);
    const people = empty.children.find((each) => each.key === 'people')!;
    expect(people).to.deep.include({ bytes: 0, count: 1, unknown: 1, unusedCount: 1 });
  });

  it('has no direct line for a folder with nothing directly in it', () => {
    expect(breakdownOf(ITEMS, FOLDERS, 'summer').direct).to.deep.include({ count: 2 });
    expect(breakdownOf(ITEMS, FOLDERS, 'campaigns').direct).to.deep.include({ count: 1 });
    expect(breakdownOf(ITEMS, FOLDERS, 'banners').children).to.deep.equal([]);
    expect(breakdownOf([], FOLDERS, 'people').direct).to.equal(undefined);
  });

  it('counts any item with items under it as a place, as the Media Manager’s tree does', () => {
    const items = [
      item({ key: 'gallery', name: 'Gallery', mediaTypeAlias: 'Gallery', used: true, sizeBytes: 5, parentKey: 'people', path: '/People' }),
      item({ key: 'g1', used: false, sizeBytes: 40, parentKey: 'gallery', path: '/People/Gallery' }),
    ];
    const places = placesOf(items, FOLDERS);
    expect(places.find((each) => each.key === 'gallery')).to.deep.equal({ key: 'gallery', name: 'Gallery', parentKey: 'people', path: '/People/Gallery' });
    expect(places.some((each) => each.key === 'g1'), 'an item with nothing under it is no place').to.equal(false);
    const people = breakdownOf(items, places, 'people');
    expect(people.children.map((each) => [each.key, each.bytes, each.unusedCount])).to.deep.equal([['gallery', 40, 1]]);
    expect(people.direct, 'the gallery item itself is directly in People').to.deep.include({ count: 1, bytes: 5 });
    expect(breakdownOf(items, places, null).children.find((each) => each.key === 'people')?.folders).to.equal(true);
  });

  it('falls back to the library for a folder that is not there any more', () => {
    expect(breakdownOf(ITEMS, FOLDERS, 'gone').key).to.equal(null);
  });
});
