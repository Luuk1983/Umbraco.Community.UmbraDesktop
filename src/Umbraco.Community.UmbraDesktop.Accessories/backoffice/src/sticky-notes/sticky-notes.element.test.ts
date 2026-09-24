import { expect, fixture, html } from '@open-wc/testing';
import './sticky-notes.element.js';
import type { StickyNotesElement } from './sticky-notes.element.js';
import type { StickyNote, StickyNoteBoard, StickyNotesApi, StickyNoteUpdateResult } from './api.js';

/**
 * The shared board as a person uses it, against a fake server that behaves like the real one: it
 * versions every note and refuses an edit made against an old version.
 */
class FakeServer implements StickyNotesApi {
  notes: StickyNote[] = [];
  maxNotes = 100;
  lists = 0;
  #next = 1;

  /** Somebody else, in another browser, editing a note. */
  editAsSomeoneElse(key: string, text: string): void {
    this.notes = this.notes.map((note) =>
      note.key === key ? { ...note, text, updatedBy: 'Grace', version: note.version + 1 } : note,
    );
  }

  /** Somebody else adding a note. */
  addAsSomeoneElse(text: string): StickyNote {
    const note = this.#note(text, 'Grace');
    this.notes = [...this.notes, note];
    return note;
  }

  async list(): Promise<StickyNoteBoard> {
    this.lists++;
    return { notes: [...this.notes], maxTextLength: 50, maxNotes: this.maxNotes, colours: ['yellow', 'green', 'pink'] };
  }

  async create(text: string, colour: string): Promise<StickyNote> {
    const note = { ...this.#note(text, 'Ada'), colour };
    this.notes = [...this.notes, note];
    return note;
  }

  async update(key: string, text: string, colour: string, version: number): Promise<StickyNoteUpdateResult> {
    const current = this.notes.find((note) => note.key === key);
    if (!current) return { status: 'notFound' };
    if (current.version !== version) return { status: 'conflict', note: current };
    const next = { ...current, text, colour, updatedBy: 'Ada', version: current.version + 1 };
    this.notes = this.notes.map((note) => (note.key === key ? next : note));
    return { status: 'saved', note: next };
  }

  async remove(key: string): Promise<boolean> {
    this.notes = this.notes.filter((note) => note.key !== key);
    return true;
  }

  #note(text: string, updatedBy: string): StickyNote {
    return { key: `note-${this.#next++}`, text, colour: 'yellow', updatedBy, updatedAt: '2026-09-24T10:00:00Z', version: 1 };
  }
}

/**
 * A mounted board over `server`, saving immediately after typing and never polling on its own, so
 * each case decides when a refresh happens.
 * @param server The fake server.
 * @param answer What the delete question answers.
 */
async function board(server: FakeServer, answer = true): Promise<StickyNotesElement> {
  const element = await fixture<StickyNotesElement>(html`<umbradesktop-sticky-notes
    .api=${server}
    .saveDelay=${0}
    .pollInterval=${0}
    .confirmDelete=${async () => answer}
  ></umbradesktop-sticky-notes>`);
  await settle(element);
  return element;
}

/** Let saves, refreshes and renders finish. */
async function settle(element: StickyNotesElement): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await element.updateComplete;
  }
}

/** Every note's textarea, in board order. */
function pages(element: StickyNotesElement): HTMLTextAreaElement[] {
  return [...element.shadowRoot!.querySelectorAll<HTMLTextAreaElement>('.note textarea')];
}

/** Type into the note at `index`. */
async function type(element: StickyNotesElement, index: number, text: string): Promise<void> {
  const page = pages(element)[index];
  page.value = text;
  page.dispatchEvent(new Event('input', { bubbles: true }));
  await element.updateComplete;
}

/** Click something inside the note at `index`, or on the board when `index` is undefined. */
async function click(element: StickyNotesElement, selector: string, index?: number): Promise<void> {
  const scope = index === undefined ? element.shadowRoot! : element.shadowRoot!.querySelectorAll('.note')[index];
  (scope.querySelector(selector) as HTMLElement).click();
  await settle(element);
}

it('shows everybody’s notes, each saying who wrote it', async () => {
  const server = new FakeServer();
  server.addAsSomeoneElse('Republish the homepage on Friday');
  const element = await board(server);
  expect(pages(element).map((page) => page.value)).to.deep.equal(['Republish the homepage on Friday']);
  expect(element.shadowRoot!.querySelector('.note .by')?.textContent).to.contain('Grace');
});

it('adds a note for everyone, and saves what is typed into it', async () => {
  const server = new FakeServer();
  const element = await board(server);
  await click(element, '[data-action="add"]');
  expect(server.notes).to.have.length(1);
  await type(element, 0, 'Hello team');
  await settle(element);
  expect(server.notes[0].text).to.equal('Hello team');
  expect(server.notes[0].version).to.equal(2);
});

