import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMBRADESKTOP_MEDIA_CONTEXT } from '../context/media.context-token.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { FILE_PAGE_EVENTS, FILE_PAGE_TAG, PAGE_GAP, PAGE_LIST_WIDTH, PAGE_PADDING, PAGE_ROW_HEIGHT } from './constants.js';
import { createDiscardQuestion, createFolderName, createItemCheck, createThumbnails } from './deps.js';
import type { FilePageDeps } from './deps.js';
import { filePageStyles } from './styles.js';
import { OpenPage, openPageStyles } from './open-page.js';
import { SaveAsPage, saveAsPageStyles } from './save-as-page.js';
import { renderInfoPage, infoPageStyles } from './info-page.js';
import { keepFormatFor } from './formats.js';
import { runSave, saveAsDefaults } from './save-flow.js';
import type { SaveChoice } from './save-flow.js';
import type { FileEncoder, FilePageDocument, FilePageName, FileSaveOutcome, SaveFormat } from './types.js';

/** One row of the page list. */
interface PageRow {
  /** What the row is: a page, Back, or Close. */
  name: FilePageName | 'back' | 'close';
  /** Its label's dictionary key. */
  label: WordKey;
  /** Its icon. */
  icon: string;
  /** Whether it needs an open file, and is disabled without one. */
  needsFile: boolean;
}

/** The page list, top to bottom: Back first, as in mock scene 1, then the pages, then Close. */
const ROWS: readonly PageRow[] = [
  { name: 'back', label: 'backToPicture', icon: 'icon-arrow-left', needsFile: true },
  { name: 'open', label: 'pageOpen', icon: 'icon-folder-open', needsFile: false },
  { name: 'save', label: 'pageSave', icon: 'icon-save', needsFile: true },
  { name: 'saveAs', label: 'pageSaveAs', icon: 'icon-documents', needsFile: true },
  { name: 'info', label: 'pageInfo', icon: 'icon-info', needsFile: true },
  { name: 'close', label: 'pageClose', icon: 'icon-wrong', needsFile: false },
];

/**
 * The File page: Open, Save, Save as, Info and Close for an app that opens and saves media files,
 * drawn over the app's window under its own bar. Issue #136, design §5 and D2, D6.
 *
 * **An element of the media service, used by tag name.** The service's bundle defines it, so an app
 * in another package renders `<umbradesktop-media-file-page>`, sets its properties and listens for
 * its events, with the types copied from the developer page, and imports nothing. It is about media
 * files (the recent list, the media picker, saving media items), which is why it lives here and not
 * in the core desktop: an app that never touches media has no use for it.
 *
 * **It owns the commands; the app owns the document.** The app says what is open, whether it is
 * dirty, which file types it opens and how to encode itself; the page runs the media context's open
 * and save and tells the app what happened. It never changes the document itself.
 *
 * **Disabled, never hidden.** With nothing open, the pages that need a file are drawn and disabled,
 * so the person sees what the page will offer once a file is open.
 */
@customElement(FILE_PAGE_TAG)
export class UmbraDesktopMediaFilePageElement extends UmbLitElement {
  /** What the app has open, or null for nothing. */
  @property({ attribute: false })
  document: FilePageDocument | null = null;

  /** Whether the app holds unsaved work, which opening another file would throw away. */
  @property({ type: Boolean })
  dirty = false;

  /** The file extensions the app opens, without dots, which the recent list is filtered by. */
  @property({ attribute: false })
  accept: string[] = [];

  /** How the app encodes its document, for every save and for Save as's After size. */
  @property({ attribute: false })
  encode?: FileEncoder;

  /** An image URL of the picture as it will be saved, for Save as. */
  @property({ attribute: false })
  preview?: string;

  /** Whether the next save resets the item's focal point and named crops (design D8). */
  @property({ attribute: false })
  resetFocalPoint = false;

  /** Whether the page is showing. Reflected, so the app can lay itself out on it. */
  @property({ type: Boolean, reflect: true })
  open = false;

  /**
   * What the page reaches outside itself with. A test sets it; without one the page builds the real
   * operations on first use: the media context found by its token, Umbraco's imaging repository and
   * its confirm dialog.
   */
  @property({ attribute: false })
  deps?: FilePageDeps;

  /** The page showing. Open until an app or the person chooses another. */
  @state()
  protected _page: FilePageName = 'open';

  /** The format Save as was asked to start on, for an item whose format cannot be kept. */
  @state()
  protected _startFormat?: SaveFormat;

  /** What the last save said, shown on Save and Save as; undefined before any. */
  @state()
  protected _status?: { kind: 'saving' | 'saved' | 'failed' | 'cancelled'; message?: string };

  /** This package's words, with the English dictionary as their fallback. */
  protected readonly _words = wordsOf(this.localize);

