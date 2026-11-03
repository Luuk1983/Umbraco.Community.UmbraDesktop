import { expect } from '@open-wc/testing';
import { formatBytes } from '../transfers/transfers-model.js';
import {
  OPTIMIZE_SAVING_RATIO,
  OVERSIZED_BYTES,
  SPACE_FOLDERS,
  barOf,
  checkedOn,
  cleanupOf,
  estimateSaving,
  foldersOf,
  healthOf,
  isImage,
  sizeOfList,
  HEALTH_STALE_MS,
  isStale,
  sizeNote,
  sizeText,
  listsOf,
} from './health-model.js';
import type { HealthKind } from './health-model.js';
import type { HealthFolder, HealthItem, HealthOrphan } from './health.client.js';

/** The sums the window does itself over the last check's items (design §5, §16.2). */

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
  url: '/media/a/banjo.jpg',
  width: null,
  height: null,
  updatedUtc: '2026-01-01T00:00:00Z',
  ...over,
});

const unused = (key: string, sizeBytes: number, over: Partial<HealthItem> = {}) => item({ key, sizeBytes, used: false, usageCount: 0, ...over });

const orphan = (relativePath: string, sizeBytes: number): HealthOrphan => ({
  relativePath,
  url: `/media/${relativePath}`,
  sizeBytes,
  lastModifiedUtc: '2026-01-01T00:00:00Z',
});

const folder = (key: string, name: string, parentKey: string | null = null): HealthFolder => ({ key, name, parentKey, path: `/${name}` });

const MB = 1024 * 1024;

describe('the health of an item', () => {
  it('is unused before oversized, and oversized only over 2 MB and only for an image', () => {
    expect(healthOf(unused('u', 3 * MB))).to.equal('unused');
    expect(healthOf(item({ sizeBytes: 3 * MB }))).to.equal('oversized');
    expect(healthOf(item({ sizeBytes: 2 * MB })), 'at, not over').to.equal('fine');
    expect(healthOf(item({ sizeBytes: 3 * MB, extension: 'pdf', mediaTypeAlias: 'File' }))).to.equal('fine');
  });
});

describe('the lists', () => {
  it('splits the result into the three lists, largest first, with an unused image only in Unused', () => {
    const lists = listsOf(
      [unused('small', 1), item({ key: 'used' }), unused('big', 9), unused('bigImage', 4 * MB), item({ key: 'photo', sizeBytes: 3 * MB }), item({ key: 'bigger', sizeBytes: 5 * MB })],
      [orphan('1/a.jpg', 5), orphan('2/b.jpg', 50)],
    );
    expect(lists.unused.map((each) => each.key)).to.deep.equal(['bigImage', 'big', 'small']);
    expect(lists.oversized.map((each) => each.key)).to.deep.equal(['bigger', 'photo']);
    expect(lists.orphaned.map((each) => each.relativePath)).to.deep.equal(['2/b.jpg', '1/a.jpg']);
  });
});

describe('the bar', () => {
  it('cuts the library by health, and counts what can be freed with the estimate for oversized', () => {
    const items = [unused('u1', 500), unused('u2', 900), item({ key: 'big', sizeBytes: 3 * MB }), item({ key: 'fine', sizeBytes: 50 })];
    const lists = listsOf(items, [orphan('1/a.jpg', 30), orphan('2/b.jpg', 10)]);
    expect(barOf(lists, 3 * MB + 1450)).to.deep.equal({
      unused: 500 + 900,
      orphaned: 40,
      oversized: 3 * MB,
      fine: 50,
      freeable: 1440 + Math.round(3 * MB * 0.75),
    });
  });
});

describe('Clean up', () => {
  const lists = listsOf([unused('u1', 500), unused('u2', 900), item({ key: 'big', sizeBytes: 3 * MB })], [orphan('1/a.jpg', 30), orphan('2/b.jpg', 10)]);
  const all = new Set<HealthKind>(['unused', 'orphaned', 'oversized']);

  it('sums the ticked rows, the oversized one as the estimate', () => {
    const cleanup = cleanupOf(lists, all, true);
    expect(cleanup.rows).to.deep.equal([
      { kind: 'unused', count: 2, bytes: 1400, unknown: 0, estimate: false },
      { kind: 'orphaned', count: 2, bytes: 40, unknown: 0, estimate: false },
      { kind: 'oversized', count: 1, bytes: estimateSaving(3 * MB), unknown: 0, estimate: true },
    ]);
    expect(cleanup.bytes).to.equal(1440 + estimateSaving(3 * MB));
  });

  it('counts the items without a size apart, so the sheet can say so', () => {
    const sizeless = listsOf([unused('u1', 500), item({ key: 'p', used: false, usageCount: 0, sizeBytes: null })], []);
    expect(cleanupOf(sizeless, all, true).rows[0]).to.include({ bytes: 500, unknown: 1 });
  });

  it('leaves out what is not ticked', () => {
    const cleanup = cleanupOf(lists, new Set<HealthKind>(['unused']), true);
    expect(cleanup.rows.map((row) => row.kind)).to.deep.equal(['unused']);
    expect(cleanup.bytes).to.equal(1400);
  });

  it('never deletes files for someone who is not an administrator', () => {
    const cleanup = cleanupOf(lists, all, false);
    expect(cleanup.rows.map((row) => row.kind)).to.deep.equal(['unused', 'oversized']);
    expect(cleanup.bytes, 'the orphans 40 bytes are not counted').to.equal(1400 + estimateSaving(3 * MB));
  });
});

