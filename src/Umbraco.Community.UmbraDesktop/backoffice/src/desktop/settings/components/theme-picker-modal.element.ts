import type { UmbraDesktopThemePickerModalData } from '../modal-tokens';
import type { UmbraDesktopSettingsContext } from '../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings.context-token';
import { UMBRADESKTOP_THEMES } from '../../theme/themes/index';
import { previewWallpaper } from '../../theme/theme-wallpaper';
import type { UmbraDesktopWallpaperView } from '../wallpaper-view';
import { UMBRADESKTOP_PREVIEW_PICKER_SCALE } from '../../theme/preview/constants';
import type { UmbraDesktopResolvedTheme, UmbraDesktopVariant } from '../../theme/resolve-variant';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token';
import '../../theme/preview/theme-preview.element.js';
import { css, customElement, html, repeat, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';

/**
 * The theme picker: every shipped theme as a miniature of the desktop it paints, one to a row, with
 * the one in use marked.
 *
 * **It applies and stays open**, where the wallpaper picker beside it returns a value and closes.
 * That difference is deliberate and is the whole reason a theme picker can afford to be a separate
 * surface at all: a theme is something you flip through — click, look at the desktop, click the
 * next — and a picker that closed on every click would turn five tries into ten clicks. A wallpaper
 * you pick once, so there closing is the courtesy.
 *
 * Applying goes through the settings context, exactly as the settings panel that opened this does,
 * so there is nothing to hand back on close and no way for the two to disagree about what is set.
 */
@customElement('umbradesktop-theme-picker-modal')
export class UmbraDesktopThemePickerModalElement extends UmbModalBaseElement<UmbraDesktopThemePickerModalData, never> {
  /**
   * The theme the user has chosen, which is what the picker marks. Taken from the modal's data on
   * open and then kept up to date from the settings context, so a click marks the row it came from
   * without this element having to guess that the write succeeded.
   */
  @state()
  private _chosenThemeId?: string;

  /** The theme in force, which is where this reads the *chosen* theme's id from. */
  @state()
  private _theme?: UmbraDesktopResolvedTheme;

  /**
   * Whether the backoffice is light or dark, which is what every miniature here is painted in.
   *
   * **Not** `_theme.variant`. That is the palette the *chosen* theme ended up with, and a theme
   * that ships no dark palette — the Umbraco theme, which is the default — reports `light` for it
   * in a dark backoffice. Painting the row from that made every preview light: invisible on the
   * four themes that leave the window body on the backoffice's own token, and glaring on macOS,
   * which is the one theme that states that colour, so the row showed one white tile among four
   * dark ones. Each preview falls back to its own theme's light palette by itself, so what it wants
   * from here is the environment.
   */
  @state()
  private _variant: UmbraDesktopVariant = 'light';

  /**
   * Whether the wallpaper is following the theme. Observed rather than held locally because the
   * wallpaper picker turns it off, so this can change while the picker is open and on screen.
   */
  @state()
  private _followsTheme = false;

  /**
   * The wallpaper the desktop is painting now, resolved. Every tile falls back to it, and with the
   * toggle off every tile *is* it — so the row reads as "your desktop, five ways" rather than five
   * unrelated pictures.
   */
  @state()
  private _current?: UmbraDesktopWallpaperView;

  #settings?: UmbraDesktopSettingsContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.theme, (id) => (this._chosenThemeId = id));
      this.observe(context.wallpaperFollowsTheme, (on) => (this._followsTheme = on));
      this.observe(context.wallpaper, (view) => (this._current = view));
    });

    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.resolved, (resolved) => (this._theme = resolved));
      this.observe(context.backofficeVariant, (variant) => (this._variant = variant));
    });
  }

  /**
   * The current wallpaper as a tile-sized background.
   *
   * The thumbnail rather than the full-size image, to match what `previewWallpaper` hands back for
   * a theme's own wallpaper — a row where one tile loaded a 20KB thumbnail and its neighbour the
   * full image would be paying for nothing visible.
   * @returns The resolved current wallpaper, or an empty one before settings have loaded.
   */
  #currentThumb(): { url: string | null; averageColour: string | null } {
    return {
      url: this._current?.thumbUrl ?? null,
      averageColour: this._current?.background.averageColour ?? null,
    };
  }

  override connectedCallback() {
    super.connectedCallback();
    // The opener already knows which theme is current, and the settings context may take a moment
    // to arrive. Seeding from the data means the right row is marked on the first paint rather than
    // a frame later, which would read as the picker forgetting the user's theme.
    this._chosenThemeId ??= this.data?.current;
  }

  override render() {
    const activeId = this._chosenThemeId ?? this._theme?.theme.id;
    return html`
      <umb-body-layout headline=${this.localize.term('umbraDesktop_themePickerTitle')}>
        <p class="hint">${this.localize.term('umbraDesktop_themeDescription')}</p>
        <div class="follows">
          <uui-toggle
            label=${this.localize.term('umbraDesktop_wallpaperFollowsTheme')}
            ?checked=${this._followsTheme}
            @change=${(event: Event) =>
              this.#settings?.setWallpaperFollowsTheme(
                !!(event.target as HTMLInputElement | null)?.checked,
              )}></uui-toggle>
        </div>
        <div class="themes">
          ${repeat(
            UMBRADESKTOP_THEMES,
            (theme) => theme.id,
            (theme) => html`
              <button
                class="theme ${theme.id === activeId ? 'on' : ''}"
                aria-pressed=${theme.id === activeId ? 'true' : 'false'}
                @click=${() => this.#settings?.setTheme(theme.id)}>
                <umbradesktop-theme-preview
                  .theme=${theme}
                  .variant=${this._variant}
                  .wallpaper=${previewWallpaper(theme, this.#currentThumb(), this._followsTheme)}></umbradesktop-theme-preview>
                <span class="text">
                  <span class="name">${theme.name}</span>
                  <span class="about">${this.localize.term(theme.descriptionKey)}</span>
                </span>
              </button>
            `,
          )}
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
      /* The sentence that used to sit in the panel above the theme row. It belongs here now: the
         panel states what you are using, and this is where you are deciding. */
      .hint {
        margin: 0 0 var(--uui-size-space-4);
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .themes {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
      }
      /* Above the list, separated by a rule: it decides what every click below it will do, so it
         belongs where you set it *before* flipping through themes rather than after. No sentence
         under it — "Match the wallpaper to the theme" is already the whole behaviour, and a hint
         restating a label is noise in a panel this narrow. */
      .follows {
        margin-bottom: var(--uui-size-space-4);
        padding-bottom: var(--uui-size-space-4);
        border-bottom: 1px solid var(--uui-color-border);
      }
      /* A row, not a tile: in a panel this narrow the width is there to be used, and it is what
         gives a theme's name a sentence beside it rather than a caption under it. */
      .theme {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        padding: var(--uui-size-space-3);
        border: 2px solid transparent;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        font-family: inherit;
        text-align: left;
        cursor: pointer;
      }
      .theme:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .theme.on {
        border-color: var(--uui-color-selected, var(--uui-color-focus));
      }
      umbradesktop-theme-preview {
        flex-shrink: 0;
        overflow: hidden;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        --umbradesktop-preview-scale: ${unsafeCSS(UMBRADESKTOP_PREVIEW_PICKER_SCALE)};
      }
      .text {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
      }
      .name {
        font-weight: 700;
      }
      .about {
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
    `,
  ];
}

export default UmbraDesktopThemePickerModalElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-theme-picker-modal': UmbraDesktopThemePickerModalElement;
  }
}
