import { expect } from '@open-wc/testing';
import '../../../components/window.element.js';
import type { UmbraDesktopWindowElement } from '../../../components/window.element.js';
import type { UmbraDesktopApp } from '../../../types.js';
import { paletteCss } from '../../palette-css.js';
import { UMBRADESKTOP_UMBRACO_THEME } from './index.js';

/**
 * The Umbraco theme's `metrics` describe CSS that nothing in this theme writes: its palettes are
 * empty by design, so every number it publishes describes the *base* styles in
 * `components/window.element` and their CSS fallbacks. That makes it the one theme whose metrics
 * can drift without anybody touching the theme — and they did. `trailing` was written when the
 * titlebar carried three buttons; reload was added as a fourth and the constant stayed at 138,
 * under-reporting the dead band by a whole button. A window dragged hard against the right edge
 * therefore kept 46px less draggable caption than the 80px `grab` asks for — a bug in the theme
 * that renders for every user who has never opened the settings panel.
 *
 * So this file does for the Umbraco theme what `themes/win98/metrics.test.ts` does for Win98:
 * mount the real window, measure the boxes the browser actually paints, and hold the published
 * metrics against them. Deriving the numbers from named constants (see `constants.ts`) keeps them
 * consistent with each other; only measuring keeps them consistent with the CSS.
 *
 * It needs no `mount-themed` helper of its own. That helper exists to apply a palette and adopt a
 * theme's stylesheets, and this theme has neither — mounting it *is* mounting the bare chrome.
 */

/** A throwaway app for a window that only has to render, never load anything. */
const PROBE_APP: UmbraDesktopApp = {
  alias: 'umbraco-metrics-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  url: 'about:blank',
  chromeProfile: 'bare',
};

/**
 * The backoffice custom properties the base window styles fall back to, which a bare test page
 * does not load.
 *
 * Only this one is set, because it is the only fallback that changes the size of a box being
 * measured: `.frame`'s `border` and `.titlebar`'s `border-bottom` are both
 * `1px solid var(--uui-color-border)`, and a `var()` with no value makes the whole declaration
 * invalid at computed-value time — the border collapses to `none`, and both measurements come out
 * a pixel short of what the backoffice paints. Leaving it undefined would measure a window that
 * only exists in the test runner. (`--uui-size-space-3` and friends are left unset on purpose:
 * they move the title text, not any edge these metrics describe.)
 */
const BACKOFFICE_TOKENS = '--uui-color-border:#d8d7d9;';

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

/** The window under test, mounted once for the whole file. */
let element: UmbraDesktopWindowElement;

/** The wrapper carrying the palette, removed on teardown. */
let host: HTMLElement;

/** The window's shadow root, where the chrome's own DOM lives. */
let root: ShadowRoot;

before(async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  host = document.createElement('div');
  // The theme's own palette, empty as it is, applied the way `theme.context` applies it — so a
  // token this theme ever starts setting is in force here too, rather than silently skipped.
  host.setAttribute('style', BACKOFFICE_TOKENS + paletteCss(UMBRADESKTOP_UMBRACO_THEME.palettes.light));
  document.body.appendChild(host);

  element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  host.appendChild(element);
  await element.updateComplete;
  element.window = {
    id: 'w1',
    app: PROBE_APP,
    rect: { x: 0, y: 0, w: 640, h: 400 },
    z: 1,
    active: true,
    state: 'normal',
  };
  await element.updateComplete;
  root = element.shadowRoot!;
});

after(() => host?.remove());

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
