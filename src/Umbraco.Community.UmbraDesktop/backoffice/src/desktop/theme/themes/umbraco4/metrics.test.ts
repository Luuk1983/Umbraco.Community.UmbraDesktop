import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import '../../../components/taskbar.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp } from '../../../types.js';
import { UMBRADESKTOP_UMBRACO4_THEME } from './index.js';
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
 * other; it cannot make them consistent with what a browser actually paints, because the CSS
 * could always grow a margin nobody folded back into the sum. So these tests mount the real
 * chrome components with the real Umbraco 4 palette and stylesheets, measure the rendered boxes,
 * and hold the published metrics against them.
 *
 * Where Win98's counterpart sums computed styles, these measure **one span end to end** with
 * `getBoundingClientRect` — frame edge to control edge, frame top to header bottom. It is the
 * habit `docs/theming.md` §4 recommends, and it is what makes the test able to catch a box that
 * was never folded into the derivation in the first place: a border, a margin or a padding
 * nobody thought to add is inside the span whether or not anyone remembered it.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'umbraco4-metrics-probe',
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

  // One span, from the frame's outer right edge to the controls cluster's outer left edge, so the
  // frame's border and any inset on the cluster are inside the measurement whether or not the
  // derivation remembered them. Everything in this band is either outside `.titlebar`'s drag
  // handler or inside `.controls`, which stops a drag from starting.
  const rendered =
    frame.getBoundingClientRect().right - controls.getBoundingClientRect().left;

  expect(
    UMBRADESKTOP_UMBRACO4_THEME.metrics.trailingControlsWidth,
    'the published trailingControlsWidth disagrees with the width the theme paints. The drag ' +
      'clamp keeps `grab + trailing` px of a window on screen, so too small a value leaves less ' +
      'draggable titlebar than intended at the right edge and too large a one shoves the window ' +
      'back in — derive it from the same constants metrics.ts feeds to the palette and the sheet',
  ).to.equal(rendered);
});

it('reports the titlebar height a window actually paints, frame border included', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const titlebar = win.root.querySelector('.titlebar') as HTMLElement;
  expect(titlebar, 'the window should render a titlebar').to.not.equal(null);

  // `metrics.titlebarHeight` is what stays on screen when a window is dragged off the bottom
  // edge, measured from the window's own top — so the span runs from the frame's outer top edge
  // to the header's bottom, covering the frame's border and the header's own hairline. Miss
  // either and the last rows of the only grab handle a window has go under the taskbar with it.
  const rendered =
    titlebar.getBoundingClientRect().bottom - frame.getBoundingClientRect().top;

  expect(
    UMBRADESKTOP_UMBRACO4_THEME.metrics.titlebarHeight,
    'the published titlebarHeight disagrees with the header the theme paints, so a window ' +
      'dragged against the bottom edge keeps the wrong amount of itself grabbable',
  ).to.equal(rendered);
});

it('reserves exactly the height of the bar it paints at the bottom edge', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const rendered = bar.root.querySelector('.bar') as HTMLElement;
  expect(rendered, 'the taskbar should render its bar').to.not.equal(null);

  // The bar is flush with the bottom edge with no margin under it, so its own border box is the
  // whole reserve. A theme that floated its bar would have to add the gap beneath it here.
  expect(
    UMBRADESKTOP_UMBRACO4_THEME.metrics.taskbarReserve,
    'the published taskbarReserve disagrees with the bar the theme paints. Windows would either ' +
      'be clamped short of the bar or be allowed to slide underneath it',
  ).to.equal(rendered.getBoundingClientRect().height);
});

it('keeps the whole titlebar draggable at its leading end', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const title = win.root.querySelector('.title') as HTMLElement;
  expect(title, 'the window should render a title').to.not.equal(null);

  // Unlike macOS, this theme leaves the leading end to the title, so `leadingControlsWidth` is 0
  // and the drag clamp reserves nothing there. Guarded rather than assumed: moving the controls
  // to the left — the one change that would make this wrong — is exactly the kind of edit that
  // looks purely cosmetic and silently strands windows against the left edge.
  expect(
    UMBRADESKTOP_UMBRACO4_THEME.metrics.leadingControlsWidth,
    'leadingControlsWidth should stay 0 while the controls sit at the trailing end',
  ).to.equal(0);
  expect(
    title.getBoundingClientRect().left,
    'the title should start within a few px of the frame, with no control cluster before it',
  ).to.be.closeTo(frame.getBoundingClientRect().left, 16);
});
