import { accessoryStyles } from '../shared/styles.js';
import { AREA } from '../shared/area.js';
import { downloadBlob } from '../shared/download.js';
import { announceSave } from '../shared/announce-save.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { createMediaSaver } from '../shared/media-save.js';
import type { MediaSaver } from '../shared/media-save.js';
import { otherDestination, saveFile } from '../shared/save-file.js';
import { UmbraDesktopAccessoriesSaveSettingsController } from '../settings/save-settings.source.js';
import type { AccessoriesSaveSettingsSource } from '../settings/save-settings.source.js';
import type { AccessoriesSaveDestination } from '../settings/save-settings.js';
import { NOTEPAD_BAR_HEIGHT_PX, NOTEPAD_PADDING_PX } from './constants.js';
import { caretPosition, textFileName } from './text.js';
import { css, customElement, html, property, query, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DISCARD_CHANGES_MODAL, umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * Notepad, as a self-contained UmbraDesktop app: a plain-text page, a toolbar with New, Open, Save
 * and Word wrap, and a status bar with the caret's line and column.
 *
 * **Save goes where Desktop settings say**: a download to this computer by default, or a media item
 * in the media library, and the toolbar always has a second button for the other one. Open reads a
 * file the person picks with the browser's own file dialog. Nothing about this needs a C# surface:
 * a download never reaches the server, and a media save goes through the backoffice's own media
 * repositories, with the permissions the person already has (see `shared/media-save.ts`). Until it
 * is saved, a Notepad window's text lives only as long as the window does, the same as a note in a
 * real Notepad.
 *
 * Unsaved text is reported to the desktop with {@link UNSAVED_ATTRIBUTE}, so the window shows the
 * unsaved marker and its close button asks first. New and Open, which are this app's own, ask too.
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

  /**
   * Where Save goes. The stored per-user Desktop setting unless a test says otherwise, read when the
   * element connects.
   */
  @property({ attribute: false })
  saveSettings?: AccessoriesSaveSettingsSource;

  /** How a file reaches the media library. The backoffice's media repositories unless a test says otherwise. */
  @property({ attribute: false })
  saveToMedia?: MediaSaver;

  /** The document. */
  @state()
  private _text = '';

  /**
   * The media item this document was last saved as, so the next save to the media library
   * overwrites it rather than adding a copy. Forgotten by New and Open, which start a new document.
   */
  #mediaUnique?: string;

  /** The settings in use: the ones given, or the stored ones. */
  #settings?: AccessoriesSaveSettingsSource;

  /** Stops listening to the settings. */
  #unsubscribe?: () => void;

  /** Bumped when the settings change, so the toolbar's labels follow them. */
  @state()
  private _settingsRevision = 0;

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
    this.#settings ??= this.saveSettings ?? new UmbraDesktopAccessoriesSaveSettingsController(this);
    this.#unsubscribe = this.#settings.subscribe(() => this._settingsRevision++);
  }

  /** Stop listening. The whole of teardown: there is no timer here. */
  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    this.#unsubscribe?.();
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

  /** Where Save and Ctrl+S go, as Desktop settings say. */
  get #destination(): AccessoriesSaveDestination {
    return this.#settings?.value.destination ?? 'computer';
  }

  /** Save the page where Desktop settings say. What Save and Ctrl+S do. */
  save(): Promise<void> {
    return this.saveTo(this.#destination);
  }

  /**
   * Save the page as a text file to one destination, and count it saved if that worked.
   *
   * The text that was saved is what "saved" is measured against, not the text when the save
   * finished: a media save takes a round trip, and typing during it must still read as unsaved.
   * @param destination This computer, or the media library.
   */
  async saveTo(destination: AccessoriesSaveDestination): Promise<void> {
    const name = textFileName(this._fileName, this.#term('notepadUntitled', 'Untitled'));
    const text = this._text;
    const file = new File([text], name, { type: 'text/plain;charset=utf-8' });
    const outcome = await saveFile(file, destination, {
      download: this.download,
      saveToMedia: this.saveToMedia ?? createMediaSaver(this),
      settings: this.#settings!.value,
      existing: this.#mediaUnique,
    });
    void announceSave(this, outcome, name);
    if (!outcome.ok) return;
    if (outcome.mediaUnique) this.#mediaUnique = outcome.mediaUnique;
    this._fileName = name;
    this._savedText = text;
  }

  /**
   * A save button's label.
   * @param destination Where the button saves to.
   * @param primary Whether it is the main Save button, which is just "Save".
   * @returns The label.
   */
  #saveLabel(destination: AccessoriesSaveDestination, primary: boolean): string {
    if (primary) return this.#term('notepadSave', 'Save');
    return destination === 'media'
      ? this.#term('saveToMedia', 'Save to media library')
      : this.#term('download', 'Download');
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
    this.#mediaUnique = undefined;
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
   * What the Save button's tooltip says, so the destination Desktop settings chose is visible
   * without opening them.
   * @param destination Where Save goes.
   * @returns The tooltip.
   */
  #saveTitle(destination: AccessoriesSaveDestination): string {
    return destination === 'media'
      ? this.#term('saveTitleMedia', 'Save to the media library (Ctrl+S)')
      : this.#term('saveTitleComputer', 'Save to this computer (Ctrl+S)');
  }

  /**
   * The whole window body.
   * @returns The toolbar, the page and the status bar.
   */
  override render() {
    void this._settingsRevision;
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
        <button
          class="control"
          data-action="save"
          title=${this.#saveTitle(this.#destination)}
          @click=${() => this.save()}
        >
          ${this.#saveLabel(this.#destination, true)}
        </button>
        <button
          class="control"
          data-action="save-other"
          @click=${() => this.saveTo(otherDestination(this.#destination))}
        >
          ${this.#saveLabel(otherDestination(this.#destination), false)}
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
