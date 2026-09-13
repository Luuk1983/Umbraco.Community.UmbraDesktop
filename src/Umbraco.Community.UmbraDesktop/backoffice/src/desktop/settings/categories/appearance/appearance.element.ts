import type { UmbraDesktopWallpaperView } from '../../wallpaper-view';
import type { UmbraDesktopSettingsContext } from '../../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token';
import { UMBRADESKTOP_THEME_PICKER_MODAL, UMBRADESKTOP_WALLPAPER_PICKER_MODAL } from '../../modal-tokens';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS } from '../../wallpapers.generated';
import { wallpaperLabels } from '../../wallpaper-labels';
import '../../components/settings-row.element.js';
import '../../components/theme-picker-modal.element.js';
import '../../components/wallpaper-picker-modal.element.js';
import type { UmbraDesktopResolvedTheme } from '../../../theme/resolve-variant';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../../theme/theme.context-token';
import { UMBRADESKTOP_THEMES } from '../../../theme/themes/index';
import { UMBRADESKTOP_PREVIEW_SCALE, UMBRADESKTOP_PREVIEW_SCENE } from '../../../theme/preview/constants';
import '../../../theme/preview/theme-preview.element.js';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * How the desktop looks: the theme it is painted in, and the wallpaper behind it.
 *
 * Two rows of one shape, each showing what you are using and opening a picker. Its own element
 * rather than markup in the settings panel, so that the panel owns navigation and nothing else —
 * which is what makes a third category a folder rather than an edit to a growing file.
 *
 * Nothing here is saved: every change applies through the settings context the moment it is made,
 * which is also what lets the desktop behind the panel repaint as you choose.
 */
@customElement('umbradesktop-settings-appearance')
export class UmbraDesktopSettingsAppearanceElement extends UmbLitElement {
  @state()
  private _wallpaper?: UmbraDesktopWallpaperView;

  /**
   * The theme actually *in force* — what is painted right now, including the variant and whether
   * high contrast has overridden the user's choice. Distinct from `_chosenThemeId`, which is the
   * user's *choice*: the two agree except under high contrast.
   */
  @state()
  private _theme?: UmbraDesktopResolvedTheme;

