import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { HealthFolder } from './health.client.js';
import { HEALTH_CHIPS, HEALTH_SORTS, HealthSelection, ORPHAN_GROUP, chipCounts, gridOf, orderOf, pageCount, pageOf, pageWith } from './health-grid.js';
import type { HealthChip, HealthEntry, HealthGroup, HealthPagePart, HealthSort } from './health-grid.js';
import { isImage, sizeText } from './health-model.js';
import { keepEndsOn } from './health-keep.js';
import type { HealthKind } from './health-model.js';
import { isPreviewable, thumbEdge } from './health-media.js';
import { boxBetween, intersecting } from '../selection/box.js';
import type { UmbraDesktopPoint } from '../selection/box.js';
import { rangeBetween } from '../selection/range.js';
import { edgeScrollSpeed } from '../selection/edge-scroll.js';
import '../selection/box.element.js';
import type { UmbraDesktopMediaSelectionBoxElement } from '../selection/box.element.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { healthScreenStyles } from './health-styles.js';

/** Each kind's tab title, and the verb its selection bar offers. */
const KINDS: Record<HealthKind, { title: WordKey; verb: WordKey }> = {
  unused: { title: 'healthUnused', verb: 'healthTrash' },
  orphaned: { title: 'healthOrphaned', verb: 'healthDelete' },
  oversized: { title: 'healthOversized', verb: 'healthOptimize' },
};

/** Each tab's title: the kinds', then Kept. */
const TABS: Record<HealthChip, WordKey> = { unused: KINDS.unused.title, orphaned: KINDS.orphaned.title, oversized: KINDS.oversized.title, kept: 'healthKept' };

/** Each sort's words. */
const SORTS: Record<HealthSort, WordKey> = { largest: 'healthSortLargest', smallest: 'healthSortSmallest', name: 'healthSortName' };

/** A row's thumbnail edge on screen, in CSS pixels; the resizer is asked at the grid's size, so it is cached. */
const ROW_THUMB = 32;

/** How far the pointer moves before a press becomes a drag, as the Media Manager's box counts it. */
const DRAG_THRESHOLD = 4;

/** Below this width the table drops its Folder and Last changed columns, which the groups and the pane say. */
const NARROW_TABLE = 620;

/** What a press on the table may become. */
type HealthPress =
  /** A box over rows, from anywhere in the table but a checkbox or a button. */
  | 'box'
  /** A drag down the checkbox column, ticking or unticking each row it passes. */
  | 'column';

/**
 * The cleanup list (design §16.15, mock scenes 3 and 4), what step 2's grid of cards became: a tab per
 * kind with its count, a name search and a sort, then a table grouped by folder, each group row with
 * its checkbox, count and size, and each row with a small thumbnail, the whole name, the folder, the
 * size and when it last changed. There is no card view (Luuk, 2026-10-29): the details pane shows the
 * picture large.
 *
 * A click on a row only makes it current, which the window shows in the desktop's attached pane; the
 * checkbox selects. A press anywhere in the table but a checkbox or a button, and a drag, draws the
 * Media Manager's selection box (`selection/box.ts`, its element), selecting every row it touches; a
 * drag down the checkbox column ticks the range it passes (`selection/range.ts`), or unticks it when
 * it started on a ticked row. Near the top or bottom edge the list scrolls along. A click on empty
 * space clears the selection, as in a file manager; a click on a row never does (design §16.17).
 *
 * The rows are paged as core's collections page theirs, {@link PAGE_ROWS} at a time, with UUI's
 * pagination under the table, as core's collection pagination draws it; a group going on over a page
 * is headed again there. The list turns to the page of the current row, so the pane's Next walks on
 * over a page.
 *
 * Built from UUI's table rows and cells, styled as core's `umb-table` draws them, in a grid of its own
 * (see the styles). Core's table itself has no group rows, and selects a row when the row is clicked,
 * which here only makes it current; so it did not fit (design §16.16). The selection bar is core's collection selection bar's look, from UUI
 * buttons, since core's bar runs on a collection context and its bulk actions, not on this list.
 *
 * Kept is a fourth tab (design §16.6): every keep that holds, with when it ends in the last column, and
 * **Stop keeping** as its one verb. The other tabs offer **Keep…** beside their verb, for anyone, and
 * mark a row whose keep has ended with "kept until", its old note on hover.
 *
 * Fires `health-current` `{ id }`, `health-order` `{ ids }` whenever the rows shown change order,
 * `health-act` `{ ids }` for the selection bar's verb, `health-keep` `{ ids }` for **Keep…**,
 * `health-stop-keeping` `{ ids }` under Kept, and `health-close-grid` for **Back**.
 */
