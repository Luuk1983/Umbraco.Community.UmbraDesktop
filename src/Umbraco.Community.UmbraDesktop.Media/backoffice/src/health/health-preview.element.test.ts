import { expect, fixture, html } from '@open-wc/testing';
import './health-preview.element.js';
import type { UmbraDesktopHealthPreviewElement } from './health-preview.element.js';
import { entriesOf } from './health-grid.js';
import type { HealthEntry } from './health-grid.js';
import { listsOf } from './health-model.js';
import { previewWidth } from './health-media.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { KEY_NAMES, MB, item, orphan, textOf, tick } from './health.test-helper.js';

/** The preview (design §16.5, mock scene 6): one picture over the grid, the facts, the verbs. */

/** Three unused items, a PDF among them, an item with no file, and an orphaned image. */
function entries(): HealthEntry[] {
  return entriesOf(
    listsOf(
      [
        item({ key: 'hero', name: 'banner-01.png', used: false, sizeBytes: 14 * MB, extension: 'png', url: '/media/h/banner-01.png', width: 5472, height: 3648, updatedUtc: '2023-05-10T09:00:00Z', path: '/Campaigns 2023' }),
        item({ key: 'spec', name: 'spec-2021.pdf', used: false, sizeBytes: 5 * MB, extension: 'pdf', mediaTypeAlias: 'File', url: '/media/s/spec-2021.pdf', path: '/Products/Archive' }),
        item({ key: 'persona', name: 'Persona', used: false, sizeBytes: null, extension: null, url: null, path: '/People' }),
      ],
      [orphan('1/x.jpg', 30)],
    ),
  );
}

/**
 * The preview on one entry.
 * @param current The entry shown.
 * @param options Whether the person is an administrator, and the entries.
 */
async function preview(current: string, options: { admin?: boolean; list?: HealthEntry[] } = {}) {
  const list = options.list ?? entries().filter((each) => each.kind === 'unused');
  const asked: Array<{ url: string; key?: string; edge: number }> = [];
  const sign = async (subjects: Array<{ url: string; key?: string }>, edge: number) => {
    for (const subject of subjects) asked.push({ ...subject, edge });
    return new Map(subjects.map((subject) => [subject.url, `${subject.url}?width=${edge}&rmode=max&hmac=s`]));
  };
  const events: Array<{ name: string; detail: unknown }> = [];
  const element = await fixture<UmbraDesktopHealthPreviewElement>(
    html`<umbradesktop-health-preview
      .entries=${list}
      .current=${current}
      .admin=${options.admin ?? true}
      .viewWidth=${700}
      .pixelRatio=${2}
      .signPreview=${sign}></umbradesktop-health-preview>`,
  );
  for (const name of ['health-preview-close', 'health-trash', 'health-delete', 'health-optimize', 'health-show-in-manager']) {
    element.addEventListener(name, (event) => events.push({ name, detail: (event as CustomEvent).detail }));
  }
  const settle = async () => {
    await tick();
    await element.updateComplete;
    await tick();
    await element.updateComplete;
  };
  await settle();
  const root = element.shadowRoot!;
  const button = (name: string) => root.querySelector<HTMLElement & { disabled: boolean }>(`uui-button[label="${name}"]`);
  return { element, root, asked, events, button, settle, text: () => textOf(root.querySelector('.meta')!) };
}

