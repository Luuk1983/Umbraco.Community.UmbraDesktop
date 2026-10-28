import { expect, fixture, html } from '@open-wc/testing';
import './health-grid.element.js';
import type { UmbraDesktopHealthGridElement } from './health-grid.element.js';
import { CELL_HEIGHT, entriesOf } from './health-grid.js';
import type { HealthChip, HealthEntry } from './health-grid.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { FOLDERS, KEY_NAMES, item, result, textOf, tick } from './health.test-helper.js';
import { listsOf } from './health-model.js';

/** The grid (design §16.4, mock scene 5): chips, groups by folder, cards, the selection bar. */

/**
 * The grid on the test library.
 * @param options The chip and folder it opens on, whether the person is an administrator, and the entries.
 */
async function grid(options: { chip?: HealthChip; folderKey?: string | null; admin?: boolean; entries?: HealthEntry[] } = {}) {
  const entries = options.entries ?? entriesOf(result().lists);
  const events: Array<{ name: string; detail: unknown }> = [];
  const signed: string[] = [];
  const sign = async (subjects: Array<{ url: string; key?: string }>, edge: number) => {
    for (const subject of subjects) signed.push(subject.url);
    return new Map(subjects.map((subject) => [subject.url, `${subject.url}?width=${edge}&hmac=s`]));
  };
  const element = await fixture<UmbraDesktopHealthGridElement>(
    html`<umbradesktop-health-grid
      style="width: 640px"
      .entries=${entries}
      .folders=${FOLDERS}
      .chip=${options.chip ?? 'unused'}
      .folderKey=${options.folderKey}
      .admin=${options.admin ?? true}
      .signThumbnails=${sign}></umbradesktop-health-grid>`,
  );
  for (const name of ['health-preview', 'health-trash', 'health-delete', 'health-optimize', 'health-close-grid']) {
    element.addEventListener(name, (event) => events.push({ name, detail: (event as CustomEvent).detail }));
  }
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await tick();
      await element.updateComplete;
    }
  };
  await settle();
  const root = element.shadowRoot!;
  const card = (id: string) => root.querySelector<HTMLElement & { selected: boolean }>(`uui-card-media[data-id="${id}"]`)!;
  const bar = () => root.querySelector<HTMLElement>('.selection');
  const verb = () => root.querySelector<HTMLElement & { disabled: boolean; label: string }>('.selection uui-button.verb')!;
  return { element, root, events, signed, card, bar, verb, settle, text: () => textOf(element) };
}

