import { expect } from '@open-wc/testing';
import { HealthSelection, ORPHAN_GROUP, PAGE_ROWS, chipCounts, entriesOf, gridOf, nextAfter, orderOf, pageCount, pageOf, pageWith } from './health-grid.js';
import type { HealthEntry, HealthGridQuery } from './health-grid.js';
import { listsOf } from './health-model.js';
import type { HealthFolder, HealthKeep } from './health.client.js';
import { MB, item, orphan } from './health.test-helper.js';

/** The grid's sums (design §16.4, plan Task 2.1): entries, groups by folder, the selection. */

/** Products, with Archive under it, and People beside it. */
const FOLDERS: HealthFolder[] = [
  { key: 'products', name: 'Products', parentKey: null, path: '/Products' },
  { key: 'archive', name: 'Archive', parentKey: 'products', path: '/Products/Archive' },
  { key: 'people', name: 'People', parentKey: null, path: '/People' },
];

/** Five unused items in three folders and the root, and two orphaned files in two directories. */
function entries(): HealthEntry[] {
  const lists = listsOf(
    [
      item({ key: 'a', name: 'Chair', used: false, sizeBytes: 700, parentKey: 'products', path: '/Products' }),
      item({ key: 'b', name: 'lamp', used: false, sizeBytes: 600, parentKey: 'archive', path: '/Products/Archive' }),
      item({ key: 'c', name: 'Banner', used: false, sizeBytes: 50, parentKey: 'people', path: '/People' }),
      item({ key: 'd', name: 'Desk', used: false, sizeBytes: 40, parentKey: 'people', path: '/People' }),
      item({ key: 'e', name: 'Root', used: false, sizeBytes: 5, parentKey: null, path: '/' }),
      item({ key: 'persona', name: 'Persona', used: false, sizeBytes: null, extension: null, url: null, parentKey: 'people', path: '/People' }),
      item({ key: 'big', name: 'Hero', sizeBytes: 3 * MB, parentKey: 'products', path: '/Products' }),
    ],
    [orphan('1/x.jpg', 30), orphan('2/y.png', 10), orphan('2/z.png', 20)],
  );
  return entriesOf(lists);
}

/**
 * A query on the unused chip, everything else as the grid opens.
 * @param over What differs.
 */
const query = (over: Partial<HealthGridQuery> = {}): HealthGridQuery => ({ chip: 'unused', search: '', sort: 'largest', ...over });

