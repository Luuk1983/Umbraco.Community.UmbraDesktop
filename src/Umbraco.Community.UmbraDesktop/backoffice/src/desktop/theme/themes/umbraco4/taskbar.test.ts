import { expect } from '@open-wc/testing';
import '../../../components/taskbar.element.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import { measureTray, withTrayItem } from '../mount-themed.js';
import { U4_CLOCK_PADDING, U4_TRAY_BORDER, U4_TRAY_HIGHLIGHT, U4_TRAY_PADDING } from './metrics.js';

/**
 * The taskbar is the one surface with **no Umbraco 4 antecedent at all** — v4 was a web
 * application and had nothing of the kind — so unlike the launcher and the window frame, there is
 * no original to be faithful to. It is built instead from v4's own raised-button vocabulary,
 * which is what keeps it period-correct while being invented.
 *
 * Two things here are worth a test rather than an eye.
 *
 * The Start button carries a visible word, and that word cannot be written in the stylesheet: a
 * string typed into CSS is invisible to the localization files and would stay English in every
 * language. It is rendered from the button's own `title` through generated content, exactly as
 * the Win98 theme does it, so the visible label and the accessible name are guaranteed to be the
 * same words. The test compares the rendered label against the live title rather than against an
 * expected string, so it keeps holding when that title is eventually localized.
 *
 * And the focused window's task button is marked by being *pressed and filled*, replacing the
 * base rule's coral underline. That underline is fed by `--umbradesktop-task-active-marker`,
 * which this theme deliberately leaves unset — so if the sheet's replacement ever stops matching,
 * the marker does not disappear, it reverts to Umbraco coral on a warm grey bar, which is the
 * kind of regression that survives a glance.
 */

/** The themed taskbar under test, mounted once for the whole file. */
let bar: UmbraDesktopThemedMount<HTMLElement & { updateComplete: Promise<unknown> }>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  bar = await mountThemed('umbradesktop-taskbar', 'taskbar');
});

after(() => bar?.dispose());

it('gives the Start button its label from its own title, so localization reaches it', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const start = bar.root.querySelector('.start') as HTMLElement;
  expect(start, 'the taskbar should render a start button').to.not.equal(null);

  const content = getComputedStyle(start, '::after').content;
  // `attr(title)` resolves in computed style, so this is the real rendered string rather than the
  // declaration — and comparing it to the live title is what stops the test pinning an English
  // word that the button itself is free to stop using.
  expect(
    content.replace(/^"|"$/g, ''),
    'the Start label should be the button title, not a string typed into the stylesheet',
  ).to.equal(start.getAttribute('title'));
});

it('draws the bar and its buttons as raised v4 surfaces', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const rendered = bar.root.querySelector('.bar') as HTMLElement;
  const start = bar.root.querySelector('.start') as HTMLElement;
  expect(rendered, 'the taskbar should render its bar').to.not.equal(null);

  const barStyle = getComputedStyle(rendered);
  expect(barStyle.backgroundImage, 'the bar is a gradient, not a flat fill').to.contain('linear-gradient');
  expect(barStyle.borderTopStyle, 'the bar has a hairline along its top edge').to.equal('solid');

  const startStyle = getComputedStyle(start);
  expect(startStyle.backgroundImage, 'a v4 button is a raised gradient').to.contain('linear-gradient');
  expect(startStyle.borderTopStyle, 'a v4 button carries a visible edge, unlike the base').to.equal(
    'solid',
  );
  expect(
    startStyle.boxShadow,
    'the 1px of white inside the top edge is what makes it read as raised',
  ).to.contain('inset');
});

