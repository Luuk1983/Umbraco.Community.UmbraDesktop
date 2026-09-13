import type { UmbraDesktopSettingsCategory } from '../types';
import './appearance.element.js';

/** How the desktop looks: the theme and the wallpaper. */
export const UMBRADESKTOP_APPEARANCE_CATEGORY: UmbraDesktopSettingsCategory = {
  id: 'appearance',
  labelKey: 'umbraDesktop_groupAppearance',
  descriptionKey: 'umbraDesktop_groupAppearanceAbout',
  icon: 'icon-brush',
  tag: 'umbradesktop-settings-appearance',
};
