import { expect } from '@open-wc/testing';
import { sendMouse } from '@web/test-runner-commands';
import '../../../components/window.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../../../types.js';
import { measureUnsavedMarker } from '../mount-themed.js';
import { contrastRatio } from '../../contrast.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import {
  UMBRACO_CONTROL_FACE,
  UMBRACO_MIN_TOUCH,
  UMBRACO_WINDOW_RADIUS,
} from './metrics.js';

/**
 * The Umbraco theme's window, measured as the browser paints it.
 *
 * The idea is that a focused window wears the backoffice's own header: a navy bar and a white
 * title, with round caption buttons. An unfocused window
 * goes quiet instead of merely fading. Almost all of it is checked here by reading computed style,
 * because the values are `--uui-*` references and a typo in one is a window that silently paints
 * nothing.
 *
 * Hover is driven with a real pointer (`sendMouse`) rather than read off the palette, which is what
 * the Windows 11 test settles for. The hover face is the one thing a person sees move, and it is
 * painted by a gradient in a token, so the only honest check is to put the pointer over a button.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'umbraco-window-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
};

/**
 * The window state the probe renders from. Placed well inside the test page's 800x600 viewport, so
 * that a pointer aimed at a button lands on it.
 */
const PROBE_WINDOW: UmbraDesktopWindow = {
  id: 'w1',
  app: PROBE_APP,
  rect: { x: 20, y: 20, w: 600, h: 360 },
  z: 1,
  active: true,
  state: 'normal',
};

/** The Umbraco header's navy, as the test page's `--uui-color-header-surface` resolves. */
const NAVY = 'rgb(27, 38, 79)';

/** The backoffice's `surface-alt`, which an unfocused caption turns into. */
const SAND = 'rgb(243, 243, 245)';

/** Umbraco's danger, which the close button's hover is drawn in. */
const DANGER = 'rgb(195, 29, 76)';

/** The themed window under test, mounted once for the whole file. */
let win: UmbraDesktopThemedMount<UmbraDesktopWindowElement>;

/**
 * Put the probe window in a focus state and wait for the render.
 * @param active Whether the window is the focused one.
 */
async function focus(active: boolean): Promise<void> {
  win.element.window = { ...PROBE_WINDOW, active };
  await win.element.updateComplete;
}

/**
 * The first element matching a selector in the window's shadow root.
 * @param selector What to find.
 * @returns The element.
 */
function find(selector: string): HTMLElement {
  const found = win.root.querySelector(selector) as HTMLElement | null;
  expect(found, `the window should render ${selector}`).to.not.equal(null);
  return found!;
}

/**
 * Move the real pointer to the middle of an element and let the hover state settle.
 * @param element What to hover.
 */
async function hover(element: HTMLElement): Promise<void> {
  const box = element.getBoundingClientRect();
  await sendMouse({ type: 'move', position: [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)] });
}

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  win = await mountThemed<UmbraDesktopWindowElement>('umbradesktop-window', 'window');
  await focus(true);
});

afterEach(async () => {
  // Off every button, so one case's hover is not the next case's starting state.
  await sendMouse({ type: 'move', position: [790, 590] });
});

after(() => win?.dispose());

it('rounds the frame to the radius of the cards inside a backoffice view', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  expect(getComputedStyle(find('.frame')).borderTopLeftRadius).to.equal(`${UMBRACO_WINDOW_RADIUS}px`);
});

it('puts the backoffice header on the focused caption, with a white title', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  await focus(true);
  expect(getComputedStyle(find('.titlebar')).backgroundColor, 'the header surface').to.equal(NAVY);
  expect(getComputedStyle(find('.title')).color, 'the title the header writes in').to.equal('rgb(255, 255, 255)');
});

