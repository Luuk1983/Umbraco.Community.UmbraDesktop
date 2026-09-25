import { expect, fixture, html } from '@open-wc/testing';
import './notepad.element.js';
import type { NotepadElement } from './notepad.element.js';
import type { MediaOpenResult } from '../shared/media-open.js';
import type { MediaSaveRequest, MediaSaveResult } from '../shared/media-save.js';
import type { SaveFolderChoice } from '../shared/save-location.js';

/**
 * Notepad as a media library editor: open a text file from the media library, edit it, save it
 * back; or write a new one and choose where it goes the first time it is saved, as Save As did.
 *
 * The media library itself is faked. `media.test` in a running backoffice is what proves the real
 * picker and repositories; these cases are about what Notepad does with their answers.
 */

/** Everything the element asked of the media library, recorded. */
interface Recorded {
  /** Every save, as asked for. */
  saves: MediaSaveRequest[];
  /** How many times the discard question was asked. */
  confirms: number;
  /** How many times Save asked where. */
  picks: number;
}

/** What the fake media library answers. */
interface Fakes {
  /** What Open finds. */
  opened?: MediaOpenResult;
  /** What each save answers, in turn; the last repeats. */
  saved?: MediaSaveResult[];
  /** What the discard question answers. */
  discard?: boolean;
  /** Where Save As is told to put a new document. */
  picked?: SaveFolderChoice;
}

/**
 * A mounted Notepad over a fake media library.
 * @param fakes What the fakes answer.
 * @returns The element and what it asked for.
 */
async function notepad(fakes: Fakes = {}): Promise<{ element: NotepadElement; recorded: Recorded }> {
  const recorded: Recorded = { saves: [], confirms: 0, picks: 0 };
  const answers = fakes.saved ?? [{ ok: true, unique: 'media-1' }];
  const element = await fixture<NotepadElement>(html`<umbradesktop-notepad
    .confirmDiscard=${async () => {
      recorded.confirms++;
      return fakes.discard ?? true;
    }}
    .pickSaveFolder=${async () => {
      recorded.picks++;
      return fakes.picked ?? { status: 'chosen', folder: 'folder-1' };
    }}
    .saveToMedia=${async (request: MediaSaveRequest) => {
      recorded.saves.push(request);
      return answers.length > 1 ? answers.shift()! : answers[0];
    }}
    .openFromMedia=${async () => fakes.opened ?? { status: 'cancelled' }}
  ></umbradesktop-notepad>`);
  return { element, recorded };
}

/** A text file in the media library, as the opener returns it. */
function textFile(text: string, name = 'Changelog', extension = 'md'): MediaOpenResult {
  return { status: 'opened', unique: 'existing-1', name, blob: new Blob([text], { type: 'text/markdown' }), extension };
}

/** The page. */
function page(element: NotepadElement): HTMLTextAreaElement {
  return element.shadowRoot!.querySelector('textarea')!;
}

/** The name field. */
function nameField(element: NotepadElement): HTMLInputElement {
  return element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!;
}

/** The status line's message. */
function notice(element: NotepadElement): string {
  return (element.shadowRoot!.querySelector('.notice')?.textContent ?? '').trim();
}

/** Type `text` into the page, as input events do. */
async function write(element: NotepadElement, text: string): Promise<void> {
  const area = page(element);
  area.value = text;
  area.setSelectionRange(text.length, text.length);
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await element.updateComplete;
}

/** Type a name for the document. */
async function rename(element: NotepadElement, name: string): Promise<void> {
  const field = nameField(element);
  field.value = name;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await element.updateComplete;
}

/** Click a toolbar button by its action, and let what it started finish. */
async function click(element: NotepadElement, action: string): Promise<void> {
  element.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await element.updateComplete;
  }
}

/** A saved file's text. */
async function textOf(request: MediaSaveRequest): Promise<string> {
  return await request.file.text();
}

it('opens on an empty, untitled page', async () => {
  const { element } = await notepad();
  expect(page(element).value).to.equal('');
  expect(nameField(element).value).to.equal('');
  expect(nameField(element).placeholder).to.equal('Untitled');
});

it('shows where the caret is', async () => {
  const { element } = await notepad();
  await write(element, 'first\nsecond');
  const status = element.shadowRoot!.querySelector('.position')?.textContent ?? '';
  expect(status).to.contain('2').and.to.contain('7');
});

/** There is one place a file goes now: the media library. */
it('has no way to save to, or open from, this computer', async () => {
  const { element } = await notepad();
  expect(element.shadowRoot!.querySelector('[data-action="save-other"]')).to.equal(null);
  expect(element.shadowRoot!.querySelector('input[type="file"]')).to.equal(null);
});

