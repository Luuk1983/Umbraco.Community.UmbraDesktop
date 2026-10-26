import { expect } from '@open-wc/testing';
import {
  OPTIMIZE_SAVING_RATIO,
  OVERSIZED_BYTES,
  TOP_FOLDERS,
  checkedOn,
  estimateSaving,
  isImage,
  libraryOf,
  oversizedOf,
  topFoldersOf,
  unusedOf,
} from './health-model.js';
import type { HealthItem } from './health.client.js';

/** The sums the window does itself over the last check's items (design §5). */

const item = (over: Partial<HealthItem> = {}): HealthItem => ({
  key: 'a',
  name: 'Banjo',
  mediaTypeAlias: 'Image',
  extension: 'jpg',
  sizeBytes: 100,
  parentKey: 'f',
  path: '/Products',
  usageCount: 1,
  used: true,
  ...over,
});

const MB = 1024 * 1024;

describe('the library line', () => {
  it('sums every item, and counts items and folders', () => {
    const library = libraryOf([item({ sizeBytes: 10 }), item({ key: 'b', sizeBytes: null }), item({ key: 'c', sizeBytes: 5 })], 7);
    expect(library).to.deep.equal({ sizeBytes: 15, items: 3, folders: 7 });
  });
});

describe('the bar', () => {
  it('sums the top-level folders by size, largest first, with the rest and the root as Other', () => {
    const items = [
      item({ key: '1', path: '/Products', sizeBytes: 50 }),
      item({ key: '2', path: '/Products/2024', sizeBytes: 50 }),
      item({ key: '3', path: '/People', sizeBytes: 30 }),
      item({ key: '4', path: '/Engage', sizeBytes: 20 }),
      item({ key: '5', path: '/Design', sizeBytes: 15 }),
      item({ key: '6', path: '/Misc', sizeBytes: 4 }),
      item({ key: '7', path: '/', sizeBytes: 1 }),
    ];
    expect(TOP_FOLDERS).to.equal(4);
    expect(topFoldersOf(items)).to.deep.equal([
      { name: 'Products', sizeBytes: 100, other: false },
      { name: 'People', sizeBytes: 30, other: false },
      { name: 'Engage', sizeBytes: 20, other: false },
      { name: 'Design', sizeBytes: 15, other: false },
      { name: '', sizeBytes: 5, other: true },
    ]);
  });

  it('leaves Other out when nothing is left over', () => {
    expect(topFoldersOf([item({ path: '/Products', sizeBytes: 5 })])).to.deep.equal([{ name: 'Products', sizeBytes: 5, other: false }]);
    expect(topFoldersOf([])).to.deep.equal([]);
  });
});

describe('the categories', () => {
  it('lists the unused items largest first', () => {
    const unused = unusedOf([
      item({ key: 'small', used: false, usageCount: 0, sizeBytes: 1 }),
      item({ key: 'used' }),
      item({ key: 'big', used: false, usageCount: 0, sizeBytes: 9 }),
    ]);
    expect(unused.map((each) => each.key)).to.deep.equal(['big', 'small']);
  });

  it('calls an image over 2 MB oversized, by its extension, and never an SVG or a file', () => {
    expect(OVERSIZED_BYTES).to.equal(2 * MB);
    expect(isImage(item({ extension: 'JPG' }))).to.equal(true);
    expect(isImage(item({ extension: 'svg' }))).to.equal(false);
    expect(isImage(item({ extension: 'pdf', mediaTypeAlias: 'File' }))).to.equal(false);
    expect(isImage(item({ extension: null, mediaTypeAlias: 'Image' })), 'no extension, core Image type').to.equal(true);
    expect(isImage(item({ extension: null, mediaTypeAlias: 'File' })), 'no extension, another type').to.equal(false);
    const big = oversizedOf([
      item({ key: 'photo', sizeBytes: 3 * MB }),
      item({ key: 'bigger', sizeBytes: 4 * MB, extension: 'png' }),
      item({ key: 'at', sizeBytes: 2 * MB }),
      item({ key: 'pdf', sizeBytes: 9 * MB, extension: 'pdf' }),
    ]);
    expect(big.map((each) => each.key)).to.deep.equal(['bigger', 'photo']);
  });

  it('estimates what optimizing saves as a plain ratio, since Optimize images has no estimate of its own', () => {
    expect(OPTIMIZE_SAVING_RATIO).to.equal(0.75);
    expect(estimateSaving(212 * MB)).to.equal(159 * MB);
  });
});

describe('when it was checked', () => {
  const now = new Date('2026-10-26T15:25:00');
  it('says today, yesterday, or the date', () => {
    expect(checkedOn(new Date('2026-10-26T15:12:00'), now, 'en-US')).to.deep.equal({ day: 'today', time: '3:12 PM' });
    expect(checkedOn(new Date('2026-10-25T09:05:00'), now, 'en-US')).to.deep.equal({ day: 'yesterday', time: '9:05 AM' });
    expect(checkedOn(new Date('2026-10-02T09:05:00'), now, 'en-US').day).to.equal('Oct 2');
  });
});
