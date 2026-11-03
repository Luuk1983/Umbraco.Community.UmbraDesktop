import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues, TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { formatBytes } from '../image-editor/status-bar.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { IMAGE_KINDS } from '../guidelines/guidelines.js';
import type { GuidelineFormat, ImageKind } from '../guidelines/guidelines.js';
import type { CheckedFile, GuidelineBreak } from '../guidelines/check.js';
import type { SheetAnswer, SheetRequest } from './guided-upload.js';
import { UMBRADESKTOP_CLOSE_DIALOG_EVENT } from '../shared/desktop-dialog.js';

/** Each kind's name, as a file's line and the short rules say it. */
const KIND_WORDS: Record<ImageKind, WordKey> = {
  jpeg: 'guidelinesKindJpeg',
  'png-photo': 'guidelinesKindPngPhoto',
  'png-transparent': 'guidelinesKindPngTransparent',
  webp: 'guidelinesKindWebp',
  gif: 'guidelinesKindGif',
};

/** A format's name. */
const FORMAT_NAMES: Record<Exclude<GuidelineFormat, 'keep'>, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP' };

/**
 * Each guideline's icon, drawn on its short rule under the heading and on every file's action for it,
 * so an action says which guideline it answers without a legend.
 */
const BREAK_ICONS: Record<GuidelineBreak, string> = {
  size: 'icon-fullscreen',
  format: 'icon-picture',
  location: 'icon-map-marker',
  'upload-limit': 'icon-cloud-upload',
};

/** The dialog's content width, in px: wide enough for a file's line and its actions beside it. */
const DIALOG_WIDTH = 640;

/** The least a file's row is, in px, border included. The CSS draws it at least this tall. */
const ROW_HEIGHT = 60;

/** One action's line, in px. A row holds its actions one per line, so three make it taller. */
const ACTION_LINE = 18;

/** A row's padding and border together, in px, around its lines of actions. */
const ROW_CHROME = 17;

/** The most rows the dialog grows to show before the list scrolls. */
const MOST_ROWS = 6;

/**
 * Everything but the rows, in px: the headline and its line, the guidelines' heading and their short
 * rules on one line, Select all, the line about Optimize and the buttons. Measured in a browser at
 * the default theme's sizes (design §12): six rows of 60 left the list 16 px over at 306.
 */
const FIXED_HEIGHT = 290;

/**
 * What Optimize will do to a file, as the guidelines it breaks, in their order. Being over the upload
 * limit is left out when the file is resized or converted anyway, since that already brings it under:
 * saying it twice would read as two things done.
 * @param file The file.
 * @returns The guidelines its actions answer.
 */
export function actionsOf(file: CheckedFile): GuidelineBreak[] {
  const encodes = file.breaks.includes('size') || file.breaks.includes('format');
  return file.breaks.filter((each) => each !== 'upload-limit' || !encodes);
}

/**
 * A file's row, in px: its actions one per line, and never less than {@link ROW_HEIGHT}.
 * @param file The file.
 * @returns The height.
 */
function rowHeight(file: CheckedFile): number {
  return Math.max(ROW_HEIGHT, actionsOf(file).length * ACTION_LINE + ROW_CHROME);
}

/**
 * The content box the warning asks its dialog for: its width, and room for its first
 * {@link MOST_ROWS} rows. The desktop adds its window's chrome and keeps it on the desktop.
 * @param request What the warning is about.
 * @returns The size in px.
 */
export function guidelinesDialogSize(request: SheetRequest): { w: number; h: number } {
  const shown = request.listed.slice(0, MOST_ROWS);
  const rows = shown.length ? shown.reduce((sum, file) => sum + rowHeight(file), 0) : ROW_HEIGHT;
  return { w: DIALOG_WIDTH, h: FIXED_HEIGHT + rows };
}

/**
 * The media guidelines warning (#179): the content of a dialog the desktop opens over the Media
 * Manager window the files were dropped on. The dialog keeps that window waiting, and only that one,
 * so the rest of the desktop carries on. It shows the guidelines at the top, short, under their
 * heading, then lists the files that break one, each with its picture, what it is and what Optimize
 * will do to it, all ticked (owner, after the second test: say what will happen, not what is wrong, and
 * no pills). It answers
 * with one of three: Upload as they are, Optimize the ticked ones, or, closed, none of them.
 *
 * The desktop mounts it with its props set: {@link request}, {@link folderName}, and the two calls
 * back, {@link onAnswer} and {@link onSettings}, since the dialog's window is not inside the window
 * that asked and an event from here would never reach it. It answers once, then asks the desktop to
 * close its dialog. A dialog closed without an answer, by its close button or with its owner, answers
 * none.
 */
