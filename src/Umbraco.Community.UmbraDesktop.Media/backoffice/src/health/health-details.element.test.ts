import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import './health-details.element.js';
import type { UmbraDesktopHealthDetailsElement } from './health-details.element.js';
import { UMBRADESKTOP_MEDIA_HEALTH_CONTEXT } from './media-health.context.js';
import type { UmbraDesktopMediaHealthBrowse } from './media-health.context.js';
import { entriesOf } from './health-grid.js';
import type { HealthEntry } from './health-grid.js';
import { listsOf } from './health-model.js';
import type { HealthKeep } from './health.client.js';

/**
 * A keep on the hero image, as the server lists it.
 * @param over What differs from an active keep kept by Edith until 29 October 2027.
 */
const keep = (over: Partial<HealthKeep> = {}): HealthKeep => ({
  id: 3, kind: 'Unused', target: 'hero', note: 'For the press page', untilUtc: '2027-10-29T00:00:00Z', keptBy: 'u', keptByName: 'Edith Editor', keptUtc: '2026-10-29T00:00:00Z', ended: null, ...over,
});

/**
 * The entries with the hero's row carrying a keep.
 * @param over What differs in the keep.
 */
const withKeep = (over: Partial<HealthKeep> = {}): HealthEntry[] => entries().map((each) => (each.id === 'hero' ? { ...each, keep: keep(over) } : each));
import { previewWidth } from './health-media.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { KEY_NAMES, MB, item, orphan, textOf, tick } from './health.test-helper.js';

/**
 * The details pane (design §16.15, mock scene 3): the desktop's attached pane beside the list, showing
 * the current row from the health context, with its facts and the actions that work on it.
 */

let removals: Array<() => void> = [];
afterEach(() => {
  for (const remove of removals) remove();
  removals = [];
});

/** Three unused items, a PDF among them, an item with no file, and an orphaned image. */
function entries(): HealthEntry[] {
  return entriesOf(
    listsOf(
      [
        item({ key: 'hero', name: 'banner-01.png', used: false, usageCount: 0, sizeBytes: 14 * MB, extension: 'png', url: '/media/h/banner-01.png', width: 5472, height: 3648, updatedUtc: '2023-05-10T09:00:00Z', path: '/Campaigns/2023' }),
        item({ key: 'spec', name: 'spec-2021.pdf', used: false, usageCount: 0, sizeBytes: 5 * MB, extension: 'pdf', mediaTypeAlias: 'File', url: '/media/s/spec-2021.pdf', path: '/Products/Archive' }),
        item({ key: 'persona', name: 'Persona', used: false, usageCount: 0, sizeBytes: null, extension: null, url: null, path: '/People' }),
      ],
      [orphan('1/x.jpg', 30)],
    ),
  );
}

/**
 * The pane on a stand-in context, as the desktop mounts it beside the window.
 * @param current The current row.
 * @param options Whether the person is an administrator, and the list's order.
 */
async function details(current: string | undefined, options: { admin?: boolean; order?: string[]; entries?: HealthEntry[] } = {}) {
  const asked: string[] = [];
  const signed: Array<{ url: string; key?: string; edge: number; fit?: boolean }> = [];
  const all = options.entries ?? entries();
  const browse = new UmbObjectState<UmbraDesktopMediaHealthBrowse>({ current, order: options.order ?? ['hero', 'spec', 'persona'], deleting: undefined, keeping: undefined, skipped: [] });
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width: 360px; height: 700px; display: flex;';
  document.body.appendChild(wrapper);
  removals.push(() => wrapper.remove());
  new UmbContextProvider(wrapper, UMBRADESKTOP_MEDIA_HEALTH_CONTEXT, {
    getHostElement: () => wrapper,
    state: new UmbObjectState({ phase: { kind: 'idle' }, result: { checkId: 1 }, mediaCount: 3, cleanup: undefined }).asObservable(),
    browse: browse.asObservable(),
    getBrowse: () => browse.getValue(),
    entries: () => all,
    step: (by: number) => void asked.push(`step ${by}`),
    askKeep: (ids: string[]) => void asked.push(`keep ${ids.join(',')}`),
    stopKeeping: async (ids: string[]) => void asked.push(`stop keeping ${ids.join(',')}`),
    act: async (ids: string[], options: { admin: boolean; title?: string }) => void asked.push(`act ${ids.join(',')} ${options.admin} ${options.title ?? ''}`.trim()),
    showInManager: (entry: { id: string }) => {
      asked.push(`show ${entry.id}`);
      return true;
    },
    thumbnails: async (subjects: Array<{ url: string; key?: string }>, edge: number, opts: { fit?: boolean } = {}) => {
      for (const subject of subjects) signed.push({ ...subject, edge, fit: opts.fit });
      return new Map(subjects.map((subject) => [subject.url, `${subject.url}?width=${edge}&rmode=max&hmac=s`]));
    },
  } as never).hostConnected();
  new UmbContextProvider(wrapper, UMB_CURRENT_USER_CONTEXT, {
    getHostElement: () => wrapper,
    currentUser: new UmbObjectState({ isAdmin: options.admin ?? true }).asObservable(),
  } as never).hostConnected();
  const element = await fixture<UmbraDesktopHealthDetailsElement>(html`<umbradesktop-health-details .pixelRatio=${2}></umbradesktop-health-details>`, { parentNode: wrapper });
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await tick();
      await element.updateComplete;
    }
  };
  await settle();
  const root = element.shadowRoot!;
  const button = (name: string) => root.querySelector<HTMLElement & { disabled: boolean }>(`uui-button[label="${name}"]`);
  const facts = () => Object.fromEntries([...root.querySelectorAll('.general-item')].map((each) => [textOf(each.querySelector('strong')!).trim(), textOf(each.querySelector('span')!).trim()]));
  return { element, root, asked, signed, browse, button, facts, settle, text: () => textOf(element) };
}

