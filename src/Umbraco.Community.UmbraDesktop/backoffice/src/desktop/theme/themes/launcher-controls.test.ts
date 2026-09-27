import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './index.js';
import { contrastRatio } from '../contrast.js';
import { adoptIconStandIn, mountLauncher, stubApp } from '../../components/launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from '../../components/launcher.test-helper.js';

/**
 * A theme may restyle every new launcher control and may remove none (CLAUDE.md). Checked for all
 * five themes in the three modes, with apps on the launcher, one pinned and one taken off, so arrange
 * mode has tiles to draw buttons on in both Pinned and a group and a palette row to add back; then
 * in Move to and the Reset confirm, and on an empty launcher in a mount of its own.
 *
 * Rendered under each theme's real palette and launcher sheet, with the English terms so labels
 * have their real length, rather than read from the CSS text, because the ways a control disappears
 * are mostly indirect: a row layout that squeezes a button to nothing, a label that runs out of its
 * button or off the panel, a rule scoped so it wins over the base where nobody meant it to, a token
 * that paints text in the colour of its own ground. Only the browser's layout sees those.
 */

/** Mounting a launcher under a theme imports that theme's sheets, which is slow in a busy run. */
const TIMEOUT_MS = 30_000;

/** One catalogue group, so arrange mode draws a group card with its handle, rename and delete. */
const GROUPS = [{ alias: 'editing', label: 'Editing', weight: 10 }];

/**
 * Apps in it, so there are tiles to carry the − and ⋯ buttons and rows for All apps. One has a long
 * name, because a label is what a theme that turns tiles into rows has to keep clear of the buttons
 * at the row's end, and a short name leaves room whether it did or not.
 */
const APPS = [
  stubApp('content', 'editing', 10),
  stubApp('media', 'editing', 20),
  stubApp('an-app-whose-name-runs-on-well-past-the-width-of-any-tile', 'editing', 30),
];

/** Pinned, so arrange mode draws a Pinned tile as well as group tiles. */
const PINNED = ['content'];

/** The app taken off the launcher, so the palette has a row, its + and its category's Add all. */
const REMOVED = 'profiling';

/**
 * Every app, the one taken off included. Its name is long too, for the same reason as the tile's:
 * a palette row has its + at the end to keep clear of.
 */
const ALL_APPS = [...APPS, stubApp(REMOVED, 'editing', 40)];

/** The stored arrangement that takes {@link REMOVED} off and keeps the rest where the catalogue put it. */
const LAYOUT = {
  groups: [{ id: 'editing', label: null, apps: APPS.map((app) => app.alias) }],
  removed: [REMOVED],
  deletedGroups: [],
};

/** Everything taken off and nothing pinned, which is what draws the empty state. */
const EMPTY_LAYOUT = { groups: [], removed: ALL_APPS.map((app) => app.alias), deletedGroups: [] };

/**
 * The smallest a tile's − or ⋯ may be to press, in px: the WCAG 2.5.8 minimum pointer target, which
 * is what the base sizes them to. A theme may draw them smaller, but not make them harder to hit.
 */
const MIN_TARGET_PX = 24;

/** WCAG AA for text below large-text size, which every launcher control label is. */
const MIN_TEXT_CONTRAST = 4.5;

/** Sub-pixel slack for the box comparisons, so a rounding difference is not read as an overlap. */
const EPSILON_PX = 0.5;

/** Slack for the containment and overflow checks, which compare rounded integer widths. */
const CONTAIN_SLACK_PX = 1;

/**
 * Whether an element is really on screen: laid out with a size, and neither it nor anything above
 * it, up to and including the launcher itself, hidden or fully transparent. Opacity has to be read
 * on every ancestor because it does not inherit: a card faded to nothing leaves each button in it
 * reporting full opacity of its own.
 * @param element The element.
 * @returns True when a user could see it.
 */
function visible(element: Element | null): boolean {
  if (!element) return false;
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return false;
  // Up through the shadow tree, then on to the launcher that hosts it, and no further.
  const host = (element.getRootNode() as ShadowRoot).host ?? null;
  for (let node: Element | null = element; node; node = node === host ? null : (node.parentElement ?? host)) {
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  }
  return true;
}

/**
 * Whether two boxes share any area, allowing for sub-pixel rounding.
 * @param a One box.
 * @param b The other.
 * @returns True when they overlap by more than the slack.
 */
function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right - EPSILON_PX && b.left < a.right - EPSILON_PX && a.top < b.bottom - EPSILON_PX && b.top < a.bottom - EPSILON_PX;
}

/**
 * Whether one box lies within another horizontally, allowing for sub-pixel rounding. Horizontally
 * only: a row theme may let a button's hit area stand a pixel proud of a row shorter than the target
 * minimum, which costs nothing, while one hanging off the side of its tile covers the next tile.
 * @param inner The box that should be inside.
 * @param outer The box it should be inside.
 * @param slack How far past the edge still counts as inside.
 * @returns True when it is.
 */
