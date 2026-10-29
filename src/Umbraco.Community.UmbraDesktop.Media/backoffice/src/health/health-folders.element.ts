import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { UmbraDesktopMediaHealthResult } from './media-health.context.js';
import type { HealthFolder } from './health.client.js';
import { breakdownOf, placesOf } from './health-folders.js';
import type { HealthFolderChild, HealthFolderFigures } from './health-folders.js';
import { sizeText } from './health-model.js';
import { wordsOf } from '../shared/words.js';
import { healthScreenStyles } from './health-styles.js';

/** How far each level of the tree is indented, in CSS pixels. */
const INDENT = 20;

/**
 * Storage by folder (design §16.18; Where the space goes before that), as a tree you expand (§16.17;
 * §16.15 had it as pages you clicked into): a table whose root row is the library, then its places,
 * largest first, each with its bar, its size, a button per kind of what in it can go, and **Open in
 * Media Manager** as an icon at the end of its row. The overview draws the library's bar, so this does
 * not draw it again. A place with places under
 * it has an arrow and opens in the same table, indented, its places largest first and then a line for
 * the items directly in it. A place is a folder or any item with items under it, as the Media
 * Manager's tree counts one (`placesOf`); one with no places under it has no arrow, since opening it
 * would only say how many items it holds, which its row already does. The sums are
 * `health-folders.ts`'s; this draws them.
 *
 * It answers "where", the cleanup list answers "what can go", and the tags join the two: a tag opens
 * the list for its place and everything under it, the line of items directly in a place opens the
 * list on those alone, and the library's own row opens it for the whole library.
 *
 * Built from UUI's table, box, tag and expand symbol, the one the backoffice's trees draw.
 *
 * Fires `health-open-grid` `{ kind, folderKey?, exact? }`, `health-show-folder` `{ folderKey }` (null
 * for the library), and `health-close-folders`.
 */
@customElement('umbradesktop-health-folders')
export class UmbraDesktopHealthFoldersElement extends UmbLitElement {
  /** The last check's result. */
  @property({ attribute: false })
  result?: UmbraDesktopMediaHealthResult;

  /**
   * The place the overview opened the tree on: the way down to it is expanded, and it too when it has
   * places under it. Null opens the tree at its top.
   */
  @property({ attribute: false })
  folderKey: string | null = null;

  /** The places expanded, by key. */
  @state()
  private _expanded = new Set<string>();

  /** The result the places were found in, and the places, so they are found once per result. */
  #places?: { from: UmbraDesktopMediaHealthResult; places: HealthFolder[] };

  /** This package's words. */
  #words = wordsOf(this.localize);

  override willUpdate(changed: Map<string, unknown>): void {
    super.willUpdate(changed);
    // Open on the place asked for: its way down expanded, and it too.
    if ((changed.has('folderKey') || changed.has('result')) && this.folderKey && this.result) {
      const byKey = new Map(this.#allPlaces.map((place) => [place.key, place]));
      const next = new Set(this._expanded);
      for (let place = byKey.get(this.folderKey), hops = 0; place && hops <= byKey.size; place = place.parentKey ? byKey.get(place.parentKey) : undefined, hops++) {
        next.add(place.key);
      }
      this._expanded = next;
    }
  }

  /** Every place of the result: its folders and the items that hold items. */
  get #allPlaces(): HealthFolder[] {
    const result = this.result!;
    if (this.#places && this.#places.from === result) return this.#places.places;
    this.#places = { from: result, places: placesOf(result.items, result.folders) };
    return this.#places.places;
  }

  /** The backoffice's culture, for counts. */
  get #locale(): string | undefined {
    return this.localize.lang() || undefined;
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
   * A count in the backoffice's culture.
   * @param count The count.
   */
  #count(count: number): string {
    return count.toLocaleString(this.#locale);
  }

  /**
   * Figures' size as it can honestly be said: unknown, at least, or the size.
   * @param figures The figures.
   */
  #size(figures: HealthFolderFigures): string {
    return sizeText(figures, figures.count, (key, bytes) => this.#words(key, bytes ?? ''));
  }

  /**
   * Expand a place, or collapse it with everything under it.
   * @param key The place.
   */
  #toggle(key: string): void {
    const next = new Set(this._expanded);
    if (!next.delete(key)) next.add(key);
    this._expanded = next;
  }

