import type { UmbraDesktopWallpaperView } from '../wallpaper-view';
import type { UmbraDesktopSettingsContext } from '../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings.context-token';
import { UMBRADESKTOP_WALLPAPER_PICKER_MODAL } from '../modal-tokens';
import './wallpaper-picker-modal.element.js';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_MEDIA_PICKER_MODAL } from '@umbraco-cms/backoffice/media';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';

/**
 * The Desktop settings dialog, opened from the launcher footer.
 *
 * Laid out as a list of sections so that adding the planned skin picker means appending one,
 * not restructuring this element. Today there is a single section: Wallpaper.
 *
 * There is no Save: every change applies through the settings context the moment it is made,
 * which is also what lets the user see the result behind the dialog.
 */
@customElement('umbradesktop-settings-modal')
export class UmbraDesktopSettingsModalElement extends UmbModalBaseElement {
  @state()
  private _wallpaper?: UmbraDesktopWallpaperView;

  #settings?: UmbraDesktopSettingsContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.wallpaper, (wallpaper) => (this._wallpaper = wallpaper));
    });
  }

  /** Open the built-in picker and apply whatever comes back. */
  async #pickBuiltIn() {
    const current = this._wallpaper?.ref;
    if (!current) return;
    const result = await umbOpenModal(this, UMBRADESKTOP_WALLPAPER_PICKER_MODAL, {
      data: { current },
    }).catch(() => undefined);
    if (result) this.#settings?.setWallpaper(result.wallpaper);
  }

  /**
   * Open the core Media Library picker. This is how consumers add their own backgrounds: upload
   * to Media, pick it here.
   *
   * Folders and items the user cannot see are filtered out of the picker. Restricting the rest
   * to images would mean resolving the site's folder and image media types up front, so instead
   * the choice is validated on the way back: a file Umbraco cannot render as an image is
   * reported and nothing is stored.
   */
  async #pickMedia() {
    const result = await umbOpenModal(this, UMB_MEDIA_PICKER_MODAL, {
      data: {
        multiple: false,
        pickableFilter: (item) => !item.isFolder && !item.noAccess,
      },
    }).catch(() => undefined);

    const unique = result?.selection?.[0];
    if (!unique || !this.#settings) return;

    if (!(await this.#settings.setMediaWallpaper(unique))) {
      const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
      notifications?.peek('warning', {
        data: { message: this.localize.term('umbraDesktop_wallpaperNotAnImage') },
      });
    }
  }

  /** The current wallpaper's preview, or the gradient swatch when none is set. */
  #renderPreview() {
    const thumbUrl = this._wallpaper?.thumbUrl;
    return thumbUrl
      ? html`<img class="preview" src=${thumbUrl} alt="" />`
      : html`<span class="preview gradient" aria-hidden="true"></span>`;
  }

  /** The name of the current wallpaper, for the caption beside its thumbnail. */
  #currentLabel(): string {
    const ref = this._wallpaper?.ref;
    if (!ref) return '';
    if (ref.kind === 'none') return this.localize.term('umbraDesktop_wallpaperNone');
    if (ref.kind === 'media') return this.localize.term('umbraDesktop_wallpaperFromMedia');
    return this.localize.term('umbraDesktop_wallpaperBuiltIn');
  }

  override render() {
    return html`
      <umb-body-layout headline=${this.localize.term('umbraDesktop_desktopSettings')}>
        <uui-box headline=${this.localize.term('umbraDesktop_wallpaper')}>
          <div class="wallpaper">
            ${this.#renderPreview()}
            <div class="controls">
              <span class="current">${this.#currentLabel()}</span>
              <div class="buttons">
                <uui-button
                  look="secondary"
                  label=${this.localize.term('umbraDesktop_wallpaperBuiltInImages')}
                  @click=${this.#pickBuiltIn}></uui-button>
                <uui-button
                  look="secondary"
                  label=${this.localize.term('umbraDesktop_wallpaperMediaLibrary')}
                  @click=${this.#pickMedia}></uui-button>
              </div>
            </div>
          </div>
        </uui-box>
        <uui-button
          slot="actions"
          look="primary"
          label=${this.localize.term('general_close')}
          @click=${() => this._rejectModal()}></uui-button>
      </umb-body-layout>
    `;
  }

  static override styles = [
    css`
      .wallpaper {
        display: flex;
        align-items: flex-start;
        gap: var(--uui-size-space-5);
      }
      .preview {
        flex-shrink: 0;
        display: block;
        width: 200px;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }
      /* Mirrors the desktop's own gradient, so "None" previews what it actually does. */
      .gradient {
        background-color: #0e1329;
        background-image: radial-gradient(
          130% 130% at 25% 8%,
          var(--uui-color-header-background, #1b264f),
          color-mix(in srgb, var(--uui-color-header-background, #1b264f) 50%, black) 70%
        );
      }
      .controls {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
      }
      .current {
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: var(--uui-size-space-2);
      }
    `,
  ];
}

export default UmbraDesktopSettingsModalElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-modal': UmbraDesktopSettingsModalElement;
  }
}
