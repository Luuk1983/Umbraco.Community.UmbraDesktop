import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import '../../../components/taskbar.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp } from '../../../types.js';
import { UMBRADESKTOP_WIN98_THEME } from './index.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';

/**
 * `metrics` is the one thing a theme publishes that JavaScript acts on rather than paints: the
 * window manager clamps a drag against it, so a number that disagrees with the CSS it describes
 * strands windows out of reach at the screen edges instead of merely looking wrong. That is not a
 * hypothetical — the macOS theme shipped a hand-computed `leadingControlsWidth` of 124 describing
 * CSS that rendered 102.
 *
 * Deriving the numbers from shared constants (see `metrics.ts`) makes them consistent with each
 * other; it cannot make them consistent with what a browser actually paints, because the CSS could
 * always grow a margin nobody folded back into the sum. So these tests mount the real chrome
 * components with the real Win98 palette and stylesheets, measure the rendered boxes, and hold the
 * published metrics against them.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'win98-metrics-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  url: 'about:blank',
  chromeProfile: 'bare',
};

/** The themed window under test, mounted once for the whole file. */
let win: UmbraDesktopThemedMount<UmbraDesktopWindowElement>;

/** The themed taskbar under test, mounted once for the whole file. */
let bar: UmbraDesktopThemedMount<HTMLElement & { updateComplete: Promise<unknown> }>;

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

  bar = await mountThemed('umbradesktop-taskbar', 'taskbar');
});

after(() => {
  win?.dispose();
  bar?.dispose();
});

it('reserves exactly the trailing strip of titlebar its window controls actually occupy', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const controls = win.root.querySelector('.controls') as HTMLElement;
  expect(frame, 'the window should render a frame').to.not.equal(null);
  expect(controls, 'the window should render its controls').to.not.equal(null);

  // The dead band at the trailing end, measured rather than assumed: the frame's own border ring,
  // the controls cluster, and the inset holding it off the frame. Everything in it is either
  // outside `.titlebar`'s drag handler or inside `.controls`, which stops a drag from starting.
  const framePadding = parseFloat(getComputedStyle(frame).paddingRight);
  const controlsInset = parseFloat(getComputedStyle(controls).marginRight);
  const rendered = framePadding + controls.offsetWidth + controlsInset;

  expect(
    UMBRADESKTOP_WIN98_THEME.metrics.trailingControlsWidth,
    'the published trailingControlsWidth disagrees with the width the theme paints. The drag ' +
      'clamp keeps `grab + trailing` px of a window on screen, so too small a value leaves less ' +
      'draggable titlebar than intended at the right edge and too large a one shoves the window ' +
      'back in — derive it from the same constants window.css.ts interpolates',
  ).to.equal(rendered);
});

it('reports the titlebar height a window actually paints, frame border included', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const titlebar = win.root.querySelector('.titlebar') as HTMLElement;

  // `metrics.titlebarHeight` is what stays on screen when a window is dragged off the bottom
  // edge, measured from the window's own top — so it has to cover the frame's top border as well
  // as the caption, or the last few pixels of the caption go under the taskbar with it.
  const rendered = parseFloat(getComputedStyle(frame).paddingTop) + titlebar.offsetHeight;

  expect(
    UMBRADESKTOP_WIN98_THEME.metrics.titlebarHeight,
    'the published titlebarHeight disagrees with the caption the theme paints, so a window ' +
      'dragged against the bottom edge keeps the wrong amount of itself grabbable',
  ).to.equal(rendered);
});

it('reserves exactly the height of the bar it paints at the bottom edge', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const rendered = bar.root.querySelector('.bar') as HTMLElement;
  expect(rendered, 'the taskbar should render its bar').to.not.equal(null);

  expect(
    UMBRADESKTOP_WIN98_THEME.metrics.taskbarReserve,
    'the published taskbarReserve disagrees with the bar the theme paints. Windows would either ' +
      'be clamped short of the bar or be allowed to slide underneath it',
  ).to.equal(rendered.offsetHeight);
});
