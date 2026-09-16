import type { UmbraDesktopSettingsCategory } from '../types';
import { UMBRADESKTOP_CONNECTIONS_CATEGORY_ID } from '../../../connections/constants';
import './connections.element.js';

/**
 * Where the Umbraco instances this desktop may read from are configured.
 *
 * Called Connections and not Environments deliberately. An environment in Umbraco means test,
 * acceptance and production of one solution, which is a different feature with its own issues and
 * its own rules about comparing things; these are unrelated instances, usually different clients,
 * with nothing in common to compare. Using the word here would have made both features harder to
 * talk about.
 *
 * Last in the list because it reaches further outside the desktop than anything else in settings:
 * every other category changes how this screen looks or behaves, and this one holds credentials for
 * somebody else's server.
 */
export const UMBRADESKTOP_CONNECTIONS_CATEGORY: UmbraDesktopSettingsCategory = {
  id: UMBRADESKTOP_CONNECTIONS_CATEGORY_ID,
  labelKey: 'umbraDesktop_groupConnections',
  descriptionKey: 'umbraDesktop_groupConnectionsAbout',
  // The same icon the Status app carries, so the screen that configures a thing and the app that
  // reports on it are recognisably about the same thing. Verified to exist: `icon-server` does not.
  icon: 'icon-connection',
  tag: 'umbradesktop-settings-connections',
};
