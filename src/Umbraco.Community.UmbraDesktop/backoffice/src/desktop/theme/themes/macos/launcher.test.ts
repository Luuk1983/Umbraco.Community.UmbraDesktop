import { expect } from '@open-wc/testing';
import '../../../components/launcher.element.js';
import type { UmbraDesktopLauncherElement } from '../../../components/launcher.element.js';
import { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS, mountThemedWith } from '../mount-themed.js';
import type { UmbraDesktopThemedMount } from '../mount-themed.js';
import { UMBRADESKTOP_MACOS_THEME } from './index.js';
import { MACOS_LIGHT } from './palette.js';

/**
 * The Launchpad-style launcher has no other theme's problem: its header row (search plus, since
 * the 2026-09-27 layout work, the All apps button) has to sit centred and clear of the footer's
 * absolutely positioned user and actions clusters, rather than merely not colliding with a card
 * grid the way the other four themes' headers do.
 */

/** The themed launcher under test, mounted once for the whole file. */
let panel: UmbraDesktopThemedMount<UmbraDesktopLauncherElement>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  panel = await mountThemedWith<UmbraDesktopLauncherElement>(UMBRADESKTOP_MACOS_THEME, MACOS_LIGHT, 'umbradesktop-launcher', 'launcher');
});

after(() => panel?.dispose());

it('moves its outer margin to the header row, not the search field inside it', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Theme sheets are appended after the base styles, so a .search rule that kept its own margin
  // here would beat the base's `.search { margin: 0 }` and reintroduce it inside .hdr, doubling
  // with .hdr's own margin and pushing the row right and down from where the sheet puts it.
  const search = panel.root.querySelector('.search') as HTMLElement;
  expect(search, 'the launcher should render a search row').to.not.equal(null);
  const style = getComputedStyle(search);
  expect(style.marginLeft, 'the header row owns the left margin now, not the field').to.equal('0px');
  expect(style.marginTop, 'the header row owns the top margin now, not the field').to.equal('0px');
});

/**
 * Whether two rects run into each other on the horizontal axis. Vertical position is deliberately
 * not part of the check: `.footer` is out of flow (`position: absolute`) and `.hdr` is not, so
 * their vertical relationship is an artifact of this isolated mount (no taskbar, no app catalogue)
 * rather than something this theme's sheet promises.
 * @param a One rect.
 * @param b The other.
 * @returns `true` when neither runs into the other left-to-right.
 */
function clearOf(a: DOMRect, b: DOMRect): boolean {
  return a.right <= b.left || a.left >= b.right;
}

it("keeps the header row clear of the footer's user and actions clusters", function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // The header row (search plus All apps) is centred and capped so it sits in the band between
  // the avatar and the system actions, which macOS keeps at the far ends of its menu-bar-style
  // footer. Both the header and the footer render without the app catalogue or a taskbar, which is
  // all this mount has, so this is a real measurement rather than one that needs either.
  const hdr = panel.root.querySelector('.hdr') as HTMLElement;
  const user = panel.root.querySelector('.footer .user') as HTMLElement;
  const actions = panel.root.querySelector('.footer .actions') as HTMLElement;
  expect(hdr, 'the launcher should render a header row').to.not.equal(null);
  expect(user, "the footer should render the user's own button").to.not.equal(null);
  expect(actions, 'the footer should render its actions').to.not.equal(null);

  const hdrBox = hdr.getBoundingClientRect();
  const userBox = user.getBoundingClientRect();
  const actionsBox = actions.getBoundingClientRect();

  expect(clearOf(hdrBox, userBox), "the header row must not run into the footer's user button").to.equal(true);
  expect(clearOf(hdrBox, actionsBox), "the header row must not run into the footer's actions").to.equal(true);
});

/**
 * Check that a real mouse press on each control would reach it: the element the browser hit-tests
 * at the control's centre, and just inside its left edge, is the control or something inside it.
 * Being drawn clear of the footer's clusters is not enough, because the footer's own box spans the
 * whole band between them, transparent but on top, and a press there landed on the footer and did
 * nothing. Only the keyboard still worked.
 * @param selectors The controls.
 * @param where Which mode, for the failure messages.
 */
