import { expect, fixture, html } from '@open-wc/testing';
import './file-menu.element.js';
import type { UmbraDesktopMediaFileMenuElement } from './file-menu.element.js';
import type { FileMenuDeps } from './deps.js';
import type { FileMenuDocument, SaveFormat } from './types.js';
import type { MediaSaveRequest } from '../files/media-save.js';
import { MEASURE_DEBOUNCE_MS } from './constants.js';
import { formatBytes } from './formats.js';
import en from '../localization/en.js';

/**
 * Save as, Save and Info: the file menu's panels about the open file. Save as holds every choice a
 * save can make (replace or copy, name and folder, format and quality) and shows the size the file
 * will have, measured by encoding it. Issue #136, design §5, §14 and D4.
 */

const words = en.umbraDesktopServicesMedia;

/** A JPEG that is open. */
const DOC: FileMenuDocument = {
  unique: 'k1',
  name: 'beach',
  folder: 'f1',
  folderName: 'Holidays',
  updateDate: '2026-10-17T10:00:00Z',
  extension: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 2_000_000,
};

/**
 * A file menu with a document open and fakes for everything outside it.
 * @param document What is open.
 * @returns The element and what the fakes saw.
 */
async function fileMenu(document: FileMenuDocument = DOC, saveAnswer: { ok: boolean } = { ok: true }) {
  const seen = { folders: 0, encodes: [] as Array<[SaveFormat, number]>, saves: [] as MediaSaveRequest[] };
  const deps: FileMenuDeps = {
    context: {
      open: async () => ({ status: 'cancelled' }),
      recent: async () => [],
      forgetRecent: () => undefined,
      save: async (request) => {
        seen.saves.push(request);
        return saveAnswer.ok ? { ok: true, unique: request.existing ?? 'copy1', updateDate: 'd2' } : { ok: false, message: 'The disk is full.' };
      },
      pickSaveFolder: async () => {
        seen.folders++;
        return { status: 'chosen', folder: 'f7' };
      },
      confirmOverwrite: async () => true,
    },
    thumbnails: async () => new Map(),
    confirmDiscard: async () => true,
  };
  const encode = async (format: SaveFormat, quality: number) => {
    seen.encodes.push([format, quality]);
    return new Blob([new Uint8Array(format === 'png' ? 900_000 : quality * 1000)], { type: `image/${format}` });
  };
  const element = await fixture<UmbraDesktopMediaFileMenuElement>(
    html`<umbradesktop-media-file-menu
      style="width: 900px; height: 640px"
      .deps=${deps}
      .document=${document}
      .encode=${encode}
      .preview=${'blob:preview'}></umbradesktop-media-file-menu>`,
  );
  return { element, seen };
}

const $ = <T extends Element = HTMLElement>(element: HTMLElement, selector: string) =>
  element.shadowRoot!.querySelector(selector) as T | null;

/** Wait for the debounced measurement and its render. */
async function measured(element: UmbraDesktopMediaFileMenuElement): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, MEASURE_DEBOUNCE_MS + 80));
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve));
  await element.updateComplete;
}

/** Choose a format on Save as. */
async function choose(element: UmbraDesktopMediaFileMenuElement, format: string): Promise<void> {
  $<HTMLButtonElement>(element, `button[data-format="${format}"]`)!.click();
  await element.updateComplete;
}

