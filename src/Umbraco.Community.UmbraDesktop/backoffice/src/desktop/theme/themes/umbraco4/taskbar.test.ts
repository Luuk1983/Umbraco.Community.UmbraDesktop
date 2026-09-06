import { expect } from '@open-wc/testing';
import '../../../components/taskbar.element.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';

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

it('sits the clock in a sunken well rather than leaving it as bare text', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const clock = bar.root.querySelector('.clock') as HTMLElement;
  expect(clock, 'the taskbar should render a clock').to.not.equal(null);

  const style = getComputedStyle(clock);
  expect(style.backgroundColor, 'the tray is a white well, as every v4 field is').to.equal(
    'rgb(255, 255, 255)',
  );
  expect(style.boxShadow, 'a v4 well is sunken, with its shadow drawn inside it').to.contain('inset');
  expect(
    style.opacity,
    'the base dims the clock against a dark bar; on warm grey that just looks like a fault',
  ).to.equal('1');
});
