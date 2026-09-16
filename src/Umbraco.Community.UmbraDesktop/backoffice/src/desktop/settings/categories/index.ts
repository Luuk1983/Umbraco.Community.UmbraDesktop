import type { UmbraDesktopSettingsCategory } from './types';
import { UMBRADESKTOP_APPEARANCE_CATEGORY } from './appearance/index.js';
import { UMBRADESKTOP_GENERAL_CATEGORY } from './general/index.js';
import { UMBRADESKTOP_TASKBAR_CATEGORY } from './taskbar/index.js';
import { UMBRADESKTOP_SITE_CATEGORY } from './site/index.js';

/**
 * Every category the settings panel shows, in the order it shows them.
 *
 * Curated rather than an extension point, the same way `theme/themes/index.ts` and the app catalogue
 * are: a category is a folder plus one entry here, and an empty category cannot exist because a
 * category *is* its folder.
 */
export const UMBRADESKTOP_SETTINGS_CATEGORIES: ReadonlyArray<UmbraDesktopSettingsCategory> = [
  // General first, the way every settings surface that has one puts it first: it is the category a
  // reader falls back to when they are not sure which one holds the thing they want, and a fallback
  // at the bottom of a list is one people scroll past twice.
  UMBRADESKTOP_GENERAL_CATEGORY,
  UMBRADESKTOP_APPEARANCE_CATEGORY,
  // Last of the three, and after Appearance rather than before it: Appearance is where the desktop
  // as a whole is chosen, and this is one strip of it. Windows orders Personalisation's own pages
  // the same way.
  UMBRADESKTOP_TASKBAR_CATEGORY,
  // Last, and not because it matters least: it is the only category here that is not about the
  // reader's own desktop, so it sits after everything that is rather than interrupting them.
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
