import type { UmbraDesktopTheme } from '../../types';
import { UMBRADESKTOP_DEFAULT_METRICS } from '../../../constants';
import { UMBRACO_PALETTE } from './palette.js';

/**
 * The desktop as the Umbraco backoffice would draw it: the focused window wears the backoffice's
 * own header (a navy caption with a Regular white title), caption buttons are round, corners are as
 * round as the cards inside a window, and shadows are tinted with the brand. An unfocused window turns sand and quiet rather than just fading.
 *
 * It used to be an empty palette over the base chrome, and that was a guarantee worth having:
 * setting nothing could not drift from what shipped. It is a palette and two sheets now, because
 * the look it wants is not a different set of values for the same shapes. A round hover face and a
 * hover tile are structure, and putting them in the base would have put them in every other
 * theme too. What it keeps from the old arrangement is the half that matters: **every value is a
 * `--uui-*` reference**, so it follows the backoffice's light, dark and high-contrast settings and a
 * site's own colours with no dark palette of its own, and it still answers **no app token**, so an
 * app's own fallback remains the Umbraco look.
 *
 * Its metrics are still the base chrome's own, and that is the promise that makes the restyle safe.
 * The caption is still 40px, the buttons 46px wide and the frame ring 1px, so nothing the window
 * manager clamps against moved. They are taken as one object, as before, because the same object is
 * what the window manager and the window element fall back to before any theme has resolved. The
 * theme's `metrics.test.ts` mounts the window with this palette and these sheets in force and holds
 * the object against what is painted.
 */
export const UMBRADESKTOP_UMBRACO_THEME: UmbraDesktopTheme = {
  id: 'umbraco',
  name: 'Umbraco',
  descriptionKey: 'umbraDesktop_themeAboutUmbraco',
  palettes: { light: UMBRACO_PALETTE },
  // The default wallpaper, so that a user on the default theme who turns the toggle on sees
  // nothing change. That is the right answer for a setting whose job is to make *later* theme
  // changes carry, rather than to redecorate on the spot.
  wallpaper: { kind: 'builtin', id: 'aurora-flow' },
  metrics: UMBRADESKTOP_DEFAULT_METRICS,
  sheets: async () => {
    const [taskbar, window] = await Promise.all([import('./taskbar.css.js'), import('./window.css.js')]);
    return { taskbar: taskbar.default, window: window.default };
  },
};
