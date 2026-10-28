import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMBRADESKTOP_MEDIA_HEALTH_CONTEXT } from './media-health.context.js';
import type { UmbraDesktopMediaHealthContext, UmbraDesktopMediaHealthState } from './media-health.context.js';
import { HEALTH_KINDS, cleanupOf, isStale } from './health-model.js';
import type { HealthCleanup, HealthKind } from './health-model.js';
import { chipCounts, entriesOf } from './health-grid.js';
import type { HealthChip, HealthEntry } from './health-grid.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import { REASONS } from './health-done.element.js';
import './health-start.element.js';
import './health-overview.element.js';
import './health-cleanup-sheet.element.js';
import './health-done.element.js';
import './health-grid.element.js';
import './health-preview.element.js';

/** The task id the check is reported to the desktop under. */
const CHECK_TASK = 'check';

/** The task id Clean up is reported under, beside the check (`docs/developer/window-progress.md`). */
const CLEANUP_TASK = 'cleanup';

/** Which screen the window shows. */
type HealthScreen = 'start' | 'overview' | 'grid' | 'done';

/** What the grid opened on: a tab, and a folder or every folder (`undefined`). */
interface HealthGridOpening {
  chip: HealthChip;
  folderKey?: string | null;
}

/**
 * The Media Health window (design §16): one screen at a time from the health context's state. No
 * check yet and Checking (`health-start`), the overview (`health-overview`) with the Clean up sheet
 * over it, the grid (`health-grid`, §16.4) with the preview over it (`health-preview`, §16.5), and Done
 * (`health-done`). Each screen only draws and asks, through events; this element holds the context,
 * answers the events, and reports the check and Clean up to the desktop as two tasks, so the taskbar
 * button and the title bar show how far each is.
 *
 * The grid's and the preview's verbs act on what the person chose, one at a time or as a selection:
 * **Move to recycle bin** through the Manager's trash, as Clean up does; **Optimize** in Optimize
 * images; **Delete** for good only after the Clean up sheet has asked, in the same words.
 *
 * The four health colours are declared once here, on the host, from UUI's own colours, so every
 * theme restyles them and every screen reads the same four.
 */
@customElement('umbradesktop-media-health')
export class UmbraDesktopMediaHealthElement extends UmbLitElement {
  /** Where the check is, the last result, the library's size and Clean up. */
  @state()
  private _state: UmbraDesktopMediaHealthState = { phase: { kind: 'idle' }, result: undefined, mediaCount: undefined, cleanup: undefined };

  /** Whether the person is an administrator, who alone may delete files from disk. */
  @state()
  private _admin = false;

  /** What Clean up would do, while its sheet asks; undefined when no sheet is open. */
  @state()
  private _sheet?: HealthCleanup;

  /** Whether an Undo is under way. */
  @state()
  private _undoing = false;

  /** How the last Undo went, for Done. */
  @state()
  private _undoNote = '';

  /** Why the last Clean up did not run, said over the overview until the next one is asked. */
  @state()
  private _refused?: 'newer' | 'stale';

  /** The grid, while it is open over the overview's place: what it opened on. */
  @state()
  private _grid?: HealthGridOpening;

  /** The preview over the grid: the entry it opened on and the grid's order then. */
  @state()
  private _preview?: { id: string; ids: string[] };

  /** The orphaned files a Delete from the grid or the preview asks about, while it asks. */
  @state()
  private _deleting?: HealthEntry[];

  /** What the last Delete from the grid left on disk, said over the grid. */
  @state()
  private _deleteNote = '';

  /** The result the entries were made from, and the entries, so they are made once per result. */
  #entries?: { from: UmbraDesktopMediaHealthState['result']; entries: HealthEntry[] };

  /** The health context. */
  #context?: UmbraDesktopMediaHealthContext;

  /** Stops this window's watch of the server, while it watches. */
  #unwatch?: () => void;

