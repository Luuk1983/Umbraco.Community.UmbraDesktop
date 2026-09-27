import { expect } from '@open-wc/testing';
import { dragOnto, mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import { UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH, UMBRADESKTOP_LAUNCHER_SPLIT_MIN } from '../launcher/geometry.js';

/**
 * Arrange mode (design §3.3): every drag has a button, groups are edited here, and tiles do not launch.
 *
 * Presence and absence are asserted as counts rather than `to.equal(null)` on an element: a failing
 * equality on an element makes the runner serialise it, and a launcher element takes long enough to
 * serialise that the run dies at its timeout with no message.
 */

/** Well above Mocha's 5s default: mounting a launcher is slow when a full run shares one browser. */
const TIMEOUT_MS = 20_000;

/** Two catalogue groups, so there is always another group to move to and a neighbour to focus. */
const GROUPS = [
  { alias: 'editing', label: 'Editing', weight: 10 },
  { alias: 'diagnostics', label: 'Diagnostics', weight: 40 },
];

/** Two apps per group: enough for a next and a previous tile, few enough to read the assertions. */
const APPS = [
  stubApp('content', 'editing', 10),
  stubApp('media', 'editing', 20),
  stubApp('logs', 'diagnostics', 10),
  stubApp('profiling', 'diagnostics', 20),
];

/**
 * A launcher width at which the whole panel, palette included, fits the test browser's 800px
 * viewport, which anything that hit-tests needs: `elementsFromPoint` sees nothing outside the
 * viewport. Still wide enough for the palette to sit beside the layout.
 */
const IN_VIEWPORT_WIDTH = 760;

/** The mount under test, removed after each test so the next one starts from an empty page. */
let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
  // Focusing a control past the test browser's 800px viewport scrolls the page to it, and the
  // scroll outlives the mount: the next test's pointer coordinates would then miss everything.
  window.scrollTo(0, 0);
});

/**
 * Mount a launcher and enter arrange mode.
 * @param options Anything to pass to the mount.
 * @returns The mount, arranging.
 */
async function arranging(options: Partial<Parameters<typeof mountLauncher>[0]> = {}): Promise<UmbraDesktopLauncherMount> {
  const m = await mountLauncher({ apps: APPS, groups: GROUPS, launcherWidth: UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH, ...options });
  m.root.querySelector<HTMLElement>('.ctl.arrange')!.click();
  await m.settle();
  return m;
}

/**
 * An element in the launcher.
 * @param m The mount.
 * @param selector A selector.
 * @returns The element.
 */
const $ = (m: UmbraDesktopLauncherMount, selector: string) => m.root.querySelector<HTMLElement>(selector)!;

/**
 * How many elements in the launcher match a selector, for presence and absence checks.
 * @param m The mount.
 * @param selector A selector.
 * @returns The count.
 */
const count = (m: UmbraDesktopLauncherMount, selector: string) => m.root.querySelectorAll(selector).length;

/**
 * An arrange tile.
 * @param m The mount.
 * @param groupId The group it is in.
 * @param alias The app.
 * @returns The tile.
 */
const arrTile = (m: UmbraDesktopLauncherMount, groupId: string, alias: string) =>
  $(m, `.tile.arr[data-group="${groupId}"][data-alias="${alias}"]`);

/**
 * The aliases each arrange group shows, empty groups included. Pinned is drawn above `.cards` and so
 * is not in this list.
 * @param m The mount.
 * @returns `[group id, aliases]` pairs.
 */
const arranged = (m: UmbraDesktopLauncherMount) =>
  [...m.root.querySelectorAll<HTMLElement>('.layout-pane .cards .agroup[data-group]')].map((card) => [
    card.dataset.group,
    [...card.querySelectorAll<HTMLElement>('.tile.arr')].map((t) => t.dataset.alias),
  ]);

