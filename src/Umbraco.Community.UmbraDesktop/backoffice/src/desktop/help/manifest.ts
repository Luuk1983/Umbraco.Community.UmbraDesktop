import type { ManifestUmbraDesktopApp } from '../app.extension';
import type { ManifestUmbraDesktopDocs } from '../docs.extension';

/** The Help app's alias, which the Help context opens and finds windows by. Final: it pins. */
export const UMBRADESKTOP_HELP_APP_ALIAS = 'UmbraDesktop.App.Help';

/**
 * The Help app (Help design §4.1).
 *
 * Several windows, like the Content editor, because reading two pages side by side is what the
 * desktop is for, and because opening at a page is then opening a new window with a target (D5).
 */
const app: ManifestUmbraDesktopApp = {
  type: 'umbraDesktopApp',
  alias: UMBRADESKTOP_HELP_APP_ALIAS,
  name: 'UmbraDesktop Help',
  element: () => import('./help.element.js'),
  meta: {
    label: '#umbraDesktop_appHelp',
    icon: 'icon-help-alt',
    group: 'system',
    // Room for the sidebar and a page at a reading measure of about 72 characters.
    defaultSize: { w: 1100, h: 760 },
    // Below 640 wide the sidebar folds behind a Contents button, so a half-snapped window on a
    // laptop still reads; this is only where the page itself would stop being readable.
    minSize: { w: 420, h: 320 },
    allowMultiple: true,
  },
};

/**
 * UmbraDesktop's own docs, registered the way any package registers its docs (Help design D3), so
 * the route every add-on depends on is the one the host itself uses. `scripts/docs/copy-docs.mjs`
 * puts the files there on every build. The weight puts UmbraDesktop first in the product picker,
 * through the same public field any package could use, rather than a special case in the app.
 */
const docs: ManifestUmbraDesktopDocs = {
  type: 'umbraDesktopDocs',
  alias: 'UmbraDesktop.Docs',
  name: 'UmbraDesktop docs',
  weight: 1000,
  meta: { path: '/App_Plugins/Umbraco.Community.UmbraDesktop/docs' },
};

/** Everything the Help feature registers. */
export const manifests: Array<UmbExtensionManifest> = [app, docs];