@customElement('umbradesktop-health-list')
export class UmbraDesktopHealthListElement extends UmbLitElement {
  /** Every entry of the last check, as the context makes them from the result. */
  @property({ attribute: false })
  entries: HealthEntry[] = [];

  /** Every folder of the check, for the folder filter and its name. */
  @property({ attribute: false })
  folders: HealthFolder[] = [];

  /** The tab shown; the window opens the list on one, then the person changes it here. */
  @property()
  chip: HealthChip = 'unused';

  /**
   * The folder shown with everything under it, null for the items at the root, undefined for every
   * folder. **All folders** clears it here.
   */
  @property({ attribute: false })
  folderKey?: string | null;

  /** Whether only the items directly in {@link folderKey} are shown, as the breakdown's line asks. */
  @property({ type: Boolean })
  exact = false;

  /** Whether the person is an administrator, who alone may delete files from disk. */
  @property({ type: Boolean })
  admin = false;

  /** The current row, from the context: the one the details pane shows. */
  @property()
  current?: string;

  /** Signs thumbnails, through the health context; without it, pictures show as plain tiles. */
  @property({ attribute: false })
  signThumbnails?: (subjects: Array<{ url: string; key?: string }>, edge: number) => Promise<Map<string, string>>;

  /** The name search. */
  @state()
  private _search = '';

  /** The sort. */
  @state()
  private _sort: HealthSort = 'largest';

  /** What is selected. */
  @state()
  private _selection = new HealthSelection();

  /** The page shown, from 1. */
  @state()
  private _page = 1;

  /** The signed thumbnails, by file URL. */
  @state()
  private _thumbnails = new Map<string, string>();

