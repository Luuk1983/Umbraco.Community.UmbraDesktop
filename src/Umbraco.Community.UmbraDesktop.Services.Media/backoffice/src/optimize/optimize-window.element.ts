import { customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues, TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UMBRADESKTOP_MEDIA_CONTEXT } from '../context/media.context-token.js';
import { formatBytes, formatLabel } from '../file-menu/formats.js';
import { filePageStyles } from '../file-menu/styles.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { OPTIMIZE_TAG } from './constants.js';
import { optionsOf } from './remembered.js';
import type { OptimizeSettings } from './remembered.js';
import { reencodes } from './options.js';
import type { OptimizeFormat } from './options.js';
import type { OptimizeRun, OptimizeRunStore, RunItem } from './run-store.js';
import type { SkipReason } from './triage.js';
import type { ImageFacts } from './types.js';
import { optimizeWindowStyles } from './optimize-window.styles.js';

/** The id the window's progress is reported under: one task per window, since a window shows one run. */
const TASK_ID = 'optimize';

/**
 * The settings page's skip lines, in the order they are listed, with their words for one and for many.
 * Animated images are not among them: they are only known once their files are read, during the run.
 */
const SKIP_LINES: ReadonlyArray<[SkipReason, WordKey, WordKey]> = [
  ['folder', 'optimizeSkipFolderOne', 'optimizeSkipFolder'],
  ['not-an-image', 'optimizeSkipNotImageOne', 'optimizeSkipNotImage'],
  ['vector', 'optimizeSkipVectorOne', 'optimizeSkipVector'],
  ['trashed', 'optimizeSkipTrashedOne', 'optimizeSkipTrashed'],
  ['no-file', 'optimizeSkipNoFileOne', 'optimizeSkipNoFile'],
  ['missing', 'optimizeSkipMissingOne', 'optimizeSkipMissing'],
];

/** Why an item was skipped, as its row says it. */
const SKIP_WHY: Record<SkipReason, WordKey> = {
  folder: 'optimizeWhyFolder',
  'no-file': 'optimizeWhyNoFile',
  trashed: 'optimizeWhyTrashed',
  'not-an-image': 'optimizeWhyNotImage',
  vector: 'optimizeWhyVector',
  animated: 'optimizeWhyAnimated',
  missing: 'optimizeWhyMissing',
};

/** Why an item was left as it was, as its row says it. */
const UNCHANGED_WHY: Record<NonNullable<RunItem['unchanged']>, WordKey> = {
  fits: 'optimizeWhyFits',
  'no-metadata': 'optimizeWhyNoMetadata',
  'nothing-asked': 'optimizeWhyNothingAsked',
};

/** The formats Convert offers, in the order the mock draws them. */
const FORMATS: readonly OptimizeFormat[] = ['keep', 'jpeg', 'png', 'webp'];

/** The statuses that count as done, for progress: everything the run has finished with. */
const PROCESSED = new Set<RunItem['status']>(['optimized', 'unchanged', 'failed']);

/**
 * The Optimize images window (#139, design §5): a view of one run in Services.Media's run store, whose
 * id is the window's location. Settings first (scene 2B), which turn into the run's rows when the
 * person presses Optimize (scene 3), and what came of it when the run ends (scenes 4A, 4B).
 *
 * The run is not the window's: it lives in the store, so it outlives the window that started it and
 * the window is only a view of it (§8.3). Closing the window while it runs is Cancel, after the
 * desktop's own question, which the running task asks for (D7); a window reopened after a reload has
 * no run and closes itself (§5.4).
 */
@customElement(OPTIMIZE_TAG)
export class UmbraDesktopOptimizeWindowElement extends UmbLitElement {
  /** The run's id, which the desktop sets from the window's location. */
  @property({ attribute: false })
  location?: string;

  /** The run store; the media context's unless a test sets one. */
  @property({ attribute: false })
  store?: OptimizeRunStore;