  /** The last report of each task, so the desktop is told only when it changes. */
  #reported = new Map<string, string>();

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
      this.#startWatching();
    });
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (user) => {
      this.observe(user?.currentUser, (current) => (this._admin = !!current?.isAdmin), 'umbradesktopHealthUser');
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#startWatching();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unwatch?.();
    this.#unwatch = undefined;
  }

  /**
   * Watch the server while the window is open (design §16.12), once the context is there; a colleague's
   * check or result then shows up here within thirty seconds.
   */
  #startWatching(): void {
    if (this.#unwatch || !this.#context || !this.isConnected) return;
    this.#unwatch = this.#context.watch();
  }

  /** The screen the state calls for: a running check first, then Clean up, then the grid or the overview. */
  get #screen(): HealthScreen {
    const { phase, result, cleanup } = this._state;
    if (phase.kind === 'running') return 'start';
    if (cleanup) return 'done';
    if (!result) return 'start';
    return this._grid ? 'grid' : 'overview';
  }

  /** Every entry of the result, for the grid and the preview; made again only when the result changes. */
  get #allEntries(): HealthEntry[] {
    const result = this._state.result;
    const made = this.#entries;
    if (made && made.from === result) return made.entries;
    const entries = result ? entriesOf(result.lists) : [];
    this.#entries = { from: result, entries };
    return entries;
  }

  /**
   * Tell the desktop where the check and Clean up are (`window-progress.md` §1). The check: a real
   * count while the library is read, activity while the disk is walked, whose file count is not
   * known before the walk, and a failure until the next check. Clean up: its count while it runs,
   * failed when anything did not go, until the person goes back to the overview.
   */
  #report(): void {
    const { phase, cleanup } = this._state;
    const label = (key: 'healthChecking' | 'healthCleaningUp') => `#umbraDesktopMedia_${key}`;
    this.#send(
      CHECK_TASK,
      phase.kind === 'running'
        ? phase.total > 0
          ? { id: CHECK_TASK, state: 'running', completed: phase.scanned, total: phase.total, label: label('healthChecking') }
          : { id: CHECK_TASK, state: 'running', label: label('healthChecking') }
        : phase.kind === 'failed'
          ? { id: CHECK_TASK, state: 'failed', failed: 1, total: 1 }
          : { id: CHECK_TASK, state: 'done' },
    );
    const missed = cleanup ? cleanup.failed.length + cleanup.skipped.length : 0;
    this.#send(
      CLEANUP_TASK,
      cleanup?.phase === 'running'
        ? { id: CLEANUP_TASK, state: 'running', completed: cleanup.done, total: cleanup.total, label: label('healthCleaningUp') }
        : cleanup && missed
          ? { id: CLEANUP_TASK, state: 'failed', failed: missed, total: cleanup.total }
          : { id: CLEANUP_TASK, state: 'done' },
    );
  }

  /**
   * Send one task's report when it changed. A task never reported is not told it is done, so a
   * window that never cleaned up says nothing about Clean up.
   * @param id The task.
   * @param detail Its report.
   */
  #send(id: string, detail: Record<string, unknown>): void {
    const signature = JSON.stringify(detail);
    const before = this.#reported.get(id);
    if (signature === before) return;
    if (before === undefined && detail.state === 'done' && id === CLEANUP_TASK) return;
    this.#reported.set(id, signature);
    this.dispatchEvent(new CustomEvent('umbradesktop-task', { detail, bubbles: true, composed: true }));
  }

  /**
   * Sign thumbnails through the context, which caches them for the desktop. An arrow, so the overview
   * gets one stable function to compare.
   * @param subjects Each picture's URL, with its item's key when it is an item.
   * @param edge The edge in device pixels.
   * @returns The signed URLs, by file URL.
   */
  #signThumbnails = (subjects: Array<{ url: string; key?: string }>, edge: number): Promise<Map<string, string>> =>
    this.#context?.thumbnails(subjects, edge) ?? Promise.resolve(new Map<string, string>());

  /** Start a check. */
  #check(): void {
    this._refused = undefined;
    void this.#context?.check();
  }

  /** Stop the check. */
  #stop(): void {
    void this.#context?.stop();
  }

  /**
   * Open the sheet for the rows the overview has ticked. What someone may not do is left out here
   * again, not only in the overview, so a non-administrator's Clean up never sends orphaned files.
   * @param event The overview's request.
   */
  #askCleanup(event: CustomEvent<{ kinds: HealthKind[] }>): void {
    const result = this._state.result;
    if (!result) return;
    const sheet = cleanupOf(result.lists, new Set(event.detail.kinds), this._admin);
    this._sheet = sheet.rows.length ? sheet : undefined;
  }

  /** Run the Clean up the sheet asked about. */
  async #cleanUp(): Promise<void> {
    const sheet = this._sheet;
    this._sheet = undefined;
    this._undoNote = '';
    this._refused = undefined;
    if (!sheet || !this.#context) return;
    const outcome = await this.#context.cleanUp(new Set(sheet.rows.map((row) => row.kind)), { title: this.#words('healthOversized') });
    if ('refused' in outcome) this._refused = outcome.refused;
  }

  /** Put the trashed items back, and say how that went. */
  async #undo(): Promise<void> {
    if (this._undoing || !this.#context) return;
    this._undoing = true;
    try {
      const { failed } = await this.#context.undoCleanup();
      this._undoNote = failed.length ? this.#words('healthUndoFailed', failed.length) : this.#words('healthPutBack');
    } finally {
      this._undoing = false;
    }
  }

  /** Back to the overview from Done. */
  #dismiss(): void {
    this._undoNote = '';
    this.#context?.dismissCleanup();
  }

  /**
   * Open the grid (design §16.4), on the row asked for, or on a folder at its first kind with anything
   * in it, so a folder never opens on an empty tab while it has something to show.
   * @param event The overview's request.
   */
  #openGrid(event: CustomEvent<{ kind?: HealthKind; folderKey?: string | null }>): void {
    const { kind } = event.detail;
    const folderKey = 'folderKey' in event.detail ? event.detail.folderKey : undefined;
    const counts = chipCounts(this.#allEntries, folderKey, this._state.result?.folders ?? []);
    const chip = kind ?? HEALTH_KINDS.find((each) => counts[each] > 0) ?? 'unused';
    this._grid = { chip, folderKey };
    this._deleteNote = '';
  }

  /** Back to the overview from the grid. */
  #closeGrid(): void {
    this._grid = undefined;
    this._preview = undefined;
    this._deleting = undefined;
  }

  /**
   * The entries the grid or the preview names, as they are now.
   * @param ids Their ids.
   * @returns The ones still there.
   */
  #entriesOf(ids: ReadonlyArray<string>): HealthEntry[] {
    const byId = new Map(this.#allEntries.map((entry) => [entry.id, entry]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  /**
   * Move the items chosen to the recycle bin, through the Manager, as Clean up does.
   * @param event The grid's or the preview's request.
   */
  #trash(event: CustomEvent<{ ids: string[] }>): void {
    const keys = this.#entriesOf(event.detail.ids).flatMap((entry) => (entry.item ? [entry.item.key] : []));
    if (keys.length) void this.#context?.trash(keys);
  }

  /**
   * Open the images chosen in Optimize images.
   * @param event The grid's or the preview's request.
   */
  #optimize(event: CustomEvent<{ ids: string[] }>): void {
    const keys = this.#entriesOf(event.detail.ids).flatMap((entry) => (entry.item ? [entry.item.key] : []));
    if (keys.length) this.#context?.optimize(keys, { title: this.#words('healthOversized') });
  }

  /**
   * Ask before deleting the files chosen, for good, in the Clean up sheet's words. Only an
   * administrator may; the grid and the preview grey the button out for anyone else, and this asks
   * nothing for them either.
   * @param event The grid's or the preview's request.
   */
  #askDelete(event: CustomEvent<{ ids: string[] }>): void {
    const files = this.#entriesOf(event.detail.ids).filter((entry) => entry.orphan);
    this._deleting = this._admin && files.length ? files : undefined;
  }

  /** Delete the files the sheet asked about, and say what stayed on disk and why. */
  async #delete(): Promise<void> {
    const files = this._deleting;
    this._deleting = undefined;
    if (!files || !this.#context) return;
    const outcome = await this.#context.deleteOrphaned(files.map((entry) => entry.orphan!.relativePath));
    const reason = (code: string) => (REASONS[code] ? this.#words(REASONS[code]) : code);
    const skipped = 'error' in outcome ? files.map((entry) => ({ relativePath: entry.orphan!.relativePath, reason: outcome.error })) : outcome.skipped;
    this._deleteNote = skipped.length
      ? this.#words('healthSkipped', skipped.length.toLocaleString(this.localize.lang() || undefined), skipped.map((each) => `${each.relativePath} (${reason(each.reason)})`).join(', '))
      : '';
  }

  /**
   * Show an item in a Media Manager window, selected.
   * @param event The preview's request.
   */
  #showInManager(event: CustomEvent<{ entry: HealthEntry }>): void {
    this.#context?.showInManager(event.detail.entry);
  }

  /**
   * Sign the preview's picture, uncropped, through the context. An arrow, so the preview gets one
   * stable function to compare.
   * @param subjects The picture's URL, with its item's key when it is an item.
   * @param edge The edge in device pixels.
   * @returns The signed URL, by file URL.
   */
  #signPreview = (subjects: Array<{ url: string; key?: string }>, edge: number): Promise<Map<string, string>> =>
    this.#context?.thumbnails(subjects, edge, { fit: true }) ?? Promise.resolve(new Map<string, string>());

  /**
   * What the overview has to say before it is read, in the desktop's own notice (design §16.12), the
   * banner a window shows when a page changed while you edit it, so it looks the same here under
   * every theme. A failed check is an error; an old check and a refused Clean up are warnings. The
   * old check's notice has no button: **Check again** at the top is the one way, not a second copy.
   * `<umbradesktop-notice>` is the desktop's, used by its tag alone, as an app may.
   */
  #renderNotices() {
    const { phase, result } = this._state;
    const notice = (name: string, severity: 'warning' | 'error', heading: string, body: string) =>
      html`<umbradesktop-notice class="notice" name=${name} severity=${severity} heading=${heading} body=${body}></umbradesktop-notice>`;
    const stale = result && isStale(result.checkedAt, new Date());
    return html`${phase.kind === 'failed' ? notice('failed', 'error', this.#words('healthFailedTitle'), phase.message) : nothing}
    ${this._refused === 'newer' ? notice('refused', 'warning', this.#words('healthRefusedTitle'), this.#words('healthRefusedBody')) : nothing}
    ${stale ? notice('stale', 'warning', this.#words('healthStaleTitle'), this.#words('healthStaleBody')) : nothing}`;
  }

  override render() {
    const screen = this.#screen;
    const { phase, result, mediaCount, cleanup } = this._state;
    return html`<div class="scroll" data-screen=${screen} @health-check=${this.#check} @health-stop=${this.#stop} @health-open-grid=${this.#openGrid}>
        ${screen === 'start' ? html`<umbradesktop-health-start .phase=${phase} .mediaCount=${mediaCount}></umbradesktop-health-start>` : nothing}
        ${screen === 'overview'
          ? html`${this.#renderNotices()}
              <umbradesktop-health-overview
                .result=${result}
                ?admin=${this._admin}
                .signThumbnails=${this.#signThumbnails}
                @health-cleanup=${this.#askCleanup}></umbradesktop-health-overview>`
          : nothing}
        ${screen === 'grid' ? this.#renderGrid() : nothing}
        ${screen === 'done'
          ? html`<umbradesktop-health-done
              .cleanup=${cleanup}
              ?undoing=${this._undoing}
              .note=${this._undoNote}
              @health-undo=${this.#undo}
              @health-dismiss=${this.#dismiss}></umbradesktop-health-done>`
          : nothing}
      </div>
      ${this._sheet && screen === 'overview'
        ? html`<umbradesktop-health-cleanup-sheet
            .cleanup=${this._sheet}
            ?admin=${this._admin}
            @health-cleanup-confirm=${this.#cleanUp}
            @health-cleanup-cancel=${() => (this._sheet = undefined)}></umbradesktop-health-cleanup-sheet>`
        : nothing}
      ${screen === 'grid' ? this.#renderOverGrid() : nothing}`;
  }

  /**
   * The grid, under the same notices as the overview: a check over a day old is said here too, since
   * the grid's verbs act on that same result.
   */
  #renderGrid() {
    const grid = this._grid!;
    return html`${this.#renderNotices()}
      ${this._deleteNote
        ? html`<umbradesktop-notice class="notice" name="delete" severity="warning" heading=${this.#words('healthDelete')} body=${this._deleteNote}></umbradesktop-notice>`
        : nothing}
      <umbradesktop-health-grid
        .entries=${this.#allEntries}
        .folders=${this._state.result?.folders ?? []}
        .chip=${grid.chip}
        .folderKey=${grid.folderKey}
        ?admin=${this._admin}
        .signThumbnails=${this.#signThumbnails}
        @health-close-grid=${this.#closeGrid}
        @health-preview=${(event: CustomEvent<{ id: string; ids: string[] }>) => (this._preview = { ...event.detail })}
        @health-trash=${this.#trash}
        @health-optimize=${this.#optimize}
        @health-delete=${this.#askDelete}></umbradesktop-health-grid>`;
  }

  /**
   * What sits over the grid: the preview, and the question before a Delete, which sits over the
   * preview when the preview asked it.
   */
  #renderOverGrid() {
    const deleting = this._deleting;
    const bytes = deleting?.reduce((sum, entry) => sum + entry.bytes, 0) ?? 0;
    return html`${this._preview
        ? html`<umbradesktop-health-preview
            .entries=${this.#entriesOf(this._preview.ids)}
            .current=${this._preview.id}
            ?admin=${this._admin}
            .signPreview=${this.#signPreview}
            @health-preview-close=${() => (this._preview = undefined)}
            @health-trash=${this.#trash}
            @health-optimize=${this.#optimize}
            @health-delete=${this.#askDelete}
            @health-show-in-manager=${this.#showInManager}></umbradesktop-health-preview>`
        : nothing}
      ${deleting
        ? html`<umbradesktop-health-cleanup-sheet
            class="ask"
            .cleanup=${{ rows: [{ kind: 'orphaned', count: deleting.length, bytes, unknown: 0, estimate: false }], bytes }}
            admin
            heading=${this.#words('healthDeleteTitle', formatBytes(bytes))}
            confirm-label=${this.#words('healthDelete')}
            @health-cleanup-confirm=${this.#delete}
            @health-cleanup-cancel=${() => (this._deleting = undefined)}></umbradesktop-health-cleanup-sheet>`
        : nothing}`;
  }

  static override styles = css`
    :host {
      --umbradesktop-health-unused: var(--uui-color-danger);
      --umbradesktop-health-orphaned: var(--uui-color-warning);
      --umbradesktop-health-oversized: var(--uui-color-positive);
      --umbradesktop-health-fine: var(--umbradesktop-app-accent, var(--uui-color-interactive));
      position: relative;
      display: block;
      height: 100%;
      background: var(--uui-color-background);
      color: var(--uui-color-text);
      font-family: var(--umbradesktop-app-font, inherit);
    }

    .scroll {
      height: 100%;
      box-sizing: border-box;
      padding: var(--uui-size-space-5, 18px);
      overflow: auto;
    }

    .notice {
      margin-bottom: var(--uui-size-space-4, 12px);
    }

    /* A Delete asked from the preview is asked over it. */
    .ask {
      z-index: 4;
    }
  `;
}

export default UmbraDesktopMediaHealthElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-health': UmbraDesktopMediaHealthElement;
  }
}
