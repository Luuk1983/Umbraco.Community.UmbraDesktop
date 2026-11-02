import type { ManifestUmbraDesktopApp } from '../app.extension';

/** The Add-ons app's alias, which Desktop settings opens it by. Final: it pins. */
export const UMBRADESKTOP_ADD_ONS_APP_ALIAS = 'UmbraDesktop.App.AddOns';

/** The app's icon, which the button to it in Desktop settings carries too. */
export const UMBRADESKTOP_ADD_ONS_APP_ICON = 'icon-puzzle-piece';

/**
 * The Add-ons app (#188).
 *
 * No conditions: every user may see what exists for the desktop, and the app asks nothing of them
 * but to pass a line on. One window, because a second would show the same list.
 */
const app: ManifestUmbraDesktopApp = {
  type: 'umbraDesktopApp',
  alias: UMBRADESKTOP_ADD_ONS_APP_ALIAS,
  name: 'UmbraDesktop Add-ons',
  element: () => import('./add-ons.element.js'),
  meta: {
    label: '#umbraDesktop_appAddOns',
    icon: UMBRADESKTOP_ADD_ONS_APP_ICON,
    group: 'system',
    // Three cards across, and on the details page the side panel beside a screenshot large enough
    // to read.
    defaultSize: { w: 1000, h: 720 },
    // One card across, and the details page in one column, from its container query down.
    minSize: { w: 400, h: 320 },
    allowMultiple: false,
  },
};

/** Everything the Add-ons feature registers. */
export const manifests: Array<UmbExtensionManifest> = [app];