/**
 * The class list of whatever has focus in the launcher, as a string, so a failing check prints
 * something short.
 * @param m The mount.
 * @returns The focused element's classes, or an empty string.
 */
const focusedClass = (m: UmbraDesktopLauncherMount) => (m.root.activeElement as HTMLElement | null)?.className ?? '';

/**
 * Move focus to an element, and make sure the launcher hears it leave where it was. A page the
 * runner has in a background tab moves focus without firing focus events, so when the browser sends
 * no `focusout` this sends the one it would have.
 * @param m The mount.
 * @param to The element to focus.
 */
function moveFocus(m: UmbraDesktopLauncherMount, to: HTMLElement): void {
  const from = m.root.activeElement as HTMLElement | null;
  let fired = false;
  const listener = () => (fired = true);
  from?.addEventListener('focusout', listener);
  to.focus({ preventScroll: true });
  from?.removeEventListener('focusout', listener);
  if (from && !fired) from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true, relatedTarget: to }));
}

/**
 * Press Escape on an element and report whether the key got as far as the document, which is where
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

it('shows the banner, and tiles do not launch', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  expect(count(mount, '.banner')).to.equal(1);
  arrTile(mount, 'editing', 'content').click();
  expect(mount.launched).to.deep.equal([]);
});

it('puts focus on Done when arrange mode opens, since the Arrange button it came from is gone', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  expect(focusedClass(mount)).to.contain('done');
});

it('removes an app with its − button, and adds it back from the palette with +', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="profiling"] .rm').click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout?.removed).to.deep.equal(['profiling']);
  $(mount, '.prow[data-alias="profiling"] .add').click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout?.removed).to.deep.equal([]);
  expect(arranged(mount)).to.deep.equal([
    ['editing', ['content', 'media']],
    ['diagnostics', ['logs', 'profiling']],
  ]);
});

it('deletes a group without asking, and brings it back whole with Add group', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.agroup[data-group="diagnostics"] .gdel').click();
  await mount.settle();
  expect(arranged(mount).map(([id]) => id)).to.deep.equal(['editing']);
  $(mount, '.addall[data-addall="diagnostics"]').click();
  await mount.settle();
  expect(arranged(mount)).to.deep.equal([
    ['editing', ['content', 'media']],
    ['diagnostics', ['logs', 'profiling']],
  ]);
});

it('pins through Move to', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="logs"] .mv').click();
  await mount.settle();
  [...mount.root.querySelectorAll<HTMLElement>('.movemenu .mmi')][0].click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.pinned).to.deep.equal(['logs']);
  expect(count(mount, '.movemenu')).to.equal(0);
});

it('moves an app into a new group through Move to, and focuses the new name', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="logs"] .mv').click();
  await mount.settle();
  $(mount, '.movemenu .mmi.new').click();
  await mount.settle();
  await mount.settle();
  const groups = mount.writes[mount.writes.length - 1].layout!.groups;
  const created = groups[groups.length - 1];
  expect(created.id.startsWith('custom-')).to.equal(true);
  expect(created.apps).to.deep.equal(['logs']);
  expect((mount.root.activeElement as HTMLInputElement | null)?.dataset.rename).to.equal(created.id);
});

it('closes Move to on Escape and keeps the Escape from closing the launcher', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="logs"] .mv').click();
  await mount.settle();
  let reachedDocument = false;
  const listener = () => (reachedDocument = true);
  document.addEventListener('keydown', listener);
  $(mount, '.movemenu .mmi').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  document.removeEventListener('keydown', listener);
  await mount.settle();
  expect(count(mount, '.movemenu')).to.equal(0);
  expect(reachedDocument).to.equal(false);
  expect(focusedClass(mount)).to.contain('mv');
});

it('closes Move to when focus leaves it, and leaves focus where it went', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="logs"] .mv').click();
  await mount.settle();
  expect(focusedClass(mount), 'Move to opens with focus on its first item').to.contain('mmi');
  // Shift+Tab from the first item lands on the ⋯ button that opened it: still the menu's own.
  moveFocus(mount, $(mount, '.tile.arr[data-alias="logs"] .mv'));
  await mount.settle();
  expect(count(mount, '.movemenu'), 'focus on its own ⋯ button keeps it open').to.equal(1);
  moveFocus(mount, $(mount, '.ctl.done'));
  await mount.settle();
  expect(count(mount, '.movemenu')).to.equal(0);
  expect(focusedClass(mount)).to.contain('done');
});

it('renames a group, and clearing a catalogue group gives its name back', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  const input = $(mount, '.rename[data-rename="editing"]') as HTMLInputElement;
  input.value = 'Writing';
  input.dispatchEvent(new Event('change'));
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout?.groups.find((g) => g.id === 'editing')?.label).to.equal('Writing');
  const again = $(mount, '.rename[data-rename="editing"]') as HTMLInputElement;
  again.value = '';
  again.dispatchEvent(new Event('change'));
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout?.groups.find((g) => g.id === 'editing')?.label).to.equal(null);
});

it('moves a focused tile with the arrow keys and keeps focus on it', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  const tile = arrTile(mount, 'editing', 'media');
  tile.focus();
  tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }));
  await mount.settle();
  await mount.settle();
  expect(arranged(mount)[0]).to.deep.equal(['editing', ['media', 'content']]);
  expect((mount.root.activeElement as HTMLElement | null)?.dataset.alias).to.equal('media');
});

it('moves a group with the arrow keys on its handle', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.handle[data-handle="diagnostics"]').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }),
  );
  await mount.settle();
  expect(arranged(mount).map(([id]) => id)).to.deep.equal(['diagnostics', 'editing']);
});

it('asks before Reset, and Reset keeps the pins', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging({ pinned: ['logs'] });
  $(mount, '.tile.arr[data-alias="profiling"] .rm').click();
  await mount.settle();
  $(mount, '.ctl.reset').click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout).to.not.equal(undefined);
  $(mount, '.ctl.reset-yes').click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]).to.deep.equal({ pinned: ['logs'], layout: undefined });
});

it('goes back to normal mode on Done, with focus on Arrange', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.ctl.done').click();
  await mount.settle();
  expect(count(mount, '.banner')).to.equal(0);
  expect(count(mount, '.hdr .ctl.arrange')).to.equal(1);
  expect(focusedClass(mount)).to.contain('arrange');
});

it('adds by dragging a palette row into a group, and removes by dragging a tile onto the palette', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging({ launcherWidth: IN_VIEWPORT_WIDTH });
  await dragOnto(mount, arrTile(mount, 'diagnostics', 'profiling'), () => mount!.root.querySelector('.palette'));
  expect(mount.writes[mount.writes.length - 1]?.layout?.removed).to.deep.equal(['profiling']);
  await dragOnto(mount, $(mount, '.prow[data-alias="profiling"]'), () => arrTile(mount!, 'editing', 'content'));
  expect(arranged(mount)[0]).to.deep.equal(['editing', ['profiling', 'content', 'media']]);
});

it('reorders groups by dragging a handle', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  await dragOnto(mount, $(mount, '.handle[data-handle="diagnostics"]'), () => $(mount!, '.agroup[data-group="editing"] .gh'));
  expect(arranged(mount).map(([id]) => id)).to.deep.equal(['diagnostics', 'editing']);
});

describe('the container query (design D12)', () => {
  /**
   * Whether an element is drawn at all.
   * @param element The element.
   * @returns True unless it or an ancestor is `display: none`.
   */
  const drawn = (element: HTMLElement | null) => !!element && element.getClientRects().length > 0;

  /**
   * Enter arrange mode with the arrange area exactly this wide. Measured and corrected rather than
   * computed, because whether the launcher's border and padding come out of its width token depends
   * on the theme's box-sizing, and the container query only sees the arrange area.
   * @param width The arrange area's width in px.
   * @returns The mount.
   */
  async function arrangeAt(width: number): Promise<UmbraDesktopLauncherMount> {
    const m = await arranging({ launcherWidth: width });
    const actual = m.root.querySelector<HTMLElement>('.arrange-mode')!.getBoundingClientRect().width;
    if (actual !== width) {
      m.launcher.style.setProperty('--umbradesktop-launcher-width', `${2 * width - actual}px`);
      await m.settle();
    }
    return m;
  }

  it('puts the palette beside the layout when one card column fits beside it', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arrangeAt(UMBRADESKTOP_LAUNCHER_SPLIT_MIN);
    expect(drawn(mount.root.querySelector('.palette'))).to.equal(true);
    expect(drawn(mount.root.querySelector('.layout-pane'))).to.equal(true);
    expect(drawn(mount.root.querySelector('.ctl.add-apps'))).to.equal(false);
  });

  it('makes the palette its own view behind Add apps one pixel narrower', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arrangeAt(UMBRADESKTOP_LAUNCHER_SPLIT_MIN - 1);
    expect(drawn(mount.root.querySelector('.palette'))).to.equal(false);
    $(mount, '.ctl.add-apps').click();
    await mount.settle();
    expect(drawn(mount.root.querySelector('.palette'))).to.equal(true);
    expect(drawn(mount.root.querySelector('.layout-pane'))).to.equal(false);
  });
});

