import { expect } from '@open-wc/testing';
import '../../../components/taskbar.element.js';
import { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS, measureTray, mountThemedWith, withTrayItem } from '../mount-themed.js';
import type { UmbraDesktopThemedMount, UmbraDesktopUpdatable } from '../mount-themed.js';
import { UMBRADESKTOP_MACOS_THEME } from './index.js';
import {
  MACOS_CLOCK_LEADING,
  MACOS_CLOCK_PADDING,
  MACOS_DOCK_ICON,
  MACOS_TRAY_PADDING,
  MACOS_TRAY_SEPARATOR,
} from './metrics.js';
import { MACOS_LIGHT } from './palette.js';

/**
 * The dock draws two separators: one between the fixed buttons and the open windows, one before the
 * tray, which ends with the clock. They have to be the same line.
 *
 * They were not, and it was visible immediately. The divider was built to the tile's height and the
 * clock's was a `border-left` on a box the base leaves sized to its own text, so the dock showed a
 * 42px rule beside a 13px one and read as a rendering fault rather than as a choice.
 *
 * Both now take {@link MACOS_DOCK_ICON}, which is the second half of that fix. Matching them at the
 * *tile's* height made them agree and made the dock a row of boxes: a tile is 42 and its glyph is
 * 24, so a rule built to the tile stands taller than everything it separates. macOS draws this
 * short and low-contrast, sitting inside the icons.
 *
 * The divider itself cannot be measured here. It is rendered only when there is something on both
 * sides of it, which needs a window manager, and that never resolves outside a desktop — so the
 * tray's rule is what gets measured, and the sheet is what says the two agree. That split follows
 * the Windows 11 taskbar tests, which assert on rule text for exactly the same reason.
 */

/** The themed dock under test, mounted once for the file — see the shared helper on why. */
let bar: UmbraDesktopThemedMount<UmbraDesktopUpdatable>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  bar = await mountThemedWith(UMBRADESKTOP_MACOS_THEME, MACOS_LIGHT, 'umbradesktop-taskbar', 'taskbar');
});

after(() => {
  bar?.dispose();
});

/** The theme's own sheet, which is the last one adopted into the mounted component. */
function sheetText(): string {
  const sheets = [...bar.root.adoptedStyleSheets];
  return [...sheets[sheets.length - 1].cssRules].map((rule) => rule.cssText).join('\n');
}

it('draws the tray separator at the icon height, not at the height of its own text', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const tray = bar.root.querySelector('.tray') as HTMLElement;
  expect(tray, 'the taskbar should render a tray').to.not.equal(null);

  // The rendered box, because that is the thing the separator is drawn down the side of. It hangs on
  // the tray rather than the clock (design D16), so tray items sit after it, beside the time,
  // rather than out on the far side of the line among the windows.
  expect(
    tray.getBoundingClientRect().height,
    'the tray is sized to the icon so its left rule matches the divider',
  ).to.be.closeTo(MACOS_DOCK_ICON, 1);

  const style = getComputedStyle(tray);
  expect(style.borderLeftStyle, 'the separator before the tray is that border').to.equal('solid');
  expect(style.borderLeftWidth).to.equal(`${MACOS_TRAY_SEPARATOR}px`);
});

it('draws an empty tray as exactly the clock', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  expect(bar.root.querySelector('.tray')!.childElementCount, 'this test is about the empty tray').to.equal(1);
  const { tray, clock } = measureTray(bar.root);
  // The separator and the leading padding moved off the clock are all the tray adds, both on the
  // leading side. The clock kept the rest of its old padding, so the two together are the old box.
  expect(tray.width - clock.width, 'only the separator and the padding moved off the clock').to.be.closeTo(
    MACOS_TRAY_SEPARATOR + MACOS_TRAY_PADDING,
    0.5,
  );
  expect(tray.right, 'nothing on the trailing side').to.be.closeTo(clock.right, 0.5);
  // The box as it was when the clock carried the separator: the time with the clock's old padding,
  // its long leading side and its short trailing one, plus the line. The split has to add back up.
  const time = (bar.root.querySelector('.clock-time') as HTMLElement).getBoundingClientRect();
  expect(tray.width - time.width, 'the tray is as wide as the clock was before the tray existed').to.be.closeTo(
    MACOS_TRAY_SEPARATOR + MACOS_CLOCK_LEADING + MACOS_CLOCK_PADDING,
    0.5,
  );
});

it('puts a tray item after the separator, before the time', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  withTrayItem(bar.root, (item) => {
    const { tray, clock } = measureTray(bar.root);
    const box = item.getBoundingClientRect();
    expect(box.left, 'the item sits inside the separator, clear of it').to.be.at.least(
      tray.left + MACOS_TRAY_SEPARATOR + MACOS_TRAY_PADDING - 0.5,
    );
    expect(box.right, 'and comes before the clock').to.be.at.most(clock.left + 0.5);
  });
});

it('gives the divider and the tray separator the same height and the same ink', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const text = sheetText();

  // Both from the icon constant, which is the relationship: a dock with two separators of different
  // heights in it looks broken, and the only way they cannot drift is by being one number.
  const heights = [...text.matchAll(/\.divider[^}]*height:\s*([\d.]+)px/g)].map((match) => match[1]);
  expect(heights, 'the divider should set an explicit height').to.not.be.empty;
  for (const height of heights) {
    expect(Number(height), 'the divider is as tall as an icon, not as tall as a tile').to.equal(MACOS_DOCK_ICON);
  }

  // One colour behind both, so a change to the dock's hairline cannot reach one and miss the other.
  const inks = [...text.matchAll(/(?:background|border-left):[^;]*?(rgba\([^)]*\))/g)].map((m) => m[1]);
  expect(new Set(inks).size, `the dock should paint one separator colour, found: ${inks.join(', ')}`).to.equal(1);
});
