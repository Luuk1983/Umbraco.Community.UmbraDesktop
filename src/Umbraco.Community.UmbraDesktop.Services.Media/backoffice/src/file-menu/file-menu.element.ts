import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMBRADESKTOP_MEDIA_CONTEXT } from '../context/media.context-token.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import {
  COMMAND_HEIGHT,
  FILE_MENU_EVENTS,
  FILE_MENU_TAG,
  MENU_WIDTH,
  PAGE_GAP,
  PAGE_PADDING,
  PANEL_WIDTHS,
  SHEET_BAR_HEIGHT,
  SLIDE_MS,
} from './constants.js';
import {
  createDiscardQuestion,
  createFolderName,
  createItemCheck,
  createReferenceCount,
  createThumbnails,
  createUsedElsewhereQuestion,
} from './deps.js';
import type { FileMenuDeps } from './deps.js';
import { filePageStyles } from './styles.js';
import { OpenPage, openPageStyles } from './open-page.js';
import { SaveAsPage, saveAsPageStyles } from './save-as-page.js';
import { renderInfoPage, infoPageStyles } from './info-page.js';
import { keepFormatFor } from './formats.js';
import { runSave, saveAsDefaults } from './save-flow.js';
import type { SaveChoice } from './save-flow.js';
import type { FileEncoder, FileMenuDocument, FileMenuPanel, FileSaveOutcome, SaveFormat } from './types.js';

/** A panel that slides in over the menu. */
type Panel = Exclude<FileMenuPanel, 'menu'>;

/** One command of the menu. */
interface Command {
  /** What it is. */
  name: 'open' | 'save' | 'saveAs' | 'info' | 'close';
  /** Its label's dictionary key. */
  label: WordKey;
  /** Its icon. */
  icon: string;
  /** Its key, as the app binds it; shown, not handled here. */
  key?: string;
  /** Whether it slides a panel in, which an arrow says. */
  panel?: boolean;
}

/** The commands, top to bottom, as mock scene 2 lists them. Close stands apart, in a group of its own. */
const COMMANDS: readonly Command[] = [
  { name: 'open', label: 'menuOpen', icon: 'icon-folder-open', key: 'Ctrl+O', panel: true },
  { name: 'save', label: 'menuSave', icon: 'icon-save', key: 'Ctrl+S' },
  { name: 'saveAs', label: 'menuSaveAs', icon: 'icon-documents', key: 'Ctrl+Shift+S', panel: true },
  { name: 'info', label: 'menuInfo', icon: 'icon-info', panel: true },
];

/** Close, the one command in the second group. */
const CLOSE: Command = { name: 'close', label: 'menuClose', icon: 'icon-wrong' };

/** What can take focus inside a sheet, for moving focus in and keeping Tab there. */
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

/**
 * The element with focus, looking through shadow roots, so focus goes back to the app's own button.
 * @returns The element, or null.
 */
function deepActiveElement(): HTMLElement | null {
  let active = document.activeElement as HTMLElement | null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
  return active;
}

/**
 * The file menu: Open, Save, Save as, Info and Close for an app that opens and saves media files,
 * sliding in from the app's right edge over a dimmed app, the way Umbraco's own side panels do. Open,
 * Save as and Info each slide their own panel in over it, with an arrow back. Issue #136, design §14
 * and D6, D11, D12.
 *
 * **An element of the media service, used by tag name.** The service's bundle defines it, so an app
 * in another package renders `<umbradesktop-media-file-menu>`, sets its properties and listens for
 * its events, with the types copied from the developer page, and imports nothing. It is about media
 * files (the recent list, the media picker, saving media items), which is why it lives here and not
 * in the core desktop: an app that never touches media has no use for it.
 *
 * **Inside the app, not Umbraco's modal manager.** An Umbraco modal covers the whole backoffice and
 * every other window on the desktop; this covers only the box the app gives it, and the window's
 * title bar stays live.
 *
 * **It owns the commands; the app owns the document.** The app says what is open, whether it is
 * dirty, which file types it opens and how to encode itself; the menu runs the media context's open
 * and save and tells the app what happened. It never changes the document itself.
 *
 * **Disabled, never hidden.** With nothing open, the commands that need a file are drawn and
 * disabled, so the person sees what the menu will offer once a file is open.
 */
