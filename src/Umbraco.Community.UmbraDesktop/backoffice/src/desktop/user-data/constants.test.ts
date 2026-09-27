import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_SETTINGS_IDENTIFIER, UMBRADESKTOP_USER_DATA_GROUP } from './constants';

/**
 * The address every row this package stores lives at.
 *
 * Pinned to literals on purpose, which is the opposite of what a test usually wants. These are not
 * values with behaviour, they are an address: half of it is duplicated in C# — see
 * `UserData/DesktopUserData.cs`, which pins the same string in its own test — because a C# constant
 * cannot be read from TypeScript and nothing can make the two share one.
 *
 * Without this, renaming the constant on this side, the side that actually writes the rows, passed
 * every test in the repository while silently stranding every user's settings in a group nothing
 * reads and stopping the C# cleanup from matching them.
 */

it('writes to the group the C# side cleans up', () => {
  expect(UMBRADESKTOP_USER_DATA_GROUP).to.equal('Umbraco.Community.UmbraDesktop');
});

it('keeps the settings identifier stable', () => {
  // Also an address. A change here strands the settings of everybody who already migrated, and the
  // migration would then run a second time and move a stale browser copy up over them.
  expect(UMBRADESKTOP_SETTINGS_IDENTIFIER).to.equal('settings');
});
