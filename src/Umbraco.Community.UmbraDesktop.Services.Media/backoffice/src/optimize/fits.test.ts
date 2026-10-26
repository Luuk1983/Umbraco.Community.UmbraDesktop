import { expect, fixture, html } from '@open-wc/testing';
import './optimize-window.element.js';
import type { UmbraDesktopOptimizeWindowElement } from './optimize-window.element.js';
import { OPTIMIZE_CONTENT_SIZE, OPTIMIZE_MIN_CONTENT_SIZE, OPTIMIZE_SETTINGS_HEIGHT } from './constants.js';
import { OptimizeRunStore } from './run-store.js';
import { image, library, until } from './run-fixtures.test-helper.js';

/**
 * The Optimize images window at the sizes its manifest gives it (design §5.4), under every theme id
 * and none: the settings at their tallest fit the box it opens at with nothing scrolling, every control
 * inside it with a size and reachable by Tab; in the smallest box the footer stays and the settings
 * scroll (#176, owner); and at the size it opens, a row's facts fit on one line.
 *
 * The repository's "derive numbers, then measure them" rule as a test, modelled on the file menu's own
 * `fits.test.ts`. Theme ids are stamped as attributes only, as there: what can change the layout per
 * theme is the window's own branches, and the palettes only colour it.
 */

/** The published theme ids, plus no theme at all. */
const THEMES = [undefined, 'umbraco', 'umbraco4', 'macos', 'win11', 'win98'];

/**
 * A window in a box, on a run of nine photos (a folder and a PDF beside them), as the mock's.
 * @param size The box.
 * @param theme The theme id, or none.
 * @param start Whether the run runs.
 * @returns The window, and its store and run.
 */
