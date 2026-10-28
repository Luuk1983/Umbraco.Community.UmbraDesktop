import { expect, fixture, html } from '@open-wc/testing';
import './optimize-window.element.js';
import type { UmbraDesktopOptimizeWindowElement } from './optimize-window.element.js';
import { OptimizeRunStore } from './run-store.js';
import { image, library, until } from './run-fixtures.test-helper.js';
import type { Stored } from './run-fixtures.test-helper.js';
import type { OptimizeReport } from './types.js';

/**
 * The Optimize images window (design §5, scenes 2B to 4B): a view of one run, its settings first,
 * then its rows as it runs, then what came of it. The store underneath is real; the media library
 * under the store is the fake one.
 */

/** Three images in Products, beside a folder and two PDFs. */
const SELECTION = (): Stored[] => [
  { ...image('design'), facts: { ...image('design').facts, mediaType: 'folder', hasUrl: false, extension: undefined } },
  image('banjo'),
  image('bowling'),
  { ...image('report'), facts: { ...image('report').facts, extension: 'pdf' } },
  { ...image('invoice'), facts: { ...image('invoice').facts, extension: 'pdf' } },
  image('jumpsuit'),
];

/** Every key in {@link SELECTION}, in order. */
const KEYS = ['design', 'banjo', 'bowling', 'report', 'invoice', 'jumpsuit'];

/**
 * A window on a new run.
 * @param items What the library holds.
 * @param keys What is selected.
 * @param start Whether the run starts at once.
 * @param lib A library a test has already set up.
 * @returns The window, its store, its run's report, the library and what the window told the desktop.
 */
