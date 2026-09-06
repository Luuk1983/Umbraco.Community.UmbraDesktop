import { expect } from '@open-wc/testing';
import '../../../components/taskbar.element.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';

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