it('marks the window unsaved until the server has the text', async () => {
  const server = new FakeServer();
  server.addAsSomeoneElse('one');
  const element = await board(server);
  element.saveDelay = 60_000;
  await type(element, 0, 'one two');
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
  await element.saveNow();
  await settle(element);
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
});

it('shows notes somebody else added on the next refresh', async () => {
  const server = new FakeServer();
  const element = await board(server);
  server.addAsSomeoneElse('From Grace');
  await element.refresh();
  await settle(element);
  expect(pages(element).map((page) => page.value)).to.deep.equal(['From Grace']);
});

it('never overwrites text still being typed when a refresh arrives', async () => {
  const server = new FakeServer();
  server.addAsSomeoneElse('draft');
  const element = await board(server);
  element.saveDelay = 60_000;
  await type(element, 0, 'draft, still typing');
  await element.refresh();
  await settle(element);
  expect(pages(element)[0].value).to.equal('draft, still typing');
});

describe('when two people edit the same note', () => {
  /** A board where somebody else saved note 0 while this window was typing in it, then saved. */
  async function conflicted() {
    const server = new FakeServer();
    const note = server.addAsSomeoneElse('draft');
    const element = await board(server);
    element.saveDelay = 60_000;
    await type(element, 0, 'mine');
    server.editAsSomeoneElse(note.key, 'theirs');
    await element.saveNow();
    await settle(element);
    return { server, element };
  }

  it('keeps both versions and asks, rather than overwriting either', async () => {
    const { server, element } = await conflicted();
    expect(server.notes[0].text, 'the server keeps theirs').to.equal('theirs');
    expect(pages(element)[0].value, 'the window keeps mine').to.equal('mine');
    expect(element.shadowRoot!.querySelector('.note .conflict')?.textContent).to.contain('Grace');
    expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
  });

  it('takes their version on “use theirs”', async () => {
    const { element } = await conflicted();
    await click(element, '[data-action="use-theirs"]', 0);
    expect(pages(element)[0].value).to.equal('theirs');
    expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
  });

  it('saves over theirs on “keep mine”, knowingly', async () => {
    const { server, element } = await conflicted();
    await click(element, '[data-action="keep-mine"]', 0);
    expect(server.notes[0].text).to.equal('mine');
    expect(element.shadowRoot!.querySelector('.note .conflict')).to.equal(null);
  });
});

it('asks before deleting a note, and keeps it on no', async () => {
  const server = new FakeServer();
  server.addAsSomeoneElse('keep me');
  const keep = await board(server, false);
  await click(keep, '[data-action="delete"]', 0);
  expect(server.notes).to.have.length(1);

  const remove = await board(server, true);
  await click(remove, '[data-action="delete"]', 0);
  expect(server.notes).to.have.length(0);
  expect(pages(remove)).to.have.length(0);
});

it('offers to put back a note deleted elsewhere while it had unsaved text here', async () => {
  const server = new FakeServer();
  server.addAsSomeoneElse('one');
  const element = await board(server);
  element.saveDelay = 60_000;
  await type(element, 0, 'unsaved words');
  server.notes = [];
  await element.refresh();
  await settle(element);
  expect(element.shadowRoot!.querySelector('.note .deleted')).to.not.equal(null);
  await click(element, '[data-action="restore"]', 0);
  expect(server.notes.map((note) => note.text)).to.deep.equal(['unsaved words']);
});

it('changes a note’s colour for everyone', async () => {
  const server = new FakeServer();
  server.addAsSomeoneElse('colourful');
  const element = await board(server);
  await click(element, '[data-colour="green"]', 0);
  expect(server.notes[0].colour).to.equal('green');
});

it('limits each note to the server’s length, and the board to its size', async () => {
  const server = new FakeServer();
  server.maxNotes = 1;
  server.addAsSomeoneElse('only one allowed');
  const element = await board(server);
  expect(pages(element)[0].maxLength).to.equal(50);
  expect((element.shadowRoot!.querySelector('[data-action="add"]') as HTMLButtonElement).disabled).to.equal(true);
});

it('stops refreshing when the window closes', async () => {
  const server = new FakeServer();
  const element = await fixture<StickyNotesElement>(html`<umbradesktop-sticky-notes
    .api=${server}
    .pollInterval=${10}
  ></umbradesktop-sticky-notes>`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(server.lists, 'refreshing while open').to.be.greaterThan(1);
  element.remove();
  const before = server.lists;
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(server.lists, 'and not once closed').to.equal(before);
});

/**
 * Coming back to the window refreshes it, and "coming back" is usually a click, not a focus change:
 * clicking a window's background or a note's byline moves no focus at all. Found by running two
 * real sessions side by side, where the second never saw the first's note until it clicked into a
 * text box.
 */
it('refreshes when the window is clicked, not only when something in it takes focus', async () => {
  const server = new FakeServer();
  const element = await board(server);
  element.focusRefreshGap = 0;
  server.addAsSomeoneElse('From Grace');
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  await settle(element);
  expect(pages(element).map((page) => page.value)).to.deep.equal(['From Grace']);
});
