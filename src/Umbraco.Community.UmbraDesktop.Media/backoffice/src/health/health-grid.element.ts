import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { HealthFolder } from './health.client.js';
import { CELL_GAP, CELL_HEIGHT, HEALTH_SORTS, HealthSelection, ORPHAN_GROUP, cellsPerRow, chipCounts, gridOf, rowsOf } from './health-grid.js';
import type { HealthChip, HealthEntry, HealthGroup, HealthSort } from './health-grid.js';
import { HEALTH_KINDS, isImage, sizeText } from './health-model.js';
import type { HealthKind } from './health-model.js';
import { THUMB_EDGE, isPreviewable, thumbEdge } from './health-media.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { healthScreenStyles } from './health-styles.js';

/** Each kind's tab title, and the verb its selection bar offers. */
const KINDS: Record<HealthKind, { title: WordKey; verb: WordKey; event: string }> = {
  unused: { title: 'healthUnused', verb: 'healthTrash', event: 'health-trash' },
  orphaned: { title: 'healthOrphaned', verb: 'healthDelete', event: 'health-delete' },
  oversized: { title: 'healthOversized', verb: 'healthOptimize', event: 'health-optimize' },
};

/** Each sort's words. */
const SORTS: Record<HealthSort, WordKey> = { largest: 'healthSortLargest', smallest: 'healthSortSmallest', name: 'healthSortName' };

/**
 * How much of a card's foot `uui-card-media` covers with its name and size, in CSS pixels: 58, measured on a
 * 120-px card in a real backoffice (design §16.14). An icon is drawn in the part above it, so it is
 * never half hidden, as core's own file symbol was at this size.
 */
const CARD_CAPTION = 58;

/** How far ahead of the window a row's thumbnails are signed, so they are there when it scrolls in. */
const SIGN_AHEAD = `${CELL_HEIGHT * 2}px`;

/**
 * The grid (design §16.4, mock scene 5): one place to work in, opened from an overview row, a folder,
 * or **All folders**. A tab per kind with its count, a name search and a sort; the kind's entries
 * grouped by folder, largest group first, each group with its own checkbox, count and size, so one
 * tick takes a whole folder; thumbnails rather than rows; and a selection bar with the kind's verb.
 *
 * The cards are core's own media card, `uui-card-media`, as core's media grid and so the Media
 * Manager draw them: ticking a card's checkbox selects it, clicking the picture opens it, which here
 * is the preview. There is no Grid / One by one switch (plan Decision 11): the preview is the one by
 * one.
 *
 * A group shows its first row with "+n more"; only rows on screen are drawn (`content-visibility`,
 * plan Decision 10), and only rows near the screen have their thumbnails signed.
 *
 * Fires `health-preview` `{ id, ids }` (the visible order, for the preview's arrows), the verbs
 * `health-trash`, `health-delete` and `health-optimize` `{ ids, entries }`, and `health-close-grid`
 * for **Back**. The window acts; the entries that went leave through {@link entries}.
 */
@customElement('umbradesktop-health-grid')
export class UmbraDesktopHealthGridElement extends UmbLitElement {
  /** Every entry of the last check, as the window derives them from the result. */
  @property({ attribute: false })
  entries: HealthEntry[] = [];

  /** Every folder of the check, for the folder filter and its name. */
  @property({ attribute: false })
  folders: HealthFolder[] = [];

  /** The tab shown; the window opens the grid on one, then the person changes it here. */
  @property()
  chip: HealthChip = 'unused';

  /**
   * The folder shown with everything under it, null for the items at the root, undefined for every
   * folder. Opened with one from Where the space goes; **All folders** clears it here.
   */
  @property({ attribute: false })
  folderKey?: string | null;

  /** Whether the person is an administrator, who alone may delete files from disk. */
  @property({ type: Boolean })
  admin = false;

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

  /** The groups the person opened past their first row, by key. */
  @state()
  private _open = new Set<string>();

  /** How many cells a row has room for, measured. */
  @state()
  private _columns = 0;

  /** The signed thumbnails, by file URL. */
  @state()
  private _thumbnails = new Map<string, string>();

  /** This package's words. */
  #words = wordsOf(this.localize);

