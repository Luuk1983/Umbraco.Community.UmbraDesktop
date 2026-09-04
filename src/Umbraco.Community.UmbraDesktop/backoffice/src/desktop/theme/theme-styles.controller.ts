import type { UmbraDesktopSurface } from './types';
import { UMBRADESKTOP_THEME_CONTEXT } from './theme.context-token.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * Adopts the active theme's stylesheet for one surface into its host component's shadow root.
 *
 * Lit populates `adoptedStyleSheets` from the element's `static styles` when it first renders, so
 * the component's own rules are captured **once** as a base and the theme sheet is always appended
 * to a fresh copy of it. Appending, rather than prepending, is what gives theme rules their
 * authority: later sheets win at equal specificity, so a theme can restate a base selector —
 * `.frame:not(.active) .title` — and override it without `!important`.
 */
export class UmbraDesktopThemeStyles extends UmbControllerBase {
  /** Which of the theme's stylesheets this host wants. */
  #surface: UmbraDesktopSurface;

  /** The component's own stylesheets, captured before any theme sheet is added. */
  #base?: ReadonlyArray<CSSStyleSheet>;

  /**
   * @param host The element whose shadow root receives the sheet.
   * @param surface Which of the theme's stylesheets this host wants.
   */
  constructor(host: UmbControllerHost & { renderRoot?: ParentNode }, surface: UmbraDesktopSurface) {
    super(host);
    this.#surface = surface;
    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.sheets, (sheets) => this.#adopt(host, sheets?.[this.#surface]?.styleSheet));
    });
  }

  /**
   * Replace whatever theme sheet is adopted with this one.
   * @param host The element to style.
   * @param sheet The theme's sheet for this surface, or `undefined` when it styles nothing here.
   */
  #adopt(host: { renderRoot?: ParentNode }, sheet?: CSSStyleSheet): void {
    const root = host.renderRoot as ShadowRoot | undefined;
    if (!root || !('adoptedStyleSheets' in root)) return;
    this.#base ??= [...root.adoptedStyleSheets];
    root.adoptedStyleSheets = sheet ? [...this.#base, sheet] : [...this.#base];
  }
}
