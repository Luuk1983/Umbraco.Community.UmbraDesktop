import type { UmbraDesktopSettingsCategory } from '../types';
import './site.element.js';

/**
 * Settings that belong to the site rather than to the person reading them.
 *
 * The first category in this panel that is not a personal preference, which is why its description
 * says so out loud: everything beside it changes one desktop, and everything in it changes
 * everybody's. Its API is gated on Settings-section access, so most users could not change these
 * even if they found them — but the ones who can need telling that the control in front of them is
 * not theirs alone.
 */
export const UMBRADESKTOP_SITE_CATEGORY: UmbraDesktopSettingsCategory = {
  id: 'site',
  labelKey: 'umbraDesktop_groupSite',
  descriptionKey: 'umbraDesktop_groupSiteAbout',
  icon: 'icon-globe',
  tag: 'umbradesktop-settings-site',
};