  /**
   * Measures the groups' width, for how many cells a row takes; taken on the next frame, since
   * redrawing the rows changes the height the observer also reports (the overview's strips found the
   * browser's "ResizeObserver loop" error this way).
   */
  #resize = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    const columns = cellsPerRow(width);
    if (width && columns !== this._columns) requestAnimationFrame(() => (this._columns = columns));
  });

  /** Watches the rows coming near the screen, to sign their thumbnails then and not before. */
  #near = new IntersectionObserver((rows) => this.#sign(rows.filter((row) => row.isIntersecting).map((row) => row.target as HTMLElement)), {
    rootMargin: `${SIGN_AHEAD} 0px`,
  });

  /** The rows already observed, so each is observed once. */
  #watched = new WeakSet<Element>();

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize.disconnect();
    this.#near.disconnect();
  }

  override willUpdate(changed: Map<string, unknown>): void {
    super.willUpdate(changed);
    // What a verb took away is no longer selectable, whatever the selection said.
    if (changed.has('entries')) this._selection = this._selection.within(this.entries);
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    const groups = this.renderRoot.querySelector('.groups');
    if (groups && !this.#watched.has(groups)) {
      this.#watched.add(groups);
      this.#resize.observe(groups);
    }
    for (const row of this.renderRoot.querySelectorAll('.cells')) {
      if (this.#watched.has(row)) continue;
      this.#watched.add(row);
      this.#near.observe(row);
    }
  }

  /**
   * Sign the thumbnails of rows near the screen that are not signed yet. The context caches what it
   * signed, so a row seen again asks nothing.
   * @param rows The rows.
   */
  #sign(rows: HTMLElement[]): void {
    if (!this.signThumbnails || !rows.length) return;
    const ids = new Set(rows.flatMap((row) => (row.dataset.ids ?? '').split(' ')));
    const subjects = this.entries
      .filter((entry) => ids.has(entry.id) && isPreviewable(entry.url) && !this._thumbnails.has(entry.url!))
      .map((entry) => (entry.item ? { url: entry.url!, key: entry.item.key } : { url: entry.url! }));
    if (!subjects.length) return;
    void this.signThumbnails(subjects, thumbEdge(window.devicePixelRatio || 1)).then((signed) => {
      this._thumbnails = new Map([...this._thumbnails, ...signed]);
    });
  }

  /** The backoffice's culture, for counts. */
  get #locale(): string | undefined {
    return this.localize.lang() || undefined;
  }

  /** The groups the grid shows now. */
  get #groups(): HealthGroup[] {
    return gridOf(this.entries, { chip: this.chip, folderKey: this.folderKey, search: this._search, sort: this._sort }, this.folders);
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
   * Select or unselect one entry, as its card's checkbox says.
   * @param id The entry.
   * @param on Whether it is selected now.
   */
  #select(id: string, on: boolean): void {
    if (this._selection.has(id) !== on) this._selection = this._selection.toggle(id);
  }

  /**
   * Run the tab's verb on the selection. Delete asks first, in the window, so its selection stays
   * until the files have gone; the others act at once, and the selection clears.
   */
  #act(): void {
    if (this.chip === 'kept') return;
    const entries = this.entries.filter((entry) => this._selection.has(entry.id));
    if (!entries.length) return;
    this.#fire(KINDS[this.chip].event, { ids: entries.map((entry) => entry.id), entries });
    if (this.chip !== 'orphaned') this._selection = new HealthSelection();
  }

  override render() {
    const groups = this.#groups;
    return html`${this.#renderToolbar()}
      <div class="groups">${this._columns ? this.#renderGroups(groups) : nothing}</div>
      ${this.#renderSelection()}`;
  }

  /** Back, a tab per kind with its count, and under them the folder, the search and the sort. */
  #renderToolbar() {
    const counts = chipCounts(this.entries, this.folderKey, this.folders);
    const folder = this.folderKey === undefined ? undefined : this.folderKey === null ? this.#words('healthRoot') : (this.folders.find((each) => each.key === this.folderKey)?.name ?? '');
    return html`<div class="toolbar">
        <uui-button class="back" look="secondary" label=${this.#words('healthBack')} @click=${() => this.#fire('health-close-grid')}>
          <uui-icon name="icon-arrow-left"></uui-icon>${this.#words('healthBack')}
        </uui-button>
        <uui-tab-group>
          ${HEALTH_KINDS.map(
            // One span, since uui-tab stacks what it is given: the title and its count stay on one line.
            (kind) => html`<uui-tab label=${this.#words(KINDS[kind].title)} ?active=${this.chip === kind} data-kind=${kind} @click=${() => this.#choose(kind)}>
              <span class="tab">${this.#words(KINDS[kind].title)} <span class="count">${counts[kind].toLocaleString(this.#locale)}</span></span>
            </uui-tab>`,
          )}
        </uui-tab-group>
      </div>
      <div class="filters">
        ${folder === undefined
          ? nothing
          : html`<span class="folder">${this.#words('healthInFolder', folder)}</span>
              <uui-button class="all-folders" look="secondary" compact label=${this.#words('healthAllFolders')} @click=${() => (this.folderKey = undefined)}></uui-button>`}
        <uui-input
          class="search"
          label=${this.#words('healthSearch')}
          placeholder=${this.#words('healthSearch')}
          .value=${this._search}
          @input=${(event: Event) => (this._search = (event.target as HTMLInputElement).value ?? '')}>
          <uui-icon name="icon-search" slot="prepend"></uui-icon>
        </uui-input>
        <uui-select
          class="sort"
          label=${this.#words('healthSort')}
          .options=${HEALTH_SORTS.map((sort) => ({ name: this.#words(SORTS[sort]), value: sort, selected: sort === this._sort }))}
          @change=${(event: Event) => (this._sort = (event.target as HTMLSelectElement).value as HealthSort)}></uui-select>
      </div>`;
  }

  /**
   * Every group, or why there is nothing.
   * @param groups The groups.
   */
  #renderGroups(groups: HealthGroup[]) {
    if (!groups.length) return html`<p class="muted empty">${this.#words(this._search.trim() ? 'healthNoMatch' : 'healthNothingHere')}</p>`;
    const order = groups.flatMap((group) => group.entries.map((entry) => entry.id));
    return groups.map((group) => this.#renderGroup(group, order));
  }

  /**
   * One group: its checkbox labelled with the folder, its count and size, and its rows of cards.
   * @param group The group.
   * @param order Every visible entry's id, in order, for the preview's arrows.
   */
  #renderGroup(group: HealthGroup, order: string[]) {
    const state = this._selection.groupState(group);
    const label = group.key === ORPHAN_GROUP ? this.#words('healthOnDisk') : group.label || this.#words('healthRoot');
    const { rows, more } = rowsOf(group, this._columns, this._open.has(group.key));
    const size = sizeText(group, group.entries.length, (key, bytes) => this.#words(key, bytes ?? ''));
    return html`<section class="group" data-group=${group.key}>
      <div class="group-head">
        <uui-checkbox
          label=${label}
          .checked=${state === 'all'}
          .indeterminate=${state === 'some'}
          @change=${() => (this._selection = this._selection.toggleGroup(group))}
          ><b>${label}</b></uui-checkbox
        >
        <span class="muted">${this.#words('healthGroupCount', group.entries.length.toLocaleString(this.#locale))} · ${size}</span>
      </div>
      ${rows.map(
        (row, index) => html`<div class="cells" data-ids=${row.map((entry) => entry.id).join(' ')}>
          ${row.map((entry) => this.#renderCard(entry, order))}
          ${more && index === rows.length - 1
            ? html`<button type="button" class="more" @click=${() => (this._open = new Set([...this._open, group.key]))}>
                ${this.#words('healthMore', more.toLocaleString(this.#locale))}
              </button>`
            : nothing}
        </div>`,
      )}
    </section>`;
  }

  /**
   * One card: core's media card with the signed thumbnail; for a file that is not a picture, an icon
   * with its extension; for an item without a file, an icon alone; never an unsigned request.
   * @param entry The entry.
   * @param order Every visible entry's id, for the preview.
   */
  #renderCard(entry: HealthEntry, order: string[]) {
    const size = entry.sized ? formatBytes(entry.bytes) : this.#words('healthSizeUnknown');
    const previewable = isPreviewable(entry.url);
    const src = previewable ? this._thumbnails.get(entry.url!) : undefined;
    const extension = entry.item?.extension ?? (entry.orphan && entry.name.includes('.') ? entry.name.split('.').pop()! : '');
    const media = src
      ? html`<img src=${src} alt="" />`
      : previewable
        ? html`<span class="tile"></span>`
        : html`<span class="tile">
            <uui-icon name=${entry.item && isImage(entry.item) ? 'icon-picture' : 'icon-document'}></uui-icon>
            ${extension ? html`<small>${extension.toUpperCase()}</small>` : nothing}
          </span>`;
    return html`<uui-card-media
      data-id=${entry.id}
      name=${entry.name}
      detail=${size}
      selectable
      ?selected=${this._selection.has(entry.id)}
      @selected=${() => this.#select(entry.id, true)}
      @deselected=${() => this.#select(entry.id, false)}
      @open=${() => this.#fire('health-preview', { id: entry.id, ids: order })}
      >${media}</uui-card-media
    >`;
  }

  /**
   * The selection bar, while anything is selected: how many and how much, Clear selection, and the
   * tab's verb. Delete is for an administrator only; for anyone else it is greyed out and says why.
   */
  #renderSelection() {
    if (!this._selection.count || this.chip === 'kept') return nothing;
    const selected = this.entries.filter((entry) => this._selection.has(entry.id));
    const unknown = selected.filter((entry) => !entry.sized).length;
    const size = sizeText({ bytes: this._selection.bytes(this.entries), unknown }, selected.length, (key, bytes) => this.#words(key, bytes ?? ''));
    const denied = this.chip === 'orphaned' && !this.admin;
    return html`<div class="selection">
      <b>${this.#words('healthSelected', selected.length.toLocaleString(this.#locale))}</b>
      <span class="muted">${size}</span>
      ${denied ? html`<small class="muted">${this.#words('healthAdminOnly')}</small>` : nothing}
      <span class="space"></span>
      <uui-button look="secondary" label=${this.#words('healthClearSelection')} @click=${() => (this._selection = new HealthSelection())}></uui-button>
      <uui-button
        class="verb"
        look="primary"
        color=${this.chip === 'oversized' ? 'default' : 'danger'}
        label=${this.#words(KINDS[this.chip].verb)}
        ?disabled=${denied}
        @click=${this.#act}></uui-button>
    </div>`;
  }

  static override styles = [
    healthScreenStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-4, 12px);
        min-height: 100%;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4, 12px);
        border-bottom: 1px solid var(--uui-color-border);
      }

      .toolbar uui-tab-group {
        flex: 1;
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

      .folder {
        font-weight: bold;
        white-space: nowrap;
      }

      .search {
        flex: 1;
        min-width: 8em;
      }

      .groups {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-5, 18px);
      }

      .group {
        display: flex;
        flex-direction: column;
        gap: ${unsafeCSS(CELL_GAP)}px;
      }

      .group-head {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3, 9px);
      }

      /*
       * A row of cards, each the thumbnail's edge square, the size the resizer is asked for. Rows off
       * screen are not drawn; the browser is told their height first, so the scrollbar is right.
       */
      .cells {
        display: grid;
        grid-template-columns: repeat(auto-fill, ${unsafeCSS(THUMB_EDGE)}px);
        grid-auto-rows: ${unsafeCSS(CELL_HEIGHT)}px;
        gap: ${unsafeCSS(CELL_GAP)}px;
        content-visibility: auto;
        contain-intrinsic-size: auto ${unsafeCSS(CELL_HEIGHT)}px;
      }

      uui-card-media {
        width: ${unsafeCSS(THUMB_EDGE)}px;
        height: ${unsafeCSS(CELL_HEIGHT)}px;
      }

      uui-card-media img {
        object-fit: cover;
      }

      .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        box-sizing: border-box;
        padding-bottom: ${unsafeCSS(CARD_CAPTION)}px;
        background: var(--uui-color-surface-alt);
        color: var(--uui-color-text-alt);
        font-size: 28px;
      }

      .tile small {
        font-size: var(--uui-type-small-size, 12px);
        font-weight: bold;
      }

      /*
       * "+n more" in a card's place, drawn as an empty card: the card's surface, border and corners, so
       * it reads as one more place in the row on the grid's background, where the overview's strip tile
       * (surface-alt, on a white row) would disappear.
       */
      .more {
        width: ${unsafeCSS(THUMB_EDGE)}px;
        height: ${unsafeCSS(CELL_HEIGHT)}px;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius-2, 6px);
        background: var(--uui-color-surface);
        color: var(--uui-color-text-alt);
        font: inherit;
        font-weight: bold;
        cursor: pointer;
      }

      .more:hover {
        color: var(--uui-color-text);
      }

      .more:focus-visible {
        outline: 2px solid var(--uui-color-focus, currentColor);
        outline-offset: 2px;
      }

      .empty {
        margin: 0;
      }

      .selection {
        position: sticky;
        bottom: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3, 9px);
        padding: var(--uui-size-space-3, 9px) var(--uui-size-space-4, 12px);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-3, 0 4px 12px rgba(0, 0, 0, 0.2));
      }

      .space {
        flex: 1;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-grid': UmbraDesktopHealthGridElement;
  }
}
