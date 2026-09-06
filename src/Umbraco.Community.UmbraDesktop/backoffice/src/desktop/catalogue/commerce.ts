import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Commerce — one entry, because there is nothing else to point at.
 *
 * Commerce navigates by a custom `ucStoreMenuItem` extension type the registry adapter has no case
 * for, and every destination below the section is scoped to a store id. There is no store-independent
 * URL for orders, discounts or gift cards, so a tile for any of them would need a store chosen at
 * catalogue-authoring time. The section opens `full-section` and its own sidebar does the work.
 *
 * **The alias really is the bare string `commerce`**, not `Umb.Section.Commerce`. It looks like an
 * oversight in the package and is not; `commercial.test.ts` asserts it so that nobody corrects it
 * into something that resolves to nothing. Same shape on the 17.x and 18.x branches.
 *
 * The label is the plain string "Commerce", so the name is inherited. Commerce registers no icons,
 * hence a core one.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'commerce',
    ref: 'commerce',
    icon: 'icon-shopping-basket',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'marketing-sales',
    weight: 10,
  },
];
