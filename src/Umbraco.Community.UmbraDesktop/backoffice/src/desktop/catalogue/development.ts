import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Development shortcuts — the modelling/templating trees a developer jumps to constantly.
 *
 * These are tree-based tools: the tree IS the tool, so we do NOT strip the section chrome
 * (unlike a self-contained view such as Log Viewer). They open `full-section` — the whole
 * Settings menu shows — deep-linked to the tree's **root workspace** so it lands auto-selected.
 * Their tree menu items are `kind: 'tree'`, which `inferUrl` deliberately does not infer
 * (design §5.1), so each uses an explicit `url` for the root-workspace route
 * (`/umbraco/section/settings/workspace/{entityType}-root`, verified against the
 * `UMB_*_ROOT_ENTITY_TYPE` constants in the installed backoffice).
 *
 * Only genuinely daily, pin-worthy destinations are shortcutted here; every other Settings
 * tree stays reachable by opening the full Settings app.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'document-types',
    url: '/umbraco/section/settings/workspace/document-type-root',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDocumentTypes',
    icon: 'icon-document',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    group: 'development',
    weight: 10,
  },
  {
    alias: 'data-types',
    url: '/umbraco/section/settings/workspace/data-type-root',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDataTypes',
    icon: 'icon-autofill',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    group: 'development',
    weight: 20,
  },
  {
    alias: 'templates',
    url: '/umbraco/section/settings/workspace/template-root',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appTemplates',
    icon: 'icon-newspaper',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    group: 'development',
    weight: 30,
  },
];