  /**
   * Thumbnail addresses for rows; the media context's unless a test sets one.
   * @param uniques The images.
   * @returns Each image's thumbnail, by key.
   */
  @property({ attribute: false })
  thumbnails?: (uniques: string[]) => Promise<Map<string, string>>;

  /**
   * Ask before keeping only the first frame of the animated images (D13). Umbraco's confirm dialog,
   * unless a test answers.
   * @param count How many animated images.
   * @returns True to go on.
   */
  @property({ attribute: false })
  confirmAnimated: (count: number) => Promise<boolean> = async (count) => {
    try {
      await umbConfirmModal(this, {
        headline: this.#words('optimizeAnimatedHeadline'),
        content: count === 1 ? this.#words('optimizeAnimatedQuestionOne') : this.#words('optimizeAnimatedQuestion', count),
        confirmLabel: this.#words('optimizeAnimatedConfirm'),
        color: 'warning',
      });
      return true;
    } catch {
      return false;
    }
  };

  /** The run, as the store last published it. */
  @state()
  private _run?: OptimizeRun;

  /** Thumbnail addresses, by key. */
  @state()
  private _thumbs = new Map<string, string>();

  /** The package's words, with the English dictionary as the fallback. */
  readonly #words = wordsOf(this.localize);

  /** The run id the window is bound to, so a new location binds again. */
  #bound?: string;

  /** Whether the window has asked to close, so it asks once. */
  #closing = false;

  /** The last task report, so the same one is not sent again. */
  #reported?: string;

  /** The pass whose failures the person has seen, which ends the failure state on the taskbar (§5.3). */
  #seenPass = 0;

  /** The title last sent. */
  #title?: string;