it('offers Arrange and All apps from an empty launcher', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, layout: { groups: [], removed: APPS.map((a) => a.alias), deletedGroups: [] } });
  expect(count(mount, '.empty .ctl.arrange')).to.equal(1);
  expect(count(mount, '.empty .ctl.all-apps')).to.equal(1);
  // A button beside a button, not a bar across the panel: arrange mode's container once shared the
  // Arrange button's class name and stretched it the full width of the empty state.
  expect(getComputedStyle($(mount, '.empty .ctl.arrange')).flexGrow).to.equal('0');
});

/**
 * The id of whatever has focus in the launcher, read from the data attribute that names it: a
 * tile's alias, a rename field's or a handle's group, or the palette row a + button sits in.
 * @param m The mount.
 * @returns What is focused, as `kind:id`, its classes when it has no id, or an empty string.
 */
function focused(m: UmbraDesktopLauncherMount): string {
  const element = m.root.activeElement as HTMLElement | null;
  if (!element) return '';
  const { alias, rename, handle } = element.dataset;
  if (rename) return `rename:${rename}`;
  if (handle) return `handle:${handle}`;
  if (element.classList.contains('add')) return `add:${element.closest<HTMLElement>('.prow')?.dataset.alias ?? ''}`;
  if (alias) return `tile:${alias}`;
  return `class:${element.className}`;
}

