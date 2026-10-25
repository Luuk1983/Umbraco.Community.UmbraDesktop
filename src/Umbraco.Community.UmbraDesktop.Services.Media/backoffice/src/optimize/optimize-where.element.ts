import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues, TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { wordsOf } from '../shared/words.js';
import { PLACES_SHOWN } from './where-used.js';
import type { Place, UsedImage } from './where-used.js';

/** The icon a place shows when Umbraco gave none, by what it is. */
const KIND_ICONS: Record<Place['kind'], string> = { document: 'icon-document', media: 'icon-picture', member: 'icon-user', other: 'icon-link' };

/**
 * The list Show where opens (design §16, owner 2026-10-25), inside Umbraco's info dialog: one line per
 * image with its thumbnail, name and count, the images used most first; under it one line per place
 * with its path, the first {@link PLACES_SHOWN} and the rest behind "and n more". Each image's places
 * are read when the list opens, all images at once, so a slow one holds up nothing else.
 *
 * Built here rather than with Umbraco's own references list, which repeats "The following items depend
 * on this" and a boxed item without a path under every image: with eight images that was a screen and
 * a half of the same line, and places that could not be told apart.
 */
@customElement('umbradesktop-media-optimize-where')
export class UmbraDesktopOptimizeWhereElement extends UmbLitElement {
  /** The images, in the order to list them. */
  @property({ attribute: false })
  images: UsedImage[] = [];

  /** Thumbnail addresses, by image. */
  @property({ attribute: false })
  thumbs: ReadonlyMap<string, string> = new Map();

  /**
   * Where an image is used.
   * @param unique The image.
   * @returns Its places, or undefined when they could not be read.
   */
  @property({ attribute: false })
  places?: (unique: string) => Promise<Place[] | undefined>;

  /** Each image's places once read: the places, or null when they could not be. */
  @state()
  private _read = new Map<string, Place[] | null>();

  /** The images whose every place is shown. */
  @state()
  private _all = new Set<string>();

  /** The package's words. */
  readonly #words = wordsOf(this.localize);

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (changed.has('images') || changed.has('places')) void this.#readAll();
  }

  /** Read every image's places, each answer drawn as it comes. */
  async #readAll(): Promise<void> {
    const places = this.places;
    if (!places) return;
    await Promise.all(
      this.images.map(async (image) => {
        if (this._read.has(image.unique)) return;
        let found: Place[] | null = null;
        try {
          found = (await places(image.unique)) ?? null;
        } catch {
          found = null;
        }
        this._read = new Map(this._read).set(image.unique, found);
      }),
    );
  }

  override render() {
    return html`${this.images.map((image) => this.#renderImage(image))}`;
  }

  /**
   * One image: its header line, then its places.
   * @param image The image.
   * @returns Its section.
   */
  #renderImage(image: UsedImage): TemplateResult {
    const words = this.#words;
    const thumb = this.thumbs.get(image.unique);
    const read = this._read.get(image.unique);
    const all = this._all.has(image.unique);
    const shown = read ? (all ? read : read.slice(0, PLACES_SHOWN)) : [];
    return html`<section class="image">
      <div class="image-head">
        <span class="thumb">${thumb ? html`<img src=${thumb} alt="" />` : html`<umb-icon name="icon-picture"></umb-icon>`}</span>
        <b class="name">${image.name}</b>
        <small class="count">${image.count === 1 ? words('optimizeWhereCountOne') : words('optimizeWhereCount', image.count)}</small>
      </div>
      ${read === undefined
        ? html`<p class="note">${words('optimizeWhereLoading')}</p>`
        : read === null
          ? html`<p class="note">${words('optimizeWhereFailed')}</p>`
          : html`<ul>
              ${shown.map((place) => this.#renderPlace(place))}
            </ul>
            ${read.length > shown.length
              ? html`<button type="button" class="more" data-action="more" @click=${() => (this._all = new Set(this._all).add(image.unique))}>
                  ${words('optimizeWhereMore', read.length - shown.length)}
                </button>`
              : nothing}`}
    </section>`;
  }

  /**
   * One place on one line: its icon, then its path with its own name last and in bold; a member, who
   * has no path, by what it is and its name.
   * @param place The place.
   * @returns The line.
   */
  #renderPlace(place: Place): TemplateResult {
    const icon = html`<umb-icon name=${place.icon || KIND_ICONS[place.kind]}></umb-icon>`;
    if (place.kind === 'member') return html`<li>${icon}<span>${this.#words('optimizeWhereMember', place.name)}</span></li>`;
    return html`<li>
      ${icon}<span>${place.path.map((name) => html`${name} <span class="sep">›</span> `)}<b>${place.name}</b></span>
    </li>`;
  }

  static override styles = css`
    :host {
      display: block;
      min-width: min(480px, 80vw);
    }

    .image {
      padding: 8px 0;
      border-top: 1px solid var(--uui-color-divider, var(--uui-color-border));
    }

    .image-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .thumb {
      flex: none;
      width: 32px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 2px;
      background: var(--uui-color-background);
      color: var(--uui-color-text-alt);
    }

    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .count {
      flex: none;
      color: var(--uui-color-text-alt);
    }

    ul {
      margin: 4px 0 0 42px;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
      min-width: 0;
    }

    li umb-icon {
      flex: none;
      color: var(--uui-color-text-alt);
    }

    li > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    li b {
      font-weight: 700;
    }

    .sep {
      color: var(--uui-color-text-alt);
    }

    .note {
      margin: 4px 0 0 42px;
      color: var(--uui-color-text-alt);
    }

    .more {
      margin: 2px 0 0 42px;
      padding: 0;
      font: inherit;
      color: var(--uui-color-interactive, var(--uui-color-selected));
      text-decoration: underline;
      background: none;
      border: none;
      cursor: pointer;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-optimize-where': UmbraDesktopOptimizeWhereElement;
  }
}