it('sits the tray in a sunken well rather than leaving the clock as bare text', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const tray = bar.root.querySelector('.tray') as HTMLElement;
  const clock = bar.root.querySelector('.clock') as HTMLElement;
  expect(tray, 'the taskbar should render a tray').to.not.equal(null);
  expect(clock, 'the taskbar should render a clock').to.not.equal(null);

  // The well is the tray's, not the clock's (design D16): anything in the tray beside the time
  // has to sit in the same white field, as it would in any v4 input.
  const style = getComputedStyle(tray);
  expect(style.backgroundColor, 'the tray is a white well, as every v4 field is').to.equal(
    'rgb(255, 255, 255)',
  );
  expect(style.boxShadow, 'a v4 well is sunken, with its shadow drawn inside it').to.contain('inset');
  expect(style.borderTopWidth, 'and edged, as every v4 field is').to.equal(`${U4_TRAY_BORDER}px`);
  expect(
    getComputedStyle(clock).opacity,
    'the base dims the clock against a dark bar; on warm grey that just looks like a fault',
  ).to.equal('1');
});

it('draws an empty tray as exactly the clock', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  expect(bar.root.querySelector('.tray')!.childElementCount, 'this test is about the empty tray').to.equal(1);
  const { tray, clock } = measureTray(bar.root);
  const time = (bar.root.querySelector('.clock-time') as HTMLElement).getBoundingClientRect();
  // The well's edge, which used to be the clock's own border, and the leading padding the tray took
  // over from the clock: that is all the tray adds.
  expect(tray.width - clock.width, 'only its edge and the padding moved off the clock').to.be.closeTo(
    2 * U4_TRAY_BORDER + U4_TRAY_PADDING,
    0.5,
  );
  expect(tray.height - clock.height, 'the edge top and bottom, and the highlight under the top').to.be.closeTo(
    2 * U4_TRAY_BORDER + U4_TRAY_HIGHLIGHT,
    0.5,
  );
  expect(tray.right, 'the clock ends against the trailing edge of the well').to.be.closeTo(
    clock.right + U4_TRAY_BORDER,
    0.5,
  );
  // The box as it was when the clock was the well: the time, the clock's old padding either side
  // and the edge. The two halves of the split have to add back up to exactly that.
  expect(tray.width - time.width, 'the well is as wide as it was before the tray existed').to.be.closeTo(
    2 * U4_CLOCK_PADDING + 2 * U4_TRAY_BORDER,
    0.5,
  );
});

it('holds a tray item inside the well, before the time', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  withTrayItem(bar.root, (item) => {
    const { tray, clock } = measureTray(bar.root);
    const box = item.getBoundingClientRect();
    // Clear of the edge, not merely inside it: an icon starting on the well's border reads as clipped.
    expect(box.left - tray.left, 'the item starts clear of the edge of the well').to.be.above(U4_TRAY_BORDER);
    expect(box.right, 'and comes before the clock').to.be.at.most(clock.left + 0.5);
    expect(box.top, 'within the well top to bottom').to.be.at.least(tray.top + U4_TRAY_BORDER - 0.5);
    expect(box.bottom).to.be.at.most(tray.bottom - U4_TRAY_BORDER + 0.5);
  });
});

/**
 * The well's sunken look is a 1px inset highlight along its top, and an inset shadow is painted
 * under the element's children: a fill on the clock or on a full-height tray item would cover it.
 * Along the leading side the tray's own padding already keeps everything clear of it.
 */
it('keeps the clock and a full-height tray item below the well\'s top highlight', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const { tray, clock } = measureTray(bar.root);
  expect(clock.top - tray.top, 'the clock starts below the edge and the highlight').to.be.at.least(
    U4_TRAY_BORDER + U4_TRAY_HIGHLIGHT - 0.5,
  );
  withTrayItem(bar.root, (item) => {
    item.style.height = 'auto';
    item.style.alignSelf = 'stretch';
    const box = item.getBoundingClientRect();
    const well = measureTray(bar.root).tray;
    expect(box.top - well.top, 'so does a full-height item').to.be.at.least(U4_TRAY_BORDER + U4_TRAY_HIGHLIGHT - 0.5);
  });
});
