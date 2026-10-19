import { expect, fixture, html } from '@open-wc/testing';
import './file-menu.element.js';
import type { UmbraDesktopMediaFileMenuElement } from './file-menu.element.js';
import type { FileMenuDeps } from './deps.js';
import type { FileMenuDocument } from './types.js';
import { FILE_MENU_TAG, MENU_WIDTH, PANEL_WIDTHS } from './constants.js';
import en from '../localization/en.js';

/**
 * The file menu: a panel that slides in from the app's right edge with Open, Save, Save as, Info
 * and Close, and the panels Open, Save as and Info slide in over it. Commands that need an open
 * file are drawn and disabled while none is open, never hidden. Issue #136, design §14.
 */

/** The English dictionary, which every label is checked against. */
const words = en.umbraDesktopServicesMedia;

/** A document to show. */
const DOC: FileMenuDocument = {
  unique: 'k1',
  name: 'Beach',
  folder: 'f1',
  folderName: 'Holidays',
  updateDate: '2026-10-17T10:00:00Z',
  extension: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 2_000_000,
};

/** What the fake save saw. */
interface Seen {
  saves: number;
}

/**
 * A file menu in a box, with deps that answer at once, so nothing here reaches a backoffice.
 * @param document What is open, or null.
 * @param options Whether there is unsaved work, the box's width, the app's name.
 * @returns The element and what the fakes saw.
 */
async function menu(
  document: FileMenuDocument | null = null,
  options: { dirty?: boolean; width?: number; label?: string } = {},
): Promise<{ element: UmbraDesktopMediaFileMenuElement; seen: Seen }> {
  const seen: Seen = { saves: 0 };
  const deps: FileMenuDeps = {
    context: {
      open: async () => ({ status: 'cancelled' }),
      recent: async () => [],
      forgetRecent: () => undefined,
      save: async (request) => {
        seen.saves++;
        return { ok: true, unique: request.existing ?? 'copy1', updateDate: 'd2' };
      },
      pickSaveFolder: async () => ({ status: 'cancelled' }),
      confirmOverwrite: async () => true,
    },
    thumbnails: async () => new Map(),
    confirmDiscard: async () => true,
  };
  const element = await fixture<UmbraDesktopMediaFileMenuElement>(
    html`<umbradesktop-media-file-menu
      style="position: relative; width: ${options.width ?? 1100}px; height: 700px"
      .deps=${deps}
      .document=${document}
      .dirty=${options.dirty ?? false}
      .label=${options.label}
      .encode=${async () => new Blob([new Uint8Array(100)])}></umbradesktop-media-file-menu>`,
  );
  await element.updateComplete;
  return { element, seen };
}

/** Let a save or a load finish and render. */
async function settle(element: UmbraDesktopMediaFileMenuElement): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await element.updateComplete;
  }
}

/** A command of the menu. */
const command = (element: HTMLElement, name: string) =>
  element.shadowRoot!.querySelector(`button[data-command="${name}"]`) as HTMLButtonElement;

/** A button by what it does, in whichever panel shows it. */
const action = (element: HTMLElement, name: string) =>
  element.shadowRoot!.querySelector(`button[data-action="${name}"]`) as HTMLButtonElement | null;

/** The panel on top, or null while only the menu shows. */
const panel = (element: HTMLElement) => element.shadowRoot!.querySelector('.sheet.panel') as HTMLElement | null;

it('is defined under its published tag', () => {
  expect(FILE_MENU_TAG).to.equal('umbradesktop-media-file-menu');
  expect(customElements.get(FILE_MENU_TAG)).to.not.equal(undefined);
});

it('is hidden until shown, then shows the menu as a dialog', async () => {
  const { element } = await menu(DOC);
  expect(element.open).to.equal(false);
  expect(getComputedStyle(element).display).to.equal('none');
  element.show();
  await element.updateComplete;
  expect(element.open).to.equal(true);
  expect(element.hasAttribute('open'), 'reflected, so an app can style on it').to.equal(true);
  const dialog = element.shadowRoot!.querySelector('.sheet.menu')!;
  expect(dialog.getAttribute('role')).to.equal('dialog');
  expect(dialog.getAttribute('aria-modal')).to.equal('true');
  expect(panel(element), 'no panel over the menu').to.equal(null);
});