/**
 * A mouse pointer event with the id the drag helpers use.
 * @param type The event type.
 * @param x Its client x.
 * @param y Its client y.
 * @returns The event.
 */
function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 11, pointerType: 'mouse', button: 0, bubbles: true, composed: true });
}

/**
 * Press on an element and move past the drag threshold, leaving the drag under way so a test can
 * look at what it highlights before releasing.
 * @param m The mount, for its `settle`.
 * @param source The element to press on.
 */
async function startDrag(m: UmbraDesktopLauncherMount, source: Element): Promise<void> {
  const box = source.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  source.dispatchEvent(pointer('pointerdown', x, y));
  window.dispatchEvent(pointer('pointermove', x + 10, y));
  await m.settle();
}

describe('Move to stays inside the layout pane', () => {
  /** A third Editing app, so the first row of that card is full and has a tile at its right edge. */
  const THREE_IN_A_ROW = [...APPS, stubApp('settings', 'editing', 30)];

  /**
   * Open a tile's Move to list and measure it against the pane that clips it.
   * @param m The mount.
   * @param alias The tile's app.
   * @returns The list's box and the pane's.
   */
  async function openMenuOn(m: UmbraDesktopLauncherMount, alias: string): Promise<{ menu: DOMRect; pane: DOMRect }> {
    $(m, `.tile.arr[data-alias="${alias}"] .mv`).click();
    await m.settle();
    await m.settle();
    return { menu: $(m, '.movemenu').getBoundingClientRect(), pane: $(m, '.layout-pane').getBoundingClientRect() };
  }

  it('fits from the first tile of a row', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging({ apps: THREE_IN_A_ROW, launcherWidth: IN_VIEWPORT_WIDTH });
    const { menu, pane } = await openMenuOn(mount, 'content');
    expect(menu.left).to.be.at.least(pane.left);
    expect(menu.right).to.be.at.most(pane.right);
  });

  it('fits from the last tile of a row', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging({ apps: THREE_IN_A_ROW, launcherWidth: IN_VIEWPORT_WIDTH });
    const { menu, pane } = await openMenuOn(mount, 'settings');
    expect(menu.left).to.be.at.least(pane.left);
    expect(menu.right).to.be.at.most(pane.right);
  });
});

