import type { UmbraDesktopWallpaperRef } from '../types';
import type {
  UmbraDesktopWallpaperPickerModalData,
  UmbraDesktopWallpaperPickerModalValue,
} from '../modal-tokens';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS } from '../wallpapers.generated';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';

/**
 * The built-in wallpaper picker: a grid of thumbnails with the current one marked selected, and
 * a "None" tile first that restores the gradient the desktop has always shipped.
 *
 * Picking submits immediately — there is no Save. A wallpaper is a one-click, instantly
 * reversible choice, so asking the user to confirm it would be ceremony.
 */
@customElement('umbradesktop-wallpaper-picker-modal')
export class UmbraDesktopWallpaperPickerModalElement extends UmbModalBaseElement<
  UmbraDesktopWallpaperPickerModalData,
  UmbraDesktopWallpaperPickerModalValue
> {
  @state()
  private _selected?: UmbraDesktopWallpaperRef;

  override connectedCallback() {
    super.connectedCallback();
    this._selected = this.data?.current;
  }

  /**
   * Whether a reference is the one currently selected. Only `builtin` and `none` can match: a
   * Media Library wallpaper is not in this grid, so nothing here appears selected while one is
   * in use.
   * @param ref The tile's wallpaper reference.
   * @returns True when the tile should render as selected.
   */
  #isSelected(ref: UmbraDesktopWallpaperRef): boolean {
    const current = this._selected;
    if (!current) return false;
    if (ref.kind === 'none') return current.kind === 'none';
    if (ref.kind === 'builtin') return current.kind === 'builtin' && current.id === ref.id;
    return false;
  }

  /**
   * Choose a wallpaper and close.
   * @param wallpaper The wallpaper the user clicked.
   */
  #choose(wallpaper: UmbraDesktopWallpaperRef) {
    this._selected = wallpaper;
    this.value = { wallpaper };
    this._submitModal();
  }

  /**
   * One tile in the grid.
   * @param ref What picking the tile selects.
   * @param label The tile's caption.
   * @param thumbUrl The preview image, or `undefined` to render the gradient swatch.
   * @returns The tile template.
   */
  #tile(ref: UmbraDesktopWallpaperRef, label: string, thumbUrl?: string) {
    const selected = this.#isSelected(ref);
    return html`
      <button
        class="tile ${selected ? 'on' : ''}"
        aria-pressed=${selected ? 'true' : 'false'}
        title=${label}
        @click=${() => this.#choose(ref)}>
        <span class="preview">
          ${thumbUrl
            ? html`<img src=${thumbUrl} alt="" loading="lazy" />`
            : html`<span class="gradient" aria-hidden="true"></span>`}
          ${selected ? html`<span class="check" aria-hidden="true">✓</span>` : nothing}
        </span>
        <span class="label">${label}</span>
      </button>
    `;
  }

  override render() {
    return html`
      <umb-body-layout headline=${this.localize.term('umbraDesktop_wallpaperPickerTitle')}>
        <div class="grid">
          ${this.#tile({ kind: 'none' }, this.localize.term('umbraDesktop_wallpaperNone'))}
          ${repeat(
            UMBRADESKTOP_BUILTIN_WALLPAPERS,
            (wallpaper) => wallpaper.id,
            (wallpaper) => this.#tile({ kind: 'builtin', id: wallpaper.id }, wallpaper.name, wallpaper.thumbUrl),
          )}
        </div>
        <uui-button
          slot="actions"
          look="secondary"
          label=${this.localize.term('general_close')}
          @click=${() => this._rejectModal()}></uui-button>
      </umb-body-layout>
    `;
  }

  static override styles = [
    css`
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: var(--uui-size-space-4);
      }
      .tile {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2);
        padding: 0;
        border: none;
        background: none;
        color: var(--uui-color-text);
        font-family: inherit;
        text-align: left;
        cursor: pointer;
      }
      .preview {
        position: relative;
        display: block;
        /* Matches the 16:9 of every shipped image, so no tile letterboxes. */
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border: 2px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }
      .tile:hover .preview {
        border-color: var(--uui-color-border-emphasis, var(--uui-color-border));
      }
      .tile.on .preview {
        border-color: var(--uui-color-selected, var(--uui-color-focus));
      }
      .tile:focus-visible .preview {
        outline: 2px solid var(--uui-color-focus);
        outline-offset: 2px;
      }
      .preview img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      /* The "None" swatch mirrors the desktop's own gradient, so the tile previews what
         picking it actually does. */
      .gradient {
        display: block;
        width: 100%;
        height: 100%;
        background-color: #0e1329;
        background-image: radial-gradient(
          130% 130% at 25% 8%,
          var(--uui-color-header-background, #1b264f),
          color-mix(in srgb, var(--uui-color-header-background, #1b264f) 50%, black) 70%
        );
      }
      .check {
        position: absolute;
        top: var(--uui-size-space-2);
        right: var(--uui-size-space-2);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--uui-color-selected, var(--uui-color-focus));
        color: var(--uui-color-selected-contrast, #fff);
        font-size: 13px;
        line-height: 1;
      }
      .label {
        font-size: var(--uui-type-small-size);
      }
    `,
  ];
}

export default UmbraDesktopWallpaperPickerModalElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-wallpaper-picker-modal': UmbraDesktopWallpaperPickerModalElement;
  }
}
