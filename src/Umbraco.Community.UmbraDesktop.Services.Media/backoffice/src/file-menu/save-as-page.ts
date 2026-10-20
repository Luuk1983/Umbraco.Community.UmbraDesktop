import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { WordKey } from '../shared/words.js';
import { MEASURE_DEBOUNCE_MS, PAGE_GAP, SAVE_AS_FORM_WIDTH, SAVE_AS_PREVIEW_MIN_WIDTH } from './constants.js';
import type { FileMenuDeps } from './deps.js';
import { SAVE_FORMATS, formatBytes, formatLabel, keepFormatFor } from './formats.js';
import { saveAsDefaults } from './save-flow.js';
import type { SaveChoice } from './save-flow.js';
import type { FileEncoder, FileMenuDocument, SaveFormat } from './types.js';

/** What Save as reads from the element that shows it. */
export interface SaveAsPageHost {
  /** The deps in use. */
  readonly deps: FileMenuDeps;
  /** What is open. */
  readonly document: FileMenuDocument | null;
  /** How the app encodes its document. */
  readonly encode?: FileEncoder;
  /** The picture as it will be saved. */
  readonly preview?: string;
  /** Whether a save is running, which disables Save against a second press. */
  readonly saving: boolean;
  /** The language sizes are written in. */
  readonly lang: string;
  /** The package's words. */
  words(key: WordKey, ...args: unknown[]): string;
  /** Save as chosen. */
  save(choice: SaveChoice): void;
  /** Render again. */
  requestUpdate(): void;
}

/** Save as's format list: Keep, then each format by name. */
type FormatChoice = 'keep' | SaveFormat;

/**
 * Save as: replace or copy, a copy's name and folder, the format and its quality, and the file's
 * size now and after. Design §5 and D4.
 *
 * **After is measured, never estimated.** The app's encoder writes the picture in the chosen format
 * and quality and the blob's size is shown, so the number is the file that would be saved. Encoding a
 * large photo takes a moment, so it waits for the choices to settle ({@link MEASURE_DEBOUNCE_MS}) and
 * drops a result that a newer choice has overtaken, so a slow WebP measurement never overwrites the
 * PNG size the person has since chosen.
 */
export class SaveAsPage {
  /** What the page reads from its element. */
  readonly #host: SaveAsPageHost;

  /** The choices as they stand. */
  #choice?: SaveChoice;

  /** The format list's selection: Keep is its own choice, even when it means the same format. */
  #format: FormatChoice = 'keep';

  /** The measured size after, in bytes, or undefined while measuring. */
  #after?: number;

  /** The pending measurement. */
  #timer?: ReturnType<typeof setTimeout>;

  /** Counts measurements, so a stale one is dropped. */
  #generation = 0;

  /** @param host The element showing Save as. */
  constructor(host: SaveAsPageHost) {
    this.#host = host;
  }

  /**
   * Start over on the defaults for what is open: each visit to Save as starts on replace and Keep,
   * or on the format it was asked to start on.
   * @param start A format to start on instead of Keep.
   */
  reset(start?: SaveFormat): void {
    const document = this.#host.document;
    if (!document) return;
    this.#choice = saveAsDefaults(document, this.#host.words('saveAsCopyName', '%0%'), start);
    this.#format = start ?? (keepFormatFor(document.extension) ? 'keep' : 'png');
    this.#measure();
  }

  /** Stop a pending measurement, for an element that is going away. */
  dispose(): void {
    clearTimeout(this.#timer);
    this.#generation++;
  }

  /** @returns The format the choice resolves to. */
  #resolved(): SaveFormat {
    const document = this.#host.document;
    return this.#format === 'keep' ? (keepFormatFor(document?.extension ?? '') ?? 'png') : this.#format;
  }

  /**
   * Change the choices and measure again.
   * @param change What changed.
   */
  #change(change: Partial<SaveChoice>): void {
    if (!this.#choice) return;
    this.#choice = { ...this.#choice, ...change };
    this.#host.requestUpdate();
  }