describe('saving a new document', () => {
  it('asks where, and saves it there as a text file named after the document', async () => {
    const { element, recorded } = await notepad();
    await rename(element, 'Meeting notes');
    await write(element, 'hello');
    await click(element, 'save');
    expect(recorded.saves).to.have.length(1);
    const [save] = recorded.saves;
    expect([save.name, save.file.name, save.folder, save.existing]).to.deep.equal([
      'Meeting notes',
      'Meeting notes.txt',
      'folder-1',
      undefined,
    ]);
    expect(await textOf(save)).to.equal('hello');
    expect(recorded.picks).to.equal(1);
    expect(element.dirty).to.equal(false);
  });

  /** Cancelling Save As saves nothing, as it always has. */
  it('saves nothing when asking where is cancelled, and keeps the work unsaved', async () => {
    const { element, recorded } = await notepad({ picked: { status: 'cancelled' } });
    await write(element, 'hello');
    await click(element, 'save');
    expect(recorded.saves).to.have.length(0);
    expect(element.dirty).to.equal(true);
  });

  it('calls an unnamed document Untitled, and saves to the root when the root is chosen', async () => {
    const { element, recorded } = await notepad({ picked: { status: 'chosen', folder: null } });
    await write(element, 'hello');
    await click(element, 'save');
    expect([recorded.saves[0].name, recorded.saves[0].file.name, recorded.saves[0].folder]).to.deep.equal([
      'Untitled',
      'Untitled.txt',
      null,
    ]);
  });

  /** Ctrl+S twice is one file that changed, not two files. */
  it('overwrites the item it created on the next save, without asking again', async () => {
    const { element, recorded } = await notepad();
    await write(element, 'one');
    await click(element, 'save');
    await write(element, 'two');
    await click(element, 'save');
    expect(recorded.saves.map((save) => save.existing)).to.deep.equal([undefined, 'media-1']);
    expect(recorded.picks).to.equal(1);
  });

  it('saves with Ctrl+S, and keeps the browser from saving the page instead', async () => {
    const { element, recorded } = await notepad();
    await write(element, 'hello');
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, composed: true, cancelable: true });
    page(element).dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve));
    expect(recorded.saves).to.have.length(1);
    expect(event.defaultPrevented).to.equal(true);
  });

  it('keeps the work unsaved, and says why, when the media library refuses it', async () => {
    const { element } = await notepad({ saved: [{ ok: false, message: '.txt files are not allowed here' }] });
    await write(element, 'hello');
    await click(element, 'save');
    expect(element.dirty).to.equal(true);
    expect(notice(element)).to.contain('.txt files are not allowed here');
  });
});

describe('opening from the media library', () => {
  it('opens a text file, named after its media item', async () => {
    const { element } = await notepad({ opened: textFile('# Changes') });
    await click(element, 'open');
    expect(page(element).value).to.equal('# Changes');
    expect(nameField(element).value).to.equal('Changelog');
    expect(element.dirty).to.equal(false);
  });

  /** An opened file is saved back where it lives, as the same kind of file. */
  it('saves an edited file back over its own media item, keeping its extension, without asking where', async () => {
    const { element, recorded } = await notepad({ opened: textFile('# Changes'), saved: [{ ok: true, unique: 'existing-1' }] });
    await click(element, 'open');
    await write(element, '# Changes\n- more');
    await click(element, 'save');
    expect(recorded.picks).to.equal(0);
    const [save] = recorded.saves;
    expect([save.existing, save.name, save.file.name]).to.deep.equal(['existing-1', 'Changelog', 'Changelog.md']);
    expect(await textOf(save)).to.equal('# Changes\n- more');
  });

  it('refuses a file that is not text, and says so', async () => {
    const { element } = await notepad({
      opened: { status: 'opened', unique: 'img', name: 'Logo', blob: new Blob(['x'], { type: 'image/png' }), extension: 'png' },
    });
    await write(element, 'untouched');
    await click(element, 'open');
    expect(page(element).value).to.equal('untouched');
    expect(notice(element)).to.contain('Logo');
  });

  it('says so when a file cannot be read', async () => {
    const { element } = await notepad({ opened: { status: 'failed', name: 'Broken' } });
    await click(element, 'open');
    expect(notice(element)).to.contain('Broken');
  });

  it('asks before replacing unsaved work, and keeps it on no', async () => {
    const { element, recorded } = await notepad({ opened: textFile('theirs'), discard: false });
    await write(element, 'mine');
    await click(element, 'open');
    expect(recorded.confirms).to.equal(1);
    expect(page(element).value).to.equal('mine');
  });
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

it('starts a new media item for a new document, and asks where again', async () => {
  const { element, recorded } = await notepad();
  await write(element, 'one');
  await click(element, 'save');
  await click(element, 'new');
  await write(element, 'two');
  await click(element, 'save');
  expect(recorded.saves[1].existing).to.equal(undefined);
  expect(recorded.picks).to.equal(2);
});

it('counts a rename as unsaved, since saving is what renames the media item', async () => {
  const { element } = await notepad({ opened: textFile('text') });
  await click(element, 'open');
  await rename(element, 'New name');
  expect(element.dirty).to.equal(true);
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
