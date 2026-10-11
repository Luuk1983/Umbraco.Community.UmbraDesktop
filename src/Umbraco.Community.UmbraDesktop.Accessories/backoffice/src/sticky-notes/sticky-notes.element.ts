import { accessoryStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { ACCESSORIES_USER_DATA_GROUP, createUserDataClient, UserDataDocument } from '../shared/user-data.js';
import { createStickyNotesApi } from './api.js';
import type { StickyNotesApi } from './api.js';
import { editNote, fromServer, mergeBoard, moveNote, saved } from './board.js';
import type { LocalNote } from './board.js';
import { NoteDragController } from './note-drag.js';
import type { NoteDropTarget } from './note-drag.js';
import { mergePersonal, parsePersonal, serializePersonal } from './personal.js';
import type { PersonalNote, PersonalNotesStore } from './personal.js';
import {
  STICKY_NOTES_DRAG_GHOST_OFFSET_PX,
  STICKY_NOTES_DRAG_GHOST_SIZE,
  STICKY_NOTES_DRAG_GHOST_TOUCH_LIFT_PX,
  STICKY_NOTES_DROP_BAR_PX,
  STICKY_NOTES_FOCUS_REFRESH_GAP_MS,
  STICKY_NOTES_INK,
  STICKY_NOTES_LINE_PX,
  STICKY_NOTES_NOTE_HEIGHT_PX,
  STICKY_NOTES_NOTE_MIN_WIDTH_PX,
  STICKY_NOTES_PADDING_PX,
  STICKY_NOTES_PAPER,
  STICKY_NOTES_PERSONAL_MAX_NOTES,
  STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH,
  STICKY_NOTES_POLL_INTERVAL_MS,
  STICKY_NOTES_SAVE_DELAY_MS,
  STICKY_NOTES_SHARED_COLOUR,
  STICKY_NOTES_SHARED_PAPER,
  STICKY_NOTES_TEXT_MIN_HEIGHT_PX,
  STICKY_NOTES_TEXT_TOP_PX,
  STICKY_NOTES_TOOLBAR_HEIGHT_PX,
  STICKY_NOTES_USER_DATA_IDENTIFIER,
} from './constants.js';
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbId } from '@umbraco-cms/backoffice/id';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';

/** The faint ruled lines on a note: the note's ink, mostly transparent. */
const STICKY_NOTES_RULE = `color-mix(in srgb, ${STICKY_NOTES_INK} 14%, transparent)`;

/**
 * The limits for the shared board until the server has sent its own. The same numbers a person's
 * own notes are held to, which are the server's.
 */
const DEFAULT_LIMITS = {
  maxTextLength: STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH,
  maxNotes: STICKY_NOTES_PERSONAL_MAX_NOTES,
  colours: [STICKY_NOTES_SHARED_COLOUR],
};

/** Which of the two groups a note belongs to: the reader's own, or everyone's. */
type NoteKind = 'personal' | 'shared';

/**
 * Sticky Notes, as a self-contained UmbraDesktop app: one board holding two kinds of note, the
 * reader's own and the ones shared by everyone who uses the desktop.
 *
 * **A person's own notes** are yellow, listed first under "My notes", and nobody else sees them. They
 * live in Umbraco's per-user store as one document (`personal.ts`), saved shortly after typing stops,
 * with no versions and no conflicts: nobody else can write that row. Two tabs of the same person
 * each hold the whole list, so a save merges with what is stored (`mergePersonal`) rather than
 * replacing it, and a note added in one tab survives a save from the other.
 *
 * **Shared notes** are blue, listed second, and live on the server (`StickyNotes/` in this package).
 * The window asks for everyone else's changes every fifteen seconds while the board can be seen, and
 * whenever it is focused. The rules for folding the two copies together are in `board.ts`, and the
 * one that matters is that a refresh never overwrites text somebody is still writing. Two people
 * editing one note is expected rather than rare, and it is never settled silently: the server
 * refuses the second save, and the window keeps its own text on screen with the other version beside
 * it, "use theirs" or "keep mine". A note deleted elsewhere while it had unsaved text here is offered
 * back the same way.
 *
 * While any text of either kind is waiting to be saved, or a shared note is unsettled, the window
 * carries the desktop's unsaved-work attribute, so closing it asks.
 */
@customElement('umbradesktop-sticky-notes')
export class StickyNotesElement extends UmbLitElement {
  /** The server, for shared notes. The real API unless a test says otherwise. */
  @property({ attribute: false })
  api: StickyNotesApi = createStickyNotesApi();

  /**
   * Where the reader's own notes are kept: their `umbracoUserData` document unless a test says
   * otherwise. Built here, with this element as the requests' host, and making no request until read.
   */
  @property({ attribute: false })
  personal: PersonalNotesStore = new UserDataDocument(
    createUserDataClient(this),
    ACCESSORIES_USER_DATA_GROUP,
    STICKY_NOTES_USER_DATA_IDENTIFIER,
  );

  /** How long after the last keystroke a note is saved, in ms. Read each time a save is scheduled. */
  @property({ attribute: false })
  saveDelay = STICKY_NOTES_SAVE_DELAY_MS;

  /** How often the shared notes refresh, in ms. Zero turns the timer off, which only a test wants. */
  @property({ attribute: false })
  pollInterval = STICKY_NOTES_POLL_INTERVAL_MS;

  /**
   * How recent a refresh must be for coming back to the window to skip another, in ms. Only a test
   * changes it.
   */
  @property({ attribute: false })
  focusRefreshGap = STICKY_NOTES_FOCUS_REFRESH_GAP_MS;