describe('the Media Cleanup preview', () => {
  it('asks for one signed picture, as wide as it draws at the device’s pixel ratio, uncropped', async () => {
    const { root, asked } = await preview('hero');
    const images = root.querySelectorAll('img');
    expect(images.length).to.equal(1);
    expect(asked).to.deep.equal([{ url: '/media/h/banner-01.png', key: 'hero', edge: previewWidth(700, 2) }]);
    expect(images[0].getAttribute('src')).to.equal(`/media/h/banner-01.png?width=${previewWidth(700, 2)}&rmode=max&hmac=s`);
  });

  it('never asks for more than the picture has', async () => {
    const small = entriesOf(listsOf([item({ key: 'small', used: false, width: 300, height: 200 })], []));
    const { asked } = await preview('small', { list: small });
    expect(asked[0].edge).to.equal(300);
  });

  it('signs an orphaned file through the add-on, without a key', async () => {
    const files = entries().filter((each) => each.kind === 'orphaned');
    const { asked } = await preview('orphan:1/x.jpg', { list: files });
    expect(asked).to.deep.equal([{ url: '/media/1/x.jpg', edge: previewWidth(700, 2) }]);
  });

  it('says the facts that decide: folder, size in pixels, last change, size, and that no page uses it', async () => {
    const { text } = await preview('hero');
    expect(text()).to.contain('banner-01.png');
    expect(text()).to.contain('Campaigns 2023');
    expect(text()).to.contain('5472 × 3648');
    expect(text()).to.contain(`last changed ${new Date('2023-05-10T09:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`);
    expect(text()).to.contain(formatBytes(14 * MB));
    expect(text()).to.contain('not used on any page');
  });

  it('says where an orphaned file is on disk', async () => {
    const files = entries().filter((each) => each.kind === 'orphaned');
    const { text } = await preview('orphan:1/x.jpg', { list: files });
    expect(text()).to.contain('/media/1 ·');
  });

  it('leaves the pixel size out when the item has none, and says a size is not known', async () => {
    const { text } = await preview('persona');
    expect(text()).not.to.contain('×');
    expect(text()).to.contain('Size unknown');
  });

  it('shows a PDF where the browser can, on the file itself', async () => {
    const { root, asked } = await preview('spec');
    const pdf = root.querySelector('object')!;
    expect(pdf.getAttribute('type')).to.equal('application/pdf');
    expect(pdf.getAttribute('data')).to.equal('/media/s/spec-2021.pdf');
    expect(asked).to.deep.equal([]);
  });

  it('shows an icon for an item with no file, and asks nothing', async () => {
    const { root, asked } = await preview('persona');
    expect(root.querySelector('img')).to.equal(null);
    expect(root.querySelector('.picture uui-icon')).not.to.equal(null);
    expect(asked).to.deep.equal([]);
  });

  it('steps through the grid’s order with arrows that stop at the ends', async () => {
    const { element, button, settle } = await preview('hero');
    expect(button('Previous')!.disabled).to.equal(true);
    button('Next')!.click();
    await settle();
    expect(element.current).to.equal('spec');
    button('Next')!.click();
    await settle();
    expect(element.current).to.equal('persona');
    expect(button('Next')!.disabled).to.equal(true);
  });

  it('closes on a click beside it, not on the picture, and from Close', async () => {
    const { root, events, button, settle } = await preview('hero');
    root.querySelector<HTMLElement>('.picture')!.click();
    expect(events).to.deep.equal([]);
    root.querySelector<HTMLElement>('.backdrop')!.click();
    expect(events.map((each) => each.name)).to.deep.equal(['health-preview-close']);
    button('Close')!.click();
    await settle();
    expect(events.map((each) => each.name)).to.deep.equal(['health-preview-close', 'health-preview-close']);
  });

  it('moves to the next at once after Move to recycle bin, so it works one by one', async () => {
    const { element, events, button, settle } = await preview('hero');
    button('Move to recycle bin')!.click();
    await settle();
    expect(events[0]).to.deep.include({ name: 'health-trash' });
    expect((events[0].detail as { ids: string[] }).ids).to.deep.equal(['hero']);
    expect(element.current).to.equal('spec');
  });

  it('moves to the one before at the end, and closes when nothing is left', async () => {
    const { element, events, button, settle } = await preview('persona');
    button('Move to recycle bin')!.click();
    await settle();
    expect(element.current).to.equal('spec');
    const one = entries().filter((each) => each.id === 'hero');
    const last = await preview('hero', { list: one });
    last.button('Move to recycle bin')!.click();
    await last.settle();
    expect(last.events.map((each) => each.name)).to.deep.equal(['health-trash', 'health-preview-close']);
    expect(events.length).to.equal(1);
  });

  it('asks before Delete, and moves on only once the file has gone', async () => {
    const files = [...entries().filter((each) => each.kind === 'orphaned'), ...entriesOf(listsOf([], [orphan('2/y.png', 10)]))];
    const { element, events, button, settle } = await preview('orphan:1/x.jpg', { list: files });
    button('Delete')!.click();
    await settle();
    expect(events.map((each) => each.name)).to.deep.equal(['health-delete']);
    expect(element.current, 'the window asks first; nothing has gone yet').to.equal('orphan:1/x.jpg');
    element.entries = files.filter((each) => each.id !== 'orphan:1/x.jpg');
    await settle();
    expect(element.current).to.equal('orphan:2/y.png');
  });

  it('greys Delete out for someone who is not an administrator, and says why', async () => {
    const files = entries().filter((each) => each.kind === 'orphaned');
    const { button, text } = await preview('orphan:1/x.jpg', { list: files, admin: false });
    expect(button('Delete')!.disabled).to.equal(true);
    expect(text()).to.contain('Only an administrator can delete files.');
  });

  it('offers Optimize on an oversized image, and moves on', async () => {
    const big = entriesOf(listsOf([item({ key: 'b1', sizeBytes: 3 * MB }), item({ key: 'b2', sizeBytes: 4 * MB })], []));
    const { element, events, button, settle } = await preview('b2', { list: big });
    button('Optimize')!.click();
    await settle();
    expect(events[0]).to.deep.include({ name: 'health-optimize' });
    expect(element.current).to.equal('b1');
  });

  it('offers Show in Media Manager for an item, and not for an orphaned file, which is none', async () => {
    const { button, events, settle } = await preview('hero');
    button('Show in Media Manager')!.click();
    await settle();
    expect((events[0].detail as { entry: HealthEntry }).entry.id).to.equal('hero');
    const files = entries().filter((each) => each.kind === 'orphaned');
    const file = await preview('orphan:1/x.jpg', { list: files });
    expect(file.button('Show in Media Manager')).to.equal(null);
  });

  it('has no edit view, no Image Editor, and names no key', async () => {
    const { element, text } = await preview('hero');
    expect(textOf(element)).not.to.match(/edit/i);
    expect(text()).not.to.match(KEY_NAMES);
  });
});
