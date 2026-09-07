import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UMBRADESKTOP_CONTROL_WIDTH, UMBRADESKTOP_DEFAULT_METRICS, UMBRADESKTOP_WINDOW_MIN_SIZE } from '../constants.js';
import { chromeMinWindowSize } from '../window-chrome.js';

/**
 * The titlebar's affordances at the narrowest window the desktop allows.
 *
 * This is the case D19 believed it had closed and had not. That decision made the resize floor
 * `max(app content + chrome, leading + trailing + grab)` so that an app could no longer declare a
 * window too small to draw the chrome in, and `window-chrome.test.ts` holds the arithmetic. But
 * arithmetic is a claim about a layout, and the layout did not honour it: the caption is a flex
 * item whose `min-width` is `auto`, so a one-word title held the row open at its natural width and
 * pushed the controls past the frame's right edge. At the 274px window a nine-by-nine Minesweeper
 * asks for, 37px of the 46px close button was outside the frame — reported from a browser, twice,
 * the second time after the floor was supposed to have fixed it.
 *
 * So this file measures rather than computes, and it is the only test here that does: every other
 * check of this geometry either reads a published number or renders a window big enough that no
 * minimum is in force, which is exactly how a wrong minimum stays green.
 *
 * Mounted under no theme at all, deliberately. The base chrome's control width is
 * {@link UMBRADESKTOP_CONTROL_WIDTH}, which the Windows 11 theme reuses unchanged — 46x32 being
 * that operating system's own button — so the base case is the reported case, and the four themes
 * that do resize their controls resize `trailingControlsWidth` with them, which is the term the
 * floor is derived from.
 */

/** How long a rendered-geometry case may take, well above Mocha's 5s: see `mount-themed.ts`. */
const TIMEOUT_MS = 20_000;

/**
 * A caption no narrow titlebar can fit, so a passing run proves the text yielded rather than that
 * it happened to be short. Real app names get nowhere near this; `Minesweeper` alone was enough to
 * push the close button off.
 */
const LONG_TITLE = 'Minesweeper, Solitaire and Several Other Diversions';

/**
 * Mount a window at an exact rect with an app that declares a tiny content minimum.
 *
 * The declared minimum matters as much as the rect: without one the window element floors itself at
 * {@link UMBRADESKTOP_WINDOW_MIN_SIZE}, which is wider than the chrome's own minimum, and the inline
 * `min-width` would clamp the frame back up and quietly make this test a test of a 320px window.
 * An app asking for less than the chrome needs is also the real case — Minesweeper's 274px is one —
 * and the floor is what turns it into the chrome's minimum instead.
 *
 * Appended by hand rather than through `fixture`, matching the other component tests: `fixture`
 * awaits a `nextFrame()` that never resolves in the backgrounded pages this runner uses when it has
 * several files in flight.
 * @param w The window width to render at.
 * @returns The mounted window, its shadow root, and a teardown.
 */
async function mountAt(w: number) {
  const app: UmbraDesktopApp = {
    alias: 'probe',
    name: LONG_TITLE,
    icon: 'icon-umbraco',
    content: { kind: 'iframe', url: 'about:blank' },
    chromeProfile: 'bare',
    // Below anything the chrome needs, so the floor below is the chrome's own minimum and not this
    // app's. Without it the window element falls back to UMBRADESKTOP_WINDOW_MIN_SIZE, whose 320px
    // is wider than the floor and would clamp the frame back up: the case would then quietly
    // measure a 320px window and stop being about the minimum at all.
    minSize: { w: 1, h: 1 },
  };
  const state: UmbraDesktopWindow = {
    id: 'w1',
    app,
    rect: { x: 0, y: 0, w, h: 240 },
    z: 1,
    active: true,
    state: 'normal',
  };
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  element.window = state;
  document.body.appendChild(element);
  await element.updateComplete;
  return { element, root: element.shadowRoot!, dispose: () => element.remove() };
}

it('keeps every window control whole at the narrowest window the chrome allows', async function () {
  this.timeout(TIMEOUT_MS);
  const floor = chromeMinWindowSize(UMBRADESKTOP_DEFAULT_METRICS);
  const { root, dispose } = await mountAt(floor.w);
  try {
    const frame = (root.querySelector('.frame') as HTMLElement).getBoundingClientRect();
    const controls = [...root.querySelectorAll<HTMLElement>('.ctrl')];

    expect(controls.length, 'the titlebar should still draw all four controls').to.equal(4);

    for (const control of controls) {
      const box = control.getBoundingClientRect();
      const label = control.getAttribute('label') ?? control.title ?? 'a control';
      expect(
        box.right - frame.right,
        `${label} runs past the frame's right edge, so the window clips it. This is the reported ` +
          'bug: a caption that would not shrink pushed the controls out of a window whose own ' +
          'minimum was supposed to guarantee room for them',
      ).to.be.at.most(0);
      expect(
        box.width,
        `${label} is narrower than the control width the chrome publishes, so the buttons absorbed ` +
          'the shortfall instead of the caption. trailingControlsWidth is derived from that width ' +
          'and would be a fiction',
      ).to.equal(UMBRADESKTOP_CONTROL_WIDTH);
    }
  } finally {
    dispose();
  }
});

it('truncates the caption to make that room, rather than fitting by luck', async function () {
  this.timeout(TIMEOUT_MS);
  const floor = chromeMinWindowSize(UMBRADESKTOP_DEFAULT_METRICS);
  const { root, dispose } = await mountAt(floor.w);
  try {
    const text = root.querySelector('.title-text') as HTMLElement;
    // The evidence that the shrink happened at all. Without it the case above could pass on a
    // titlebar that simply had room, and the next person to shorten LONG_TITLE would retire the
    // whole file without a failure to warn them.
    expect(
      text.scrollWidth,
      'the caption should be ellipsised at this width — if it fits, this file is no longer ' +
        'testing anything and LONG_TITLE needs to be longer than the titlebar again',
    ).to.be.greaterThan(text.clientWidth);
    expect(
      getComputedStyle(text).textOverflow,
      'and it should end in an ellipsis rather than being cut mid-glyph',
    ).to.equal('ellipsis');
  } finally {
    dispose();
  }
});

it('gives the caption the whole titlebar when the window is wide enough for it', async function () {
  this.timeout(TIMEOUT_MS);
  const { root, dispose } = await mountAt(900);
  try {
    const text = root.querySelector('.title-text') as HTMLElement;
    expect(
      text.scrollWidth,
      'nothing above should cost a wide window its full caption: min-width: 0 lets the title ' +
        'shrink when it must, and must not shrink it when it need not',
    ).to.be.at.most(text.clientWidth);
  } finally {
    dispose();
  }
});
