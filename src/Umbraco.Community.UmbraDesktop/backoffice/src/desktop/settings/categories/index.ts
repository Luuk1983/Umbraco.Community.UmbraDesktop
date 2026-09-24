import type { UmbraDesktopSettingsCategory } from './types';
import { UMBRADESKTOP_APPEARANCE_CATEGORY } from './appearance/index.js';
import { UMBRADESKTOP_GENERAL_CATEGORY } from './general/index.js';
import { UMBRADESKTOP_LANGUAGE_CATEGORY } from './language/index.js';
import { UMBRADESKTOP_TASKBAR_CATEGORY } from './taskbar/index.js';
import { UMBRADESKTOP_CONNECTIONS_CATEGORY } from './connections/index.js';
import { UMBRADESKTOP_SITE_CATEGORY } from './site/index.js';

/**
 * The desktop's own settings categories, in the order the panel shows them.
 *
 * Curated, the same way `theme/themes/index.ts` and the app catalogue are: a category is a folder
 * plus one entry here, and an empty category cannot exist because a category *is* its folder.
 * Categories other packages register (`umbraDesktopSettingsCategory`) are not in this list; the
 * panel splices them in after Taskbar.
 */
export const UMBRADESKTOP_SETTINGS_CATEGORIES: ReadonlyArray<UmbraDesktopSettingsCategory> = [
  // General first, the way every settings surface that has one puts it first: it is the category a
  // reader falls back to when they are not sure which one holds the thing they want, and a fallback
  // at the bottom of a list is one people scroll past twice.
  UMBRADESKTOP_GENERAL_CATEGORY,
  // Before Appearance: what the desktop says and how it writes things down is looked for sooner
  // than what it looks like, and its first row reaches outside the desktop in a way nothing under
  // Appearance does.
  UMBRADESKTOP_LANGUAGE_CATEGORY,
  UMBRADESKTOP_APPEARANCE_CATEGORY,
  // Last of the three, and after Appearance rather than before it: Appearance is where the desktop
  // as a whole is chosen, and this is one strip of it. Windows orders Personalisation's own pages
  // the same way.
  UMBRADESKTOP_TASKBAR_CATEGORY,
  // Further from the others than they are from each other: everything above changes how this
  // desktop looks or behaves, and this one holds credentials for somebody else's server. See its
  // own file for why it is called Connections and not Environments.
  UMBRADESKTOP_CONNECTIONS_CATEGORY,
  // Last, and the only one that is not the reader's own. Everything above it — Connections
  // included — is this person's desktop; everything in here changes what every user on the site
  // gets, which is why it is gated on Settings-section access and says so on the screen.
  UMBRADESKTOP_SITE_CATEGORY,
];

/**
 * Find a category by id.
 *
 * Takes an optional id and answers `undefined` for anything it does not know, because the caller is
 * a deep link: an id from a version that had a category this one does not, or a typo in a URL, has
 * to land on the list rather than on an empty screen.
 * @param id The category id to look for.
 * @returns The category, or undefined.
 */
export function findSettingsCategory(id?: string): UmbraDesktopSettingsCategory | undefined {
  return UMBRADESKTOP_SETTINGS_CATEGORIES.find((category) => category.id === id);
}
