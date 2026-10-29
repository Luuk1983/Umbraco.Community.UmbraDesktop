import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMBRADESKTOP_MEDIA_HEALTH_CONTEXT } from './media-health.context.js';
import type { UmbraDesktopMediaHealthBrowse, UmbraDesktopMediaHealthContext, UmbraDesktopMediaHealthState } from './media-health.context.js';
import { HEALTH_KINDS, cleanupOf, isStale } from './health-model.js';
import type { HealthCleanup, HealthKind } from './health-model.js';
import { chipCounts } from './health-grid.js';
import { placesOf } from './health-folders.js';
import type { HealthFolder, HealthKeepDuration } from './health.client.js';
import type { HealthChip } from './health-grid.js';
import { UMBRADESKTOP_MEDIA_HEALTH_DETAILS_APP } from './health-app.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import { REASONS } from './health-done.element.js';
import { healthColours } from './health-styles.js';
import './health-start.element.js';
import './health-overview.element.js';
import './health-cleanup-sheet.element.js';
import './health-keep-sheet.element.js';
import './health-done.element.js';
import './health-folders.element.js';
import './health-list.element.js';

/** The task id the check is reported to the desktop under. */
const CHECK_TASK = 'check';

/** The task id Clean up is reported under, beside the check (`docs/developer/window-progress.md`). */
const CLEANUP_TASK = 'cleanup';

/** The key the details pane is attached under, one per window. */
const DETAILS_KEY = 'details';

/** Which screen the window shows. */
type HealthScreen = 'start' | 'overview' | 'folders' | 'list' | 'done';

/** What the list opened on: a tab, a folder or every folder (`undefined`), and where Back goes. */
interface HealthListOpening {
  chip: HealthChip;
  folderKey?: string | null;
  /** Only the items directly in the folder, as the breakdown's line of them asks. */
  exact?: boolean;
  /** The screen it was opened from, which **Back** returns to. */
  from: 'overview' | 'folders';
}

