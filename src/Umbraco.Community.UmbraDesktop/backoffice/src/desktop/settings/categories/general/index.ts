import type { UmbraDesktopSettingsCategory } from '../types';
import './general.element.js';

/**
 * Everything that is not about how the desktop looks. The startup setting today.
 *
 * Called General rather than System or Startup: Startup describes the only setting here and would
 * be wrong the moment a second one arrives, and System means machine-level things this package will
 * never own — `groupSystem` already means something else in the launcher's catalogue.
 */
export const UMBRADESKTOP_GENERAL_CATEGORY: UmbraDesktopSettingsCategory = {
  id: 'general',
  labelKey: 'umbraDesktop_groupGeneral',
  descriptionKey: 'umbraDesktop_groupGeneralAbout',
  icon: 'icon-settings',
  tag: 'umbradesktop-settings-general',
};
