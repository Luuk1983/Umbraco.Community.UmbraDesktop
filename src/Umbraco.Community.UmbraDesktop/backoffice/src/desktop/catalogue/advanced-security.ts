import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Advanced security — the tools from the Umbraco Advanced Permissions package.
 *
 * The package registers its tools as default-kind menu items inside the Users section, so each
 * entry infers `/umbraco/section/users/workspace/{entityType}` — the same route the package's
 * own sidebar links to. Every entry resolves only where the package is installed, and its
 * absence elsewhere is silent.
 *
 * This fragment describes the package's 18 surface, eight tools: the 17 release registered only the
 * first four, which the 17 branch's catalogue keeps to. Every entry references a `ref`, because a
 * hardcoded `url` is not existence-checked and would ship dead tiles to every site without the
 * package (see `advanced-security.test.ts`).
 *
 * Names are ours rather than inherited: the package gives four menu items the same short label
 * ('Permissions Editor'), with the domain living on the sidebar-app label the desktop never
 * sees. Icons follow the package's per-domain choice
 * for the editors, with `icon-eye` marking the viewers so the pairs stay distinguishable as
 * flat tiles. Each tool is a self-contained workspace with its own selection panel, so the
 * Users sidebar beside it is only noise — hence `workspace-only`.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  // Content
  {
    alias: 'advanced-content-permissions',
    ref: 'UAP.MenuItem.PermissionsEditor',
    section: 'Umb.Section.Users',
    name: '#umbraDesktop_appAdvancedContentPermissions',
    icon: 'icon-document',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'advanced-security',
    weight: 10,
  },
  {
    alias: 'advanced-content-access',
    ref: 'UAP.MenuItem.AccessViewer',
    section: 'Umb.Section.Users',
    name: '#umbraDesktop_appAdvancedContentAccess',
    icon: 'icon-eye',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'advanced-security',
    weight: 20,
  },

  // Document Types
  {
    alias: 'advanced-doc-type-permissions',
    ref: 'UAP.MenuItem.DocTypePermissions',
    section: 'Umb.Section.Users',
    name: '#umbraDesktop_appAdvancedDocTypePermissions',
    icon: 'icon-diploma',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'advanced-security',
    weight: 30,
  },
  {
    // The package still calls this alias "InsertOptions"; it is the Document Type access viewer.
    alias: 'advanced-doc-type-access',
    ref: 'UAP.MenuItem.InsertOptions',
    section: 'Umb.Section.Users',
    name: '#umbraDesktop_appAdvancedDocTypeAccess',
    icon: 'icon-eye',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'advanced-security',
    weight: 40,
  },

  // Library
  {
    alias: 'advanced-library-permissions',
    ref: 'UAP.MenuItem.LibraryPermissions',
    section: 'Umb.Section.Users',
    name: '#umbraDesktop_appAdvancedLibraryPermissions',
    icon: 'icon-globe',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'advanced-security',
    weight: 50,
  },
  {
    alias: 'advanced-library-access',
    ref: 'UAP.MenuItem.LibraryAccessViewer',
    section: 'Umb.Section.Users',
    name: '#umbraDesktop_appAdvancedLibraryAccess',
    icon: 'icon-eye',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'advanced-security',
    weight: 60,
  },

  // Library element types
  {
    alias: 'advanced-element-type-permissions',
    ref: 'UAP.MenuItem.ElementTypePermissions',
    section: 'Umb.Section.Users',
    name: '#umbraDesktop_appAdvancedElementTypePermissions',
    icon: 'icon-thumbnail-list',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'advanced-security',
    weight: 70,
  },
  {
    // Likewise "LibraryInsertOptions" is the library element type access viewer.
    alias: 'advanced-element-type-access',
    ref: 'UAP.MenuItem.LibraryInsertOptions',
    section: 'Umb.Section.Users',
    name: '#umbraDesktop_appAdvancedElementTypeAccess',
    icon: 'icon-eye',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'advanced-security',
    weight: 80,
  },
];
