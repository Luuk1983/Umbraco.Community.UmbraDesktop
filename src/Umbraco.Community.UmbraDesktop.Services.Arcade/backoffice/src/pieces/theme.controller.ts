import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHostElement } from '@umbraco-cms/backoffice/controller-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';

/** The one member of the desktop's settings context this needs, declared here because nothing is imported from the host. */
interface DesktopTheme extends UmbContextMinimal {
  /** The active theme's id; see `docs/developer/desktop-apps.md` §5 for the ids. */
  readonly theme: Observable<string>;
}

/** The desktop's settings context, by its published alias. */
const DESKTOP_SETTINGS = new UmbContextToken<DesktopTheme>('UmbraDesktopSettingsContext');

/**
 * Stamps the desktop's active theme on an Arcade piece as `data-umbradesktop-theme`, so the piece's
 * `:host([data-umbradesktop-theme=…])` rules work as they do for an app (design P14).
 *
 * The desktop stamps apps itself; a piece lives inside a game's shadow root and is not an app, so it
 * reads the theme where the desktop publishes it. Outside the desktop (a test, the plain backoffice)
 * nothing answers and nothing is stamped, which leaves the unbranched rules: the Umbraco look.
 */
export class ArcadeThemeController extends UmbControllerBase {
  /** @param host The piece. */
  constructor(host: UmbControllerHostElement) {
    super(host);
    this.consumeContext(DESKTOP_SETTINGS, (settings) => {
      if (!settings?.theme) return;
      this.observe(
        settings.theme,
        (id) => {
          if (id) host.setAttribute('data-umbradesktop-theme', id);
          else host.removeAttribute('data-umbradesktop-theme');
        },
        'umbraDesktopArcadeTheme',
      );
    });
  }
}
