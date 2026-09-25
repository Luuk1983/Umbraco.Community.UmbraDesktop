import { accessoryStyles } from '../shared/styles.js';
import { AREA } from '../shared/area.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { createStickyNotesApi } from './api.js';
import type { StickyNotesApi } from './api.js';
import { editNote, fromServer, mergeBoard, moveNote, saved } from './board.js';
import type { LocalNote } from './board.js';
import {
  STICKY_NOTES_COLOUR,
  STICKY_NOTES_FOCUS_REFRESH_GAP_MS,
  STICKY_NOTES_INK,
  STICKY_NOTES_LINE_PX,
  STICKY_NOTES_NOTE_HEIGHT_PX,
  STICKY_NOTES_NOTE_MIN_WIDTH_PX,
  STICKY_NOTES_PADDING_PX,
  STICKY_NOTES_PAPER,
  STICKY_NOTES_POLL_INTERVAL_MS,
  STICKY_NOTES_SAVE_DELAY_MS,
  STICKY_NOTES_TEXT_MIN_HEIGHT_PX,
  STICKY_NOTES_TEXT_TOP_PX,
  STICKY_NOTES_TOOLBAR_HEIGHT_PX,
} from './constants.js';
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';

/** The faint ruled lines on a note: the note's ink, mostly transparent. */
const STICKY_NOTES_RULE = `color-mix(in srgb, ${STICKY_NOTES_INK} 14%, transparent)`;

/** The limits the server sends with the board, until it has sent them. */
const DEFAULT_LIMITS = { maxTextLength: 2000, maxNotes: 100, colours: [STICKY_NOTES_COLOUR] };

/**
 * Sticky Notes, as a self-contained UmbraDesktop app: one board of notes shared by everyone who uses
 * the desktop.
 *
 * The board lives on the server (`StickyNotes/` in this package, the first C# in it) and this window
 * keeps a copy. A note is saved shortly after its author stops typing; the window asks the server for
 * everyone else's changes every fifteen seconds and whenever it is focused. The rules for folding the
 * two together are in `board.ts`, and the one that matters is that a refresh never overwrites text
 * somebody is still writing.
 *
 * Two people editing one note is expected rather than rare, and it is never settled silently. The
 * server refuses the second save, and the window keeps its own text on screen with the other version
 * beside it: "use theirs" or "keep mine", decided by a person. A note deleted elsewhere while it had
 * unsaved text here is offered back the same way. Until either is settled, and while any text is
 * waiting to be saved, the window carries the desktop's unsaved-work attribute, so closing it asks.
 */
@customElement('umbradesktop-sticky-notes')
export class StickyNotesElement extends UmbLitElement {
  /** The server. The real API unless a test says otherwise. */
  @property({ attribute: false })
  api: StickyNotesApi = createStickyNotesApi();

  /** How long after the last keystroke a note is saved, in ms. Read each time a save is scheduled. */
  @property({ attribute: false })
  saveDelay = STICKY_NOTES_SAVE_DELAY_MS;

  /** How often the board refreshes, in ms. Zero turns the timer off, which only a test wants. */
  @property({ attribute: false })
  pollInterval = STICKY_NOTES_POLL_INTERVAL_MS;

  /**
   * How recent a refresh must be for coming back to the window to skip another, in ms. Only a test
   * changes it.
   */
  @property({ attribute: false })
  focusRefreshGap = STICKY_NOTES_FOCUS_REFRESH_GAP_MS;

  /** Ask before deleting a note everyone can see. Umbraco's confirm dialog unless a test says otherwise. */
  @property({ attribute: false })
  confirmDelete: () => Promise<boolean> = async () => {
    try {
      await umbConfirmModal(this, {
        headline: this.#term('stickyNotesDeleteHeadline', 'Delete this note?'),
        content: this.#term('stickyNotesDeleteQuestion', 'It is deleted for everyone who uses this desktop.'),
        confirmLabel: this.#term('stickyNotesDelete', 'Delete note'),
        color: 'danger',
      });
      return true;
    } catch {
      return false;
    }
  };

  /** The window's copy of the board. */
  @state()
  private _notes: LocalNote[] = [];

  /** What the server allows, from the last board it sent. */
  @state()
  private _limits = DEFAULT_LIMITS;

