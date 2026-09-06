import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import '../../../components/taskbar.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp } from '../../../types.js';
import { mountThemedWith, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from '../mount-themed.js';
import type { UmbraDesktopThemedMount, UmbraDesktopUpdatable } from '../mount-themed.js';
import { UMBRADESKTOP_MACOS_THEME } from './index.js';
import { MACOS_TASKBAR_CLEARANCE } from './metrics.js';
import { MACOS_LIGHT } from './palette.js';

/**
 * macOS is the theme the cautionary tale is about: `leadingControlsWidth` shipped as a
 * hand-computed `124` describing CSS that rendered `102`, and a window dragged into a corner
 * became unreachable. That was fixed by deriving the number in `metrics.ts` from the constants
 * `window.css.ts` interpolates — which makes the sum consistent with itself, and says nothing
 * about whether the sum covers every box the browser actually paints.
 *
 * It is also the only theme whose controls **lead** the titlebar, so it is the only one where the
 * clamp's `hi` limit (`bounds.w - grab - leading`) is governed by a non-zero number: a wrong value
 * here strands a window at the *right* edge, where nothing else in the suite would notice.
 *
 * So these tests do what `themes/win98/metrics.test.ts` does — mount the real chrome with the real
 * palette and stylesheets, measure the rendered boxes, hold the published metrics against them.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'macos-metrics-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  url: 'about:blank',
  chromeProfile: 'bare',
};

/** The themed window under test, mounted once for the whole file. */
let win: UmbraDesktopThemedMount<UmbraDesktopWindowElement>;

/** The themed dock under test, mounted once for the whole file. */
let bar: UmbraDesktopThemedMount<UmbraDesktopUpdatable>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  win = await mountThemedWith<UmbraDesktopWindowElement>(
    UMBRADESKTOP_MACOS_THEME,
    MACOS_LIGHT,
    'umbradesktop-window',
    'window',
  );
  win.element.window = {
    id: 'w1',
    app: PROBE_APP,
    rect: { x: 0, y: 0, w: 640, h: 400 },
    z: 1,
    active: true,
    state: 'normal',
  };
  await win.element.updateComplete;

  bar = await mountThemedWith(UMBRADESKTOP_MACOS_THEME, MACOS_LIGHT, 'umbradesktop-taskbar', 'taskbar');
});

after(() => {
  win?.dispose();
  bar?.dispose();
});

it('reserves exactly the leading strip of titlebar its window controls actually occupy', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const controls = win.root.querySelector('.controls') as HTMLElement;
  expect(frame, 'the window should render a frame').to.not.equal(null);
  expect(controls, 'the window should render its controls').to.not.equal(null);

  // Measured as the clamp defines it: a window's `rect.x` places the frame's border box, so the
  // dead band is the span from that box's left edge out to where `.controls` ends — the frame's
  // border, the titlebar's leading padding and the cluster itself, in one measurement rather than
  // a sum a new margin could slip out of.
  //
  // `.controls`' own box is the right thing to measure even though the traffic lights grow their
  // hit targets with a transparent `::after`. Those overlays are deliberately kept inside this
  // strip — reload's stretches left into its own margin, never right — so the box and the target
  // end at the same place, and `getBoundingClientRect` reads the box, not the pseudo-element.
  const rendered = controls.getBoundingClientRect().right - frame.getBoundingClientRect().left;

  expect(
    UMBRADESKTOP_MACOS_THEME.metrics.leadingControlsWidth,
    'the published leadingControlsWidth disagrees with the width the theme paints. The clamp puts ' +
      'the right-edge limit at `bounds.w - grab - leading`, so too small a value leaves less ' +
      'draggable titlebar than intended there — derive it from the same constants window.css.ts ' +
      'interpolates',
  ).to.equal(rendered);
});

it('reports the titlebar height a window actually paints, frame border included', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const titlebar = win.root.querySelector('.titlebar') as HTMLElement;

  // `metrics.titlebarHeight` is what stays on screen when a window is dragged off the bottom
  // edge, measured from the window's own top — so it has to cover the frame's top border as well
  // as the caption and the caption's own bottom hairline, both of which this theme paints, or the
  // last few pixels of the only grab handle a window has go under the dock with it.
  const rendered = titlebar.getBoundingClientRect().bottom - frame.getBoundingClientRect().top;

  expect(
    UMBRADESKTOP_MACOS_THEME.metrics.titlebarHeight,
    'the published titlebarHeight disagrees with the caption the theme paints, so a window ' +
      'dragged against the bottom edge keeps the wrong amount of itself grabbable',
  ).to.equal(rendered);
});

it('reserves the dock it paints, plus the clearance it declares above it', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const dock = bar.root.querySelector('.bar') as HTMLElement;
  expect(dock, 'the taskbar should render its bar').to.not.equal(null);

  // Unlike Win98's flush bar, this dock floats: what it takes out of the desktop's bottom edge is
  // its own box plus the margin lifting it clear, and `taskbarReserve` is that plus a declared
  // buffer. The buffer is the one term with no rendered counterpart — it is a design decision, not
  // a measurement — so it is added here rather than measured, which is also what keeps this test
  // honest about the two terms that *are* rendered.
  const occupied = dock.offsetHeight + parseFloat(getComputedStyle(dock).marginBottom);

  expect(
    UMBRADESKTOP_MACOS_THEME.metrics.taskbarReserve,
    'the published taskbarReserve disagrees with the dock the theme paints. Too little and ' +
      'windows clamp underneath it; too much and the desktop loses usable height for nothing',
  ).to.equal(occupied + MACOS_TASKBAR_CLEARANCE);
});