describe('where the space goes', () => {
  it('sums by top-level folder, largest first, split by health, with the rest counted', () => {
    const folders = [folder('p', 'Products'), folder('a', 'Archive', 'p'), folder('c', 'Campaigns'), folder('e', 'Engage'), folder('d', 'Design')];
    const items = [
      item({ key: '1', parentKey: 'p', path: '/Products', sizeBytes: 40 }),
      unused('2', 30, { parentKey: 'p', path: '/Products' }),
      item({ key: '3', parentKey: 'a', path: '/Products/Archive', sizeBytes: 3 * MB }),
      item({ key: '4', parentKey: 'c', path: '/Campaigns', sizeBytes: 20 }),
      item({ key: '5', parentKey: 'e', path: '/Engage', sizeBytes: 10 }),
      item({ key: '6', parentKey: 'd', path: '/Design', sizeBytes: 5 }),
    ];
    expect(SPACE_FOLDERS).to.equal(3);
    const { folders: shares, more } = foldersOf(items, folders);
    expect(shares).to.deep.equal([
      { name: 'Products', key: 'p', bytes: 70 + 3 * MB, unused: 30, oversized: 3 * MB },
      { name: 'Campaigns', key: 'c', bytes: 20, unused: 0, oversized: 0 },
      { name: 'Engage', key: 'e', bytes: 10, unused: 0, oversized: 0 },
    ]);
    expect(more).to.equal(1);
  });

  it('counts an item at the root under a share without a key', () => {
    const { folders: shares, more } = foldersOf([item({ parentKey: null, path: '/', sizeBytes: 7 })], []);
    expect(shares).to.deep.equal([{ name: '', key: null, bytes: 7, unused: 0, oversized: 0 }]);
    expect(more).to.equal(0);
  });
});

describe('how old a check may be', () => {
  it('is fresh for a day, and too old for Clean up after that', () => {
    const checked = new Date('2026-10-27T10:00:00Z');
    expect(HEALTH_STALE_MS).to.equal(24 * 60 * 60 * 1000);
    expect(isStale(checked, new Date('2026-10-28T09:59:59Z'))).to.equal(false);
    expect(isStale(checked, new Date('2026-10-28T10:00:01Z'))).to.equal(true);
  });
});

describe('the size of a list', () => {
  it('counts what has no size apart, so 0 B is never said for a size nobody knows', () => {
    expect(sizeOfList([item({ sizeBytes: 500 }), item({ sizeBytes: null })])).to.deep.equal({ bytes: 500, unknown: 1 });
    expect(sizeOfList([item({ sizeBytes: null })])).to.deep.equal({ bytes: 0, unknown: 1 });
    expect(sizeOfList([])).to.deep.equal({ bytes: 0, unknown: 0 });
  });

  it('is said as the size, at least the size, or unknown', () => {
    const say = (key: string, bytes?: string) => (bytes ? `${key} ${bytes}` : key);
    expect(sizeText({ bytes: 500, unknown: 0 }, 2, say)).to.equal(formatBytes(500));
    expect(sizeText({ bytes: 500, unknown: 1 }, 2, say)).to.equal(`healthSizeAtLeast ${formatBytes(500)}`);
    expect(sizeText({ bytes: 0, unknown: 2 }, 2, say)).to.equal('healthSizeUnknown');
  });

  it('notes how many have no size only under "at least", since "Size unknown" already covers all', () => {
    const say = (count: number) => `${count} of unknown size`;
    expect(sizeNote({ bytes: 500, unknown: 0 }, 4, say)).to.equal(null);
    expect(sizeNote({ bytes: 500, unknown: 3 }, 4, say)).to.equal('3 of unknown size');
    expect(sizeNote({ bytes: 0, unknown: 4 }, 4, say)).to.equal(null);
  });
});

describe('the categories', () => {
  it('calls an image over 2 MB oversized, by its extension, and never an SVG or a file', () => {
    expect(OVERSIZED_BYTES).to.equal(2 * MB);
    expect(isImage(item({ extension: 'JPG' }))).to.equal(true);
    expect(isImage(item({ extension: 'svg' }))).to.equal(false);
    expect(isImage(item({ extension: 'pdf', mediaTypeAlias: 'File' }))).to.equal(false);
    expect(isImage(item({ extension: null, mediaTypeAlias: 'Image' })), 'no extension, core Image type').to.equal(true);
    expect(isImage(item({ extension: null, mediaTypeAlias: 'File' })), 'no extension, another type').to.equal(false);
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
