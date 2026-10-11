import { expect } from '@open-wc/testing';
import { mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import { dragScroller } from '../launcher/drag-scroller.js';
import { UMBRADESKTOP_UMBRACO4_THEME } from '../theme/themes/umbraco4/index.js';

/**
 * Which element a drag scrolls near its edges, under the base look and under a theme that moves the
 * scrolling inward. Umbraco 4 keeps Favourites fixed at the top of the launcher and scrolls only the
 * tree below it, so its body never scrolls at all; a drag that kept scrolling the body there would
 * leave every group below the fold out of reach.
 *
 * Asserted through the resolution rather than by dragging to an edge and watching the scroll
 * position: the edge scroll runs on animation frames, which a background test page may not get.
 *
 * Asserted by class, never by comparing an element with null: a failing assertion whose actual value
 * is an element inside the launcher hangs web-test-runner while it serialises it.
 */

/** Mounting under a theme imports that theme's sheets, which is slow in a busy run. */
const TIMEOUT_MS = 20_000;

/** One group, enough for the launcher to draw its cards rather than its empty state. */
const GROUPS = [{ alias: 'editing', label: 'Editing', weight: 10 }];

/** Apps to draw in it. */
const APPS = [stubApp('content', 'editing', 10), stubApp('media', 'editing', 20)];

let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
});

/**
 * The classes of whatever the resolution returns, or an empty string for nothing.
 * @param element The resolved scroller.
 * @returns Its class attribute.
 */
function classOf(element: HTMLElement | null): string {
  return element?.className ?? '';
}

it('scrolls the body in the launcher and the layout pane in arrange mode under the base look', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  expect(classOf(dragScroller(mount.root, 'launcher'))).to.equal('body');

  (mount.root.querySelector('.ctl.arrange') as HTMLElement).click();
  await mount.settle();
  expect(classOf(dragScroller(mount.root, 'arrange'))).to.contain('layout-pane');
});

it('scrolls the tree under Umbraco 4, whose body does not scroll', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, theme: UMBRADESKTOP_UMBRACO4_THEME });
  expect(getComputedStyle(mount.root.querySelector('.body')!).overflowY, 'the premise: the body does not scroll here').to.equal('hidden');
  expect(classOf(dragScroller(mount.root, 'launcher'))).to.equal('cards');
});

it('scrolls the layout pane in arrange mode under Umbraco 4, which scrolls the pane there', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, theme: UMBRADESKTOP_UMBRACO4_THEME });
  (mount.root.querySelector('.ctl.arrange') as HTMLElement).click();
  await mount.settle();
  expect(classOf(dragScroller(mount.root, 'arrange'))).to.contain('layout-pane');
});