describe('Save as', () => {
  it('offers Replace and Save a copy as two big choices, and a copy gets a name and a folder', async () => {
    const { element, seen } = await fileMenu();
    element.show('saveAs');
    await element.updateComplete;
    const replace = $<HTMLButtonElement>(element, 'button[data-mode="replace"]')!;
    expect(replace.textContent).to.contain(words.saveAsReplace.replace('%0%', 'beach'));
    expect(replace.getAttribute('aria-pressed')).to.equal('true');
    expect($(element, 'input[name="name"]'), 'no name for a replace').to.equal(null);

    $<HTMLButtonElement>(element, 'button[data-mode="copy"]')!.click();
    await element.updateComplete;
    expect($<HTMLInputElement>(element, 'input[name="name"]')!.value).to.equal('beach (copy)');
    expect($(element, '.folder')!.textContent).to.contain('Holidays');
    $<HTMLButtonElement>(element, 'button[data-action="folder"]')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    await element.updateComplete;
    expect(seen.folders).to.equal(1);
  });

  it('lists Keep, JPEG, PNG and WebP, and no AVIF; quality only for JPEG and WebP', async () => {
    const { element } = await fileMenu();
    element.show('saveAs');
    await element.updateComplete;
    const formats = [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('button[data-format]')].map(
      (button) => button.dataset.format,
    );
    expect(formats).to.deep.equal(['keep', 'jpeg', 'png', 'webp']);
    expect(element.shadowRoot!.textContent?.toLowerCase()).to.not.contain('avif');
    expect($(element, 'button[data-format="keep"]')!.textContent).to.contain(words.saveAsKeep.replace('%0%', 'JPEG'));
    expect($(element, 'input[name="quality"]'), 'Keep on a JPEG').to.not.equal(null);
    await choose(element, 'png');
    expect($(element, 'input[name="quality"]')).to.equal(null);
    await choose(element, 'webp');
    expect($(element, 'input[name="quality"]')).to.not.equal(null);
  });

  it('measures After by encoding the picture, once the choices settle, beside Now', async () => {
    const { element, seen } = await fileMenu();
    element.show('saveAs');
    await element.updateComplete;
    expect($(element, '.now')!.textContent).to.contain(formatBytes(2_000_000, 'en'));
    await choose(element, 'png');
    await choose(element, 'webp');
    await measured(element);
    expect(seen.encodes, 'debounced: one measurement for the last choice').to.deep.equal([['webp', 90]]);
    expect($(element, '.after')!.textContent).to.contain(formatBytes(90_000, 'en'));
  });

  it('drops a stale measurement when a newer choice was made', async () => {
    const { element, seen } = await fileMenu();
    element.show('saveAs');
    await element.updateComplete;
    await measured(element);
    await choose(element, 'png');
    await measured(element);
    expect(seen.encodes[seen.encodes.length - 1]).to.deep.equal(['png', 90]);
    expect($(element, '.after')!.textContent).to.contain(formatBytes(900_000, 'en'));
  });

  it('starts on PNG when asked to, as Save does for a GIF', async () => {
    const { element } = await fileMenu({ ...DOC, extension: 'gif' });
    element.show('saveAs', { format: 'png' });
    await element.updateComplete;
    expect($(element, 'button[data-format="png"]')!.getAttribute('aria-pressed')).to.equal('true');
    expect($<HTMLButtonElement>(element, 'button[data-format="keep"]')!.disabled, 'a GIF cannot be kept').to.equal(true);
  });

  it('shows the picture as it will be saved', async () => {
    const { element } = await fileMenu();
    element.show('saveAs');
    await element.updateComplete;
    expect($(element, 'img.preview')!.getAttribute('src')).to.equal('blob:preview');
    expect($(element, '.preview-caption')!.textContent).to.contain('1600 × 1200');
  });

  it('saves a copy into the chosen folder, in the chosen format, and puts the menu away', async () => {
    const { element, seen } = await fileMenu();
    let saved: { unique: string; copy: boolean } | undefined;
    element.addEventListener('umbradesktop-media-file-saved', (event) => (saved = (event as CustomEvent).detail));
    element.show('saveAs');
    await element.updateComplete;
    $<HTMLButtonElement>(element, 'button[data-mode="copy"]')!.click();
    await element.updateComplete;
    $<HTMLButtonElement>(element, 'button[data-action="folder"]')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    await choose(element, 'webp');
    $<HTMLButtonElement>(element, 'button[data-action="save"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await element.updateComplete;
    expect(seen.saves[0].folder).to.equal('f7');
    expect(seen.saves[0].file.name).to.equal('beach (copy).webp');
    expect(saved).to.include({ unique: 'copy1', copy: true });
    expect(element.open).to.equal(false);
  });

  it('stays open with the reason when a save fails', async () => {
    const { element } = await fileMenu(DOC, { ok: false });
    element.show('saveAs');
    await element.updateComplete;
    $<HTMLButtonElement>(element, 'button[data-action="save"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await element.updateComplete;
    expect(element.open).to.equal(true);
    expect($(element, '.sheet.panel footer .status')!.textContent).to.contain(words.saveFailed);
    expect($(element, '.sheet.panel footer .status')!.textContent).to.contain('The disk is full.');
  });
});

describe('Save', () => {
  it('saves over the item in its own format, and tells the app', async () => {
    const { element, seen } = await fileMenu();
    let saved: unknown;
    element.addEventListener('umbradesktop-media-file-saved', (event) => (saved = (event as CustomEvent).detail));
    const outcome = await element.save();
    expect(outcome.status).to.equal('saved');
    expect(seen.saves[0].existing).to.equal('k1');
    expect(seen.saves[0].file.name).to.match(/^beach-ud[0-9a-f]{8}\.jpg$/);
    expect(saved).to.include({ unique: 'k1', copy: false });
  });

  it('opens Save as on PNG for an item whose format cannot be kept, and writes nothing', async () => {
    const { element, seen } = await fileMenu({ ...DOC, extension: 'gif' });
    const outcome = await element.save();
    await element.updateComplete;
    expect(outcome).to.deep.equal({ status: 'needs-save-as' });
    expect(seen.saves).to.have.length(0);
    expect(element.open).to.equal(true);
    expect($(element, 'button[data-format="png"]')!.getAttribute('aria-pressed')).to.equal('true');
  });

});

describe('Info', () => {
  it("shows the file's name, folder, dimensions, size, format and last update", async () => {
    const { element } = await fileMenu();
    element.show('info');
    await element.updateComplete;
    const text = element.shadowRoot!.querySelector('dl.info')!.textContent!;
    expect(text).to.contain('beach');
    expect(text).to.contain('Holidays');
    expect(text).to.contain('1600 × 1200 px');
    expect(text).to.contain(formatBytes(2_000_000, 'en'));
    expect(text).to.contain('JPEG');
    expect(text).to.contain('2026');
  });
});