  override render() {
    const result = this.result;
    if (!result) return nothing;
    const top = breakdownOf(result.items, this.#allPlaces, null);
    const of = top.bytes || 1;
    return html`<div class="head">
        <uui-button class="back" look="outline" label=${this.#words('healthBack')} @click=${() => this.#fire('health-close-folders')}>
          <uui-icon name="icon-arrow-left"></uui-icon>${this.#words('healthBack')}
        </uui-button>
        <h2>${this.#words('healthSpace')}</h2>
      </div>
      <uui-box>
        <uui-table>
          <uui-table-head>
            <uui-table-head-cell>${this.#words('healthFolder')}</uui-table-head-cell>
            <uui-table-head-cell class="track-cell"></uui-table-head-cell>
            <uui-table-head-cell class="size">${this.#words('healthSize')}</uui-table-head-cell>
            <uui-table-head-cell class="tags"></uui-table-head-cell>
            <uui-table-head-cell class="open"></uui-table-head-cell>
          </uui-table-head>
          <uui-table-row data-library>
            <uui-table-cell>
              <span class="place">
                <span class="expand-space"></span>
                <uui-icon name="icon-pictures"></uui-icon>
                <b class="name">${this.#words('healthLibraryName')}</b>
              </span>
            </uui-table-cell>
            <uui-table-cell class="track-cell">${this.#renderBar(top, 'track', of)}</uui-table-cell>
            <uui-table-cell class="size"><b>${this.#size(top)}</b></uui-table-cell>
            <uui-table-cell class="tags">${this.#renderTags(top, {})}</uui-table-cell>
            <uui-table-cell class="open">${this.#renderOpen(null)}</uui-table-cell>
          </uui-table-row>
          ${this.#renderLevel(null, this.#words('healthLibraryName'), of, 1)}
        </uui-table>
      </uui-box>`;
  }

  /**
   * **Open in Media Manager** for a place, as an icon at the end of its row: the label is its name for
   * a screen reader and its title on hover.
   * @param key The place, or null for the library.
   */
  #renderOpen(key: string | null) {
    return html`<uui-button
      class="open-in-manager"
      look="secondary"
      compact
      label=${this.#words('healthOpenInManager')}
      title=${this.#words('healthOpenInManager')}
      @click=${(event: Event) => {
        event.stopPropagation();
        this.#fire('health-show-folder', { folderKey: key });
      }}><uui-icon name="icon-out"></uui-icon></uui-button>`;
  }

  /**
   * One level of the tree: the places directly in a place, each followed by its own level when it is
   * expanded, then the line of items directly in it.
   * @param key The place, or null for the library.
   * @param name Its name, for the line of its items.
   * @param of What a full bar stands for: the library's size, so every row compares with every other.
   * @param depth How deep the level is, 0 at the top.
   * @returns The level's rows.
   */
  #renderLevel(key: string | null, name: string, of: number, depth: number): unknown {
    const at = breakdownOf(this.result!.items, this.#allPlaces, key);
    return html`${at.children.map(
      (child) =>
        html`${this.#renderRow(child, of, depth)}${child.folders && this._expanded.has(child.key) ? this.#renderLevel(child.key, child.name, of, depth + 1) : nothing}`,
    )}
    ${at.direct ? this.#renderDirect(at.direct, key, name, of, depth) : nothing}`;
  }