  /** Whether the board has loaded at least once. */
  @state()
  private _loaded = false;

  /** Whether the last request to the server failed. The notes stay; this says they may be stale. */
  @state()
  private _offline = false;

  /** Pending saves, by note. */
  #saveTimers = new Map<string, number>();

  /** Notes with a save on its way to the server, so a second is not sent over the first. */
  #saving = new Set<string>();

  /** The refresh timer. */
  #poll?: number;

  /** When the board last refreshed, for skipping a focus refresh straight after one. */
  #lastRefresh = 0;

  /** The note being dragged, while one is. */
  @state()
  private _dragging?: string;

  /** Where a dragged note would land if it were dropped now: on which note, and which side of it. */
  @state()
  private _dropAt?: { key: string; side: 'before' | 'after' };

  /** Load the board and start refreshing. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('focusin', this.#onFocus);
    this.addEventListener('pointerdown', this.#onFocus);
    void this.refresh();
    if (this.pollInterval > 0) this.#poll = window.setInterval(() => void this.refresh(), this.pollInterval);
  }

  /**
   * Stop refreshing and drop pending save timers. The whole of teardown: a timer left running would
   * keep asking the server for a board nobody is looking at. Pending saves are not flushed here,
   * because closing over unsaved text already asked the person (see {@link UNSAVED_ATTRIBUTE}).
   */
  override disconnectedCallback(): void {
    this.removeEventListener('focusin', this.#onFocus);
    this.removeEventListener('pointerdown', this.#onFocus);
    window.clearInterval(this.#poll);
    this.#poll = undefined;
    for (const timer of this.#saveTimers.values()) window.clearTimeout(timer);
    this.#saveTimers.clear();
    super.disconnectedCallback();
  }

  /** Mirror unsaved and unsettled notes onto the desktop's unsaved-work attribute. */
  override updated(): void {
    this.toggleAttribute(
      UNSAVED_ATTRIBUTE,
      this._notes.some((note) => note.pending || note.conflict || note.deletedElsewhere),
    );
  }

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

  /** Ask the server for the board and fold it into the window's copy, then retry any unsaved note. */
  async refresh(): Promise<void> {
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

  /** Save every note with unsaved text now, without waiting for the typing pause. */
  async saveNow(): Promise<void> {
    await Promise.all(this._notes.filter((note) => note.pending).map((note) => this.#save(note.key)));
  }

  /** Add a note to the board, in yellow, and put the cursor in it. */
  async #add(): Promise<void> {
    const note = await this.api.create('', STICKY_NOTES_COLOUR);
    if (!note) {
      this._offline = true;
      return;
    }
    this._notes = [...this._notes, ...fromServer([note])];
    await this.updateComplete;
    this.shadowRoot?.querySelector<HTMLTextAreaElement>(`.note[data-key="${note.key}"] textarea`)?.focus();
  }

  /**
   * An edit in this window: keep it, and save it after the typing pause.
   * @param key The note.
   * @param change Its new text or colour.
   */
  #edit(key: string, change: { text?: string; colour?: string }): void {
    this._notes = editNote(this._notes, key, change);
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
   * Send one note's unsaved text to the server.
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
      const result = await this.api.update(key, note.text, note.colour, note.version);
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
   * Put a note deleted elsewhere back on the board, as a new note with this window's text.
   * @param key The note as this window knew it.
   */
  async #restore(key: string): Promise<void> {
    const note = this._notes.find((candidate) => candidate.key === key);
    if (!note) return;
    const recreated = await this.api.create(note.text, note.colour);
    if (!recreated) {
      this._offline = true;
      return;
    }
    this._notes = this._notes.map((each) => (each.key === key ? { ...recreated, pending: false } : each));
  }

  /**
   * Let a note deleted elsewhere go.
   * @param key The note.
   */
  #discard(key: string): void {
    this._notes = this._notes.filter((note) => note.key !== key);
  }

  /**
   * Delete a note for everyone, after asking.
   * @param key The note.
   */
  async #delete(key: string): Promise<void> {
    if (!(await this.confirmDelete())) return;
    window.clearTimeout(this.#saveTimers.get(key));
    this.#saveTimers.delete(key);
    if (!(await this.api.remove(key))) {
      this._offline = true;
      return;
    }
    this._notes = this._notes.filter((note) => note.key !== key);
  }

  /**
   * Move a note to sit before another, or to the end, for everyone.
   *
   * The window shows the new order straight away and tells the server, naming the note it now goes
   * before rather than a position, so a note someone else adds or deletes meanwhile cannot make it
   * land somewhere else. If the server refuses, the board is read again and shows the order as it
   * really is.
   * @param key The note to move.
   * @param before The note it should go before, or undefined for the end.
   */
  async #move(key: string, before: string | undefined): Promise<void> {
    if (key === before) return;
    this._notes = moveNote(this._notes, key, before);
    if (!(await this.api.move(key, before))) await this.refresh();
  }

  /**
   * A drag has started on a note's handle.
   * @param event The dragstart.
   * @param key The note being dragged.
   */
  #onDragStart(event: DragEvent, key: string): void {
    this._dragging = key;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // Some browsers start no drag without data, and the key is as good as anything.
      event.dataTransfer.setData('text/plain', key);
      // The whole note as the drag image, not only the handle the pointer is on.
      const card = (event.currentTarget as HTMLElement).closest<HTMLElement>('.note');
      if (card) event.dataTransfer.setDragImage(card, 12, 12);
    }
  }

  /**
   * Which side of a note the pointer is over: its leading half puts the dragged note before it, its
   * trailing half after it. Halved across rather than down, because the board fills rows left to
   * right and "before" is to the left.
   * @param event The drag event over the note.
   * @returns The side.
   */
  #sideOf(event: DragEvent): 'before' | 'after' {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return event.clientX < box.left + box.width / 2 ? 'before' : 'after';
  }

