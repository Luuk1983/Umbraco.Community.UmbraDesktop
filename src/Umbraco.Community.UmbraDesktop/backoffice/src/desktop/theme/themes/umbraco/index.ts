import type { UmbraDesktopTheme } from '../../types';
import { UMBRADESKTOP_DEFAULT_METRICS } from '../../../constants';

/**
 * The desktop as it has always looked. Its palettes are deliberately **empty**: every token in the
 * chrome components carries today's value as its CSS fallback, so setting nothing renders exactly
 * what shipped before theming existed. That makes "the Umbraco theme is unchanged" a structural
 * guarantee rather than something to re-check by eye — and it follows the backoffice's own
 * light/dark setting for free, because those fallbacks are `--uui-*` values.
 *
 * Its metrics come from the constants the shell used before theming existed, rather than being
 * retyped here: those constants are still what the CSS fallbacks resolve to, so single-sourcing
 * them is what stops the two drifting apart. They are taken as one object rather than field by
 * field, because the same object is what the window manager and the window element fall back to
 * before any theme has resolved — "the base chrome's geometry" and "this theme's geometry" are one
 * fact, and a copy here would let them differ by an edit.
 */
export const UMBRADESKTOP_UMBRACO_THEME: UmbraDesktopTheme = {
  id: 'umbraco',
  name: 'Umbraco',
  descriptionKey: 'umbraDesktop_themeAboutUmbraco',
  palettes: { light: {} },
  metrics: UMBRADESKTOP_DEFAULT_METRICS,
};
