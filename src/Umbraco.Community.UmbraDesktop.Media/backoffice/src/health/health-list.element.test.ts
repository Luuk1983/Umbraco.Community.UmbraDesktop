import { expect, fixture, html } from '@open-wc/testing';
import './health-list.element.js';
import type { UmbraDesktopHealthListElement } from './health-list.element.js';
import { PAGE_ROWS, entriesOf } from './health-grid.js';
import type { HealthChip, HealthEntry } from './health-grid.js';
import { FOLDERS, KEY_NAMES, item, result, textOf, tick } from './health.test-helper.js';
import { allowResizeObserverLoop } from './health.test-helper.js';

allowResizeObserverLoop();
import { listsOf } from './health-model.js';
import { keepingOf } from './health-keep.js';
import type { HealthKeep } from './health.client.js';

/**
 * A keep as the server lists it.
 * @param over What differs from an active keep on `old`, kept from Unused until 29 October 2027.
 */
const keep = (over: Partial<HealthKeep> = {}): HealthKeep => ({
  id: 4, kind: 'Unused', target: 'old', note: 'For the press page', untilUtc: '2027-10-29T00:00:00Z', keptBy: 'u', keptByName: 'Edith', keptUtc: '2026-10-29T00:00:00Z', ended: null, ...over,
});

/**
 * The test library's entries with keeps applied, as the context makes them.
 * @param keeps The keeps.
 */
function keptEntries(keeps: HealthKeep[]): HealthEntry[] {
  const checked = result();
  const keeping = keepingOf(checked.lists, checked.items, keeps);
  return [...entriesOf(keeping.lists, keeping.ended), ...keeping.kept];
}

/**
 * The cleanup list (design §16.15, mock scenes 3 and 4): a table grouped by folder, a click that only
 * makes a row current, checkboxes that select, a box dragged over rows or down the checkbox column,
 * and the selection bar.
 */

let removals: Array<() => void> = [];
afterEach(() => {
  for (const remove of removals) remove();
  removals = [];
});

/**
 * The list on the test library.
 * @param options The tab and folder it opens on, whether the person is an administrator, the entries,
 * and the list's height.
 */
async function list(options: { chip?: HealthChip; folderKey?: string | null; exact?: boolean; admin?: boolean; entries?: HealthEntry[]; height?: number } = {}) {
  const entries = options.entries ?? entriesOf(result().lists);
  const events: Array<{ name: string; detail: unknown }> = [];
  const signed: string[] = [];
  const sign = async (subjects: Array<{ url: string; key?: string }>, edge: number) => {
    for (const subject of subjects) signed.push(subject.url);
    return new Map(subjects.map((subject) => [subject.url, `${subject.url}?width=${edge}&hmac=s`]));
  };
  // Heard on the document from before the list first draws, so its first order is heard too.
  const names = ['health-current', 'health-act', 'health-order', 'health-close-grid', 'health-keep', 'health-stop-keeping'];
  const listen = (event: Event) => events.push({ name: event.type, detail: (event as CustomEvent).detail });
  for (const name of names) document.addEventListener(name, listen);
  removals.push(() => names.forEach((name) => document.removeEventListener(name, listen)));
  const element = await fixture<UmbraDesktopHealthListElement>(
    html`<umbradesktop-health-list
      style="display:flex; width: 720px; height: ${options.height ?? 520}px"
      .entries=${entries}
      .folders=${FOLDERS}
      .chip=${options.chip ?? 'unused'}
      .folderKey=${options.folderKey}
      .exact=${options.exact ?? false}
      .admin=${options.admin ?? true}
      .signThumbnails=${sign}></umbradesktop-health-list>`,
  );
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await tick();
      await element.updateComplete;
    }
  };
  await settle();
  const root = element.shadowRoot!;
  const row = (id: string) => root.querySelector<HTMLElement>(`uui-table-row[data-id="${id}"]`)!;
  const box = (id: string) => row(id).querySelector<HTMLElement & { checked: boolean }>('uui-checkbox')!;
  const group = (key: string) => root.querySelector<HTMLElement>(`uui-table-row[data-group="${key}"]`)!;
  const bar = () => root.querySelector<HTMLElement>('.selection');
  const verb = () => root.querySelector<HTMLElement & { disabled: boolean; label: string }>('.selection uui-button.verb')!;
  const fired = (name: string) => events.filter((each) => each.name === name).map((each) => each.detail);
  return { element, root, events, signed, row, box, group, bar, verb, settle, fired, text: () => textOf(element) };
}

