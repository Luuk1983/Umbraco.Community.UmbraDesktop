import type { UmbraDesktopResolvedTheme } from './resolve-variant';
import type { UmbraDesktopThemeSheets } from './types';
import { resolveTheme } from './resolve-variant.js';
import { paletteCss } from './palette-css.js';
import { UMBRADESKTOP_DEFAULT_THEME_ID, UMBRADESKTOP_THEMES } from './themes/index.js';
import { UMBRADESKTOP_THEME_CONTEXT } from './theme.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_THEME_CONTEXT, UMB_THEME_LIGHT_ALIAS } from '@umbraco-cms/backoffice/themes';

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

  /** The active theme's stylesheets, backing {@link sheets}. Starts empty until the first import resolves. */
  #sheets = new UmbObjectState<UmbraDesktopThemeSheets>({});

  /** The theme, variant and palette in force. */
  public readonly resolved = this.#resolved.asObservable();

  /** The active theme's palette, rendered as declarations for a `style` attribute. */
  public readonly paletteStyle = this.#resolved.asObservablePart((resolved) => paletteCss(resolved.palette));

  /** The geometry the window manager and desktop surface need. */
  public readonly metrics = this.#resolved.asObservablePart((resolved) => resolved.theme.metrics);

  /**
   * The active theme's stylesheets, per surface. Starts empty and is replaced once the theme's
   * module resolves, so a lazily imported theme never renders a frame of unstyled chrome — the
   * previous theme's sheets stay adopted until the new ones arrive.
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
      if (ticket === this.#pending) this.#sheets.setValue(sheets);
    } catch {
      // A theme whose module fails to load leaves the chrome on its palette alone rather than
      // taking the desktop down: the fallbacks in every component still render something usable.
      if (ticket === this.#pending) this.#sheets.setValue({});
    }
  }
}

export default UmbraDesktopThemeContext;