  /**
   * The theme the user *chose*, which is not always the one in force: high contrast overrides the
   * choice without discarding it. The row names this one, so switching the backoffice to high
   * contrast never looks like it silently reset the user's selection — the hint below explains the
   * override instead.
   */
  @state()
  private _chosenThemeId?: string;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context: UmbraDesktopSettingsContext | undefined) => {
      if (!context) return;
      this.observe(context.wallpaper, (wallpaper) => (this._wallpaper = wallpaper));
      this.observe(context.theme, (id) => (this._chosenThemeId = id));
    });

    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.resolved, (resolved) => (this._theme = resolved));
    });
  }

  /**
   * Open the theme picker.
   *
   * Nothing comes back and nothing needs to: the picker applies each choice through the same
   * settings context this screen observes, so the row updates while the picker is still open.
   * Rejected rather than resolved when closed, which is why the rejection is swallowed.
   */
  #pickTheme = async () => {
    const current = this._chosenThemeId ?? this._theme?.theme.id;
    if (!current) return;
    await umbOpenModal(this, UMBRADESKTOP_THEME_PICKER_MODAL, { data: { current } }).catch(() => undefined);
  };

  /** Open the wallpaper picker, which holds both sources and applies through the same context. */
  #pickWallpaper = async () => {
    const current = this._wallpaper?.ref;
    if (!current) return;
    await umbOpenModal(this, UMBRADESKTOP_WALLPAPER_PICKER_MODAL, {
      data: { current, currentThumbUrl: this._wallpaper?.thumbUrl },
    }).catch(() => undefined);
  };

  /** The current wallpaper's thumbnail, or the gradient swatch when none is set. */
  #renderWallpaperPreview() {
    const thumbUrl = this._wallpaper?.thumbUrl;
    return thumbUrl
      ? html`<img slot="lead" class="preview" src=${thumbUrl} alt="" />`
      : html`<span slot="lead" class="preview gradient" aria-hidden="true"></span>`;
  }

  override render() {
    // The user's choice, not the theme in force — see "_chosenThemeId".
    const activeId = this._chosenThemeId ?? this._theme?.theme.id;
    const theme = UMBRADESKTOP_THEMES.find((candidate) => candidate.id === activeId);
    const labels = wallpaperLabels(this._wallpaper?.ref, UMBRADESKTOP_BUILTIN_WALLPAPERS);

    return html`
      <section>
        <h4>${this.localize.term('umbraDesktop_theme')}</h4>
        <umbradesktop-settings-row
          headline=${theme?.name ?? ''}
          detail=${theme ? this.localize.term(theme.descriptionKey) : ''}
          @click=${this.#pickTheme}>
          <umbradesktop-theme-preview
            slot="lead"
            .theme=${theme}
            .variant=${this._theme?.variant ?? 'light'}></umbradesktop-theme-preview>
        </umbradesktop-settings-row>
        ${this._theme?.highContrast
          ? html`<p class="hint">${this.localize.term('umbraDesktop_themeHighContrast')}</p>`
          : ''}
      </section>
      <section>
        <h4>${this.localize.term('umbraDesktop_wallpaper')}</h4>
        <umbradesktop-settings-row
          headline=${labels.title ?? (labels.titleKey ? this.localize.term(labels.titleKey) : '')}
          detail=${labels.subKey ? this.localize.term(labels.subKey) : ''}
          @click=${this.#pickWallpaper}>
          ${this.#renderWallpaperPreview()}
        </umbradesktop-settings-row>
      </section>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      /* Space, not a line. The line was there and you only saw it in dark mode: '--uui-color-divider'
         is a hair off the panel's own surface in light and clearly darker than it in dark, so one
         rule gave the two themes different designs by accident. The group headings below already
         say where one section ends, which is why light mode read fine without it. Same reasoning as
         the category list, which dropped its rule for the same reason. */
      section + section {
        margin-top: calc(var(--uui-size-space-5) * 2);
      }
      /* The backoffice's own way of heading a group of settings, which is a 'uui-box' headline:
         core renders that as <h5 class="uui-h5">, and 'uui-text.css' gives that class
         '--uui-type-h5-size' at weight 400, in the normal text colour, normal case. Those values are
         restated here rather than borrowed, because that stylesheet is global to the backoffice
         document and a class in it reaches nothing inside a shadow root.

         What was here before — uppercase, bold, letter-spaced, 60% opacity — is a label style this
         package invented for the launcher. It appears nowhere in Umbraco, which is reason enough:
         a panel that sits inside the backoffice should be heading its groups the way the backoffice
         does. */
      h4 {
        margin: 0 0 var(--uui-size-space-3);
        font-size: var(--uui-type-h5-size, 16px);
        font-weight: 400;
        line-height: inherit;
        color: var(--uui-color-text);
      }
      .hint {
        margin: var(--uui-size-space-4) 0 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* The same box as the theme preview beside it, ratio included: 16:10, what the theme
         miniature is drawn at, with the image cover-cropped into it. Two settings of the same kind
         showing two sizes of picture is what made this panel look assembled rather than designed. */
      .preview {
        flex-shrink: 0;
        display: block;
        width: ${UMBRADESKTOP_PREVIEW_SCENE.w * UMBRADESKTOP_PREVIEW_SCALE}px;
        aspect-ratio: ${UMBRADESKTOP_PREVIEW_SCENE.w} / ${UMBRADESKTOP_PREVIEW_SCENE.h};
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
      umbradesktop-theme-preview {
        flex-shrink: 0;
        overflow: hidden;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }
    `,
  ];
}

export default UmbraDesktopSettingsAppearanceElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-appearance': UmbraDesktopSettingsAppearanceElement;
  }
}
