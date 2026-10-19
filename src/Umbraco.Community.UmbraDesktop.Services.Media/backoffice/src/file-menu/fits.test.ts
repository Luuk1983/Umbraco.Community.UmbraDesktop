import { expect, fixture, html } from '@open-wc/testing';
import './file-menu.element.js';
import type { UmbraDesktopMediaFileMenuElement } from './file-menu.element.js';
import { FILE_MENU_MIN_SIZE } from './constants.js';
import type { FileMenuDeps } from './deps.js';
import type { FileMenuDocument } from './types.js';

/**
 * The file menu at the smallest box an app may give it (`FILE_MENU_MIN_SIZE`, published on the
 * developer page), under every theme id and none: Save as, its tallest panel, fills the box, and
 * every control in it (its footer's buttons too) is inside, has a size, and can be reached with Tab;
 * the menu's own commands as well.
 *
 * The repository's "derive numbers, then measure them" rule as a test, modelled on the add-ons' own
 * `fits.test.ts`. The constant derives the width from Save as's form; only rendering shows whether
 * the sum is the panel. The theme ids are stamped as attributes only, as the add-ons'
 * test does, because what can change the page's layout per theme is the page's own branches; the
 * palettes only colour it.
 */

/** The published theme ids, plus no theme at all. */
const THEMES = [undefined, 'umbraco', 'umbraco4', 'macos', 'win11', 'win98'];

/** A long name, so the widest labels are measured rather than the shortest. */
const DOC: FileMenuDocument = {
  unique: 'k1',
  name: 'Codegarden main stage, wide',
  folder: 'f1',
  folderName: 'Engage',
  updateDate: '2026-10-17T10:00:00Z',
  extension: 'jpg',
  width: 6000,
  height: 4000,
  bytes: 6_100_000,
};

/** Fakes that answer at once, so the page renders what it would in a backoffice. */
const deps: FileMenuDeps = {
  context: {
    open: async () => ({ status: 'cancelled' }),
    recent: async () => [],
    forgetRecent: () => undefined,
    save: async () => ({ ok: false }),
    pickSaveFolder: async () => ({ status: 'cancelled' }),
    confirmOverwrite: async () => false,
  },
  thumbnails: async () => new Map(),
  confirmDiscard: async () => true,
};

/**
 * Measure the file menu in a box, on Save as, in one mode.
 * @param size The box.
 * @param theme The theme id, or none.
 * @param mode Which of Save as's two forms, since each has rows the other lacks.
 */
async function measure(size: { w: number; h: number }, theme: string | undefined, mode: 'replace' | 'copy') {
  const box = await fixture<HTMLDivElement>(
    html`<div style="position: relative; width: ${size.w}px; height: ${size.h}px; overflow: hidden"></div>`,
  );
  const element = document.createElement('umbradesktop-media-file-menu') as UmbraDesktopMediaFileMenuElement;
  if (theme) element.setAttribute('data-umbradesktop-theme', theme);
  element.style.cssText = 'position: absolute; inset: 0';
  element.deps = deps;
  element.document = DOC;
  element.encode = async () => new Blob([new Uint8Array(486_000)]);
  box.appendChild(element);
  // WebP, so the replace form shows the address warning, its tallest row.
  element.show('saveAs', { format: 'webp' });
  await element.updateComplete;
  if (mode === 'copy') {
    (element.shadowRoot!.querySelector('button[data-mode="copy"]') as HTMLButtonElement).click();
    await element.updateComplete;
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  // Where the panel ends up, not where its slide has got to.
  for (const animation of element.shadowRoot!.getAnimations()) animation.finish();

  const sheet = element.shadowRoot!.querySelector('.sheet.panel') as HTMLElement;
  const bounds = sheet.getBoundingClientRect();
  expect(bounds.width, 'the panel takes the whole box').to.equal(size.w);
  // Nothing scrolls at the smallest size: a panel that needs a scroll bar to reach a field is a panel
  // whose field the person may never find.
  const body = sheet.querySelector('.body') as HTMLElement;
  expect(body.scrollWidth, 'no sideways scroll').to.be.at.most(body.clientWidth);
  expect(body.scrollHeight, 'no scroll down').to.be.at.most(body.clientHeight);
  // The preview is not a control, but it is how the person sees what will be saved, so it is held to
  // the same rule as one.
  const controls = [...sheet.querySelectorAll<HTMLElement>('button, input, .preview')];
  expect(controls.length, 'controls found').to.be.greaterThan(10);
  for (const control of controls) {
    const rect = control.getBoundingClientRect();
    const name = control.dataset.mode ?? control.dataset.format ?? control.dataset.action ?? control.getAttribute('name');
    expect(rect.width * rect.height, `${name} has a size`).to.be.greaterThan(0);
    expect(rect.left, `${name} left`).to.be.at.least(bounds.left - 0.5);
    expect(rect.top, `${name} top`).to.be.at.least(bounds.top - 0.5);
    expect(rect.right, `${name} right`).to.be.at.most(bounds.right + 0.5);
    expect(rect.bottom, `${name} bottom`).to.be.at.most(bounds.bottom + 0.5);
    if (control.matches("button, input") && !(control as HTMLButtonElement).disabled) expect(control.tabIndex, `${name} reachable by Tab`).to.equal(0);
  }
  box.remove();
}

for (const theme of THEMES) {
  it(`fits the menu's commands into FILE_MENU_MIN_SIZE under ${theme ?? 'no theme'}`, async () => {
    const box = await fixture<HTMLDivElement>(
      html`<div style="position: relative; width: ${FILE_MENU_MIN_SIZE.w}px; height: ${FILE_MENU_MIN_SIZE.h}px; overflow: hidden"></div>`,
    );
    const element = document.createElement('umbradesktop-media-file-menu') as UmbraDesktopMediaFileMenuElement;
    if (theme) element.setAttribute('data-umbradesktop-theme', theme);
    element.style.cssText = 'position: absolute; inset: 0';
    element.deps = deps;
    element.document = DOC;
    element.label = 'Image Editor';
    box.appendChild(element);
    element.show();
    await element.updateComplete;
    for (const animation of element.shadowRoot!.getAnimations()) animation.finish();
    const sheet = element.shadowRoot!.querySelector('.sheet.menu') as HTMLElement;
    const bounds = sheet.getBoundingClientRect();
    for (const control of sheet.querySelectorAll<HTMLElement>('button')) {
      const rect = control.getBoundingClientRect();
      const name = control.dataset.command ?? control.dataset.action;
      expect(rect.width * rect.height, `${name} has a size`).to.be.greaterThan(0);
      expect(rect.bottom, `${name} bottom`).to.be.at.most(bounds.bottom + 0.5);
      expect(rect.right, `${name} right`).to.be.at.most(bounds.right + 0.5);
    }
    box.remove();
  });

  for (const mode of ['replace', 'copy'] as const) {
    it(`fits FILE_MENU_MIN_SIZE on Save as (${mode}) under ${theme ?? 'no theme'}`, async () => {
      await measure(FILE_MENU_MIN_SIZE, theme, mode);
    });
  }
}