  /**
   * A dragged note is over another: allow the drop and show where it would land.
   * @param event The dragover.
   * @param key The note under the pointer.
   */
  #onDragOver(event: DragEvent, key: string): void {
    if (!this._dragging || this._dragging === key) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const side = this.#sideOf(event);
    if (this._dropAt?.key !== key || this._dropAt.side !== side) this._dropAt = { key, side };
  }

  /**
   * A dragged note was dropped on another: move it to that side of it.
   * @param event The drop.
   * @param key The note it was dropped on.
   */
  #onDrop(event: DragEvent, key: string): void {
    const dragged = this._dragging;
    if (!dragged || dragged === key) return;
    event.preventDefault();
    const side = this.#sideOf(event);
    this._dragging = undefined;
    this._dropAt = undefined;
    if (side === 'before') {
      void this.#move(dragged, key);
      return;
    }
    const rest = this._notes.filter((note) => note.key !== dragged);
    void this.#move(dragged, rest[rest.findIndex((note) => note.key === key) + 1]?.key);
  }

  /** The drag is over, dropped or not: clear what it was showing. */
  #onDragEnd(): void {
    this._dragging = undefined;
    this._dropAt = undefined;
  }

  /**
   * The handle's keys: the arrows move its note one place earlier or later, so the board can be
   * reordered without dragging. Focus stays on the handle as the note moves.
   * @param event The keydown.
   * @param key The note.
   */
  async #onHandleKey(event: KeyboardEvent, key: string): Promise<void> {
    const earlier = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const later = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!earlier && !later) return;
    event.preventDefault();
    const index = this._notes.findIndex((note) => note.key === key);
    if (earlier && index > 0) await this.#move(key, this._notes[index - 1].key);
    else if (later && index < this._notes.length - 1) await this.#move(key, this._notes[index + 2]?.key);
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
   * The line under a note: who last wrote it and when, or that it is waiting to be saved.
   * @param note The note.
   * @returns The line.
   */
  #byline(note: LocalNote): string {
    if (note.pending) return this.#term('stickyNotesUnsaved', 'Not saved yet');
    const when = this.localize.date(note.updatedAt, { dateStyle: 'short', timeStyle: 'short' });
    return `${note.updatedBy} · ${when}`;
  }

  /**
   * One note.
   * @param note The note.
   * @returns Its card.
   */
  #renderNote(note: LocalNote) {
    const move = this.#term('stickyNotesMove', 'Move note: drag it, or use the arrow keys');
    return html`
      <article
        class="note"
        data-key=${note.key}
        data-dragging=${this._dragging === note.key ? 'true' : nothing}
        data-drop=${this._dropAt?.key === note.key ? this._dropAt.side : nothing}
        @dragover=${(event: DragEvent) => this.#onDragOver(event, note.key)}
        @drop=${(event: DragEvent) => this.#onDrop(event, note.key)}
      >
        <header>
          <button
            class="handle"
            draggable="true"
            title=${move}
            aria-label=${move}
            @dragstart=${(event: DragEvent) => this.#onDragStart(event, note.key)}
            @dragend=${() => this.#onDragEnd()}
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
            @click=${() => this.#delete(note.key)}
          >
            ×
          </button>
        </header>
        <textarea
          .value=${note.text}
          maxlength=${this._limits.maxTextLength}
          aria-label=${this.#term('stickyNotesNote', 'Note by %0%', note.updatedBy)}
          @input=${(event: Event) => this.#edit(note.key, { text: (event.target as HTMLTextAreaElement).value })}
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
          : html`<footer class="by">${this.#byline(note)}</footer>`}
      </article>
    `;
  }

  /**
   * The whole window body.
   * @returns The toolbar and the board.
   */
  override render() {
    const full = this._notes.length >= this._limits.maxNotes;
    return html`
      <div class="toolbar">
        <button class="control" data-action="add" ?disabled=${full || !this._loaded} @click=${() => this.#add()}>
          ${this.#term('stickyNotesNew', 'New note')}
        </button>
        <span class="muted status" role="status">
          ${this._offline
            ? this.#term('stickyNotesOffline', 'Cannot reach the board. Your notes are kept and will be saved when it is back.')
            : this.#term('stickyNotesShared', 'Shared with everyone who uses this desktop')}
        </span>
      </div>
      <div class="board">
        ${this._loaded && this._notes.length === 0
          ? html`<p class="empty muted">
              ${this.#term('stickyNotesEmpty', 'No notes yet. Add one and everyone who uses this desktop will see it.')}
            </p>`
          : this._notes.map((note) => this.#renderNote(note))}
      </div>
    `;
  }

  /**
   * The shared accessory look for the chrome, and paper for the notes.
   *
   * The notes are the app's domain, like Paint's canvas: a yellow sticky note is yellow under every
   * theme, with dark ink on it, and only the board behind it and the toolbar are the theme's.
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

      .toolbar .control {
        height: ${STICKY_NOTES_TOOLBAR_HEIGHT_PX - 4}px;
        flex: none;
      }

      .control[disabled] {
        opacity: 0.45;
        cursor: default;
      }

      .status {
        font-size: 0.85em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .board {
        flex: 1;
        min-height: 0;
        overflow: auto;
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
        grid-column: 1 / -1;
        margin: 0;
      }

      .note {
        display: flex;
        flex-direction: column;
        min-height: ${STICKY_NOTES_NOTE_HEIGHT_PX}px;
        --note-paper: ${unsafeCSS(STICKY_NOTES_PAPER)};
        background: var(--note-paper);
        color: ${unsafeCSS(STICKY_NOTES_INK)};
        border-radius: 2px;
        font-family: var(--umbradesktop-app-font, inherit);
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

      /* The grip a note is dragged by. Only this starts a drag, not the whole note, so selecting
         text in a note still selects text. */
      .handle {
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        background: transparent;
        color: inherit;
        font-size: 14px;
        line-height: 1;
        cursor: grab;
        opacity: 0.45;
      }

      .handle:hover,
      .handle:focus-visible {
        opacity: 1;
      }

      .handle:active {
        cursor: grabbing;
      }

      /* While dragging: the note being moved fades, and the note it would land beside shows a bar
         on the side it would land. The bar is an inset shadow, so it costs no layout. */
      .note[data-dragging] {
        opacity: 0.4;
      }

      .note[data-drop='before'] {
        box-shadow: inset 3px 0 0 var(--umbradesktop-app-accent, var(--uui-color-selected));
      }

      .note[data-drop='after'] {
        box-shadow: inset -3px 0 0 var(--umbradesktop-app-accent, var(--uui-color-selected));
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

      /* The keyboard's ring. A button matches :focus-visible only when reached from the keyboard, so
         a click never shows it. */
      .swatch:focus-visible,
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