  /**
   * Choose a format.
   * @param format The format list's choice.
   */
  #chooseFormat(format: FormatChoice): void {
    this.#format = format;
    this.#change({ format: this.#resolved() });
    this.#measure();
  }

  /** Measure the size after, once the choices have settled. */
  #measure(): void {
    clearTimeout(this.#timer);
    const generation = ++this.#generation;
    this.#after = undefined;
    this.#host.requestUpdate();
    this.#timer = setTimeout(async () => {
      const { encode } = this.#host;
      const choice = this.#choice;
      if (!encode || !choice) return;
      try {
        const blob = await encode(choice.format, choice.quality);
        if (generation !== this.#generation) return;
        this.#after = blob.size;
      } catch {
        if (generation !== this.#generation) return;
        this.#after = undefined;
      }
      this.#host.requestUpdate();
    }, MEASURE_DEBOUNCE_MS);
  }

  /** Ask for a copy's folder with Umbraco's folder picker, and name it. */
  async #pickFolder(): Promise<void> {
    const { deps } = this.#host;
    const picked = await deps.context.pickSaveFolder();
    if (picked.status !== 'chosen') return;
    const folderName = picked.folder ? await deps.folderName?.(picked.folder) : undefined;
    this.#change({ folder: picked.folder, folderName });
  }

  /**
   * One of the two big choices.
   * @param mode Which.
   * @param label Its label.
   * @param hint What it does.
   * @returns Its button.
   */
  #renderMode(mode: SaveChoice['mode'], label: string, hint: string): TemplateResult {
    const on = this.#choice?.mode === mode;
    return html`<button
      type="button"
      class="choice mode"
      data-mode=${mode}
      aria-pressed=${on ? 'true' : 'false'}
      @click=${() => this.#change({ mode })}>
      <span class="dot" aria-hidden="true"></span>
      <span class="choice-text"><b>${label}</b><small>${hint}</small></span>
    </button>`;
  }

  /** @returns The choice as it would be saved, or undefined while nothing is open. */
  #ready(): SaveChoice | undefined {
    const choice = this.#choice;
    if (!this.#host.document || !choice) return undefined;
    return { ...choice, format: this.#resolved(), name: choice.name.trim() };
  }

  /**
   * The button that saves: Replace *name* or Save copy, saying what it will do. In the panel's
   * footer, where Umbraco puts a side panel's actions (design §14.3).
   * @returns The button, or nothing while nothing is open.
   */
  renderAction(): TemplateResult | typeof nothing {
    const host = this.#host;
    const document = host.document;
    const ready = this.#ready();
    if (!document || !ready) return nothing;
    const copy = ready.mode === 'copy';
    return html`<button
      type="button"
      class="button action"
      data-action="save"
      ?disabled=${host.saving || (copy && !ready.name)}
      @click=${() => host.save(ready)}>
      ${copy ? host.words('saveAsSaveCopy') : host.words('saveAsReplace', document.name)}
    </button>`;
  }

  /** @returns Save as's content, without its heading (the panel's title) and its button (the footer's). */
  render(): TemplateResult {
    const host = this.#host;
    const document = host.document;
    const choice = this.#choice;
    if (!document || !choice) return html``;
    const words = host.words.bind(host);
    const copy = choice.mode === 'copy';
    const kept = keepFormatFor(document.extension);
    const format = this.#resolved();
    const withQuality = format !== 'png';
    const where = copy ? choice.folderName : document.folderName;
    const folderLabel = where ?? (choice.folder === null ? words('saveAsRoot') : '');
    const formats: FormatChoice[] = ['keep', ...SAVE_FORMATS];
    return html`
      <p class="muted">${copy ? words('saveAsCopyLede', document.name) : words('saveAsReplaceLede', document.name)}</p>
      <div class="save-as">
        <div class="form">
          <div class="modes">
            ${this.#renderMode('replace', words('saveAsReplace', document.name), words('saveAsReplaceHint'))}
            ${this.#renderMode('copy', words('saveAsCopy'), words('saveAsCopyHint'))}
          </div>
          ${copy
            ? html`<label class="field">
                  <span>${words('saveAsName')}</span>
                  <input
                    type="text"
                    name="name"
                    .value=${choice.name}
                    @input=${(event: Event) => this.#change({ name: (event.target as HTMLInputElement).value })} />
                </label>
                <p class="folder">
                  <span>${words('saveAsFolder', folderLabel)}</span>
                  <button type="button" class="button link" data-action="folder" @click=${() => this.#pickFolder()}>
                    ${words('saveAsChangeFolder')}
                  </button>
                </p>`
            : nothing}
          <div class="field">
            <span id="format-label">${words('saveAsFormat')}</span>
            <div class="formats" role="group" aria-labelledby="format-label">
              ${formats.map(
                (option) => html`<button
                  type="button"
                  class="choice format"
                  data-format=${option}
                  aria-pressed=${this.#format === option ? 'true' : 'false'}
                  ?disabled=${option === 'keep' && !kept}
                  @click=${() => this.#chooseFormat(option)}>
                  ${option === 'keep' ? words('saveAsKeep', formatLabel(document.extension)) : formatLabel(option)}
                </button>`,
              )}
            </div>
          </div>
          ${withQuality
            ? html`<label class="field quality">
                <span>${words('saveAsQuality')} <b>${choice.quality}</b></span>
                <input
                  type="range"
                  name="quality"
                  min="1"
                  max="100"
                  .value=${String(choice.quality)}
                  @input=${(event: Event) => {
                    this.#change({ quality: Number((event.target as HTMLInputElement).value) });
                    this.#measure();
                  }} />
              </label>`
            : nothing}
          <p class="sizes">
            <span class="now">${words('saveAsNow')} <b>${formatBytes(document.bytes, host.lang)}</b></span>
            <span aria-hidden="true">→</span>
            <span class="after"
              >${words('saveAsAfter')}
              <b>${this.#after === undefined ? words('saveAsMeasuring') : formatBytes(this.#after, host.lang)}</b></span
            >
          </p>
        </div>
        <figure class="preview-box">
          ${host.preview ? html`<img class="preview" src=${host.preview} alt="" />` : html`<span class="preview"></span>`}
          <figcaption class="preview-caption muted">${words('saveAsPreview', document.width, document.height)}</figcaption>
        </figure>
      </div>
    `;
  }
}

/** Save as's own styles. */
export const saveAsPageStyles = css`
  .save-as {
    display: flex;
    gap: ${PAGE_GAP}px;
    align-items: flex-start;
    min-width: 0;
  }

  .form {
    flex: 0 0 ${SAVE_AS_FORM_WIDTH}px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .modes,
  .formats {
    display: flex;
    gap: 8px;
  }

  .choice {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 6px 8px;
    font: inherit;
    font-family: var(--umbradesktop-app-font, inherit);
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    text-align: left;
    background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
    border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
    border-radius: var(--umbradesktop-app-radius, 3px);
    cursor: pointer;
  }

  .choice[aria-pressed='true'] {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
  }

  .choice:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .choice:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 1px;
  }

  .mode {
    min-height: 60px;
  }

  .mode .dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px currentColor;
  }

  .mode[aria-pressed='true'] .dot {
    box-shadow: inset 0 0 0 4px currentColor;
  }

  .choice-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .choice-text b,
  .choice-text small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .choice-text small {
    font-size: 12px;
  }

  .format {
    justify-content: center;
    padding: 4px;
    font-size: 13px;
    white-space: nowrap;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .quality input {
    width: 100%;
    accent-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .folder {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .folder > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .button.link {
    flex: none;
    min-height: 32px;
  }

  .sizes {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .preview-box {
    flex: 1 1 ${SAVE_AS_PREVIEW_MIN_WIDTH}px;
    min-width: ${SAVE_AS_PREVIEW_MIN_WIDTH}px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
  }

  .preview {
    display: block;
    width: 100%;
    max-height: 340px;
    object-fit: contain;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  span.preview {
    aspect-ratio: 4 / 3;
  }

  .preview-caption {
    font-size: 13px;
  }
`;
