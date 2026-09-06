import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import '../../../components/taskbar.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp } from '../../../types.js';
import { UMBRADESKTOP_WIN11_THEME } from './index.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';

/**
 * `metrics` is the one thing a theme publishes that JavaScript acts on rather than paints: the
 * window manager clamps a drag against it, so a number that disagrees with the CSS it describes
 * strands windows out of reach at the screen edges instead of merely looking wrong.
 *
 * Deriving the numbers from shared constants makes them consistent with each other; it cannot
 * make them consistent with what a browser paints. So these mount the real chrome with the real
 * Windows 11 palette and stylesheets, measure the rendered boxes, and hold the published metrics
 * against them — one span end to end rather than a sum of parts, so a box nobody folded into the
 * derivation cannot hide from the test either. On the Umbraco 4 theme that habit caught two.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'win11-metrics-probe',
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

it('reserves exactly the trailing strip of caption its window controls actually occupy', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const controls = win.root.querySelector('.controls') as HTMLElement;
  expect(frame, 'the window should render a frame').to.not.equal(null);
  expect(controls, 'the window should render its controls').to.not.equal(null);

  const rendered = frame.getBoundingClientRect().right - controls.getBoundingClientRect().left;

  expect(
    UMBRADESKTOP_WIN11_THEME.metrics.trailingControlsWidth,
    'the published trailingControlsWidth disagrees with the width the theme paints. The drag ' +
      'clamp keeps `grab + trailing` px of a window on screen, so too small a value leaves less ' +
      'draggable caption than intended at the right edge and too large a one shoves the window ' +
      'back in',
  ).to.equal(rendered);
});

it('reports the caption height a window actually paints, frame border included', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const titlebar = win.root.querySelector('.titlebar') as HTMLElement;
  expect(titlebar, 'the window should render a titlebar').to.not.equal(null);

  const rendered = titlebar.getBoundingClientRect().bottom - frame.getBoundingClientRect().top;

  expect(
    UMBRADESKTOP_WIN11_THEME.metrics.titlebarHeight,
    'the published titlebarHeight disagrees with the caption the theme paints, so a window ' +
      'dragged against the bottom edge keeps the wrong amount of itself grabbable',
  ).to.equal(rendered);
});

it('draws no hairline under the caption, which is what W11_TITLEBAR_BORDER claims', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const titlebar = win.root.querySelector('.titlebar') as HTMLElement;

  // W11_TITLEBAR_BORDER is 0 and is a term in titlebarHeight, so a divider creeping back in would
  // make the published caption height a pixel short. It is also the single clearest tell that a
  // window is not Windows 11: its title area is the same unbroken plane as the body below it.
  expect(
    parseFloat(getComputedStyle(titlebar).borderBottomWidth),
    'Windows 11 draws no divider under the caption, and titlebarHeight is derived assuming none',
  ).to.equal(0);
});

it('reserves exactly the height of the bar it paints at the bottom edge', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const rendered = bar.root.querySelector('.bar') as HTMLElement;
  expect(rendered, 'the taskbar should render its bar').to.not.equal(null);

  // Flush and full width, with no margin under it, so the bar's own border box is the whole
  // reserve — unlike the macOS dock, which has to add its bottom margin and clearance.
  expect(
    UMBRADESKTOP_WIN11_THEME.metrics.taskbarReserve,
    'the published taskbarReserve disagrees with the bar the theme paints. Windows would either ' +
      'be clamped short of the bar or be allowed to slide underneath it',
  ).to.equal(rendered.getBoundingClientRect().height);
});
