import { expect, fixture, html } from '@open-wc/testing';
import './health-folders.element.js';
import type { UmbraDesktopHealthFoldersElement } from './health-folders.element.js';
import type { HealthFolder } from './health.client.js';
import { resultOf } from './media-health.context.js';
import type { UmbraDesktopMediaHealthResult } from './media-health.context.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { KEY_NAMES, MB, item, textOf, tick } from './health.test-helper.js';

/**
 * Where the space goes, as a tree you expand (design §16.17): the library's size and bar, then its
 * places largest first, each with its bar, size and tags of what can go, an arrow only on a place with
 * places under it, Open in Media Manager on each, and the items directly in a place as a line of their
 * own.
 */

/** Campaigns with 2023 under it, Summer and a Gallery item (a place: it has items) under that; People beside it. */
const FOLDERS: HealthFolder[] = [
  { key: 'campaigns', name: 'Campaigns', parentKey: null, path: '/Campaigns' },
  { key: '2023', name: '2023', parentKey: 'campaigns', path: '/Campaigns/2023' },
  { key: 'summer', name: 'Summer', parentKey: '2023', path: '/Campaigns/2023/Summer' },
  { key: 'people', name: 'People', parentKey: null, path: '/People' },
];

/**
 * A checked library with places three deep, an item that holds items, and an item at the root.
 * @returns The result.
 */
function treeResult(): UmbraDesktopMediaHealthResult {
  const items = [
    item({ key: 's1', name: 's1', used: false, usageCount: 0, sizeBytes: 500, parentKey: 'summer', path: '/Campaigns/2023/Summer' }),
    item({ key: 's2', name: 's2', sizeBytes: 3 * MB, parentKey: 'summer', path: '/Campaigns/2023/Summer' }),
    item({ key: 'gallery', name: 'Gallery', mediaTypeAlias: 'Gallery', sizeBytes: 10, parentKey: '2023', path: '/Campaigns/2023' }),
    item({ key: 'g1', name: 'g1', used: false, usageCount: 0, sizeBytes: 40, parentKey: 'gallery', path: '/Campaigns/2023/Gallery' }),
    item({ key: 'y1', name: 'y1', used: false, usageCount: 0, sizeBytes: 50, parentKey: '2023', path: '/Campaigns/2023' }),
    item({ key: 'p1', name: 'p1', sizeBytes: 300, parentKey: 'people', path: '/People' }),
    item({ key: 'r1', name: 'r1', sizeBytes: 7, parentKey: null, path: '/' }),
  ];
  return resultOf(1, new Date(), items, [], FOLDERS);
}

/**
 * The tree on the test library.
 * @param folderKey The place to open with its way down expanded, or null for the top level.
 */
async function tree(folderKey: string | null = null) {
  const events: Array<{ name: string; detail: unknown }> = [];
  const element = await fixture<UmbraDesktopHealthFoldersElement>(
    html`<umbradesktop-health-folders style="width: 900px" .result=${treeResult()} .folderKey=${folderKey}></umbradesktop-health-folders>`,
  );
  for (const name of ['health-open-grid', 'health-show-folder', 'health-close-folders']) {
    element.addEventListener(name, (event) => events.push({ name, detail: (event as CustomEvent).detail }));
  }
  await tick();
  await element.updateComplete;
  const root = element.shadowRoot!;
  const row = (key: string) => root.querySelector<HTMLElement>(`[data-folder="${key}"]`);
  const expander = (key: string) => row(key)?.querySelector<HTMLElement & { disabled?: boolean }>('.expand') ?? null;
  const shown = () => [...root.querySelectorAll<HTMLElement>('[data-folder]')].map((each) => each.dataset.folder);
  const fired = (name: string) => events.filter((each) => each.name === name).map((each) => each.detail);
  const settle = async () => {
    await tick();
    await element.updateComplete;
  };
  return { element, root, row, expander, shown, fired, settle, text: () => textOf(element) };
}