function withinX(inner: DOMRect, outer: DOMRect, slack = EPSILON_PX): boolean {
  return inner.left >= outer.left - slack && inner.right <= outer.right + slack;
}

/**
 * A short name for whatever a hit-test found, for the failure message.
 * @param element The element hit, if any.
 * @returns Its tag and classes.
 */
function nameOfHit(element: Element | null): string {
  return element ? `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}` : 'nothing';
}

/**
 * Check each control is shown, reachable and legible. Every match of every selector has to be
 * visible, within the launcher's width, and be what a press at its centre lands on, once scrolled
 * into view: a control drawn under a neighbour, a pane or its own card is there to look at and gone
 * to the pointer. A control button, which is fixed in the header or the banner rather than
 * inside a pane that scrolls, also has to lie wholly within the launcher, keep its label inside its
 * own box, and carry that label at a legible contrast on its fill.
 *
 * The contrast is measured only where the fill is one opaque colour. A translucent fill (macOS,
 * Windows 11) depends on the wallpaper behind the panel and a gradient (Umbraco 4's raised buttons)
 * has no single colour, so neither has a ratio to measure without inventing a backdrop; those are
 * skipped, which leaves the pressed and default states, the white-on-a-fill case that goes wrong,
 * measured in every theme that fills them solidly.
 * @param mount The mounted launcher.
 * @param selectors The controls to check.
 * @param where Which mode, for the failure messages.
 */
function expectControls(mount: UmbraDesktopLauncherMount, selectors: ReadonlyArray<string>, where: string): void {
  for (const selector of selectors) {
    const elements = [...mount.root.querySelectorAll<HTMLElement>(selector)];
    expect(elements.length, `${selector} in ${where} is drawn`).to.be.at.least(1);
    for (const element of elements) expectControl(mount, element, selector, where);
  }
}

/**
 * The checks {@link expectControls} makes of one control.
 * @param mount The mounted launcher.
 * @param element The control.
 * @param selector What found it, for the failure messages.
 * @param where Which mode, for the failure messages.
 */
function expectControl(mount: UmbraDesktopLauncherMount, element: HTMLElement, selector: string, where: string): void {
  expect(visible(element), `${selector} in ${where}`).to.equal(true);
  // Nearest, so a control already in view moves nothing, and one below a pane's fold comes up.
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const panel = mount.launcher.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  expect(withinX(box, panel, CONTAIN_SLACK_PX), `${selector} in ${where} is within the launcher's width`).to.equal(true);
  const hit = mount.root.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  expect(!!hit && element.contains(hit), `${selector} in ${where} is what a press at its centre hits, not ${nameOfHit(hit)}`).to.equal(true);
  if (!element.classList.contains('ctl')) return;

  expect(
    box.top >= panel.top - CONTAIN_SLACK_PX && box.bottom <= panel.bottom + CONTAIN_SLACK_PX,
    `${selector} in ${where} is within the launcher's height`,
  ).to.equal(true);
  expect(element.scrollWidth, `${selector} in ${where} keeps its label inside it`).to.be.at.most(element.clientWidth + CONTAIN_SLACK_PX);
  const style = getComputedStyle(element);
  const ratio = contrastRatio(style.color, style.backgroundColor);
  if (ratio !== null) {
    expect(ratio, `${selector} in ${where}: ${style.color} on ${style.backgroundColor}`).to.be.at.least(MIN_TEXT_CONTRAST);
  }
}

/** The palette's own controls: its filter, the removed app's row with its +, and the category's Add all. */
const PALETTE_CONTROLS = ['.palette-filter', '.prow', '.prow .edit.add', '.addall'];

afterEach(() => window.scrollTo(0, 0));

