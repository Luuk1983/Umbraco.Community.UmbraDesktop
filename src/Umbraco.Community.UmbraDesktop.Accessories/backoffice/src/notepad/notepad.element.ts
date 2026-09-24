import { accessoryStyles } from '../shared/styles.js';
import { AREA } from '../shared/area.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { fileNameFor, isTextFile } from '../shared/media-files.js';
import { createMediaOpener } from '../shared/media-open.js';
import type { MediaOpener } from '../shared/media-open.js';
import { createMediaSaver } from '../shared/media-save.js';
import type { MediaSaver } from '../shared/media-save.js';
import { UmbraDesktopAccessoriesSaveSettingsController } from '../settings/save-settings.source.js';
import type { AccessoriesSaveSettingsSource } from '../settings/save-settings.source.js';
import { NOTEPAD_BAR_HEIGHT_PX, NOTEPAD_PADDING_PX } from './constants.js';
import { caretPosition } from './text.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DISCARD_CHANGES_MODAL, umbOpenModal } from '@umbraco-cms/backoffice/modal';

/** The extension a new document is saved with. */
const NEW_DOCUMENT_EXTENSION = 'txt';

/**
 * Notepad, as a self-contained UmbraDesktop app: a text editor over the media library.
 *
 * **Every file lives in the media library.** Open picks a file there with Umbraco's own media picker,
 * Save writes it back over the same media item, and a new document is saved into the folder Desktop
 * settings name, under the name typed in the status bar. There is no download and no local file
 * dialog: a document here is site content, where everyone who works on the site can find it, and
 * the media library already has the permissions, the folders and the recycle bin for it.
 *
 * Nothing about this needs a C# surface of its own: opening and saving go through the backoffice's
 * media picker and repositories, with the permissions the person already has
 * (`shared/media-open.ts`, `shared/media-save.ts`).
 *
 * Unsaved text is reported to the desktop with {@link UNSAVED_ATTRIBUTE}, so the window shows the
 * unsaved marker and its close button asks first. New and Open, which are this app's own, ask too.
 */
@customElement('umbradesktop-notepad')
export class NotepadElement extends UmbLitElement {
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

  /** Which folder a new document is saved into. The stored per-user Desktop setting unless a test says otherwise. */
  @property({ attribute: false })
  saveSettings?: AccessoriesSaveSettingsSource;

  /** How a file reaches the media library. The backoffice's media repositories unless a test says otherwise. */
  @property({ attribute: false })
  saveToMedia?: MediaSaver;

  /** How a file is picked from the media library and read. Umbraco's media picker unless a test says otherwise. */
  @property({ attribute: false })
  openFromMedia?: MediaOpener;

  /** The document. */
  @state()
  private _text = '';

  /** The text as it was last saved or opened, which is what "unsaved" is measured against. */
  @state()
  private _savedText = '';

  /** What the document is called, as typed in the status bar. Empty means untitled. */
  @state()
  private _name = '';

  /** The name as it was last saved or opened. A rename is unsaved until it is saved. */
  @state()
  private _savedName = '';

  /** The extension the document is saved with: its own, for a file that was opened. */
  #extension = NEW_DOCUMENT_EXTENSION;

  /** The media item this document came from or was last saved as, which the next save overwrites. */
  #mediaUnique?: string;

  /** The last thing worth telling the person: a save, or why an open or a save did not happen. */
  @state()
  private _notice = '';

  /** Whether long lines wrap at the window's edge. On by default, as it is in Windows 11. */
  @state()
  private _wrap = true;

  /** The caret's offset, as the textarea last reported it. */
  @state()
  private _caret = 0;

  /** The settings in use: the ones given, or the stored ones. */
  #settings?: AccessoriesSaveSettingsSource;

  /** Whether there is text, or a name, that has not been saved. */
  get dirty(): boolean {
    return this._text !== this._savedText || this._name !== this._savedName;
  }

