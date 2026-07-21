import type { UmbraDesktopCatalogueEntry } from '../types';

/** Settings-area apps: the whole Settings section + the Log Viewer workspace tool. */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'settings',
    ref: 'Umb.Section.Settings',
    name: 'Settings',
    icon: 'icon-settings',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    categoryAlias: 'settings',
    weight: 10,
  },
  {
    // Log Viewer is a default-kind menu item (entityType 'logviewer'); its URL is
    // inferred as /umbraco/section/settings/workspace/logviewer. `section` gives both
    // the permission gate and the section prefix.
    alias: 'log-viewer',
    ref: 'Umb.MenuItem.LogViewer',
    section: 'Umb.Section.Settings',
    name: 'Log Viewer',
    icon: 'icon-box-alt',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 900, h: 640 },
    categoryAlias: 'settings',
    groupAlias: 'diagnostics',
    weight: 10,
  },
];
