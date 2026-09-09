import type { UmbraDesktopWallpaperView } from '../wallpaper-view';
import type { UmbraDesktopSettingsContext } from '../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings.context-token';
import { UMBRADESKTOP_WALLPAPER_PICKER_MODAL } from '../modal-tokens';
import type { UmbraDesktopResolvedTheme } from '../../theme/resolve-variant';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token';
import { UMBRADESKTOP_THEMES } from '../../theme/themes/index';
import './wallpaper-picker-modal.element.js';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_MEDIA_PICKER_MODAL } from '@umbraco-cms/backoffice/media';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';

/**
 * The Desktop settings panel, opened from the launcher footer as a sidebar from the right.
 *
 * Laid out as a list of sections so that adding another one means appending it, not restructuring
 * this element. Today there are three: Theme, Wallpaper and Startup.
 *
 * There is no Save: every change applies through the settings context the moment it is made, which
 * is also what lets the user watch the result on the desktop beside the panel. Startup is the one
 * setting that cannot show its result, since it is read while the backoffice boots — hence the hint
 * under it saying so.
 */
@customElement('umbradesktop-settings-modal')
export class UmbraDesktopSettingsModalElement extends UmbModalBaseElement {
  @state()
  private _wallpaper?: UmbraDesktopWallpaperView;

  /**
   * The theme actually *in force* — what is painted right now, including the variant and whether
   * high contrast has overridden the user's choice. Distinct from `_chosenThemeId` below, which is
   * the user's *choice*: the two agree except under high contrast, where this reflects the forced
   * theme while `_chosenThemeId` still reflects what the user picked.
   */
  @state()
  private _theme?: UmbraDesktopResolvedTheme;

  /**
   * The theme the user *chose*, which is not always the one in force: high contrast overrides the
   * choice without discarding it. The picker marks this one, so switching the backoffice to high
   * contrast never looks like it silently reset the user's selection — the hint below explains the
   * override instead.
   */
  @state()
  private _chosenThemeId?: string;

  /** Whether this user boots straight into the desktop. */
  @state()
  private _bootIntoDesktop = false;

  #settings?: UmbraDesktopSettingsContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.wallpaper, (wallpaper) => (this._wallpaper = wallpaper));
      this.observe(context.theme, (id) => (this._chosenThemeId = id));
      this.observe(context.bootIntoDesktop, (enabled) => (this._bootIntoDesktop = enabled === true));
    });

    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.resolved, (resolved) => (this._theme = resolved));
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

  /**
   * The theme picker: one swatch per shipped theme, marking whichever the user chose. Selecting
   * applies immediately and persists, matching the wallpaper section's no-Save behaviour.
   * @returns The Theme subsection template.
   */
  #renderThemes() {
    // The user's choice, not the theme in force — see "_chosenThemeId".
    const activeId = this._chosenThemeId ?? this._theme?.theme.id;
    return html`
      <section class="subsection">
        <h4>${this.localize.term('umbraDesktop_theme')}</h4>
        <p class="hint">${this.localize.term('umbraDesktop_themeDescription')}</p>
        <div class="themes">
          ${UMBRADESKTOP_THEMES.map(
            (theme) => html`
              <button
                class="theme ${theme.id === activeId ? 'selected' : ''}"
                aria-pressed=${theme.id === activeId}
                @click=${() => this.#settings?.setTheme(theme.id)}>
                <span class="swatch" aria-hidden="true">
                  ${[theme.swatch.chrome, theme.swatch.accent, theme.swatch.surface].map(
                    (colour) => html`<i style="background:${colour}"></i>`,
                  )}
                </span>
                <span class="theme-name">${theme.name}</span>
              </button>
            `,
          )}
        </div>
        ${this._theme?.highContrast
          ? html`<p class="hint warn">${this.localize.term('umbraDesktop_themeHighContrast')}</p>`
          : ''}
      </section>
    `;
  }

  /**
   * The wallpaper subsection: what is in use now, and the two ways to change it.
   * @returns The Wallpaper subsection template.
   */
  #renderWallpaper() {
    return html`
      <section class="subsection">
        <h4>${this.localize.term('umbraDesktop_wallpaper')}</h4>
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
      </section>
    `;
  }

  /**
   * The startup setting: one toggle, and the sentence that stops it looking broken.
   *
   * No sub-heading of its own, unlike the two under Appearance: the toggle's own label says what it
   * does, and a heading over a single switch would be a label for a label. Add one when a second
   * setting arrives.
   *
   * The hint is load-bearing. The preference is read while the backoffice boots, so flipping it
   * changes nothing on screen, and a toggle that appears to do nothing reads as a bug. It also
   * names the escape hatch, because the desktop hides the backoffice header and somebody whose
   * desktop breaks needs a way back that does not depend on the desktop.
   * @returns The Settings group's contents.
   */
  #renderBoot() {
    return html`
      <uui-toggle
        label=${this.localize.term('umbraDesktop_bootIntoDesktop')}
        ?checked=${this._bootIntoDesktop}
        @change=${(event: Event) =>
          this.#settings?.setBootIntoDesktop(!!(event.target as HTMLInputElement | null)?.checked)}></uui-toggle>
      <p class="hint below">${this.localize.term('umbraDesktop_bootDescription')}</p>
    `;
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
        <div class="groups">
          <uui-box headline=${this.localize.term('umbraDesktop_groupAppearance')}>
            ${this.#renderThemes()} ${this.#renderWallpaper()}
          </uui-box>
          <uui-box headline=${this.localize.term('umbraDesktop_groupSettings')}> ${this.#renderBoot()} </uui-box>
        </div>
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
      /* The groups need air between them: slotted into umb-body-layout they butt up against each
         other, and two boxes touching read as one slab with a line through it. */
      .groups {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-5);
      }
      /* One setting group inside a box. The divider rather than spacing alone, because in a 500px
         panel the wallpaper preview sits directly under the theme swatches and the eye needs
         telling where one ends. */
      .subsection + .subsection {
        margin-top: var(--uui-size-space-5);
        padding-top: var(--uui-size-space-5);
        border-top: 1px solid var(--uui-color-divider);
      }
      /* Subordinate to the box's own headline, which uui-box renders at h5 size — an h5-sized
         subsection heading competes with the category above it and inverts the hierarchy. This is
         the launcher's group-label treatment (see .ch in launcher.element), so the two surfaces
         label a group of things the same way. */
      .subsection h4 {
        margin: 0 0 var(--uui-size-space-3);
        font-size: var(--uui-type-small-size);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        opacity: 0.6;
      }
      .wallpaper {
        display: flex;
        align-items: flex-start;
        gap: var(--uui-size-space-5);
        /* Wraps because the panel is a small sidebar (500px): the 200px preview and the two
           buttons beside it fit, but only just, and a longer localized button label should push
           the controls under the preview rather than out of the panel. */
        flex-wrap: wrap;
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
      .hint {
        margin: 0 0 var(--uui-size-space-4);
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .hint.warn {
        margin: var(--uui-size-space-4) 0 0;
      }
      /* A hint that explains the control above it rather than the one below. */
      .hint.below {
        margin: var(--uui-size-space-3) 0 0;
      }
      .themes {
        display: flex;
        flex-wrap: wrap;
        gap: var(--uui-size-space-3);
      }
      .theme {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-2);
        border: 2px solid transparent;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        cursor: pointer;
        font-family: inherit;
      }
      .theme:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .theme.selected {
        border-color: var(--uui-color-selected, var(--uui-color-focus));
      }
      .swatch {
        display: flex;
        width: 96px;
        height: 54px;
        overflow: hidden;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }
      .swatch i {
        flex: 1;
        display: block;
      }
      .theme-name {
        font-size: var(--uui-type-small-size);
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
