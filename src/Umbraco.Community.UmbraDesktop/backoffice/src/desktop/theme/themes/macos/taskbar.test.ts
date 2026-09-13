import { expect } from '@open-wc/testing';
import '../../../components/taskbar.element.js';
import { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS, mountThemedWith } from '../mount-themed.js';
import type { UmbraDesktopThemedMount, UmbraDesktopUpdatable } from '../mount-themed.js';
import { UMBRADESKTOP_MACOS_THEME } from './index.js';
import { MACOS_DOCK_ICON } from './metrics.js';
import { MACOS_LIGHT } from './palette.js';

/**
 * The dock draws two separators: one between the fixed buttons and the open windows, one before the
 * clock. They have to be the same line.
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
 * clock's rule is what gets measured, and the sheet is what says the two agree. That split follows
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

it('draws the clock separator at the icon height, not at the height of its own text', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const clock = bar.root.querySelector('.clock') as HTMLElement;
  expect(clock, 'the taskbar should render a clock').to.not.equal(null);

  // The rendered box, because that is the thing the separator is drawn down the side of: the base
  // leaves the clock an inline flex item sized by its own text, which made its rule a coincidence
  // of the font rather than a stated height.
  expect(
    clock.getBoundingClientRect().height,
    'the clock is sized to the icon so its left rule matches the divider',
  ).to.be.closeTo(MACOS_DOCK_ICON, 1);

  const style = getComputedStyle(clock);
  expect(style.borderLeftStyle, 'the separator before the clock is that border').to.equal('solid');
  expect(style.borderLeftWidth).to.equal('1px');
});

it('gives the divider and the clock separator the same height and the same ink', function () {
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
