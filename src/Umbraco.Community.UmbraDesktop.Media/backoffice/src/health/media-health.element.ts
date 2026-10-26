import { css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMBRADESKTOP_MEDIA_HEALTH_CONTEXT } from './media-health.context.js';
import type { UmbraDesktopMediaHealthContext, UmbraDesktopMediaHealthResult, UmbraDesktopMediaHealthState } from './media-health.context.js';
import type { HealthItem, HealthOrphan } from './health.client.js';
import { OVERSIZED_BYTES, checkedOn, estimateSaving, isImage, sizeOfAll } from './health-model.js';
import type { HealthSegment } from './health-model.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { UMBRADESKTOP_OPEN_ITEM_KEY, editPath } from '../manager/open-item.js';
import { findDesktopWindows, findOnDesktop } from '../edit-image/desktop-windows.js';
import { UMBRADESKTOP_IMAGE_EDITOR_APP } from '../image-editor/constants.js';
import { OPTIMIZE_SERVICE_CONTEXT } from '../shared/optimize-service.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';

/** What the window shows: the overview, or one category as a list. */
type HealthView = 'overview' | 'unused' | 'orphaned' | 'oversized';

/** The task id the check is reported to the desktop under. */
const CHECK_TASK = 'check';

/**
 * The shades of the bar, darkest for the largest folder and lightest for Other: the mock's five, as
 * tints of the app's accent so a theme colours them. The fifth is Other.
 */
const SEGMENT_SHADES = [1, 0.75, 0.55, 0.35, 0.18] as const;

/** The words of each row: its heading, its count line, its empty line, and its icon. */
const ROWS: Record<Exclude<HealthView, 'overview'>, { title: WordKey; count: WordKey; none: WordKey; icon: string }> = {
  unused: { title: 'healthUnused', count: 'healthItemsSize', none: 'healthNoneUnused', icon: 'icon-unlink' },
  orphaned: { title: 'healthOrphaned', count: 'healthFilesSize', none: 'healthNoneOrphaned', icon: 'icon-folder-open' },
  oversized: { title: 'healthOversized', count: 'healthImagesSize', none: 'healthNoneOversized', icon: 'icon-fullscreen' },
};

/**
 * The Media Health window (design §3, mock scenes 1 and 2): the library in one line, a bar of the
 * top-level folders by size, and three rows, unused media, orphaned files and oversized images, each
 * with its count, its size and its verbs. **Check** asks the add-on's server to run one (design §15),
 * through the health context, which follows it and keeps the result on the desktop, so this window
 * only shows and asks.
 *
 * **View** lists a category inside the window, largest first, until step 6 opens it as a place in the
 * Manager. An item opens beside the window as the Manager opens one; an image also has Edit image.
 * Trash is core's, through the Manager's own operation (design §5); Delete on orphaned files is
 * the server's, for an administrator. **Review** is step 3 and is shown greyed with "Coming later",
 * since a verb that disappears is a bug and one that is coming is a promise.
 */
