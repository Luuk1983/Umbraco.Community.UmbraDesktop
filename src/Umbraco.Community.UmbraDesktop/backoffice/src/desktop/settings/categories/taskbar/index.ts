import type { UmbraDesktopSettingsCategory } from '../types';
import './taskbar.element.js';

/**
 * What the taskbar carries beside the launcher button: the fixed features, one switch each.
 *
 * Called Taskbar rather than Features or Shortcuts. It is the name of the thing on screen, which is
 * what a person looking for this setting will be looking at, and it is the name Windows uses for
 * the same screen — while Features is a word for anything at all and Shortcuts already means a key
 * combination to most people.
 */
export const UMBRADESKTOP_TASKBAR_CATEGORY: UmbraDesktopSettingsCategory = {
  id: 'taskbar',
  labelKey: 'umbraDesktop_groupTaskbar',
  descriptionKey: 'umbraDesktop_groupTaskbarAbout',
  // `icon-panel-show`, whose name is nothing to do with what it draws: it is Lucide's
  // `panel-bottom-open`, a screen with a bar along its bottom edge, which is a taskbar. Picked by
  // the glyph rather than the alias, as `catalogue/ai.ts` picks its chat icon, and for the same
  // reason — the name is the one thing about an icon you cannot check by looking.
  //
  // This row shipped with no icon at all for a day because it was `icon-window-sidebar`, which
  // sounds exactly right and is not in Umbraco's set. **An alias that does not exist renders as
  // blank space, with no error anywhere**, and no test catches it either: the icon dictionary is
  // not reachable through the package's `exports`, so there is nothing to assert a name against.
  // The only check is opening the panel and looking at the row.
  icon: 'icon-panel-show',
  tag: 'umbradesktop-settings-taskbar',
};
