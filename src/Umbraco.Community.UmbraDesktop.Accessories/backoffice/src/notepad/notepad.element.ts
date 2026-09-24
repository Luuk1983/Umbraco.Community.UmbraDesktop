import { accessoryStyles } from '../shared/styles.js';
import { AREA } from '../shared/area.js';
import { downloadBlob } from '../shared/download.js';
import { NOTEPAD_BAR_HEIGHT_PX, NOTEPAD_PADDING_PX } from './constants.js';
import { caretPosition, textFileName } from './text.js';
import { css, customElement, html, property, query, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DISCARD_CHANGES_MODAL, umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * Notepad, as a self-contained UmbraDesktop app: a plain-text page, a toolbar with New, Open, Save
 * and Word wrap, and a status bar with the caret's line and column.
 *
 * **Files go through the browser, not the server.** Open reads a file the person picks with the
 * browser's own file dialog, and Save hands the text back as a download. Nothing is stored in
 * Umbraco and nothing leaves the machine, so there is no C# surface, no permission to decide and no
 * media library entry to clean up. It also means a Notepad window's text lives only as long as the
 * window does, the same as a note in a real Notepad that was never saved.
 *
 * That last part has one sharp edge, and it is the host's rather than this app's: the desktop's
 * close guard asks before closing a window with unsaved changes, but only an iframe window can tell
 * it that it has any. An app window has no way to report it, so closing a Notepad window over
 * unsaved text closes it. New and Open, which are this app's own, do ask.
 */
@customElement('umbradesktop-notepad')
export class NotepadElement extends UmbLitElement {
  /**
   * How a saved file reaches the person. A browser download unless a test says otherwise, since a
   * real one cannot be observed from a test and would litter the runner's download folder.
   */
  @property({ attribute: false })
  download: (blob: Blob, name: string) => void | Promise<void> = downloadBlob;

  /**
   * Ask whether unsaved text may be thrown away. Umbraco's own discard-changes dialog unless a test
   * says otherwise: the same token a workspace opens when you navigate away from unsaved work, so
   * the wording is the backoffice's and not a copy of it that drifts.
   */
  @property({ attribute: false })
  confirmDiscard: () => Promise<boolean> = async () => {
    try {
      await umbOpenModal(this, UMB_DISCARD_CHANGES_MODAL);
      return true;
    } catch {
      return false;
    }
  };

  /** The document. */
  @state()
  private _text = '';

  /** The file the document came from, if it came from one. Decides the name it saves under. */
  @state()
  private _fileName?: string;

  /** The text as it was last saved or opened, which is what "unsaved" is measured against. */
  @state()
  private _savedText = '';

  /** Whether long lines wrap at the window's edge. On by default, as it is in Windows 11. */
  @state()
  private _wrap = true;

  /** The caret's offset, as the textarea last reported it. */
  @state()
  private _caret = 0;

  /** The hidden file picker behind Open. */
  @query('input[type="file"]')
  private _picker!: HTMLInputElement;

  /** Whether there is text that has not been saved. */
  get dirty(): boolean {
    return this._text !== this._savedText;
  }

  /** Listen for the keyboard shortcuts. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this.#onKeyDown);
  }

  /** Stop listening. The whole of teardown: there is no timer here. */
  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback();
  }

  /**
   * Mirror the unsaved state onto the host as `data-dirty`, where a stylesheet or a test can see it
   * without reaching into the shadow root.
   */
  override updated(): void {
    this.toggleAttribute('data-dirty', this.dirty);
  }

  /**
   * Ctrl+S, Ctrl+O and Ctrl+N, or Cmd on a Mac. Each is claimed so the browser does not save the
   * backoffice page, open a file into the tab or open a new window instead. Everything else is left
   * alone, so the page's own editing keys and the desktop's shortcuts still work.
   * @param event The keydown.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const action = { s: () => this.save(), o: () => this._picker?.click(), n: () => this.newDocument() }[
      event.key.toLowerCase()
    ];
    if (!action) return;
    event.preventDefault();
    void action();
  };

  /**
   * Ask before throwing away unsaved text, and only then. Asking over a page that is already saved
   * or empty is a dialog with one sensible answer, and those train people to click through the one
   * that matters.
   * @returns True when there is nothing to lose or the person said it may go.
   */
  async #mayDiscard(): Promise<boolean> {
    return !this.dirty || (await this.confirmDiscard());
  }

  /** Start an empty, untitled document. */
  async newDocument(): Promise<void> {
    if (!(await this.#mayDiscard())) return;
    this.#load('', undefined);
  }

  /**
   * Open a file into the page.
   * @param file The file the person picked.
   */
  async openFile(file: File): Promise<void> {
    if (!(await this.#mayDiscard())) return;
    this.#load(await file.text(), file.name);
  }

  /** Hand the page to the person as a text file, and count it saved. */
  async save(): Promise<void> {
    const name = textFileName(this._fileName, this.#term('notepadUntitled', 'Untitled'));
    await this.download(new Blob([this._text], { type: 'text/plain;charset=utf-8' }), name);
    this._fileName = name;
    this._savedText = this._text;
  }

  /**
   * Replace the document and count it saved, with the caret at the start.
   * @param text The new text.
   * @param fileName Where it came from.
   */
  #load(text: string, fileName: string | undefined): void {
    this._text = text;
    this._savedText = text;
    this._fileName = fileName;
    this._caret = 0;
  }

  /**
   * Keep the document and the caret in step with the page.
   * @param event Any event on the page that can move the caret or change the text.
   */
  #onPage(event: Event): void {
    const page = event.target as HTMLTextAreaElement;
    this._text = page.value;
    this._caret = page.selectionStart ?? 0;
  }

  /**
   * A file the picker produced. The picker is reset so picking the same file twice still fires.
   * @param event The picker's change event.
   */
  async #onPicked(event: Event): Promise<void> {
    const picker = event.target as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = '';
    if (file) await this.openFile(file);
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @returns The localised string.
   */
  #term(key: string, fallback: string): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback);
  }

  /**
   * The whole window body.
   * @returns The toolbar, the page and the status bar.
   */
  override render() {
    const position = caretPosition(this._text, this._caret);
    const name = textFileName(this._fileName, this.#term('notepadUntitled', 'Untitled'));
    return html`
      <div class="toolbar">
        <button class="control" data-action="new" @click=${() => this.newDocument()}>
          ${this.#term('notepadNew', 'New')}
        </button>
        <button class="control" data-action="open" @click=${() => this._picker.click()}>
          ${this.#term('notepadOpen', 'Open…')}
        </button>
        <button class="control" data-action="save" @click=${() => this.save()}>
          ${this.#term('notepadSave', 'Save')}
        </button>
        <button
          class="control"
          data-action="wrap"
          aria-pressed=${this._wrap ? 'true' : 'false'}
          @click=${() => (this._wrap = !this._wrap)}
        >
          ${this.#term('notepadWordWrap', 'Word wrap')}
        </button>
        <input type="file" accept="text/*,.txt,.md,.csv,.json,.xml,.html,.css,.js" hidden @change=${this.#onPicked} />
      </div>
      <textarea
        class="page sunken"
        spellcheck="false"
        wrap=${this._wrap ? 'soft' : 'off'}
        aria-label=${name}
        .value=${this._text}
        @input=${this.#onPage}
        @keyup=${this.#onPage}
        @click=${this.#onPage}
        @select=${this.#onPage}
      ></textarea>
      <div class="status muted">
        <span class="name">${this.dirty ? '• ' : ''}${name}</span>
        <span class="position">
          ${this.#term('notepadLine', 'Ln')} ${position.line}, ${this.#term('notepadColumn', 'Col')}
          ${position.column}
        </span>
        <span class="length">${this.localize.number(this._text.length)} ${this.#term('notepadCharacters', 'characters')}</span>
      </div>
    `;
  }

  /**
   * The shared accessory look, plus a page that takes whatever the two bars leave it.
   *
   * The page's font is the monospace stack rather than the theme's UI font, because a text editor
   * whose columns do not line up is not a text editor. Every other surface is the theme's.
   */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        padding: ${NOTEPAD_PADDING_PX}px;
        gap: ${NOTEPAD_PADDING_PX}px;
        height: 100%;
      }

      .toolbar {
        min-height: ${NOTEPAD_BAR_HEIGHT_PX}px;
      }

      .toolbar .control {
        height: ${NOTEPAD_BAR_HEIGHT_PX - 4}px;
      }

      .page {
        flex: 1;
        min-height: 0;
        width: 100%;
        margin: 0;
        padding: 6px 8px;
        resize: none;
        border: none;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: 14px/1.45 ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace;
        tab-size: 4;
      }

      .page:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 0;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 16px;
        min-height: ${NOTEPAD_BAR_HEIGHT_PX - 8}px;
        padding: 0 4px;
        font-size: 0.85em;
        white-space: nowrap;
        overflow: hidden;
      }

      .name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ];
}

export { NotepadElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-notepad': NotepadElement;
  }
}
