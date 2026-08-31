import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Synchronisation — moving a site's shape and content between environments.
 *
 * These are third-party package surfaces, so every entry here is `optional`: it points at
 * the package's own registered extension by `ref`, which means the app appears only on
 * installs that actually have the package, and resolving to nothing elsewhere is silent
 * rather than a warning. Umbraco Deploy belongs in this group when it is added.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    // uSync registers `usync.menu.item` as a default-kind menu item (entityType
    // `usync-root`) under Settings, so the URL infers as
    // /umbraco/section/settings/workspace/usync-root — the same route its sidebar link uses.
    // uSync can also run in a section of its own (its `usync.condition.new-section` mode);
    // that install gates this entry out and uSync surfaces as a "More" section fallback instead.
    alias: 'usync',
    ref: 'usync.menu.item',
    section: 'Umb.Section.Settings',
    optional: true,
    // Name inherited from the uSync manifest ("uSync" — a product name, not translated).
    // uSync registers this icon itself (`usync.icons`), so it is present exactly when the
    // entry is.
    icon: 'usync-logo',
    // The whole workspace is self-contained — report/import/export per group, its own tab
    // strip for Settings/History/Add-ons — so the Settings tree beside it is just noise.
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 10,
  },
];
