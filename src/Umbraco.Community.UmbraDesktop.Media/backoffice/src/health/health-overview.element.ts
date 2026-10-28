import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { UmbraDesktopMediaHealthResult } from './media-health.context.js';
import type { HealthItem, HealthOrphan } from './health.client.js';
import { HEALTH_KINDS, OVERSIZED_BYTES, checkedOn, cleanupOf, foldersOf, isImage, isStale, sizeNote, sizeOfAll, sizeOfList, sizeText } from './health-model.js';
import type { HealthKind } from './health-model.js';
import { isPreviewable, thumbEdge } from './health-media.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { healthScreenStyles } from './health-styles.js';

/** The space between two thumbnails of a strip, in CSS pixels; the CSS and {@link stripCount} both read it. */
export const STRIP_GAP = 4;

/**
 * How many thumbnails a strip of a given width shows, and how many are left for "+n". As many as fit:
 * the strip sits under the row's title and line, so it has the row's width rather than a fixed three
 * (Luuk, 2026-10-28). When some are left over, the last place goes to "+n".
 * @param width The strip's width, in CSS pixels.
 * @param total How many things the row has.
 * @returns How many pictures to draw, and the count "+n" says.
 */
export function stripCount(width: number, total: number): { shown: number; more: number } {
  const places = Math.max(0, Math.floor((width + STRIP_GAP) / (STRIP_EDGE + STRIP_GAP)));
  const shown = total <= places ? total : Math.max(0, places - 1);
  return { shown, more: total - shown };
}

/**
 * A strip thumbnail's edge on screen, in CSS pixels. The picture is asked from the resizer at the
 * grid's {@link thumbEdge} size rather than this, on purpose: one size for both means the grid opens
 * on pictures the resizer and the browser already hold.
 */
export const STRIP_EDGE = 34;

/**
 * Check again's right padding, as a factor of `--uui-size-2`: UUI's own default for a button, named
 * here because the header's margin cancels exactly this much (see `.when uui-button`).
 */
const AGAIN_PADDING_FACTOR = 3;

/** Each row's words: its heading, its line, and its line when it is empty. */
const ROWS: Record<HealthKind, { title: WordKey; line: WordKey; none: WordKey }> = {
  unused: { title: 'healthUnused', line: 'healthUnusedLine', none: 'healthNoneUnused' },
  orphaned: { title: 'healthOrphaned', line: 'healthOrphanedLine', none: 'healthNoneOrphaned' },
  oversized: { title: 'healthOversized', line: 'healthOversizedLine', none: 'healthNoneOversized' },
};

/**
 * The overview (design §16.2, mock scene 1): the library and its health in one bar, the three rows in
 * the bar's colours, each ticked by default, one **Clean up** under the rows it acts on, and Where
 * the space goes. The figures all come from the pure model (`health-model.ts`); this only draws them
 * and keeps which rows are ticked.
 *
 * Orphaned files are deleted for good, which only an administrator may do, so for anyone else that
 * row is unticked and disabled with the reason: an affordance that says why, not one that disappears.
 *
 * On a check over a day old Clean up waits for a new one; the warning itself is the window's, in
 * the desktop's own notice, and **Check again** stays the one at the top.
 *
 * Fires `health-check` for **Check again**, and `health-cleanup` with the ticked kinds for **Clean
 * up**; the window asks before anything happens. Clicking a row or a folder opens the grid in step 2;
 * until then neither is drawn as a link, rather than drawn dead.
 */
@customElement('umbradesktop-health-overview')
export class UmbraDesktopHealthOverviewElement extends UmbLitElement {
  /** The last check's result. */
  @property({ attribute: false })
  result?: UmbraDesktopMediaHealthResult;

  /** Whether the person is an administrator, who alone may delete files from disk. */
  @property({ type: Boolean })
  admin = false;

  /** The time now, for how old the check is; the clock's unless a test hands one in. */
  @property({ attribute: false })
  now?: Date;