@customElement(FILE_MENU_TAG)
export class UmbraDesktopMediaFileMenuElement extends UmbLitElement {
  /** What the app has open, or null for nothing. */
  @property({ attribute: false })
  document: FileMenuDocument | null = null;

  /** Whether the app holds unsaved work: Save is enabled only then, and Open asks before it. */
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

  /** The app's name: the menu's title, and what Close says it closes. "Menu" without one. */
  @property({ attribute: false })
  label?: string;

  /** Whether the menu shows. Reflected, so the app can style on it. */
  @property({ type: Boolean, reflect: true })
  open = false;

  /**
   * What the menu reaches outside itself with. A test sets it; without one the menu builds the real
   * operations on first use: the media context found by its token, Umbraco's imaging repository and
   * its confirm dialog.
   */
  @property({ attribute: false })
  deps?: FileMenuDeps;

  /** The panel over the menu, or undefined while only the menu shows. */
  @state()
  protected _panel?: Panel;

  /** What the last save said, shown in Save as's footer; undefined before any. */
  @state()
  protected _status?: { kind: 'saving' | 'saved' | 'failed' | 'cancelled'; message?: string };

  /** This package's words, with the English dictionary as their fallback. */
  protected readonly _words = wordsOf(this.localize);

  /** Open, which keeps its list between visits and reloads it on each. */
  readonly #openPage = new OpenPage(this.#pageHost());

  /** Save as, which keeps its choices while it shows and starts over on each visit. */
  readonly #saveAsPage = new SaveAsPage(this.#pageHost());

  /** Where focus was before the menu opened, to put it back when it goes. */
  #returnFocus?: HTMLElement | null;

  /**
   * What a panel reads from this element, as live getters, so a panel always sees the current
   * properties rather than the ones it was built with.
   * @returns The panel host.
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
    };
  }

  /** The real deps, built once when no test gave any. */
  #realDeps?: FileMenuDeps;