  /** Each item's status when thumbnails were last read, so a saved image's thumbnail is read again. */
  #thumbStatus = new Map<number, RunItem['status']>();

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_MEDIA_CONTEXT, (context) => {
      if (!context) return;
      this.store ??= context.optimizeRuns;
      this.thumbnails ??= (uniques) => context.optimizeThumbnails(uniques);
    });
    // Looked at: a click into the window, or the desktop giving it the keyboard as it comes forward.
    const seen = () => this.#seen();
    this.addEventListener('pointerdown', seen);
    this.addEventListener('focusin', seen);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // The window closed: before the run, it ends not started; while it runs, it stops after the image
    // in hand (D7); once ended, it is dropped.
    if (this.#bound) this.store?.release(this.#bound);
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if ((changed.has('location') || changed.has('store')) && this.store && this.location && this.location !== this.#bound) {
      this.#bound = this.location;
      this.observe(this.store.observe(this.location), (run) => this.#onRun(run), 'umbraDesktopOptimizeRun');
    }
  }

  /**
   * The run changed: draw it, name the window after it, report its progress, and read thumbnails.
   * @param run The run, or undefined when there is none.
   */
  #onRun(run: OptimizeRun | undefined): void {
    this._run = run;
    if (!run) {
      this.#close();
      return;
    }
    if (run.title && run.title !== this.#title) {
      this.#title = run.title;
      this.dispatchEvent(new CustomEvent('umbradesktop-app-title', { detail: { title: run.title }, bubbles: true, composed: true }));
    }
    this.#report();
    void this.#readThumbnails(run);
  }

  /** Ask the desktop to close the window, once. */
  #close(): void {
    if (this.#closing) return;
    this.#closing = true;
    this.dispatchEvent(new CustomEvent('umbradesktop-close-request', { bubbles: true, composed: true }));
  }

  /**
   * The images the run optimizes: everything not skipped.
   * @param run The run.
   * @returns Those items.
   */
  #images(run: OptimizeRun): RunItem[] {
    return run.items.filter((item) => item.status !== 'skipped');
  }

  /**
   * Tell the desktop where the run is (`window-progress.md` §1): running while it runs, failed after a
   * pass with failures until the window is looked at, and done otherwise.
   */
  #report(): void {
    const run = this._run;
    if (!run) return;
    const images = this.#images(run);
    const failed = images.filter((item) => item.status === 'failed').length;
    const detail =
      run.phase === 'running'
        ? {
            id: TASK_ID,
            state: 'running',
            completed: images.filter((item) => PROCESSED.has(item.status)).length,
            total: images.length,
            failed,
            label: this.#words('optimizeTaskLabel'),
          }
        : run.phase === 'ended' && failed && this.#seenPass !== run.pass
          ? { id: TASK_ID, state: 'failed', failed, total: images.length }
          : { id: TASK_ID, state: 'done' };
    const signature = JSON.stringify(detail);
    if (signature === this.#reported) return;
    if (!this.#reported && detail.state === 'done') {
      this.#reported = signature;
      return;
    }
    this.#reported = signature;
    this.dispatchEvent(new CustomEvent('umbradesktop-task', { detail, bubbles: true, composed: true }));
  }

  /** The person looked at the window: the failure on the taskbar has been seen. */
  #seen(): void {
    const run = this._run;
    if (!run || run.phase !== 'ended') return;
    this.#seenPass = run.pass;
    this.#report();
  }

  /**
   * Read thumbnails for the images not read yet, and again for each one saved since.
   * @param run The run.
   */
  async #readThumbnails(run: OptimizeRun): Promise<void> {
    if (!this.thumbnails || run.phase === 'preparing') return;
    const wanted = new Set<string>();
    run.items.forEach((item, index) => {
      if (item.status === 'skipped') return;
      const before = this.#thumbStatus.get(index);
      if (before === undefined || (item.status === 'optimized' && before !== 'optimized')) wanted.add(item.unique);
      this.#thumbStatus.set(index, item.status);
    });
    if (!wanted.size) return;
    try {
      const found = await this.thumbnails([...wanted]);
      if (found.size) this._thumbs = new Map([...this._thumbs, ...found]);
    } catch {
      // Rows without thumbnails still say everything.
    }
  }

  /**
   * Change the settings.
   * @param change What changes.
   */
  #change(change: Partial<OptimizeSettings>): void {
    const run = this._run;
    if (!run || !this.store) return;
    this.store.update(run.id, { ...run.settings, ...change });
  }

  /** Cancel on the settings: the run ends not started, and the window closes. */
  #cancelSettings(): void {
    if (this.#bound) this.store?.release(this.#bound);
    this.#close();
  }

  /** Keep only the first frame of the animated images, after asking (D13). */
  async #runAnimated(): Promise<void> {
    const run = this._run;
    if (!run || !this.store) return;
    const count = run.items.filter((item) => item.status === 'skipped' && item.skip === 'animated').length;
    if (count && (await this.confirmAnimated(count))) this.store.runAnimated(run.id);
  }

  override render() {
    const run = this._run;
    if (!run || run.phase === 'preparing') return html`<p class="preparing muted">${this.#words('optimizePreparing')}</p>`;
    return run.phase === 'settings' ? this.#renderSettings(run) : this.#renderRun(run);
  }

  /**
   * The settings page (scenes 2B, 2C): what will be skipped, the three switches, where the result goes,
   * and the button that says what it does.
   * @param run The run.
   * @returns The page.
   */
  #renderSettings(run: OptimizeRun): TemplateResult {
    const words = this.#words;
    const settings = run.settings;
    const count = this.#images(run).length;
    const locked = reencodes(optionsOf({ ...settings, removeMetadata: false }));
    const asked = optionsOf(settings);
    const nothingAsked = !reencodes(asked) && !asked.removeMetadata;
    const qualityOff = !settings.convert || settings.format === 'png';
    const usage = settings.save === 'replace' && run.usage && run.usage.images ? run.usage : undefined;
    return html`<div class="page settings">
      <header class="head">
        <h2 class="heading">${count === 0 ? words('optimizeHeadingNone') : count === 1 ? words('optimizeHeadingOne') : words('optimizeHeading', count)}</h2>
        <div class="skips muted">${this.#renderSkips(run)}</div>
      </header>
      <div class="body">
        <section class="group resize">
          ${this.#renderSwitch('resize', words('optimizeResize'), settings.resize, false, () => this.#change({ resize: !settings.resize }))}
          <div class="group-body" ?inert=${!settings.resize}>
            <div class="row-fields">
              ${this.#renderLimit('maxWidth', words('optimizeMaxWidth'), settings.maxWidth, !settings.resize)}
              ${this.#renderLimit('maxHeight', words('optimizeMaxHeight'), settings.maxHeight, !settings.resize)}
            </div>
            <p class="hint muted">${words('optimizeResizeHint')}</p>
          </div>
        </section>
        <section class="group convert">
          ${this.#renderSwitch('convert', words('optimizeConvert'), settings.convert, false, () => this.#change({ convert: !settings.convert }))}
          <div class="group-body" ?inert=${!settings.convert}>
            <div class="row-fields">
              <span class="label" id="format-label">${words('optimizeFormat')}</span>
              <span class="formats" role="group" aria-labelledby="format-label">
                ${FORMATS.map(
                  (format) => html`<button
                    type="button"
                    class="choice format"
                    data-format=${format}
                    aria-pressed=${settings.format === format ? 'true' : 'false'}
                    ?disabled=${!settings.convert}
                    @click=${() => this.#change({ format })}>
                    ${format === 'keep' ? words('optimizeKeep') : formatLabel(format)}
                  </button>`,
                )}
              </span>
            </div>
            <div class="row-fields quality" title=${settings.format === 'png' ? words('optimizeQualityPng') : nothing}>
              <label class="label" for="quality">${words('optimizeQuality')}</label>
              <input
                id="quality"
                type="range"
                name="quality"
                min="1"
                max="100"
                .value=${String(settings.quality)}
                ?disabled=${qualityOff}
                @input=${(event: Event) => this.#change({ quality: Number((event.target as HTMLInputElement).value) })} />
              <input
                type="number"
                name="qualityNumber"
                min="1"
                max="100"
                aria-label=${words('optimizeQuality')}
                .value=${String(settings.quality)}
                ?disabled=${qualityOff}
                @change=${(event: Event) => {
                  const value = Math.round(Number((event.target as HTMLInputElement).value));
                  if (value >= 1 && value <= 100) this.#change({ quality: value });
                  else this.requestUpdate();
                }} />
            </div>
            <p class="hint muted">${words('optimizeConvertHint')}</p>
          </div>
        </section>
        <section class="group metadata">
          ${this.#renderSwitch('metadata', words('optimizeMetadata'), locked || settings.removeMetadata, locked, () =>
            this.#change({ removeMetadata: !settings.removeMetadata }),
          )}
          <div class="group-body">
            <p class="hint muted">${locked ? words('optimizeMetadataLocked') : words('optimizeMetadataLossless')}</p>
          </div>
        </section>
        <section class="group save">
          <h3 class="group-title">${words('optimizeSave')}</h3>
          <div class="group-body flush">
            ${this.#renderSave('replace', words('optimizeReplace'))}
            ${usage ? html`<p class="usage">${this.#usageWords(usage)}</p>` : nothing}
            ${this.#renderSave('copy', words('optimizeCopies'), words('optimizeCopiesHint'))}
          </div>
        </section>
      </div>
      <footer class="foot">
        <button type="button" class="button" data-action="cancel" @click=${() => this.#cancelSettings()}>${words('optimizeCancel')}</button>
        <button
          type="button"
          class="button action"
          data-action="start"
          ?disabled=${nothingAsked || count === 0}
          @click=${() => this.store?.start(run.id)}>
          ${count === 1 ? words('optimizeStartOne') : words('optimizeStart', count)}
        </button>
      </footer>
    </div>`;
  }

  /**
   * The lines under the heading that say what is skipped, one per reason.
   * @param run The run.
   * @returns The lines.
   */
  #renderSkips(run: OptimizeRun) {
    return SKIP_LINES.map(([reason, one, many]) => {
      const count = run.items.filter((item) => item.skip === reason).length;
      return count ? html`<p>${count === 1 ? this.#words(one) : this.#words(many, count)}</p>` : nothing;
    });
  }

  /**
   * The warning before replacing images used elsewhere (design §5.1).
   * @param usage How many images, and how many places.
   * @param usage.images How many of the images are used.
   * @param usage.places In how many places in all.
   * @returns The words.
   */
  #usageWords(usage: { images: number; places: number }): string {
    if (usage.images > 1) return this.#words('optimizeUsage', usage.images, usage.places);
    return usage.places === 1 ? this.#words('optimizeUsageOnePlace') : this.#words('optimizeUsageOne', usage.places);
  }

  /**
   * A switch heading a group.
   * @param name Its name, for tests and labels.
   * @param label What it switches.
   * @param checked Whether it is on.
   * @param disabled Whether it is locked.
   * @param toggle What a press does.
   * @returns The switch.
   */
  #renderSwitch(name: string, label: string, checked: boolean, disabled: boolean, toggle: () => void): TemplateResult {
    return html`<button
      type="button"
      class="switch"
      role="switch"
      data-switch=${name}
      aria-checked=${checked ? 'true' : 'false'}
      ?disabled=${disabled}
      @click=${toggle}>
      <span class="track" aria-hidden="true"><span class="knob"></span></span>
      <span class="switch-label">${label}</span>
    </button>`;
  }

  /**
   * A size limit: a number of pixels, or empty for no limit on that side.
   * @param name Which.
   * @param label Its label.
   * @param value Its value.
   * @param disabled Whether Resize is off.
   * @returns The field.
   */
  #renderLimit(name: 'maxWidth' | 'maxHeight', label: string, value: number | null, disabled: boolean): TemplateResult {
    return html`<label class="limit">
      <span class="label">${label}</span>
      <input
        type="number"
        name=${name}
        min="1"
        step="1"
        placeholder=${this.#words('optimizeNoLimit')}
        .value=${value === null ? '' : String(value)}
        ?disabled=${disabled}
        @change=${(event: Event) => {
          const raw = (event.target as HTMLInputElement).value.trim();
          const number = Math.round(Number(raw));
          this.#change({ [name]: raw === '' || !(number >= 1) ? null : number });
        }} />
      <span class="unit muted">${this.#words('optimizePixels')}</span>
    </label>`;
  }

  /**
   * One of the two ways to save.
   * @param mode Which.
   * @param label Its label.
   * @param hint What it does, when it needs saying.
   * @returns The choice.
   */
  #renderSave(mode: OptimizeSettings['save'], label: string, hint?: string): TemplateResult {
    const chosen = this._run?.settings.save === mode;
    return html`<button type="button" class="radio" data-save=${mode} aria-pressed=${chosen ? 'true' : 'false'} @click=${() => this.#change({ save: mode })}>
      <span class="dot" aria-hidden="true"></span>
      <span class="radio-text"><span>${label}</span>${hint ? html`<small class="muted">${hint}</small>` : nothing}</span>
    </button>`;
  }

  /**
   * The run as it goes and once it ended (scenes 3, 4A, 4B).
   * @param run The run.
   * @returns The page.
   */
  #renderRun(run: OptimizeRun): TemplateResult {
    const images = this.#images(run);
    const done = images.filter((item) => PROCESSED.has(item.status)).length;
    const failed = images.some((item) => item.status === 'failed');
    const fraction = images.length ? done / images.length : 1;
    return html`<div class="page run">
      <header class="head run-head">
        <h2 class="heading">${this.#heading(run, images, done)}</h2>
        <span class="actions">${this.#renderActions(run)}</span>
      </header>
      <div class="bar" ?failed=${run.phase === 'ended' && failed}><span style="width: ${fraction * 100}%"></span></div>
      <p class="meta">${this.#meta(run, images, done)}</p>
      <p class="sets muted">${this.#setsLine(run.settings)}</p>
      <div class="rows">${repeat(
        run.items,
        (_item, index) => index,
        (item) => this.#renderRow(item),
      )}</div>
    </div>`;
  }

  /**
   * The run's heading: what it is doing, or what came of it.
   * @param run The run.
   * @param images Its images.
   * @param done How many it has finished with.
   * @returns The heading's words.
   */
  #heading(run: OptimizeRun, images: RunItem[], done: number): string {
    const words = this.#words;
    if (run.phase === 'running') {
      if (run.cancelling) return words('optimizeCancelling');
      return images.length === 1 ? words('optimizeRunningOne') : words('optimizeRunning', images.length);
    }
    if (run.outcome === 'cancelled') return words('optimizeCancelledAfter', done, images.length);
    const count = (status: RunItem['status']) => images.filter((item) => item.status === status).length;
    const parts = [
      count('optimized') ? words('optimizeEndedOptimized', count('optimized')) : '',
      count('unchanged') ? words('optimizeEndedUnchanged', count('unchanged')) : '',
      count('failed') ? words('optimizeEndedFailed', count('failed')) : '',
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : words('optimizeEndedNothing');
  }

  /**
   * The line under the bar: how far, and what was saved.
   * @param run The run.
   * @param images Its images.
   * @param done How many it has finished with.
   * @returns The line.
   */
  #meta(run: OptimizeRun, images: RunItem[], done: number): TemplateResult {
    const words = this.#words;
    const lang = this.localize.lang();
    let before = 0;
    let after = 0;
    for (const item of images) {
      if (item.status !== 'optimized' || !item.before || !item.after) continue;
      before += item.before.size;
      after += item.after.size;
    }
    const saved = before - after;
    const size = formatBytes(Math.abs(saved), lang);
    if (run.phase === 'running') {
      return html`<b>${words('optimizeProgress', done, images.length)}</b> · ${words('optimizeSavedSoFar', size)}`;
    }
    if (saved < 0) return html`<b>${words('optimizeGrew', size)}</b>`;
    const percent = before ? Math.round((saved / before) * 100) : 0;
    const optimized = images.filter((item) => item.status === 'optimized').length;
    return run.outcome === 'cancelled'
      ? html`<b>${words('optimizeSaved', size)}</b>. ${words('optimizeDoneStay', optimized)}`
      : html`<b>${words('optimizeSavedOf', size, `${percent}%`)}</b>`;
  }

  /**
   * One line restating the settings the run went with.
   * @param settings The settings.
   * @returns The line.
   */
  #setsLine(settings: OptimizeSettings): string {
    const words = this.#words;
    const options = optionsOf(settings);
    const parts: string[] = [];
    if (options.resize) {
      parts.push(words('optimizeSetsResize', options.resize.maxWidth ?? words('optimizeSetsAny'), options.resize.maxHeight ?? words('optimizeSetsAny')));
    }
    if (options.format !== 'keep') {
      parts.push(options.format === 'png' ? formatLabel('png') : words('optimizeSetsFormat', formatLabel(options.format), options.quality));
    }
    if (options.removeMetadata) parts.push(words('optimizeSetsMetadata'));
    parts.push(settings.save === 'copy' ? words('optimizeSetsCopies') : words('optimizeSetsReplace'));
    return parts.join(' · ');
  }

  /**
   * The run's buttons: Cancel while it runs; afterwards whichever further pass applies, and Close.
   * @param run The run.
   * @returns The buttons.
   */
  #renderActions(run: OptimizeRun) {
    const words = this.#words;
    if (run.phase === 'running') {
      return html`<button type="button" class="button" data-action="cancel-run" ?disabled=${run.cancelling} @click=${() => this.store?.cancel(run.id)}>
        ${words('optimizeCancel')}
      </button>`;
    }
    const failed = run.items.some((item) => item.status === 'failed');
    const rest = run.items.some((item) => item.status === 'not-started');
    const animated = run.items.some((item) => item.status === 'skipped' && item.skip === 'animated');
    return html`${animated
        ? html`<button type="button" class="button" data-action="animated" @click=${() => void this.#runAnimated()}>${words('optimizeAnimated')}</button>`
        : nothing}
      ${failed ? html`<button type="button" class="button" data-action="retry" @click=${() => this.store?.retryFailed(run.id)}>${words('optimizeRetryFailed')}</button>` : nothing}
      ${rest ? html`<button type="button" class="button" data-action="rest" @click=${() => this.store?.runRest(run.id)}>${words('optimizeRunRest')}</button>` : nothing}
      <button type="button" class="button primary" data-action="close" @click=${() => this.#close()}>${words('optimizeClose')}</button>`;
  }

  /**
   * An image's facts as a row writes them: "6000 × 4000 JPEG, 8.4 MB".
   * @param facts The facts.
   * @returns The words.
   */
  #facts(facts: ImageFacts): string {
    return `${facts.width} × ${facts.height} ${formatLabel(facts.format)}, ${formatBytes(facts.size, this.localize.lang())}`;
  }

  /**
   * One item's row: its thumbnail, its name, what it was and is, and where it is.
   * @param item The item.
   * @returns The row.
   */
  #renderRow(item: RunItem): TemplateResult {
    const words = this.#words;
    const thumb = this._thumbs.get(item.unique);
    let detail: string | TemplateResult = '';
    if (item.status === 'optimized' && item.before && item.after) {
      detail = html`${this.#facts(item.before)} <span class="arrow">→</span> ${this.#facts(item.after)}`;
    } else if (item.status === 'unchanged' && item.before && item.unchanged) {
      detail = `${this.#facts(item.before)}. ${words(UNCHANGED_WHY[item.unchanged])}`;
    } else if (item.status === 'skipped' && item.skip) {
      detail = words(SKIP_WHY[item.skip]);
    } else if (item.before) {
      detail = this.#facts(item.before);
    }
    return html`<div class="row" data-status=${item.status}>
      <span class="thumb">${thumb ? html`<img src=${thumb} alt="" />` : html`<uui-icon name=${item.skip === 'folder' ? 'icon-folder' : 'icon-picture'}></uui-icon>`}</span>
      <span class="name">
        <b>${item.name}</b>
        ${detail ? html`<small class="muted">${detail}</small>` : nothing}
        ${item.status === 'failed' && item.message ? html`<em>${item.message}</em>` : nothing}
      </span>
      <span class="status">${this.#renderStatus(item)}</span>
    </div>`;
  }

  /**
   * Where an item is, at the row's end: the percentage saved, a small bar, or a word.
   * @param item The item.
   * @returns The status.
   */
  #renderStatus(item: RunItem): TemplateResult {
    const words = this.#words;
    switch (item.status) {
      case 'optimized': {
        // A file that is still there never shrank by 100%: a 41.7 MB PNG at 21 KB rounds to it (§15).
        const rounded = item.before && item.after && item.before.size ? Math.round((item.after.size / item.before.size - 1) * 100) : 0;
        const change = item.after?.size ? Math.max(rounded, -99) : rounded;
        return change <= 0
          ? html`<span class="saved"><uui-icon name="icon-check"></uui-icon>−${Math.abs(change)}%</span>`
          : html`<span class="grew"><uui-icon name="icon-alert"></uui-icon>+${change}%</span>`;
      }
      case 'running':
        return html`<span class="mini" aria-hidden="true"><span></span></span>${words('optimizeSaving')}`;
      case 'waiting':
        return html`${words('optimizeWaiting')}`;
      case 'skipped':
        return html`${words('optimizeSkipped')}`;
      case 'unchanged':
        return html`${words('optimizeUnchanged')}`;
      case 'failed':
        return html`<span class="bad"><uui-icon name="icon-alert"></uui-icon>${words('optimizeFailed')}</span>`;
      default:
        return html`${words('optimizeNotStarted')}`;
    }
  }

  static override styles = [filePageStyles, optimizeWindowStyles];
}

export default UmbraDesktopOptimizeWindowElement;
export { UmbraDesktopOptimizeWindowElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-optimize-images': UmbraDesktopOptimizeWindowElement;
  }
}
