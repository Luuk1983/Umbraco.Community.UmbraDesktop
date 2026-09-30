import { expect, fixture, html } from '@open-wc/testing';
import './sticky-notes.element.js';
import type { StickyNotesElement } from './sticky-notes.element.js';
import {
  STICKY_NOTES_LINE_PX,
  STICKY_NOTES_PAPER,
  STICKY_NOTES_PERSONAL_MAX_NOTES,
  STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH,
  STICKY_NOTES_SHARED_PAPER,
} from './constants.js';
import type { StickyNote, StickyNoteBoard, StickyNotesApi, StickyNoteUpdateResult } from './api.js';
import { parsePersonal, serializePersonal } from './personal.js';
import type { PersonalNote, PersonalNotesStore } from './personal.js';

/**
 * The person's own notes, as the one `umbracoUserData` document that would hold them, with a switch
 * to make the store unreachable.
 */
class FakePersonal implements PersonalNotesStore {
  value: string | null = null;
  reads = 0;
  writes = 0;
  failing = false;

  /** Seed the store with notes of one's own. */
  seed(...texts: string[]): PersonalNote[] {
    const notes = texts.map((text, i) => ({ key: `mine-${i + 1}`, text, updatedAt: '2026-09-30T10:00:00Z' }));
    this.value = serializePersonal(notes);
    return notes;
  }

  /** What the store holds now, as notes. */
  get notes(): PersonalNote[] {
    return parsePersonal(this.value);
  }

  async read(): Promise<string | null | undefined> {
    this.reads++;
    return this.failing ? undefined : this.value;
  }

  async write(value: string): Promise<boolean> {
    if (this.failing) return false;
    this.writes++;
    this.value = value;
    return true;
  }
}

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
 * @param personal The person's own store; an empty one unless a case needs to see it.
 */