it('turns the unfocused caption sand and quiet rather than fading it', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  await focus(false);
  expect(getComputedStyle(find('.titlebar')).backgroundColor, 'sand, the backoffice ground').to.equal(SAND);
  expect(
    getComputedStyle(find('.title')).color,
    'ink on that sand: white on sand would be gone, so the colour has to change with the ground',
  ).to.not.equal('rgb(255, 255, 255)');
  expect(
    getComputedStyle(find('.title')).opacity,
    'a colour does the quieting here, not the base rule that fades the whole caption',
  ).to.equal('1');
  await focus(true);
});

it('writes the title in Regular, because light text on the navy already reads heavier than it is', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  await focus(true);
  // Lato ships Light, Regular, Bold and Black, so there is no 600 to step down to: the choice was
  // Bold or Regular, and Bold on navy was the heavy look this theme set out to fix.
  expect(getComputedStyle(find('.title')).fontWeight).to.equal('400');
  await focus(false);
  expect(getComputedStyle(find('.title')).fontWeight, 'and the same when unfocused').to.equal('400');
  await focus(true);
});

it('draws no line under the title: the navy caption is what says this window is in front', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Tried and dropped (see docs/design/2026-10-04-umbraco-theme-refinement-design.md). Pale coral on
  // navy read as a smear along the caption's edge, and it repeated the identical line under the
  // active tab in the content a hundred pixels below it. The taskbar's line is the one that stays.
  await focus(true);
  expect(getComputedStyle(find('.title'), '::after').content, 'no line under a focused title').to.equal('none');
  await focus(false);
  expect(getComputedStyle(find('.title'), '::after').content, 'nor under an unfocused one').to.equal('none');
  await focus(true);
});

it('keeps the error marker readable on both captions: at least 3:1, the ratio for a graphic', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Found by looking at the real thing: Umbraco's danger-standalone is a dark maroon, darkened to read
  // on a white ground, and on the navy caption it sank to about 2:1. Only the focused caption needs a
  // lighter one, and only the caption: the notice banner under it is a pale pink and wants the dark.
  for (const active of [true, false]) {
    win.element.window = { ...PROBE_WINDOW, active, deleted: true };
    await win.element.updateComplete;
    const marker = find('.notice-marker');
    const ratio = contrastRatio(getComputedStyle(marker).color, getComputedStyle(find('.titlebar')).backgroundColor);
    expect(ratio, `the error marker's colour on the ${active ? 'focused' : 'unfocused'} caption is measurable`).to.not.equal(null);
    expect(ratio!, `error marker on the ${active ? 'focused' : 'unfocused'} caption`).to.be.at.least(3);
  }
  win.element.window = { ...PROBE_WINDOW, active: true };
  await win.element.updateComplete;
});

it("draws a busy window's progress ring in a colour that reads on both captions, at 3:1 or better", async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // The base draws the ring in `interactive-emphasis`, a mid blue, because it was written against a
  // white caption. On the navy caption that is blue on navy, and a window uploading in the background
  // sits on the sand one, so both grounds have to be answered. The ring is drawn in a custom property
  // the element resolves, so it is read as one: the resolved value is what gets painted.
  for (const active of [true, false]) {
    win.element.window = {
      ...PROBE_WINDOW,
      active,
      progress: { state: 'determinate', fraction: 0.5, completed: 25, total: 50, failed: 0 },
    };
    await win.element.updateComplete;
    const ring = find('.titlebar .progress');
    const ground = getComputedStyle(find('.titlebar')).backgroundColor;
    for (const name of ['--_progress-fill', '--_progress-failed']) {
      // A custom property is not resolved to a colour until it is used, so use it: paint it as the
      // ring's text colour and read back what the browser made of it.
      ring.style.color = `var(${name})`;
      const colour = getComputedStyle(ring).color;
      const ratio = contrastRatio(colour, ground);
      expect(ratio, `${name} (${colour}) on the ${active ? 'focused' : 'unfocused'} caption is measurable`).to.not.equal(null);
      expect(ratio!, `${name} on the ${active ? 'focused' : 'unfocused'} caption`).to.be.at.least(3);
    }
  }
  win.element.window = { ...PROBE_WINDOW, active: true };
  await win.element.updateComplete;
});

