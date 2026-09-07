import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Forms — the section, and only the section.
 *
 * Forms puts every destination in its own sidebar (`Umb.Menu.Forms`), and four of its five menu
 * items are `kind: 'tree'`, which `inferUrl` deliberately does not infer (design §5.1). Only
 * `Forms.MenuItem.Analytics` is default-kind, and a tile for it would duplicate a sidebar link the
 * section already shows. So this opens `full-section` and the sidebar does the navigating, the same
 * call as Content and Media.
 *
 * The name is inherited: the section manifest's label is `#sections_forms`, which Forms translates
 * itself and we should not. The icon is not inherited, because a section manifest carries none —
 * `icon-umb-contour` is the Forms icon in Umbraco's own core set, so it renders whether or not the
 * package is installed.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'forms',
    ref: 'Umb.Section.Forms',
    icon: 'icon-umb-contour',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'editing',
    weight: 40,
  },
];
