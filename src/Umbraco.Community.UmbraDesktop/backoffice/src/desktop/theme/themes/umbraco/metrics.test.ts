import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp } from '../../../types.js';
import { UMBRADESKTOP_UMBRACO_THEME } from './index.js';
// The probe rectangle and the chrome-cost measurement are the shared ones, so the numbers are
// comparable with the other four themes'; the mount is this theme's own binding, which also puts
// the backoffice's tokens on the page.
import { measureChromeCost, UMBRADESKTOP_PROBE_WINDOW_RECT } from '../mount-themed.js';
import { mountThemed } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';

/**
 * The Umbraco theme's `metrics` are the base chrome's own, and the theme now restyles that chrome
 * with a palette and two sheets. So this file holds the one promise that makes the restyle safe:
 * **nothing the window manager clamps against moved.** The caption is still 40px, the buttons are
 * still 46px wide, the frame ring is still 1px, and what the chrome costs an app is unchanged. A
 * rounder corner, a navy bar and a circle painted behind a button are all paint.
 *
 * It matters more here than for the other themes, because this is the default: a metric that
 * drifts is wrong for every user who has never opened the settings panel, which is exactly how the
 * trailing strip came to describe three buttons for as long as there have been four.
 *
 * So this does for the Umbraco theme what `themes/win98/metrics.test.ts` does for Win98: mount the
 * real window **with the theme's own palette and stylesheet in force**, measure the boxes the
 * browser actually paints, and hold the published metrics against them. Measuring the bare base, as
 * this file did while the theme had nothing of its own, would pass for a window nobody sees.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'umbraco-metrics-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
};

/**
 * How long the shared mount may take, well above Mocha's 5s default: a full-suite run has two
 * dozen pages competing for one browser, and mounting a chrome component drags in several Umbraco
 * contexts that never resolve outside a desktop.
 *
 * Set on the `before` hook alone, which covers this file because the hook is the only slow part of
 * it — the tests themselves read layout off an already-mounted window and nothing else. A
 * `this.timeout()` here applies to the hook's own runnable and does not reach the tests, so if
 * these ever start failing as bare timeouts, raise it inside each test body as
 * `themes/win98/metrics.test.ts` does rather than assuming this line already covers them.
 */
const MOUNT_TIMEOUT_MS = 20_000;

/** The themed window under test, mounted once for the whole file. */
let mounted: UmbraDesktopThemedMount<UmbraDesktopWindowElement>;

/** The window's shadow root, where the chrome's own DOM lives. */
let root: ShadowRoot;

before(async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  mounted = await mountThemed<UmbraDesktopWindowElement>('umbradesktop-window', 'window');
  mounted.element.window = {
    id: 'w1',
    app: PROBE_APP,
    rect: UMBRADESKTOP_PROBE_WINDOW_RECT,
    z: 1,
    active: true,
    state: 'normal',
  };
  await mounted.element.updateComplete;
  root = mounted.root;
});

after(() => mounted?.dispose());

it('reserves exactly the trailing strip of titlebar its window controls actually occupy', () => {
  const frame = root.querySelector('.frame') as HTMLElement;
  const controls = root.querySelector('.controls') as HTMLElement;
  expect(frame, 'the window should render a frame').to.not.equal(null);
  expect(controls, 'the window should render its controls').to.not.equal(null);

  // Measured as the clamp defines it, rather than summed from parts: a window's `rect.x` places
  // the frame's border box, so the dead band is the distance from that box's right edge inwards
  // to where `.controls` begins. Everything in between — the frame's border, any padding a theme
  // adds, the cluster itself — is either outside `.titlebar`'s drag handler or inside `.controls`,
  // which stops a drag from starting. Taking one span means a margin nobody folded back into the
  // sum cannot hide from this test.
  const rendered = frame.getBoundingClientRect().right - controls.getBoundingClientRect().left;

  expect(
    UMBRADESKTOP_UMBRACO_THEME.metrics.trailingControlsWidth,
    'the published trailingControlsWidth disagrees with the width the chrome paints. The drag ' +
      'clamp keeps `grab + trailing` px of a window on screen, so too small a value leaves less ' +
      'draggable titlebar than intended at the right edge and too large a one shoves the window ' +
      'back in — derive it from the same constants window.element interpolates',
  ).to.equal(rendered);
});

/**
 * What the base chrome costs an app, which is the number every app gets before a theme resolves
 * and the one the app-token fallbacks are written against.
 *
 * Zero horizontally, and that is a fact about `box-sizing` rather than about this theme having no
 * frame: `.frame` sizes content-box, so its 1px ring is painted *outside* the width the window
 * manager set and takes nothing from the app. Win98's ring is inside its rect, which is exactly
 * why this is a per-theme metric and not one number in the chrome.
 */
it('reports what the base chrome costs an app, so no app has to guess', () => {
  const cost = measureChromeCost(root, UMBRADESKTOP_PROBE_WINDOW_RECT);

  expect(
    UMBRADESKTOP_UMBRACO_THEME.metrics.chromeWidth,
    'the published chromeWidth disagrees with what the base chrome takes out of a window ' +
      'horizontally, so every registered app opens that much narrower or wider than it asked for',
  ).to.equal(cost.w);
  expect(
    UMBRADESKTOP_UMBRACO_THEME.metrics.chromeHeight,
    'and the same vertically, where the caption and its hairline are: an app asking for a 460px ' +
      'content box has to get one, and the host is the only party that knows what this costs',
  ).to.equal(cost.h);
});

it('reports the titlebar height a window actually paints, frame border included', () => {
  const frame = root.querySelector('.frame') as HTMLElement;
  const titlebar = root.querySelector('.titlebar') as HTMLElement;

  // `metrics.titlebarHeight` is what stays on screen when a window is dragged off the bottom
  // edge, measured from the window's own top — so it has to cover the frame's top border as well
  // as the caption, or the last few pixels of the caption go under the taskbar with it. The
  // caption's own bottom border counts: it is part of `.titlebar`, and so part of the drag handle.
  const rendered = titlebar.getBoundingClientRect().bottom - frame.getBoundingClientRect().top;

  expect(
    UMBRADESKTOP_UMBRACO_THEME.metrics.titlebarHeight,
    'the published titlebarHeight disagrees with the caption the chrome paints, so a window ' +
      'dragged against the bottom edge keeps the wrong amount of itself grabbable',
  ).to.equal(rendered);
});
