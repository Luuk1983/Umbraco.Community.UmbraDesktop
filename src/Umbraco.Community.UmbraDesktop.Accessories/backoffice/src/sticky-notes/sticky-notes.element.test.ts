import { expect, fixture, html } from '@open-wc/testing';
import './sticky-notes.element.js';
import type { StickyNotesElement } from './sticky-notes.element.js';
import { STICKY_NOTES_LINE_PX, STICKY_NOTES_PAPER } from './constants.js';
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

  /** Every move asked for, as [note, the note it goes before]. */
  moves: Array<[string, string | undefined]> = [];

  async move(key: string, before: string | undefined): Promise<boolean> {
    this.moves.push([key, before]);
    const note = this.notes.find((each) => each.key === key);
    if (!note) return false;
    const rest = this.notes.filter((each) => each.key !== key);
    const at = before === undefined ? -1 : rest.findIndex((each) => each.key === before);
    rest.splice(at < 0 ? rest.length : at, 0, note);
    this.notes = rest;
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

/**
 * No ring or shadow for anything a mouse does: every note looks the same, active or not.
 *
 * A textarea matches :focus-visible however it was focused, so the 2px ink outline drew a heavy
 * black frame round every note anyone clicked into. A lift was tried in its place, then a faint
 * edge, and both were turned down, along with the resting drop shadow. The text's own caret is what
 * marks where typing goes.
 */
it('draws no ring or shadow on notes or on the text being typed in', async () => {
  const server = new FakeServer();
  server.addAsSomeoneElse('One');
  server.addAsSomeoneElse('Two');
  const element = await board(server);
  const [first] = pages(element);
  const notes = element.shadowRoot!.querySelectorAll<HTMLElement>('.note');

  first.focus();
  await element.updateComplete;

  expect(element.shadowRoot!.activeElement, 'the text took focus').to.equal(first);
  expect(getComputedStyle(first).outlineStyle, 'no outline on the text').to.equal('none');
  for (const note of notes) expect(getComputedStyle(note).boxShadow, 'every note sits flat').to.equal('none');
});

/**
 * Every note is yellow, on lined paper, as Windows' Sticky Notes were. The colour choice went, so a
 * note the server holds in another colour from before is drawn yellow too; the server's colour
 * field is left alone.
 */
it('draws every note on yellow lined paper, with no colour to choose', async () => {
  const server = new FakeServer();
  const green = server.addAsSomeoneElse('Once green');
  server.notes = server.notes.map((note) => (note.key === green.key ? { ...note, colour: 'green' } : note));
  const element = await board(server);
  const note = element.shadowRoot!.querySelector<HTMLElement>('.note')!;

  expect(getComputedStyle(note).getPropertyValue('--note-paper').trim()).to.equal(STICKY_NOTES_PAPER);
  expect(element.shadowRoot!.querySelectorAll('.swatch').length, 'no colour swatches').to.equal(0);
  const page = pages(element)[0];
  expect(getComputedStyle(page).backgroundImage, 'ruled').to.contain('repeating-linear-gradient');
  expect(getComputedStyle(page).lineHeight, 'text on the lines').to.equal(`${STICKY_NOTES_LINE_PX}px`);
});

it('adds new notes in yellow', async () => {
  const server = new FakeServer();
  const element = await board(server);
  await click(element, '[data-action="add"]');
  expect(server.notes[server.notes.length - 1]?.colour).to.equal('yellow');
});

/** The notes' texts, in the order the window shows them. */
const order = (element: StickyNotesElement) => pages(element).map((page) => page.value);

/**
 * Drag a note by its handle and drop it on another, on one side or the other.
 * @param element The board.
 * @param from The index of the note to drag.
 * @param to The index of the note it is dropped on.
 * @param side Which half of that note it lands on.
 */
async function drag(element: StickyNotesElement, from: number, to: number, side: 'left' | 'right'): Promise<void> {
  const notes = element.shadowRoot!.querySelectorAll<HTMLElement>('.note');
  const handle = notes[from].querySelector<HTMLElement>('.handle')!;
  const target = notes[to];
  const box = target.getBoundingClientRect();
  const clientX = side === 'left' ? box.left + 2 : box.right - 2;
  const clientY = box.top + box.height / 2;
  const dataTransfer = new DataTransfer();
  handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, dataTransfer }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, composed: true, cancelable: true, dataTransfer, clientX, clientY }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, composed: true, cancelable: true, dataTransfer, clientX, clientY }));
  handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, composed: true, dataTransfer }));
  await settle(element);
}

/** A board of three notes: A, B, C. */
async function abc(): Promise<{ server: FakeServer; element: StickyNotesElement }> {
  const server = new FakeServer();
  for (const text of ['A', 'B', 'C']) server.addAsSomeoneElse(text);
  return { server, element: await board(server) };
}

/**
 * Notes are reordered by dragging, like cards on a Trello board, and the new order is everyone's:
 * the server is told which note it now goes before, so the next refresh confirms it.
 */
it('moves a note before another when it is dropped on the leading half of that note', async () => {
  const { server, element } = await abc();
  await drag(element, 2, 0, 'left');
  expect(order(element)).to.deep.equal(['C', 'A', 'B']);
  expect(server.moves).to.deep.equal([['note-3', 'note-1']]);
});

it('moves a note after another when it is dropped on the trailing half of that note', async () => {
  const { server, element } = await abc();
  await drag(element, 0, 2, 'right');
  expect(order(element)).to.deep.equal(['B', 'C', 'A']);
  expect(server.moves).to.deep.equal([['note-1', undefined]]);
});

it('keeps the new order when the board refreshes', async () => {
  const { element } = await abc();
  await drag(element, 2, 0, 'left');
  await element.refresh();
  await settle(element);
  expect(order(element)).to.deep.equal(['C', 'A', 'B']);
});

/**
 * Dragging is not the only way: the handle is a button, and the arrow keys move its note one place
 * at a time, so a keyboard can reorder the board too.
 */
it('moves a note with the arrow keys on its handle', async () => {
  const { server, element } = await abc();
  const handles = () => element.shadowRoot!.querySelectorAll<HTMLElement>('.note .handle');
  handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
  await settle(element);
  expect(order(element)).to.deep.equal(['B', 'A', 'C']);
  expect(server.moves[server.moves.length - 1]).to.deep.equal(['note-1', 'note-3']);

  handles()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }));
  await settle(element);
  expect(order(element)).to.deep.equal(['A', 'B', 'C']);
});