  /**
   * Ask before deleting a note. Umbraco's confirm dialog unless a test says otherwise, saying who
   * else loses it: everyone, for a shared note, and only the reader, for their own.
   */
  @property({ attribute: false })
  confirmDelete: (kind: NoteKind) => Promise<boolean> = async (kind) => {
    try {
      await umbConfirmModal(this, {
        headline: this.#term('stickyNotesDeleteHeadline', 'Delete this note?'),
        content:
          kind === 'shared'
            ? this.#term('stickyNotesDeleteQuestion', 'It is deleted for everyone who uses this desktop.')
            : this.#term('stickyNotesDeletePersonalQuestion', 'Only you could see it, and it cannot be brought back.'),
        confirmLabel: this.#term('stickyNotesDelete', 'Delete note'),
        color: 'danger',
      });
      return true;
    } catch {
      return false;
    }
  };

  /** The window's copy of the shared board. */
  @state()
  private _notes: LocalNote[] = [];

  /** What the server allows, from the last board it sent. */
  @state()
  private _limits = DEFAULT_LIMITS;

  /** Whether the shared board has loaded at least once. */
  @state()
  private _loaded = false;

  /** Whether the last request to the server failed. The notes stay; this says they may be stale. */
  @state()
  private _offline = false;

  /** The reader's own notes, in their order. */
  @state()
  private _mine: PersonalNote[] = [];

  /**
   * Whether the reader's own notes have been read at least once. Until they have, none can be added:
   * a store that could not be read is not an empty one, and the first write would replace whatever
   * it holds.
   */
  @state()
  private _mineLoaded = false;

  /** Whether the last read or write of the reader's own notes failed. */
  @state()
  private _mineOffline = false;

  /**
   * The reader's own notes whose text has changed since the document was last stored, for the line
   * under each. Empty when everything is stored, except after a move or a delete, which change the
   * document without changing any note's text; {@link _mineUnsaved} covers those.
   */
  @state()
  private _mineTouched: ReadonlySet<string> = new Set();

  /** Whether the reader's own document has changes it has not stored yet. */
  @state()
  private _mineUnsaved = false;

  /** Pending shared saves, by note. */
  #saveTimers = new Map<string, number>();

  /** Shared notes with a save on its way to the server, so a second is not sent over the first. */
  #saving = new Set<string>();

  /** The pending save of the reader's own document. */
  #mineTimer?: number;

  /** Whether the reader's own document is being written, so a second write waits for the first. */
  #mineSaving = false;

  /**
   * Counts every change to the reader's own notes. A write that finds it moved on knows more was
   * changed while it was in flight, and a read that finds it moved on is discarded rather than
   * replacing what was just typed.
   */
  #mineRevision = 0;

  /**
   * The reader's own notes as this window last read or stored them: the base a save merges against
   * (`mergePersonal`), so it can tell a note another tab added from one this window deleted.
   */
  #mineBase: PersonalNote[] = [];

  /** The refresh timer. */
  #poll?: number;

  /** When the board last refreshed, for skipping a focus refresh straight after one. */
  #lastRefresh = 0;

  /** The note being dragged, while one is. */
  @state()
  private _dragging?: string;

  /** Where a dragged note would land if it were dropped now. */
  @state()
  private _dropAt?: NoteDropTarget;