function expectPressable(selectors: ReadonlyArray<string>, where: string): void {
  for (const selector of selectors) {
    const control = panel.root.querySelector(selector) as HTMLElement | null;
    expect(!!control, `${selector} is drawn in ${where}`).to.equal(true);
    const box = control!.getBoundingClientRect();
    const y = box.top + box.height / 2;
    for (const [name, x] of [
      ['centre', box.left + box.width / 2],
      ['left edge', box.left + 2],
    ] as const) {
      const hit = panel.root.elementFromPoint(x, y);
      expect(!!hit && control!.contains(hit), `a press at the ${name} of ${selector} in ${where} reaches it, not ${hit?.className ?? 'nothing'}`).to.equal(
        true,
      );
    }
  }
}

it('lets a press on the header row reach its controls through the footer above it', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  expectPressable(['.search', '.ctl.all-apps', '.ctl.arrange'], 'normal mode');
});

// Last in the file, because it leaves normal mode for arrange mode and the tests above measure
// normal mode on the same shared mount.
it("keeps arrange mode's banner clear of the footer's user and actions clusters, and pressable", async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // The banner takes the header row's place, which is the band the footer shares at the top of this
  // panel. Left at the base's full width it ran under both clusters: the footer painted over it, and
  // a press on Reset landed on the exit-desktop button instead.
  (panel.root.querySelector('.ctl.arrange') as HTMLElement).click();
  await panel.element.updateComplete;
  const banners = panel.root.querySelectorAll<HTMLElement>('.banner');
  expect(banners.length, 'arrange mode should render its banner').to.equal(1);
  const bannerBox = banners[0].getBoundingClientRect();
  const userBox = (panel.root.querySelector('.footer .user') as HTMLElement).getBoundingClientRect();
  const actionsBox = (panel.root.querySelector('.footer .actions') as HTMLElement).getBoundingClientRect();

  expect(clearOf(bannerBox, userBox), "the banner must not run into the footer's user button").to.equal(true);
  expect(clearOf(bannerBox, actionsBox), "the banner must not run into the footer's actions").to.equal(true);
  expectPressable(['.ctl.reset', '.ctl.done'], 'arrange mode');
  // And the footer's own clusters still take a press, since they are what the footer is for.
  expectPressable(['.footer .user', '.footer .fbtn'], 'arrange mode');
});

it("draws All apps and Arrange as the search field's siblings: one toolbar of frosted pills", async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // The mount is shared, and the arrange case above leaves it arranging.
  (panel.root.querySelector('.ctl.done') as HTMLElement | null)?.click();
  await panel.element.updateComplete;
  // They read as out of place beside the search pill: shorter, square-cornered and a different
  // frost, like controls from another system. macOS has no All apps button to copy, so the honest
  // look is the search field's own, which is what Spotlight's toolbar does with its buttons.
  const search = panel.root.querySelector('.hdr .search') as HTMLElement;
  const controls = [...panel.root.querySelectorAll<HTMLElement>('.hdr .ctl')];
  expect(controls.length, 'the header row draws All apps and Arrange').to.equal(2);
  const pill = getComputedStyle(search);
  for (const control of controls) {
    const style = getComputedStyle(control);
    const name = control.className;
    expect(control.getBoundingClientRect().height, `${name}: as tall as the search field`).to.be.closeTo(search.getBoundingClientRect().height, 0.5);
    expect(style.borderTopLeftRadius, `${name}: the same pill ends`).to.equal(pill.borderTopLeftRadius);
    expect(style.backgroundColor, `${name}: the same frost`).to.equal(pill.backgroundColor);
    expect(style.borderTopColor, `${name}: the same edge`).to.equal(pill.borderTopColor);
    expect(style.borderTopWidth, `${name}: the same edge`).to.equal(pill.borderTopWidth);
  }
});
