import { expect } from '@open-wc/testing';
import { cardsOf, dragOnto, mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants.js';
import { UMBRADESKTOP_DRAG_GHOST_OFFSET_PX } from '../launcher/tile-drag.controller.js';

/** Dragging in normal mode: move, pin and remove, and nothing else (design §3.1, D6). */

/*
 * Presence is asserted as a count, never as an element compared with null: a failing assertion whose
 * actual value is an element inside the launcher hangs web-test-runner while it serialises the
 * element, and the run then dies at its 120s limit with no message at all.
 */

/** Well above Mocha's 5s default: mounting a launcher is slow when a full run shares one browser. */
const TIMEOUT_MS = 20_000;
/** Two catalogue groups, so a tile can be dragged from one group into another. */
const GROUPS = [
  { alias: 'editing', label: 'Editing', weight: 10 },
  { alias: 'diagnostics', label: 'Diagnostics', weight: 40 },
];
/** Two apps in Editing and one in Diagnostics: a tile to drop beside, and one to move across. */
const APPS = [stubApp('content', 'editing', 10), stubApp('media', 'editing', 20), stubApp('logs', 'diagnostics', 10)];

/** The mount under test, removed after each test so the next one starts from an empty page. */
let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
});

/**
 * A tile in the mounted launcher.
 * @param m The mount.
 * @param alias The app's alias.
 * @returns The tile.
 */
const tile = (m: UmbraDesktopLauncherMount, alias: string) => m.root.querySelector<HTMLElement>(`.tile[data-alias="${alias}"]`)!;

it('moves a tile onto a tile in another group', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  await dragOnto(mount, tile(mount, 'content'), () => tile(mount!, 'logs'));
  expect(cardsOf(mount.root)).to.deep.equal([
    ['editing', ['media']],
    ['diagnostics', ['content', 'logs']],
  ]);
});

it('shows Pinned as a target during a drag, even with nothing pinned, and pins on drop', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  expect(mount.root.querySelectorAll(`[data-group="${UMBRADESKTOP_PINNED_GROUP_ID}"]`).length).to.equal(0);
  await dragOnto(mount, tile(mount, 'logs'), () => mount!.root.querySelector(`[data-group="${UMBRADESKTOP_PINNED_GROUP_ID}"]`));
  expect(mount.writes[mount.writes.length - 1]?.pinned).to.deep.equal(['logs']);
  expect(cardsOf(mount.root)[0]).to.deep.equal([UMBRADESKTOP_PINNED_GROUP_ID, ['logs']]);
});

it('replaces the footer with the remove pane during a drag, and removes on drop', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  await dragOnto(mount, tile(mount, 'media'), () => mount!.root.querySelector('.removepane'));
  expect(mount.writes[mount.writes.length - 1]?.layout?.removed).to.deep.equal(['media']);
  expect(mount.root.querySelectorAll('.removepane').length).to.equal(0);
  expect(mount.root.querySelectorAll('.footer').length).to.equal(1);
});

it('does not launch the dragged app, and tiles still launch after a drag', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  await dragOnto(mount, tile(mount, 'content'), () => tile(mount!, 'logs'));
  expect(mount.launched).to.deep.equal([]);
  // A later click is a new one: the controller swallows only the click the release produces.
  tile(mount, 'content').querySelector<HTMLElement>('.launch')!.click();
  expect(mount.launched.map((a) => a.alias)).to.deep.equal(['content']);
});

it('has no pin control on a tile any more', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  expect(mount.root.querySelectorAll('.pin').length).to.equal(0);
});

it('stores nothing for a drop that changes nothing, such as a tile dropped just after itself', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  // Content already sits right before Media, so landing on Media's leading half puts it back where it was.
  await dragOnto(mount, tile(mount, 'content'), () => tile(mount!, 'media'));
  expect(cardsOf(mount.root)[0]).to.deep.equal(['editing', ['content', 'media']]);
  expect(mount.writes.length).to.equal(0);
});

