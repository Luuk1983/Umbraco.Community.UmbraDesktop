import { expect, fixture, html } from '@open-wc/testing';
import './file-page.element.js';
import type { UmbraDesktopMediaFilePageElement } from './file-page.element.js';
import type { FilePageDocument } from './types.js';
import { FILE_PAGE_TAG } from './constants.js';
import en from '../localization/en.js';

/**
 * The File page's frame: a list of pages down the left, the chosen page beside it. Pages that need
 * an open file are drawn and disabled while none is open, never hidden. Issue #136, design §5.
 */

/** The English dictionary, which every label is checked against. */
const words = en.umbraDesktopServicesMedia;

/** A document to show. */
const DOC: FilePageDocument = {
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

/**
 * A File page in a box, with deps that answer nothing, so nothing here reaches a backoffice.
 * @param document What is open, or null.
 * @returns The element.
 */
async function page(document: FilePageDocument | null = null): Promise<UmbraDesktopMediaFilePageElement> {
  const element = await fixture<UmbraDesktopMediaFilePageElement>(
    html`<umbradesktop-media-file-page
      style="width: 800px; height: 600px"
      .deps=${{
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
      }}
      .document=${document}></umbradesktop-media-file-page>`,
  );
  await element.updateComplete;
  return element;
}

/** The page list's button for one page. */
const button = (element: HTMLElement, name: string) =>
  element.shadowRoot!.querySelector(`button[data-page="${name}"]`) as HTMLButtonElement;

it('is defined under its published tag', () => {
  expect(FILE_PAGE_TAG).to.equal('umbradesktop-media-file-page');
  expect(customElements.get(FILE_PAGE_TAG)).to.not.equal(undefined);
});

it('draws every page with nothing open, and disables the ones that need a file', async () => {
  const element = await page(null);
  expect(button(element, 'open').disabled).to.equal(false);
  expect(button(element, 'close').disabled).to.equal(false);
  for (const name of ['back', 'save', 'saveAs', 'info']) {
    expect(button(element, name), name).to.not.equal(null);
    expect(button(element, name).disabled, name).to.equal(true);
  }
});

it('enables every page once a file is open', async () => {
  const element = await page(DOC);
  for (const name of ['back', 'open', 'save', 'saveAs', 'info', 'close']) {
    expect(button(element, name).disabled, name).to.equal(false);
  }
});

it('shows the page asked for and opens itself, and Back closes it', async () => {
  const element = await page(DOC);
  element.show('saveAs');
  await element.updateComplete;
  expect(element.open).to.equal(true);
  expect(element.hasAttribute('open'), 'reflected, so an app can style on it').to.equal(true);
  expect(button(element, 'saveAs').getAttribute('aria-current')).to.equal('page');
  expect(button(element, 'open').hasAttribute('aria-current')).to.equal(false);

  let back = 0;
  element.addEventListener('umbradesktop-media-file-back', () => back++);
  button(element, 'back').click();
  await element.updateComplete;
  expect(back).to.equal(1);
  expect(element.open).to.equal(false);
});

it('fires close for Close, and leaves closing to the app', async () => {
  const element = await page(null);
  let closed = 0;
  element.addEventListener('umbradesktop-media-file-close', () => closed++);
  button(element, 'close').click();
  expect(closed).to.equal(1);
});

it('selects a page from the list', async () => {
  const element = await page(DOC);
  element.show('open');
  await element.updateComplete;
  button(element, 'info').click();
  await element.updateComplete;
  expect(button(element, 'info').getAttribute('aria-current')).to.equal('page');
});

it('labels each page from the dictionary, as real buttons in the tab order', async () => {
  const element = await page(DOC);
  const labels: Record<string, string> = {
    back: words.backToPicture,
    open: words.pageOpen,
    save: words.pageSave,
    saveAs: words.pageSaveAs,
    info: words.pageInfo,
    close: words.pageClose,
  };
  for (const [name, label] of Object.entries(labels)) {
    const found = button(element, name);
    expect(found.tagName, name).to.equal('BUTTON');
    expect(found.tabIndex, name).to.equal(0);
    expect(found.textContent?.trim(), name).to.equal(label);
  }
});