  /** The press under way, from pointer down to up. */
  #press?: {
    pointerId: number;
    kind: HealthPress;
    /** Where it started, in the content's coordinates, so it holds while the list scrolls. */
    start: UmbraDesktopPoint;
    /** The pointer now, in the viewport's. */
    at: UmbraDesktopPoint;
    /** The row pressed on, if any. */
    row?: string;
    /** The selection when it started, which a box adds to and a column drag paints over. */
    base: HealthSelection;
    /** Whether a column drag ticks (true) or unticks. */
    on: boolean;
    /** Whether it moved past the threshold, so it is a drag and not a click. */
    moved: boolean;
  };

  /** Whether the press under way began on empty space, under or beside the rows, where a click clears. */
  #onEmptySpace = false;

  /** The frame the edge scrolling runs in, while it runs. */
  #scrolling = 0;

  /** The order last reported, so the window is told only when it changes. */
  #reported = '';

  /** This package's words. */
  #words = wordsOf(this.localize);

  /** Watches rows coming near the screen, to sign their thumbnails then and not before. */
  #near?: IntersectionObserver;

  /**
   * The entry each row was last observed for, so a row is observed once per entry. Lit keeps the row
   * elements when the tab or the page changes and gives them other entries, which an element observed
   * once would never report again (found on the step 3 run, design §16.19).
   */
  #watched = new WeakMap<Element, string>();

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#near?.disconnect();
    this.#near = undefined;
    this.#watched = new WeakMap();
    cancelAnimationFrame(this.#scrolling);
  }

  override willUpdate(changed: Map<string, unknown>): void {
    super.willUpdate(changed);
    // What an action took away is no longer selectable, whatever the selection said.
    if (changed.has('entries')) this._selection = this._selection.within(this.entries);
    // A different list starts on its first page; the current row's page wins over that.
    if (changed.has('chip') || changed.has('folderKey') || changed.has('exact') || changed.has('_search') || changed.has('_sort')) this._page = 1;
    if ((changed.has('current') || changed.has('entries')) && this.current) {
      const page = pageWith(this.#groups, this.current);
      if (page) this._page = page;
    }
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    const scroller = this.#scroller;
    if (scroller && !this.#near) {
      this.#near = new IntersectionObserver((rows) => this.#sign(rows.filter((row) => row.isIntersecting).map((row) => (row.target as HTMLElement).dataset.id!)), {
        root: scroller,
        rootMargin: '200px 0px',
      });
    }
    for (const row of this.renderRoot.querySelectorAll<HTMLElement>('uui-table-row[data-id]')) {
      const id = row.dataset.id!;
      if (this.#watched.get(row) === id) continue;
      // Observed afresh, the observer reports the row's state at once, so its new entry is signed.
      if (this.#watched.has(row)) this.#near?.unobserve(row);
      this.#watched.set(row, id);
      this.#near?.observe(row);
    }
    const order = orderOf(this.#groups);
    const signature = order.join('\n');
    if (signature !== this.#reported) {
      this.#reported = signature;
      this.#fire('health-order', { ids: order });
    }
  }

  /** The scrolling part: the table, under the toolbar and over the selection bar. */
  get #scroller(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>('.table');
  }

  /**
   * Sign the thumbnails of rows near the screen that are not signed yet. The context caches what it
   * signed, so a row seen again asks nothing.
   * @param ids The rows' entries.
   */
  #sign(ids: string[]): void {
    if (!this.signThumbnails || !ids.length) return;
    const near = new Set(ids);
    const subjects = this.entries
      .filter((entry) => near.has(entry.id) && isPreviewable(entry.url) && !this._thumbnails.has(entry.url!))
      .map((entry) => (entry.item ? { url: entry.url!, key: entry.item.key } : { url: entry.url! }));
    if (!subjects.length) return;
    void this.signThumbnails(subjects, thumbEdge(window.devicePixelRatio || 1)).then((signed) => {
      this._thumbnails = new Map([...this._thumbnails, ...signed]);
    });
  }

  /** The backoffice's culture, for counts and dates. */
  get #locale(): string | undefined {
    return this.localize.lang() || undefined;
  }

  /** The groups the list shows now. */
  get #groups(): HealthGroup[] {
    return gridOf(this.entries, { chip: this.chip, folderKey: this.folderKey, exact: this.exact, search: this._search, sort: this._sort }, this.folders);
  }

  /**
   * Ask for something; the window decides.
   * @param name The event.
   * @param detail What it carries.
   */
  #fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /**
   * Show another tab. The selection is the tab's, since its verb is, so it starts empty.
   * @param chip The tab.
   */
  #choose(chip: HealthChip): void {
    if (chip === this.chip) return;
    this.chip = chip;
    this._selection = new HealthSelection();
  }

  /**
   * Run a verb on the selection: the tab's own, Keep…, or Stop keeping under Kept. The window asks
   * before a Delete and a Keep, and the selection clears.
   * @param name The event the verb fires.
   */
  #act(name: 'health-act' | 'health-keep' | 'health-stop-keeping' = 'health-act'): void {
    const ids = this.entries.filter((entry) => this._selection.has(entry.id)).map((entry) => entry.id);
    if (!ids.length) return;
    this.#fire(name, { ids });
    this._selection = new HealthSelection();
  }

  /**
   * A point in the content's coordinates: the viewport's, less where the content is drawn now, which
   * moves as the list scrolls.
   * @param point A point in the viewport.
   */
  #inContent(point: UmbraDesktopPoint): UmbraDesktopPoint {
    const content = this.renderRoot.querySelector('.content')!.getBoundingClientRect();
    return { x: point.x - content.left, y: point.y - content.top };
  }

  /**
   * A press on the table: what it may become, by what it landed on.
   * @param event The press.
   */
  #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.#press) return;
    const path = event.composedPath();
    const scroller = this.#scroller!;
    let row: HTMLElement | undefined;
    let kind: HealthPress = 'box';
    let onTable = false;
    for (const node of path) {
      if (node === scroller) break;
      if (!(node instanceof HTMLElement)) continue;
      // A button is its own to answer, never a drag.
      if (node.tagName === 'UUI-BUTTON') return;
      if (node.tagName === 'UUI-CHECKBOX') kind = 'column';
      if (node.tagName === 'UUI-TABLE-ROW' && node.dataset.id) row = node;
      if (node.tagName === 'UUI-TABLE-ROW' || node.tagName === 'UUI-TABLE-HEAD') onTable = true;
    }
    // A group's or the header's checkbox is a click of its own; only a row's starts a column drag.
    if (kind === 'column' && !row) return;
    this.#onEmptySpace = !onTable;
    const id = row?.dataset.id;
    this.#press = {
      pointerId: event.pointerId,
      kind,
      start: this.#inContent({ x: event.clientX, y: event.clientY }),
      at: { x: event.clientX, y: event.clientY },
      row: id,
      base: this._selection,
      on: id ? !this._selection.has(id) : true,
      moved: false,
    };
  };

  /**
   * The pointer moves: once past the threshold a press is a drag, which selects as it goes.
   * @param event The move.
   */
  #onPointerMove = (event: PointerEvent): void => {
    const press = this.#press;
    if (!press || event.pointerId !== press.pointerId) return;
    press.at = { x: event.clientX, y: event.clientY };
    if (!press.moved) {
      const here = this.#inContent(press.at);
      if (Math.max(Math.abs(here.x - press.start.x), Math.abs(here.y - press.start.y)) < DRAG_THRESHOLD) return;
      press.moved = true;
      try {
        this.#scroller!.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic or already-ended pointer cannot be captured; the drag still follows it.
      }
      // A drag across the table would select its text as well.
      this.#scroller!.style.userSelect = 'none';
      getSelection()?.removeAllRanges();
      this.#scrollAtEdges();
    }
    event.preventDefault();
    this.#drag();
  };

  /** Select what the drag covers now, and draw the box. */
  #drag(): void {
    const press = this.#press;
    if (!press?.moved) return;
    const content = this.renderRoot.querySelector('.content')!.getBoundingClientRect();
    const rows = [...this.renderRoot.querySelectorAll<HTMLElement>('uui-table-row[data-id]')].map((row) => {
      const rect = row.getBoundingClientRect();
      return { unique: row.dataset.id!, rect: { left: rect.left - content.left, right: rect.right - content.left, top: rect.top - content.top, bottom: rect.bottom - content.top } };
    });
    const at = this.#inContent(press.at);
    const box = this.renderRoot.querySelector<UmbraDesktopMediaSelectionBoxElement>('umbradesktop-media-selection-box');
    if (press.kind === 'column') {
      // The row level with the pointer, or the first or last when it is above or below them all.
      const under = rows.find((row) => at.y < row.rect.bottom) ?? rows[rows.length - 1];
      const order = rows.map((row) => row.unique);
      const range = under ? rangeBetween(order, press.row, at.y < (rows[0]?.rect.top ?? 0) ? order[0] : under.unique) : [];
      this._selection = press.base.with(range, press.on);
      return;
    }
    const covered = intersecting(boxBetween(press.start, at), rows);
    this._selection = press.base.with(covered, true);
    if (box) {
      const area = boxBetween(press.start, at);
      box.box = { left: area.left, top: area.top, width: area.right - area.left, height: area.bottom - area.top };
    }
  }

  /** Scroll the list while the drag is held near its top or bottom edge, a frame at a time. */
  #scrollAtEdges(): void {
    cancelAnimationFrame(this.#scrolling);
    const frame = () => {
      const press = this.#press;
      const scroller = this.#scroller;
      if (!press?.moved || !scroller) return;
      const edges = scroller.getBoundingClientRect();
      const speed = edgeScrollSpeed(press.at.y, edges.top, edges.bottom);
      if (speed) {
        const before = scroller.scrollTop;
        scroller.scrollTop += speed;
        if (scroller.scrollTop !== before) this.#drag();
      }
      this.#scrolling = requestAnimationFrame(frame);
    };
    this.#scrolling = requestAnimationFrame(frame);
  }

  /**
   * The pointer is let go: a drag keeps what it selected; a click on a row makes it current, and
   * nothing else; a click on empty space clears the selection. A click on a checkbox is the checkbox's
   * own.
   * @param event The release.
   */
  #onPointerUp = (event: PointerEvent): void => {
    const press = this.#press;
    if (!press || event.pointerId !== press.pointerId) return;
    this.#press = undefined;
    cancelAnimationFrame(this.#scrolling);
    const scroller = this.#scroller;
    if (scroller) scroller.style.userSelect = '';
    const box = this.renderRoot.querySelector<UmbraDesktopMediaSelectionBoxElement>('umbradesktop-media-selection-box');
    if (box) box.box = undefined;
    if (press.moved) {
      try {
        scroller?.releasePointerCapture(press.pointerId);
      } catch {
        // Not captured, or already released.
      }
      return;
    }
    if (press.kind !== 'column' && press.row) this.#fire('health-current', { id: press.row });
    else if (this.#onEmptySpace) this._selection = new HealthSelection();
  };

  override render() {
    const groups = this.#groups;
    return html`${this.#renderToolbar()}
      <div
        class="table"
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerUp}>
        <div class="content">
          ${groups.length ? this.#renderTable(groups) : html`<p class="muted empty">${this.#words(this._search.trim() ? 'healthNoMatch' : 'healthNothingHere')}</p>`}
          <umbradesktop-media-selection-box></umbradesktop-media-selection-box>
        </div>
      </div>
      ${this.#renderSelection(groups)}`;
  }

  /** Back, a tab per kind with its count, and under them the folder, the search and the sort. */
  #renderToolbar() {
    const counts = chipCounts(this.entries, this.folderKey, this.folders, this.exact);
    const folder = this.folderKey === undefined ? undefined : this.folderKey === null ? this.#words('healthRoot') : (this.folders.find((each) => each.key === this.folderKey)?.name ?? '');
    return html`<div class="toolbar">
        <uui-button class="back" look="outline" label=${this.#words('healthBack')} @click=${() => this.#fire('health-close-grid')}>
          <uui-icon name="icon-arrow-left"></uui-icon>${this.#words('healthBack')}
        </uui-button>
        <uui-tab-group>
          ${HEALTH_CHIPS.map(
            // One span, since uui-tab stacks what it is given: the title and its count stay on one line.
            (chip) => html`<uui-tab label=${this.#words(TABS[chip])} ?active=${this.chip === chip} data-kind=${chip} @click=${() => this.#choose(chip)}>
              <span class="tab">${this.#words(TABS[chip])} <span class="count">${counts[chip].toLocaleString(this.#locale)}</span></span>
            </uui-tab>`,
          )}
        </uui-tab-group>
      </div>
      <div class="filters">
        ${folder === undefined
          ? nothing
          : html`<span class="folder">${this.#words('healthInFolder', folder)}</span>
              <uui-button
                class="all-folders"
                look="secondary"
                compact
                label=${this.#words('healthAllFolders')}
                @click=${() => {
                  this.folderKey = undefined;
                  this.exact = false;
                }}></uui-button>`}
        <uui-input
          class="search"
          label=${this.#words('healthSearch')}
          placeholder=${this.#words('healthSearch')}
          .value=${this._search}
          @input=${(event: Event) => (this._search = (event.target as HTMLInputElement).value ?? '')}></uui-input>
        <uui-select
          class="sort"
          label=${this.#words('healthSort')}
          .options=${HEALTH_SORTS.map((sort) => ({ name: this.#words(SORTS[sort]), value: sort, selected: sort === this._sort }))}
          @change=${(event: Event) => (this._sort = (event.target as HTMLSelectElement).value as HealthSort)}></uui-select>
      </div>`;
  }

  /**
   * The table: a header with a checkbox for every row on the page, then each group's row and its rows
   * on the page, and the pagination under it when there is more than one page.
   * @param groups The groups.
   */
  #renderTable(groups: HealthGroup[]) {
    const parts = pageOf(groups, this._page);
    const pages = pageCount(groups);
    const shown = parts.flatMap((part) => part.entries);
    const ticked = shown.filter((entry) => this._selection.has(entry.id)).length;
    return html`<div class="grid" role="table">
      <uui-table-head>
        <uui-table-head-cell class="check">
          <uui-checkbox
            aria-label=${this.#words('healthSelectAll')}
            .checked=${ticked > 0 && ticked === shown.length}
            .indeterminate=${ticked > 0 && ticked < shown.length}
            @change=${() =>
              (this._selection = this._selection.with(
                shown.map((entry) => entry.id),
                ticked < shown.length,
              ))}></uui-checkbox>
        </uui-table-head-cell>
        <uui-table-head-cell class="thumb"></uui-table-head-cell>
        <uui-table-head-cell>${this.#words('healthName')}</uui-table-head-cell>
        <uui-table-head-cell class="folder-cell">${this.#words('healthFolder')}</uui-table-head-cell>
        <uui-table-head-cell class="size">${this.#words('healthSize')}</uui-table-head-cell>
        <uui-table-head-cell class="changed">${this.#words(this.chip === 'kept' ? 'healthKeptUntil' : 'healthChanged')}</uui-table-head-cell>
      </uui-table-head>
      ${parts.map((part) => this.#renderGroup(part))}
    </div>
    ${pages > 1
      ? html`<uui-pagination
          .current=${Math.min(this._page, pages)}
          .total=${pages}
          firstlabel=${this.localize.term('general_first')}
          previouslabel=${this.localize.term('general_previous')}
          nextlabel=${this.localize.term('general_next')}
          lastlabel=${this.localize.term('general_last')}
          @change=${(event: Event) => {
            this._page = (event.target as HTMLElement & { current: number }).current;
            this.#scroller?.scrollTo({ top: 0 });
          }}></uui-pagination>`
      : nothing}`;
  }

  /**
   * One group's part of the page: its row, with the checkbox for all of it, the folder and what the
   * whole group comes to, then its rows on this page.
   * @param part The group and its rows on the page.
   */
  #renderGroup(part: HealthPagePart) {
    const { group, entries } = part;
    const state = this._selection.groupState(group);
    const label = group.key === ORPHAN_GROUP ? this.#words('healthOnDisk') : group.label || this.#words('healthRoot');
    const size = sizeText(group, group.entries.length, (key, bytes) => this.#words(key, bytes ?? ''));
    return html`<uui-table-row class="group" data-group=${group.key}>
        <uui-table-cell class="check">
          <uui-checkbox
            aria-label=${label}
            .checked=${state === 'all'}
            .indeterminate=${state === 'some'}
            @change=${() => (this._selection = this._selection.toggleGroup(group))}></uui-checkbox>
        </uui-table-cell>
        <uui-table-cell class="group-label">
          <b>${label}</b>
          <span class="muted">· ${this.#words('healthGroupCount', group.entries.length.toLocaleString(this.#locale))} · ${size}</span>
        </uui-table-cell>
      </uui-table-row>
      ${entries.map((entry) => this.#renderRow(entry))}`;
  }

  /**
   * One row: its checkbox, the signed thumbnail or an icon (never an unsigned request), the whole
   * name, the folder, the size and when it last changed.
   * @param entry The entry.
   */
  #renderRow(entry: HealthEntry) {
    const selected = this._selection.has(entry.id);
    const previewable = isPreviewable(entry.url);
    const src = previewable ? this._thumbnails.get(entry.url!) : undefined;
    const changed = entry.item?.updatedUtc ?? entry.orphan?.lastModifiedUtc;
    const folder = entry.orphan ? this.#words('healthOnDisk') : (entry.folderPath.split('/').filter(Boolean).pop() ?? this.#words('healthRoot'));
    return html`<uui-table-row data-id=${entry.id} ?selected=${selected} ?current=${this.current === entry.id}>
      <uui-table-cell class="check">
        <uui-checkbox
          aria-label=${entry.name}
          .checked=${selected}
          @change=${(event: Event) => (this._selection = this._selection.with([entry.id], (event.target as HTMLInputElement).checked))}></uui-checkbox>
      </uui-table-cell>
      <uui-table-cell class="thumb">
        ${src
          ? html`<img src=${src} alt="" />`
          : html`<span class="tile">${previewable ? nothing : html`<uui-icon name=${entry.item && isImage(entry.item) ? 'icon-picture' : 'icon-document'}></uui-icon>`}</span>`}
      </uui-table-cell>
      <uui-table-cell data-cell="name"><span class="name">${entry.name}</span>${this.#renderEnded(entry)}</uui-table-cell>
      <uui-table-cell data-cell="folder" class="folder-cell muted">${folder || this.#words('healthRoot')}</uui-table-cell>
      <uui-table-cell data-cell="size" class="size">${entry.sized ? formatBytes(entry.bytes) : this.#words('healthSizeUnknown')}</uui-table-cell>
      <uui-table-cell data-cell="changed" class="changed muted"
        >${this.chip === 'kept' && entry.keep
          ? this.#until(entry.keep)
          : changed
            ? new Date(changed).toLocaleDateString(this.#locale, { month: 'short', year: 'numeric' })
            : nothing}</uui-table-cell
      >
    </uui-table-row>`;
  }

  /**
   * When a keep ends, as the Kept tab's last column and the badge say it: the date, or Always.
   * @param keep The keep.
   */
  #until(keep: NonNullable<HealthEntry['keep']>): string {
    const ends = keepEndsOn(keep);
    return ends ? ends.toLocaleDateString(this.#locale, { day: 'numeric', month: 'short', year: 'numeric' }) : this.#words('healthKeepAlways');
  }

  /**
   * The badge on a row whose keep has ended (design §16.6): it is back in its list, and the badge says
   * it was kept, with the old note on hover, so judging it again is quick. UUI's tag, as the breakdown's
   * tags are, in its default colour so it reads as a fact rather than a button.
   * @param entry The entry.
   */
  #renderEnded(entry: HealthEntry) {
    const keep = entry.keep;
    if (!keep?.ended || this.chip === 'kept') return nothing;
    const text = keep.untilUtc ? this.#words('healthKeptUntilDate', this.#until(keep)) : this.#words('healthKept');
    return html`<uui-tag class="kept" look="secondary" title=${keep.note ?? ''}>${text}</uui-tag>`;
  }

  /**
   * The selection bar, while anything is selected, in core's collection selection bar's look: Clear
   * selection, how many out of how many, what they come to, and the tab's verb. Delete is for an
   * administrator only; for anyone else it is greyed out and says why.
   * @param groups The groups shown.
   */
  #renderSelection(groups: HealthGroup[]) {
    if (!this._selection.count) return nothing;
    const selected = this.entries.filter((entry) => this._selection.has(entry.id));
    const unknown = selected.filter((entry) => !entry.sized).length;
    const size = sizeText({ bytes: this._selection.bytes(this.entries), unknown }, selected.length, (key, bytes) => this.#words(key, bytes ?? ''));
    const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
    const denied = this.chip === 'orphaned' && !this.admin;
    return html`<div class="selection">
      <uui-button look="secondary" label=${this.#words('healthClearSelection')} @click=${() => (this._selection = new HealthSelection())}></uui-button>
      <b>${this.#words('healthSelectedOf', selected.length.toLocaleString(this.#locale), total.toLocaleString(this.#locale))}</b>
      <span>${size}</span>
      ${denied ? html`<small>${this.#words('healthAdminOnly')}</small>` : nothing}
      <span class="space"></span>
      ${this.chip === 'kept'
        ? html`<uui-button class="stop" look="primary" label=${this.#words('healthStopKeeping')} @click=${() => this.#act('health-stop-keeping')}></uui-button>`
        : html`<uui-button class="keep" look="secondary" label=${this.#words('healthKeep')} @click=${() => this.#act('health-keep')}></uui-button>
            <uui-button
              class="verb"
              look="primary"
              color=${this.chip === 'oversized' ? 'positive' : 'danger'}
              label=${this.#words(KINDS[this.chip].verb)}
              ?disabled=${denied}
              @click=${() => this.#act()}></uui-button>`}
    </div>`;
  }

  static override styles = [
    healthScreenStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3, 9px);
        min-height: 0;
        container-type: inline-size;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4, 12px);
        border-bottom: 1px solid var(--uui-color-border);
      }

      /*
       * The tabs at their own width, shrinking only when the window has no room for them. Stretched to
       * fill the toolbar, UUI 2.0.2's tab group measured its tabs over and over, which the browser
       * reports as a "ResizeObserver loop" (design §16.16).
       */
      .toolbar uui-tab-group {
        flex: 0 1 auto;
        min-width: 0;
      }

      .tab {
        white-space: nowrap;
      }

      .count {
        margin-left: var(--uui-size-space-1, 3px);
        color: var(--uui-color-text-alt);
      }

      .filters {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3, 9px);
      }

      .filters .folder {
        font-weight: bold;
        white-space: nowrap;
      }

      .search {
        flex: 1;
        min-width: 8em;
      }

      /* The table scrolls on its own, between the toolbar and the selection bar. */
      .table {
        flex: 1;
        min-height: 0;
        overflow: auto;
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }

      /* The box is drawn in the content's coordinates, so it scrolls with the rows it covers. */
      .content {
        position: relative;
        min-height: 100%;
      }

      /*
       * UUI's table is a CSS table, which cannot let a group row's label run across the columns; a grid
       * with every row on its subgrid can, and keeps the columns lined up. The grid is this element's own
       * rather than \`uui-table\`: newer UUI wraps that table's slot in a box of its own, which a grid on
       * the table never reaches (measured on the newest 17, design §16.16). The rows and cells are
       * UUI's, with their own padding, height and borders.
       */
      .grid {
        display: grid;
        grid-template-columns: 44px ${unsafeCSS(ROW_THUMB + 16)}px minmax(10em, 1fr) minmax(6em, 0.45fr) max-content max-content;
      }

      uui-table-head,
      uui-table-row {
        display: grid;
        grid-template-columns: subgrid;
        grid-column: 1 / -1;
      }

      uui-table-head-cell,
      uui-table-cell {
        display: flex;
        align-items: center;
        min-width: 0;
        --uui-table-cell-padding: 0 var(--uui-size-4, 12px);
        --uui-table-cell-height: 44px;
      }

      .check {
        justify-content: center;
        --uui-table-cell-padding: 0;
      }

      .thumb {
        --uui-table-cell-padding: 0 var(--uui-size-2, 6px);
      }

      .thumb img,
      .thumb .tile {
        width: ${unsafeCSS(ROW_THUMB)}px;
        height: ${unsafeCSS(ROW_THUMB)}px;
        border-radius: 3px;
        object-fit: cover;
        flex: none;
      }

      .thumb .tile {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--uui-color-surface-alt);
        color: var(--uui-color-text-alt);
      }

      /* The whole name, wrapped where it has to be, never cut off (design §16.15). */
      [data-cell='name'] {
        gap: var(--uui-size-space-2, 6px);
        flex-wrap: wrap;
        overflow-wrap: anywhere;
        padding-top: var(--uui-size-1, 3px);
        padding-bottom: var(--uui-size-1, 3px);
      }

      .size {
        justify-content: flex-end;
        white-space: nowrap;
      }

      .changed {
        white-space: nowrap;
      }

      .group-label {
        grid-column: 2 / -1;
        gap: var(--uui-size-space-2, 6px);
        white-space: nowrap;
        overflow: hidden;
      }

      uui-table-row.group {
        background: var(--uui-color-surface-alt);
      }

      uui-table-row[data-id] {
        cursor: default;
      }

      uui-table-row[data-id]:hover {
        background: var(--uui-color-surface-emphasis);
      }

      /* The current row, which the details pane shows: core's colour for the item you are on. */
      uui-table-row[current] {
        background: var(--uui-color-current);
        color: var(--uui-color-current-contrast);
      }

      uui-table-row[current] .muted {
        color: inherit;
      }

      @container (max-width: ${unsafeCSS(NARROW_TABLE)}px) {
        .grid {
          grid-template-columns: 44px ${unsafeCSS(ROW_THUMB + 16)}px minmax(6em, 1fr) max-content;
        }

        .folder-cell,
        .changed {
          display: none;
        }
      }

      .empty {
        margin: 0;
        padding: var(--uui-size-space-4, 12px);
      }

      /* Core's collection selection bar: its selected fill and contrast text, its padding and gaps. */
      .selection {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--uui-size-3, 9px);
        padding: var(--uui-size-space-4, 12px) var(--uui-size-space-5, 18px);
        background: var(--uui-color-selected);
        color: var(--uui-color-selected-contrast);
        border-radius: var(--uui-border-radius, 3px);
      }

      .selection .space {
        flex: 1;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-list': UmbraDesktopHealthListElement;
  }
}