describe('the Media Cleanup details pane', () => {
  it('says to pick a row before one is current', async () => {
    const { text, root } = await details(undefined);
    expect(text()).to.contain('Select a row');
    expect(root.querySelector('uui-button')).to.equal(null);
  });

  it('says the list is done when the last row went and nothing is left', async () => {
    const { text } = await details(undefined, { order: [] });
    expect(text()).to.contain('Nothing left in this list');
  });

  it('keeps the actions in a footer at the bottom of the pane, in view while the rest scrolls', async () => {
    const { root, element } = await details('hero');
    const footer = root.querySelector<HTMLElement>('.footer')!;
    expect(footer.querySelector('uui-button[label="Move to recycle bin"]')).to.not.equal(null);
    expect(footer.querySelector('uui-button[label="Next"]')).to.not.equal(null);
    const pane = element.getBoundingClientRect();
    expect(Math.round(footer.getBoundingClientRect().bottom)).to.equal(Math.round(pane.bottom));
    const scroll = root.querySelector<HTMLElement>('.content')!;
    expect(getComputedStyle(scroll).overflowY).to.equal('auto');
  });

  it('shows Show in Media Manager as an icon on the picture, not a wide button', async () => {
    const { root } = await details('hero');
    const show = root.querySelector<HTMLElement>('uui-button[label="Show in Media Manager"]')!;
    expect(show.closest('.preview'), 'on the picture’s box').to.not.equal(null);
    expect(show.getAttribute('compact')).to.not.equal(null);
    expect(textOf(show).trim(), 'its label is for screen readers and its title, not drawn').to.equal('');
  });

  it('shows the current row: its name, why it is listed, and the facts that decide', async () => {
    const { text, facts } = await details('hero');
    expect(text()).to.contain('banner-01.png');
    expect(text()).to.contain('Not used on any page');
    const { 'Last changed': changed, ...rest } = facts();
    expect(rest).to.deep.equal({ Folder: 'Campaigns / 2023', Dimensions: '5472 × 3648', Size: formatBytes(14 * MB) });
    expect(changed, "the month and year, in the backoffice's culture").to.match(/2023/);
  });

  it('follows the current row when the list changes it', async () => {
    const { browse, settle, text } = await details('hero');
    browse.update({ current: 'persona' });
    await settle();
    expect(text()).to.contain('Persona');
    expect(text(), 'no pixel size for an item that has none').to.not.contain('Dimensions');
    expect(text()).to.contain('Size unknown');
  });

  it('asks for one signed picture, uncropped, as wide as it draws, never wider than the picture', async () => {
    const { signed, root } = await details('hero');
    expect(signed).to.have.lengthOf(1);
    expect(signed[0]).to.deep.include({ url: '/media/h/banner-01.png', key: 'hero', fit: true });
    const width = Math.round(root.querySelector<HTMLElement>('.picture')!.getBoundingClientRect().width);
    expect(signed[0].edge).to.equal(Math.min(previewWidth(width, 2), 5472));
  });

  it('shows a PDF where the browser can, and an icon for an item with no file, asking nothing', async () => {
    const pdf = await details('spec');
    expect(pdf.root.querySelector('object')!.getAttribute('data')).to.equal('/media/s/spec-2021.pdf');
    expect(pdf.signed).to.deep.equal([]);
    const none = await details('persona');
    expect(none.root.querySelector('img')).to.equal(null);
    expect(none.root.querySelector('.picture uui-icon')).to.not.equal(null);
  });

  it('says where an orphaned file is on disk', async () => {
    const { facts } = await details('orphan:1/x.jpg', { order: ['orphan:1/x.jpg'] });
    expect(facts().Folder).to.equal('/media/1');
  });

  it('walks the list with Previous and Next, which stop at its ends', async () => {
    const { button, asked } = await details('hero');
    expect(button('Previous')!.disabled).to.equal(true);
    expect(button('Next')!.disabled).to.equal(false);
    button('Next')!.click();
    await tick();
    expect(asked).to.deep.equal(['step 1']);
    const last = await details('persona');
    expect(last.button('Next')!.disabled).to.equal(true);
    last.button('Previous')!.click();
    await tick();
    expect(last.asked).to.deep.equal(['step -1']);
  });

  it('acts on the current row with its kind’s verb', async () => {
    const { button, asked } = await details('hero');
    button('Move to recycle bin')!.click();
    await tick();
    expect(asked).to.deep.equal(['act hero true Oversized images']);
  });

  it('greys Delete out for someone who is not an administrator, and says why', async () => {
    const { button, text } = await details('orphan:1/x.jpg', { admin: false, order: ['orphan:1/x.jpg'] });
    expect(button('Delete')!.disabled).to.equal(true);
    expect(text()).to.contain('Only an administrator can delete files.');
  });

  it('offers Show in Media Manager for an item, and not for an orphaned file, which is none', async () => {
    const { button, asked } = await details('hero');
    button('Show in Media Manager')!.click();
    await tick();
    expect(asked).to.deep.equal(['show hero']);
    const file = await details('orphan:1/x.jpg', { order: ['orphan:1/x.jpg'] });
    expect(file.button('Show in Media Manager')).to.equal(null);
  });

  it('lays out as core’s media Info view: the picture and the facts each in a box, at the normal text size', async () => {
    const { root } = await details('hero');
    const boxes = [...root.querySelectorAll('uui-box')];
    expect(boxes).to.have.lengthOf(2);
    expect(boxes[0].querySelector('.picture'), 'the picture in the first').to.not.equal(null);
    expect(boxes[1].querySelectorAll('.general-item').length, 'the facts in the second').to.equal(4);
    const value = root.querySelector<HTMLElement>('.general-item span')!;
    expect(parseFloat(getComputedStyle(value).fontSize), 'not the small type').to.be.at.least(14);
  });

  it('has no edit view, no Image Editor, no close of its own, and names no key', async () => {
    const { text, button } = await details('hero');
    expect(text()).to.not.match(/Edit|Image Editor/);
    expect(button('Close'), 'the pane header has close').to.equal(null);
    expect(text()).to.not.match(KEY_NAMES);
  });

  it('offers Keep… beside the action, in the footer, for anyone (design §16.6)', async () => {
    const { root, button, asked } = await details('spec', { admin: false });
    const verbs = [...root.querySelectorAll<HTMLElement & { label: string }>('.footer .verbs uui-button')].map((each) => each.label);
    expect(verbs).to.deep.equal(['Move to recycle bin', 'Keep…']);
    button('Keep…')!.click();
    await tick();
    expect(asked).to.deep.equal(['keep spec']);
  });

  it('shows a kept row’s keep, the note, who and until when, and offers only Stop keeping', async () => {
    const { root, button, asked, facts, text } = await details('hero', { entries: withKeep() });
    expect(text()).to.contain('For the press page');
    expect(facts()['Kept by']).to.contain('Edith Editor');
    expect(facts()['Kept until']).to.match(/2027/);
    const verbs = [...root.querySelectorAll<HTMLElement & { label: string }>('.footer .verbs uui-button')].map((each) => each.label);
    expect(verbs).to.deep.equal(['Stop keeping']);
    button('Stop keeping')!.click();
    await tick();
    expect(asked).to.deep.equal(['stop keeping hero']);
  });

  it('says a keep that ended ended, with its old note, and offers the action and Keep… again', async () => {
    const { root, facts, text } = await details('hero', { entries: withKeep({ ended: 'Changed' }) });
    expect(text()).to.contain('For the press page');
    expect(facts()['Kept until']).to.contain('file changed');
    const verbs = [...root.querySelectorAll<HTMLElement & { label: string }>('.footer .verbs uui-button')].map((each) => each.label);
    expect(verbs).to.deep.equal(['Move to recycle bin', 'Keep…']);
  });
});
