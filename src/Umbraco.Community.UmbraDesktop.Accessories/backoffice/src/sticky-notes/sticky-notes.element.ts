import { accessoryStyles } from '../shared/styles.js';
import { AREA } from '../shared/area.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { createStickyNotesApi } from './api.js';
import type { StickyNotesApi } from './api.js';
import { editNote, fromServer, mergeBoard, saved } from './board.js';
import type { LocalNote } from './board.js';
import {
  STICKY_NOTES_FOCUS_REFRESH_GAP_MS,
  STICKY_NOTES_INK,
  STICKY_NOTES_NOTE_HEIGHT_PX,
  STICKY_NOTES_NOTE_MIN_WIDTH_PX,
  STICKY_NOTES_PADDING_PX,
  STICKY_NOTES_PAPER,
  STICKY_NOTES_POLL_INTERVAL_MS,
  STICKY_NOTES_SAVE_DELAY_MS,
  STICKY_NOTES_TEXT_MIN_HEIGHT_PX,
  STICKY_NOTES_TOOLBAR_HEIGHT_PX,
} from './constants.js';
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';

/** The limits the server sends with the board, until it has sent them. */
const DEFAULT_LIMITS = { maxTextLength: 2000, maxNotes: 100, colours: Object.keys(STICKY_NOTES_PAPER) };

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

  /** Add a note to the board, in the default colour, and put the cursor in it. */
  async #add(): Promise<void> {
    const note = await this.api.create('', this._limits.colours[0] ?? 'yellow');
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
    const paper = STICKY_NOTES_PAPER[note.colour] ?? Object.values(STICKY_NOTES_PAPER)[0];
    return html`
      <article class="note" data-key=${note.key} style="--note-paper: ${paper}">
        <header>
          ${this._limits.colours.map(
            (colour) => html`<button
              class="swatch"
              data-colour=${colour}
              style="background: ${STICKY_NOTES_PAPER[colour] ?? paper}"
              aria-label=${this.#term(`stickyNotesColour_${colour}`, colour)}
              aria-pressed=${note.colour === colour ? 'true' : 'false'}
              @click=${() => this.#edit(note.key, { colour })}
            ></button>`,
          )}
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
        background: var(--note-paper);
        color: ${unsafeCSS(STICKY_NOTES_INK)};
        box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
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

      .swatch {
        width: 14px;
        height: 14px;
        padding: 0;
        border: 1px solid rgb(0 0 0 / 30%);
        border-radius: 50%;
        cursor: pointer;
      }

      .swatch[aria-pressed='true'] {
        outline: 2px solid ${unsafeCSS(STICKY_NOTES_INK)};
        outline-offset: 1px;
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
        padding: 4px 8px;
        border: none;
        resize: none;
        background: transparent;
        color: inherit;
        font: inherit;
        line-height: 1.35;
      }

      textarea:focus-visible,
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
