import { expect } from '@open-wc/testing';
import { CELL_GAP, HealthSelection, ORPHAN_GROUP, cellsPerRow, chipCounts, entriesOf, gridOf, rowsOf } from './health-grid.js';
import type { HealthEntry, HealthGridQuery } from './health-grid.js';
import { listsOf } from './health-model.js';
import type { HealthFolder } from './health.client.js';
import { MB, item, orphan } from './health.test-helper.js';
import { THUMB_EDGE } from './health-media.js';

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

  it('leaves orphaned files out of a folder, which they belong to none of', () => {
    expect(gridOf(entries(), query({ chip: 'orphaned', folderKey: 'products' }), FOLDERS)).to.deep.equal([]);
  });

  it('counts each chip in the folder asked for', () => {
    expect(chipCounts(entries(), undefined, FOLDERS)).to.deep.equal({ unused: 6, orphaned: 3, oversized: 1 });
    expect(chipCounts(entries(), 'products', FOLDERS)).to.deep.equal({ unused: 2, orphaned: 0, oversized: 1 });
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

  it('fits as many cells in a row as the width takes, at least one', () => {
    expect(cellsPerRow(THUMB_EDGE * 3 + CELL_GAP * 2)).to.equal(3);
    expect(cellsPerRow(THUMB_EDGE * 3 + CELL_GAP * 2 - 1)).to.equal(2);
    expect(cellsPerRow(0)).to.equal(1);
  });

  it('shows a group’s first row with "+n more" in its last place, and every row once opened', () => {
    const many = { key: 'k', label: '', bytes: 0, unknown: 0, entries: entries().filter((each) => each.kind === 'unused') };
    expect(rowsOf(many, 4, false)).to.deep.equal({ rows: [many.entries.slice(0, 3)], more: 3 });
    expect(rowsOf(many, 6, false)).to.deep.equal({ rows: [many.entries], more: 0 });
    expect(rowsOf(many, 4, true)).to.deep.equal({ rows: [many.entries.slice(0, 4), many.entries.slice(4)], more: 0 });
  });
});
