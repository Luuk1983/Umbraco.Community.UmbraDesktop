import { expect } from '@open-wc/testing';
import { mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';

/** All apps: every app, alphabetical, filterable, and a way back (design §3.2). */

/** Well above Mocha's 5s default: mounting a launcher is slow when a full run shares one browser. */
const TIMEOUT_MS = 20_000;
/** Three apps named out of order, so the drawer's sorting has something to do. */
const APPS = [stubApp('Media', 'editing'), stubApp('Content', 'editing'), stubApp('Logs', 'diagnostics')];
/** The groups those apps belong to, which the drawer ignores: it lists by name alone. */
const GROUPS = [
  { alias: 'editing', label: 'Editing', weight: 10 },
  { alias: 'diagnostics', label: 'Diagnostics', weight: 40 },
];

/** The mount under test, removed after each test so the next one starts from an empty page. */
let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
});

/**
 * Mount a launcher with one app pinned and open All apps.
 * @returns The mount, showing the drawer.
 */
async function openDrawer(): Promise<UmbraDesktopLauncherMount> {
  const m = await mountLauncher({ apps: APPS, groups: GROUPS, pinned: ['Logs'] });
  m.root.querySelector<HTMLElement>('.ctl.all-apps')!.click();
  await m.settle();
  return m;
}

/**
 * The drawer's rows as `[letter, aliases]` per section.
 * @param root The launcher's shadow root.
 * @returns The sections.
 */
const sections = (root: ShadowRoot) =>
  [...root.querySelectorAll<HTMLElement>('.letter')].map((section) => [
    section.querySelector('.lh')!.textContent!.trim(),
    [...section.querySelectorAll<HTMLElement>('.row')].map((row) => row.dataset.alias),
  ]);

it('lists every app alphabetically under letters, pinned ones included', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  expect(sections(mount.root)).to.deep.equal([
    ['C', ['Content']],
    ['L', ['Logs']],
    ['M', ['Media']],
  ]);
});

it('narrows the list as the filter is typed into', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  const filter = mount.root.querySelector<HTMLInputElement>('.drawer-filter')!;
  filter.value = 'med';
  filter.dispatchEvent(new Event('input'));
  await mount.settle();
  expect(sections(mount.root)).to.deep.equal([['M', ['Media']]]);
});

it('launches from a row', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  mount.root.querySelector<HTMLElement>('.row[data-alias="Media"]')!.click();
  expect(mount.launched.map((a) => a.alias)).to.deep.equal(['Media']);
});

it('goes back to the launcher', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  mount.root.querySelector<HTMLElement>('.ctl.back')!.click();
  await mount.settle();
  expect(mount.root.querySelector('.drawer')).to.equal(null);
  expect(mount.root.querySelector('.cards')).to.not.equal(null);
});

it('returns focus to All apps after going back, since Back itself just left the DOM', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  mount.root.querySelector<HTMLElement>('.ctl.back')!.click();
  await mount.settle();
  expect(mount.root.activeElement?.classList.contains('all-apps')).to.equal(true);
});

it('focuses the filter when it opens', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  expect(mount.root.activeElement?.classList.contains('drawer-filter')).to.equal(true);
});

/**
 * Press Escape in an element and report whether the key got as far as the document, which is where
 * the taskbar listens for it to close the whole launcher.
 * @param element Where the key is pressed.
 * @returns True when the Escape reached the document.
 */
function escapeReachesDocument(element: HTMLElement): boolean {
  let reached = false;
  const listener = () => (reached = true);
  document.addEventListener('keydown', listener);
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
  document.removeEventListener('keydown', listener);
  return reached;
}

it('clears the filter on Escape without closing the launcher, and lets Escape through once empty', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  const filter = mount.root.querySelector<HTMLInputElement>('.drawer-filter')!;
  filter.value = 'med';
  filter.dispatchEvent(new Event('input'));
  await mount.settle();
  expect(escapeReachesDocument(filter), 'Escape with text is spent on clearing it').to.equal(false);
  await mount.settle();
  expect(mount.root.querySelector<HTMLInputElement>('.drawer-filter')!.value).to.equal('');
  expect(sections(mount.root).length, 'the whole list is back').to.equal(3);
  expect(escapeReachesDocument(mount.root.querySelector<HTMLInputElement>('.drawer-filter')!), 'Escape on an empty filter closes the launcher as before').to.equal(true);
});
