import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * System — whole-section admin apps plus a couple of focused, section-wide tools.
 * Settings and Packages are section `ref`s (URL inferred as their section root).
 * Models Builder is a `dashboard` ref scoped to Settings via its own
 * `Umb.Condition.SectionAlias` condition (section gate auto-derived — no `section:`
 * needed). Webhooks is a default-kind menu item (entityType `webhook-root`, its own
 * root workspace registered) — inferred as a workspace URL, same shape as Log Viewer.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'settings',
    ref: 'Umb.Section.Settings',
    name: '#umbraDesktop_appSettings',
    icon: 'icon-settings',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    group: 'system',
    weight: 10,
  },
  {
    alias: 'packages',
    ref: 'Umb.Section.Packages',
    name: '#umbraDesktop_appPackages',
    icon: 'icon-box',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    group: 'system',
    weight: 20,
  },
  {
    // Dashboard ref; /umbraco/section/settings/dashboard/models-builder.
    alias: 'models-builder',
    ref: 'Umb.Dashboard.ModelsBuilder',
    name: '#umbraDesktop_appModelsBuilder',
    icon: 'icon-code',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'system',
    weight: 30,
  },
  {
    // Default-kind menu item; /umbraco/section/settings/workspace/webhook-root.
    alias: 'webhooks',
    ref: 'Umb.MenuItem.Webhook',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appWebhooks',
    icon: 'icon-webhook',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'system',
    weight: 40,
  },
];
