import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Diagnostics-area apps — focused Settings-section tools for inspecting the
 * install's health. All are default-kind menu items or dashboards scoped to the
 * Settings section, so their URLs are inferred from the registry (design §5.1) —
 * no hand-maintained URL needed.
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
  {
    // Umbraco 19 replaced the Examine Management dashboard with the Search screen under
    // Settings, Advanced (Umbraco-CMS#23321): a default-kind menu item like Log Viewer, so its URL
    // is inferred as /umbraco/section/settings/workspace/search-root. The alias stays
    // 'examine-management' so pins and saved layouts made on 18 keep pointing at this app.
    alias: 'examine-management',
    ref: 'Umb.MenuItem.SearchRoot',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appSearchIndexes',
    icon: 'icon-search',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'diagnostics',
    weight: 20,
  },
  {
    alias: 'health-check',
    ref: 'Umb.Dashboard.HealthCheck',
    name: '#umbraDesktop_appHealthCheck',
    icon: 'icon-hearts',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'diagnostics',
    weight: 30,
  },
  {
    alias: 'profiling',
    ref: 'Umb.Dashboard.Profiling',
    name: '#umbraDesktop_appProfiling',
    icon: 'icon-speed-gauge',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'diagnostics',
    weight: 40,
  },
  {
    // Our own dashboard, so the ref always resolves; no `optional` flag needed.
    alias: 'background-jobs',
    ref: 'Umbraco.Community.UmbraDesktop.Dashboard.BackgroundJobs',
    name: '#umbraDesktop_appBackgroundJobs',
    icon: 'icon-time',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'diagnostics',
    weight: 50,
  },
];