@customElement('umbradesktop-media-health')
export class UmbraDesktopMediaHealthElement extends UmbLitElement {
  /**
   * Ask before deleting orphaned files. A property so a test can answer for the person.
   * @param files The files about to go.
   * @returns True to delete.
   */
  @property({ attribute: false })
  confirmDelete: (files: ReadonlyArray<HealthOrphan>) => Promise<boolean> = async (files) => {
    try {
      await umbConfirmModal(this, {
        headline: this.#words('healthDeleteHeadline', files.length),
        content: this.#words('healthDeleteText', files.length, formatBytes(sizeOfAll(files))),
        confirmLabel: this.#words('healthDeleteConfirm'),
        color: 'danger',
      });
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Ask before moving an item to the recycle bin, in core's own words. A property so a test can answer.
   * @param name The item's name.
   * @returns True to trash.
   */
  @property({ attribute: false })
  confirmTrash: (name: string) => Promise<boolean> = async (name) => {
    try {
      await umbConfirmModal(this, {
        headline: '#actions_trash',
        content: this.localize.string('#defaultdialogs_confirmTrash', name),
        confirmLabel: '#actions_trash',
        color: 'danger',
      });
      return true;
    } catch {
      return false;
    }
  };

  /** Where the check is, and the last result. */
  @state()
  private _state: UmbraDesktopMediaHealthState = { phase: { kind: 'idle' }, result: undefined };

  /** What the window shows. */
  @state()
  private _view: HealthView = 'overview';

  /** Whether the person is an administrator, who alone may delete files from disk. */
  @state()
  private _admin = false;

  /** What just happened, under the rows. */
  @state()
  private _notice = '';

  /** Whether a delete or a trash is under way, which holds the buttons. */
  @state()
  private _busy = false;

  /** The health context. */
  #context?: UmbraDesktopMediaHealthContext;

  /** The last task reported, so the desktop is told only when it changes. */
  #reported = '';

  /** This package's words. */
  #words = wordsOf(this.localize);

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_MEDIA_HEALTH_CONTEXT, (context) => {
      this.#context = context ?? undefined;
      if (!context) return;
      this.observe(
        context.state,
        (state) => {
          this._state = state;
          this.#report();
        },
        'umbradesktopHealthState',
      );
      void context.sync();
    });
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (user) => {
      this.observe(user?.currentUser, (current) => (this._admin = !!current?.isAdmin), 'umbradesktopHealthUser');
    });
  }

  /**
   * Tell the desktop where the check is, so the title bar and the taskbar button show it: a real
   * percentage while the library is read, since the server counts as it goes, and activity while the
   * disk is walked, whose file count is not known before the walk. A failure stays until the next
   * check replaces it.
   */
  #report(): void {
    const { phase } = this._state;
    const detail =
      phase.kind === 'running'
        ? phase.total > 0
          ? { id: CHECK_TASK, state: 'running', completed: phase.scanned, total: phase.total, label: `#umbraDesktopMedia_healthChecking` }
          : { id: CHECK_TASK, state: 'running', label: `#umbraDesktopMedia_healthChecking` }
        : phase.kind === 'failed'
          ? { id: CHECK_TASK, state: 'failed', failed: 1, total: 1 }
          : { id: CHECK_TASK, state: 'done' };
    const signature = JSON.stringify(detail);
    if (signature === this.#reported) return;
    this.#reported = signature;
    this.dispatchEvent(new CustomEvent('umbradesktop-task', { detail, bubbles: true, composed: true }));
  }

  /** Start a check. */
  #check(): void {
    this._notice = '';
    void this.#context?.check();
  }

  /**
   * Open an item beside the window, as the Manager opens one (`open-item.ts`).
   * @param item The item.
   */
  #open(item: HealthItem): void {
    this.dispatchEvent(
      new CustomEvent<UmbraDesktopOpenAttachedDetail>('umbradesktop-open-attached', {
        detail: { key: UMBRADESKTOP_OPEN_ITEM_KEY, path: editPath(item.key), name: item.name, icon: isImage(item) ? 'icon-picture' : 'icon-document' },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Open the Image Editor on an image, as Edit image does.
   * @param item The image.
   */
  #edit(item: HealthItem): void {
    findDesktopWindows(this)?.openApp(UMBRADESKTOP_IMAGE_EDITOR_APP, { location: item.key, reuse: true });
  }

  /**
   * Move an item to the recycle bin, after asking: core's trash, through the Manager.
   * @param item The item.
   */
  async #trash(item: HealthItem): Promise<void> {
    if (this._busy || !(await this.confirmTrash(item.name))) return;
    this._busy = true;
    try {
      const { failed } = (await this.#context?.trash([item.key])) ?? { failed: [item.key] };
      this._notice = failed.length ? this.#words('healthTrashFailed', item.name) : '';
    } finally {
      this._busy = false;
    }
  }

  /**
   * Delete orphaned files from disk, after asking.
   * @param files The files; every orphaned file from the row's Delete, one from a list row.
   */
  async #delete(files: ReadonlyArray<HealthOrphan>): Promise<void> {
    if (this._busy || !files.length || !(await this.confirmDelete(files))) return;
    this._busy = true;
    try {
      const outcome = await this.#context?.deleteOrphaned(files.map((file) => file.relativePath));
      if (!outcome) return;
      if ('error' in outcome) this._notice = this.#words(outcome.error === 'denied' ? 'healthDeleteDenied' : 'healthDeleteFailed');
      else {
        const skipped = outcome.skipped.length ? ' ' + this.#words('healthDeleteSkipped', outcome.skipped.length, outcome.skipped.map((each) => `${each.relativePath} (${each.reason})`).join(', ')) : '';
        this._notice = this.#words('healthDeleted', outcome.deleted) + skipped;
      }
    } finally {
      this._busy = false;
    }
  }

  /**
   * Hand the oversized images to Optimize images (#139), in a window of the media service's, and
   * take their new sizes from its report when the run ends.
   */
  async #optimize(): Promise<void> {
    const oversized = this._state.result?.oversized ?? [];
    const service = findOnDesktop(this, OPTIMIZE_SERVICE_CONTEXT);
    if (!oversized.length || !service) return;
    const report = await service.optimizeMedia({ items: oversized.map((each) => each.key), title: this.#words('healthOversized') }).catch(() => undefined);
    const sizes = (report?.items ?? []).filter((each) => each.status === 'optimized' && each.after).map((each) => ({ unique: each.unique, sizeBytes: each.after!.size }));
    if (sizes.length) this.#context?.resized(sizes);
  }

  override render() {
    if (this._view !== 'overview') return this.#renderList(this._view);
    const { phase, result } = this._state;
    return html`
      ${phase.kind === 'running' ? this.#renderProgress(phase.step, phase.scanned, phase.total) : result ? this.#renderSummary(result) : this.#renderNoCheck()}
      ${phase.kind === 'failed' ? html`<p class="failed">${this.#words('healthFailed', phase.message)}</p>` : nothing}
      ${result ? this.#renderBar(result.segments) : nothing}
      ${result ? html`<div class="rows" ?dim=${phase.kind === 'running'}>${this.#renderRow('unused', result)}${this.#renderRow('orphaned', result)}${this.#renderRow('oversized', result)}</div>` : nothing}
      ${this._notice ? html`<p class="notice">${this._notice}</p>` : nothing}
      <footer>
        <uui-icon name="icon-info"></uui-icon>
        <span>${phase.kind === 'running' ? this.#words('healthRunningNote') : this.#words('healthCredit')}</span>
      </footer>
    `;
  }

  /** Before the first check: what the app does, and Check. */
  #renderNoCheck() {
    return html`<div class="summary">
      <div class="big">
        ${this.#words('healthNoCheck')}
        <small>${this.#words('healthNoCheckText')}</small>
      </div>
      <div class="when">
        <uui-button look="primary" label=${this.#words('healthCheck')} @click=${this.#check}><uui-icon name="icon-refresh"></uui-icon>${this.#words('healthCheck')}</uui-button>
      </div>
    </div>`;
  }

  /**
   * The library in one line, and when it was checked, with Check again.
   * @param result The last check.
   */
  #renderSummary(result: UmbraDesktopMediaHealthResult) {
    // In the backoffice's own culture, as the taskbar clock is by default: the headless check came
    // out as "18:41" beside a clock saying "6:41 PM" when this read the browser's locale instead.
    const on = checkedOn(result.checkedAt, new Date(), this.localize.lang() || undefined);
    const day = on.day === 'today' ? this.#words('healthToday') : on.day === 'yesterday' ? this.#words('healthYesterday') : on.day;
    return html`<div class="summary">
      <div class="big">
        ${formatBytes(result.library.sizeBytes)}
        <small>${this.#words('healthLibraryLine', result.library.items.toLocaleString(), result.library.folders.toLocaleString())}</small>
      </div>
      <div class="when">
        <span>${this.#words('healthChecked', day, on.time)}</span>
        <uui-button compact look="secondary" label=${this.#words('healthCheckAgain')} @click=${this.#check}><uui-icon name="icon-refresh"></uui-icon>${this.#words('healthCheckAgain')}</uui-button>
      </div>
    </div>`;
  }

  /**
   * The check running: what it is doing now, how far it is when that is known, and a bar that fills
   * when it is and moves when it is not.
   * @param step Which part runs.
   * @param scanned What the step has done.
   * @param total What it has to do; 0 when not known.
   */
  #renderProgress(step: 'usage' | 'disk' | 'loading', scanned: number, total: number) {
    const stepKey: WordKey = step === 'usage' ? 'healthStepUsage' : step === 'disk' ? 'healthStepDisk' : 'healthStepLoading';
    const counted = total > 0;
    // Counts in the backoffice's culture, as the checked time is, so the window agrees with the taskbar clock.
    const locale = this.localize.lang() || undefined;
    return html`<div class="progress">
      <div class="pt">
        <span>${this.#words('healthChecking')}</span>
        <span>${this.#words(stepKey)}${counted ? html` · ${this.#words('healthProgressItems', scanned.toLocaleString(locale), total.toLocaleString(locale))}` : nothing}</span>
      </div>
      <uui-loader-bar progress=${counted ? Math.round((scanned / total) * 100) : nothing}></uui-loader-bar>
    </div>`;
  }

  /**
   * The bar: the top-level folders by size, and a legend.
   * @param segments The segments.
   */
  #renderBar(segments: ReadonlyArray<HealthSegment>) {
    const total = segments.reduce((sum, segment) => sum + segment.sizeBytes, 0) || 1;
    const shade = (index: number, segment: HealthSegment) => SEGMENT_SHADES[segment.other ? SEGMENT_SHADES.length - 1 : Math.min(index, SEGMENT_SHADES.length - 2)];
    const name = (segment: HealthSegment) => (segment.other ? this.#words('healthOther') : segment.name);
    return html`<div class="bar">
      <div class="segs">
        ${segments.map((segment, index) => html`<span style="width:${(segment.sizeBytes / total) * 100}%;opacity:${shade(index, segment)}" title="${name(segment)} ${formatBytes(segment.sizeBytes)}"></span>`)}
      </div>
      <div class="legend">
        ${segments.map((segment, index) => html`<span><i style="opacity:${shade(index, segment)}"></i>${name(segment)} ${formatBytes(segment.sizeBytes)}</span>`)}
      </div>
    </div>`;
  }

  /**
   * One row: its heading, its count line and its verbs.
   * @param kind Which row.
   * @param result The last check.
   */
  #renderRow(kind: Exclude<HealthView, 'overview'>, result: UmbraDesktopMediaHealthResult) {
    const words = ROWS[kind];
    const list = result[kind];
    const size = formatBytes(sizeOfAll(list));
    const count = this.#words(words.count, list.length.toLocaleString(), size);
    const text =
      kind === 'oversized'
        ? list.length
          ? this.#words('healthOversizedText', '', formatBytes(OVERSIZED_BYTES), formatBytes(estimateSaving(sizeOfAll(list))))
          : this.#words('healthNoneOversized', formatBytes(OVERSIZED_BYTES))
        : list.length
          ? this.#words(kind === 'unused' ? 'healthUnusedText' : 'healthOrphanedText', '')
          : this.#words(words.none);
    return html`<div class="row" data-row=${kind}>
      <uui-icon class="row-icon" name=${words.icon}></uui-icon>
      <span class="row-text">
        <b>${this.#words(words.title)}</b>
        <small>${list.length ? html`<em>${count}</em>` : nothing}${text}</small>
      </span>
      <span class="row-actions">
        <uui-button compact look="secondary" label=${this.#words('healthView')} ?disabled=${!list.length} @click=${() => (this._view = kind)}>
          ${this.#words('healthView')}
        </uui-button>
        ${this.#renderVerb(kind, list.length)}
      </span>
    </div>`;
  }

  /**
   * A row's own verb: Review on unused media, Delete on orphaned files, Optimize on oversized images.
   * @param kind Which row.
   * @param count How many the row holds.
   */
  #renderVerb(kind: Exclude<HealthView, 'overview'>, count: number) {
    switch (kind) {
      case 'unused':
        return html`<uui-button compact look="primary" label=${this.#words('healthReview')} title=${this.#words('healthComingLater')} disabled>${this.#words('healthReview')}</uui-button>`;
      case 'orphaned':
        return html`<uui-button
          compact
          look="secondary"
          color="danger"
          label=${this.#words('healthDelete')}
          title=${this._admin ? this.#words('healthDelete') : this.#words('healthAdminOnly')}
          ?disabled=${!this._admin || !count || this._busy}
          @click=${() => void this.#delete(this._state.result?.orphaned ?? [])}>
          ${this.#words('healthDelete')}
        </uui-button>`;
      default:
        return html`<uui-button compact look="primary" label=${this.#words('healthOptimize')} ?disabled=${!count} @click=${() => void this.#optimize()}>${this.#words('healthOptimize')}</uui-button>`;
    }
  }

  /**
   * One category as a list, largest first.
   * @param kind Which category.
   */
  #renderList(kind: Exclude<HealthView, 'overview'>) {
    const result = this._state.result;
    const list = result?.[kind] ?? [];
    const words = ROWS[kind];
    return html`<header class="list-head">
      <uui-button compact look="secondary" label=${this.#words('healthBack')} @click=${() => (this._view = 'overview')}><uui-icon name="icon-arrow-left"></uui-icon>${this.#words('healthBack')}</uui-button>
      <b>${this.#words(words.title)}</b>
      <span class="muted">${this.#words(words.count, list.length.toLocaleString(), formatBytes(sizeOfAll(list)))}</span>
    </header>
      <div class="list">
        ${list.length
          ? kind === 'orphaned'
            ? repeat(list as HealthOrphan[], (file) => file.relativePath, (file) => this.#renderFile(file))
            : repeat(list as HealthItem[], (item) => item.key, (item) => this.#renderItem(item, kind))
          : html`<p class="muted">${this.#words('healthEmptyList')}</p>`}
      </div>
      ${this._notice ? html`<p class="notice">${this._notice}</p>` : nothing}`;
  }

  /**
   * One media item's row: name and folder, size, Edit image for an image, and Trash on an unused item.
   * @param item The item.
   * @param kind Which list it is in.
   */
  #renderItem(item: HealthItem, kind: 'unused' | 'oversized') {
    const image = isImage(item);
    const folder = item.path === '/' ? this.localize.term('sections_media') : item.path.replace(/^\//, '');
    return html`<div class="item">
      <uui-icon class="kind" name=${image ? 'icon-picture' : 'icon-document'}></uui-icon>
      <span class="name" role="button" tabindex="0" @click=${() => this.#open(item)} @keydown=${(event: KeyboardEvent) => event.key === 'Enter' && this.#open(item)}>
        <b>${item.name}</b><small>${folder}</small>
      </span>
      <span class="size">${formatBytes(item.sizeBytes ?? 0)}</span>
      ${image ? html`<uui-button compact look="secondary" label=${this.#words('editImage')} @click=${() => this.#edit(item)}><uui-icon name="icon-ruler-alt"></uui-icon></uui-button>` : nothing}
      ${kind === 'unused'
        ? html`<uui-button compact look="secondary" color="danger" label="actions_trash" title=${this.localize.term('actions_trash')} ?disabled=${this._busy} @click=${() => void this.#trash(item)}>
            <uui-icon name="icon-trash"></uui-icon>
          </uui-button>`
        : nothing}
    </div>`;
  }

  /**
   * One orphaned file's row: its path, when it was written, its size, Open, and Delete for an
   * administrator.
   * @param file The file.
   */
  #renderFile(file: HealthOrphan) {
    return html`<div class="item">
      <uui-icon class="kind" name="icon-document"></uui-icon>
      <span class="name"><b>${file.relativePath}</b><small>${new Date(file.lastModifiedUtc).toLocaleDateString()}</small></span>
      <span class="size">${formatBytes(file.sizeBytes)}</span>
      <a href=${file.url} target="_blank" rel="noopener" data-router-slot="disabled">
        <uui-button compact look="secondary" label=${this.#words('healthOpenFile')}><uui-icon name="icon-out"></uui-icon></uui-button>
      </a>
      <uui-button
        compact
        look="secondary"
        color="danger"
        label=${this.#words('healthDeleteOne')}
        title=${this._admin ? this.#words('healthDeleteOne') : this.#words('healthAdminOnly')}
        ?disabled=${!this._admin || this._busy}
        @click=${() => void this.#delete([file])}>
        <uui-icon name="icon-delete"></uui-icon>
      </uui-button>
    </div>`;
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
      padding: var(--uui-size-space-5, 18px);
      gap: var(--uui-size-space-4, 12px);
      overflow: auto;
      background: var(--uui-color-background);
      color: var(--uui-color-text);
      font-family: var(--umbradesktop-app-font, inherit);
    }

    .summary,
    .progress,
    .bar,
    .rows,
    .list-head {
      flex: none;
    }

    .summary {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--uui-size-space-4, 12px);
    }

    .big {
      font-size: 28px;
      font-weight: bold;
      line-height: 1.1;
    }

    .big small {
      display: block;
      font-size: var(--uui-type-small-size, 12px);
      font-weight: normal;
      color: var(--uui-color-text-alt);
      margin-top: var(--uui-size-space-1, 3px);
      max-width: 36em;
    }

    .when {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 9px);
      font-size: var(--uui-type-small-size, 12px);
      color: var(--uui-color-text-alt);
      white-space: nowrap;
    }

    .progress .pt {
      display: flex;
      justify-content: space-between;
      font-size: var(--uui-type-small-size, 12px);
      color: var(--uui-color-text-alt);
      margin-bottom: var(--uui-size-space-2, 6px);
    }

    .failed,
    .notice {
      margin: 0;
      font-size: var(--uui-type-small-size, 12px);
    }

    .failed {
      color: var(--uui-color-danger);
    }

    .segs {
      display: flex;
      height: 14px;
      border-radius: 7px;
      overflow: hidden;
      background: var(--uui-color-border);
    }

    .segs span {
      display: block;
      height: 100%;
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--uui-size-space-1, 3px) var(--uui-size-space-4, 12px);
      margin-top: var(--uui-size-space-2, 6px);
      font-size: var(--uui-type-small-size, 12px);
      color: var(--uui-color-text-alt);
    }

    .legend i {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      margin-right: 5px;
      vertical-align: -1px;
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    }

    .rows {
      display: flex;
      flex-direction: column;
      background: var(--uui-color-surface);
      border: 1px solid var(--uui-color-border);
      border-radius: var(--uui-border-radius, 3px);
    }

    .rows[dim] {
      opacity: 0.55;
      pointer-events: none;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-4, 12px);
      padding: var(--uui-size-space-4, 12px);
      border-top: 1px solid var(--uui-color-divider, var(--uui-color-border));
    }

    .row:first-child {
      border-top: 0;
    }

    .row-icon {
      font-size: 22px;
      color: var(--uui-color-text-alt);
    }

    .row-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .row-text small {
      color: var(--uui-color-text-alt);
    }

    .row-text em {
      font-style: normal;
      color: var(--uui-color-text);
    }

    .row-text em::after {
      content: ' ';
    }

    .row-actions {
      display: flex;
      gap: var(--uui-size-space-2, 6px);
      flex: none;
    }

    footer {
      margin-top: auto;
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-2, 6px);
      font-size: var(--uui-type-small-size, 12px);
      color: var(--uui-color-text-alt);
    }

    .list-head {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 9px);
    }

    .list-head b {
      flex: 1;
    }

    .muted {
      color: var(--uui-color-text-alt);
      font-size: var(--uui-type-small-size, 12px);
    }

    .list {
      flex: 1;
      min-height: 0;
      overflow: auto;
      background: var(--uui-color-surface);
      border: 1px solid var(--uui-color-border);
      border-radius: var(--uui-border-radius, 3px);
    }

    .list > p {
      margin: var(--uui-size-space-4, 12px);
    }

    .item {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 9px);
      padding: var(--uui-size-space-2, 6px) var(--uui-size-space-4, 12px);
      border-top: 1px solid var(--uui-color-divider, var(--uui-color-border));
    }

    .item:first-child {
      border-top: 0;
    }

    .item .kind {
      color: var(--uui-color-text-alt);
    }

    .item .name {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      cursor: pointer;
    }

    .item .name b,
    .item .name small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item .name b {
      font-weight: normal;
    }

    .item .name:hover b {
      text-decoration: underline;
    }

    .item .name small {
      color: var(--uui-color-text-alt);
    }

    .item .size {
      font-size: var(--uui-type-small-size, 12px);
      color: var(--uui-color-text-alt);
      white-space: nowrap;
      min-width: 5em;
      text-align: right;
    }

    .item a {
      display: contents;
    }
  `;
}

export default UmbraDesktopMediaHealthElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-health': UmbraDesktopMediaHealthElement;
  }
}
