import type { UmbraDesktopCatalogueEntry } from '../types';

/** Security — whole-section apps, each its own permission gate (`Umb.Section.Users` / `Umb.Section.Members`). */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'users',
    ref: 'Umb.Section.Users',
    name: '#umbraDesktop_appUsers',
    icon: 'icon-users',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    group: 'security',
    weight: 10,
  },
  {
    alias: 'members',
    ref: 'Umb.Section.Members',
    name: '#umbraDesktop_appMembers',
    icon: 'icon-user',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    group: 'security',
    weight: 20,
  },
];
