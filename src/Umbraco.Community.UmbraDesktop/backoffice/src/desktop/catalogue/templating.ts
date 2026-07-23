import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Templating-area shortcuts — front-end files a developer edits regularly. Like the Structure
 * trees, these are tree-based, so they open `full-section` (the menu stays) deep-linked to the
 * tree's root workspace. Templates has a verified root workspace (`template-root`); Partial
 * Views / Stylesheets / Scripts are deliberately left to the full Settings app (lower frequency).
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'templates',
    url: '/umbraco/section/settings/workspace/template-root',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appTemplates',
    icon: 'icon-newspaper',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    group: 'templating',
    weight: 10,
  },
];
