import { expect } from '@open-wc/testing';
import './components/window.element.js';
import type { UmbraDesktopWindowElement } from './components/window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from './types.js';
import { UMBRADESKTOP_DEFAULT_METRICS, UMBRADESKTOP_WINDOW_MIN_SIZE } from './constants.js';
import { chromeMinWindowSize, minWindowSizeForContent, windowSizeForContent } from './window-chrome.js';
import { UMBRADESKTOP_THEMES } from './theme/themes/index.js';

/**
 * `meta.defaultSize` and `meta.minSize` are an app's **content** size, and the host adds its own
 * chrome. These are the cases that hold that.
 *
 * Every one of them runs over all five shipped themes, and that is not thoroughness for its own
 * sake: this arithmetic is only wrong per theme. The reported bug was a game guessing one titlebar
 * allowance for five different titlebars, and a test that exercised a single theme would have
 * passed against exactly that guess. The themes also disagree about *which end* the controls sit
 * at — macOS puts them at the leading end and publishes `trailingControlsWidth: 0`, everything else
 * does the opposite — so a floor written against either field alone is right on some themes and
 * silently wrong on the rest.
 */

/** Every theme's metrics, named, so a failure says which theme it was. */
const THEMES = UMBRADESKTOP_THEMES.map((theme) => [theme.name, theme.metrics] as const);

/**
 * A content size no theme's chrome could ever fit inside, so a floor that is doing nothing is
 * visible: 1px asks for less than any chrome costs on either axis.
 */
const TINY = { w: 1, h: 1 };

it("charges a window with a path strip for it, and one without it nothing", () => {
  for (const [name, metrics] of THEMES) {
    const plain = windowSizeForContent({ w: 300, h: 200 }, metrics, 0);
    const withPath = windowSizeForContent({ w: 300, h: 200 }, metrics, metrics.pathbarHeight);
    expect(
      withPath.h - plain.h,
      `${name}: a section window's strip comes out of the window, not out of the app — an app that ` +
        'asked for 680px of content and got 652px is the bug this term exists to prevent',
    ).to.equal(metrics.pathbarHeight);
    expect(withPath.w, `${name}: the strip costs nothing horizontally`).to.equal(plain.w);
    expect(metrics.pathbarHeight, `${name}: every theme has to state a strip height`).to.be.greaterThan(0);
  }
});

it('floors a window with a strip below the chrome plus the strip, never the chrome alone', () => {
  for (const [name, metrics] of THEMES) {
    const bare = minWindowSizeForContent(TINY, UMBRADESKTOP_WINDOW_MIN_SIZE, metrics, 0);
    const withPath = minWindowSizeForContent(TINY, UMBRADESKTOP_WINDOW_MIN_SIZE, metrics, metrics.pathbarHeight);
    expect(
      withPath.h,
      `${name}: squashed to its floor, a section window still has to be able to draw its strip — ` +
        'an affordance that vanishes when a window is small is a bug, not a style',
    ).to.equal(bare.h + metrics.pathbarHeight);
  }
});

it("adds the active theme's chrome to the content size an app asked for", () => {
  for (const [name, metrics] of THEMES) {
    const window = windowSizeForContent({ w: 300, h: 200 }, metrics, 0);
    expect(
      window.w,
      `${name}: a window has to be the app's content box plus what this theme spends beside it, ` +
        'or the app is handed less room than it asked for and the overflow paints over the chrome',
    ).to.equal(300 + metrics.chromeWidth);
    expect(
      window.h,
      `${name}: the same on the vertical axis, which is where the titlebar is — this is the sum ` +
        'the first consumer had to guess at, and guessed 44px for five different titlebars',
    ).to.equal(200 + metrics.chromeHeight);
  }
});

/**
 * The point of the sum above is that it differs per theme, so this asserts that it does.
 *
 * Without it, every case in this file would still pass if `chromeHeight` were one number shared by
 * all five themes — which is precisely the defect being fixed, moved from the game into the host.
 */
it('spends a different amount of the window on chrome from one theme to the next', () => {
  const heights = new Set(THEMES.map(([, metrics]) => metrics.chromeHeight));
  expect(
    heights.size,
    'if every theme cost the same, an app could do this arithmetic itself and none of this would ' +
      'be the host\'s job. Win98 draws a 22px caption inside a 3px ring; the Umbraco theme draws ' +
      'a 40px one',
  ).to.be.greaterThan(1);
});

it('floors the window minimum at what the chrome itself needs, however little the app asked for', () => {
  for (const [name, metrics] of THEMES) {
    const min = minWindowSizeForContent(TINY, UMBRADESKTOP_WINDOW_MIN_SIZE, metrics, 0);
    const controls = metrics.leadingControlsWidth + metrics.trailingControlsWidth + metrics.grab;
    expect(
      min.w,
      `${name}: an app must not be able to shrink a window until a window control is off the end ` +
        'of its own titlebar. The floor is both control strips plus a graspable caption',
    ).to.be.at.least(controls);
    expect(
      min.h,
      `${name}: and never shorter than the chrome itself, or the titlebar — the only handle a ` +
        'window has — is the thing being clipped',
    ).to.be.at.least(metrics.chromeHeight);
  }
});

