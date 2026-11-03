import { expect, fixture, html } from '@open-wc/testing';
import './optimize-window.element.js';
import type { UmbraDesktopOptimizeWindowElement } from './optimize-window.element.js';
import { OptimizeRunStore } from './run-store.js';
import { library, until } from './run-fixtures.test-helper.js';
import type { OptimizeFilesRequest, OptimizeUploadResult } from './types.js';

/**
 * The Optimize images window on files (#179, mock scenes U3 to U5): files dropped into a Media
 * Manager that broke the site's media guidelines, set from the guidelines, optimized and uploaded one
 * at a time. The store underneath is real; its optimizer shrinks every file but one called broken.
 */

/**
 * A window on a new run on three dropped files.
 * @param upload The caller's upload.
 * @returns The window, its store and its run.
 */
async function open(upload: (file: File) => Promise<OptimizeUploadResult> = async () => ({ ok: true })) {
  const lib = library([], {
    optimize: async (file, options) => {
      if (file.name.startsWith('broken')) return { status: 'failed', message: 'This browser could not read the picture.' };
      const before = { width: 6000, height: 4000, size: 13_000_000, format: 'jpeg' };
      const out = new File(['small'], file.name.replace(/\.png$/, '.webp'), { type: 'image/webp' });
      return { status: 'optimized', file: out, before, after: { width: 2560, height: 1707, size: 612_000, format: options.format === 'keep' ? 'jpeg' : options.format } };
    },
  });
  const store = new OptimizeRunStore(lib.deps);
  const request: OptimizeFilesRequest = {
    files: [
      { file: new File(['a'], 'DSC_0412.jpg', { type: 'image/jpeg' }), kind: 'jpeg', fix: ['size', 'location'] },
      { file: new File(['b'], 'broken.jpg', { type: 'image/jpeg' }), kind: 'jpeg', fix: ['size'] },
      { file: new File(['c'], 'team-day.png', { type: 'image/png' }), kind: 'png-photo', fix: ['size', 'format'] },
    ],
    settings: { resize: { maxWidth: 2560, maxHeight: 2560 }, formats: { 'png-photo': 'webp' }, quality: 80, removeLocation: true },
    destination: { name: 'Products', path: ['Shop', 'Products'] },
    note: 'Set from the media guidelines.',
    upload,
  };
  const { id, report } = store.createFiles(request);
  const wrapper = await fixture<HTMLDivElement>(html`<div style="width: 640px; height: 760px; position: relative"></div>`);
  const told = { tasks: [] as Array<Record<string, unknown>>, titles: [] as string[] };
  wrapper.addEventListener('umbradesktop-task', (event) => told.tasks.push((event as CustomEvent).detail));
  wrapper.addEventListener('umbradesktop-app-title', (event) => told.titles.push((event as CustomEvent).detail.title));
  const element = document.createElement('umbradesktop-media-optimize-images') as UmbraDesktopOptimizeWindowElement;
  element.store = store;
  element.location = id;
  element.style.cssText = 'position: absolute; inset: 0';
  wrapper.appendChild(element);
  await until(() => !!element.shadowRoot?.querySelector('.page'));
  await element.updateComplete;
  return { element, store, id, report, told };
}

/**
 * An upload held until the test lets go, so the window can be looked at while the run is going.
 * @returns The upload, and how to let it go.
 */
function held() {
  let letGo!: () => void;
  const gate = new Promise<void>((resolve) => (letGo = resolve));
  return { upload: async (): Promise<OptimizeUploadResult> => (await gate, { ok: true }), letGo };
}

/**
 * Something in the window's shadow root.
 * @param element The window.
 * @param selector What to find.
 * @returns It.
 */
