import { expect } from '@open-wc/testing';
import '../../../components/taskbar.element.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import { measureTray, withTrayItem } from '../mount-themed.js';
import { WIN98_BEVEL_DEPTH, WIN98_CLOCK_PADDING, WIN98_TASKBAR_PADDING, WIN98_TRAY_PADDING } from './metrics.js';

/**
 * A Win98 Start button is the widest thing on the bar and it carries a word. The Umbraco mark
 * alone does not read as one — it reads as another task button that happens to be first.
 *
 * A theme cannot add DOM, so the word arrives as generated content. What it must *not* do is
 * invent the word: a string written into a stylesheet is invisible to the localization files and
 * would stay English in every language. The button already has a `title`, so the theme renders
 * that, which means the label is whatever the taskbar says the button does — today an untranslated
 * "Open apps", and automatically the translated term if that title is ever localized, with no
 * further change here.
 *
 * The first test below is what keeps that honest: it compares the rendered label against the
 * button's own title rather than against an expected string, so replacing `attr(title)` with a
 * literal fails even if the literal happens to look right in English.
 */

/**
 * The widest the Start button may get, in px. A translation is free to be long, and the running
 * task list next to it is the part that has to give way — not the bar.
 */
const START_WIDTH_CEILING = 200;

/** The themed taskbar under test, mounted once for the whole file. */
let bar: UmbraDesktopThemedMount<HTMLElement & { updateComplete: Promise<unknown> }>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  bar = await mountThemed('umbradesktop-taskbar', 'taskbar');
});

after(() => bar?.dispose());

/** The start button, which the taskbar always renders. */
function startButton(): HTMLElement {
  const start = bar.root.querySelector<HTMLElement>('.start');
  expect(start, 'the taskbar should render a start button').to.not.equal(null);
  return start!;
}

it('labels the start button from its own title, never from a string in the stylesheet', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const start = startButton();
  const title = start.getAttribute('title');

  expect(title, 'the start button should carry a title for the label to come from').to.be.a('string');
  expect(title, 'an empty title would render an unlabelled button').to.not.equal('');

  // Chrome resolves attr() when reporting computed `content`, so what comes back is the string a
  // user actually sees, quoted. Compared against the live title on purpose: a hardcoded label
  // would still be a quoted string here, and only this comparison catches it.
  expect(
    getComputedStyle(start, '::after').content,
    'the start button\'s label does not match its title. A theme cannot reach the localization ' +
      'files, so the label has to be attr(title) — a literal written into the stylesheet would ' +
      'stay English in every language',
  ).to.equal(JSON.stringify(title));
});

it('caps the start button so a long translation cannot crowd out the task list', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const start = startButton();
  const original = start.getAttribute('title') ?? '';
  try {
    const short = start.getBoundingClientRect().width;

    start.setAttribute('title', 'Anwendungen, Werkzeuge und Einstellungen oeffnen');
    const long = start.getBoundingClientRect().width;

    expect(long, 'a long label should still widen the button somewhat').to.be.greaterThan(short);
    expect(
      long,
      'the start button grows without bound on a long translation, which squeezes the running ' +
        'task list against the clock — cap the label and let it ellipsize',
    ).to.be.at.most(START_WIDTH_CEILING);
  } finally {
    start.setAttribute('title', original);
  }
});

/**
 * The tray is the sunken well, and the clock is only the last thing in it (design D16). In Windows
 * 98 the notification icons sat inside that well beside the time, so a well drawn on the clock alone
 * would leave every tray item outside it.
 */
it('draws the sunken well on the tray, not on the clock', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const tray = bar.root.querySelector('.tray') as HTMLElement;
  const clock = bar.root.querySelector('.clock') as HTMLElement;
  expect(tray, 'the taskbar should render a tray').to.not.equal(null);

  const style = getComputedStyle(tray);
  expect(style.boxShadow, 'the tray is the sunken well, its bevel drawn inside it').to.contain('inset');
  expect(style.marginLeft, 'set off from the task buttons by the padding of the bar').to.equal(
    `${WIN98_TASKBAR_PADDING}px`,
  );
  expect(getComputedStyle(clock).boxShadow, 'a second well on the clock would draw a well in a well').to.equal(
    'none',
  );
});

