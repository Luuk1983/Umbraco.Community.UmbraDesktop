import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco UI Builder — one entry, and it is not a section.
 *
 * UI Builder generates its sections, section views, menus and dashboards at runtime from server
 * configuration, with aliases interpolated from whatever the site configured
 * (`UiBuilder.Section.{alias}`). No catalogue can know them, and none needs to: the desktop's
 * uncertified fallback already surfaces any permitted section it does not recognise in "More",
 * which is the honest answer for a section whose alias is unknowable.
 *
 * What *is* static is the UI Builder entry in Settings → Advanced. It is a default-kind menu item
 * over entity type `uibuilder-root`, so its URL infers, and it declares both a label and an icon,
 * so both are inherited.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'ui-builder',
    ref: 'UiBuilder.MenuItem.Settings',
    section: 'Umb.Section.Settings',
    // Name ("UI Builder") and icon (`icon-tools`) both come from the menu item.
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'development',
    weight: 40,
  },
];