  /**
   * Signs thumbnails, through the health context: the server signs them, since a site with an HMAC
   * secret refuses an unsigned resizer URL. Without it, pictures show as plain tiles.
   */
  @property({ attribute: false })
  signThumbnails?: (subjects: Array<{ url: string; key?: string }>, edge: number) => Promise<Map<string, string>>;

  /** The strips' signed thumbnails, by file URL. */
  @state()
  private _thumbnails = new Map<string, string>();

  /** Each row's strip width, measured, so each strip shows as many thumbnails as it has room for. */
  @state()
  private _stripWidths: Partial<Record<HealthKind, number>> = {};

  /**
   * Measures the rows' text columns, which the strips fill. Only a change of width counts, and it is
   * taken on the next frame: drawing a strip changes a column's height, which the observer also
   * reports, and answering that in the same frame is the browser's "ResizeObserver loop" error.
   */
  #resize = new ResizeObserver((entries) => {
    const widths = { ...this._stripWidths };
    let changed = false;
    for (const entry of entries) {
      const kind = (entry.target as HTMLElement).dataset.text as HealthKind;
      const width = Math.floor(entry.contentRect.width);
      if (widths[kind] !== width) {
        widths[kind] = width;
        changed = true;
      }
    }
    if (changed) requestAnimationFrame(() => (this._stripWidths = widths));
  });

  /**
   * The room every strip gets: the narrowest row's, so all strips have the same number of places and
   * end where they start, together, whatever each row's size column says. Zero until every row with
   * a strip has been measured.
   */
  get #stripWidth(): number {
    const widths = HEALTH_KINDS.map((kind) => this._stripWidths[kind] ?? 0);
    return widths.some((width) => width === 0) ? 0 : Math.min(...widths);
  }

  /** The rows the person has ticked; every row to begin with. */
  @state()
  private _ticked = new Set<HealthKind>(HEALTH_KINDS);

  /** This package's words. */
  #words = wordsOf(this.localize);

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize.disconnect();
  }

  /**
   * Measure the rows' text columns as they appear, and ask for the strips' thumbnails whenever the
   * result or the room changes: the context signs each picture once, so a wider window only asks for
   * the pictures it did not show before.
   */
  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    for (const text of this.renderRoot.querySelectorAll<HTMLElement>('.text[data-text]')) this.#resize.observe(text);
    if ((changed.has('result') || changed.has('signThumbnails') || changed.has('_stripWidths')) && this.result && this.signThumbnails) {
      const subjects = HEALTH_KINDS.flatMap((kind) => {
        const list: ReadonlyArray<HealthItem | HealthOrphan> = this.result!.lists[kind];
        return list.slice(0, stripCount(this.#stripWidth, list.length).shown);
      })
        .filter((each) => isPreviewable(each.url))
        .map((each) => ('key' in each ? { url: each.url!, key: each.key } : { url: each.url }));
      if (subjects.length) void this.signThumbnails(subjects, thumbEdge(window.devicePixelRatio || 1)).then((signed) => (this._thumbnails = signed));
    }
  }

  /** The backoffice's culture, for numbers and the checked time, as the taskbar clock reads it. */
  get #locale(): string | undefined {
    return this.localize.lang() || undefined;
  }

  /**
   * Whether a row can be ticked: it has something in it, and orphaned files only for an
   * administrator.
   * @param kind The row.
   * @returns True when its checkbox is live.
   */
  #allowed(kind: HealthKind): boolean {
    return (this.result?.lists[kind].length ?? 0) > 0 && (this.admin || kind !== 'orphaned');
  }

  /** The rows that are ticked and may be. */
  get #effective(): Set<HealthKind> {
    return new Set(HEALTH_KINDS.filter((kind) => this._ticked.has(kind) && this.#allowed(kind)));
  }

  /**
   * Tick or untick a row.
   * @param kind The row.
   * @param on Whether it is ticked now.
   */
  #toggle(kind: HealthKind, on: boolean): void {
    const next = new Set(this._ticked);
    if (on) next.add(kind);
    else next.delete(kind);
    this._ticked = next;
  }

  /**
   * Ask for something; the window decides.
   * @param name The event.
   * @param detail What it carries.
   */
  #fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  override render() {
    const result = this.result;
    if (!result) return nothing;
    const cleanup = cleanupOf(result.lists, this.#effective, this.admin);
    const estimate = cleanup.rows.some((row) => row.estimate);
    const stale = isStale(result.checkedAt, this.now ?? new Date());
    const label = !cleanup.rows.length
      ? this.#words('healthCleanUpNothing')
      : this.#words(estimate ? 'healthCleanUpAbout' : 'healthCleanUp', formatBytes(cleanup.bytes));
    return html`
      ${this.#renderHead(result)} ${this.#renderBar(result)}
      <div class="rows">${HEALTH_KINDS.map((kind) => this.#renderRow(kind, result))}</div>
      <div class="foot">
        <uui-button
          class="clean-up"
          look="primary"
          size="l"
          label=${label}
          ?disabled=${!cleanup.rows.length || stale}
          @click=${() => this.#fire('health-cleanup', { kinds: cleanup.rows.map((row) => row.kind) })}></uui-button>
      </div>
      ${this.#renderSpace(result)}
    `;
  }

  /**
   * The library line and its size, and when it was checked with **Check again**.
   * @param result The result.
   */
  #renderHead(result: UmbraDesktopMediaHealthResult) {
    const on = checkedOn(result.checkedAt, new Date(), this.#locale);
    const day = on.day === 'today' ? this.#words('healthToday') : on.day === 'yesterday' ? this.#words('healthYesterday') : on.day;
    const total = sizeOfAll(result.items) + sizeOfAll(result.lists.orphaned);
    return html`<div class="head">
      <div>
        <b class="library">${this.#words('healthLibrary', result.items.length.toLocaleString(this.#locale))}</b>
        <div class="big">${formatBytes(total)}</div>
      </div>
      <div class="when">
        <span class="muted">${this.#words('healthChecked', day, on.time)}</span>
        <uui-button look="secondary" label=${this.#words('healthCheckAgain')} @click=${() => this.#fire('health-check')}>
          <uui-icon name="icon-refresh"></uui-icon>${this.#words('healthCheckAgain')}
        </uui-button>
      </div>
    </div>`;
  }

  /**
   * The bar cut by health, and under it what is fine and what can be freed, each under its own part.
   * What Clean up empties sits at the right end (Luuk, 2026-10-28), the part that would be poured
   * out, with unused last since it leaves whole; fine stays on the left, where the bar would end.
   * @param result The result.
   */
  #renderBar(result: UmbraDesktopMediaHealthResult) {
    const { bar } = result;
    const parts: Array<[string, number]> = [
      ['fine', bar.fine],
      ['oversized', bar.oversized],
      ['orphaned', bar.orphaned],
      ['unused', bar.unused],
    ];
    const total = parts.reduce((sum, [, bytes]) => sum + bytes, 0) || 1;
    return html`<div class="bar">
        ${parts.map(([kind, bytes]) => html`<span data-kind=${kind} style="width:${(bytes / total) * 100}%"></span>`)}
      </div>
      <div class="bar-line">
        <span class="muted"><i class="dot" data-kind="fine"></i>${this.#words('healthFine', formatBytes(bar.fine))}</span>
        <b>${this.#words('healthFreeable', formatBytes(bar.freeable))}</b>
      </div>`;
  }

  /**
   * One row: its colour, its checkbox labelled with its title (UUI 2.0.2's checkbox cannot hide its
   * label, so the label is the title, and selecting the title ticks the row), what happens to it, a
   * strip of what is in it, and its size.
   * The oversized row shows the images' size; Clean up counts their estimated saving (plan Decision 4).
   * @param kind The row.
   * @param result The result.
   */
  #renderRow(kind: HealthKind, result: UmbraDesktopMediaHealthResult) {
    const list: ReadonlyArray<HealthItem | HealthOrphan> = result.lists[kind];
    const words = ROWS[kind];
    const allowed = this.#allowed(kind);
    const count = list.length.toLocaleString(this.#locale);
    const line = !list.length
      ? this.#words(words.none, formatBytes(OVERSIZED_BYTES))
      : this.#words(words.line, count, formatBytes(OVERSIZED_BYTES));
    const denied = kind === 'orphaned' && !this.admin && list.length > 0;
    return html`<div class="row" data-row=${kind} data-kind=${kind} ?disabled=${!allowed}>
      <span class="edge"></span>
      <div class="text" data-text=${kind}>
        <uui-checkbox
          label=${this.#words(words.title)}
          ?checked=${allowed && this._ticked.has(kind)}
          ?disabled=${!allowed}
          @change=${(event: Event) => this.#toggle(kind, (event.target as HTMLInputElement).checked)}
          ><b>${this.#words(words.title)}</b></uui-checkbox
        >
        <small>${line}${denied ? html` <em>${this.#words('healthAdminOnly')}</em>` : nothing}</small>
        ${this.#renderStrip(list, this.#stripWidth)}
      </div>
      ${this.#renderSize(list)}
    </div>`;
  }

  /**
   * A row's size as it can honestly be said: unknown when nothing in it has a size, "at least" when
   * some of it has none, with how many under it, so a row of Engage's sizeless pictures never reads
   * 0 B.
   * @param list The row's list.
   */
  #renderSize(list: ReadonlyArray<HealthItem | HealthOrphan>) {
    const size = sizeOfList(list);
    const note = sizeNote(size, list.length, (count) => this.#words('healthSizeUnknownCount', count.toLocaleString(this.#locale)));
    return html`<span class="size">
      <b>${sizeText(size, list.length, (key, bytes) => this.#words(key, bytes ?? ''))}</b>
      ${note ? html`<small class="muted">${note}</small>` : nothing}
    </span>`;
  }

  /**
   * The first few things in a row as thumbnails from the resizer, and how many more. Something
   * without a picture, an item without a file or a file that is not an image, is an icon; a picture
   * whose signed thumbnail has not come yet is a plain tile, never an unsigned request.
   * Under the row's title and line, so every row's strip starts at the same place whatever its size
   * column says, and as long as the row is wide.
   * @param list The row's list, largest first.
   * @param width The room the strip has, measured; nothing is drawn before it is.
   */
  #renderStrip(list: ReadonlyArray<HealthItem | HealthOrphan>, width: number) {
    if (!list.length || !width) return nothing;
    const { shown, more: rest } = stripCount(width, list.length);
    return html`<span class="strip">
      ${list.slice(0, shown).map((each) => {
        if (isPreviewable(each.url)) {
          const src = this._thumbnails.get(each.url!);
          return src ? html`<img src=${src} alt="" loading="lazy" />` : html`<span class="icon"></span>`;
        }
        const picture = 'key' in each ? isImage(each) : false;
        return html`<span class="icon"><uui-icon name=${picture ? 'icon-picture' : 'icon-document'}></uui-icon></span>`;
      })}
      ${rest > 0 ? html`<span class="more">+${rest.toLocaleString(this.#locale)}</span>` : nothing}
    </span>`;
  }

  /**
   * Where the space goes: the largest top-level folders, each split by the same health as the bar and
   * in the same order, fine first and unused at the end, and how many more there are.
   * @param result The result.
   */
  #renderSpace(result: UmbraDesktopMediaHealthResult) {
    const { folders, more } = foldersOf(result.items, result.folders);
    if (!folders.length) return nothing;
    const largest = folders[0].bytes || 1;
    return html`<div class="space">
      <div class="space-head"><b>${this.#words('healthSpace')}</b><span class="muted">${this.#words('healthSpaceNote')}</span></div>
      ${folders.map((folder) => {
        const fine = folder.bytes - folder.unused - folder.oversized;
        const width = (bytes: number) => `width:${(bytes / largest) * 100}%`;
        return html`<div class="folder">
          <span class="name">${folder.key ? folder.name : this.#words('healthRoot')}</span>
          <span class="track">
            <span data-kind="fine" style=${width(fine)}></span>
            <span data-kind="oversized" style=${width(folder.oversized)}></span>
            <span data-kind="unused" style=${width(folder.unused)}></span>
          </span>
          <b>${formatBytes(folder.bytes)}</b>
        </div>`;
      })}
      ${more ? html`<div class="muted more-folders">${this.#words('healthMoreFolders', more.toLocaleString(this.#locale))}</div>` : nothing}
    </div>`;
  }

  static override styles = [
    healthScreenStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-4, 12px);
      }

      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--uui-size-space-4, 12px);
      }

      .library {
        font-size: var(--uui-type-small-size, 12px);
      }

      .big {
        font-size: 34px;
        font-weight: bold;
        line-height: 1.1;
      }

      .when {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--uui-size-space-2, 6px);
        white-space: nowrap;
      }

      /*
       * Check again's words end where the date and the bar end. A secondary uui-button draws no fill
       * at rest, so its right padding (UUI 2.0.2: --uui-size-2 times the padding factor) left the
       * words standing in from the edge. The factor is set here and the margin read from it, so the
       * two cannot drift apart.
       */
      .when uui-button {
        --uui-button-padding-right-factor: ${unsafeCSS(AGAIN_PADDING_FACTOR)};
        margin-right: calc(-1 * var(--uui-size-2, 6px) * ${unsafeCSS(AGAIN_PADDING_FACTOR)});
      }

      .bar {
        display: flex;
        height: 28px;
        border-radius: 6px;
        overflow: hidden;
        background: var(--uui-color-border);
      }

      .bar span {
        display: block;
        height: 100%;
        background: var(--umbradesktop-health-colour);
      }

      .bar-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-4, 12px);
        margin-top: calc(-1 * var(--uui-size-space-2, 6px));
      }

      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3, 9px);
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4, 12px);
        padding: var(--uui-size-space-3, 9px) var(--uui-size-space-4, 12px);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }

      .edge {
        align-self: stretch;
        flex: none;
        width: 4px;
        border-radius: 2px;
        background: var(--umbradesktop-health-colour);
      }

      .row[disabled] .edge {
        opacity: 0.4;
      }

      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .text small {
        color: var(--uui-color-text-alt);
      }

      .text em {
        font-style: normal;
        color: var(--uui-color-text);
      }

      .strip {
        display: flex;
        gap: ${unsafeCSS(STRIP_GAP)}px;
        margin-top: var(--uui-size-space-2, 6px);
      }

      .strip img,
      .strip .icon,
      .strip .more {
        width: ${unsafeCSS(STRIP_EDGE)}px;
        height: ${unsafeCSS(STRIP_EDGE)}px;
        border-radius: 4px;
        box-sizing: border-box;
      }

      .strip img {
        object-fit: cover;
        background: var(--uui-color-surface-alt);
      }

      .strip .icon,
      .strip .more {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--uui-color-surface-alt);
        color: var(--uui-color-text-alt);
        font-size: 11px;
        font-weight: bold;
      }

      .size {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        min-width: 4.5em;
        text-align: right;
      }

      .size b {
        font-size: 15px;
      }

      .size small {
        font-size: var(--uui-type-small-size, 12px);
        white-space: nowrap;
      }

      .foot {
        display: flex;
        justify-content: flex-end;
      }

      .space {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2, 6px);
        padding: var(--uui-size-space-3, 9px) var(--uui-size-space-4, 12px);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }

      .space-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--uui-size-space-4, 12px);
      }

      .folder {
        display: grid;
        grid-template-columns: minmax(0, 9em) minmax(0, 1fr) 5em;
        align-items: center;
        gap: var(--uui-size-space-3, 9px);
      }

      .folder .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .folder b {
        text-align: right;
      }

      .track {
        display: flex;
        height: 8px;
        border-radius: 4px;
        overflow: hidden;
        background: var(--uui-color-surface-alt);
      }

      .track span {
        display: block;
        height: 100%;
        background: var(--umbradesktop-health-colour);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-overview': UmbraDesktopHealthOverviewElement;
  }
}