  /** The Open page, which keeps its list between visits and reloads it on each. */
  readonly #openPage = new OpenPage(this.#pageHost());

  /** Save as, which keeps its choices while it shows and starts over on each visit. */
  readonly #saveAsPage = new SaveAsPage(this.#pageHost());

  /**
   * What a page reads from this element, as live getters, so a page always sees the current
   * properties rather than the ones it was built with.
   * @returns The page host.
   */
  #pageHost() {
    const element = this;
    return {
      get deps() {
        return element._deps;
      },
      get accept() {
        return element.accept;
      },
      get dirty() {
        return element.dirty;
      },
      get document() {
        return element.document;
      },
      get encode() {
        return element.encode;
      },
      get preview() {
        return element.preview;
      },
      get saving() {
        return element._status?.kind === 'saving';
      },
      get lang() {
        return element.localize.lang();
      },
      words: (key: WordKey, ...args: unknown[]) => element._words(key, ...args),
      fire: (name: string, detail?: unknown) => element._fire(name, detail),
      requestUpdate: () => element.requestUpdate(),
      save: (choice: SaveChoice) => void element.#saveAndReport(choice),
      status: () => element.#renderStatus(),
    };
  }

  /** The real deps, built once when no test gave any. */
  #realDeps?: FilePageDeps;

  /**
   * The deps in use: a test's, or the real ones. The context is reached lazily on each call, since
   * the page can be rendered before the desktop has provided it.
   * @returns The deps.
   */
  protected get _deps(): FilePageDeps {
    if (this.deps) return this.deps;
    if (!this.#realDeps) {
      const reach = () => this.getContext(UMBRADESKTOP_MEDIA_CONTEXT);
      const call =
        <K extends keyof FilePageDeps['context']>(name: K) =>
        async (...args: Parameters<FilePageDeps['context'][K]>) => {
          const context = await reach();
          if (!context) throw new Error('The media service is not available.');
          return (context[name] as (...a: typeof args) => unknown)(...args);
        };
      this.#realDeps = {
        context: {
          open: call('open') as FilePageDeps['context']['open'],
          recent: (async (accept) => ((await reach())?.recent(accept) ?? [])) as FilePageDeps['context']['recent'],
          forgetRecent: (unique) => void reach().then((context) => context?.forgetRecent(unique)),
          save: call('save') as FilePageDeps['context']['save'],
          pickSaveFolder: call('pickSaveFolder') as FilePageDeps['context']['pickSaveFolder'],
          confirmOverwrite: call('confirmOverwrite') as FilePageDeps['context']['confirmOverwrite'],
        },
        thumbnails: createThumbnails(this),
        confirmDiscard: createDiscardQuestion(this),
        folderName: createFolderName(this),
        items: createItemCheck(this),
      };
    }
    return this.#realDeps;
  }

  /**
   * Show the page, on one of its pages.
   * @param page The page.
   * @param options For Save as, the format to start on instead of Keep.
   */
  show(page: FilePageName, options: { format?: SaveFormat } = {}): void {
    if (page !== this._page) this._status = undefined;
    this._page = page;
    this._startFormat = page === 'saveAs' ? options.format : undefined;
    this.open = true;
    if (page === 'open') void this.#openPage.load();
    if (page === 'saveAs') this.#saveAsPage.reset(options.format);
  }

  /** Hide the page; the app's own view is back. */
  hide(): void {
    this.open = false;
  }

  /**
   * Save the document as the Save button does: over the item, in its own format, at the default
   * quality, without asking (D4). An item whose format cannot be kept (a GIF, a BMP) is not
   * converted silently: Save as is shown instead, on PNG with the address warning showing, and
   * nothing is written (design §6).
   * @returns How it went.
   */
  async save(): Promise<FileSaveOutcome> {
    const document = this.document;
    if (!document) return { status: 'cancelled' };
    if (!keepFormatFor(document.extension)) {
      this.show('saveAs', { format: 'png' });
      return { status: 'needs-save-as' };
    }
    return this.#saveAndReport(saveAsDefaults(document, this._words('saveAsCopyName', '%0%')));
  }

  /**
   * Run a save, say how it went on the page, and tell the app.
   * @param choice How to save.
   * @returns How it went.
   */
  async #saveAndReport(choice: SaveChoice): Promise<FileSaveOutcome> {
    const document = this.document;
    if (!document) return { status: 'cancelled' };
    if (this._status?.kind === 'saving') return { status: 'cancelled' };
    this._status = { kind: 'saving' };
    let outcome: FileSaveOutcome;
    try {
      outcome = this.encode
        ? await runSave(this._deps.context, document, choice, this.encode, this.resetFocalPoint)
        : { status: 'failed' };
    } catch (error) {
      outcome = { status: 'failed', message: error instanceof Error ? error.message : undefined };
    }
    if (outcome.status === 'saved') {
      this._status = { kind: 'saved' };
      this._fire(FILE_PAGE_EVENTS.saved, outcome.saved);
    } else if (outcome.status === 'failed') {
      this._status = { kind: 'failed', message: outcome.message };
      this._fire(FILE_PAGE_EVENTS.failed, { message: outcome.message });
    } else {
      this._status = { kind: 'cancelled' };
    }
    return outcome;
  }

  /** @returns What the last save said, for Save and Save as. */
  #renderStatus() {
    const status = this._status;
    if (!status) return nothing;
    const words: Record<string, WordKey> = {
      saving: 'saveSaving',
      saved: 'saveSaved',
      failed: 'saveFailed',
      cancelled: 'saveCancelled',
    };
    return html`<p class="status ${status.kind}" role="status">
      ${this._words(words[status.kind])}${status.message ? html` ${status.message}` : nothing}
    </p>`;
  }

  /** @returns The Save page: what Save does, and the button that does it. */
  #renderSavePage() {
    const document = this.document;
    return html`
      <h2>${this._words('saveHeading')}</h2>
      ${document ? html`<p class="muted">${this._words('saveLede', document.name)}</p>` : nothing}
      <div class="actions">
        <button
          type="button"
          class="button primary"
          data-action="save"
          ?disabled=${!document || this._status?.kind === 'saving'}
          @click=${() => void this.save()}>
          <umb-icon name="icon-save"></umb-icon><span>${this._words('saveButton')}</span>
        </button>
      </div>
      ${this.#renderStatus()}
    `;
  }

  override disconnectedCallback(): void {
    this.#saveAsPage.dispose();
    super.disconnectedCallback();
  }

  /**
   * Fire one of the page's events from this element. Bubbling and composed, so an app may listen on
   * the element or above it.
   * @param name The event's name.
   * @param detail What it carries.
   */
  protected _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /**
   * A row of the page list was pressed.
   * @param row The row.
   */
  #onRow(row: PageRow): void {
    if (row.name === 'back') {
      this.hide();
      this._fire(FILE_PAGE_EVENTS.back);
      return;
    }
    if (row.name === 'close') {
      this._fire(FILE_PAGE_EVENTS.close);
      return;
    }
    this.show(row.name);
  }

  /**
   * The chosen page's content.
   * @returns Its template.
   */
  protected _renderPage(): TemplateResult {
    switch (this._page) {
      case 'open':
        return this.#openPage.render();
      case 'save':
        return this.#renderSavePage();
      case 'saveAs':
        return this.#saveAsPage.render();
      case 'info':
        return renderInfoPage(this.document, this._words, this.localize.lang());
    }
  }

  override render() {
    const hasFile = !!this.document;
    return html`
      <nav class="list" aria-label=${this._words('filePage')}>
        ${ROWS.map(
          (row) => html`<button
            type="button"
            class="row ${row.name}"
            data-page=${row.name}
            aria-current=${row.name === this._page ? 'page' : nothing}
            ?disabled=${row.needsFile && !hasFile}
            @click=${() => this.#onRow(row)}>
            <umb-icon name=${row.icon}></umb-icon>
            <span>${this._words(row.label)}</span>
          </button>`,
        )}
      </nav>
      <section class="body">${this._renderPage()}</section>
    `;
  }

  static override styles = [
    filePageStyles,
    openPageStyles,
    saveAsPageStyles,
    infoPageStyles,
    css`
      :host {
        display: flex;
        flex-direction: row;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }

      :host(:not([open])) {
        display: none;
      }

      .list {
        flex: 0 0 ${PAGE_LIST_WIDTH}px;
        display: flex;
        flex-direction: column;
        padding: ${PAGE_GAP / 2}px 0;
        background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
        border-right: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt));
        overflow-y: auto;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 0 0 ${PAGE_ROW_HEIGHT}px;
        width: 100%;
        padding: 0 ${PAGE_GAP}px;
        border: none;
        background: transparent;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: inherit;
        font-family: var(--umbradesktop-app-font, inherit);
        font-size: 15px;
        text-align: left;
        cursor: pointer;
      }

      .row umb-icon {
        flex: none;
        font-size: 18px;
      }

      .row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .row.back {
        margin-bottom: ${PAGE_GAP / 2}px;
        color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
        font-size: 14px;
      }

      .row[aria-current='page'] {
        background: var(--umbradesktop-app-accent, var(--uui-color-selected));
        color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
        font-weight: 700;
      }

      .row:not(:disabled):not([aria-current='page']):hover {
        background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      }

      .row:disabled {
        opacity: 0.45;
        cursor: default;
      }

      .row:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: -2px;
      }

      .body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: ${PAGE_GAP}px;
        padding: ${PAGE_PADDING}px;
        overflow: auto;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    [FILE_PAGE_TAG]: UmbraDesktopMediaFilePageElement;
  }
}