  /**
   * The deps in use: a test's, or the real ones. The context is reached lazily on each call, since
   * the menu can be rendered before the desktop has provided it.
   * @returns The deps.
   */
  protected get _deps(): FileMenuDeps {
    if (this.deps) return this.deps;
    if (!this.#realDeps) {
      const reach = () => this.getContext(UMBRADESKTOP_MEDIA_CONTEXT);
      const call =
        <K extends keyof FileMenuDeps['context']>(name: K) =>
        async (...args: Parameters<FileMenuDeps['context'][K]>) => {
          const context = await reach();
          if (!context) throw new Error('The media service is not available.');
          return (context[name] as (...a: typeof args) => unknown)(...args);
        };
      this.#realDeps = {
        context: {
          open: call('open') as FileMenuDeps['context']['open'],
          recent: (async (accept) => ((await reach())?.recent(accept) ?? [])) as FileMenuDeps['context']['recent'],
          forgetRecent: (unique) => void reach().then((context) => context?.forgetRecent(unique)),
          save: call('save') as FileMenuDeps['context']['save'],
          pickSaveFolder: call('pickSaveFolder') as FileMenuDeps['context']['pickSaveFolder'],
          confirmOverwrite: call('confirmOverwrite') as FileMenuDeps['context']['confirmOverwrite'],
        },
        thumbnails: createThumbnails(this),
        confirmDiscard: createDiscardQuestion(this),
        folderName: createFolderName(this),
        items: createItemCheck(this),
        references: createReferenceCount(this),
        confirmUsedElsewhere: createUsedElsewhereQuestion(this),
      };
    }
    return this.#realDeps;
  }

  /**
   * Show the menu, or a panel over it.
   * @param panel The menu, or the panel to slide in over it.
   * @param options For Save as, the format to start on instead of Keep.
   */
  show(panel: FileMenuPanel = 'menu', options: { format?: SaveFormat } = {}): void {
    if (!this.open) this.#returnFocus = deepActiveElement();
    const next = panel === 'menu' ? undefined : panel;
    if (next !== this._panel) this._status = undefined;
    this._panel = next;
    this.open = true;
    if (next === 'open') void this.#openPage.load();
    if (next === 'saveAs') this.#saveAsPage.reset(options.format);
    void this.updateComplete.then(() => this.#focusFirst());
  }

  /** Put the menu away, panels and all, give focus back to where it was, and say so. */
  hide(): void {
    if (!this.open) return;
    this.open = false;
    this._panel = undefined;
    const back = this.#returnFocus;
    this.#returnFocus = undefined;
    if (back?.isConnected) back.focus();
    this._fire(FILE_MENU_EVENTS.hidden);
  }

  /**
   * Save the document as the app's Save button does: over the item, in its own format, at the
   * default quality, without asking (D4). An item whose format cannot be kept (a GIF, a BMP) is not
   * converted silently: the menu shows Save as instead, on PNG, and nothing is written (design §6).
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
   * Run a save, say how it went, and tell the app. A save from Save as that worked puts the menu
   * away; one that failed leaves Save as open with the reason in its footer.
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
        ? await runSave(this._deps.context, document, choice, this.encode, this.resetFocalPoint, () => this.#goOnUsedElsewhere(document))
        : { status: 'failed' };
    } catch (error) {
      outcome = { status: 'failed', message: error instanceof Error ? error.message : undefined };
    }
    if (outcome.status === 'saved') {
      this._status = { kind: 'saved' };
      this._fire(FILE_MENU_EVENTS.saved, outcome.saved);
      if (this._panel === 'saveAs') this.hide();
    } else if (outcome.status === 'failed') {
      this._status = { kind: 'failed', message: outcome.message };
      this._fire(FILE_MENU_EVENTS.failed, { message: outcome.message });
    } else {
      this._status = { kind: 'cancelled' };
    }
    return outcome;
  }

  /**
   * Where the open file is used (#137): how many places, once counted, and whether the person has
   * said yes to saving over it. Kept for one item, and started again when the app opens another or
   * moves onto a copy, so the question is asked once per opened file.
   */
  @state()
  protected _usage?: { unique: string; count?: number; agreed: boolean };

  /**
   * Count the places a newly opened file is used, as it opens, so a save never waits on it. A count
   * that fails stays unknown: no question, no Info row.
   * @param changed What changed.
   */
  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (!changed.has('document')) return;
    const unique = this.document?.unique ?? null;
    if (unique === (this._usage?.unique ?? null)) return;
    if (!unique) {
      this._usage = undefined;
      return;
    }
    const usage = { unique, agreed: false } as { unique: string; count?: number; agreed: boolean };
    this._usage = usage;
    const count = this._deps.references;
    if (!count) return;
    count(unique).then(
      (total) => {
        if (this._usage !== usage || total === undefined) return;
        this._usage = { ...usage, count: total };
      },
      () => undefined,
    );
  }

  /**
   * Whether a save over the open file goes on: asks the first time when the file is used anywhere,
   * and remembers a yes for that file. A no is not remembered, so the next save asks again.
   * @param document The document being saved.
   * @returns True to save.
   */
  async #goOnUsedElsewhere(document: FileMenuDocument): Promise<boolean> {
    const usage = this._usage;
    const ask = this._deps.confirmUsedElsewhere;
    if (!usage || usage.unique !== document.unique || !usage.count || usage.agreed || !ask) return true;
    const yes = await ask(document.name, usage.count, usage.unique);
    if (yes && this._usage?.unique === usage.unique) this._usage = { ...this._usage, agreed: true };
    return yes;
  }

  /** Save from the menu's command: at once, then the menu goes, unless Save as had to take over. */
  async #saveFromMenu(): Promise<void> {
    const outcome = await this.save();
    if (outcome.status !== 'needs-save-as') this.hide();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this.#onKeyDown);
  }

  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    this.#saveAsPage.dispose();
    super.disconnectedCallback();
  }

  /**
   * Fire one of the menu's events from this element. Bubbling and composed, so an app may listen on
   * the element or above it.
   * @param name The event's name.
   * @param detail What it carries.
   */
  protected _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /** @returns The sheet on top: the panel when one shows, else the menu. */
  #topSheet(): HTMLElement | null {
    return this.shadowRoot?.querySelector(this._panel ? '.sheet.panel' : '.sheet.menu') ?? null;
  }

  /**
   * Put focus on the first thing the top sheet offers: the first command, or a panel's arrow back.
   * Without scrolling: the sheet is still off to the right while it slides in, and a plain focus()
   * scrolled this element sideways to show it, so the menu bounced (found by the owner).
   */
  #focusFirst(): void {
    if (!this.open) return;
    this.#topSheet()?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  }

  /**
   * Keys inside the menu: Escape puts it all away, and Tab goes round the top sheet rather than out
   * of it, since it is a modal dialog to assistive technology (design §14.2).
   * @param event The key.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(this.#topSheet()?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!focusable.length) return;
    const active = this.shadowRoot!.activeElement;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  };

  /**
   * A command of the menu was pressed.
   * @param command The command.
   */
  #onCommand(command: Command): void {
    switch (command.name) {
      case 'save':
        void this.#saveFromMenu();
        return;
      case 'close':
        this._fire(FILE_MENU_EVENTS.close);
        return;
      default:
        this.show(command.name);
    }
  }

  /**
   * The line under a command, saying what it does.
   * @param command The command.
   * @returns The line.
   */
  #line(command: Command): string {
    switch (command.name) {
      case 'open':
        return this._words('menuOpenLine');
      case 'save':
        return this.document ? this._words('menuSaveLine', this.document.name) : this._words('menuSaveLineNothing');
      case 'saveAs':
        return this._words('menuSaveAsLine');
      case 'info':
        return this._words('menuInfoLine');
      case 'close':
        return this.label ? this._words('menuCloseLine', this.label) : this._words('menuCloseLineUnnamed');
    }
  }

  /**
   * Whether a command is disabled: Save, Save as and Info need a file, and Save something to save.
   * @param command The command.
   * @returns True when disabled.
   */
  #disabled(command: Command): boolean {
    if (command.name === 'open' || command.name === 'close') return false;
    if (!this.document) return true;
    if (command.name === 'save') return !this.dirty || this._status?.kind === 'saving';
    return false;
  }

  /**
   * One command: icon, label, the line under it, and its key or the arrow to its panel.
   * @param command The command.
   * @returns Its button.
   */
  #renderCommand(command: Command): TemplateResult {
    return html`<button
      type="button"
      class="command"
      data-command=${command.name}
      ?disabled=${this.#disabled(command)}
      @click=${() => this.#onCommand(command)}>
      <umb-icon name=${command.icon}></umb-icon>
      <span class="text"><span class="label">${this._words(command.label)}</span><span class="line">${this.#line(command)}</span></span>
      ${command.key ? html`<kbd>${command.key}</kbd>` : nothing}
      ${command.panel ? html`<umb-icon class="chevron" name="icon-arrow-right"></umb-icon>` : nothing}
    </button>`;
  }

  /** @returns The menu: its title, the commands, and Close menu in its footer. */
  #renderMenu(): TemplateResult {
    return html`<section
      class="sheet menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-title"
      ?inert=${!!this._panel}>
      <header><h2 id="menu-title">${this.label ?? this._words('fileMenu')}</h2></header>
      <div class="body">
        <div class="commands">${COMMANDS.map((command) => this.#renderCommand(command))}</div>
        <div class="commands">${this.#renderCommand(CLOSE)}</div>
      </div>
      <footer><button type="button" class="button" data-action="dismiss" @click=${() => this.hide()}>${this._words('closeMenu')}</button></footer>
    </section>`;
  }

  /** @returns What the last save said, for Save as's footer. */
  #renderStatus() {
    const status = this._status;
    if (!status || this._panel !== 'saveAs') return nothing;
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

  /**
   * A panel over the menu: the arrow back and its title, its content, and its buttons in the footer.
   * @param panel The panel.
   * @returns Its sheet.
   */
  #renderPanel(panel: Panel): TemplateResult {
    const titles: Record<Panel, WordKey> = { open: 'menuOpen', saveAs: 'menuSaveAs', info: 'menuInfo' };
    const content =
      panel === 'open'
        ? this.#openPage.render()
        : panel === 'saveAs'
          ? this.#saveAsPage.render()
          : renderInfoPage(this.document, this._words, this.localize.lang(), this._usage?.count);
    const dismiss = html`<button type="button" class="button" data-action="dismiss" @click=${() => this.hide()}>
      ${this._words(panel === 'info' ? 'close' : 'cancel')}
    </button>`;
    return html`<section
      class="sheet panel"
      data-panel=${panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="panel-title"
      style="--sheet-width: ${PANEL_WIDTHS[panel]}px">
      <header>
        <button
          type="button"
          class="back"
          data-action="back"
          title=${this._words('backToMenu')}
          aria-label=${this._words('backToMenu')}
          @click=${() => this.show('menu')}>
          <umb-icon name="icon-arrow-left"></umb-icon>
        </button>
        <h2 id="panel-title">${this._words(titles[panel])}</h2>
      </header>
      <div class="body">${content}</div>
      <footer>${this.#renderStatus()}${dismiss}${panel === 'saveAs' ? this.#saveAsPage.renderAction() : nothing}</footer>
    </section>`;
  }

  override render() {
    if (!this.open) return nothing;
    return html`
      <div class="scrim" @click=${() => this.hide()}></div>
      ${this.#renderMenu()} ${this._panel ? this.#renderPanel(this._panel) : nothing}
    `;
  }

  static override styles = [
    filePageStyles,
    openPageStyles,
    saveAsPageStyles,
    infoPageStyles,
    css`
      :host {
        position: absolute;
        inset: 0;
        z-index: 10;
        display: block;
        overflow: hidden;
        background: none;
      }

      :host(:not([open])) {
        display: none;
      }

      .scrim {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.38);
        animation: fade ${SLIDE_MS}ms ease-out;
      }

      .sheet {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(var(--sheet-width), 100%);
        display: flex;
        flex-direction: column;
        background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
        box-shadow: -8px 0 28px rgba(0, 0, 0, 0.28);
        animation: slide ${SLIDE_MS}ms ease-out;
      }

      .sheet.menu {
        --sheet-width: ${MENU_WIDTH}px;
      }

      @media (prefers-reduced-motion: reduce) {
        .scrim,
        .sheet {
          animation: none;
        }
      }

      @keyframes slide {
        from {
          transform: translateX(100%);
        }
      }

      @keyframes fade {
        from {
          opacity: 0;
        }
      }

      header,
      footer {
        flex: 0 0 ${SHEET_BAR_HEIGHT}px;
        display: flex;
        align-items: center;
        gap: ${PAGE_GAP / 2}px;
        padding: 0 ${PAGE_PADDING}px;
        min-width: 0;
        background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      }

      header {
        border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt));
      }

      footer {
        justify-content: flex-end;
        border-top: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt));
      }

      header h2 {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 19px;
      }

      .back {
        flex: none;
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        margin-left: -8px;
        padding: 0;
        font: inherit;
        color: inherit;
        background: none;
        border: none;
        border-radius: var(--umbradesktop-app-radius, 3px);
        cursor: pointer;
      }

      .back:hover {
        background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      }

      .body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: ${PAGE_GAP}px;
        padding: ${PAGE_PADDING}px;
        overflow: auto;
      }

      .commands {
        display: flex;
        flex-direction: column;
        flex: none;
        background: var(--umbradesktop-app-surface, var(--uui-color-surface));
        border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
        border-radius: var(--umbradesktop-app-radius, 3px);
        overflow: hidden;
      }

      .command {
        display: flex;
        align-items: center;
        gap: 14px;
        min-height: ${COMMAND_HEIGHT}px;
        padding: 10px 16px;
        font: inherit;
        font-family: var(--umbradesktop-app-font, inherit);
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
      }

      .command + .command {
        border-top: 1px solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      }

      .command:not(:disabled):hover {
        background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      }

      .command:disabled {
        opacity: 0.45;
        cursor: default;
      }

      .command:focus-visible,
      .back:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: -2px;
      }

      .command > umb-icon {
        flex: none;
        font-size: 20px;
      }

      .command .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .command .label {
        font-weight: 700;
      }

      /* Up to two lines, then cut: one line cut "Another file from the media library" short under the
         themes with wider fonts (Umbraco 4's Verdana), and a long item name still has to end somewhere. */
      .command .line {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        font-size: 13px;
        color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
      }

      .command kbd {
        flex: none;
        font: inherit;
        font-size: 12px;
        color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
      }

      .command .chevron {
        flex: none;
        font-size: 14px;
        color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
      }

      .status {
        flex: 1;
        min-width: 0;
        font-size: 13px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    [FILE_MENU_TAG]: UmbraDesktopMediaFileMenuElement;
  }
}
