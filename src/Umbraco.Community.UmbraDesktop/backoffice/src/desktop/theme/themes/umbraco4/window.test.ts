import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../../../types.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import { U4_CONTROL_GAP } from './metrics.js';

/**
 * Umbraco 4 never shipped a modal with a titlebar, so the window frame is the surface furthest
 * from a real source: it is adapted from the content pane's header row, which is the only piece
 * of v4 that was a title strip sitting above content with controls beside it.
 *
 * Two decisions here are load-bearing enough to hold in a test.
 *
 * An inactive window is marked by **recolouring** its header, not by fading it. The base fades
 * the title and controls to 0.5 through `--umbradesktop-titlebar-inactive-opacity`, which this
 * theme pins to 1 in the palette so the sheet can state the two treatments instead. The point is
 * not fidelity — it is that a faded control still has to be clickable, and half-opacity buttons
 * on a light grey header read as disabled.
 *
 * And reload is separated from the minimize/maximize/close trio. Nothing in a 2009 web backoffice
 * had a reload control, so it should not read as a fourth window button; the gap that separates
 * it is also a term in `trailingControlsWidth`, so it is geometry rather than decoration and
 * `metrics.test.ts` measures the band it belongs to.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'umbraco4-window-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  url: 'about:blank',
  chromeProfile: 'bare',
};

/** The window state the probe renders from, reused for both the active and inactive assertions. */
const PROBE_WINDOW: UmbraDesktopWindow = {
  id: 'w1',
  app: PROBE_APP,
  rect: { x: 0, y: 0, w: 640, h: 400 },
  z: 1,
  active: true,
  state: 'normal',
};

/** The themed window under test, mounted once for the whole file. */
let win: UmbraDesktopThemedMount<UmbraDesktopWindowElement>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  win = await mountThemed<UmbraDesktopWindowElement>('umbradesktop-window', 'window');
  win.element.window = PROBE_WINDOW;
  await win.element.updateComplete;
});

after(() => win?.dispose());

it('draws the header as a raised v4 pane header', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const titlebar = win.root.querySelector('.titlebar') as HTMLElement;
  expect(titlebar, 'the window should render a titlebar').to.not.equal(null);

  const style = getComputedStyle(titlebar);
  expect(style.backgroundImage, 'the header is a gradient, not a flat fill').to.contain(
    'linear-gradient',
  );
  expect(style.borderBottomStyle, 'a v4 pane header sits on a hairline').to.equal('solid');
});

it('separates reload from the window buttons it is not one of', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const reload = win.root.querySelector('.ctrl-reload') as HTMLElement;
  const minimize = win.root.querySelector('.ctrl-minimize') as HTMLElement;
  expect(reload, 'the window should render a reload control').to.not.equal(null);
  expect(minimize, 'the window should render a minimize control').to.not.equal(null);

  // Measured as a real gap between the two boxes rather than read off `margin-right`, so it holds
  // however the separation is expressed — and because this same gap is a term in
  // `U4_TRAILING_CONTROLS_WIDTH`, which the drag clamp depends on.
  const gap =
    minimize.getBoundingClientRect().left - reload.getBoundingClientRect().right;
  expect(
    gap,
    'reload should stand apart from minimize/maximize/close — v4 had no reload control, and it ' +
      'must not read as a fourth window button. This gap is also a term in trailingControlsWidth',
  ).to.be.closeTo(U4_CONTROL_GAP, 0.5);
});

it('marks an inactive window by recolouring its header, never by fading its controls', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const active = getComputedStyle(win.root.querySelector('.titlebar') as HTMLElement).backgroundImage;

  win.element.window = { ...PROBE_WINDOW, active: false };
  await win.element.updateComplete;

  const frame = win.root.querySelector('.frame') as HTMLElement;
  const titlebar = win.root.querySelector('.titlebar') as HTMLElement;
  const controls = win.root.querySelector('.controls') as HTMLElement;
  expect(frame.classList.contains('active'), 'the probe should now render as inactive').to.equal(false);

  expect(
    getComputedStyle(titlebar).backgroundImage,
    'an inactive header should look different from an active one, or focus is unreadable',
  ).to.not.equal(active);
  expect(
    getComputedStyle(controls).opacity,
    'the buttons on an inactive window stay fully opaque — a half-faded button reads as disabled, ' +
      'and these are as clickable as an active window\'s',
  ).to.equal('1');

  // Leave the shared mount as the other tests in this file expect to find it.
  win.element.window = PROBE_WINDOW;
  await win.element.updateComplete;
});