describe('the Media Cleanup grid', () => {
  it('shows each kind as a tab with its count, and no Grid or One by one switch', async () => {
    const { root, text } = await grid();
    const tabs = [...root.querySelectorAll<HTMLElement & { active: boolean; label: string }>('uui-tab')];
    expect(tabs.map((tab) => textOf(tab).trim())).to.deep.equal(['Unused items 2', 'Orphaned files 2', 'Oversized images 1']);
    expect(tabs.map((tab) => tab.active)).to.deep.equal([true, false, false]);
    expect(text()).not.to.contain('One by one');
  });

  it('groups the chip by folder, each group with its count and size', async () => {
    const { root } = await grid();
    const heads = [...root.querySelectorAll('.group-head')].map((head) => textOf(head));
    expect(heads[0]).to.contain('Products').and.contain('1 items').and.contain(formatBytes(500));
    expect(heads[1]).to.contain('People').and.contain('Size unknown');
  });

  it('names the one group of orphaned files in words, not by a folder', async () => {
    const { root } = await grid({ chip: 'orphaned' });
    const heads = [...root.querySelectorAll('.group-head')].map((head) => textOf(head));
    expect(heads.length).to.equal(1);
    expect(heads[0]).to.contain('Files on disk').and.contain('2 items');
  });

  it('keeps each tab’s title and count on one line', async () => {
    const { root } = await grid();
    const tab = root.querySelector('uui-tab')!;
    const [title, count] = [tab.querySelector('.tab')!, tab.querySelector('.count')!].map((each) => each.getBoundingClientRect());
    expect(Math.round(count.top)).to.be.at.least(Math.round(title.top));
    expect(count.bottom).to.be.at.most(title.bottom + 1);
  });

  it('draws a card for an item with no file as an icon, never an image', async () => {
    const { card, signed } = await grid();
    expect(card('persona').querySelector('img')).to.equal(null);
    expect(card('old').querySelector('img')!.getAttribute('src')).to.equal('/media/o/old.jpg?width=' + Math.round(120 * (window.devicePixelRatio || 1)) + '&hmac=s');
    expect(signed).not.to.include(null);
  });

  it('draws a file that is not a picture as an icon with its extension, above the card’s name', async () => {
    const entries = entriesOf(listsOf([item({ key: 'pdf', name: 'Spec', used: false, extension: 'pdf', mediaTypeAlias: 'File', url: '/media/s/spec.pdf' })], []));
    const { card } = await grid({ entries });
    const tile = card('pdf').querySelector('.tile')!;
    expect(tile.querySelector('uui-icon')!.getAttribute('name')).to.equal('icon-document');
    expect(textOf(tile).trim()).to.equal('PDF');
    expect(card('pdf').shadowRoot!.querySelector('uui-symbol-file'), 'core’s symbol sits under the name at this size').to.equal(null);
  });

  it('selects from a card’s checkbox without previewing, and previews from its picture', async () => {
    const { card, events, bar, settle } = await grid();
    card('old').shadowRoot!.querySelector<HTMLElement>('#select-checkbox')!.click();
    await settle();
    expect(card('old').selected).to.equal(true);
    expect(events.filter((each) => each.name === 'health-preview')).to.deep.equal([]);
    expect(bar()).not.to.equal(null);
    card('old').shadowRoot!.querySelector<HTMLElement>('#open-part')!.click();
    expect(events.find((each) => each.name === 'health-preview')?.detail).to.deep.equal({ id: 'old', ids: ['old', 'persona'] });
  });

  it('ticks a group’s checkbox for all of it, and shows in between for part of it', async () => {
    const entries = entriesOf(listsOf([item({ key: 'p1', used: false }), item({ key: 'p2', used: false, sizeBytes: 50 })], []));
    const { root, card, settle } = await grid({ entries });
    const box = () => root.querySelector<HTMLElement & { checked: boolean; indeterminate: boolean }>('.group-head uui-checkbox')!;
    card('p1').shadowRoot!.querySelector<HTMLElement>('#select-checkbox')!.click();
    await settle();
    expect([box().checked, box().indeterminate]).to.deep.equal([false, true]);
    box().click();
    await settle();
    expect([box().checked, box().indeterminate]).to.deep.equal([true, false]);
    expect(card('p2').selected).to.equal(true);
  });

  it('says what is selected and offers the chip’s verb, which clears the selection when pressed', async () => {
    const { root, card, bar, verb, events, settle } = await grid();
    card('old').shadowRoot!.querySelector<HTMLElement>('#select-checkbox')!.click();
    await settle();
    expect(textOf(bar()!)).to.contain('1 selected').and.contain(formatBytes(500));
    expect(verb().label).to.equal('Move to recycle bin');
    verb().click();
    await settle();
    expect(events.find((each) => each.name === 'health-trash')?.detail).to.deep.include({ ids: ['old'] });
    expect(bar()).to.equal(null);
    expect(root.querySelector('uui-card-media[selected]')).to.equal(null);
  });

  it('names Delete for orphaned files and Optimize for oversized images', async () => {
    const orphaned = await grid({ chip: 'orphaned' });
    orphaned.card('orphan:1/x.jpg').shadowRoot!.querySelector<HTMLElement>('#select-checkbox')!.click();
    await orphaned.settle();
    expect(orphaned.verb().label).to.equal('Delete');
    const oversized = await grid({ chip: 'oversized' });
    oversized.card('big').shadowRoot!.querySelector<HTMLElement>('#select-checkbox')!.click();
    await oversized.settle();
    expect(oversized.verb().label).to.equal('Optimize');
  });

  it('greys Delete out for someone who is not an administrator, and says why', async () => {
    const { card, verb, bar, settle } = await grid({ chip: 'orphaned', admin: false });
    card('orphan:1/x.jpg').shadowRoot!.querySelector<HTMLElement>('#select-checkbox')!.click();
    await settle();
    expect(verb().disabled).to.equal(true);
    expect(textOf(bar()!)).to.contain('Only an administrator can delete files.');
  });

  it('drops what left the result from the selection, once the window hands in the entries now', async () => {
    const { element, card, bar, settle } = await grid();
    card('old').shadowRoot!.querySelector<HTMLElement>('#select-checkbox')!.click();
    await settle();
    element.entries = element.entries.filter((each) => each.id !== 'old');
    await settle();
    expect(card('old')).to.equal(null);
    expect(bar()).to.equal(null);
  });

  it('tells the browser each row’s height before it draws it, so only what is on screen is drawn', async () => {
    const { root } = await grid();
    const row = root.querySelector<HTMLElement>('.cells')!;
    const style = getComputedStyle(row);
    expect(style.contentVisibility).to.equal('auto');
    expect(style.containIntrinsicSize).to.contain(`${CELL_HEIGHT}px`);
  });

  it('opens on a folder and everything under it, and shows every folder again from All folders', async () => {
    const { root, card, settle, text } = await grid({ folderKey: 'p' });
    expect(card('old')).to.equal(null);
    expect(card('persona')).not.to.equal(null);
    expect(text()).to.contain('In People');
    root.querySelector<HTMLElement>('uui-button.all-folders')!.click();
    await settle();
    expect(card('old')).not.to.equal(null);
  });

  it('searches names', async () => {
    const { root, card, settle } = await grid();
    const input = root.querySelector<HTMLElement & { value: string }>('uui-input.search')!;
    input.value = 'pers';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settle();
    expect(card('old')).to.equal(null);
    expect(card('persona')).not.to.equal(null);
  });

  it('goes back from Back, a real button', async () => {
    const { root, events } = await grid();
    root.querySelector<HTMLElement>('uui-button.back')!.click();
    await tick();
    expect(events.map((each) => each.name)).to.include('health-close-grid');
  });

  it('names no key anywhere', async () => {
    const { text } = await grid();
    expect(text()).not.to.match(KEY_NAMES);
  });
});