it('keeps every caption button a touch target: at least 44px wide, and the caption tall', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  await focus(true);
  const bar = find('.titlebar').getBoundingClientRect();
  for (const name of ['.ctrl-reload', '.ctrl-minimize', '.ctrl-maximize', '.ctrl-close']) {
    const box = find(name).getBoundingClientRect();
    expect(box.width, `${name} is a wide enough target`).to.be.at.least(UMBRACO_MIN_TOUCH);
    expect(box.height, `${name} runs the height of the caption`).to.be.closeTo(bar.height - 1, 1.5);
  }
});

it('draws no face at rest and a round one under the pointer', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  await focus(true);
  const minimize = find('.ctrl-minimize');
  expect(getComputedStyle(minimize).backgroundImage, 'nothing painted until hovered').to.equal('none');

  await hover(minimize);
  const face = getComputedStyle(minimize).backgroundImage;
  expect(face, 'a gradient face').to.contain('radial-gradient');
  expect(face, 'with the diameter the constant says').to.contain(`${UMBRACO_CONTROL_FACE / 2}px`);
  expect(
    getComputedStyle(minimize).backgroundColor,
    'and no full-height block behind it, which is the Windows idiom this replaces',
  ).to.equal('rgba(0, 0, 0, 0)');
});

it('goes red on close only on the focused navy caption, and as a wash on a quiet one', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  await focus(true);
  await hover(find('.ctrl-close'));
  expect(getComputedStyle(find('.ctrl-close')).backgroundImage, 'a solid danger face on the navy bar').to.contain(
    DANGER,
  );
  expect(getComputedStyle(find('.ctrl-close')).color, 'with a white glyph').to.equal('rgb(255, 255, 255)');

  await sendMouse({ type: 'move', position: [790, 590] });
  await focus(false);
  await hover(find('.ctrl-close'));
  expect(
    getComputedStyle(find('.ctrl-close')).color,
    'on sand the glyph itself turns danger, over a pale wash, because a white glyph would vanish',
  ).to.equal(DANGER);
  await focus(true);
});

it('keeps the unsaved marker visible against both captions', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  for (const active of [true, false]) {
    await focus(active);
    const marker = await measureUnsavedMarker(win.element, win.root);
    expect(marker.present, `the marker is drawn when active is ${active}`).to.equal(true);
    expect(marker.background, `and is not the caption's own colour when active is ${active}`).to.not.equal(
      marker.titlebarBackground,
    );
  }
  await focus(true);
});

it("grows the pane and strip buttons' touch box to the strip's height, without moving the button", function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Read off the sheet, as `win11/taskbar.test.ts` does for what a bare mount cannot render: the
  // pane and the Dock button only exist for a window with attached content, and what has to hold is
  // that the target grows through an overlay, never through padding, which would move the button.
  const sheets = [...win.root.adoptedStyleSheets];
  const text = [...sheets[sheets.length - 1].cssRules].map((rule) => rule.cssText).join('\n');
  for (const button of ['.pane-button', '.attached-dock']) {
    expect(text, `${button} grows its touch target with an overlay`).to.contain(`${button}::after`);
  }
  // The browser serialises `top`, `bottom`, `left` and `right` back as one `inset` shorthand, so
  // the pair of numbers is what is read: four px beyond the button above and below, none to the side.
  expect(
    text,
    "vertically 4px past the button each way, which fills the strip's own 28px, and not sideways: " +
      "the pane's buttons are a few pixels apart, so a wider overlay makes neighbouring targets " +
      'overlap and a tap on one lands on another',
  ).to.match(/\.pane-button::after, \.attached-dock::after \{[^}]*inset: -4px 0px;/);
});