async function open(items = SELECTION(), keys = KEYS, start = false, lib = library(items)) {
  const store = new OptimizeRunStore(lib.deps);
  const { id, report } = store.create({ items: keys, start });
  const wrapper = await fixture<HTMLDivElement>(html`<div style="width: 640px; height: 760px; position: relative"></div>`);
  const told = { tasks: [] as Array<Record<string, unknown>>, titles: [] as string[], closes: 0 };
  wrapper.addEventListener('umbradesktop-task', (event) => told.tasks.push((event as CustomEvent).detail));
  wrapper.addEventListener('umbradesktop-app-title', (event) => told.titles.push((event as CustomEvent).detail.title));
  wrapper.addEventListener('umbradesktop-close-request', () => (told.closes += 1));
  const element = document.createElement('umbradesktop-media-optimize-images') as UmbraDesktopOptimizeWindowElement;
  element.store = store;
  element.thumbnails = async () => new Map();
  element.location = id;
  element.style.cssText = 'position: absolute; inset: 0';
  wrapper.appendChild(element);
  await until(() => !!store.get(id) && store.get(id)!.phase !== 'preparing');
  await element.updateComplete;
  return { element, store, id, report, lib, told, wrapper };
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

/**
 * Click something and let the window draw again.
 * @param element The window.
 * @param selector What to click.
 */
async function click(element: UmbraDesktopOptimizeWindowElement, selector: string): Promise<void> {
  $(element, selector).click();
  await element.updateComplete;
}

/**
 * The last of a list: what the window told the desktop most recently. (`Array.at` is ES2022, and this
 * package compiles against ES2020.)
 * @param list The list.
 * @returns Its last entry.
 */
const last = <T>(list: T[]): T | undefined => list[list.length - 1];

/** Whether a switch is on. */
const on = (element: HTMLElement, name: string) => $(element, `[data-switch="${name}"]`).getAttribute('aria-checked') === 'true';

describe('the Optimize images window: settings', () => {
  /** Design §16, mock R5: the window says what it optimizes and from where before any setting. */
  it('introduces the run: where the images come from, how many, and what is left out', async () => {
    const { element } = await open();
    expect(text(element, '.intro .from')).to.equal('Media / Shop / Products');
    expect(text(element, '.intro .heading')).to.equal('Optimize 3 images');
    expect(element.shadowRoot!.querySelectorAll('.intro .strip .thumb').length).to.equal(3);
    const skips = [...element.shadowRoot!.querySelectorAll('.skips p')].map((p) => p.textContent!.trim());
    expect(skips).to.deep.equal(['1 folder in the selection is skipped.', '2 files are not images and are skipped.']);
  });

  it('names its window after the folder the images are in', async () => {
    const { told } = await open();
    expect(last(told.titles)).to.equal('Optimize images: Products (3)');
  });

  it('puts what to do and where the result goes in two sections', async () => {
    const { element } = await open();
    const sections = [...element.shadowRoot!.querySelectorAll('section.part')].map((section) => section.querySelector('h3')!.textContent!.trim());
    expect(sections).to.deep.equal(['What to do', 'Where the result goes']);
    expect(text(element, '[data-switch="resize"]')).to.equal('Resize to a maximum width or height');
    expect(text(element, '[data-switch="convert"]')).to.equal('Convert to another format or quality');
    expect(text(element, '[data-switch="metadata"]')).to.equal('Remove location, camera and date');
  });

  it('starts on the defaults: resize to 2560 × 2560, WebP at 80, replacing the originals', async () => {
    const { element } = await open();
    expect(on(element, 'resize') && on(element, 'convert') && on(element, 'metadata')).to.equal(true);
    expect(($(element, 'input[name="maxWidth"]') as HTMLInputElement).value).to.equal('2560');
    expect(($(element, 'input[name="maxHeight"]') as HTMLInputElement).value).to.equal('2560');
    expect($(element, '[data-format="webp"]').getAttribute('aria-pressed')).to.equal('true');
    expect(($(element, 'input[name="quality"]') as HTMLInputElement).value).to.equal('80');
    expect(($(element, 'input[name="qualityNumber"]') as HTMLInputElement).value).to.equal('80');
    expect($(element, '[data-save="replace"]').getAttribute('aria-checked')).to.equal('true');
    expect($(element, '[data-save="copy"]').getAttribute('aria-checked')).to.equal('false');
  });

  /** Mock R5B: a switch that is off shows its name only, not its options greyed. */
  it('hides the settings of a switch that is off', async () => {
    const { element } = await open();
    await click(element, '[data-switch="resize"]');
    expect(element.shadowRoot!.querySelector('input[name="maxWidth"]') === null).to.equal(true);
    await click(element, '[data-switch="convert"]');
    expect(element.shadowRoot!.querySelector('[data-format="webp"]') === null).to.equal(true);
    await click(element, '[data-switch="resize"]');
    expect(($(element, 'input[name="maxWidth"]') as HTMLInputElement).value, 'its numbers kept').to.equal('2560');
  });

  /** Owner, 2026-10-25: the explanations behind an (i), opened under their row, not always on screen. */
  it('explains a setting behind its info button, and closes it again', async () => {
    const { element } = await open();
    expect(element.shadowRoot!.querySelector('.explain') === null).to.equal(true);
    await click(element, '[data-info="resize"]');
    expect($(element, '[data-info="resize"]').getAttribute('aria-expanded')).to.equal('true');
    expect(text(element, '.explain')).to.include('Never made larger');
    await click(element, '[data-info="resize"]');
    expect(element.shadowRoot!.querySelector('.explain') === null).to.equal(true);
  });

  /** D8: a canvas encode drops metadata anyway, so the switch never claims it is kept. */
  it('locks Remove metadata on while Resize or Convert is on, and says why behind its info button', async () => {
    const { element } = await open();
    const metadata = $(element, '[data-switch="metadata"]') as HTMLButtonElement;
    expect(metadata.disabled).to.equal(true);
    await click(element, '[data-info="metadata"]');
    expect(text(element, '.explain')).to.include('Always removed when an image is resized or converted');
    await click(element, '[data-switch="resize"]');
    await click(element, '[data-switch="convert"]');
    expect(metadata.disabled).to.equal(false);
    expect(on(element, 'metadata')).to.equal(true);
    expect(text(element, '.explain')).to.include('the quality stays exactly the same');
  });

  it('greys Quality out for PNG, slider and number both, rather than hiding it', async () => {
    const { element } = await open();
    await click(element, '[data-format="png"]');
    expect(($(element, 'input[name="quality"]') as HTMLInputElement).disabled).to.equal(true);
    expect(($(element, 'input[name="qualityNumber"]') as HTMLInputElement).disabled).to.equal(true);
    await click(element, '[data-format="jpeg"]');
    expect(($(element, 'input[name="quality"]') as HTMLInputElement).disabled).to.equal(false);
  });

  /** Design §16, mock R5C: the warning comes before the run, from what the files are. */
  it('warns before a run that will make the files larger', async () => {
    const { element } = await open();
    expect(element.shadowRoot!.querySelector('.grow') === null).to.equal(true);
    await click(element, '[data-format="png"]');
    expect(text(element, '.grow')).to.match(/^3 images will get much larger\./);
    await click(element, '[data-format="webp"]');
    expect(element.shadowRoot!.querySelector('.grow') === null).to.equal(true);
  });

  it('says what the button does, and disables it with every switch off', async () => {
    const { element } = await open();
    const start = $(element, '[data-action="start"]') as HTMLButtonElement;
    expect(start.textContent!.trim()).to.equal('Optimize 3 images');
    await click(element, '[data-switch="resize"]');
    await click(element, '[data-switch="convert"]');
    expect(start.disabled).to.equal(false);
    await click(element, '[data-switch="metadata"]');
    expect(start.disabled).to.equal(true);
  });

  it('warns before replacing images used elsewhere, under Replace, and only then', async () => {
    const { element, store, id } = await open();
    await until(() => store.get(id)!.usage !== undefined);
    await element.updateComplete;
    expect(text(element, '.usage')).to.equal('2 of these images are used in 5 places. Replacing changes them everywhere. Show where');
    await click(element, '[data-save="copy"]');
    expect(element.shadowRoot!.querySelector('.usage') === null).to.equal(true);
  });

  /** Mock R6: the places, not only their count. */
  it('shows where the images are used, image by image', async () => {
    const { element, store, id } = await open();
    await until(() => store.get(id)!.usage !== undefined);
    await element.updateComplete;
    let shown: unknown;
    element.showWhere = async (usage) => void (shown = usage);
    await click(element, '[data-action="show-where"]');
    expect(shown).to.deep.equal({
      images: 2,
      places: 5,
      used: [
        { unique: 'banjo', name: 'Banjo', count: 3 },
        { unique: 'bowling', name: 'Bowling', count: 2 },
      ],
    });
  });

  it('cancels as not started, and closes its window', async () => {
    const { element, report, told, lib } = await open();
    await click(element, '[data-action="cancel"]');
    expect((await report).status).to.equal('not-started');
    expect(told.closes).to.equal(1);
    expect(lib.log).to.deep.equal([]);
  });

  it('closes itself when its run is gone, as after a reload', async () => {
    const wrapper = await fixture<HTMLDivElement>(html`<div></div>`);
    let closes = 0;
    wrapper.addEventListener('umbradesktop-close-request', () => (closes += 1));
    const element = document.createElement('umbradesktop-media-optimize-images') as UmbraDesktopOptimizeWindowElement;
    element.store = new OptimizeRunStore(library([]).deps);
    element.location = 'run-from-before-a-reload';
    wrapper.appendChild(element);
    await until(() => closes > 0);
    expect(closes).to.equal(1);
  });
});

describe('the Optimize images window: the run', () => {
  /**
   * Owner, 2026-10-25: a full bar at the end looked like the run was still finishing. The bar is there
   * only while it runs; a result line with a tick, or the warning colour when the files grew, follows.
   */
  it('ends without the progress bar, on a result that says how it went', async () => {
    const lib = library(SELECTION());
    lib.holdSaves();
    const { element, report, store, id } = await open(undefined, undefined, false, lib);
    await click(element, '[data-action="start"]');
    await until(() => lib.saves.length === 1);
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('.bar') !== null, 'a bar while it runs').to.equal(true);
    lib.releaseSaves();
    await report;
    await until(() => store.get(id)!.phase === 'ended');
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('.bar') === null, 'no bar once it ended').to.equal(true);
    expect($(element, '.result').dataset.tone).to.equal('saved');
  });

  /** Found in the real check, 2026-10-25: three unchanged images ended on "0 B saved, 0% of what...". */
  it('says nothing about savings when nothing was optimized', async () => {
    const lib = library([image('banjo')]);
    lib.byKey.get('banjo')!.content = 'optimized';
    const { element, report } = await open(undefined, ['banjo'], true, lib);
    await report;
    await element.updateComplete;
    expect(text(element, '.heading')).to.equal('1 unchanged');
    expect(element.shadowRoot!.querySelector('.meta') === null, 'no savings line').to.equal(true);
  });

  it('ends in the warning colour when the files grew', async () => {
    const lib = library([image('banjo')], {
      optimize: async (file) => ({
        status: 'optimized',
        file: new File(['x'], file.name.replace(/\.jpg$/, '.png'), { type: 'image/png' }),
        before: { width: 2560, height: 1707, size: 600_000, format: 'webp' },
        after: { width: 2560, height: 1707, size: 8_000_000, format: 'png' },
      }),
    });
    const { element, report } = await open(undefined, ['banjo'], true, lib);
    await report;
    await element.updateComplete;
    expect($(element, '.result').dataset.tone).to.equal('grew');
    expect(text(element, '.meta')).to.match(/larger than before/);
  });

  it("shows each image's before and after, and what was saved", async () => {
    const { element, report } = await open();
    await click(element, '[data-action="start"]');
    await report;
    await element.updateComplete;
    const rows = [...element.shadowRoot!.querySelectorAll('.row')];
    expect(rows.map((row) => row.getAttribute('data-status'))).to.deep.equal(['skipped', 'optimized', 'optimized', 'skipped', 'skipped', 'optimized']);
    const banjo = rows[1].textContent!.replace(/\s+/g, ' ');
    expect(banjo).to.include('Banjo');
    expect(banjo).to.include('6000 × 4000 JPEG, 8 MB → 2560 × 1707 WebP, 400 KB');
    expect(banjo).to.include('−95%');
    expect(rows[0].textContent).to.include('A folder');
    expect(text(element, '.heading')).to.equal('3 optimized');
    expect(text(element, '.meta')).to.match(/^22[.,]8 MB saved, 95% of what the optimized images were$/);
    expect(text(element, '.sets')).to.equal('Resize to 2560 × 2560 · WebP at 80 · metadata removed · replacing the originals');
  });

  /**
   * Found in the real run (design §15): a 41.7 MB PNG became a 21 KB WebP, which rounds to −100% and
   * reads as a file that is gone. Anything left is at most −99%.
   */
  it('never says an image shrank by 100%', async () => {
    const lib = library([image('biker')], {
      optimize: async (file) => ({
        status: 'optimized',
        file: new File(['x'], file.name.replace(/\.jpg$/, '.webp'), { type: 'image/webp' }),
        before: { width: 5184, height: 3456, size: 41_700_000, format: 'png' },
        after: { width: 2560, height: 1707, size: 21_000, format: 'webp' },
      }),
    });
    const { element, report } = await open(undefined, ['biker'], true, lib);
    await report;
    await element.updateComplete;
    expect(text(element, '.row .saved')).to.equal('−99%');
  });

  it('shows progress on its taskbar button while it runs, and ends it', async () => {
    const lib = library(SELECTION());
    lib.holdSaves();
    const { element, store, id, told, report } = await open(undefined, undefined, false, lib);
    await click(element, '[data-action="start"]');
    await until(() => lib.saves.length === 1);
    await element.updateComplete;
    expect(text(element, '.heading')).to.equal('Optimizing 3 images');
    expect(last(told.tasks)).to.deep.include({ state: 'running', completed: 0, total: 3, failed: 0, label: 'Optimizing' });
    lib.releaseSaves();
    await report;
    await until(() => store.get(id)!.phase === 'ended');
    await element.updateComplete;
    expect(last(told.tasks)).to.deep.include({ state: 'done' });
  });

  it('keeps the failure on its taskbar button until the window is looked at', async () => {
    const lib = library(SELECTION());
    lib.answerSaves((request) => (request.existing === 'bowling' ? { ok: false, message: 'The folder does not allow WebP.' } : undefined));
    const { element, report, told } = await open(undefined, undefined, false, lib);
    await click(element, '[data-action="start"]');
    await report;
    await element.updateComplete;
    expect(last(told.tasks)).to.deep.include({ state: 'failed', failed: 1, total: 3 });
    expect(text(element, '.heading')).to.equal('2 optimized, 1 failed');
    expect(element.shadowRoot!.querySelector('.row[data-status="failed"]')!.textContent).to.include('The folder does not allow WebP.');
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    await element.updateComplete;
    expect(last(told.tasks)).to.deep.include({ state: 'done' });
  });

  it('offers Retry failed when something failed, and Run the rest after a cancel', async () => {
    const lib = library(SELECTION());
    lib.holdSaves();
    const { element, report, store, id } = await open(undefined, undefined, false, lib);
    await click(element, '[data-action="start"]');
    await until(() => lib.saves.length === 1);
    await click(element, '[data-action="cancel-run"]');
    lib.releaseSaves();
    await report;
    await until(() => store.get(id)!.phase === 'ended');
    await element.updateComplete;
    expect(text(element, '.heading')).to.equal('Cancelled after 1 of 3');
    expect(element.shadowRoot!.querySelector('[data-action="retry"]') === null).to.equal(true);
    await click(element, '[data-action="rest"]');
    await until(() => store.get(id)!.phase === 'ended' && store.get(id)!.outcome === 'finished');
    expect(store.get(id)!.items.filter((item) => item.status === 'optimized').length).to.equal(3);
  });

  it("puts the run's buttons in a bar at the bottom, Close last on the right, as Umbraco's dialogs do", async () => {
    const lib = library(SELECTION());
    lib.holdSaves();
    const { element, report, store, id } = await open(undefined, undefined, false, lib);
    await click(element, '[data-action="start"]');
    await until(() => lib.saves.length === 1);
    await element.updateComplete;
    const foot = () => element.shadowRoot!.querySelector('.page.run > .foot');
    expect(foot()?.querySelector('[data-action="cancel-run"]') !== null, 'Cancel in the bar while it runs').to.equal(true);
    lib.releaseSaves();
    await report;
    await until(() => store.get(id)!.phase === 'ended');
    await element.updateComplete;
    const buttons = [...foot()!.querySelectorAll<HTMLElement>('[data-action]')];
    expect(buttons[buttons.length - 1].dataset.action).to.equal('close');
    expect(element.shadowRoot!.querySelector('.run-head [data-action]') === null, 'none left in the header').to.equal(true);
    expect(element.shadowRoot!.querySelector('.page.run')!.lastElementChild === foot()).to.equal(true);
  });

  it('offers to optimize the animated images too, after asking', async () => {
    const items = [image('banjo'), { ...image('spinner'), fileName: 'spinner.gif' }];
    const { element, report, store, id } = await open(items, ['banjo', 'spinner']);
    let asked = 0;
    element.confirmAnimated = async (count) => ((asked = count), true);
    await click(element, '[data-action="start"]');
    await report;
    await element.updateComplete;
    await click(element, '[data-action="animated"]');
    expect(asked).to.equal(1);
    await until(() => store.get(id)!.phase === 'ended' && store.get(id)!.items[1].status === 'optimized');
  });

  /** Review Focus 5, through the window: closing it while it runs is Cancel (D7). */
  it('cancels its run when the window closes while it runs', async () => {
    const lib = library(SELECTION());
    lib.holdSaves();
    const { element, report, wrapper } = await open(undefined, undefined, false, lib);
    await click(element, '[data-action="start"]');
    await until(() => lib.saves.length === 1);
    wrapper.removeChild(element);
    lib.releaseSaves();
    const done: OptimizeReport = await report;
    expect(done.status).to.equal('cancelled');
  });
});