describe('focus after the pressed control leaves the page', () => {
  it('moves from a removed tile to the next one, and from the last one to the group name', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.tile.arr[data-alias="content"] .rm').click();
    await mount.settle();
    await mount.settle();
    expect(focused(mount)).to.equal('tile:media');
    $(mount, '.tile.arr[data-alias="media"] .rm').click();
    await mount.settle();
    await mount.settle();
    expect(focused(mount)).to.equal('rename:editing');
  });

  it('moves from a removed tile with nothing after it to the previous one', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.tile.arr[data-alias="media"] .rm').click();
    await mount.settle();
    await mount.settle();
    expect(focused(mount)).to.equal('tile:content');
  });

  it('treats Move to > Remove like the − button', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.tile.arr[data-alias="logs"] .mv').click();
    await mount.settle();
    $(mount, '.movemenu .mmi.rmv').click();
    await mount.settle();
    await mount.settle();
    expect(focused(mount)).to.equal('tile:profiling');
  });

  it('moves from a deleted group to the next handle, and from the last one to New group', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.agroup[data-group="editing"] .gdel').click();
    await mount.settle();
    await mount.settle();
    expect(focused(mount)).to.equal('handle:diagnostics');
    $(mount, '.agroup[data-group="diagnostics"] .gdel').click();
    await mount.settle();
    await mount.settle();
    expect(focusedClass(mount)).to.contain('newgroup');
  });

  it('moves from a deleted group with nothing after it to the previous handle', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.agroup[data-group="diagnostics"] .gdel').click();
    await mount.settle();
    await mount.settle();
    expect(focused(mount)).to.equal('handle:editing');
  });

  it('puts focus on Cancel when Reset asks, back on Reset on Cancel, and Cancel changes nothing', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.ctl.reset').click();
    await mount.settle();
    expect(focusedClass(mount)).to.contain('reset-no');
    expect(count(mount, '.banner[role="alertdialog"]')).to.equal(1);
    $(mount, '.ctl.reset-no').click();
    await mount.settle();
    expect(focusedClass(mount).split(' ')).to.include('reset');
    expect(count(mount, '.banner[role="alertdialog"]')).to.equal(0);
    expect(mount.writes.length).to.equal(0);
  });

  it('cancels the Reset confirm on Escape, back on Reset, without closing the launcher', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.ctl.reset').click();
    await mount.settle();
    const reachedDocument = escapeReachesDocument($(mount, '.ctl.reset-no'));
    await mount.settle();
    expect(reachedDocument).to.equal(false);
    expect(count(mount, '.banner[role="alertdialog"]')).to.equal(0);
    expect(focusedClass(mount).split(' ')).to.include('reset');
    expect(mount.writes.length).to.equal(0);
  });

  it('puts focus on Done once Reset is confirmed', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.ctl.reset').click();
    await mount.settle();
    $(mount, '.ctl.reset-yes').click();
    await mount.settle();
    expect(focusedClass(mount)).to.contain('done');
  });

  it('moves from an added palette row to the next row, and from the last one to the filter', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.tile.arr[data-alias="logs"] .rm').click();
    await mount.settle();
    $(mount, '.tile.arr[data-alias="profiling"] .rm').click();
    await mount.settle();
    $(mount, '.prow[data-alias="logs"] .add').click();
    await mount.settle();
    await mount.settle();
    expect(focused(mount)).to.equal('add:profiling');
    $(mount, '.prow[data-alias="profiling"] .add').click();
    await mount.settle();
    await mount.settle();
    expect(focusedClass(mount)).to.contain('palette-filter');
  });
});