@customElement('umbradesktop-media-guidelines-dialog')
export class UmbraDesktopMediaGuidelinesDialogElement extends UmbLitElement {
  /** What the warning is about. */
  @property({ attribute: false })
  request?: SheetRequest;

  /** The folder the files go to, for the line about what is uploading. */
  @property({ attribute: false })
  folderName = '';

  /** Called with the answer, once. */
  @property({ attribute: false })
  onAnswer?: (answer: SheetAnswer) => void;

  /** Called when the person asks for the guidelines' settings. */
  @property({ attribute: false })
  onSettings?: () => void;

  /** The files ticked. */
  @state()
  private _ticked = new Set<CheckedFile>();

  /** The words. */
  readonly #words = wordsOf(this.localize);

  /** Each file's picture, made from the file itself and let go when the dialog goes. */
  #pictures = new Map<CheckedFile, string>();

  /** Whether the warning has answered, so it answers once. */
  #answered = false;

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (changed.has('request')) {
      this.#release();
      this._ticked = new Set(this.request?.listed ?? []);
      for (const each of this.request?.listed ?? []) this.#pictures.set(each, URL.createObjectURL(each.file));
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this.#onKey);
    // The keyboard comes to the warning, so Escape and Tab work without a click first.
    void this.updateComplete.then(() => this.shadowRoot?.querySelector<HTMLElement>('[data-action="optimize"], [data-action="as-is"]')?.focus());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this.#onKey);
    this.#release();
    // Gone without an answer: its dialog was closed, by its own button or with the window it kept
    // waiting. Asked a moment later, so an element only moved in the page is not taken for closed.
    queueMicrotask(() => {
      if (!this.isConnected) this.#answer({ kind: 'none' }, false);
    });
  }

  /** Let go of the files' pictures. */
  #release(): void {
    for (const url of this.#pictures.values()) URL.revokeObjectURL(url);
    this.#pictures.clear();
  }

  /**
   * Answer, once, and close the dialog.
   * @param answer The answer.
   * @param close Whether to ask the desktop to close the dialog, which a dialog already closed needs not.
   */
  #answer(answer: SheetAnswer, close = true): void {
    if (this.#answered) return;
    this.#answered = true;
    this.onAnswer?.(answer);
    if (close) this.dispatchEvent(new CustomEvent(UMBRADESKTOP_CLOSE_DIALOG_EVENT, { bubbles: true, composed: true }));
  }