function $(element: HTMLElement, selector: string): HTMLElement {
  const found = element.shadowRoot!.querySelector(selector) as HTMLElement | null;
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

/**
 * The text of something in the window, spaces collapsed.
 * @param element The window.
 * @param selector What to read.
 */
const text = (element: HTMLElement, selector: string) => $(element, selector).textContent!.replace(/\s+/g, ' ').trim();

describe('the Optimize images window on files: starting', () => {
  it('starts at once on the settings it was given, with no settings page to confirm', async () => {
    const { element, store, id, told } = await open(held().upload);
    expect(store.get(id)!.phase).to.equal('running');
    expect(element.shadowRoot!.querySelector('.page.settings') === null).to.equal(true);
    expect(element.shadowRoot!.querySelector('.page.run') !== null).to.equal(true);
    expect(told.titles).to.deep.equal(['Optimize and upload: Products (3)']);
  });

  it('says what it does to the files, where they go, and where the settings came from', async () => {
    const { element } = await open(held().upload);
    expect(text(element, '.sets')).to.equal('Resize to 2560 × 2560 · PNG photo to WebP at 80 · location removed · uploading to Products');
    expect(text(element, '.run .note')).to.equal('Set from the media guidelines.');
  });

  it("shows each file's own picture, since there is no media item to ask for one", async () => {
    const { element } = await open(held().upload);
    const thumbs = [...element.shadowRoot!.querySelectorAll<HTMLImageElement>('.row img')];
    expect(thumbs).to.have.length(3);
    expect(thumbs[0].src).to.match(/^blob:/);
  });
});

describe('the Optimize images window on files: the run', () => {
  it('uploads each file as it is done, and says how many went to the folder', async () => {
    const uploaded: string[] = [];
    const { element, store, id, report } = await open(async (file) => (uploaded.push(file.name), { ok: true }));
    await report;
    await element.updateComplete;
    expect(uploaded).to.deep.equal(['DSC_0412.jpg', 'team-day.webp']);
    expect(store.get(id)!.phase).to.equal('ended');
    expect(text(element, '.run-head .heading')).to.equal('2 uploaded to Products');
    expect(text(element, '.sets')).to.equal('Resize to 2560 × 2560 · PNG photo to WebP at 80 · location removed · uploading to Products');
  });

  it('offers Retry and Upload the original on a file that failed, and says nothing was uploaded', async () => {
    const uploaded: string[] = [];
    const { element, store, id, report } = await open(async (file) => (uploaded.push(file.name), { ok: true }));
    await report;
    await element.updateComplete;
    const failed = $(element, '.row[data-status="failed"]');
    expect(failed.querySelector('em')!.textContent).to.equal('This browser could not read the picture. Nothing was uploaded.');
    expect([...failed.querySelectorAll('button')].map((button) => button.textContent!.trim())).to.deep.equal(['Retry', 'Upload the original']);
    // The run's header has no Retry failed beside them: one way to retry, on the row.
    expect(element.shadowRoot!.querySelector('[data-action="retry"]') === null).to.equal(true);
    (failed.querySelector('[data-action="original"]') as HTMLButtonElement).click();
    await until(() => !!store.get(id)!.items[1].uploaded);
    await element.updateComplete;
    expect(uploaded).to.deep.equal(['DSC_0412.jpg', 'team-day.webp', 'broken.jpg']);
    expect(text(element, '.row:nth-child(2) .status')).to.equal('Uploaded as it was');
  });

  it('never offers to optimize the animated files again: they were already uploaded as they were', async () => {
    const { element, report } = await open();
    await report;
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('[data-action="animated"]') === null).to.equal(true);
  });

  it('shows progress on its taskbar button while it runs', async () => {
    const hold = held();
    const { told, report } = await open(hold.upload);
    expect(told.tasks.some((task) => task.state === 'running' && task.total === 3)).to.equal(true);
    hold.letGo();
    await report;
  });

  it('lets go of the files\' pictures when it closes', async () => {
    const { element } = await open();
    const src = (element.shadowRoot!.querySelector('.row img') as HTMLImageElement).src;
    element.remove();
    const still = await fetch(src).then(
      () => true,
      () => false,
    );
    expect(still).to.equal(false);
  });
});