describe('renaming', () => {
  it('keeps a typed name when the launcher closes before the field blurs', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    ($(mount, '.rename[data-rename="editing"]') as HTMLInputElement).value = 'Writing';
    mount.remove();
    expect(mount.writes[mount.writes.length - 1]?.layout?.groups.find((g) => g.id === 'editing')?.label).to.equal('Writing');
  });

  it('reverts on Escape and keeps the Escape from closing the launcher', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    const input = $(mount, '.rename[data-rename="editing"]') as HTMLInputElement;
    input.value = 'Writing';
    let reachedDocument = false;
    const listener = () => (reachedDocument = true);
    document.addEventListener('keydown', listener);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    document.removeEventListener('keydown', listener);
    expect(input.value).to.equal('Editing');
    expect(reachedDocument).to.equal(false);
    mount.remove();
    expect(mount.writes.length).to.equal(0);
  });

  it('stores a rename on Enter and keeps focus in the field, with its text selected', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    const input = $(mount, '.rename[data-rename="editing"]') as HTMLInputElement;
    input.focus({ preventScroll: true });
    input.value = 'Writing';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await mount.settle();
    await mount.settle();
    expect(mount.writes[mount.writes.length - 1]?.layout?.groups.find((g) => g.id === 'editing')?.label).to.equal('Writing');
    expect(focused(mount)).to.equal('rename:editing');
    const after = $(mount, '.rename[data-rename="editing"]') as HTMLInputElement;
    expect([after.selectionStart, after.selectionEnd]).to.deep.equal([0, 'Writing'.length]);
  });

  it('puts the name back when a catalogue group that was never renamed is cleared', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    const input = $(mount, '.rename[data-rename="editing"]') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('change'));
    await mount.settle();
    expect(input.value).to.equal('Editing');
    expect(mount.writes.length).to.equal(0);
  });
});