async function mount(size: { w: number; h: number }, theme: string | undefined, start: boolean) {
  const names = ['knitted', 'banjo', 'jumpsuit', 'bowling', 'pingpong', 'unicorn', 'tattoo', 'biker', 'ravi'];
  const items = [
    { ...image('design'), facts: { ...image('design').facts, mediaType: 'folder', hasUrl: false, extension: undefined } },
    { ...image('report'), facts: { ...image('report').facts, extension: 'pdf' } },
    ...names.map((name) => image(name)),
  ];
  const lib = library(items, {
    references: async () => 3,
    optimize: async (file) => ({
      status: 'optimized',
      file: new File(['x'], file.name.replace(/\.jpg$/, '.webp'), { type: 'image/webp' }),
      before: { width: 5184, height: 3456, size: 21_300_000, format: 'png' },
      after: { width: 2560, height: 1707, size: 520_000, format: 'webp' },
    }),
  });
  const store = new OptimizeRunStore(lib.deps);
  const { id, report } = store.create({ items: ['design', 'report', ...names], start });
  const box = await fixture<HTMLDivElement>(html`<div style="position: relative; width: ${size.w}px; height: ${size.h}px; overflow: hidden"></div>`);
  const element = document.createElement('umbradesktop-media-optimize-images') as UmbraDesktopOptimizeWindowElement;
  if (theme) element.setAttribute('data-umbradesktop-theme', theme);
  element.style.cssText = 'position: absolute; inset: 0';
  element.store = store;
  element.thumbnails = async () => new Map();
  element.location = id;
  box.appendChild(element);
  await until(() => store.get(id)!.phase !== 'preparing' && (start || store.get(id)!.usage !== undefined));
  if (start) await report;
  await element.updateComplete;
  if (!start) {
    // At their tallest: PNG for photos shows the larger-files warning (design §16).
    (element.shadowRoot!.querySelector('[data-format="png"]') as HTMLButtonElement).click();
    await element.updateComplete;
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return { box, element };
}

for (const theme of THEMES) {
  it(`fits the settings at their tallest into OPTIMIZE_CONTENT_SIZE under ${theme ?? 'no theme'}`, async () => {
    const { box, element } = await mount(OPTIMIZE_CONTENT_SIZE, theme, false);
    const root = element.shadowRoot!;
    expect(root.querySelector('.usage') !== null, 'the used-elsewhere note shows, as at its tallest').to.equal(true);
    expect(root.querySelector('.grow') !== null, 'the larger-files warning shows, as at its tallest').to.equal(true);
    const bounds = element.getBoundingClientRect();
    const body = root.querySelector('.body') as HTMLElement;
    expect(body.scrollHeight, 'no scroll down').to.be.at.most(body.clientHeight);
    expect(body.scrollWidth, 'no sideways scroll').to.be.at.most(body.clientWidth);
    const controls = [...root.querySelectorAll<HTMLElement>('button, input')];
    expect(controls.length, 'controls found').to.be.greaterThan(12);
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      const name = control.dataset.switch ?? control.dataset.format ?? control.dataset.save ?? control.dataset.action ?? control.getAttribute('name');
      expect(rect.width * rect.height, `${name} has a size`).to.be.greaterThan(0);
      expect(rect.left, `${name} left`).to.be.at.least(bounds.left - 0.5);
      expect(rect.right, `${name} right`).to.be.at.most(bounds.right + 0.5);
      expect(rect.top, `${name} top`).to.be.at.least(bounds.top - 0.5);
      expect(rect.bottom, `${name} bottom`).to.be.at.most(bounds.bottom + 0.5);
      if (!(control as HTMLButtonElement).disabled) expect(control.tabIndex, `${name} reachable by Tab`).to.equal(0);
    }
    box.remove();
  });

  /**
   * The window can be made as low as an older screen needs (owner, 2026-10-26): the introduction and the
   * footer stay, and the settings between them scroll, so every control is still reachable.
   */
  it(`keeps the footer and scrolls the settings at OPTIMIZE_MIN_CONTENT_SIZE under ${theme ?? 'no theme'}`, async () => {
    const { box, element } = await mount(OPTIMIZE_MIN_CONTENT_SIZE, theme, false);
    expect(OPTIMIZE_MIN_CONTENT_SIZE.h, 'well below the settings at their tallest').to.be.below(OPTIMIZE_SETTINGS_HEIGHT / 2);
    const root = element.shadowRoot!;
    const bounds = element.getBoundingClientRect();
    const foot = (root.querySelector('.foot') as HTMLElement).getBoundingClientRect();
    expect(foot.height, 'the footer is drawn').to.be.greaterThan(0);
    expect(foot.bottom, 'the footer inside the window').to.be.at.most(bounds.bottom + 0.5);
    const body = root.querySelector('.body') as HTMLElement;
    expect(body.clientHeight, 'some settings show').to.be.greaterThan(100);
    expect(body.scrollHeight, 'the rest scroll').to.be.greaterThan(body.clientHeight);
    expect(body.scrollWidth, 'no sideways scroll').to.be.at.most(body.clientWidth);
    for (const control of [...body.querySelectorAll<HTMLElement>('button, input')]) {
      control.scrollIntoView({ block: 'nearest' });
      const rect = control.getBoundingClientRect();
      const view = body.getBoundingClientRect();
      const name = control.dataset.switch ?? control.dataset.format ?? control.dataset.save ?? control.getAttribute('name');
      expect(rect.top, `${name} scrolls into view`).to.be.at.least(view.top - 0.5);
      expect(rect.bottom, `${name} scrolls into view`).to.be.at.most(view.bottom + 0.5);
    }
    box.remove();
  });

  it(`keeps a run's buttons in view at OPTIMIZE_MIN_CONTENT_SIZE under ${theme ?? 'no theme'}`, async () => {
    const { box, element } = await mount(OPTIMIZE_MIN_CONTENT_SIZE, theme, true);
    const bounds = element.getBoundingClientRect();
    for (const button of [...element.shadowRoot!.querySelectorAll<HTMLElement>('.run-head button, .run-head uui-button, .foot button')]) {
      const rect = button.getBoundingClientRect();
      expect(rect.bottom, 'inside the window').to.be.at.most(bounds.bottom + 0.5);
    }
    box.remove();
  });

  it(`writes a row's facts on one line at OPTIMIZE_CONTENT_SIZE under ${theme ?? 'no theme'}`, async () => {
    const { box, element } = await mount(OPTIMIZE_CONTENT_SIZE, theme, true);
    const facts = element.shadowRoot!.querySelector('.row[data-status="optimized"] .name small') as HTMLElement;
    expect(facts.textContent!.replace(/\s+/g, ' ')).to.match(/5184 × 3456 PNG, 21[.,]3 MB → 2560 × 1707 WebP, 520 KB/);
    expect(facts.scrollWidth, 'not cut off').to.be.at.most(facts.clientWidth);
    const actions = element.shadowRoot!.querySelector('.run-head') as HTMLElement;
    expect(actions.getBoundingClientRect().height, 'the heading and its buttons on one line').to.be.below(48);
    box.remove();
  });
}