it('lists Open, Save, Save as, Info and Close, each with what it does', async () => {
  const { element } = await menu(DOC, { label: 'Image Editor' });
  element.show();
  await element.updateComplete;
  const order = [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('button[data-command]')].map((b) => b.dataset.command);
  expect(order).to.deep.equal(['open', 'save', 'saveAs', 'info', 'close']);
  const lines: Record<string, [string, string]> = {
    open: [words.menuOpen, words.menuOpenLine],
    save: [words.menuSave, words.menuSaveLine.replace('%0%', 'Beach')],
    saveAs: [words.menuSaveAs, words.menuSaveAsLine],
    info: [words.menuInfo, words.menuInfoLine],
    close: [words.menuClose, words.menuCloseLine.replace('%0%', 'Image Editor')],
  };
  for (const [name, [label, line]] of Object.entries(lines)) {
    expect(command(element, name).querySelector('.label')!.textContent!.trim(), name).to.equal(label);
    expect(command(element, name).querySelector('.line')!.textContent!.trim(), name).to.equal(line);
  }
  expect(element.shadowRoot!.querySelector('.sheet.menu h2')!.textContent!.trim()).to.equal('Image Editor');
});

it('draws every command with nothing open, and disables the ones that need a file', async () => {
  const { element } = await menu(null);
  element.show();
  await element.updateComplete;
  expect(command(element, 'open').disabled).to.equal(false);
  expect(command(element, 'close').disabled).to.equal(false);
  for (const name of ['save', 'saveAs', 'info']) {
    expect(command(element, name), name).to.not.equal(null);
    expect(command(element, name).disabled, name).to.equal(true);
  }
});

it('enables Save only while there is something to save', async () => {
  const clean = await menu(DOC, { dirty: false });
  clean.element.show();
  await clean.element.updateComplete;
  expect(command(clean.element, 'save').disabled).to.equal(true);
  expect(command(clean.element, 'saveAs').disabled).to.equal(false);
  const dirty = await menu(DOC, { dirty: true });
  dirty.element.show();
  await dirty.element.updateComplete;
  expect(command(dirty.element, 'save').disabled).to.equal(false);
});

it('slides Open, Save as and Info in over the menu, and the arrow goes back to it', async () => {
  const { element } = await menu(DOC);
  element.show();
  await element.updateComplete;
  for (const name of ['open', 'saveAs', 'info']) {
    command(element, name).click();
    await settle(element);
    expect(panel(element)?.dataset.panel, name).to.equal(name);
    expect(element.shadowRoot!.querySelector('.sheet.menu'), 'the menu stays under it').to.not.equal(null);
    action(element, 'back')!.click();
    await element.updateComplete;
    expect(panel(element), `back from ${name}`).to.equal(null);
    expect(element.open).to.equal(true);
  }
});

it('shows a panel straight away when asked, with the menu under it', async () => {
  const { element } = await menu(DOC);
  element.show('saveAs');
  await element.updateComplete;
  expect(panel(element)?.dataset.panel).to.equal('saveAs');
  action(element, 'back')!.click();
  await element.updateComplete;
  expect(panel(element)).to.equal(null);
  expect(command(element, 'open')).to.not.equal(null);
});

it('puts itself away on Escape, on the dimmed app, and from its own buttons, and says so each time', async () => {
  const { element } = await menu(DOC);
  let hidden = 0;
  element.addEventListener('umbradesktop-media-file-hidden', () => hidden++);

  element.show('info');
  await element.updateComplete;
  element.shadowRoot!.querySelector('.sheet.panel')!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }),
  );
  await element.updateComplete;
  expect(element.open, 'Escape puts the whole menu away').to.equal(false);

  element.show();
  await element.updateComplete;
  (element.shadowRoot!.querySelector('.scrim') as HTMLElement).click();
  await element.updateComplete;
  expect(element.open, 'a click on the dimmed app').to.equal(false);

  element.show();
  await element.updateComplete;
  action(element, 'dismiss')!.click();
  await element.updateComplete;
  expect(element.open, 'Close menu').to.equal(false);
  expect(action(element, 'dismiss'), 'gone with the menu').to.equal(null);

  element.show('info');
  await element.updateComplete;
  action(element, 'dismiss')!.click();
  await element.updateComplete;
  expect(element.open, "Info's Close").to.equal(false);

  expect(hidden).to.equal(4);
});

it('fires close for Close, and leaves closing to the app', async () => {
  const { element } = await menu(null);
  let closed = 0;
  element.addEventListener('umbradesktop-media-file-close', () => closed++);
  element.show();
  await element.updateComplete;
  command(element, 'close').click();
  expect(closed).to.equal(1);
});

