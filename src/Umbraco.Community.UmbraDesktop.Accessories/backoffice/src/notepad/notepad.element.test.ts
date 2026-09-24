import { expect, fixture, html } from '@open-wc/testing';
import './notepad.element.js';
import type { NotepadElement } from './notepad.element.js';
import { fixedSaveSettings } from '../settings/save-settings.source.js';
import type { AccessoriesSaveSettings } from '../settings/save-settings.js';
import type { MediaSaveResult } from '../shared/media-save.js';

/** Everything the element hands the outside world, recorded rather than performed. */
interface Recorded {
  /** Recorded synchronously, so a test never races the blob being read. */
  downloads: Array<{ name: string; blob: Blob }>;
  confirms: number;
  /** Every save to the media library: file name, folder, and the item it was asked to overwrite. */
  media: Array<[string, string | null, string | undefined]>;
}

/** What the fake media library answers, in turn. The last answer repeats. */
let mediaAnswers: MediaSaveResult[] = [{ ok: true, unique: 'media-1' }];

/** Where Save goes, for the cases that care. This computer unless a case says otherwise. */
let settings: AccessoriesSaveSettings = { destination: 'computer', folder: null };

beforeEach(() => {
  mediaAnswers = [{ ok: true, unique: 'media-1' }];
  settings = { destination: 'computer', folder: null };
});

/**
 * A mounted Notepad whose downloads and confirmations are recorded.
 * @param answer What the "discard changes?" question answers.
 */
async function notepad(answer = true): Promise<{ element: NotepadElement; recorded: Recorded }> {
  const recorded: Recorded = { downloads: [], confirms: 0, media: [] };
  const element = await fixture<NotepadElement>(html`<umbradesktop-notepad
    .download=${(blob: Blob, name: string) => {
      recorded.downloads.push({ name, blob });
    }}
    .confirmDiscard=${async () => {
      recorded.confirms++;
      return answer;
    }}
    .saveSettings=${fixedSaveSettings(settings)}
    .saveToMedia=${async (file: File, folder: string | null, existing?: string) => {
      recorded.media.push([file.name, folder, existing]);
      return mediaAnswers.length > 1 ? mediaAnswers.shift()! : mediaAnswers[0];
    }}
  ></umbradesktop-notepad>`);
  return { element, recorded };
}

/** The page. */
function page(element: NotepadElement): HTMLTextAreaElement {
  return element.shadowRoot!.querySelector('textarea')!;
}

/** Type `text` into the page, as input events do. */
async function write(element: NotepadElement, text: string): Promise<void> {
  const area = page(element);
  area.value = text;
  area.setSelectionRange(text.length, text.length);
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await element.updateComplete;
}

/** Click a toolbar button by its action. */
async function click(element: NotepadElement, action: string): Promise<void> {
  element.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
  await element.updateComplete;
  // The actions are async (a confirmation, a file read), so let their promises settle too.
  await new Promise((resolve) => setTimeout(resolve));
  await element.updateComplete;
}

it('opens on an empty page', async () => {
  const { element } = await notepad();
  expect(page(element).value).to.equal('');
});

it('shows where the caret is', async () => {
  const { element } = await notepad();
  await write(element, 'first\nsecond');
  const status = element.shadowRoot!.querySelector('.position')?.textContent ?? '';
  expect(status).to.contain('2').and.to.contain('7');
});

it('saves the page as a text file', async () => {
  const { element, recorded } = await notepad();
  await write(element, 'hello');
  await click(element, 'save');
  expect(recorded.downloads.map((download) => download.name)).to.deep.equal(['Untitled.txt']);
  expect(await recorded.downloads[0].blob.text()).to.equal('hello');
});

it('saves with Ctrl+S, and keeps the browser from saving the page instead', async () => {
  const { element, recorded } = await notepad();
  await write(element, 'hello');
  const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, composed: true, cancelable: true });
  page(element).dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve));
  expect(recorded.downloads.length).to.equal(1);
  expect(event.defaultPrevented).to.equal(true);
});

it('opens a text file, and saves it back under its own name', async () => {
  const { element, recorded } = await notepad();
  await element.openFile(new File(['from disk'], 'notes.txt', { type: 'text/plain' }));
  await element.updateComplete;
  expect(page(element).value).to.equal('from disk');
  await click(element, 'save');
  expect(recorded.downloads[0].name).to.equal('notes.txt');
});