for (const theme of UMBRADESKTOP_THEMES) {
  describe(`${theme.name} keeps every launcher control`, () => {
    it('in normal mode, in All apps, and in arrange mode', async function () {
      this.timeout(TIMEOUT_MS);
      const mount = await mountLauncher({ apps: ALL_APPS, groups: GROUPS, pinned: PINNED, layout: LAYOUT, theme });
      await adoptIconStandIn(mount);
      try {
        const $ = (selector: string) => mount.root.querySelector(selector);
        const click = async (selector: string) => {
          ($(selector) as HTMLElement).click();
          await mount.settle();
        };
        expect($('.ctl.all-apps')?.textContent?.trim(), 'the English terms are registered, so labels have their real length').to.equal('All apps');
        expectControls(mount, ['.ctl.all-apps', '.ctl.arrange'], 'normal mode');

        // Arrange is a button like All apps beside it: sized to its label, with its icon beside the
        // label. Arrange mode's own container once shared its class name, and turned the button into
        // a column that took all the row's spare width with the icon stacked over the label.
        const arrange = $('.ctl.arrange') as HTMLElement;
        expect(getComputedStyle(arrange).flexGrow, 'Arrange does not grow into the header row').to.equal('0');
        const arrangeIcon = arrange.querySelector('umb-icon')!.getBoundingClientRect();
        const arrangeLabel = arrange.querySelector('span')!.getBoundingClientRect();
        expect(arrangeLabel.left, "Arrange's label sits beside its icon, not under it").to.be.at.least(arrangeIcon.right - EPSILON_PX);

        await click('.ctl.all-apps');
        expectControls(mount, ['.ctl.back', '.drawer-filter', '.row'], 'All apps');
        await click('.ctl.back');

        await click('.ctl.arrange');
        expectControls(mount, ['.ctl.reset', '.ctl.done', '.handle', '.rename', '.gdel', '.tile.arr .rm', '.tile.arr .mv', '.newgroup'], 'arrange mode');

        // Side by side where the theme is wide enough; otherwise behind Add apps, which has to swap
        // the palette in for the layout and back.
        if (visible($('.palette'))) {
          expectControls(mount, PALETTE_CONTROLS, 'the palette');
        } else {
          expectControls(mount, ['.ctl.add-apps'], 'arrange mode');
          await click('.ctl.add-apps');
          expect(visible($('.palette')), 'Add apps shows the palette').to.equal(true);
          expect(visible($('.layout-pane')), 'Add apps puts the palette in place of the layout').to.equal(false);
          expectControls(mount, ['.ctl.add-apps', ...PALETTE_CONTROLS], 'the palette');
          await click('.ctl.add-apps');
          expect(visible($('.layout-pane')), 'pressed again, it brings the layout back').to.equal(true);
        }

        // A button squeezed under its neighbour or over the label is removed in every way that
        // matters to the person aiming at it, so every tile's two buttons, in Pinned and in the
        // group, are checked against each other, against the tile they belong to and against its
        // name.
        expect(mount.root.querySelectorAll('.card.fav .tile.arr').length, 'arrange mode should draw the pinned tile').to.equal(PINNED.length);
        const tiles = [...mount.root.querySelectorAll('.tile.arr')];
        // A pinned app is drawn in Pinned instead of its group, and the removed one in the palette
        // instead, so this is one tile per app on the launcher.
        expect(tiles.length, 'arrange mode should draw a tile per app on the launcher, pinned or not').to.equal(APPS.length);
        for (const tile of tiles) {
          const alias = `${(tile as HTMLElement).dataset.group}/${(tile as HTMLElement).dataset.alias}`;
          const box = tile.getBoundingClientRect();
          const label = tile.querySelector('.tlb')!.getBoundingClientRect();
          const icon = tile.querySelector('umb-icon')!.getBoundingClientRect();
          const [rm, mv] = ['.rm', '.mv'].map((selector) => tile.querySelector(selector)!.getBoundingClientRect());
          for (const [name, button] of [['−', rm], ['⋯', mv]] as const) {
            expect(Math.min(button.width, button.height), `${alias}: ${name} is big enough to press`).to.be.at.least(MIN_TARGET_PX - EPSILON_PX);
            expect(withinX(button, box), `${alias}: ${name} stays on its own tile`).to.equal(true);
            expect(overlaps(button, label), `${alias}: ${name} keeps clear of the name`).to.equal(false);
            expect(overlaps(button, icon), `${alias}: ${name} keeps clear of the icon`).to.equal(false);
          }
          expect(overlaps(rm, mv), `${alias}: − and ⋯ do not cover each other`).to.equal(false);
        }

        // Move to, from a group tile so it lists Pinned too: every item has to be on top of the
        // tiles it is drawn over, which only a hit-test can tell.
        await click('.tile.arr[data-group="editing"] .mv');
        await mount.settle();
        expectControls(mount, ['.movemenu .mmi'], 'Move to');
        $('.movemenu .mmi')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
        await mount.settle();

        await click('.ctl.reset');
        expectControls(mount, ['.ctl.reset-yes', '.ctl.reset-no'], 'the Reset confirm');
        await click('.ctl.reset-no');
      } finally {
        mount.remove();
      }
    });

    it('on an empty launcher', async function () {
      this.timeout(TIMEOUT_MS);
      const mount = await mountLauncher({ apps: ALL_APPS, groups: GROUPS, layout: EMPTY_LAYOUT, theme });
      await adoptIconStandIn(mount);
      try {
        expectControls(mount, ['.empty .ctl.arrange', '.empty .ctl.all-apps'], 'the empty state');
      } finally {
        mount.remove();
      }
    });
  });
}
