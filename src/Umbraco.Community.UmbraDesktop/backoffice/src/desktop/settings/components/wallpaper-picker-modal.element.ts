import type { UmbraDesktopWallpaperRef } from '../types';
import type { UmbraDesktopWallpaperPickerModalData } from '../modal-tokens';
import type { UmbraDesktopWallpaperView } from '../wallpaper-view';
import type { UmbraDesktopSettingsContext } from '../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings.context-token';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS } from '../wallpapers.generated';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement, umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_MEDIA_PICKER_MODAL } from '@umbraco-cms/backoffice/media';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';

/**
 * The wallpaper picker: a grid of thumbnails with the current one marked selected, a "None" tile
 * first that restores the gradient the desktop has always shipped, and a way through to the Media
 * Library for an image of your own.
 *
 * **Both sources live here**, where they used to be two buttons in the settings panel. The panel
 * now shows one row per setting — what you are using, and a way in — so a second entry point had
 * nowhere to sit; and this is the better home anyway, because it is the place you are already
 * choosing an image.
 *
 * Your own images get **one tile, first, with two states**: an empty slot until you have picked
 * something of your own, and that image — marked like any other tile — once you have. One tile
 * rather than a tile plus a button, because they were always the same idea, and first because it is
 * the only tile in this grid that is not already showing you what it offers. It also fixes what the
 * footer button could not: an image from the Media Library is not in the built-in grid, so while
 * one was in use the picker marked nothing at all and looked like it had forgotten.
 *
 * **It applies and stays open**, the way the theme picker does. There is no Save — a wallpaper is a
 * one-click, instantly reversible choice — but there is also no reason to leave: picking one used to
 * close the picker, which made trying three backgrounds a matter of reopening it twice. The desktop
 * repaints behind the panel as you click, so staying open is what lets you see the thing you are
 * choosing. Closing is a decision you make when you are done, not one the first click makes for you.
 */
@customElement('umbradesktop-wallpaper-picker-modal')
export class UmbraDesktopWallpaperPickerModalElement extends UmbModalBaseElement<
  UmbraDesktopWallpaperPickerModalData,
  never