/**
 * The floor is a floor, not a replacement: an app asking for more than the chrome needs gets it.
 *
 * Worth its own case because `max` is easy to write the wrong way round, and the wrong way round
 * fails in the direction nothing notices — every window would open resizable down to the chrome's
 * own minimum and clip whatever the app said it needed.
 */
it('respects an app minimum that already clears the floor, chrome included', () => {
  for (const [name, metrics] of THEMES) {
    const content = { w: 900, h: 540 };
    const min = minWindowSizeForContent(content, UMBRADESKTOP_WINDOW_MIN_SIZE, metrics, 0);
    expect(min.w, `${name}: an app that needs 900px of content needs 900px plus the chrome`).to.equal(
      900 + metrics.chromeWidth,
    );
    expect(min.h, `${name}: and the same on the other axis`).to.equal(540 + metrics.chromeHeight);
  }
});

it("falls back to the desktop's own content minimum for an app that names none", () => {
  for (const [name, metrics] of THEMES) {
    const min = minWindowSizeForContent(undefined, UMBRADESKTOP_WINDOW_MIN_SIZE, metrics, 0);
    const expected = minWindowSizeForContent(UMBRADESKTOP_WINDOW_MIN_SIZE, UMBRADESKTOP_WINDOW_MIN_SIZE, metrics, 0);
    expect(min, `${name}: an app with no minSize is the global content minimum, not no minimum`).to.deep.equal(
      expected,
    );
  }
});

it('reports the chrome floor as both control strips and a graspable caption', () => {
  for (const [name, metrics] of THEMES) {
    expect(chromeMinWindowSize(metrics).w, `${name}: whichever end this theme puts its controls at`).to.equal(
      metrics.leadingControlsWidth + metrics.trailingControlsWidth + metrics.grab,
    );
    expect(chromeMinWindowSize(metrics).h, `${name}: and its own height, with no body at all`).to.equal(
      metrics.chromeHeight,
    );
  }
});

/**
 * And the rendered half: the window element has to actually write that floor into the inline
 * `min-width` it puts on the frame, because that inline style is what beat the chrome's own CSS
 * minimum and let a 282px game push the close button out of view.
 *
 * Mounted bare, with no theme context above it, so the metrics in force are
 * {@link UMBRADESKTOP_DEFAULT_METRICS} — the identity theme's, and the ones every window renders
 * with before a theme resolves. Appended by hand rather than through `fixture`, matching
 * `window-body.test.ts`: `fixture` awaits a `nextFrame()` that never resolves in the backgrounded
 * pages this runner uses.
 */
it('writes the chrome floor into the frame, not the tiny minimum the app declared', async () => {
  const app: UmbraDesktopApp = {
    alias: 'window-chrome-probe',
    name: 'Probe',
    icon: 'icon-umbraco',
    content: { kind: 'iframe', url: 'about:blank' },
    chromeProfile: 'bare',
    minSize: TINY,
  };
  const state: UmbraDesktopWindow = {
    id: 'w1',
    app,
    rect: { x: 0, y: 0, w: 640, h: 400 },
    z: 1,
    active: true,
    state: 'normal',
  };
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  element.window = state;
  document.body.appendChild(element);
  try {
    await element.updateComplete;
    const frame = element.shadowRoot!.querySelector('.frame') as HTMLElement;
    // What the element is expected to write: the same function, against the metrics in force here.
    // Asserted against the function rather than against a number, because the number is already
    // pinned per theme by the cases above and restating one here would be a third copy of it.
    const expected = minWindowSizeForContent(TINY, UMBRADESKTOP_WINDOW_MIN_SIZE, UMBRADESKTOP_DEFAULT_METRICS, 0);
    expect(
      parseFloat(frame.style.minWidth),
      'the inline min-width is the one that wins, so it is the one that has to hold the floor: ' +
        'an app asking for 1px must still leave its own titlebar controls a place to be',
    ).to.equal(expected.w);
    expect(parseFloat(frame.style.minHeight), 'and the same for the caption on the vertical axis').to.equal(
      expected.h,
    );
    // Which for the width is the chrome's floor doing the work, not the app's 1px: without this
    // the case above would still pass if the element wrote `chromeWidth + 1`.
    expect(
      expected.w,
      'the app declared 1px, so anything but the chrome floor here means the floor is not applied',
    ).to.equal(chromeMinWindowSize(UMBRADESKTOP_DEFAULT_METRICS).w);
  } finally {
    element.remove();
  }
});