/**
 * Starting afresh over unsaved work asks first, and only then. Asking over a page that is already
 * saved, or empty, is a dialog with one sensible answer, and those train people to click through the
 * one that matters.
 */
it('asks before throwing away unsaved work, and only then', async () => {
  const { element, recorded } = await notepad();
  await click(element, 'new');
  expect(recorded.confirms, 'nothing to lose').to.equal(0);
  await write(element, 'draft');
  await click(element, 'new');
  expect(recorded.confirms, 'unsaved text').to.equal(1);
  expect(page(element).value).to.equal('');
});

it('keeps the work when the question is answered no', async () => {
  const { element } = await notepad(false);
  await write(element, 'draft');
  await click(element, 'new');
  expect(page(element).value).to.equal('draft');
});

it('does not ask again once the work is saved', async () => {
  const { element, recorded } = await notepad();
  await write(element, 'draft');
  await click(element, 'save');
  await click(element, 'new');
  expect(recorded.confirms).to.equal(0);
});

/**
 * `data-umbradesktop-dirty` is the desktop's published attribute for unsaved work in an app window:
 * the host watches it and the close button asks before throwing that work away.
 */
it('marks unsaved work with the desktop’s own attribute, and clears it on save', async () => {
  const { element } = await notepad();
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
  await write(element, 'draft');
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
  await click(element, 'save');
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
});

it('wraps long lines until word wrap is switched off', async () => {
  const { element } = await notepad();
  const toggle = element.shadowRoot!.querySelector('[data-action="wrap"]')!;
  expect(page(element).getAttribute('wrap')).to.equal('soft');
  expect(toggle.getAttribute('aria-pressed')).to.equal('true');
  await click(element, 'wrap');
  expect(page(element).getAttribute('wrap')).to.equal('off');
  expect(toggle.getAttribute('aria-pressed')).to.equal('false');
});

describe('saving to the media library', () => {
  it('saves there when Desktop settings say so, into the chosen folder, and downloads nothing', async () => {
    settings = { destination: 'media', folder: { unique: 'folder-1', name: 'Notes' } };
    const { element, recorded } = await notepad();
    await write(element, 'hello');
    await click(element, 'save');
    expect(recorded.media).to.deep.equal([['Untitled.txt', 'folder-1', undefined]]);
    expect(recorded.downloads).to.deep.equal([]);
    expect(element.dirty).to.equal(false);
  });

  /** Ctrl+S twice is one file that changed, not two files, in the media library as on a disk. */
  it('overwrites the item it saved before rather than adding another', async () => {
    settings = { destination: 'media', folder: null };
    const { element, recorded } = await notepad();
    await write(element, 'one');
    await click(element, 'save');
    await write(element, 'two');
    await click(element, 'save');
    expect(recorded.media.map(([, , existing]) => existing)).to.deep.equal([undefined, 'media-1']);
  });

  it('starts a new item for a new document', async () => {
    settings = { destination: 'media', folder: null };
    const { element, recorded } = await notepad();
    await write(element, 'one');
    await click(element, 'save');
    await click(element, 'new');
    await write(element, 'two');
    await click(element, 'save');
    expect(recorded.media[1][2], 'nothing to overwrite').to.equal(undefined);
  });

  it('keeps the work unsaved when the media library refuses it', async () => {
    settings = { destination: 'media', folder: null };
    mediaAnswers = [{ ok: false, message: 'not allowed here' }];
    const { element } = await notepad();
    await write(element, 'hello');
    await click(element, 'save');
    expect(element.dirty).to.equal(true);
  });

  /** The other destination is always one click away, whichever one Save uses. */
  it('offers the other destination on its own button', async () => {
    const { element, recorded } = await notepad();
    await write(element, 'hello');
    await click(element, 'save-other');
    expect(recorded.media.length, 'Save downloads, so the second button saves to media').to.equal(1);

    settings = { destination: 'media', folder: null };
    const second = await notepad();
    await write(second.element, 'hello');
    await click(second.element, 'save-other');
    expect(second.recorded.downloads.length, 'Save goes to media, so the second button downloads').to.equal(1);
  });
});