/**
 * A pointer event at the middle of an element, or at a point.
 * @param type The event.
 * @param target Where it lands.
 * @param at Where on the screen; the target's middle when not given.
 */
function pointer(type: string, target: Element, at?: { x: number; y: number }): void {
  const rect = target.getBoundingClientRect();
  const x = at?.x ?? rect.left + rect.width / 2;
  const y = at?.y ?? rect.top + rect.height / 2;
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 7, bubbles: true, composed: true }));
}

/**
 * A cell of a row that is empty space for a box: its size.
 * @param row The row.
 */
const sizeCell = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-cell=size]')!;

/** A page and ten more of unused items in one folder, so the list pages and scrolls. */
const many = () =>
  entriesOf(listsOf(Array.from({ length: PAGE_ROWS + 10 }, (_, at) => item({ key: `k${at}`, name: `Item ${at}`, used: false, usageCount: 0, sizeBytes: 100000 - at })), []));

describe('the Media Cleanup list', () => {
  it('draws a table with its header, a group row per folder and the folder’s rows under it, and no cards', async () => {
    const { root, group, row, text } = await list();
    const head = [...root.querySelectorAll('uui-table-head-cell')].map((each) => textOf(each).trim()).filter(Boolean);
    expect(head).to.deep.equal(['Name', 'Folder', 'Size', 'Last changed']);
    expect(textOf(group('f'))).to.contain('Products');
    expect(textOf(group('f'))).to.contain('1 items');
    expect(textOf(group('p'))).to.contain('People');
    expect(textOf(row('old'))).to.contain('Old banner');
    expect(textOf(row('old'))).to.contain('500 B');
    expect(text(), 'the month and year, in the backoffice culture').to.match(/jan.? 2026/i);
    expect(root.querySelector('uui-card-media'), 'no card view').to.equal(null);
    const order = [...root.querySelectorAll<HTMLElement>('uui-table-row[data-id], uui-table-row[data-group]')].map((each) => each.dataset.id ?? `group ${each.dataset.group}`);
    expect(order).to.deep.equal(['group f', 'old', 'group p', 'persona']);
  });

  it('shows a row’s whole name, however long', async () => {
    const name = 'a-very-long-file-name-for-the-summer-campaign-hero-image-final-version-three-approved.jpg';
    const entries = entriesOf(listsOf([item({ key: 'long', name, used: false, usageCount: 0 })], []));
    const { row } = await list({ entries });
    const cell = row('long').querySelector<HTMLElement>('[data-cell=name]')!;
    expect(textOf(cell).trim()).to.equal(name);
    expect(cell.scrollWidth, 'nothing cut off').to.be.at.most(cell.clientWidth + 1);
  });

  it('makes a row current on a click, without selecting it', async () => {
    const { row, box, fired, settle } = await list();
    pointer('pointerdown', sizeCell(row('old')));
    pointer('pointerup', sizeCell(row('old')));
    await settle();
    expect(fired('health-current')).to.deep.equal([{ id: 'old' }]);
    expect(box('old').checked).to.equal(false);
  });

  it('marks the current row', async () => {
    const { element, row } = await list();
    element.current = 'persona';
    await element.updateComplete;
    expect(row('persona').hasAttribute('current')).to.equal(true);
    expect(row('old').hasAttribute('current')).to.equal(false);
  });

  it('ticks a row from its checkbox without making it current', async () => {
    const { box, fired, settle, bar } = await list();
    pointer('pointerdown', box('old'));
    pointer('pointerup', box('old'));
    box('old').click();
    await settle();
    expect(box('old').checked).to.equal(true);
    expect(fired('health-current')).to.deep.equal([]);
    expect(textOf(bar()!)).to.contain('1 of 2 selected');
  });

  it('ticks a group’s checkbox for all of it, and shows in between for part of it', async () => {
    const entries = entriesOf(listsOf([item({ key: 'u1', used: false, usageCount: 0 }), item({ key: 'u2', used: false, usageCount: 0, sizeBytes: 50 })], []));
    const { group, box, settle } = await list({ entries });
    const check = () => group('f').querySelector<HTMLElement & { checked: boolean; indeterminate: boolean }>('uui-checkbox')!;
    box('u1').click();
    await settle();
    expect(check().indeterminate).to.equal(true);
    check().click();
    await settle();
    expect([box('u1').checked, box('u2').checked]).to.deep.equal([true, true]);
    expect(check().checked).to.equal(true);
  });

  it('says what is selected out of how many, and acts with the tab’s verb, which clears the selection', async () => {
    const { box, bar, verb, fired, settle } = await list();
    box('old').click();
    await settle();
    expect(textOf(bar()!)).to.contain('500 B');
    expect(verb().label).to.equal('Move to recycle bin');
    verb().click();
    await settle();
    expect(fired('health-act')).to.deep.equal([{ ids: ['old'] }]);
    expect(bar()).to.equal(null);
  });

  it('names Delete for orphaned files, greyed out for someone who is not an administrator, with why', async () => {
    const { box, verb, bar, settle } = await list({ chip: 'orphaned', admin: false });
    box('orphan:1/x.jpg').click();
    await settle();
    expect(verb().label).to.equal('Delete');
    expect(verb().disabled).to.equal(true);
    expect(textOf(bar()!)).to.contain('administrator');
  });

  it('selects every row a box drawn from a row’s empty part touches, and makes none current', async () => {
    const { root, row, box, fired, settle } = await list();
    pointer('pointerdown', sizeCell(row('old')));
    pointer('pointermove', sizeCell(row('persona')));
    await settle();
    expect(root.querySelector('umbradesktop-media-selection-box')!.hasAttribute('active'), 'the Media Manager’s box is drawn').to.equal(true);
    pointer('pointerup', sizeCell(row('persona')));
    await settle();
    expect([box('old').checked, box('persona').checked]).to.deep.equal([true, true]);
    expect(root.querySelector('umbradesktop-media-selection-box')!.hasAttribute('active')).to.equal(false);
    expect(fired('health-current')).to.deep.equal([]);
  });

  it('starts a box from anywhere in the table: a name, a group row, the header', async () => {
    for (const from of ['name', 'group', 'head'] as const) {
      const { root, row, group, box, settle } = await list();
      const start =
        from === 'name'
          ? row('old').querySelector<HTMLElement>('[data-cell=name] .name')!
          : from === 'group'
            ? group('f').querySelector<HTMLElement>('.group-label')!
            : root.querySelector<HTMLElement>('uui-table-head-cell.size')!;
      pointer('pointerdown', start);
      pointer('pointermove', sizeCell(row('persona')));
      pointer('pointerup', sizeCell(row('persona')));
      await settle();
      expect([box('old').checked, box('persona').checked], `from the ${from}`).to.deep.equal([true, true]);
    }
  });

  it('makes a row current on a click on its name', async () => {
    const { row, fired, settle } = await list();
    const name = row('old').querySelector<HTMLElement>('[data-cell=name] .name')!;
    pointer('pointerdown', name);
    pointer('pointerup', name);
    await settle();
    expect(fired('health-current')).to.deep.equal([{ id: 'old' }]);
  });

  it('clears the selection on a click on empty space, and never on a click on a row', async () => {
    const { root, row, box, settle } = await list();
    box('old').click();
    await settle();
    pointer('pointerdown', sizeCell(row('persona')));
    pointer('pointerup', sizeCell(row('persona')));
    await settle();
    expect(box('old').checked, 'a row click keeps the ticks').to.equal(true);
    const content = root.querySelector<HTMLElement>('.content')!;
    const under = { x: content.getBoundingClientRect().left + 200, y: content.getBoundingClientRect().bottom - 5 };
    pointer('pointerdown', content, under);
    pointer('pointerup', content, under);
    await settle();
    expect(box('old').checked, 'a click under the rows clears them').to.equal(false);
  });

  it('ticks down the checkbox column, and unticks when the drag starts on a ticked row', async () => {
    const { box, settle } = await list();
    pointer('pointerdown', box('old'));
    pointer('pointermove', box('persona'));
    pointer('pointerup', box('persona'));
    await settle();
    expect([box('old').checked, box('persona').checked]).to.deep.equal([true, true]);
    pointer('pointerdown', box('persona'));
    pointer('pointermove', box('old'));
    pointer('pointerup', box('old'));
    await settle();
    expect([box('old').checked, box('persona').checked]).to.deep.equal([false, false]);
  });

  it('scrolls the list while the box is held at its bottom edge', async () => {
    const { root, row, settle } = await list({ entries: many(), height: 320 });
    const scroller = root.querySelector<HTMLElement>('.table')!;
    const edge = scroller.getBoundingClientRect();
    pointer('pointerdown', sizeCell(row('k0')));
    pointer('pointermove', scroller, { x: edge.left + edge.width / 2, y: edge.bottom - 2 });
    for (let frame = 0; frame < 10; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(scroller.scrollTop).to.be.above(0);
    pointer('pointerup', scroller, { x: edge.left + edge.width / 2, y: edge.bottom - 2 });
    await settle();
  });

  it('pages the rows with core’s pagination, the group row going on over the page', async () => {
    const { root, settle } = await list({ entries: many() });
    expect(root.querySelectorAll('uui-table-row[data-id]').length).to.equal(PAGE_ROWS);
    const pages = root.querySelector<HTMLElement & { total: number; current: number }>('uui-pagination')!;
    expect(pages.total).to.equal(2);
    pages.current = 2;
    pages.dispatchEvent(new Event('change'));
    await settle();
    expect(root.querySelectorAll('uui-table-row[data-id]').length).to.equal(10);
    expect(textOf(root.querySelector('uui-table-row[data-group]')!), 'the group says its whole count').to.contain(`${PAGE_ROWS + 10} items`);
  });

  it('shows no pagination for one page', async () => {
    expect((await list()).root.querySelector('uui-pagination')).to.equal(null);
  });

  it('turns to the page the current row is on, as Next in the pane walks over the page', async () => {
    const { element, root, settle } = await list({ entries: many() });
    element.current = `k${PAGE_ROWS + 2}`;
    await settle();
    expect(root.querySelector<HTMLElement & { current: number }>('uui-pagination')!.current).to.equal(2);
    expect(root.querySelector(`uui-table-row[data-id="k${PAGE_ROWS + 2}"]`)).to.not.equal(null);
  });

  it('has no magnifier in the search field', async () => {
    expect((await list()).root.querySelector('uui-input.search uui-icon')).to.equal(null);
  });

  it('tells the window the rows in the order shown, for Previous and Next', async () => {
    const { fired } = await list();
    expect(fired('health-order').slice(-1)[0]).to.deep.equal({ ids: ['old', 'persona'] });
  });

  it('tells the window every row, over every page', async () => {
    const { fired } = await list({ entries: many() });
    expect((fired('health-order').slice(-1)[0] as { ids: string[] }).ids).to.have.lengthOf(PAGE_ROWS + 10);
  });

  it('opens on a folder with everything under it, and on every folder again from All folders', async () => {
    const { root, row, text, settle } = await list({ folderKey: 'p' });
    expect(row('old')).to.equal(null);
    expect(text()).to.contain('People');
    root.querySelector<HTMLElement>('uui-button.all-folders')!.click();
    await tick();
    await settle();
    expect(row('old')).to.not.equal(null);
  });

  it('opens on the items directly in a folder when asked for those alone', async () => {
    const entries = entriesOf(listsOf([item({ key: 'here', used: false, usageCount: 0, parentKey: 'f' }), item({ key: 'below', used: false, usageCount: 0, parentKey: 'sub' })], []));
    const { row } = await list({ entries, folderKey: 'f', exact: true });
    expect(row('here')).to.not.equal(null);
    expect(row('below')).to.equal(null);
  });

  it('searches names', async () => {
    const { root, row, settle } = await list();
    const search = root.querySelector<HTMLElement & { value: string }>('uui-input.search')!;
    search.value = 'pers';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(row('old')).to.equal(null);
    expect(row('persona')).to.not.equal(null);
  });

  it('signs only the thumbnails of rows it shows, never asking for an item without a file', async () => {
    const { signed } = await list();
    expect(signed).to.deep.equal(['/media/o/old.jpg']);
  });

  it('signs the thumbnails of another tab’s rows, though the table reuses the rows it drew', async () => {
    // Found on the step 3 run: Lit kept the row elements when the tab changed, and a row observed once
    // was never observed again, so the Kept tab's orphaned file showed a blank tile.
    const { element, signed, settle } = await list();
    element.chip = 'orphaned';
    await settle();
    expect(signed).to.include.members(['/media/1/x.jpg', '/media/2/y.png']);
  });

  it('goes back from Back, a real button with a border and a background', async () => {
    const { root, fired } = await list();
    expect(root.querySelector('uui-button.back')!.getAttribute('look')).to.equal('outline');
    root.querySelector<HTMLElement>('uui-button.back')!.click();
    await tick();
    expect(fired('health-close-grid')).to.have.lengthOf(1);
  });

  it('names no key anywhere', async () => {
    expect((await list()).text()).to.not.match(KEY_NAMES);
  });

  it('offers Keep… beside the verb, for the rows selected (design §16.6)', async () => {
    const { root, box, fired, settle } = await list({ chip: 'orphaned', admin: false });
    box('orphan:1/x.jpg').click();
    await settle();
    const keepButton = root.querySelector<HTMLElement & { label: string; disabled: boolean }>('.selection uui-button.keep')!;
    expect(keepButton.label).to.equal('Keep…');
    expect(keepButton.disabled, 'anyone may keep, not only an administrator').to.equal(false);
    keepButton.click();
    await settle();
    expect(fired('health-keep')).to.deep.equal([{ ids: ['orphan:1/x.jpg'] }]);
  });

  it('has a Kept tab with its count, listing what is kept and until when', async () => {
    const { root, row, settle, element } = await list({ entries: keptEntries([keep(), keep({ id: 5, target: 'persona', untilUtc: null })]) });
    const tab = root.querySelector<HTMLElement>('uui-tab[data-kind="kept"]')!;
    expect(textOf(tab)).to.contain('Kept');
    expect(textOf(tab)).to.contain('2');
    expect(row('old'), 'a kept item is out of its own list').to.equal(null);
    element.chip = 'kept';
    await settle();
    const head = [...root.querySelectorAll('uui-table-head-cell')].map((each) => textOf(each).trim()).filter(Boolean);
    expect(head).to.deep.equal(['Name', 'Folder', 'Size', 'Kept until']);
    expect(textOf(row('old'))).to.match(/oct.*2027/i);
    expect(textOf(row('persona'))).to.contain('Always');
  });

  it('stops keeping the rows selected under Kept, and offers no other verb there', async () => {
    const { root, box, fired, settle } = await list({ chip: 'kept', entries: keptEntries([keep()]) });
    box('old').click();
    await settle();
    const buttons = [...root.querySelectorAll<HTMLElement & { label: string }>('.selection uui-button')].map((each) => each.label);
    expect(buttons).to.deep.equal(['Clear selection', 'Stop keeping']);
    root.querySelector<HTMLElement>('.selection uui-button.stop')!.click();
    await settle();
    expect(fired('health-stop-keeping')).to.deep.equal([{ ids: ['old'] }]);
  });

  it('marks a row whose keep has ended with when it ended, its old note on hover', async () => {
    const { row } = await list({ entries: keptEntries([keep({ ended: 'Expired', untilUtc: '2026-10-27T00:00:00Z' })]) });
    const badge = row('old').querySelector<HTMLElement>('uui-tag.kept')!;
    expect(textOf(badge)).to.match(/Kept until .*27/);
    expect(badge.title).to.equal('For the press page');
  });
});
