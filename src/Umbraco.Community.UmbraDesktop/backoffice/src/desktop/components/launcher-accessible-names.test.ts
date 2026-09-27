import { expect } from '@open-wc/testing';
import { mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import { UMBRADESKTOP_THEMES } from '../theme/themes/index.js';

/**
 * Arrange mode's icon buttons say what they act on. A screen reader moving through a group hears
 * each button's accessible name without the tile around it, so "Remove" alone does not say which
 * app; the name is a short phrase with the app or group in it, and the longer hint that explains
 * what happens next stays on the tooltip.
 *
 * Mounted under a theme only because that is what registers the English terms: the unthemed mounts
 * render raw term keys, which carry no name to find.
 */

/** Well above Mocha's 5s default: mounting a launcher is slow when a full run shares one browser. */
const TIMEOUT_MS = 20_000;

/** One catalogue group, whose handle and delete button name it. */
const GROUPS = [{ alias: 'editing', label: 'Editing', weight: 10 }];

/** Two apps: one to keep on the launcher, one to take off so the palette has a + to name. */
const APPS = [stubApp('content', 'editing', 10), stubApp('profiling', 'editing', 20)];

/** The mount under test, removed after each test. */
let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
  window.scrollTo(0, 0);
});

/**
 * The accessible name and the tooltip of a control in the launcher.
 * @param m The mount.
 * @param selector A selector for the control.
 * @returns `[aria-label, title]`.
 */
const namesOf = (m: UmbraDesktopLauncherMount, selector: string) => {
  const element = m.root.querySelector<HTMLElement>(selector)!;
  return [element.getAttribute('aria-label'), element.getAttribute('title')];
};

it('names the app or group each arrange button acts on, and keeps the hint as its tooltip', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({
    apps: APPS,
    groups: GROUPS,
    layout: { groups: [{ id: 'editing', label: null, apps: ['content'] }], removed: ['profiling'], deletedGroups: [] },
    theme: UMBRADESKTOP_THEMES[0],
  });
  mount.root.querySelector<HTMLElement>('.ctl.arrange')!.click();
  await mount.settle();

  expect(namesOf(mount, '.tile.arr[data-alias="content"] .rm')).to.deep.equal(['Remove content from launcher', 'Remove from launcher']);
  expect(namesOf(mount, '.tile.arr[data-alias="content"] .mv')).to.deep.equal(['Move content to', 'Move to']);
  expect(namesOf(mount, '.handle[data-handle="editing"]')).to.deep.equal(['Move group Editing', 'Move group. Drag it, or use the arrow keys']);
  expect(namesOf(mount, '.agroup[data-group="editing"] .gdel')).to.deep.equal([
    'Delete group Editing',
    'Delete group. Its apps wait under Not on your launcher',
  ]);
  expect(namesOf(mount, '.prow[data-alias="profiling"] .add')).to.deep.equal(['Add profiling to launcher', 'Add to launcher']);
});
