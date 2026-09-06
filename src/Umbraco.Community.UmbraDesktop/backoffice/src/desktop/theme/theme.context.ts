import type { UmbraDesktopResolvedTheme } from './resolve-variant';
import type { UmbraDesktopAdoptedSheets, UmbraDesktopThemeSheets, UmbraDesktopSurface } from './types';
import { resolveTheme } from './resolve-variant.js';
import { paletteCss } from './palette-css.js';
import { UMBRADESKTOP_DEFAULT_THEME_ID, UMBRADESKTOP_THEMES } from './themes/index.js';
import { UMBRADESKTOP_THEME_CONTEXT } from './theme.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbBasicState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_THEME_CONTEXT, UMB_THEME_LIGHT_ALIAS } from '@umbraco-cms/backoffice/themes';

/**
 * Build a theme's authored `CSSResult`s into real stylesheets, dropping any surface whose sheet
 * could not be built.
 *
 * Done here, once per theme load, rather than where the sheets are adopted: `CSSResult.styleSheet`
 * is a lazy getter that caches onto the `CSSResult`, and the value is about to be handed to an
 * observable state that other code may freeze or copy. Resolving it while the object is still
 * fresh from its module is the only point where that laziness is guaranteed to be safe.
 *
 * `styleSheet` is `undefined` on a browser without constructable stylesheets, which is why the
 * result is filtered rather than asserted: such a browser gets the components' own CSS and the
 * theme's palette, which is a degraded look rather than a broken one.
 * @param sheets The theme's authored stylesheets.
 * @returns The same surfaces, as adoptable stylesheets.
 */
function buildSheets(sheets: UmbraDesktopThemeSheets): UmbraDesktopAdoptedSheets {
  const built: UmbraDesktopAdoptedSheets = {};
  for (const [surface, result] of Object.entries(sheets) as [UmbraDesktopSurface, UmbraDesktopThemeSheets[UmbraDesktopSurface]][]) {
    const styleSheet = result?.styleSheet;
    if (styleSheet) built[surface] = styleSheet;
  }
  return built;
}

/**
 * Owns the chrome theme in force: the user's stored choice resolved against the backoffice's own
 * light/dark setting, and everything the desktop needs in order to paint it. Provided by the
 * desktop element, so it is scoped to the desktop subtree the same way the window manager, app
 * catalogue and settings contexts are.
 *
 * This is also the only channel that reaches a modal. Umbraco portals modals out of the opener's
 * subtree, so the palette custom properties the desktop sets on its own root never inherit into
 * one — but a modal resolves contexts through the element that opened it, which is why the
 * settings dialog can consume this to render the theme picker.
 */
export class UmbraDesktopThemeContext extends UmbContextBase {
  /** The theme, variant and palette currently resolved, backing {@link resolved}. */
  #resolved = new UmbObjectState<UmbraDesktopResolvedTheme>(
    resolveTheme({
      themeId: UMBRADESKTOP_DEFAULT_THEME_ID,
      umbThemeAlias: UMB_THEME_LIGHT_ALIAS,
      catalogue: UMBRADESKTOP_THEMES,
    }),
  );

  /**
   * The active theme's stylesheets, backing {@link sheets}. Starts empty until the first import
   * resolves.
   *
   * `UmbBasicState`, deliberately, where every other state here is an `UmbObjectState`. That class
   * deep-freezes what it holds and deduplicates emissions with `JSON.stringify`, and stylesheets
   * survive neither: freezing breaks the lazy build behind `CSSResult.styleSheet` (see
   * {@link UmbraDesktopAdoptedSheets}), and a `CSSStyleSheet` stringifies to `{}`, so switching
   * between two themes that both style the same surfaces would compare equal and never emit at
   * all. A plain state compares by identity, which is exactly right for a set of objects that is
   * replaced wholesale on every theme change.
   */
  #sheets = new UmbBasicState<UmbraDesktopAdoptedSheets>({});

  /** The theme, variant and palette in force. */
  public readonly resolved = this.#resolved.asObservable();

  /** The active theme's palette, rendered as declarations for a `style` attribute. */
  public readonly paletteStyle = this.#resolved.asObservablePart((resolved) => paletteCss(resolved.palette));

  /** The geometry the window manager and desktop surface need. */
  public readonly metrics = this.#resolved.asObservablePart((resolved) => resolved.theme.metrics);

  /**
   * The active theme's stylesheets, per surface, built and ready to adopt. Starts empty and is
   * replaced once the theme's module resolves, so a lazily imported theme never renders a frame of
   * unstyled chrome — the previous theme's sheets stay adopted until the new ones arrive.
   */
  public readonly sheets = this.#sheets.asObservable();

  /** The id the user chose, which may differ from what is in force under high contrast. */
  #chosenId = UMBRADESKTOP_DEFAULT_THEME_ID;

  /** The backoffice's current theme alias. */
  #umbAlias = UMB_THEME_LIGHT_ALIAS;

  /** Guards against a slow import of an abandoned theme overwriting a newer selection. */
  #pending = 0;

  /**
   * @param host The controller host providing this context, forwarded to {@link UmbContextBase}.
   */
  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_THEME_CONTEXT);

    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.theme, (id) => {
        this.#chosenId = id ?? UMBRADESKTOP_DEFAULT_THEME_ID;
        this.#apply();
      });
    });

    this.consumeContext(UMB_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.theme, (alias) => {
        this.#umbAlias = alias || UMB_THEME_LIGHT_ALIAS;
        this.#apply();
      });
    });
  }

  /**
   * Re-resolve the theme and load its stylesheets. Cheap when nothing changed: resolving is pure,
   * and a theme's module is only imported when the theme in force actually differs.
   */
  #apply(): void {
    const previous = this.#resolved.getValue();
    const next = resolveTheme({
      themeId: this.#chosenId,
      umbThemeAlias: this.#umbAlias,
      catalogue: UMBRADESKTOP_THEMES,
    });
    this.#resolved.setValue(next);
    if (previous.theme.id !== next.theme.id) void this.#loadSheets(next);
  }

  /**
   * Import the resolved theme's stylesheets and publish them.
   *
   * A theme with no `sheets` — the Umbraco identity theme — publishes an empty set immediately,
   * which is what un-adopts the previous theme's rules.
   * @param resolved The theme now in force.
   */
  async #loadSheets(resolved: UmbraDesktopResolvedTheme): Promise<void> {
    const ticket = ++this.#pending;
    if (!resolved.theme.sheets) {
      this.#sheets.setValue({});
      return;
    }
    try {
      const sheets = await resolved.theme.sheets();
      // A newer selection landed while this import was in flight; its sheets win.
      if (ticket === this.#pending) this.#sheets.setValue(buildSheets(sheets));
    } catch (error) {
      // A theme whose module fails to load leaves the chrome on its palette alone rather than
      // taking the desktop down: the fallbacks in every component still render something usable.
      // Reported rather than swallowed, though — this used to fail silently, and a theme that
      // half-applies looks like a CSS bug rather than a load failure.
      console.error(`[UmbraDesktop] Could not load stylesheets for theme "${resolved.theme.id}".`, error);
      if (ticket === this.#pending) this.#sheets.setValue({});
    }
  }
}

export default UmbraDesktopThemeContext;