  /**
   * The drag. Hit-tests this element's own shadow root, and only ever lands a note beside another of
   * its own kind: the two groups are kept apart, so dragging cannot share a note or take one back.
   */
  #drag = new NoteDragController(() => this.shadowRoot, {
    targetAt: (x, y, key) => this.#targetAt(x, y, key),
    ghost: (key) => this.#ghost(key),
    onStart: (key) => (this._dragging = key),
    onOver: (target) => (this._dropAt = target),
    onDrop: (key, target) => this.#onDrop(key, target),
    onEnd: () => {
      this._dragging = undefined;
      this._dropAt = undefined;
    },
    scroller: () => this.shadowRoot?.querySelector<HTMLElement>('.board') ?? null,
  });

  /** Load both kinds of note and start refreshing the shared ones. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
    this.addEventListener('focusin', this.#onFocus);
    this.addEventListener('pointerdown', this.#onFocus);
    document.addEventListener('visibilitychange', this.#onVisibility);
    void this.refresh();
    if (this.pollInterval > 0) this.#poll = window.setInterval(this.#onTick, this.pollInterval);
  }

  /**
   * Stop refreshing and drop pending save timers. The whole of teardown: a timer left running would
   * keep asking the server for a board nobody is looking at. Pending saves are not flushed here,
   * because closing over unsaved text already asked the person (see {@link UNSAVED_ATTRIBUTE}).
   */
  override disconnectedCallback(): void {
    this.removeEventListener('mousedown', keepFocusOnPress);
    this.removeEventListener('focusin', this.#onFocus);
    this.removeEventListener('pointerdown', this.#onFocus);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    window.clearInterval(this.#poll);
    this.#poll = undefined;
    for (const timer of this.#saveTimers.values()) window.clearTimeout(timer);
    this.#saveTimers.clear();
    window.clearTimeout(this.#mineTimer);
    this.#mineTimer = undefined;
    this.#drag.cancel();
    super.disconnectedCallback();
  }

  /** Mirror unsaved and unsettled notes of either kind onto the desktop's unsaved-work attribute. */
  override updated(): void {
    this.toggleAttribute(
      UNSAVED_ATTRIBUTE,
      this._mineUnsaved || this._notes.some((note) => note.pending || note.conflict || note.deletedElsewhere),
    );
  }

  /**
   * Whether anybody could be looking at the board: the page is not a background tab, and this
   * element is drawn. A minimised window stays in the page with `display: none`, which
   * `checkVisibility` reports; an engine without it gets the same answer from the element having no
   * boxes at all.
   * @returns True when the board can be seen.
   */
  #canBeSeen(): boolean {
    if (document.visibilityState === 'hidden') return false;
    const check = (this as { checkVisibility?: () => boolean }).checkVisibility;
    return check ? check.call(this) : this.getClientRects().length > 0;
  }

  /**
   * The poll: refresh the shared notes, but only while somebody could see them. A board left open in
   * a background tab or a minimised window, all day, asks the server nothing. Coming back to it is a
   * focus, a click or the tab being shown again, and each refreshes at once.
   *
   * The reader's own notes are not polled: nobody else writes them. A save of theirs that failed is
   * retried here, though, so text typed while the store was unreachable is not left waiting for a
   * click.
   */
  #onTick = (): void => {
    if (!this.#canBeSeen()) return;
    void this.#refreshShared();
    if (this._mineUnsaved && !this.#mineSaving && this.#mineTimer === undefined) void this.#saveMine();
  };

  /** The tab has been shown again: refresh straight away rather than wait for the next poll. */
  #onVisibility = (): void => {
    if (this.#canBeSeen()) void this.refresh();
  };

  /**
   * Refresh when someone comes back to the window, unless a refresh has only just happened: that is
   * the moment they want it current.
   *
   * On a pointer press as well as on focus, because coming back is usually a click, and clicking a
   * window's background or a note's byline moves no focus at all. Listening for focus alone was
   * found wanting by running two real sessions side by side: the second never saw the first's note
   * until it happened to click into a text box.
   */
  #onFocus = (): void => {
    if (Date.now() - this.#lastRefresh >= this.focusRefreshGap) void this.refresh();
  };

  /**
   * Bring both kinds of note up to date: the shared board from the server, and the reader's own from
   * their store, which picks up what another tab of theirs saved.
   */
  async refresh(): Promise<void> {
    await Promise.all([this.#refreshShared(), this.#refreshMine()]);
  }

  /** Ask the server for the shared board and fold it into the window's copy, then retry any unsaved note. */
  async #refreshShared(): Promise<void> {
    this.#lastRefresh = Date.now();
    const board = await this.api.list();
    if (!board) {
      this._offline = true;
      return;
    }
    this._offline = false;
    this._limits = { maxTextLength: board.maxTextLength, maxNotes: board.maxNotes, colours: board.colours };
    this._notes = mergeBoard(this._notes, board.notes);
    this._loaded = true;
    // A save that failed while the server was unreachable is retried now that it is back.
    for (const note of this._notes) if (note.pending && !this.#saveTimers.has(note.key)) void this.#save(note.key);
  }

  /**
   * Read the reader's own notes again, unless they have changes of their own not yet stored, in
   * which case those are saved instead: what is on screen is newer than what is stored.
   */
  async #refreshMine(): Promise<void> {
    if (this._mineUnsaved || this.#mineSaving) {
      if (!this.#mineSaving && this.#mineTimer === undefined) await this.#saveMine();
      return;
    }
    const revision = this.#mineRevision;
    const value = await this.personal.read();
    if (value === undefined) {
      this._mineOffline = true;
      return;
    }
    this._mineOffline = false;
    // Something was changed while the read was out: keep that, not what the store had before it.
    if (revision !== this.#mineRevision) return;
    this._mine = parsePersonal(value);
    this.#mineBase = this._mine;
    this._mineLoaded = true;
  }

  /** Save every note with unsaved text now, of either kind, without waiting for the typing pause. */
  async saveNow(): Promise<void> {
    await Promise.all([
      ...this._notes.filter((note) => note.pending).map((note) => this.#save(note.key)),
      this._mineUnsaved ? this.#saveMine() : Promise.resolve(),
    ]);
  }

  /**
   * Put the cursor in a note that has just been added.
   * @param key The note.
   */
  async #focusText(key: string): Promise<void> {
    await this.updateComplete;
    this.shadowRoot?.querySelector<HTMLTextAreaElement>(`.note[data-key="${key}"] textarea`)?.focus();
  }

  /** Add a note of the reader's own, at the end of theirs, and put the cursor in it. */
  async #addMine(): Promise<void> {
    if (!this._mineLoaded || this._mine.length >= STICKY_NOTES_PERSONAL_MAX_NOTES) return;
    const note: PersonalNote = { key: UmbId.new(), text: '', updatedAt: new Date().toISOString() };
    this.#changeMine([...this._mine, note]);
    await this.#focusText(note.key);
    await this.#saveMine();
  }

  /** Add a shared note, in the shared paper's colour, and put the cursor in it. */
  async #addShared(): Promise<void> {
    const note = await this.api.create('', STICKY_NOTES_SHARED_COLOUR);
    if (!note) {
      this._offline = true;
      return;
    }
    this._notes = [...this._notes, ...fromServer([note])];
    await this.#focusText(note.key);
  }

  /**
   * Change the reader's own list and mark it unsaved. Every change to it comes through here, so the
   * revision a write or a read compares against always moves.
   * @param notes The new list.
   * @param touched The note whose text changed, if one did.
   */
  #changeMine(notes: PersonalNote[], touched?: string): void {
    this._mine = notes;
    this.#mineRevision++;
    this._mineUnsaved = true;
    if (touched) this._mineTouched = new Set([...this._mineTouched, touched]);
  }

  /**
   * Typing in a note of the reader's own: keep it, and store the document after the typing pause.
   * @param key The note.
   * @param text What it now says.
   */
  #editMine(key: string, text: string): void {
    const updatedAt = new Date().toISOString();
    this.#changeMine(
      this._mine.map((note) => (note.key === key ? { ...note, text, updatedAt } : note)),
      key,
    );
    window.clearTimeout(this.#mineTimer);
    this.#mineTimer = window.setTimeout(() => {
      this.#mineTimer = undefined;
      void this.#saveMine();
    }, this.saveDelay);
  }

  /**
   * Store the reader's own document now. One write at a time: a change made while one is in flight
   * is stored by another straight after it. A write that fails leaves everything unsaved, and the
   * next poll or refresh tries again.
   *
   * It reads what is stored first and merges (`mergePersonal`) rather than writing this window's
   * list over it, because another tab or browser of the same person may have added a note since this
   * one loaded, and a plain write would delete it. A read that fails writes nothing: without it, the
   * merge cannot know what it would be overwriting.
   */
  async #saveMine(): Promise<void> {
    window.clearTimeout(this.#mineTimer);
    this.#mineTimer = undefined;
    if (this.#mineSaving) return;
    this.#mineSaving = true;
    const revision = this.#mineRevision;
    let stored = false;
    let merged: PersonalNote[] = this._mine;
    try {
      const current = await this.personal.read();
      if (current !== undefined) {
        merged = mergePersonal(this.#mineBase, this._mine, parsePersonal(current));
        stored = await this.personal.write(serializePersonal(merged));
      }
    } finally {
      this.#mineSaving = false;
    }
    this._mineOffline = !stored;
    if (!stored) return;
    this.#mineBase = merged;
    if (revision === this.#mineRevision) {
      // Show what the merge brought in from elsewhere; nothing was typed meanwhile to lose.
      this._mine = merged;
      this._mineUnsaved = false;
      this._mineTouched = new Set();
    } else if (this.#mineTimer === undefined) {
      await this.#saveMine();
    }
  }

  /**
   * A shared edit in this window: keep it, and save it after the typing pause.
   * @param key The note.
   * @param text Its new text.
   */
  #edit(key: string, text: string): void {
    this._notes = editNote(this._notes, key, { text });
    window.clearTimeout(this.#saveTimers.get(key));
    this.#saveTimers.set(
      key,
      window.setTimeout(() => {
        this.#saveTimers.delete(key);
        void this.#save(key);
      }, this.saveDelay),
    );
  }

  /**
   * Send one shared note's unsaved text to the server, always in the shared paper's colour, so a note
   * from the days of the colour choice takes it on its next save.
   *
   * Skipped for a note already being saved, in conflict or deleted elsewhere: the first finishes and
   * saves again if more was typed meanwhile, and the other two wait for a person to choose.
   * @param key The note.
   */
  async #save(key: string): Promise<void> {
    const note = this._notes.find((candidate) => candidate.key === key);
    if (!note?.pending || note.conflict || note.deletedElsewhere || this.#saving.has(key)) return;
    this.#saving.add(key);
    try {
      const result = await this.api.update(key, note.text, STICKY_NOTES_SHARED_COLOUR, note.version);
      switch (result.status) {
        case 'saved':
          this._offline = false;
          this._notes = saved(this._notes, result.note, note.text);
          break;
        case 'conflict':
          this._notes = this._notes.map((each) => (each.key === key ? { ...each, conflict: result.note } : each));
          break;
        case 'notFound':
          this._notes = this._notes.map((each) => (each.key === key ? { ...each, deletedElsewhere: true } : each));
          break;
        case 'failed':
          // Kept pending, so the next refresh retries it.
          this._offline = true;
          break;
      }
    } finally {
      this.#saving.delete(key);
    }
    // More was typed while that save was in flight: save again.
    const after = this._notes.find((candidate) => candidate.key === key);
    if (after?.pending && !after.conflict && !after.deletedElsewhere && !this.#saveTimers.has(key)) {
      await this.#save(key);
    }
  }

  /**
   * Settle a conflict in favour of the other version.
   * @param key The note.
   */
  #useTheirs(key: string): void {
    this._notes = this._notes.map((note) =>
      note.key === key && note.conflict ? { ...note.conflict, pending: false } : note,
    );
  }

  /**
   * Settle a conflict in favour of this window's text, knowingly: saved against their version, so the
   * server accepts it.
   * @param key The note.
   */
  async #keepMine(key: string): Promise<void> {
    this._notes = this._notes.map((note) =>
      note.key === key && note.conflict ? { ...note, version: note.conflict.version, conflict: undefined } : note,
    );
    await this.#save(key);
  }

  /**
   * Put a shared note deleted elsewhere back on the board, as a new note with this window's text.
   * @param key The note as this window knew it.
   */
  async #restore(key: string): Promise<void> {
    const note = this._notes.find((candidate) => candidate.key === key);
    if (!note) return;
    const recreated = await this.api.create(note.text, STICKY_NOTES_SHARED_COLOUR);
    if (!recreated) {
      this._offline = true;
      return;
    }
    this._notes = this._notes.map((each) => (each.key === key ? { ...recreated, pending: false } : each));
  }

  /**
   * Let a shared note deleted elsewhere go.
   * @param key The note.
   */
  #discard(key: string): void {
    this._notes = this._notes.filter((note) => note.key !== key);
  }

  /**
   * Delete a note, after asking: a shared one for everyone, one of the reader's own from their store.
   * @param kind Which group it is in.
   * @param key The note.
   */
  async #delete(kind: NoteKind, key: string): Promise<void> {
    if (!(await this.confirmDelete(kind))) return;
    if (kind === 'personal') {
      this.#changeMine(this._mine.filter((note) => note.key !== key));
      await this.#saveMine();
      return;
    }
    window.clearTimeout(this.#saveTimers.get(key));
    this.#saveTimers.delete(key);
    if (!(await this.api.remove(key))) {
      this._offline = true;
      return;
    }
    this._notes = this._notes.filter((note) => note.key !== key);
  }

  /**
   * Which group a note is in.
   * @param key The note.
   * @returns Its kind.
   */
  #kindOf(key: string): NoteKind {
    return this._mine.some((note) => note.key === key) ? 'personal' : 'shared';
  }

  /**
   * The notes of one kind, in the order they are drawn.
   * @param kind The group.
   * @returns Its notes.
   */
  #listOf(kind: NoteKind): ReadonlyArray<{ key: string; text: string }> {
    return kind === 'personal' ? this._mine : this._notes;
  }

  /**
   * Move a note to sit before another of its own kind, or to the end of its group.
   *
   * The window shows the new order straight away either way. A note of the reader's own is stored
   * with their document at once. A shared note's move is sent to the server naming the note it now
   * goes before rather than a position, so a note someone else adds or deletes meanwhile cannot make
   * it land somewhere else; if the server refuses, the board is read again and shows the order as it
   * really is.
   * @param key The note to move.
   * @param before The note it should go before, or undefined for the end.
   */
  async #move(key: string, before: string | undefined): Promise<void> {
    if (key === before) return;
    if (this.#kindOf(key) === 'personal') {
      this.#changeMine(moveNote(this._mine, key, before));
      await this.#saveMine();
      return;
    }
    this._notes = moveNote(this._notes, key, before);
    if (!(await this.api.move(key, before))) await this.#refreshShared();
  }

  /**
   * Where a note dragged to a point would land: beside the note under the pointer, on the half it is
   * over, if that note is another of the same kind. Halved across rather than down, because a group
   * fills rows left to right and "before" is to the left.
   * @param x The pointer's client x.
   * @param y The pointer's client y.
   * @param key The note being dragged.
   * @returns The landing place, or undefined where it would not land.
   */
  #targetAt(x: number, y: number, key: string): NoteDropTarget | undefined {
    const card = this.shadowRoot?.elementFromPoint(x, y)?.closest<HTMLElement>('.note');
    const over = card?.dataset.key;
    if (!card || !over || over === key || card.dataset.kind !== this.#kindOf(key)) return undefined;
    const box = card.getBoundingClientRect();
    return { key: over, side: x < box.left + box.width / 2 ? 'before' : 'after' };
  }

  /**
   * The ghost that follows the pointer: the dragged note in miniature, on its own paper, with the
   * start of its text. Small, as the launcher's ghost is only a tile's icon, so it does not cover the
   * notes around the pointer and the landing bar between them.
   * @param key The note being dragged.
   * @returns The ghost, not yet in the document.
   */
  #ghost(key: string): HTMLElement {
    const ghost = document.createElement('div');
    ghost.dataset.kind = this.#kindOf(key);
    ghost.textContent = this.#listOf(this.#kindOf(key)).find((note) => note.key === key)?.text ?? '';
    return ghost;
  }

  /**
   * A dragged note was dropped beside another of its kind: move it to that side of it.
   * @param key The note dragged.
   * @param target Where it was dropped.
   */
  #onDrop(key: string, target: NoteDropTarget): void {
    if (target.side === 'before') {
      void this.#move(key, target.key);
      return;
    }
    const rest = this.#listOf(this.#kindOf(key)).filter((note) => note.key !== key);
    void this.#move(key, rest[rest.findIndex((note) => note.key === target.key) + 1]?.key);
  }

  /**
   * The handle's keys: the arrows move its note one place earlier or later within its group, so the
   * board can be reordered without dragging, as a launcher tile can. Nothing happens at a group's
   * edge. Focus stays on the handle as the note moves.
   * @param event The keydown.
   * @param key The note.
   */
  async #onHandleKey(event: KeyboardEvent, key: string): Promise<void> {
    const earlier = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const later = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!earlier && !later) return;
    event.preventDefault();
    const list = this.#listOf(this.#kindOf(key));
    const index = list.findIndex((note) => note.key === key);
    if (earlier && index > 0) await this.#move(key, list[index - 1].key);
    else if (later && index >= 0 && index < list.length - 1) await this.#move(key, list[index + 2]?.key);
    else return;
    await this.updateComplete;
    this.shadowRoot?.querySelector<HTMLElement>(`.note[data-key="${key}"] .handle`)?.focus();
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @param args Values for `%0%`-style placeholders.
   * @returns The localised string.
   */
  #term(key: string, fallback: string, ...args: unknown[]): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback, ...args);
  }

  /**
   * When a note was last written, as the line under it shows it.
   * @param at The ISO time.
   * @returns The date and time, in the reader's own format.
   */
  #when(at: string): string {
    return this.localize.date(at, { dateStyle: 'short', timeStyle: 'short' });
  }

  /**
   * The line under a shared note: who last wrote it and when, or that it is waiting to be saved.
   * @param note The note.
   * @returns The line.
   */
  #byline(note: LocalNote): string {
    if (note.pending) return this.#term('stickyNotesUnsaved', 'Not saved yet');
    return `${note.updatedBy} · ${this.#when(note.updatedAt)}`;
  }

  /**
   * The line under a note of the reader's own: that only they can see it, and when they last wrote
   * it, or that it is waiting to be saved. Saying "only you" on every one is what makes the two
   * kinds impossible to mistake for each other, beyond their colour.
   * @param note The note.
   * @returns The line.
   */
  #myByline(note: PersonalNote): string {
    if (this._mineTouched.has(note.key)) return this.#term('stickyNotesUnsaved', 'Not saved yet');
    return `${this.#term('stickyNotesOnlyYou', 'Only you')} · ${this.#when(note.updatedAt)}`;
  }

  /**
   * One note, of either kind.
   * @param kind Its group.
   * @param note The note.
   * @param body Its text box and the line or panel under it, which differ by kind.
   * @returns Its card.
   */
  #renderCard(kind: NoteKind, note: { key: string }, body: unknown) {
    const move = this.#term('stickyNotesMove', 'Move note: drag it, or use the arrow keys');
    return html`
      <article
        class="note"
        data-key=${note.key}
        data-kind=${kind}
        ?data-lifted=${this._dragging === note.key}
        data-drop=${this._dropAt?.key === note.key ? this._dropAt.side : nothing}
      >
        <header>
          <button
            class="handle"
            title=${move}
            aria-label=${move}
            @pointerdown=${(event: PointerEvent) => this.#drag.begin(event, note.key)}
            @keydown=${(event: KeyboardEvent) => this.#onHandleKey(event, note.key)}
          >
            ⠿
          </button>
          <span class="spacer"></span>
          <button
            class="delete"
            data-action="delete"
            title=${this.#term('stickyNotesDelete', 'Delete note')}
            aria-label=${this.#term('stickyNotesDelete', 'Delete note')}
            @click=${() => this.#delete(kind, note.key)}
          >
            ×
          </button>
        </header>
        ${body}
      </article>
    `;
  }

  /**
   * One note of the reader's own: text and a line under it, and never a conflict, since nobody else
   * writes it.
   * @param note The note.
   * @returns Its card.
   */
  #renderMine(note: PersonalNote) {
    return this.#renderCard(
      'personal',
      note,
      html`<textarea
          .value=${note.text}
          maxlength=${STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH}
          aria-label=${this.#term('stickyNotesMyNote', 'Your note')}
          @input=${(event: Event) => this.#editMine(note.key, (event.target as HTMLTextAreaElement).value)}
        ></textarea>
        <footer class="by">${this.#myByline(note)}</footer>`,
    );
  }

  /**
   * One shared note, with its conflict or deleted-elsewhere panel when it has one.
   * @param note The note.
   * @returns Its card.
   */
  #renderShared(note: LocalNote) {
    return this.#renderCard(
      'shared',
      note,
      html`<textarea
          .value=${note.text}
          maxlength=${this._limits.maxTextLength}
          aria-label=${this.#term('stickyNotesNote', 'Note by %0%', note.updatedBy)}
          @input=${(event: Event) => this.#edit(note.key, (event.target as HTMLTextAreaElement).value)}
        ></textarea>
        ${note.conflict
          ? html`<div class="conflict" role="alert">
              <p>
                ${this.#term(
                  'stickyNotesConflict',
                  `${note.conflict.updatedBy} changed this note while you were editing it.`,
                  note.conflict.updatedBy,
                )}
              </p>
              <button data-action="use-theirs" @click=${() => this.#useTheirs(note.key)}>
                ${this.#term('stickyNotesUseTheirs', 'Use theirs')}
              </button>
              <button data-action="keep-mine" @click=${() => this.#keepMine(note.key)}>
                ${this.#term('stickyNotesKeepMine', 'Keep mine')}
              </button>
            </div>`
          : nothing}
        ${note.deletedElsewhere
          ? html`<div class="deleted" role="alert">
              <p>${this.#term('stickyNotesDeletedElsewhere', 'Someone deleted this note while you were editing it.')}</p>
              <button data-action="restore" @click=${() => this.#restore(note.key)}>
                ${this.#term('stickyNotesRestore', 'Put it back')}
              </button>
              <button data-action="discard" @click=${() => this.#discard(note.key)}>
                ${this.#term('stickyNotesDiscard', 'Discard')}
              </button>
            </div>`
          : html`<footer class="by">${this.#byline(note)}</footer>`}`,
    );
  }

  /**
   * One group: a heading saying whose notes these are, then the notes. Not drawn at all when the
   * group is empty, so an empty heading never sits over nothing.
   * @param kind The group.
   * @param title Its heading.
   * @param hint Who can see it, beside the heading.
   * @param cards Its notes, drawn.
   * @returns The group, or nothing.
   */
  #renderGroup(kind: NoteKind, title: string, hint: string, cards: unknown[]) {
    if (cards.length === 0) return nothing;
    return html`<section class="group" data-kind=${kind} aria-label=${title}>
      <h2 class="group-heading"><span class="title">${title}</span><span class="hint muted">${hint}</span></h2>
      <div class="notes">${cards}</div>
    </section>`;
  }

  /**
   * The whole window body.
   * @returns The toolbar and the board.
   */
  override render() {
    const sharedFull = this._notes.length >= this._limits.maxNotes;
    const mineFull = this._mine.length >= STICKY_NOTES_PERSONAL_MAX_NOTES;
    const empty = this._loaded && this._mineLoaded && this._mine.length === 0 && this._notes.length === 0;
    return html`
      <div class="toolbar">
        <button
          class="control"
          data-action="add"
          title=${this.#term('stickyNotesNewTitle', 'A note only you can see')}
          ?disabled=${mineFull || !this._mineLoaded}
          @click=${() => this.#addMine()}
        >
          <span>${this.#term('stickyNotesNew', 'New note')}</span>
        </button>
        <button
          class="control"
          data-action="add-shared"
          title=${this.#term('stickyNotesNewSharedTitle', 'A note everyone who uses this desktop can see and edit')}
          ?disabled=${sharedFull || !this._loaded}
          @click=${() => this.#addShared()}
        >
          <span>${this.#term('stickyNotesNewShared', 'New shared note')}</span>
        </button>
        <span class="muted status" role="status">
          ${this._offline || this._mineOffline
            ? this.#term('stickyNotesOffline', 'Cannot reach the board. Your notes are kept and will be saved when it is back.')
            : nothing}
        </span>
      </div>
      <div class="board">
        ${empty
          ? html`<p class="empty muted">
              ${this.#term(
                'stickyNotesNoNotes',
                'No notes yet. A new note is yours alone; a new shared note is seen by everyone who uses this desktop.',
              )}
            </p>`
          : nothing}
        ${this.#renderGroup(
          'personal',
          this.#term('stickyNotesMine', 'My notes'),
          this.#term('stickyNotesMineHint', 'Only you can see these'),
          this._mine.map((note) => this.#renderMine(note)),
        )}
        ${this.#renderGroup(
          'shared',
          this.#term('stickyNotesSharedHeading', 'Shared with everyone'),
          this.#term('stickyNotesSharedHint', 'Everyone can see and edit these'),
          this._notes.map((note) => this.#renderShared(note)),
        )}
      </div>
    `;
  }

  /**
   * The shared accessory look for the chrome, and paper for the notes.
   *
   * The notes are the app's domain, like Paint's canvas: a note of one's own is yellow and a shared
   * one blue under every theme, with dark ink on both, and only the board behind them and the toolbar
   * are the theme's. Dragging borrows the launcher's look (issue #59) through the app tokens, so it
   * follows the theme as the launcher's does: the lifted note faded in place, a ghost beside the
   * pointer, a bar in the gap where it lands, and the accent's ring on a handle moved by keyboard.
   */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        padding: ${STICKY_NOTES_PADDING_PX}px;
        gap: ${STICKY_NOTES_PADDING_PX}px;
        height: 100%;
      }

      .toolbar {
        flex-wrap: nowrap;
        min-height: ${STICKY_NOTES_TOOLBAR_HEIGHT_PX}px;
        gap: ${STICKY_NOTES_PADDING_PX}px;
      }

      /* The two add buttons shrink, their labels cut short, rather than push the window wider: at
         the smallest size both labels do not fit side by side in English, let alone Dutch. The
         label's column may shrink below its text only because it is minmax(0, 1fr): an auto column,
         or minmax(0, auto), kept the label's full width and it spilled out past the button's edge. */
      .toolbar .control {
        height: ${STICKY_NOTES_TOOLBAR_HEIGHT_PX - 4}px;
        flex: 0 1 auto;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
      }

      /* New note keeps its whole label and New shared note gives way: two labels each cut to "New…"
         said nothing at all, which is what shrinking both evenly drew at the smallest size. */
      .toolbar .control[data-action='add'] {
        flex: none;
      }

      /* max-width as well as the column, because the control centres its content (place-items), and
         a centred grid item is as wide as its text whatever its track is. */
      .toolbar .control span {
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .control[disabled] {
        opacity: 0.45;
        cursor: default;
      }

      .status {
        flex: 1 1 0;
        min-width: 0;
        font-size: 0.85em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .board {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: ${STICKY_NOTES_PADDING_PX}px;
      }

      .group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: none;
      }

      /* Whose notes these are, in one line: the name, and who can see them, cut short before it ever
         wraps. */
      .group-heading {
        display: flex;
        align-items: baseline;
        gap: 6px;
        margin: 0;
        font-size: 0.85em;
        font-weight: normal;
        white-space: nowrap;
        min-width: 0;
      }

      .group-heading .title {
        font-weight: 600;
        flex: none;
      }

      .group-heading .hint {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .notes {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(${STICKY_NOTES_NOTE_MIN_WIDTH_PX}px, 1fr));
        /* Rows exactly as tall as their notes' content, never less than a note's own minimum height
           (below), so a note with a conflict or deleted-elsewhere panel grows instead of spilling
           over the next row. min-content, and not either of the two that look equivalent, both of
           which were tried in a real window and spilled: an auto maximum only grows into spare
           space, which a small window's board does not have, and an auto minimum takes a grid item's
           min-height in place of its content once one is set. */
        grid-auto-rows: min-content;
        gap: ${STICKY_NOTES_PADDING_PX}px;
        align-content: start;
      }

      .empty {
        margin: 0;
      }

      .note {
        position: relative;
        display: flex;
        flex-direction: column;
        min-height: ${STICKY_NOTES_NOTE_HEIGHT_PX}px;
        --note-paper: ${unsafeCSS(STICKY_NOTES_PAPER)};
        background: var(--note-paper);
        color: ${unsafeCSS(STICKY_NOTES_INK)};
        border-radius: 2px;
        font-family: var(--umbradesktop-app-font, inherit);
      }

      .note[data-kind='shared'] {
        --note-paper: ${unsafeCSS(STICKY_NOTES_SHARED_PAPER)};
      }

      /* Everything in a note keeps its own height except the text, which takes what is left. Without
         this the footer and the conflict panel shrank to fit the note's minimum height (the byline
         measured 5px), so the note never reported more content than that and its row never grew. */
      header,
      .by,
      .conflict,
      .deleted {
        flex-shrink: 0;
      }

      header {
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 4px 4px 0;
      }

      /* The grip a note is dragged by, drawn as the launcher's group handle is: bare, muted, with the
         four-arrow move cursor Umbraco uses for moving things. Only this starts a drag, not the whole
         note, so selecting text in a note still selects text, and touch-action: none is what lets a
         finger drag it at once rather than scroll the board (see note-drag.ts). */
      .handle {
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: inherit;
        font-size: 14px;
        line-height: 1;
        cursor: move;
        touch-action: none;
        opacity: 0.45;
      }

      .handle:hover,
      .handle:focus-visible {
        opacity: 1;
        background: color-mix(in srgb, ${unsafeCSS(STICKY_NOTES_INK)} 8%, transparent);
      }

      /* The keyboard's ring on the handle, which is where the arrow keys move a note: the accent, as
         a launcher tile being arranged shows it, so a note being moved looks like a tile being moved. */
      .handle:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 1px;
      }

      /* While dragging, as in the launcher: the note being moved stays where it was, faded, so the
         gap it leaves reads as where it came from. */
      .note[data-lifted] {
        opacity: 0.35;
      }

      /* Where a dragged note lands: a bar in the middle of the gap before or after the note under the
         pointer, as the launcher draws between tiles. Pseudo-elements, so it costs no layout, in the
         accent, which is the app tokens' "selection and focus" and the launcher's focus colour. */
      .note[data-drop='before']::before,
      .note[data-drop='after']::after {
        content: '';
        position: absolute;
        top: 4px;
        bottom: 4px;
        border-left: ${STICKY_NOTES_DROP_BAR_PX}px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        pointer-events: none;
      }

      .note[data-drop='before']::before {
        left: ${-(STICKY_NOTES_PADDING_PX + STICKY_NOTES_DROP_BAR_PX) / 2}px;
      }

      .note[data-drop='after']::after {
        right: ${-(STICKY_NOTES_PADDING_PX + STICKY_NOTES_DROP_BAR_PX) / 2}px;
      }

      /* The note in miniature that follows the pointer, beside it rather than under it so the bar
         being aimed at stays in sight, and above a finger instead. Out of hit-testing, so the note
         under the pointer is what the drag finds. Shown in the top layer as a popover, so these
         resets undo the browser's popover styles, as the launcher's do. The shadow is the launcher's
         ghost shadow. */
      .drag-ghost {
        position: fixed;
        z-index: 1000;
        inset: auto;
        margin: 0;
        padding: 4px 6px;
        border: 0;
        overflow: hidden;
        width: ${STICKY_NOTES_DRAG_GHOST_SIZE.w}px;
        height: ${STICKY_NOTES_DRAG_GHOST_SIZE.h}px;
        --note-paper: ${unsafeCSS(STICKY_NOTES_PAPER)};
        background: var(--note-paper);
        color: ${unsafeCSS(STICKY_NOTES_INK)};
        border-radius: 2px;
        font: 9px/1.25 var(--umbradesktop-app-font, inherit);
        word-break: break-word;
        pointer-events: none;
        transform: translate(${STICKY_NOTES_DRAG_GHOST_OFFSET_PX}px, ${STICKY_NOTES_DRAG_GHOST_OFFSET_PX}px);
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
      }

      .drag-ghost[data-kind='shared'] {
        --note-paper: ${unsafeCSS(STICKY_NOTES_SHARED_PAPER)};
      }

      .drag-ghost[data-pointer='touch'] {
        transform: translate(-50%, calc(-100% - ${STICKY_NOTES_DRAG_GHOST_TOUCH_LIFT_PX}px));
      }

      .spacer {
        flex: 1;
      }

      .delete {
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        background: transparent;
        color: inherit;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        opacity: 0.6;
      }

      .delete:hover,
      .delete:focus-visible {
        opacity: 1;
      }

      textarea {
        flex: 1;
        min-height: ${STICKY_NOTES_TEXT_MIN_HEIGHT_PX}px;
        margin: 0;
        padding: ${STICKY_NOTES_TEXT_TOP_PX}px 8px;
        border: none;
        resize: none;
        color: inherit;
        font: inherit;
        /* Ruled like lined paper, as Windows' notes were: one faint line under each line of text.
           The spacing is the line height, one constant for both, and the ruling scrolls with the
           text (local) and starts where the text does, so the writing stays on the lines. */
        line-height: ${STICKY_NOTES_LINE_PX}px;
        background-color: transparent;
        background-image: repeating-linear-gradient(
          to bottom,
          transparent 0 ${STICKY_NOTES_LINE_PX - 1}px,
          ${unsafeCSS(STICKY_NOTES_RULE)} ${STICKY_NOTES_LINE_PX - 1}px ${STICKY_NOTES_LINE_PX}px
        );
        background-attachment: local;
        background-position: 0 ${STICKY_NOTES_TEXT_TOP_PX}px;
      }

      /* Nothing a mouse does draws a ring or a shadow here: notes sit flat, and the note being typed
         in is shown by its caret. A heavy
         ink ring on the text, a lift and a faint edge were each tried and turned down. The text
         needs its own rule because a textarea matches :focus-visible however it was focused, so
         the keyboard ring below would otherwise frame every note anyone clicked into. */
      textarea:focus-visible {
        outline: none;
      }

      /* The keyboard's ring on the delete button. A button matches :focus-visible only when reached
         from the keyboard, so a click never shows it. */
      .delete:focus-visible {
        outline: 2px solid ${unsafeCSS(STICKY_NOTES_INK)};
        outline-offset: -2px;
      }

      .by {
        padding: 0 8px 5px;
        font-size: 0.75em;
        opacity: 0.75;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .conflict,
      .deleted {
        padding: 4px 8px 6px;
        font-size: 0.8em;
        background: rgb(0 0 0 / 8%);
      }

      .conflict p,
      .deleted p {
        margin: 0 0 4px;
      }

      .conflict button,
      .deleted button {
        font: inherit;
        margin-right: 4px;
        cursor: pointer;
      }
    `,
  ];
}

export { StickyNotesElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-sticky-notes': StickyNotesElement;
  }
}
