import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../../../types.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import { UMBRADESKTOP_CONTROL_WIDTH } from '../../../constants.js';

/**
 * The window is where this theme and the macOS one are most likely to be mistaken for each other:
 * both are rounded, both are softly shadowed, both ship light and dark. What separates them is
 * entirely in the caption, so that is what these tests hold.
 *
 * Controls stay at the **trailing** end as full-height rectangles — macOS moves them to the
 * leading end with explicit `order` and turns them into circles. Close is the only one that
 * changes hue on hover, and it goes to Windows' own red with a white glyph, where macOS only
 * darkens its existing red. And the caption runs flush to the top-right corner as full-height
 * buttons, which is the Fitts's-law behaviour the base already renders and this theme keeps.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'win11-window-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  url: 'about:blank',
  chromeProfile: 'bare',
};

/** The window state the probe renders from. */
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

it('keeps the caption buttons at the trailing end, in DOM order', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const title = win.root.querySelector('.title') as HTMLElement;
  const controls = win.root.querySelector('.controls') as HTMLElement;
  const reload = win.root.querySelector('.ctrl-reload') as HTMLElement;
  const close = win.root.querySelector('.ctrl-close') as HTMLElement;

  expect(
    controls.getBoundingClientRect().left,
    'the controls sit after the title, unlike the macOS traffic lights',
  ).to.be.greaterThan(title.getBoundingClientRect().left);
  // No `order` anywhere: Windows renders reload, minimize, maximize, close left to right, which
  // is already the DOM order, so this theme needs none of the reordering macOS does.
  expect(
    close.getBoundingClientRect().left,
    'close is the outermost button, as it is on every Windows caption',
  ).to.be.greaterThan(reload.getBoundingClientRect().left);
});

it('draws contiguous full-height caption buttons at the Windows metric', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const titlebar = win.root.querySelector('.titlebar') as HTMLElement;
  const reload = win.root.querySelector('.ctrl-reload') as HTMLElement;
  const minimize = win.root.querySelector('.ctrl-minimize') as HTMLElement;

  expect(
    reload.getBoundingClientRect().width,
    'Windows 11 draws 46px caption buttons, which is already UMBRADESKTOP_CONTROL_WIDTH',
  ).to.be.closeTo(UMBRADESKTOP_CONTROL_WIDTH, 0.5);
  expect(
    reload.getBoundingClientRect().height,
    'the buttons run the full height of the caption, so the corner is a target',
  ).to.be.closeTo(titlebar.getBoundingClientRect().height, 0.5);
  // Contiguous, unlike the Umbraco 4 theme, which sets reload apart with a gap. Windows caption
  // buttons are one unbroken run, and that gap is also a term in trailingControlsWidth.
  expect(
    minimize.getBoundingClientRect().left - reload.getBoundingClientRect().right,
    'no gap between caption buttons on a Windows caption',
  ).to.be.closeTo(0, 0.5);
});

it('turns close red on hover while the other buttons only tint', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Read off the palette rather than synthesising a hover, which is not reliable in this runner.
  // The point is that close has its own pair and it is a hue change with a white glyph, which is
  // the Windows behaviour and the opposite of the macOS theme's darken-in-place.
  const host = win.element.parentElement!;
  expect(
    host.style.getPropertyValue('--umbradesktop-control-close-hover-background').trim(),
    'close goes to Windows red',
  ).to.equal('#c42b1c');
  expect(
    host.style.getPropertyValue('--umbradesktop-control-close-hover-color').trim(),
    'with a white glyph on it, unlike the macOS light which keeps a dark one',
  ).to.equal('#ffffff');
});
