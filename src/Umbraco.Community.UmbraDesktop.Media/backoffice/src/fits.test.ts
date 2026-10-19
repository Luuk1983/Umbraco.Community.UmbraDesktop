import { expect, fixture, html } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { defineFakeFileMenu, opened, settle } from './image-editor/image-editor.test-helper.js';
import type { FakeFileMenu } from './image-editor/image-editor.test-helper.js';
import { MODES } from './image-editor/modes/mode.js';
import type { UmbraDesktopImageEditorElement } from './image-editor/image-editor.element.js';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

/**
 * The Image Editor measured in a real browser at both sizes its manifest declares, under every theme
 * id and under none, in every mode with a picture open: every control of the mode bar, the panel and
 * the status bar is inside the box, has a size, and is in the tab order. "A theme may restyle, never
 * remove" and "derive numbers, then measure them", as a test (Accessories' `fits.test.ts` is the
 * model). The theme ids are stamped as attributes only, as there; the palettes only colour.
 */

defineFakeFileMenu();

/** The published theme ids, plus no theme at all. */
const THEMES = [undefined, 'umbraco', 'umbraco4', 'macos', 'win11', 'win98'];

/**
 * The editor's manifest sizes, found by its alias: the package registers the Media Manager first, and
 * the first app found used to be the editor only while it was the package's one app.
 */
const app = manifests.find((manifest) => manifest.alias === 'Umbraco.Community.UmbraDesktop.Media.ImageEditor') as unknown as {
  meta: Record<'defaultSize' | 'minSize', { w: number; h: number }>;
};

/** The media context's alias, so the editor finds the service. */
const MEDIA = new UmbContextToken<UmbContextMinimal>('UmbraDesktopMediaContext');

/**
 * Measure the editor at a size, under a theme, in every mode.
 * @param size The content box.
 * @param theme The theme id, or none.
 */
async function measure(size: { w: number; h: number }, theme: string | undefined): Promise<void> {
  const box = await fixture<HTMLElement>(
    // The helper's host, which slots the editor so it is laid out.
    html`<umbradesktop-image-editor-test-host
      style="display: flex; flex-direction: column; width: ${size.w}px; height: ${size.h}px; overflow: hidden"
    ></umbradesktop-image-editor-test-host>`,
  );
  (box as unknown as { provideContext(token: unknown, value: unknown): void }).provideContext(MEDIA, {
    getHostElement: () => box,
  });
  const editor = document.createElement('umbradesktop-image-editor') as UmbraDesktopImageEditorElement;
  if (theme) editor.setAttribute('data-umbradesktop-theme', theme);
  editor.style.flex = '1';
  box.appendChild(editor);
  await editor.updateComplete;
  await settle(editor);
  const menu = editor.shadowRoot!.querySelector('umbradesktop-media-file-menu') as FakeFileMenu;
  menu.fire('open', await opened('picture.png'));
  const deadline = performance.now() + 5000;
  while (!editor.picture && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  await settle(editor);

  expect(editor.scrollWidth, 'rendered width').to.be.at.most(size.w);
  expect(editor.scrollHeight, 'rendered height').to.be.at.most(size.h);
  const bounds = editor.getBoundingClientRect();
  for (const mode of MODES) {
    editor.setMode(mode);
    await settle(editor);
    const panel = editor.shadowRoot!.querySelector('.panel') as HTMLElement;
    expect(panel.scrollHeight, `${mode}: the panel needs no scroll bar`).to.be.at.most(panel.clientHeight);
    const controls = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.bar button, .panel button, .panel input, .status button, .status input')];
    expect(controls.length, `${mode}: controls found`).to.be.greaterThan(12);
    for (const control of controls) {
      const name = `${mode}: ${control.dataset.command ?? control.getAttribute('name') ?? control.textContent?.trim()}`;
      const rect = control.getBoundingClientRect();
      expect(rect.width * rect.height, `${name} has a size`).to.be.greaterThan(0);
      expect(rect.left, `${name} left`).to.be.at.least(bounds.left - 0.5);
      expect(rect.right, `${name} right`).to.be.at.most(bounds.right + 0.5);
      expect(rect.top, `${name} top`).to.be.at.least(bounds.top - 0.5);
      expect(rect.bottom, `${name} bottom`).to.be.at.most(bounds.bottom + 0.5);
      if (!(control as HTMLButtonElement).disabled) expect(control.tabIndex, `${name} reachable by Tab`).to.equal(0);
    }
  }
  box.remove();
}

for (const which of ['defaultSize', 'minSize'] as const) {
  for (const theme of THEMES) {
    it(`the Image Editor fits its ${which} under ${theme ?? 'no theme'}`, async function () {
      this.timeout(30_000);
      await measure(app.meta[which], theme);
    });
  }
}
