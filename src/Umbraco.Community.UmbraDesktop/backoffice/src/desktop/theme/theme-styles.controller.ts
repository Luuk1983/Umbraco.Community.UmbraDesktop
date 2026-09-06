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
 *
 * The theme context publishes stylesheets already built (see `UmbraDesktopAdoptedSheets`), so
 * nothing here reads a `CSSResult`'s lazy `.styleSheet`. It used to, and that was the bug that
 * kept every theme from ever restyling the chrome: the published objects are frozen in transit,
 * and building the sheet writes to the object it is built from.
 *
 * **The host must be an `UmbLitElement`** (or anything else built on Umbraco's controller-host
 * element mixin), and that is load-bearing rather than incidental. Capturing the base only works
 * because the host's own styles are already in `adoptedStyleSheets` the first time `#adopt` runs:
 * Lit's `connectedCallback` creates the render root — which adopts `static styles` synchronously —
 * *before* it runs any controller's `hostConnected`, and Umbraco's mixin calls Lit's
 * `connectedCallback` first and only then cascades to its controllers. A host that instead started
 * its controllers before its render root existed would capture an empty base, and the next adopt
 * would drop the component's own stylesheet and leave it unstyled.
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
      this.observe(context.sheets, (sheets) => this.#adopt(host, sheets?.[this.#surface]));
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