  /**
   * A bar cut by health, in the overview's order: what is fine first, what can go at the end.
   * @param figures The figures.
   * @param kind The bar's class, a row's `track`.
   * @param of What a full bar stands for.
   */
  #renderBar(figures: HealthFolderFigures, kind: 'track', of = figures.bytes || 1) {
    const width = (bytes: number) => `width:${(bytes / of) * 100}%`;
    return html`<span class=${kind}>
      <span data-kind="fine" style=${width(figures.fine)}></span>
      <span data-kind="oversized" style=${width(figures.oversized)}></span>
      <span data-kind="unused" style=${width(figures.unused)}></span>
    </span>`;
  }

  /**
   * What in a row can go, a button per kind that opens the cleanup list on it, with the arrow that
   * says it goes somewhere, so it never reads as part of the row, whose click only opens it (Luuk,
   * 2026-10-29). Nothing when nothing can: the column has no heading, and "28 unused" says it all. UUI's
   * own danger and positive, the colours the health tokens take for unused and oversized, so a theme
   * restyles both at once.
   * @param figures The row's figures.
   * @param open What a button opens the list on, besides its kind: nothing more for the library.
   */
  #renderTags(figures: HealthFolderFigures, open: { folderKey?: string | null; exact?: boolean }) {
    if (!figures.unusedCount && !figures.oversizedCount) return nothing;
    const tag = (kind: 'unused' | 'oversized', count: number, word: 'healthTagUnused' | 'healthTagOversized') =>
      count
        ? html`<uui-button
            data-kind=${kind}
            look="secondary"
            color=${kind === 'unused' ? 'danger' : 'positive'}
            compact
            label=${this.#words(word, this.#count(count))}
            @click=${(event: Event) => {
              event.stopPropagation();
              this.#fire('health-open-grid', { kind, ...open });
            }}
            >${this.#words(word, this.#count(count))}<uui-icon name="icon-arrow-right"></uui-icon
          ></uui-button>`
        : nothing;
    return html`${tag('unused', figures.unusedCount, 'healthTagUnused')}${tag('oversized', figures.oversizedCount, 'healthTagOversized')}`;
  }

  /**
   * A place's row: its arrow when it has places under it, its icon and name indented to its depth, its
   * bar, size and tags, and **Open in Media Manager**. A click on a place with places under it expands
   * it, as a click on a tree item's name does in the Media Manager.
   * @param child The place.
   * @param of The library's size, a full bar.
   * @param depth Its depth.
   */
  #renderRow(child: HealthFolderChild, of: number, depth: number) {
    const open = this._expanded.has(child.key);
    return html`<uui-table-row
      data-folder=${child.key}
      class=${child.folders ? 'folder branch' : 'folder'}
      @click=${() => child.folders && this.#toggle(child.key)}>
      <uui-table-cell>
        <span class="place" style="padding-left:${depth * INDENT}px">
          ${child.folders
            ? html`<button
                type="button"
                class="expand"
                aria-expanded=${open ? 'true' : 'false'}
                aria-label=${child.name}
                @click=${(event: Event) => {
                  event.stopPropagation();
                  this.#toggle(child.key);
                }}>
                <uui-symbol-expand ?open=${open}></uui-symbol-expand>
              </button>`
            : html`<span class="expand-space"></span>`}
          <uui-icon name="icon-folder"></uui-icon>
          <span class="name">${child.name}</span>
        </span>
      </uui-table-cell>
      <uui-table-cell class="track-cell">${this.#renderBar(child, 'track', of)}</uui-table-cell>
      <uui-table-cell class="size"><b>${this.#size(child)}</b></uui-table-cell>
      <uui-table-cell class="tags">${this.#renderTags(child, { folderKey: child.key })}</uui-table-cell>
      <uui-table-cell class="open">${this.#renderOpen(child.key)}</uui-table-cell>
    </uui-table-row>`;
  }

  /**
   * The items directly in a place, not in a place under it: one line at the depth of its places,
   * whose tags open the list on those alone.
   * @param direct Their figures.
   * @param key The place, or null for the library.
   * @param name Its name.
   * @param of The library's size, a full bar.
   * @param depth The depth of the place's level.
   */
  #renderDirect(direct: HealthFolderFigures, key: string | null, name: string, of: number, depth: number) {
    const line = key === null ? this.#words('healthDirectRoot', this.#count(direct.count)) : this.#words('healthDirectIn', this.#count(direct.count), name);
    return html`<uui-table-row data-direct=${key ?? ''}>
      <uui-table-cell>
        <span class="place" style="padding-left:${depth * INDENT}px">
          <span class="expand-space"></span>
          <uui-icon name="icon-picture"></uui-icon>
          <span class="muted">${line}</span>
        </span>
      </uui-table-cell>
      <uui-table-cell class="track-cell">${this.#renderBar(direct, 'track', of)}</uui-table-cell>
      <uui-table-cell class="size"><b>${this.#size(direct)}</b></uui-table-cell>
      <uui-table-cell class="tags">${this.#renderTags(direct, { folderKey: key, exact: true })}</uui-table-cell>
      <uui-table-cell class="open"></uui-table-cell>
    </uui-table-row>`;
  }

  static override styles = [
    healthScreenStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3, 9px);
      }

      .head {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4, 12px);
        flex-wrap: wrap;
      }

      h2 {
        flex: 1;
        margin: 0;
        font-size: var(--uui-type-h4-size, 21px);
        line-height: 1.2;
      }

      .track {
        display: flex;
        overflow: hidden;
        background: var(--uui-color-surface-alt);
      }

      .track {
        height: 8px;
        border-radius: 4px;
        min-width: 3em;
      }

      .track span {
        display: block;
        height: 100%;
        background: var(--umbradesktop-health-colour);
      }

      uui-box {
        --uui-box-default-padding: 0;
      }

      uui-table-row.branch {
        cursor: pointer;
      }

      uui-table-row.folder:hover {
        background: var(--uui-color-surface-emphasis);
      }

      .place {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2, 6px);
      }

      .expand,
      .expand-space {
        flex: none;
        width: 20px;
        height: 20px;
      }

      .expand {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: var(--uui-border-radius, 3px);
        background: none;
        color: inherit;
        cursor: pointer;
      }

      .expand:focus-visible {
        outline: 2px solid var(--uui-color-focus, currentColor);
      }

      .place uui-icon {
        color: var(--uui-color-text-alt);
      }

      .track-cell {
        width: 30%;
      }

      .size {
        text-align: right;
        white-space: nowrap;
      }

      .tags {
        white-space: nowrap;
      }

      .tags uui-button + uui-button {
        margin-left: var(--uui-size-space-1, 3px);
      }

      .tags uui-icon {
        margin-left: var(--uui-size-space-1, 3px);
      }

      [data-library] {
        background: var(--uui-color-surface-alt);
      }

      .open {
        width: 48px;
        text-align: right;
      }

    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-folders': UmbraDesktopHealthFoldersElement;
  }
}