  /** Listen for the keyboard shortcuts, and settle on the settings. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this.#onKeyDown);
    this.#settings ??= this.saveSettings ?? new UmbraDesktopAccessoriesSaveSettingsController(this);
  }

  /** Stop listening. The whole of teardown: there is no timer here. */
  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback();
  }

  /**
   * Mirror the unsaved state onto the host as the desktop's unsaved-work attribute, which is what
   * makes the window's close button ask before throwing the text away.
   */
  override updated(): void {
    this.toggleAttribute(UNSAVED_ATTRIBUTE, this.dirty);
  }

  /**
   * Ctrl+S, Ctrl+O and Ctrl+N, or Cmd on a Mac. Each is claimed so the browser does not save the
   * backoffice page, open a file into the tab or open a new window instead. Everything else is left
   * alone, so the page's own editing keys and the desktop's shortcuts still work.
   * @param event The keydown.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const action = { s: () => this.save(), o: () => this.open(), n: () => this.newDocument() }[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    void action();
  };

  /**
   * Ask before throwing away unsaved work, and only then. Asking over a page that is already saved
   * or empty is a dialog with one sensible answer, and those train people to click through the one
   * that matters.
   * @returns True when there is nothing to lose or the person said it may go.
   */
  async #mayDiscard(): Promise<boolean> {
    return !this.dirty || (await this.confirmDiscard());
  }

  /** Start an empty, untitled document, which a save will create as a new media item. */
  async newDocument(): Promise<void> {
    if (!(await this.#mayDiscard())) return;
    this.#load('', '', NEW_DOCUMENT_EXTENSION, undefined);
  }

  /**
   * Open a text file from the media library.
   *
   * The media picker offers every file, since the media library does not know which are text; one
   * that is not is refused here, with its name, rather than opened as a screen of noise. SVG counts
   * as text, and opens.
   */
  async open(): Promise<void> {
    if (!(await this.#mayDiscard())) return;
    const opener = this.openFromMedia ?? createMediaOpener(this);
    const result = await opener();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      this._notice = this.#term('openFailed', `${result.name ?? ''} could not be read.`, result.name ?? '');
      return;
    }
    if (!isTextFile(result.extension, result.blob.type)) {
      this._notice = this.#term('notepadNotText', `Notepad opens text files, and ${result.name} is not one.`, result.name);
      return;
    }
    this.#load(await result.blob.text(), result.name, result.extension || NEW_DOCUMENT_EXTENSION, result.unique);
  }

  /**
   * Save the document to the media library: over the item it came from, or as a new item in the
   * folder Desktop settings name.
   *
   * The text and name that were saved are what "saved" is measured against, not the text when the
   * save finished: a save takes a round trip, and typing during it must still read as unsaved.
   */
  async save(): Promise<void> {
    const untitled = this.#term('notepadUntitled', 'Untitled');
    const text = this._text;
    const name = this._name;
    const result = await (this.saveToMedia ?? createMediaSaver(this))({
      file: new File([text], fileNameFor(name, untitled, this.#extension), { type: 'text/plain;charset=utf-8' }),
      name: name.trim() || untitled,
      folder: this.#settings?.value.folder?.unique ?? null,
      existing: this.#mediaUnique,
    });
    if (!result.ok) {
      this._notice = this.#term('saveFailed', `Not saved. ${result.message ?? ''}`, result.message ?? '');
      return;
    }
    this.#mediaUnique = result.unique;
    this._savedText = text;
    this._savedName = name;
    this._notice = this.#term('savedToMedia', 'Saved to the media library.');
  }

  /**
   * Replace the document and count it saved, with the caret at the start.
   * @param text The new text.
   * @param name What it is called.
   * @param extension The extension it saves with.
   * @param unique The media item it came from, if any.
   */
  #load(text: string, name: string, extension: string, unique: string | undefined): void {
    this._text = text;
    this._savedText = text;
    this._name = name;
    this._savedName = name;
    this.#extension = extension;
    this.#mediaUnique = unique;
    this._caret = 0;
    this._notice = '';
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
   * The whole window body.
   * @returns The toolbar, the page and the status bar.
   */
  override render() {
    const position = caretPosition(this._text, this._caret);
    const untitled = this.#term('notepadUntitled', 'Untitled');
    return html`
      <div class="toolbar">
        <button class="control" data-action="new" @click=${() => this.newDocument()}>
          ${this.#term('notepadNew', 'New')}
        </button>
        <button class="control" data-action="open" title=${this.#term('openTitle', 'Open from the media library (Ctrl+O)')} @click=${() => this.open()}>
          ${this.#term('notepadOpen', 'Open…')}
        </button>
        <button class="control" data-action="save" title=${this.#term('saveTitle', 'Save to the media library (Ctrl+S)')} @click=${() => this.save()}>
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
      </div>
      <textarea
        class="page sunken"
        spellcheck="false"
        wrap=${this._wrap ? 'soft' : 'off'}
        aria-label=${this._name || untitled}
        .value=${this._text}
        @input=${this.#onPage}
        @keyup=${this.#onPage}
        @click=${this.#onPage}
        @select=${this.#onPage}
      ></textarea>
      <div class="status muted">
        <input
          class="name sunken"
          data-field="name"
          .value=${this._name}
          placeholder=${untitled}
          aria-label=${this.#term('documentName', 'Name')}
          @input=${(event: Event) => (this._name = (event.target as HTMLInputElement).value)}
        />
        ${this._notice ? html`<span class="notice" role="status">${this._notice}</span>` : nothing}
        <span class="position">
          ${this.#term('notepadLine', 'Ln')} ${position.line}, ${this.#term('notepadColumn', 'Col')}
          ${position.column}
        </span>
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

      .page:focus-visible,
      .name:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 0;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: ${NOTEPAD_BAR_HEIGHT_PX - 8}px;
        padding: 0 2px;
        font-size: 0.85em;
        white-space: nowrap;
        overflow: hidden;
      }

      /* The document's name, which is the media item's name. A field rather than a label because a
         new document has to be named somewhere, and here it is always in view. */
      .name {
        flex: 0 1 14em;
        min-width: 6em;
        height: ${NOTEPAD_BAR_HEIGHT_PX - 10}px;
        padding: 0 6px;
        border: none;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: inherit;
      }

      .notice {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .position {
        margin-left: auto;
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
