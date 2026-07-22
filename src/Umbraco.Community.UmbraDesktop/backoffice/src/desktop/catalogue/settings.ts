import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Settings-area apps. The full Settings section is intentionally not curated here —
 * editors rarely need it as a standalone app; it still surfaces via the automatic
 * "More" fallback for any permitted section without a curated entry.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    // Log Viewer is a default-kind menu item (entityType 'logviewer'); its URL is
    // inferred as /umbraco/section/settings/workspace/logviewer. `section` gives both
    // the permission gate and the section prefix.
    alias: 'log-viewer',
    ref: 'Umb.MenuItem.LogViewer',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appLogViewer',
    icon: 'icon-box-alt',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'diagnostics',
    weight: 10,
  },
];