it('moves nothing under the pointer when a drag starts: the Pinned target and the remove pane take no room', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  // An empty Pinned drawn in the flow pushed every group down under the pointer, and a remove pane
  // taller than the footer grew the panel, so the tile being pressed jumped away from the press.
  const firstCard = () => mount!.root.querySelector<HTMLElement>('.cards .card')!.getBoundingClientRect();
  const source = tile(mount, 'media');
  const cardBefore = firstCard();
  const tileBefore = source.getBoundingClientRect();
  const panelBefore = mount.launcher.getBoundingClientRect();
  const x = tileBefore.left + tileBefore.width / 2;
  const y = tileBefore.top + tileBefore.height / 2;
  const at = (type: string, px: number, py: number, on: EventTarget) =>
    on.dispatchEvent(new PointerEvent(type, { clientX: px, clientY: py, pointerId: 13, pointerType: 'mouse', button: 0, bubbles: true, composed: true }));
  at('pointerdown', x, y, source);
  at('pointermove', x + 10, y, window);
  await mount.settle();
  try {
    expect(mount.root.querySelectorAll(`[data-group="${UMBRADESKTOP_PINNED_GROUP_ID}"]`).length, 'Pinned is a target').to.equal(1);
    expect(mount.root.querySelectorAll('.removepane').length, 'the remove pane is shown').to.equal(1);
    expect(firstCard().top, 'the first group stays put').to.be.closeTo(cardBefore.top, 1);
    expect(source.getBoundingClientRect().top, 'the pressed tile stays put').to.be.closeTo(tileBefore.top, 1);
    expect(source.getBoundingClientRect().left, 'the pressed tile stays put').to.be.closeTo(tileBefore.left, 1);
    expect(mount.launcher.getBoundingClientRect().height, 'the panel keeps its height').to.be.closeTo(panelBefore.height, 1);
    // An empty Pinned says what it is for: nothing in it would, and a bare heading reads as a label.
    const hints = mount.root.querySelectorAll<HTMLElement>(`[data-group="${UMBRADESKTOP_PINNED_GROUP_ID}"] .hint`);
    expect(hints.length, 'the empty Pinned target carries a hint').to.equal(1);
    expect(hints[0].textContent?.trim()).to.equal('umbraDesktop_pinnedDropHint');
  } finally {
    at('pointerup', 0, 0, window);
    await mount.settle();
  }
});

it('keeps the ghost under the pointer when a theme blurs the panel behind it', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  // A backdrop filter makes the launcher the containing block for its fixed descendants, and its
  // overflow clips them, so a fixed ghost would land offset by the panel's position or not at all.
  // Moving the panel away from the corner is what makes the offset show.
  mount.launcher.style.setProperty('--umbradesktop-launcher-backdrop', 'blur(10px)');
  mount.launcher.style.marginLeft = '200px';
  mount.launcher.style.marginTop = '100px';
  await mount.settle();
  const source = tile(mount, 'content');
  const from = source.getBoundingClientRect();
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  const at = (type: string, px: number, py: number, on: EventTarget) =>
    on.dispatchEvent(new PointerEvent(type, { clientX: px, clientY: py, pointerId: 12, pointerType: 'mouse', button: 0, bubbles: true, composed: true }));
  at('pointerdown', x, y, source);
  at('pointermove', x + 30, y + 20, window);
  await mount.settle();
  const ghosts = mount.root.querySelectorAll<HTMLElement>('.drag-ghost');
  expect(ghosts.length).to.equal(1);
  const box = ghosts[0].getBoundingClientRect();
  // Beside the pointer rather than under it, so the landing bar at the pointer stays in sight.
  expect(box.left - (x + 30), 'horizontal gap from the pointer').to.be.within(0, UMBRADESKTOP_DRAG_GHOST_OFFSET_PX + 1);
  expect(box.top - (y + 20), 'vertical gap from the pointer').to.be.within(0, UMBRADESKTOP_DRAG_GHOST_OFFSET_PX + 1);
  at('pointerup', 0, 0, window);
  await mount.settle();
});

it('drags only the icon, so the tile it is dropped beside stays in sight', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  const source = tile(mount, 'content');
  const from = source.getBoundingClientRect();
  const at = (type: string, px: number, py: number, on: EventTarget) =>
    on.dispatchEvent(new PointerEvent(type, { clientX: px, clientY: py, pointerId: 13, pointerType: 'mouse', button: 0, bubbles: true, composed: true }));
  at('pointerdown', from.left + 10, from.top + 10, source);
  at('pointermove', from.left + 30, from.top + 10, window);
  await mount.settle();
  try {
    const ghost = mount.root.querySelectorAll<HTMLElement>('.drag-ghost');
    expect(ghost.length).to.equal(1);
    expect(ghost[0].localName).to.equal('umb-icon');
    expect(ghost[0].getAttribute('name')).to.equal('icon-box');
    expect(getComputedStyle(ghost[0]).backgroundColor, 'no card behind the icon').to.equal('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(source).cursor, 'the tile it came from shows the move cursor').to.equal('move');
  } finally {
    at('pointerup', 0, 0, window);
    await mount.settle();
  }
});