it('saves from Save at once and puts itself away', async () => {
  const { element, seen } = await menu(DOC, { dirty: true });
  let saved = 0;
  element.addEventListener('umbradesktop-media-file-saved', () => saved++);
  element.show();
  await element.updateComplete;
  command(element, 'save').click();
  await settle(element);
  expect(seen.saves).to.equal(1);
  expect(saved).to.equal(1);
  expect(element.open).to.equal(false);
});

it('turns Save into Save as on PNG for a format that cannot be kept', async () => {
  const { element, seen } = await menu({ ...DOC, extension: 'gif' }, { dirty: true });
  element.show();
  await element.updateComplete;
  command(element, 'save').click();
  await settle(element);
  expect(seen.saves).to.equal(0);
  expect(element.open).to.equal(true);
  expect(panel(element)?.dataset.panel).to.equal('saveAs');
});

it("puts each panel's buttons in its footer", async () => {
  const { element } = await menu(DOC, { dirty: true });
  const footer = () => element.shadowRoot!.querySelector('.sheet.panel footer') as HTMLElement;
  element.show('open');
  await settle(element);
  expect(footer().querySelector('[data-action="dismiss"]')!.textContent!.trim()).to.equal(words.cancel);
  element.show('saveAs');
  await settle(element);
  expect(footer().querySelector('[data-action="dismiss"]')!.textContent!.trim()).to.equal(words.cancel);
  expect(footer().querySelector('[data-action="save"]')!.textContent!.trim()).to.equal(words.saveAsReplace.replace('%0%', 'Beach'));
  element.show('info');
  await settle(element);
  expect(footer().querySelector('[data-action="dismiss"]')!.textContent!.trim()).to.equal(words.close);
});

it('moves focus into the menu when it opens and back where it was when it goes', async () => {
  const outside = await fixture<HTMLButtonElement>(html`<button>more</button>`);
  const { element } = await menu(DOC);
  outside.focus();
  element.show();
  await element.updateComplete;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(element.shadowRoot!.activeElement, 'the first command').to.equal(command(element, 'open'));
  element.hide();
  await element.updateComplete;
  expect(document.activeElement).to.equal(outside);
});

it('keeps Tab inside the menu', async () => {
  const { element } = await menu(DOC);
  element.show();
  await element.updateComplete;
  const dismiss = action(element, 'dismiss')!;
  dismiss.focus();
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true });
  dismiss.dispatchEvent(tab);
  expect(tab.defaultPrevented).to.equal(true);
  expect(element.shadowRoot!.activeElement, 'round to the first command').to.equal(command(element, 'open'));
});

it('is never wider than the app it is in', async () => {
  const { element } = await menu(DOC, { width: 600 });
  element.show();
  await element.updateComplete;
  const menuSheet = element.shadowRoot!.querySelector('.sheet.menu')!.getBoundingClientRect();
  expect(menuSheet.width).to.equal(MENU_WIDTH);
  element.show('saveAs');
  await element.updateComplete;
  // Where it ends up, not where its slide has got to.
  for (const animation of element.shadowRoot!.getAnimations()) animation.finish();
  const bounds = element.getBoundingClientRect();
  const sheet = panel(element)!.getBoundingClientRect();
  expect(PANEL_WIDTHS.saveAs).to.be.greaterThan(600);
  expect(sheet.width).to.equal(600);
  expect(sheet.right).to.equal(bounds.right);
});

/**
 * The owner, in a real backoffice: the menu bounced, going too far left before snapping into place.
 * Focusing the first command while the menu was still off to the right made the browser scroll the
 * menu's box sideways to show it (380 px on the first frame), and the scroll and the slide fought
 * until both reached zero. Focus moves without scrolling now.
 */
it('slides in without scrolling its box to the command it focuses', async () => {
  const { element } = await menu(DOC);
  const scrolled: number[] = [];
  element.show();
  await element.updateComplete;
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    scrolled.push(element.scrollLeft);
  }
  expect(element.shadowRoot!.activeElement, 'focus still moves').to.equal(command(element, 'open'));
  expect(scrolled.every((value) => value === 0), `scrolled ${scrolled.join(', ')}`).to.equal(true);
  element.show('saveAs');
  await element.updateComplete;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(element.scrollLeft, 'nor for a panel').to.equal(0);
});
