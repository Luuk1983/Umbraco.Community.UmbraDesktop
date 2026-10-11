import { UMBRADESKTOP_THEMES } from '../../theme/themes/index';
import { previewWallpaper } from '../../theme/theme-wallpaper';
import type { UmbraDesktopVariant } from '../../theme/resolve-variant';
import type { UmbraDesktopBackofficeTheme } from '../../theme/backoffice-themes';
import type { UmbraDesktopThemeContext } from '../../theme/theme.context';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token';
import { UMBRADESKTOP_WELCOME_PREVIEW_SCALE } from '../constants';
import '../../theme/preview/theme-preview.element.js';
import { css, customElement, html, nothing, property, repeat, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { UMB_THEME_HIGH_CONTRAST_ALIAS } from '@umbraco-cms/backoffice/themes';

/** What a miniature falls back to when its theme declares no wallpaper: no image, its own ground. */
const NO_WALLPAPER = { url: null, averageColour: null };

/**
 * The welcome wizard's theme page: the five themes as the same drawn miniatures the theme picker
 * uses, each on its own wallpaper, the current one selected (design doc §3.3).
 *
 * Each tile shows the theme's own wallpaper because choosing a theme here brings that wallpaper with
 * it (D10). In the picker the same tile shows your current wallpaper unless the wallpaper follows
 * the theme; `previewWallpaper` with following on is exactly this page's rule.
 *
 * Nothing behind the wizard changes while choosing. The choice shows when the wizard closes.
 *
 * Under the five, the backoffice's own colours: Umbraco's Light, Dark and High contrast, whatever
 * the registry holds, as Desktop settings offers them. They are one choice of look, which is why
 * they share this page rather than taking a fourth. Unlike the desktop theme, a choice here applies
 * at once, through the desktop's theme context into core's, because core owns and stores it, the
 * way the language page saves to the profile. The miniatures follow it, since they are painted in
 * the backoffice's light or dark.
 *
 * The desktop theme is presentational, like the language page: the screen holds the value and saves
 * it on Done.
 */
@customElement('umbradesktop-welcome-theme')
export class UmbraDesktopWelcomeThemePageElement extends UmbLitElement {
  /** The selected theme's id. */
  @property({ type: String })
  public value = '';

  /**
   * Whether the backoffice is light or dark, which the miniatures are painted in, for the reason the
   * theme picker gives: a theme's chosen palette is the wrong question for a row of other themes.
   */
  @state()
  private _variant: UmbraDesktopVariant = 'light';

  /** The backoffice's registered themes: Light, Dark and High contrast unless a package adds one. */
  @state()
  private _backofficeThemes: ReadonlyArray<UmbraDesktopBackofficeTheme> = [];

  /** The backoffice theme in force. */
  @state()
  private _backofficeTheme?: string;

  /** The desktop's theme context, which applies a backoffice theme through core's. */
  #themeContext?: UmbraDesktopThemeContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      this.#themeContext = context ?? undefined;
      if (!context) return;
      this.observe(context.backofficeVariant, (variant) => (this._variant = variant));
      this.observe(context.backofficeThemes, (themes) => (this._backofficeThemes = themes ?? []));
      this.observe(context.backofficeTheme, (alias) => (this._backofficeTheme = alias));
    });
  }

  /**
   * The backoffice's own colours, when the registry has any to offer.
   *
   * A heading in sentence case and bold, as a box headline is in the backoffice, and the choices as
   * one row of pills: three short names that read as one setting, under the larger choice above.
   * @returns The row, or nothing before the themes are known.
   */
  #renderBackoffice() {
    if (this._backofficeThemes.length === 0) return nothing;

    return html`<section class="backoffice">
      ${this.#renderHead('backoffice-label', 'umbraDesktop_backofficeTheme', 'umbraDesktop_welcomeBackofficeThemeAbout')}
      <div class="choices" role="radiogroup" aria-labelledby="backoffice-label">
        ${repeat(
          this._backofficeThemes,
          (theme) => theme.alias,
          (theme) => html`
            <label class="choice ${theme.alias === this._backofficeTheme ? 'on' : ''}">
              <input
                type="radio"
                name="backoffice"
                value=${theme.alias}
                .checked=${theme.alias === this._backofficeTheme}
                @change=${() => this.#themeContext?.setBackofficeTheme(theme.alias)} />
              <span>${theme.name}</span>
            </label>
          `,
        )}
      </div>
    </section>`;
  }

  /**
   * A section's name and what it changes.
   *
   * Two themes on one page need telling apart, and their names alone do not: "theme" is what both
   * the desktop and Umbraco call theirs. So each says which part of the screen it is for. Sentence
   * case and bold, as a box headline is in the backoffice.
   * @param id The label's id, for the radio group to be labelled by.
   * @param labelKey The section's name, as a localization key.
   * @param hintKey What it changes, as a localization key.
   * @returns The heading.
   */
  #renderHead(id: string, labelKey: string, hintKey: string) {
    return html`<p class="section-label" id=${id}>${this.localize.term(labelKey)}</p>
      <p class="section-hint">${this.localize.term(hintKey)}</p>`;
  }

  /**
   * Take a new choice and report it.
   * @param id The theme chosen.
   */
  #choose(id: string): void {
    this.value = id;
    this.dispatchEvent(new UmbChangeEvent());
  }

  override render() {
    const highContrast = this._backofficeTheme === UMB_THEME_HIGH_CONTRAST_ALIAS;
    return html`
      <section>
        ${this.#renderHead('desktop-label', 'umbraDesktop_welcomeDesktopTheme', 'umbraDesktop_welcomeDesktopThemeAbout')}
        <div class="themes" role="radiogroup" aria-labelledby="desktop-label">
          ${repeat(
            UMBRADESKTOP_THEMES,
            (theme) => theme.id,
            (theme) => html`
              <label class=${theme.id === this.value ? 'on' : ''}>
                <input
                  type="radio"
                  name="theme"
                  value=${theme.id}
                  .checked=${theme.id === this.value}
                  @change=${() => this.#choose(theme.id)} />
                <umbradesktop-theme-preview
                  .theme=${theme}
                  .variant=${this._variant}
                  .highContrast=${highContrast}
                  .wallpaper=${previewWallpaper(theme, NO_WALLPAPER, true)}></umbradesktop-theme-preview>
                <span class="name">${theme.name}</span>
              </label>
            `,
          )}
        </div>
      </section>
      ${this.#renderBackoffice()}
    `;
  }

  static override styles = css`
    :host {
      display: block;
    }

    .themes {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 16px;
    }

    label {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }

    /* The radio itself is hidden: the row is the control, and the focus ring goes on the row. It
       sits inside its row, which is positioned for it. Positioned against the screen instead, it
       landed outside the list's scroll area, and focusing a language far down the list scrolled
       the whole wizard to it, off its own head and buttons. */
    label {
      position: relative;
    }
    input {
      position: absolute;
      inset: 0;
      margin: 0;
      opacity: 0;
      pointer-events: none;
    }

    umbradesktop-theme-preview {
      --umbradesktop-preview-scale: ${unsafeCSS(UMBRADESKTOP_WELCOME_PREVIEW_SCALE)};
      overflow: hidden;
      border-radius: 6px;
      outline: 2px solid transparent;
      outline-offset: 3px;
    }
    label:hover umbradesktop-theme-preview {
      outline-color: rgba(255, 255, 255, 0.35);
    }
    label.on umbradesktop-theme-preview {
      outline-color: rgba(255, 255, 255, 0.92);
    }
    label:has(input:focus-visible) umbradesktop-theme-preview {
      outline-color: rgba(255, 255, 255, 0.92);
      outline-style: dashed;
    }

    .name {
      margin-top: 12px;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.72);
    }
    label.on .name {
      color: rgba(255, 255, 255, 0.96);
      font-weight: 600;
    }

    section {
      text-align: center;
    }
    .backoffice {
      margin-top: 36px;
    }
    .section-label {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }
    .section-hint {
      margin: 4px 0 14px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.72);
    }
    .choices {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .choice {
      flex-direction: row;
      padding: 8px 16px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 999px;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.85);
    }
    .choice:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .choice.on {
      border-color: rgba(255, 255, 255, 0.92);
      background: rgba(53, 68, 177, 0.55);
      color: #fff;
      font-weight: 600;
    }
    .choice:has(input:focus-visible) {
      outline: 2px solid rgba(255, 255, 255, 0.92);
      outline-offset: 2px;
    }
  `;
}

export default UmbraDesktopWelcomeThemePageElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-welcome-theme': UmbraDesktopWelcomeThemePageElement;
  }
}
