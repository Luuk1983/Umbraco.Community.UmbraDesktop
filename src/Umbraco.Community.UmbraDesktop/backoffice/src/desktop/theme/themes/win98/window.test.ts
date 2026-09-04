import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp } from '../../../types.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';

/**
 * Win98's chrome is drawn in whole pixels. Its bevels are single-pixel lines and its control marks
 * are single-pixel hairlines, so this theme is far less forgiving of sub-pixel geometry than the
 * Umbraco theme it inherits from: at 46px-wide buttons with 14px glyphs a half-pixel is invisible,
 * and at 20px-wide buttons with a 1px mark it is the difference between a crisp glyph and a grey
 * smear that reads as misaligned.
 *
 * The trap is that flex centring is not the problem and looks innocent. `.ctrl` centres its glyph
 * exactly — the gaps either side are equal to the last decimal. They are equal *and* fractional,
 * which is what puts every mark inside on a half pixel. So the assertions below are about parity
 * and scale rather than about symmetry, because symmetry was never what broke.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'win98-window-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  url: 'about:blank',
  chromeProfile: 'bare',
};

/** Every window control, in DOM order. */
const CONTROLS = ['ctrl-reload', 'ctrl-minimize', 'ctrl-maximize', 'ctrl-close'] as const;

/** The controls whose marks are straight lines, and so depend on landing on a pixel boundary. */
const STRAIGHT_CONTROLS = ['ctrl-minimize', 'ctrl-maximize', 'ctrl-close'] as const;

/** The themed window under test, mounted once for the whole file. */
let win: UmbraDesktopThemedMount<UmbraDesktopWindowElement>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  win = await mountThemed<UmbraDesktopWindowElement>('umbradesktop-window', 'window');
  win.element.window = {
    id: 'w1',
    app: PROBE_APP,
    rect: { x: 0, y: 0, w: 640, h: 400 },
    z: 1,
    active: true,
    state: 'normal',
  };
  await win.element.updateComplete;
});

after(() => win?.dispose());

/**
 * One control button and the glyph inside it.
 * @param cls The control's own class, e.g. `ctrl-close`.
 * @returns The button and its glyph.
 */
function control(cls: string): { button: HTMLElement; glyph: SVGSVGElement } {
  const button = win.root.querySelector<HTMLElement>('.' + cls);
  expect(button, `the window should render .${cls}`).to.not.equal(null);
  const glyph = button!.querySelector<SVGSVGElement>('.glyph');
  expect(glyph, `.${cls} should render a glyph`).to.not.equal(null);
  return { button: button!, glyph: glyph! };
}

it('sizes every control glyph so it centres on whole pixels', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  for (const cls of CONTROLS) {
    const { button, glyph } = control(cls);
    const b = button.getBoundingClientRect();
    const g = glyph.getBoundingClientRect();

    // Flex centring splits the leftover space in two, so the button and its glyph have to differ
    // by an *even* number of pixels on each axis or the glyph starts on a half pixel.
    for (const [axis, leftover] of [
      ['horizontally', b.width - g.width],
      ['vertically', b.height - g.height],
    ] as const) {
      expect(
        leftover % 2,
        `.${cls} is ${leftover}px wider than its glyph ${axis}, so centring puts the glyph on a ` +
          'half pixel and every hairline inside it is smeared across two physical pixels — pick ' +
          'a glyph size with the same parity as the button',
      ).to.equal(0);
    }
  }
});

it('sits the minimize bar on the same baseline as the maximize box', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Windows 98 does not centre the minimize mark. It is a short bar resting on the same baseline
  // as the bottom edge of the maximize box and the foot of the close cross, which is what makes
  // the three read as one set rather than as three unrelated marks. The shared glyph SVG centres
  // it instead — `y=6.5` in a 12-unit box — because that is the right answer for every other
  // theme, so this theme drops it to the baseline itself.
  const bar = control('ctrl-minimize').glyph.querySelector('line');
  const box = control('ctrl-maximize').glyph.querySelector('rect');
  expect(bar, 'the minimize glyph should draw a line').to.not.equal(null);
  expect(box, 'the maximize glyph should draw a rect').to.not.equal(null);

  // Absolute viewport coordinates are comparable here: both buttons are items of the same
  // `.controls` row, centred to the same height, so their boxes share a top and a bottom.
  const barBottom = bar!.getBoundingClientRect().bottom;
  const boxBottom = box!.getBoundingClientRect().bottom;

  expect(
    Math.abs(barBottom - boxBottom),
    `the minimize bar's baseline is ${(boxBottom - barBottom).toFixed(1)}px above the maximize ` +
      "box's. In Win98 the two rest on the same line — a centred minimize mark reads as floating " +
      'in the middle of its button next to the other two',
  ).to.be.at.most(0.5);
});

it('maps a whole number of pixels to each viewBox unit of its straight glyphs', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  for (const cls of STRAIGHT_CONTROLS) {
    const { glyph } = control(cls);
    const units = glyph.viewBox.baseVal.width;
    const rendered = glyph.getBoundingClientRect().width;
    expect(units, `.${cls}'s glyph should declare a viewBox`).to.be.greaterThan(0);

    expect(
      (rendered / units) % 1,
      `.${cls}'s glyph renders ${rendered}px for ${units} viewBox units, so a stroke of one unit ` +
        'lands between pixels. Win98 marks are single-pixel hairlines; size these glyphs to a ' +
        'whole multiple of their viewBox so the strokes fall on pixel boundaries',
    ).to.equal(0);
  }
});