it('draws an empty tray as exactly the clock', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  expect(bar.root.querySelector('.tray')!.childElementCount, 'this test is about the empty tray').to.equal(1);
  const { tray, clock } = measureTray(bar.root);
  const time = (bar.root.querySelector('.clock-time') as HTMLElement).getBoundingClientRect();
  // The bevel is an inset shadow, so it costs no layout of its own. What the tray adds is the
  // leading padding it took over from the clock and the bevel's depth on the other three sides,
  // which keeps the clock's hover fill off the bevel.
  expect(tray.width - clock.width, 'the leading padding and the trailing bevel').to.be.closeTo(
    WIN98_TRAY_PADDING + WIN98_BEVEL_DEPTH,
    0.5,
  );
  expect(tray.height - clock.height, 'the bevel top and bottom').to.be.closeTo(2 * WIN98_BEVEL_DEPTH, 0.5);
  expect(tray.right - clock.right, 'the clock ends inside the bevel').to.be.closeTo(WIN98_BEVEL_DEPTH, 0.5);
  // The box as it was when the clock carried the well: the time with the clock's old padding either
  // side of it. The two halves of the split have to add back up to exactly that.
  expect(tray.width - time.width, 'the well is as wide as it was before the tray existed').to.be.closeTo(
    2 * WIN98_CLOCK_PADDING,
    0.5,
  );
});

it('holds a tray item inside the well, before the time', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  withTrayItem(bar.root, (item) => {
    const { tray, clock } = measureTray(bar.root);
    const box = item.getBoundingClientRect();
    // Clear of the bevel, not merely inside the box: the bevel is painted inside the tray's own
    // edge, so an item starting within its depth would sit under its two dark pixels.
    expect(box.left - tray.left, 'the item starts clear of the bevel').to.be.above(WIN98_BEVEL_DEPTH);
    expect(box.right, 'and comes before the clock').to.be.at.most(clock.left + 0.5);
    expect(box.top, 'within the well top to bottom').to.be.at.least(tray.top - 0.5);
    expect(box.bottom).to.be.at.most(tray.bottom + 0.5);
  });
});

/**
 * An inset shadow is painted under the element's children, so anything a child paints over the
 * bevel hides it: the clock's hover and pressed fill, and a tray item's hover. The well has to keep
 * every child's box, and so every fill, inside the bevel on all four sides.
 */
it('keeps the clock and a full-height tray item inside the bevel, so a hover cannot paint over it', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const { tray, clock } = measureTray(bar.root);
  expect(clock.top - tray.top, 'the clock clears the top bevel').to.be.at.least(WIN98_BEVEL_DEPTH - 0.5);
  expect(tray.bottom - clock.bottom, 'the bottom bevel').to.be.at.least(WIN98_BEVEL_DEPTH - 0.5);
  expect(tray.right - clock.right, 'and the trailing bevel').to.be.at.least(WIN98_BEVEL_DEPTH - 0.5);

  withTrayItem(bar.root, (item) => {
    // As tall as the tray lets it be, the way umbraCoffee's cup is, which is the case that showed it.
    item.style.height = 'auto';
    item.style.alignSelf = 'stretch';
    const box = item.getBoundingClientRect();
    const well = measureTray(bar.root).tray;
    expect(box.top - well.top, 'a full-height item clears the top bevel').to.be.at.least(WIN98_BEVEL_DEPTH - 0.5);
    expect(well.bottom - box.bottom, 'and the bottom bevel').to.be.at.least(WIN98_BEVEL_DEPTH - 0.5);
  });
});
