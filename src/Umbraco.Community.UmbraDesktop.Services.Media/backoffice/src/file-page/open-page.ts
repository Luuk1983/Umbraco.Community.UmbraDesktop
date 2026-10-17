import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { MediaOpenOptions } from '../files/media-open.js';
import type { RecentMediaEntry } from '../recent/recent-media.js';
import type { WordKey } from '../shared/words.js';
import { FILE_PAGE_EVENTS, PAGE_GAP } from './constants.js';
import type { FilePageDeps } from './deps.js';

/** What the Open page reads from the element that shows it. */
export interface OpenPageHost {
  /** The deps in use. */
  readonly deps: FilePageDeps;
  /** The extensions the app opens. */
  readonly accept: readonly string[];
  /** Whether the app holds unsaved work. */
  readonly dirty: boolean;
  /** The package's words. */
  words(key: WordKey, ...args: unknown[]): string;
  /** Fire one of the page's events. */
  fire(name: string, detail?: unknown): void;
  /** Render again. */
  requestUpdate(): void;
}

/** A recent entry with its thumbnail, when one was found. */
type Tile = RecentMediaEntry & { thumbnail?: string };

/** Width of one recent tile, in px; the grid fits as many as the page is wide. */
export const TILE_WIDTH = 160;

/**
 * The Open page: the recent images as big tiles, and under them Browse and Upload, both of which
 * are Umbraco's media picker (whose own Upload puts a file from the computer into the library).
 *
 * **The list is checked against the server before it is shown.** An entry is only what this browser
 * remembers; the item may have been deleted, trashed, or moved out of this user's reach since. The
 * media item repository is asked for every entry at once: one it does not return, or returns in the
 * recycle bin, is left out and forgotten, and one that fails to open is forgotten then. If the
 * library cannot be asked at all (offline, a server error), the list is shown as it is rather than
 * emptied: a failed lookup says nothing about the items. Thumbnails are fetched only for pictures,
 * because Umbraco's imaging endpoint answers nothing on a failure too (found by review).
 */
export class OpenPage {
  /** What the page reads from its element. */
  readonly #host: OpenPageHost;

  /** The tiles, or undefined while the first load runs. */
  #tiles?: Tile[];

  /** Counts loads, so a slow one that a newer one overtook is dropped. */
  #generation = 0;

  /** Whether an open is running, which disables the page's buttons against a second tap. */
  #busy = false;

  /** @param host The element showing the page. */
  constructor(host: OpenPageHost) {
    this.#host = host;
  }

  /**
   * Read the recent list again and check it against the server. Called each time the page shows.
   *
   * An entry the media library reports gone or in the recycle bin is left out and forgotten; when
   * the library cannot be asked, every entry is kept, since a failed check says nothing about the
   * items. Thumbnails are only pictures: an entry without one is shown without one.
   */
  async load(): Promise<void> {
    const generation = ++this.#generation;
    const { deps, accept } = this.#host;
    const entries = await deps.context.recent(accept.length ? accept : undefined);
    const uniques = entries.map((entry) => entry.unique);
    const known = deps.items ? await deps.items(uniques).catch(() => undefined) : undefined;
    if (generation !== this.#generation) return;
    const alive = known
      ? entries.filter((entry) => {
          const item = known.get(entry.unique);
          if (item && !item.trashed) return true;
          deps.context.forgetRecent(entry.unique);
          return false;
        })
      : entries;
    const thumbs = await deps.thumbnails(alive.map((entry) => entry.unique)).catch(() => new Map<string, string>());
    if (generation !== this.#generation) return;
    this.#tiles = alive.map((entry) => {
      const thumbnail = thumbs.get(entry.unique);
      return thumbnail ? { ...entry, thumbnail } : entry;
    });
    this.#host.requestUpdate();
  }

  /**
   * Open a file, from a tile or the picker, asking first if that would throw away unsaved work.
   * @param options The item to open by key, or nothing for the picker.
   */
  async #open(options?: MediaOpenOptions): Promise<void> {
    const host = this.#host;
    if (this.#busy) return;
    if (host.dirty && !(await host.deps.confirmDiscard())) return;
    this.#busy = true;
    host.requestUpdate();
    try {
      const result = await host.deps.context.open(options);
      if (result.status === 'opened') {
        const { status: _status, ...file } = result;
        host.fire(FILE_PAGE_EVENTS.open, file);
      } else if (result.status === 'failed') {
        // A recent item that will not open is one this person can no longer reach (moved out of their
        // start node, its file gone): it leaves the list, as a deleted one does.
        if (options?.unique) {
          host.deps.context.forgetRecent(options.unique);
          this.#tiles = this.#tiles?.filter((tile) => tile.unique !== options.unique);
        }
        host.fire(FILE_PAGE_EVENTS.failed, {
          message: result.name ? host.words('openFailed', result.name) : host.words('openFailedUnnamed'),
        });
      }
    } catch {
      host.fire(FILE_PAGE_EVENTS.failed, { message: host.words('openFailedUnnamed') });
    } finally {
      this.#busy = false;
      host.requestUpdate();
    }
  }

  /**
   * One recent image.
   * @param tile The entry.
   * @returns Its tile.
   */
  #renderTile(tile: Tile): TemplateResult {
    return html`<button
      type="button"
      class="tile"
      data-unique=${tile.unique}
      ?disabled=${this.#busy}
      @click=${() => this.#open({ unique: tile.unique })}>
      <span class="thumb">${tile.thumbnail ? html`<img src=${tile.thumbnail} alt="" loading="lazy" />` : nothing}</span>
      <span class="name">${tile.name}</span>
      <span class="where">${tile.folderName ?? this.#host.words('saveAsRoot')}</span>
    </button>`;
  }

  /** @returns The page's content. */
  render(): TemplateResult {
    const words = (key: WordKey) => this.#host.words(key);
    const tiles = this.#tiles;
    return html`
      <h2>${words('openHeading')}</h2>
      ${tiles === undefined
        ? nothing
        : tiles.length
          ? html`<p class="muted">${words('openRecent')}</p>
              <div class="tiles">${tiles.map((tile) => this.#renderTile(tile))}</div>`
          : html`<p class="muted">${words('openNoRecent')}</p>`}
      <div class="actions">
        <button type="button" class="button primary" data-action="browse" ?disabled=${this.#busy} @click=${() => this.#open()}>
          <umb-icon name="icon-search"></umb-icon><span>${words('openBrowse')}</span>
        </button>
        <button type="button" class="button" data-action="upload" ?disabled=${this.#busy} @click=${() => this.#open()}>
          <umb-icon name="icon-cloud-upload"></umb-icon><span>${words('openUpload')}</span>
        </button>
      </div>
    `;
  }
}

/** The Open page's own styles. */
export const openPageStyles = css`
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(${TILE_WIDTH}px, 1fr));
    gap: ${PAGE_GAP}px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 8px;
    font: inherit;
    font-family: var(--umbradesktop-app-font, inherit);
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    text-align: left;
    background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
    border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
    border-radius: var(--umbradesktop-app-radius, 3px);
    cursor: pointer;
  }

  .tile:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 1px;
  }

  .tile .thumb {
    display: block;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  .tile img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tile .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile .where {
    font-size: 13px;
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: ${PAGE_GAP / 2}px;
  }
`;
