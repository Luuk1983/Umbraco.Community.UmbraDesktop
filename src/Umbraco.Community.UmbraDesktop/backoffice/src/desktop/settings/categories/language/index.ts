import type { UmbraDesktopSettingsCategory } from '../types';
import './language.element.js';

/**
 * The language the backoffice speaks, and how this desktop writes dates and times.
 *
 * Named the way macOS, Windows and GNOME all name the same pairing, because it is the same pairing:
 * which words, then which conventions, then the one override everybody reaches for.
 *
 * Not folded into General. The first row here changes the whole backoffice rather than this
 * desktop, and that is not a thing to file under a heading meaning "everything else" — it is the
 * only setting on this panel that reaches outside the desktop at all.
 */
export const UMBRADESKTOP_LANGUAGE_CATEGORY: UmbraDesktopSettingsCategory = {
  id: 'language',
  labelKey: 'umbraDesktop_groupLanguage',
  descriptionKey: 'umbraDesktop_groupLanguageAbout',
  icon: 'icon-globe',
  tag: 'umbradesktop-settings-language',
};