> {
  /**
   * The wallpaper in force, which is what the grid marks. Seeded from the modal's data so the right
   * tile is marked on the first paint, then kept in step with the settings context — a click marks
   * the tile it came from because the setting actually changed, not because this element assumed it
   * would.
   */
  @state()
  private _view?: Pick<UmbraDesktopWallpaperView, 'ref' | 'thumbUrl'>;

  #settings?: UmbraDesktopSettingsContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.wallpaper, (wallpaper) => (this._view = wallpaper));
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this._view ??= this.data ? { ref: this.data.current, thumbUrl: this.data.currentThumbUrl ?? null } : undefined;
  }

  /**
   * Whether a reference is the one currently selected.
   * @param ref The tile's wallpaper reference.
   * @returns True when the tile should render as selected.
   */
  #isSelected(ref: UmbraDesktopWallpaperRef): boolean {
    const current = this._view?.ref;
    if (!current) return false;
    if (ref.kind === 'none') return current.kind === 'none';
    return ref.kind === 'builtin' && current.kind === 'builtin' && current.id === ref.id;
  }

  /**
   * Open Umbraco's own Media Library picker and hand back whatever comes out of it.
   *
   * Only the *choice* is made here. Whether that item can actually be rendered as an image is
   * settled by the settings context, which is where the same check already lived when this was a
   * button in the panel — a picker that could silently apply an unusable file would be a worse
   * place for that logic, not a better one.
   *
   * Folders and items the user cannot see are filtered out. Restricting the rest to images would
   * mean resolving the site's image media types up front, which is the round trip the check on the
   * way back exists to avoid.
   */
  async #pickFromMedia() {
    const result = await umbOpenModal(this, UMB_MEDIA_PICKER_MODAL, {
      data: {
        multiple: false,
        pickableFilter: (item) => !item.isFolder && !item.noAccess,
      },
    }).catch(() => undefined);

    const unique = result?.selection?.[0];
    if (unique) this.#choose({ kind: 'media', unique });
  }

  /**
   * The tile for an image of your own: always present, always first, and filled with that image
   * once there is one.
   *
   * Two states rather than two tiles. Empty, it is the way into the Media Library. Filled, it is
   * both the wallpaper in use — marked, like any other tile — and still the way in, which is the
   * one place this grid departs from how tiles normally behave: clicking a marked tile usually does
   * nothing, and clicking this one reopens the Media Library. Hence the line under it saying so.
   *
   * A media wallpaper that resolved to no thumbnail falls back to the empty state. Umbraco cannot
   * render that item as an image, so there is nothing to show, and a blank tile claiming to be the
   * wallpaper in use would be worse than the grid marking nothing.
   * @returns The tile.
   */
  #renderOwnImage() {
    const current = this._view?.ref;
    const thumbUrl = current?.kind === 'media' ? this._view?.thumbUrl : undefined;
    const label = this.localize.term('umbraDesktop_wallpaperOwnImage');

    return html`
      <button
        class="tile own ${thumbUrl ? 'on' : ''}"
        aria-pressed=${thumbUrl ? 'true' : 'false'}
        title=${label}
        @click=${this.#pickFromMedia}>
        <span class="preview">
          ${thumbUrl
            ? html`<img src=${thumbUrl} alt="" loading="lazy" /><span class="check" aria-hidden="true">✓</span>`
            : html`<span class="slot" aria-hidden="true">
                <uui-icon name="icon-add"></uui-icon>
                <span>${this.localize.term('umbraDesktop_wallpaperMediaLibrary')}</span>
              </span>`}
        </span>
        <span class="label">${label}</span>
        ${thumbUrl ? html`<span class="sub">${this.localize.term('umbraDesktop_wallpaperOwnImageChange')}</span>` : nothing}
      </button>
    `;
  }

  /**
   * Apply a wallpaper. The picker stays open.
   *
   * Applied through the settings context rather than handed back as a modal value, which is what
   * staying open requires: there is no submit to carry a value, and the panel behind is observing
   * the same context, so its row updates while this is still up.
   *
   * A Media Library item is the only kind that can fail. Whether Umbraco can render it as an image
   * needs a round trip, so it is checked here on the way in rather than by filtering the media
   * picker on the way out, and a file that cannot be rendered is reported and not stored.
   * @param wallpaper The wallpaper the user clicked.
   */
  async #choose(wallpaper: UmbraDesktopWallpaperRef) {
    if (!this.#settings) return;

    if (wallpaper.kind !== 'media') {
      this.#settings.setWallpaper(wallpaper);
      return;
    }

    if (!(await this.#settings.setMediaWallpaper(wallpaper.unique))) {
      const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
      notifications?.peek('warning', {
        data: { message: this.localize.term('umbraDesktop_wallpaperNotAnImage') },
      });
    }
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
          ${this.#renderOwnImage()} ${this.#tile({ kind: 'none' }, this.localize.term('umbraDesktop_wallpaperNone'))}
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
      /* The ring goes round the whole card — image and caption — rather than round the image alone,
         which is how Umbraco's own media picker marks a selected item, and is why this reads at a
         glance where a border on the thumbnail did not: against a busy or dark image a 2px edge is
         just more image. */
      .tile {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-2);
        border: 2px solid transparent;
        border-radius: calc(var(--uui-border-radius, 3px) + var(--uui-size-space-2));
        background: none;
        color: var(--uui-color-text);
        font-family: inherit;
        text-align: left;
        cursor: pointer;
      }
      .tile:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.04));
      }
      .tile.on {
        border-color: var(--uui-color-selected, var(--uui-color-focus));
        background: var(--uui-color-surface, transparent);
      }
      .tile.on .label {
        font-weight: 700;
      }
      .preview {
        position: relative;
        display: block;
        /* Matches the 16:9 of every shipped image, so no tile letterboxes. A picker is where you
           judge an image, so nothing here crops it — unlike the settings panel's row, which is a
           summary and crops to 16:10. */
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }
      .tile:focus-visible {
        outline: 2px solid var(--uui-color-focus);
        outline-offset: 2px;
      }
      .preview img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      /* The empty state of the own-image tile. Dashed, because a dashed edge is what every
         interface uses for "there could be something here" and a solid one would claim there
         already is. */
      .slot {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--uui-size-space-1);
        width: 100%;
        height: 100%;
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.04));
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
        font-weight: 700;
      }
      .slot uui-icon {
        font-size: 20px;
      }
      /* The dashed edge belongs to '.preview' itself rather than to the slot inside it. Inside, the
         slot stretches to 100% of a box with 'overflow: hidden' and its border is clipped along
         every edge — which is exactly how it shipped, and what the cut-off dotted line was. */
      .tile.own:not(.on) .preview {
        border-style: dashed;
        border-color: var(--uui-color-border-emphasis, var(--uui-color-border));
      }
      .sub {
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
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
      /* Top-left, matching where Umbraco's own media picker puts its marker, and ringed in the
         panel's surface colour so it stays a marker rather than dissolving into whatever corner of
         the image it lands on. */
      .check {
        position: absolute;
        top: var(--uui-size-space-2);
        left: var(--uui-size-space-2);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--uui-color-selected, var(--uui-color-focus));
        box-shadow: 0 0 0 2px var(--uui-color-surface, #fff);
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