describe('the Media Cleanup grid model', () => {
  it('builds one entry per thing found, items by key and orphaned files by path', () => {
    const all = entries();
    expect(all.filter((each) => each.kind === 'unused').map((each) => each.id)).to.deep.equal(['a', 'b', 'c', 'd', 'e', 'persona']);
    expect(all.filter((each) => each.kind === 'orphaned').map((each) => each.id)).to.deep.equal(['orphan:1/x.jpg', 'orphan:2/z.png', 'orphan:2/y.png']);
    expect(all.filter((each) => each.kind === 'oversized').map((each) => each.id)).to.deep.equal(['big']);
  });

  it('gives an item without a file no URL and no bytes, and says its size is not known', () => {
    const persona = entries().find((each) => each.id === 'persona')!;
    expect(persona.url).to.equal(null);
    expect(persona.bytes).to.equal(0);
    expect(persona.sized).to.equal(false);
  });

  it('groups by folder, largest group first, entries largest first within', () => {
    const groups = gridOf(entries(), query(), FOLDERS);
    expect(groups.map((group) => group.label)).to.deep.equal(['Products', 'Products / Archive', 'People', '']);
    expect(groups.map((group) => group.bytes)).to.deep.equal([700, 600, 90, 5]);
    expect(groups[2].entries.map((each) => each.id)).to.deep.equal(['c', 'd', 'persona']);
    expect(groups[2].unknown, 'the group counts what has no size, so it can say "at least"').to.equal(1);
  });

  it('sorts smallest first and by name, the groups following the same order', () => {
    expect(gridOf(entries(), query({ sort: 'smallest' }), FOLDERS).map((group) => group.bytes)).to.deep.equal([5, 90, 600, 700]);
    const byName = gridOf(entries(), query({ sort: 'name' }), FOLDERS);
    expect(byName.find((group) => group.label === 'People')!.entries.map((each) => each.name)).to.deep.equal(['Banner', 'Desk', 'Persona']);
  });

  it('searches names without minding case', () => {
    const groups = gridOf(entries(), query({ search: 'LAMP' }), FOLDERS);
    expect(groups.flatMap((group) => group.entries.map((each) => each.id))).to.deep.equal(['b']);
  });

  it('filters by a folder with everything under it, and by the root alone', () => {
    const products = gridOf(entries(), query({ folderKey: 'products' }), FOLDERS);
    expect(products.flatMap((group) => group.entries.map((each) => each.id))).to.deep.equal(['a', 'b']);
    const root = gridOf(entries(), query({ folderKey: null }), FOLDERS);
    expect(root.flatMap((group) => group.entries.map((each) => each.id))).to.deep.equal(['e']);
  });

  it('puts every orphaned file in one group, since Umbraco keeps each file in a folder of its own', () => {
    // Measured on a real library: 81 orphaned files in 81 random folders (/media/1pjnlrr4/...), so a
    // group per directory was a group per file.
    const groups = gridOf(entries(), query({ chip: 'orphaned' }), FOLDERS);
    expect(groups.map((group) => [group.key, group.entries.map((each) => each.id)])).to.deep.equal([[ORPHAN_GROUP, ['orphan:1/x.jpg', 'orphan:2/z.png', 'orphan:2/y.png']]]);
    expect(groups[0].bytes).to.equal(60);
  });

  it('filters by the items directly in a folder, leaving out its folders, when asked for exactly', () => {
    expect(gridOf(entries(), query({ folderKey: 'products', exact: true }), FOLDERS).map((group) => group.key)).to.deep.equal(['products']);
    expect(gridOf(entries(), query({ folderKey: null, exact: true }), FOLDERS).map((group) => group.key)).to.deep.equal(['']);
  });

  it('leaves orphaned files out of a folder, which they belong to none of', () => {
    expect(gridOf(entries(), query({ chip: 'orphaned', folderKey: 'products' }), FOLDERS)).to.deep.equal([]);
  });

  it('counts each chip in the folder asked for', () => {
    expect(chipCounts(entries(), undefined, FOLDERS)).to.deep.equal({ unused: 6, orphaned: 3, oversized: 1, kept: 0 });
    expect(chipCounts(entries(), 'products', FOLDERS)).to.deep.equal({ unused: 2, orphaned: 0, oversized: 1, kept: 0 });
  });

  it('shows kept things under Kept alone, grouped by folder as the other tabs are (design §16.6)', () => {
    const keep = (target: string, kind: HealthKeep['kind'], ended: HealthKeep['ended'] = null): HealthKeep => ({
      id: 1, kind, target, note: null, untilUtc: null, keptBy: 'u', keptByName: 'Edith', keptUtc: '2026-10-29T00:00:00Z', ended,
    });
    const all = [...entries().filter((each) => each.id !== 'a'), { ...entries().find((each) => each.id === 'a')!, keep: keep('a', 'Unused') }];
    expect(gridOf(all, query({ chip: 'kept' }), FOLDERS).flatMap((group) => group.entries.map((each) => each.id))).to.deep.equal(['a']);
    expect(gridOf(all, query(), FOLDERS).flatMap((group) => group.entries.map((each) => each.id))).not.to.include('a');
    expect(chipCounts(all, undefined, FOLDERS)).to.deep.equal({ unused: 5, orphaned: 3, oversized: 1, kept: 1 });
    // An ended keep is a badge on a row of its own list, not a row under Kept.
    const ended = all.map((each) => (each.id === 'a' ? { ...each, keep: keep('a', 'Unused', 'Expired') } : each));
    expect(chipCounts(ended, undefined, FOLDERS)).to.deep.equal({ unused: 6, orphaned: 3, oversized: 1, kept: 0 });
  });

  it('puts the keep that ended on its row, so the list can show the badge', () => {
    const lists = listsOf([item({ key: 'a', used: false })], []);
    const ended: HealthKeep = { id: 2, kind: 'Unused', target: 'a', note: 'Old', untilUtc: '2026-01-01T00:00:00Z', keptBy: 'u', keptByName: 'E', keptUtc: '2025-01-01T00:00:00Z', ended: 'Expired' };
    expect(entriesOf(lists, new Map([['a', ended]]))[0].keep).to.equal(ended);
  });

  it('selects a whole group from none or some, and clears it from all', () => {
    const [products, , people] = gridOf(entries(), query(), FOLDERS);
    let selection = new HealthSelection();
    expect(selection.groupState(people)).to.equal('none');
    selection = selection.toggle('c');
    expect(selection.groupState(people)).to.equal('some');
    selection = selection.toggleGroup(people);
    expect(selection.groupState(people)).to.equal('all');
    expect(selection.groupState(products)).to.equal('none');
    selection = selection.toggleGroup(people);
    expect(selection.groupState(people)).to.equal('none');
    expect(selection.count).to.equal(0);
  });

  it('never changes a selection in place', () => {
    const first = new HealthSelection();
    const second = first.toggle('a');
    expect(first.count).to.equal(0);
    expect(second.count).to.equal(1);
    expect(second.toggle('a').has('a')).to.equal(false);
  });

  it('sums only what is selected, and keeps only what is still there', () => {
    const all = entries();
    const selection = new HealthSelection().toggle('a').toggle('c').toggle('gone');
    expect(selection.bytes(all)).to.equal(750);
    expect([...selection.within(all).ids].sort()).to.deep.equal(['a', 'c']);
  });

  it('selects or unselects many at once, as a drag over rows does (design §16.15)', () => {
    const selection = new HealthSelection(['a']);
    const more = selection.with(['b', 'c'], true);
    expect([...more.ids].sort()).to.deep.equal(['a', 'b', 'c']);
    expect([...more.with(['a', 'c'], false).ids]).to.deep.equal(['b']);
    expect(selection.count, 'the first is left as it was').to.equal(1);
  });

  it('pages the rows a hundred at a time, as core’s collections do, a group going on over a page', () => {
    const row = entries()[0];
    const big = { key: 'big', label: 'Big', bytes: 0, unknown: 0, entries: Array.from({ length: PAGE_ROWS - 2 }, (_, at) => ({ ...row, id: `b${at}` })) };
    const next = { key: 'next', label: 'Next', bytes: 0, unknown: 0, entries: Array.from({ length: 5 }, (_, at) => ({ ...row, id: `n${at}` })) };
    expect(pageCount([big, next])).to.equal(2);
    const first = pageOf([big, next], 1);
    expect(first.map((part) => [part.group.key, part.entries.length, part.continued])).to.deep.equal([
      ['big', PAGE_ROWS - 2, false],
      ['next', 2, false],
    ]);
    const second = pageOf([big, next], 2);
    expect(second.map((part) => [part.group.key, part.entries.length, part.continued])).to.deep.equal([['next', 3, true]]);
    expect(second[0].group, 'the whole group, for its checkbox and its count').to.equal(next);
    expect(pageOf([big, next], 9), 'past the end is the last page').to.deep.equal(second);
    expect(pageCount([])).to.equal(1);
  });

  it('finds the page a row is on, so the list follows the details pane', () => {
    const row = entries()[0];
    const big = { key: 'big', label: '', bytes: 0, unknown: 0, entries: Array.from({ length: PAGE_ROWS + 3 }, (_, at) => ({ ...row, id: `b${at}` })) };
    expect(pageWith([big], 'b0')).to.equal(1);
    expect(pageWith([big], `b${PAGE_ROWS + 1}`)).to.equal(2);
    expect(pageWith([big], 'gone')).to.equal(undefined);
  });

  it('lists every row in the order shown, over every page, for Previous and Next', () => {
    const groups = gridOf(entries(), query(), FOLDERS);
    expect(orderOf(groups)).to.deep.equal(['a', 'b', 'c', 'd', 'persona', 'e']);
  });

  it('moves on after what went to the next row still there, or the one before at the end', () => {
    const order = ['a', 'b', 'c', 'd'];
    expect(nextAfter(order, 'b', ['b'])).to.equal('c');
    expect(nextAfter(order, 'b', ['b', 'c'])).to.equal('d');
    expect(nextAfter(order, 'd', ['d'])).to.equal('c');
    expect(nextAfter(order, 'a', ['a', 'b', 'c', 'd'])).to.equal(undefined);
    expect(nextAfter(order, 'b', ['c']), 'the current row stays when it did not go').to.equal('b');
    expect(nextAfter(order, 'x', ['a']), 'a row not in the list stays as it is').to.equal('x');
  });
});