  /**
   * Tick a file, or untick it.
   * @param file The file.
   */
  #toggle(file: CheckedFile): void {
    const ticked = new Set(this._ticked);
    if (ticked.has(file)) ticked.delete(file);
    else ticked.add(file);
    this._ticked = ticked;
  }

  /** Tick every file, or none when every file is ticked. */
  #toggleAll(): void {
    const listed = this.request?.listed ?? [];
    this._ticked = this._ticked.size === listed.length ? new Set() : new Set(listed);
  }

  /**
   * Escape closes the warning, as it closes Umbraco's own dialogs, uploading none of the files.
   * @param event The key.
   */
  #onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this.#answer({ kind: 'none' });
  };

  override render() {
    const request = this.request;
    if (!request) return nothing;
    const words = this.#words;
    const listed = request.listed;
    const total = listed.length + request.passing;
    const ticked = listed.filter((each) => this._ticked.has(each));
    return html`<header class="head">
        <span class="mark" aria-hidden="true"><umb-icon name="icon-alert"></umb-icon></span>
        <div>
          <h2 id="headline">${this.#headline(listed.length, total)}</h2>
          <p>${this.#passingLine(request.passing)}</p>
        </div>
        <section class="rules" aria-labelledby="rules-heading">
          <h3 id="rules-heading">${words('guidelinesTitle')}</h3>
          <ul>
            ${this.#rules(request).map(
              ([broken, label]) => html`<li class="rule" data-break=${broken}><umb-icon name=${BREAK_ICONS[broken]}></umb-icon>${label}</li>`,
            )}
          </ul>
        </section>
      </header>
      ${request.canOptimize
        ? html`<div class="all">
            ${this.#checkbox(ticked.length === listed.length, words('guidelinesSelectAll'), () => this.#toggleAll(), ticked.length > 0 && ticked.length < listed.length)}
            <span>${words('guidelinesSelectAll')}</span>
            <span class="count">${words('guidelinesSelected', ticked.length, listed.length)}</span>
          </div>`
        : nothing}
      <ul class="list" aria-labelledby="headline">
        ${listed.map((each) => this.#renderFile(each, request))}
      </ul>
      <p class="what"><umb-icon name="icon-info"></umb-icon><span>${request.canOptimize ? words('guidelinesWhatOptimize') : words('guidelinesNoOptimizer')}</span></p>
      <footer class="foot">
        <button type="button" class="settings" data-action="settings" @click=${() => this.onSettings?.()}>
          <umb-icon name="icon-settings"></umb-icon><span>${words('guidelinesLink')}</span>
        </button>
        <span class="spacer"></span>
        <uui-button look="secondary" data-action="as-is" label=${words('guidelinesAsIs')} @click=${() => this.#answer({ kind: 'as-is' })}></uui-button>
        ${request.canOptimize
          ? html`<uui-button
              look="primary"
              color="positive"
              data-action="optimize"
              label=${words('guidelinesOptimize', ticked.length)}
              ?disabled=${!ticked.length}
              @click=${() => ticked.length && this.#answer({ kind: 'optimize', ticked })}></uui-button>`
          : nothing}
      </footer>`;
  }

  /**
   * The headline: how many files are listed, of how many dropped.
   * @param listed How many are listed.
   * @param total How many were dropped.
   * @returns The words.
   */
  #headline(listed: number, total: number): string {
    const words = this.#words;
    if (listed === total) return listed === 1 ? words('guidelinesHeadlineOne') : words('guidelinesHeadlineAll', listed);
    return listed === 1 ? words('guidelinesHeadlineOneOf', total) : words('guidelinesHeadline', listed, total);
  }

  /**
   * The line under the headline: what is uploading already.
   * @param passing How many files passed.
   * @returns The words.
   */
  #passingLine(passing: number): string {
    const words = this.#words;
    if (!passing) return words('guidelinesNothingYet');
    return passing === 1 ? words('guidelinesPassingOne', this.folderName) : words('guidelinesPassing', passing, this.folderName);
  }

  /**
   * The guidelines at their shortest, under the heading: each one that is on, in the order the
   * settings list them, and Umbraco's upload limit when a listed file is over it. Formats is one rule
   * per format converted to, naming the kinds that go there: "JPEG, PNG photo → WebP".
   * @param request The request.
   * @returns Each rule, with the guideline it is.
   */
  #rules(request: SheetRequest): Array<[GuidelineBreak, string]> {
    const words = this.#words;
    const { guidelines } = request;
    const rules: Array<[GuidelineBreak, string]> = [];
    if (guidelines.maxSize.on) rules.push(['size', words('guidelinesShortSize', guidelines.maxSize.longestSide)]);
    if (guidelines.formats.on) {
      const byTarget = new Map<Exclude<GuidelineFormat, 'keep'>, ImageKind[]>();
      for (const kind of IMAGE_KINDS) {
        const format = guidelines.formats.rows[kind];
        if (format !== 'keep') byTarget.set(format, [...(byTarget.get(format) ?? []), kind]);
      }
      for (const [format, kinds] of byTarget) {
        rules.push(['format', words('guidelinesShortConvert', kinds.map((kind) => words(KIND_WORDS[kind])).join(', '), FORMAT_NAMES[format])]);
      }
    }
    if (guidelines.location.on) rules.push(['location', words('guidelinesShortLocation')]);
    if (request.uploadLimit && request.listed.some((each) => each.breaks.includes('upload-limit'))) {
      rules.push(['upload-limit', formatBytes(request.uploadLimit, this.localize.lang())]);
    }
    return rules;
  }

  /**
   * A checkbox drawn as Umbraco's is, a button so it takes the keyboard.
   * @param checked Whether it is ticked.
   * @param label What it ticks, for a screen reader.
   * @param toggle What a press does.
   * @param mixed Whether some but not all are ticked, for Select all.
   * @returns The checkbox.
   */
  #checkbox(checked: boolean, label: string, toggle: () => void, mixed = false): TemplateResult {
    return html`<button type="button" class="check" role="checkbox" aria-checked=${mixed ? 'mixed' : checked ? 'true' : 'false'} aria-label=${label} @click=${toggle}>
      ${checked ? html`<umb-icon name="icon-check"></umb-icon>` : mixed ? html`<span class="dash"></span>` : nothing}
    </button>`;
  }

  /**
   * One file: its tick, its picture, its name and what it is, and what Optimize will do to it, or that
   * it uploads as it is when unticked.
   * @param file The file.
   * @param request The request, for whether ticking means anything, the guidelines and the limit.
   * @returns The row.
   */
  #renderFile(file: CheckedFile, request: SheetRequest): TemplateResult {
    const words = this.#words;
    const canTick = request.canOptimize;
    const on = this._ticked.has(file);
    const picture = this.#pictures.get(file);
    return html`<li class="file" ?off=${canTick && !on}>
      ${canTick ? this.#checkbox(on, words('guidelinesSelect', file.file.name), () => this.#toggle(file)) : nothing}
      <span class="thumb">${picture ? html`<img src=${picture} alt="" loading="lazy" decoding="async" />` : html`<umb-icon name="icon-picture"></umb-icon>`}</span>
      <span class="name"><b>${file.file.name}</b><small>${this.#facts(file, request.uploadLimit)}</small></span>
      <span class="acts">
        ${canTick && !on
          ? html`<span class="as-is">${words('guidelinesAsItIs')}</span>`
          : actionsOf(file).map(
              (each) => html`<span class="act" data-break=${each}><umb-icon name=${BREAK_ICONS[each]}></umb-icon>${this.#action(file, each, request)}</span>`,
            )}
      </span>
    </li>`;
  }

  /**
   * What a file is: "JPEG · 6000 × 4000 · 13.2 MB", and ", over 15.4 MB" when it is over the upload
   * limit, which an action does not always say.
   * @param file The file.
   * @param uploadLimit The upload limit, in bytes.
   * @returns The words.
   */
  #facts(file: CheckedFile, uploadLimit: number): string {
    const lang = this.localize.lang();
    const parts: string[] = [];
    if (file.kind) parts.push(this.#words(KIND_WORDS[file.kind]));
    if (file.facts.width && file.facts.height) parts.push(`${file.facts.width} × ${file.facts.height}`);
    parts.push(formatBytes(file.file.size, lang));
    const over = file.breaks.includes('upload-limit') ? `, ${this.#words('guidelinesOverLimit', formatBytes(uploadLimit, lang))}` : '';
    return parts.join(' · ') + over;
  }

  /**
   * What Optimize will do to a file for a guideline it breaks: "Resize to 2560 px", "Convert to
   * WebP", "Remove GPS", or "Make it smaller than 15.4 MB".
   * @param file The file.
   * @param broken The guideline.
   * @param request The request, for the guidelines and the upload limit.
   * @returns The words.
   */
  #action(file: CheckedFile, broken: GuidelineBreak, request: SheetRequest): string {
    const words = this.#words;
    if (broken === 'size') return words('guidelinesDoResize', request.guidelines.maxSize.longestSide);
    if (broken === 'format') {
      const target = file.kind ? request.guidelines.formats.rows[file.kind] : 'keep';
      return target === 'keep' ? '' : words('guidelinesDoConvert', FORMAT_NAMES[target]);
    }
    if (broken === 'upload-limit') return words('guidelinesDoShrink', formatBytes(request.uploadLimit, this.localize.lang()));
    return words('guidelinesDoLocation');
  }

  static override styles = css`
    /* Fills its dialog's body, laid out as Umbraco's own dialogs are: the message at the top, the
       buttons at the bottom right, and the space between them for what the dialog is about. */
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--uui-color-surface, #fff);
      color: var(--uui-color-text);
      font-size: 14px;
    }

    .head {
      display: grid;
      grid-template-columns: 32px 1fr;
      column-gap: var(--uui-size-space-4, 12px);
      padding: var(--uui-size-space-6, 20px) var(--uui-size-layout-1, 24px) var(--uui-size-space-5, 16px);
    }

    .head h2 {
      margin: 0;
      font-size: var(--uui-type-h5-size, 17px);
      line-height: 1.3;
      font-weight: 700;
    }

    .head p {
      margin: 2px 0 0;
      color: var(--uui-color-text-alt);
    }

    .mark {
      display: inline-flex;
      width: 32px;
      height: 32px;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: color-mix(in srgb, var(--uui-color-warning, #fbd142) 22%, var(--uui-color-surface, #fff));
      color: var(--uui-color-warning-standalone, #a17700);
    }

    /* The guidelines under their own heading, short, one line, each with its icon: no pills. */
    .rules {
      grid-column: 2;
      margin-top: var(--uui-size-space-4, 12px);
    }

    .rules h3 {
      margin: 0 0 2px;
      font-size: 13.5px;
      font-weight: 700;
    }

    .rules ul {
      display: flex;
      flex-wrap: wrap;
      column-gap: 16px;
      row-gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 13.5px;
    }

    .rule,
    .act {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .rule umb-icon,
    .act umb-icon {
      color: var(--uui-color-text-alt);
    }

    .all {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px var(--uui-size-layout-1, 24px);
      border-block: 1px solid var(--uui-color-divider, var(--uui-color-border));
      background: var(--uui-color-background);
      font-size: 13.5px;
    }

    .count {
      margin-left: auto;
      color: var(--uui-color-text-alt);
    }

    .list {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      margin: 0;
      padding: 0 var(--uui-size-layout-1, 24px);
      list-style: none;
    }

    .file {
      box-sizing: border-box;
      min-height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--uui-color-divider, var(--uui-color-border));
    }

    .file:last-child {
      border-bottom: 0;
    }

    .file[off] .thumb,
    .file[off] .name {
      opacity: 0.5;
    }

    .check {
      flex: none;
      display: inline-grid;
      place-items: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: 1px solid var(--uui-color-border-standalone, #8f8f93);
      border-radius: 3px;
      background: var(--uui-color-surface, #fff);
      color: var(--uui-color-selected-contrast, #fff);
      font-size: 12px;
      cursor: pointer;
    }

    .check[aria-checked='true'],
    .check[aria-checked='mixed'] {
      background: var(--uui-color-selected, #3544b1);
      border-color: var(--uui-color-selected, #3544b1);
    }

    .check .dash {
      width: 8px;
      height: 2px;
      background: currentColor;
    }

    .check:focus-visible,
    .settings:focus-visible {
      outline: 2px solid var(--uui-color-focus, var(--uui-color-selected));
      outline-offset: 1px;
    }

    .thumb {
      flex: none;
      width: 48px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 2px;
      background: var(--uui-color-background);
      color: var(--uui-color-text-alt);
    }

    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .name {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .name b,
    .name small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .name small {
      font-size: 12.5px;
      color: var(--uui-color-text-alt);
    }

    /* What Optimize will do, one action a line, on the right. */
    .acts {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      max-width: 50%;
      font-size: 13px;
      line-height: ${ACTION_LINE}px;
    }

    .as-is {
      color: var(--uui-color-text-alt);
      font-style: italic;
    }

    .what {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: var(--uui-size-space-3, 8px) var(--uui-size-layout-1, 24px) 0;
      color: var(--uui-color-text-alt);
      font-size: 13.5px;
    }

    .what umb-icon {
      flex: none;
      margin-top: 2px;
    }

    .foot {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 8px);
      margin-top: var(--uui-size-space-4, 12px);
      padding: var(--uui-size-space-5, 16px) var(--uui-size-layout-1, 24px);
      border-top: 1px solid var(--uui-color-divider, var(--uui-color-border));
    }

    .spacer {
      flex: 1;
    }

    /* A link-looking button with the settings cog, so it says it opens settings. */
    .settings {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 13.5px;
      color: var(--uui-color-interactive, var(--uui-color-selected));
      cursor: pointer;
    }

    .settings:hover span {
      text-decoration: underline;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-guidelines-dialog': UmbraDesktopMediaGuidelinesDialogElement;
  }
}