async function board(server: FakeServer, answer = true, personal = new FakePersonal()): Promise<StickyNotesElement> {
  const element = await fixture<StickyNotesElement>(html`<umbradesktop-sticky-notes
    .api=${server}
    .personal=${personal}
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
  await click(element, '[data-action="add-shared"]');
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
  expect((element.shadowRoot!.querySelector('[data-action="add-shared"]') as HTMLButtonElement).disabled).to.equal(true);
});

it('stops refreshing when the window closes', async () => {
  const server = new FakeServer();
  const element = await fixture<StickyNotesElement>(html`<umbradesktop-sticky-notes
    .api=${server}
    .personal=${new FakePersonal()}
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
 * The kind of note decides its paper, and nothing else does: a note of one's own is yellow, as
 * Windows' Sticky Notes were, and a shared one is blue, so which is which can be told at a glance.
 * There is no colour to choose, and a shared note the server holds in another colour from before
 * is drawn blue all the same; the server's colour field is left alone.
 */
it('draws my notes on yellow lined paper and shared notes on blue, with no colour to choose', async () => {
  const server = new FakeServer();
  const green = server.addAsSomeoneElse('Once green');
  server.notes = server.notes.map((note) => (note.key === green.key ? { ...note, colour: 'green' } : note));
  const personal = new FakePersonal();
  personal.seed('Mine');
  const element = await board(server, true, personal);
  const paper = (kind: string) =>
    getComputedStyle(element.shadowRoot!.querySelector<HTMLElement>(`.note[data-kind="${kind}"]`)!)
      .getPropertyValue('--note-paper')
      .trim();

  expect(paper('personal')).to.equal(STICKY_NOTES_PAPER);
  expect(paper('shared')).to.equal(STICKY_NOTES_SHARED_PAPER);
  expect(element.shadowRoot!.querySelectorAll('.swatch').length, 'no colour swatches').to.equal(0);
  for (const page of pages(element)) {
    expect(getComputedStyle(page).backgroundImage, 'ruled').to.contain('repeating-linear-gradient');
    expect(getComputedStyle(page).lineHeight, 'text on the lines').to.equal(`${STICKY_NOTES_LINE_PX}px`);
  }
});

it('adds shared notes in blue, the server’s name for their paper', async () => {
  const server = new FakeServer();
  const element = await board(server);
  await click(element, '[data-action="add-shared"]');
  expect(server.notes[server.notes.length - 1]?.colour).to.equal('blue');
});

/** The notes' texts, in the order the window shows them. */
const order = (element: StickyNotesElement) => pages(element).map((page) => page.value);

/**
 * A mouse pointer event at a point, as the drag reads it.
 * @param type The event type.
 * @param clientX Where.
 * @param clientY Where.
 */
const pointer = (type: string, clientX: number, clientY: number) =>
  new PointerEvent(type, { bubbles: true, composed: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX, clientY });

/**
 * Press a note's handle and move the pointer over one side of another note, without letting go:
 * a drag under way, on pointer events as the launcher's is.
 * @param element The board.
 * @param from The index of the note to drag.
 * @param to The index of the note the pointer ends over.
 * @param side Which half of that note it is over.
 */
async function hold(element: StickyNotesElement, from: number, to: number, side: 'left' | 'right'): Promise<{ x: number; y: number }> {
  const notes = element.shadowRoot!.querySelectorAll<HTMLElement>('.note');
  const handle = notes[from].querySelector<HTMLElement>('.handle')!;
  const start = handle.getBoundingClientRect();
  const box = notes[to].getBoundingClientRect();
  const x = side === 'left' ? box.left + 4 : box.right - 4;
  const y = box.top + box.height / 2;
  handle.dispatchEvent(pointer('pointerdown', start.left + 2, start.top + 2));
  window.dispatchEvent(pointer('pointermove', x, y));
  await element.updateComplete;
  return { x, y };
}

/**
 * Drag a note by its handle and drop it on another, on one side or the other.
 * @param element The board.
 * @param from The index of the note to drag.
 * @param to The index of the note it is dropped on.
 * @param side Which half of that note it lands on.
 */
async function drag(element: StickyNotesElement, from: number, to: number, side: 'left' | 'right'): Promise<void> {
  const { x, y } = await hold(element, from, to, side);
  window.dispatchEvent(pointer('pointerup', x, y));
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

/**
 * While a note is dragged it looks as a launcher tile does in arrange mode (#59): the note stays in
 * place, faded, a small copy follows the pointer beside it, and a bar in the gap shows where it
 * would land. Escape puts everything back without moving anything.
 */
it('lifts the note, shows a ghost and a landing bar while dragging, and cancels on Escape', async () => {
  const { server, element } = await abc();
  await hold(element, 2, 0, 'left');
  const notes = element.shadowRoot!.querySelectorAll<HTMLElement>('.note');
  expect(notes[2].hasAttribute('data-lifted'), 'the dragged note is lifted').to.equal(true);
  expect(notes[0].dataset.drop, 'the bar is before the note under the pointer').to.equal('before');
  expect(element.shadowRoot!.querySelector('.drag-ghost'), 'a ghost follows the pointer').to.not.equal(null);

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  await settle(element);
  expect(element.shadowRoot!.querySelector('.drag-ghost'), 'the ghost has gone').to.equal(null);
  expect(element.shadowRoot!.querySelector('[data-lifted]'), 'nothing is lifted').to.equal(null);
  expect(element.shadowRoot!.querySelector('[data-drop]'), 'no bar').to.equal(null);
  expect(order(element)).to.deep.equal(['A', 'B', 'C']);
  expect(server.moves).to.deep.equal([]);
});

describe('my notes and shared notes', () => {
  /** The headings shown, in order. */
  const headings = (element: StickyNotesElement) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.group-heading .title')].map((heading) => heading.textContent?.trim());

  it('shows my own notes first, then the shared ones, each under its own heading', async () => {
    const server = new FakeServer();
    server.addAsSomeoneElse('Shared by Grace');
    const personal = new FakePersonal();
    personal.seed('Only mine');
    const element = await board(server, true, personal);
    expect(order(element)).to.deep.equal(['Only mine', 'Shared by Grace']);
    expect(headings(element)).to.deep.equal(['My notes', 'Shared with everyone']);
  });

  it('hides the heading of a group with no notes in it', async () => {
    const server = new FakeServer();
    server.addAsSomeoneElse('Shared by Grace');
    const element = await board(server);
    expect(headings(element)).to.deep.equal(['Shared with everyone']);
  });

  it('says what the two kinds are when there are no notes of either', async () => {
    const element = await board(new FakeServer());
    expect(headings(element)).to.deep.equal([]);
    const empty = element.shadowRoot!.querySelector('.empty')?.textContent ?? '';
    expect(empty).to.contain('yours alone');
    expect(empty).to.contain('everyone');
  });

  /** A note of one's own is kept in the person's own store and never reaches the shared board. */
  it('adds a note of my own to my store, not to the shared board, and saves what is typed into it', async () => {
    const server = new FakeServer();
    const personal = new FakePersonal();
    const element = await board(server, true, personal);
    await click(element, '[data-action="add"]');
    expect(server.notes, 'nothing shared').to.have.length(0);
    expect(personal.notes).to.have.length(1);
    await type(element, 0, 'Remember the milk');
    await settle(element);
    expect(personal.notes.map((note) => note.text)).to.deep.equal(['Remember the milk']);
    expect(element.shadowRoot!.querySelector('.note[data-kind="personal"] .by')?.textContent).to.contain('Only you');
  });

  /**
   * Found live: a tab loaded before notes were added in another browser saved its own note over
   * them, and they were gone. A save now merges with what is stored rather than replacing it.
   */
  it('keeps a note of mine that another browser added after this window loaded', async () => {
    const server = new FakeServer();
    const personal = new FakePersonal();
    const element = await board(server, true, personal);
    personal.seed('Written in another browser');
    await click(element, '[data-action="add"]');
    await type(element, 0, 'Written here');
    await settle(element);
    expect(personal.notes.map((note) => note.text).sort()).to.deep.equal(['Written here', 'Written in another browser']);
    expect(element.shadowRoot!.querySelectorAll('.note[data-kind="personal"]'), 'shown here too').to.have.length(2);
  });

  it('adds a shared note to the shared board only', async () => {
    const server = new FakeServer();
    const personal = new FakePersonal();
    const element = await board(server, true, personal);
    await click(element, '[data-action="add-shared"]');
    expect(server.notes).to.have.length(1);
    expect(personal.notes).to.have.length(0);
    expect(element.shadowRoot!.querySelector('.note')?.getAttribute('data-kind')).to.equal('shared');
  });

  it('marks the window unsaved until my own note is stored', async () => {
    const personal = new FakePersonal();
    personal.seed('one');
    const element = await board(new FakeServer(), true, personal);
    element.saveDelay = 60_000;
    await type(element, 0, 'one two');
    expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
    await element.saveNow();
    await settle(element);
    expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
    expect(personal.notes[0].text).to.equal('one two');
  });

  it('keeps my unsaved text and stays marked unsaved when my store cannot be reached', async () => {
    const personal = new FakePersonal();
    personal.seed('one');
    const element = await board(new FakeServer(), true, personal);
    personal.failing = true;
    await type(element, 0, 'one two');
    await settle(element);
    expect(pages(element)[0].value).to.equal('one two');
    expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
    personal.failing = false;
    await element.refresh();
    await settle(element);
    expect(personal.notes[0].text, 'saved once the store is back').to.equal('one two');
    expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
  });

  /**
   * A store that could not be read is not an empty one: a note added then would be written over
   * everything the person already had.
   */
  it('offers no new note of my own until my store has been read', async () => {
    const personal = new FakePersonal();
    personal.seed('kept');
    personal.failing = true;
    const element = await board(new FakeServer(), true, personal);
    const add = () => element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add"]')!;
    expect(add().disabled).to.equal(true);
    personal.failing = false;
    await element.refresh();
    await settle(element);
    expect(add().disabled).to.equal(false);
    expect(order(element)).to.deep.equal(['kept']);
  });

  it('holds my notes to the same caps as the shared board', async () => {
    const personal = new FakePersonal();
    personal.seed(...Array.from({ length: STICKY_NOTES_PERSONAL_MAX_NOTES }, () => ''));
    const element = await board(new FakeServer(), true, personal);
    expect(pages(element)[0].maxLength).to.equal(STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH);
    expect(element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add"]')!.disabled).to.equal(true);
  });

  it('deletes a note of my own after asking, from my store only', async () => {
    const server = new FakeServer();
    server.addAsSomeoneElse('shared');
    const personal = new FakePersonal();
    personal.seed('mine');
    const element = await board(server, true, personal);
    await click(element, '[data-action="delete"]', 0);
    expect(personal.notes).to.have.length(0);
    expect(server.notes).to.have.length(1);
  });

  /** Two notes of each kind: mine M1, M2, then shared S1, S2. */
  async function mixed() {
    const server = new FakeServer();
    server.addAsSomeoneElse('S1');
    server.addAsSomeoneElse('S2');
    const personal = new FakePersonal();
    personal.seed('M1', 'M2');
    return { server, personal, element: await board(server, true, personal) };
  }

  it('reorders my notes by dragging, keeping the order in my store and telling the server nothing', async () => {
    const { server, personal, element } = await mixed();
    await drag(element, 1, 0, 'left');
    expect(order(element)).to.deep.equal(['M2', 'M1', 'S1', 'S2']);
    expect(personal.notes.map((note) => note.text)).to.deep.equal(['M2', 'M1']);
    expect(server.moves).to.deep.equal([]);
  });

  it('does not drop a note into the other group', async () => {
    const { server, personal, element } = await mixed();
    await hold(element, 0, 2, 'left');
    expect(element.shadowRoot!.querySelector('[data-drop]'), 'no landing bar over the other group').to.equal(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await drag(element, 0, 2, 'left');
    await drag(element, 3, 1, 'right');
    expect(order(element)).to.deep.equal(['M1', 'M2', 'S1', 'S2']);
    expect(personal.notes.map((note) => note.text)).to.deep.equal(['M1', 'M2']);
    expect(server.moves).to.deep.equal([]);
  });

  it('moves with the arrow keys within a group, and stops at its edge', async () => {
    const { server, personal, element } = await mixed();
    const handles = () => element.shadowRoot!.querySelectorAll<HTMLElement>('.note .handle');
    const press = async (index: number, key: string) => {
      handles()[index].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
      await settle(element);
    };
    await press(0, 'ArrowRight');
    expect(order(element)).to.deep.equal(['M2', 'M1', 'S1', 'S2']);
    expect(personal.notes.map((note) => note.text)).to.deep.equal(['M2', 'M1']);
    expect(element.shadowRoot!.activeElement, 'focus stays on the moved note’s handle').to.equal(handles()[1]);
    await press(1, 'ArrowRight');
    expect(order(element), 'not past the end of my notes').to.deep.equal(['M2', 'M1', 'S1', 'S2']);
    await press(2, 'ArrowLeft');
    expect(order(element), 'not before the start of the shared ones').to.deep.equal(['M2', 'M1', 'S1', 'S2']);
    expect(server.moves).to.deep.equal([]);
  });
});

describe('refreshing the shared board', () => {
  /** Wait long enough for a 10ms poll to have fired several times. */
  const polls = () => new Promise((resolve) => setTimeout(resolve, 60));

  /** A mounted board polling every 10ms. */
  async function polling(personal = new FakePersonal()) {
    const server = new FakeServer();
    const element = await fixture<StickyNotesElement>(html`<umbradesktop-sticky-notes
      .api=${server}
      .personal=${personal}
      .pollInterval=${10}
    ></umbradesktop-sticky-notes>`);
    await settle(element);
    return { server, personal, element };
  }

  /** Make the page report itself hidden, as a background tab does, until the returned function runs. */
  function hidePage(): () => void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    return () => {
      delete (document as { visibilityState?: string }).visibilityState;
    };
  }

  afterEach(() => {
    delete (document as { visibilityState?: string }).visibilityState;
  });

  it('polls the shared board only, never my own store', async () => {
    const { server, personal } = await polling();
    const reads = personal.reads;
    const lists = server.lists;
    await polls();
    expect(server.lists).to.be.greaterThan(lists + 1);
    expect(personal.reads).to.equal(reads);
  });

  it('stops polling while the page is hidden, and refreshes once the moment it is shown', async () => {
    const { server } = await polling();
    const show = hidePage();
    await polls();
    const hidden = server.lists;
    await polls();
    expect(server.lists, 'no polling while hidden').to.equal(hidden);
    show();
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(server.lists, 'refreshed straight away').to.equal(hidden + 1);
  });

  /** A minimised window is still in the page, drawn as nothing: the host sets display: none on it. */
  it('stops polling while the window is not drawn, as when it is minimised', async () => {
    const { server, element } = await polling();
    element.style.display = 'none';
    await polls();
    const hidden = server.lists;
    await polls();
    expect(server.lists, 'no polling while not drawn').to.equal(hidden);
    element.style.display = '';
    await polls();
    expect(server.lists, 'polling again once drawn').to.be.greaterThan(hidden);
  });
});
