import { expect } from '@open-wc/testing';
import { cardsOf, headingsOf, mountLauncher, stubApp } from './launcher.test-helper.js';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import type { UmbraDesktopGroup } from '../types.js';

/**
 * The launcher draws `resolveLauncher`'s view: the catalogue's grouping by default, the user's
 * changes when there are some, and each app in one place only.
 */

/** Well above Mocha's 5s default: mounting a launcher is slow when a full run shares one browser. */
const TIMEOUT_MS = 20_000;
/** Two catalogue groups, so the launcher draws two cards by default. */
const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: 'Editing', weight: 10 },
  { alias: 'diagnostics', label: 'Diagnostics', weight: 40 },
];
/** Two apps in Editing and one in Diagnostics. */
const APPS = [stubApp('content', 'editing', 10), stubApp('media', 'editing', 20), stubApp('logs', 'diagnostics', 10)];

/** The mount under test, removed after each test so the next one starts from an empty page. */
let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
});

it("draws the catalogue's grouping when nothing is arranged", async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  expect(cardsOf(mount.root)).to.deep.equal([
    ['editing', ['content', 'media']],
    ['diagnostics', ['logs']],
  ]);
});

it('draws a pinned app in Pinned only, not also in its group', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, pinned: ['logs'] });
  expect(cardsOf(mount.root)).to.deep.equal([
    [UMBRADESKTOP_PINNED_GROUP_ID, ['logs']],
    ['editing', ['content', 'media']],
  ]);
});

it("draws the user's groups in their order, with their own names shown as typed", async function () {
  this.timeout(TIMEOUT_MS);
  const layout = {
    groups: [
      { id: 'custom-1', label: 'Daily', apps: ['logs'] },
      { id: 'editing', label: null, apps: ['media', 'content'] },
    ],
    removed: [],
    deletedGroups: ['diagnostics'],
  };
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, layout });
  expect(cardsOf(mount.root)).to.deep.equal([
    ['custom-1', ['logs']],
    ['editing', ['media', 'content']],
  ]);
  expect(headingsOf(mount.root)).to.deep.equal(['Daily', 'Editing']);
});

it('draws no card for a group with nothing in it, while a group with apps still gets one', async function () {
  this.timeout(TIMEOUT_MS);
  const layout = {
    groups: [
      { id: 'custom-1', label: 'Empty', apps: [] },
      { id: 'editing', label: null, apps: ['content'] },
    ],
    removed: ['media', 'logs'],
    deletedGroups: ['diagnostics'],
  };
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, layout });
  const ids = cardsOf(mount.root).map(([id]) => id);
  expect(ids, 'a group that still has an app in it must keep its card').to.include('editing');
  expect(ids, 'an empty group draws no card').to.not.include('custom-1');
});

it('launches an app when its tile is clicked', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  mount.root.querySelector<HTMLElement>('.tile[data-alias="media"] .launch')!.click();
  expect(mount.launched.map((a) => a.alias)).to.deep.equal(['media']);
});

it("gives All apps the grid of dots and Arrange the layout blocks, not the group handle's grip", async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  const icon = (selector: string) => mount!.root.querySelector(`${selector} umb-icon`)?.getAttribute('name');
  expect(icon('.hdr .ctl.all-apps')).to.equal('icon-thumbnails-small');
  // The grip is what a group's drag handle shows in arrange mode, so on the button it read as a handle.
  expect(icon('.hdr .ctl.arrange')).to.equal('icon-layout-masonry');
});