describe('the palette', () => {
  it('does nothing when a palette row is dropped back on the palette', async function () {
    this.timeout(TIMEOUT_MS);
    // Waiting under a deleted group rather than removed, which is how a new app for that group
    // arrives: dropping it on the palette as a removal would write it into the removed list.
    mount = await arranging({
      launcherWidth: IN_VIEWPORT_WIDTH,
      layout: { groups: [{ id: 'editing', label: null, apps: ['content', 'media'] }], removed: [], deletedGroups: ['diagnostics'] },
    });
    await dragOnto(mount, $(mount, '.prow[data-alias="logs"]'), () => mount!.root.querySelector('.palette .ph'));
    expect(mount.writes.length).to.equal(0);
  });

  it('starts no drag from a palette row when the palette is its own view', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging({ launcherWidth: UMBRADESKTOP_LAUNCHER_SPLIT_MIN - 100 });
    $(mount, '.tile.arr[data-alias="profiling"] .rm').click();
    await mount.settle();
    $(mount, '.ctl.add-apps').click();
    await mount.settle();
    await startDrag(mount, $(mount, '.prow[data-alias="profiling"]'));
    expect(count(mount, '.drag-ghost')).to.equal(0);
    window.dispatchEvent(pointer('pointerup', 0, 0));
  });

  it('clears its filter on Escape without closing the launcher, and lets Escape through once empty', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.tile.arr[data-alias="profiling"] .rm').click();
    await mount.settle();
    const filter = $(mount, '.palette-filter') as HTMLInputElement;
    filter.value = 'nothing like this';
    filter.dispatchEvent(new Event('input'));
    await mount.settle();
    expect(escapeReachesDocument(filter), 'Escape with text is spent on clearing it').to.equal(false);
    await mount.settle();
    expect(($(mount, '.palette-filter') as HTMLInputElement).value).to.equal('');
    expect(count(mount, '.prow[data-alias="profiling"]'), 'the palette shows everything again').to.equal(1);
    expect(escapeReachesDocument($(mount, '.palette-filter')), 'Escape on an empty filter closes the launcher as before').to.equal(true);
  });

  it('says so when the filter matches nothing', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arranging();
    $(mount, '.tile.arr[data-alias="profiling"] .rm').click();
    await mount.settle();
    const filter = $(mount, '.palette-filter') as HTMLInputElement;
    filter.value = 'nothing like this';
    filter.dispatchEvent(new Event('input'));
    await mount.settle();
    expect(count(mount, '.palette .empty-note')).to.equal(1);
  });
});

it('does not offer Pinned as a place for a group being dragged', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging({ launcherWidth: IN_VIEWPORT_WIDTH });
  await startDrag(mount, $(mount, '.handle[data-handle="diagnostics"]'));
  const pinned = $(mount, '.card.fav').getBoundingClientRect();
  const x = pinned.left + 20;
  const y = pinned.top + pinned.height / 2;
  window.dispatchEvent(pointer('pointermove', x, y));
  await mount.settle();
  expect(count(mount, '.card.fav.drop')).to.equal(0);
  window.dispatchEvent(pointer('pointerup', x, y));
  await mount.settle();
  expect(mount.writes.length).to.equal(0);
});

it('lets one card column shrink rather than scroll sideways at the narrowest split', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging({ launcherWidth: UMBRADESKTOP_LAUNCHER_SPLIT_MIN });
  const pane = $(mount, '.layout-pane');
  expect(pane.scrollWidth).to.be.at.most(pane.clientWidth);
});

it('gives the − and ⋯ buttons a 24px target (WCAG 2.5.8)', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  for (const selector of ['.tile.arr .rm', '.tile.arr .mv']) {
    const box = $(mount, selector).getBoundingClientRect();
    expect(box.width, selector).to.be.at.least(24);
    expect(box.height, selector).to.be.at.least(24);
  }
});

it('creates a group from the New group card and focuses its name', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.newgroup').click();
  await mount.settle();
  await mount.settle();
  const groups = mount.writes[mount.writes.length - 1].layout!.groups;
  const created = groups[groups.length - 1];
  expect(created.id.startsWith('custom-')).to.equal(true);
  expect(created.apps).to.deep.equal([]);
  expect(focused(mount)).to.equal(`rename:${created.id}`);
});

it("leaves Pinned out of a pinned tile's Move to", async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging({ pinned: ['logs'] });
  $(mount, '.tile.arr[data-group="@pinned"][data-alias="logs"] .mv').click();
  await mount.settle();
  const items = [...mount.root.querySelectorAll<HTMLElement>('.movemenu .mmi')].map((item) => item.textContent!.trim());
  expect(items).to.not.include('umbraDesktop_favourites');
  expect(items.length).to.equal(4);
});

it('moves a focused tile forward with ArrowRight and keeps focus on it', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  const tile = arrTile(mount, 'editing', 'content');
  tile.focus();
  tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
  await mount.settle();
  await mount.settle();
  expect(arranged(mount)[0]).to.deep.equal(['editing', ['media', 'content']]);
  expect(focused(mount)).to.equal('tile:content');
});