describe('the Media Cleanup folder tree', () => {
  it('opens on the library as the tree’s root row, its top-level places under it largest first, and the items at the root', async () => {
    const { root, shown } = await tree();
    const library = root.querySelector<HTMLElement>('[data-library]')!;
    expect(textOf(library)).to.contain('Media library');
    expect(textOf(library)).to.contain(formatBytes(500 + 3 * MB + 10 + 40 + 50 + 300 + 7));
    expect(shown()).to.deep.equal(['campaigns', 'people']);
    expect(textOf(root.querySelector('[data-direct=""]')!)).to.contain('1 items at the root');
  });

  it('is titled Storage by folder, as a heading, with no bar of the whole library over the table', async () => {
    const { root } = await tree();
    expect(textOf(root.querySelector('h2')!).trim()).to.equal('Storage by folder');
    expect(root.querySelector('.bar'), 'the overview already draws it').to.equal(null);
  });

  it('draws Back with a border and a background, as the other buttons beside it', async () => {
    const { root } = await tree();
    expect(root.querySelector('uui-button.back')!.getAttribute('look')).to.equal('outline');
  });

  it('gives an arrow only to a place with places under it', async () => {
    const { expander } = await tree();
    expect(expander('campaigns')).to.not.equal(null);
    expect(expander('people'), 'People holds items, not places').to.equal(null);
  });

  it('expands a place in the same table, its places under it, indented, and the items directly in it on a line', async () => {
    const { expander, shown, settle, row, root } = await tree();
    expander('campaigns')!.click();
    await settle();
    expect(shown()).to.deep.equal(['campaigns', '2023', 'people']);
    const indent = (key: string) => row(key)!.querySelector<HTMLElement>('.name')!.getBoundingClientRect().left;
    expect(indent('2023')).to.be.above(indent('campaigns'));
    expander('2023')!.click();
    await settle();
    expect(shown(), 'an item that holds items is a place too').to.deep.equal(['campaigns', '2023', 'summer', 'gallery', 'people']);
    expect(textOf(root.querySelector('[data-direct="2023"]')!)).to.contain('2 items directly in 2023');
    expander('campaigns')!.click();
    await settle();
    expect(shown(), 'collapsing hides everything under it').to.deep.equal(['campaigns', 'people']);
  });

  it('a click on a place with places under it expands it too', async () => {
    const { row, shown, settle } = await tree();
    row('campaigns')!.querySelector<HTMLElement>('.name')!.click();
    await settle();
    expect(shown()).to.deep.equal(['campaigns', '2023', 'people']);
  });

  it('opens with the way down to a place expanded, when the overview asked for one', async () => {
    const { shown } = await tree('summer');
    expect(shown()).to.deep.equal(['campaigns', '2023', 'summer', 'gallery', 'people']);
  });

  it('cuts each place’s bar by health, offers a button per kind that can go, and leaves the cell empty when nothing can', async () => {
    const { row, root } = await tree();
    const parts = [...row('campaigns')!.querySelectorAll<HTMLElement>('.track > span')].map((each) => each.dataset.kind);
    expect(parts).to.deep.equal(['fine', 'oversized', 'unused']);
    const buttons = [...row('campaigns')!.querySelectorAll<HTMLElement & { label: string }>('.tags uui-button')].map((each) => each.label);
    expect(buttons).to.deep.equal(['3 unused', '1 oversized']);
    expect(textOf(row('people')!.querySelector('.tags')!).trim(), 'nothing said for nothing').to.equal('');
    const head = [...root.querySelectorAll('uui-table-head-cell')].map((each) => textOf(each).trim());
    expect(head).to.not.include('Can go');
  });

  it('opens the cleanup list from a tag, for that place and everything under it, without expanding it', async () => {
    const { row, fired, shown, settle } = await tree();
    row('campaigns')!.querySelector<HTMLElement>('.tags uui-button[data-kind="oversized"]')!.click();
    await settle();
    expect(fired('health-open-grid')).to.deep.equal([{ kind: 'oversized', folderKey: 'campaigns' }]);
    expect(shown()).to.deep.equal(['campaigns', 'people']);
  });

  it('opens the list on the items directly in a place from their line', async () => {
    const { root, fired, expander, settle } = await tree();
    expander('campaigns')!.click();
    await settle();
    expander('2023')!.click();
    await settle();
    root.querySelector<HTMLElement>('[data-direct="2023"] .tags uui-button[data-kind="unused"]')!.click();
    await settle();
    expect(fired('health-open-grid')).to.deep.equal([{ kind: 'unused', folderKey: '2023', exact: true }]);
  });

  it('opens any place in the Media Manager from its row, and the library from its own row', async () => {
    const { row, root, fired, settle } = await tree();
    row('people')!.querySelector<HTMLElement>('uui-button.open-in-manager')!.click();
    await settle();
    root.querySelector<HTMLElement>('[data-library] uui-button.open-in-manager')!.click();
    await settle();
    expect(fired('health-show-folder')).to.deep.equal([{ folderKey: 'people' }, { folderKey: null }]);
  });

  it('offers the list for the whole library from the library’s own row', async () => {
    const { root, fired, settle } = await tree();
    const buttons = [...root.querySelectorAll<HTMLElement & { label: string }>('[data-library] .tags uui-button')];
    expect(buttons.map((each) => each.label)).to.deep.equal(['3 unused', '1 oversized']);
    buttons[0].click();
    await settle();
    expect(fired('health-open-grid')).to.deep.equal([{ kind: 'unused' }]);
  });

  it('goes back from Back, a real button', async () => {
    const { root, fired, settle } = await tree();
    root.querySelector<HTMLElement>('uui-button.back')!.click();
    await settle();
    expect(fired('health-close-folders')).to.have.lengthOf(1);
  });

  it('names no key', async () => {
    expect((await tree()).text()).to.not.match(KEY_NAMES);
  });
});