/**
 * The Media Health window (design §16): one screen at a time from the health context's state. No
 * check yet and Checking (`health-start`), the overview (`health-overview`) with the Clean up sheet
 * over it, Where the space goes as a breakdown (`health-folders`, §16.15), the cleanup list
 * (`health-list`, §16.15), and Done (`health-done`). Each screen only draws and asks, through events;
 * this element holds the context, answers the events, and reports the check and Clean up to the
 * desktop as two tasks, so the taskbar button and the title bar show how far each is.
 *
 * A click on a row of the list makes it current in the context and asks the desktop to attach the
 * details pane (`health-details`) beside this window, by its app alias (`umbradesktop-open-attached`):
 * the desktop's own pane, docked or floating, never an overlay of ours. Leaving the list closes it.
 * The list's and the pane's verbs go through the context, which asks this window before a Delete; the
 * question is the Clean up sheet's, in the same words.
 *
 * The four health colours are declared once here, on the host, from UUI's own colours, so every
 * theme restyles them and every screen reads the same four (the pane declares them again, since the
 * desktop mounts it outside this window).
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

  /** The folder breakdown, while it is open in the overview's place: the folder, null for the library. */
  @state()
  private _folders?: { folderKey: string | null };

  /** The cleanup list, while it is open: what it opened on. */
  @state()
  private _list?: HealthListOpening;

  /** The list and its pane, from the context: the current row, a Delete being asked, what stayed. */
  @state()
  private _browse: UmbraDesktopMediaHealthBrowse = { current: undefined, order: [], deleting: undefined, keeping: undefined, skipped: [] };

  /**
   * What the desktop says is attached beside this window, by key (`desktop-apps.md` §7.5): whether the
   * details pane is open, so leaving the list closes it only when it is.
   */
  @property({ attribute: false })
  attached: Readonly<Record<string, string>> = {};

  /** The health context. */
  #context?: UmbraDesktopMediaHealthContext;

  /** The result the places were found in, and the places, so they are found once per result. */
  #places?: { from: UmbraDesktopMediaHealthState['result']; places: HealthFolder[] };

  /**
   * Whether this window asked for the details pane since the list opened, so leaving the list closes
   * it even before the desktop has told `attached`.
   */
  #detailsAsked = false;

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
      this.observe(context.browse, (browse) => (this._browse = browse), 'umbradesktopHealthBrowse');
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

  /** The screen the state calls for: a running check first, then Clean up, then the list, the folders or the overview. */
  get #screen(): HealthScreen {
    const { phase, result, cleanup } = this._state;
    if (phase.kind === 'running') return 'start';
    if (cleanup) return 'done';
    if (!result) return 'start';
    if (this._list) return 'list';
    return this._folders ? 'folders' : 'overview';
  }

  /**
   * Every place of the result, folders and items that hold items (design §16.17), which the list
   * filters by, as Where the space goes counts them.
   */
  get #allPlaces(): HealthFolder[] {
    const result = this._state.result;
    if (this.#places && this.#places.from === result) return this.#places.places;
    this.#places = { from: result, places: result ? placesOf(result.items, result.folders) : [] };
    return this.#places.places;
  }

  /** Close the details pane once the list is not shown, whatever took it away: Back, a check, Clean up. */
  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (this.#screen !== 'list' && (this.#detailsAsked || DETAILS_KEY in this.attached)) this.#closeDetails();
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
   * again, not only in the overview, so a non-administrator's Clean up never sends orphaned files. The
   * keeps are read again first, so something a colleague kept since this window loaded is neither in
   * the sheet nor trashed (plan Review Focus 5): trash cannot check keeps on the server.
   * @param event The overview's request.
   */
  async #askCleanup(event: CustomEvent<{ kinds: HealthKind[] }>): Promise<void> {
    await this.#context?.loadKeeps();
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
   * Open Where the space goes at a folder, or the library (design §16.15).
   * @param event The overview's or the breakdown's request.
   */
  #openFolder(event: CustomEvent<{ folderKey: string | null }>): void {
    this._folders = { folderKey: event.detail.folderKey ?? null };
  }

  /**
   * Open the list (design §16.15), on the kind asked for, or on a folder at its first kind with
   * anything in it, so a folder never opens on an empty tab while it has something to show. **Back**
   * returns to the breakdown when it was opened from there.
   * @param event The overview's or the breakdown's request.
   */
  #openList(event: CustomEvent<{ kind?: HealthKind; folderKey?: string | null; exact?: boolean }>): void {
    const { kind, exact } = event.detail;
    const folderKey = 'folderKey' in event.detail ? event.detail.folderKey : undefined;
    const counts = chipCounts(this.#context?.entries() ?? [], folderKey, this.#allPlaces, exact);
    const chip = kind ?? HEALTH_KINDS.find((each) => counts[each] > 0) ?? 'unused';
    this._list = { chip, folderKey, exact: exact === true, from: this._folders ? 'folders' : 'overview' };
  }

  /** Back from the list, to where it was opened from. */
  #closeList(): void {
    const from = this._list?.from;
    this._list = undefined;
    if (from !== 'folders') this._folders = undefined;
    this.#context?.setCurrent(undefined);
  }

  /**
   * Make a row current and show it in the details pane, asking the desktop to attach the pane beside
   * this window by its app alias; asked again, the desktop only brings it forward.
   * @param event The list's click.
   */
  #current(event: CustomEvent<{ id: string }>): void {
    this.#context?.setCurrent(event.detail.id);
    this.#detailsAsked = true;
    this.dispatchEvent(
      new CustomEvent('umbradesktop-open-attached', {
        detail: { key: DETAILS_KEY, app: UMBRADESKTOP_MEDIA_HEALTH_DETAILS_APP, name: this.#words('healthDetails'), icon: 'icon-info' },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Close the details pane. */
  #closeDetails(): void {
    this.#detailsAsked = false;
    this.dispatchEvent(new CustomEvent('umbradesktop-close-attached', { detail: { key: DETAILS_KEY }, bubbles: true, composed: true }));
  }

  /**
   * Act on the list's selection through the context, as the person may: the context asks this window
   * before a Delete, and only for an administrator.
   * @param event The list's request.
   */
  #act(event: CustomEvent<{ ids: string[] }>): void {
    void this.#context?.act(event.detail.ids, { admin: this._admin, title: this.#words('healthOversized') });
  }

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
    return html`<div
        class="scroll"
        data-screen=${screen}
        @health-check=${this.#check}
        @health-stop=${this.#stop}
        @health-open-grid=${this.#openList}
        @health-open-folder=${this.#openFolder}>
        ${screen === 'start' ? html`<umbradesktop-health-start .phase=${phase} .mediaCount=${mediaCount}></umbradesktop-health-start>` : nothing}
        ${screen === 'overview'
          ? html`${this.#renderNotices()}
              <umbradesktop-health-overview
                .result=${result}
                ?admin=${this._admin}
                .signThumbnails=${this.#signThumbnails}
                @health-cleanup=${this.#askCleanup}></umbradesktop-health-overview>`
          : nothing}
        ${screen === 'folders'
          ? html`${this.#renderNotices()}
              <umbradesktop-health-folders
                .result=${result}
                .folderKey=${this._folders?.folderKey ?? null}
                @health-show-folder=${(event: CustomEvent<{ folderKey: string | null }>) => this.#context?.showFolderInManager(event.detail.folderKey)}
                @health-close-folders=${() => (this._folders = undefined)}></umbradesktop-health-folders>`
          : nothing}
        ${screen === 'list' ? this.#renderList() : nothing}
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
      ${screen === 'list' ? this.#renderDeleting() : nothing} ${screen === 'list' ? this.#renderKeeping() : nothing}`;
  }

  /**
   * The list, under the same notices as the overview: a check over a day old is said here too, since
   * the list's verbs act on that same result. What the last Delete left on disk is said over it.
   */
  #renderList() {
    const list = this._list!;
    const skipped = this._browse.skipped;
    const reason = (code: string) => (REASONS[code] ? this.#words(REASONS[code]) : code);
    return html`${this.#renderNotices()}
      ${skipped.length
        ? html`<umbradesktop-notice
            class="notice"
            name="delete"
            severity="warning"
            heading=${this.#words('healthDelete')}
            body=${this.#words(
              'healthSkipped',
              skipped.length.toLocaleString(this.localize.lang() || undefined),
              skipped.map((each) => `${each.relativePath} (${reason(each.reason)})`).join(', '),
            )}></umbradesktop-notice>`
        : nothing}
      <umbradesktop-health-list
        .entries=${this.#context?.entries() ?? []}
        .folders=${this.#allPlaces}
        .chip=${list.chip}
        .folderKey=${list.folderKey}
        .exact=${list.exact === true}
        .current=${this._browse.current}
        ?admin=${this._admin}
        .signThumbnails=${this.#signThumbnails}
        @health-close-grid=${this.#closeList}
        @health-current=${this.#current}
        @health-order=${(event: CustomEvent<{ ids: string[] }>) => this.#context?.setOrder(event.detail.ids)}
        @health-act=${this.#act}
        @health-keep=${(event: CustomEvent<{ ids: string[] }>) => this.#context?.askKeep(event.detail.ids)}
        @health-stop-keeping=${(event: CustomEvent<{ ids: string[] }>) => void this.#context?.stopKeeping(event.detail.ids)}></umbradesktop-health-list>`;
  }

  /**
   * Keep… from the list or the pane (design §16.6), asked over the window as a Delete is, since the pane
   * is not inside it: the one row by its name, or how many.
   */
  #renderKeeping() {
    const ids = this._browse.keeping;
    if (!ids) return nothing;
    const one = ids.length === 1 ? this.#context?.entries().find((entry) => entry.id === ids[0]) : undefined;
    return html`<umbradesktop-health-keep-sheet
      .count=${ids.length}
      .name=${one?.name}
      @health-keep-confirm=${(event: CustomEvent<{ note: string; duration: HealthKeepDuration }>) => void this.#context?.keep(event.detail.note, event.detail.duration)}
      @health-keep-cancel=${() => this.#context?.cancelKeep()}></umbradesktop-health-keep-sheet>`;
  }

  /** The question before a Delete, from the list or the pane, in the Clean up sheet's words. */
  #renderDeleting() {
    const ids = this._browse.deleting;
    if (!ids) return nothing;
    const files = (this.#context?.entries() ?? []).filter((entry) => entry.orphan && ids.includes(entry.id));
    const bytes = files.reduce((sum, entry) => sum + entry.bytes, 0);
    return html`<umbradesktop-health-cleanup-sheet
      class="ask"
      .cleanup=${{ rows: [{ kind: 'orphaned', count: files.length, bytes, unknown: 0, estimate: false }], bytes }}
      admin
      heading=${this.#words('healthDeleteTitle', formatBytes(bytes))}
      confirm-label=${this.#words('healthDelete')}
      @health-cleanup-confirm=${() => void this.#context?.confirmDelete()}
      @health-cleanup-cancel=${() => this.#context?.cancelDelete()}></umbradesktop-health-cleanup-sheet>`;
  }

  static override styles = [
    healthColours,
    css`
    :host {
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

    /* The list fills the window, scrolling its own table between its toolbar and its selection bar. */
    .scroll[data-screen='list'] {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .scroll[data-screen='list'] umbradesktop-health-list {
      flex: 1;
    }
  `,
  ];
}

export default UmbraDesktopMediaHealthElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-health': UmbraDesktopMediaHealthElement;
  }
}
