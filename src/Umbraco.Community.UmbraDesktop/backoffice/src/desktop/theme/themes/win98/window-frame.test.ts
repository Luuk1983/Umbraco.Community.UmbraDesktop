import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopAppHostElement } from '../../../components/app-host.element.js';
import type { UmbraDesktopApp, Rect } from '../../../types.js';
import { windowSizeForContent } from '../../../window-chrome.js';
import { UMBRADESKTOP_WIN98_THEME } from './index.js';
import { WIN98_FRAME_BORDER } from './metrics.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';

/**
 * Windows 98 is the theme that catches window sizing being wrong, because it is the only one whose
 * frame spends pixels at the **bottom** as well as the top: a 3px raised bevel all the way round,
 * painted into the frame's own padding and sized `border-box` so the room comes out of the window's
 * rect rather than growing it.
 *
 * Two independent failures land on that bevel, and both were reported from the same screenshot:
 *
 * 1. A window opened at the app's *content* size rather than content plus chrome hands the app 32px
 *    less height than it asked for under this theme, so the app's own last row is where the bevel
 *    should be. The other four themes spend nothing at the bottom, which is why an app author's
 *    "tallest titlebar of the five" guess looked right everywhere else.
 * 2. Whatever the sizing says, a body that overflows must not be able to displace the ring. The
 *    frame is a column flex container and `.bodywrap` is a flex item, so its `min-height: auto`
 *    let it grow to its content and paint straight over the bevel — an affordance disappearing
 *    because of what was inside the window, which is a bug and not a style.
 *
 * The second case is the one that has to be measured rather than reasoned about, so it is driven by
 * forcing the window smaller than its app: `getBoundingClientRect` reports layout boxes and not
 * painted ones, so the assertion is on where `.bodywrap` *ends*, which is the box that used to run
 * past the frame.
 */

/** The content box the probe app occupies, in px. Arbitrary, and small enough to size a test window. */
const PROBE_CONTENT = { w: 200, h: 120 };

/**
 * A self-contained app of a known, fixed size — the shape of a game rather than of a document: it
 * does not reflow, so a window too small for it is a window that clips it.
 */
class Win98FrameProbeApp extends HTMLElement {
  /** Renders one box of exactly {@link PROBE_CONTENT}, into light DOM so a test can measure it. */
  connectedCallback() {
    this.style.display = 'block';
    const box = document.createElement('div');
    box.className = 'probe-box';
    box.style.width = `${PROBE_CONTENT.w}px`;
    box.style.height = `${PROBE_CONTENT.h}px`;
    this.appendChild(box);
  }
}
customElements.define('umbradesktop-win98-frame-probe', Win98FrameProbeApp);

/** The app record, declaring {@link PROBE_CONTENT} as its content size the way a manifest does. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'win98-frame-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  content: { kind: 'element', element: async () => ({ element: Win98FrameProbeApp }) },
  chromeProfile: 'bare',
  defaultSize: PROBE_CONTENT,
  minSize: PROBE_CONTENT,
};

/**
 * The window the app opens at: its content size plus what this theme's chrome costs.
 *
 * No path strip in the sum, and that is the probe's own case rather than an omission: it is an
 * element app, and only a `full-section` iframe window draws one.
 */
const OPENING_RECT: Rect = {
  x: 0,
  y: 0,
  ...windowSizeForContent(PROBE_CONTENT, UMBRADESKTOP_WIN98_THEME.metrics, 0),
};

/** The themed window under test, mounted once for the whole file. */
let win: UmbraDesktopThemedMount<UmbraDesktopWindowElement>;

/**
 * Put the window at a rectangle and let both it and its app host settle.
 * @param rect The window rectangle to render at.
 */
async function sizeTo(rect: Rect): Promise<void> {
  win.element.window = { id: 'w1', app: PROBE_APP, rect, z: 1, active: true, state: 'normal' };
  await win.element.updateComplete;
  const host = win.root.querySelector('umbradesktop-app-host') as UmbraDesktopAppHostElement | null;
  if (host) await host.mountComplete;
  await win.element.updateComplete;
}

/** The frame and the body wrapper, which is the box the ring has to survive. */
function boxes(): { frame: DOMRect; bodywrap: DOMRect; body: DOMRect } {
  const frame = win.root.querySelector('.frame') as HTMLElement;
  const bodywrap = win.root.querySelector('.bodywrap') as HTMLElement;
  const body = win.root.querySelector('.body') as HTMLElement;
  expect(frame, 'the window should render a frame').to.not.equal(null);
  expect(bodywrap, 'the window should render a body wrapper').to.not.equal(null);
  expect(body, 'the window should render a body').to.not.equal(null);
  return {
    frame: frame.getBoundingClientRect(),
    bodywrap: bodywrap.getBoundingClientRect(),
    body: body.getBoundingClientRect(),
  };
}

/**
 * Assert the frame's bevel is still there on all four sides.
 * @param why What the caller was doing when it should have survived.
 */
function expectRingIntact(why: string): void {
  const { frame, bodywrap } = boxes();
  const gaps = [
    ['left', bodywrap.left - frame.left],
    ['right', frame.right - bodywrap.right],
    ['top', bodywrap.top - frame.top],
    ['bottom', frame.bottom - bodywrap.bottom],
  ] as const;
  for (const [side, gap] of gaps) {
    expect(
      gap,
      `${why}: the Win98 frame's ${side} bevel is ${gap}px from the frame edge instead of at ` +
        `least ${WIN98_FRAME_BORDER}px, so the body is painting over it. The ring is the whole of ` +
        'this window edge; content is never allowed to displace it',
    ).to.be.at.least(WIN98_FRAME_BORDER);
  }
}

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  win = await mountThemed<UmbraDesktopWindowElement>('umbradesktop-window', 'window');
  await sizeTo(OPENING_RECT);
});

after(() => win?.dispose());

it('gives an app its whole content box at the size it opens at, ring included', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  await sizeTo(OPENING_RECT);
  const { body } = boxes();
  expect(
    body.width,
    'the app declared a content size and the host is what knows the chrome, so the window it ' +
      'opened at has to leave the app all of it — this theme spends 3px of ring and a 2px sunken ' +
      'well on each side, none of which an app in another package can read',
  ).to.be.at.least(PROBE_CONTENT.w);
  expect(
    body.height,
    'and on the axis with the caption on it, where a ring at the top *and* the bottom is what no ' +
      "app's titlebar allowance ever guessed",
  ).to.be.at.least(PROBE_CONTENT.h);
  expectRingIntact('at the size the app opens at');
});

it('keeps the frame ring even when the body overflows the window', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  try {
    // Deliberately shorter than the app needs, which the resize floor now forbids a user from
    // reaching — but a stored rectangle from an older release, or a desktop too small to hold the
    // window, both arrive here. The ring is not allowed to depend on the sizing being right.
    await sizeTo({ ...OPENING_RECT, h: Math.round(PROBE_CONTENT.h / 2) });
    expectRingIntact('with a body taller than the window');
  } finally {
    await sizeTo(OPENING_RECT);
  }
});
