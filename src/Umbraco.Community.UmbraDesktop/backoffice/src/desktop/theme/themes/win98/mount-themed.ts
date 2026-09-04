import { paletteCss } from '../../palette-css.js';
import type { UmbraDesktopSurface } from '../../types';
import { UMBRADESKTOP_WIN98_THEME } from './index.js';
import { WIN98_LIGHT } from './palette.js';

/**
 * Test support for this theme's browser-rendered checks: mount one chrome component exactly as the
 * theme context would, so a test can measure what the theme really paints rather than what its CSS
 * text says it should.
 *
 * Test-only, and imported only by the `*.test.ts` files beside it. It lives here rather than in
 * either test file because both need it and neither should import the other, and it is a module
 * rather than a copy in each because the mounting is the fiddly part: get the palette or the sheet
 * order wrong and every measurement is quietly meaningless.
 *
 * **Mount once per test file, in a `before` hook, and share it.** Mounting a second chrome
 * component in the same page is intermittently very slow — the components consume several Umbraco
 * contexts that never resolve outside a desktop — and a per-test mount made these files fail
 * Mocha's timeout at random. The tests here only read computed style and layout, so sharing one
 * mount costs nothing and is what makes them stable.
 */
/**
 * How long any of this theme's tests may take before Mocha calls it hung, well above its 5s
 * default. Shared by every test file in this folder.
 *
 * Two things here are slow, and both are slow only because a full-suite run has two dozen pages
 * competing for one browser and one dev server: mounting a chrome component, which drags in
 * several Umbraco contexts that never resolve outside a desktop, and importing the theme's
 * stylesheets, which is three dynamic imports served by the test runner itself.
 *
 * It has to be called **inside each test body**, and that is worth writing down because the two
 * tidier-looking placements both silently fail in this runner: from a `before` hook `this.timeout()`
 * applies to the hook's own runnable and never reaches the tests, and from a `beforeEach` hook it
 * did not reach them either. Both left the tests on the 5s default, failing as bare timeouts a run
 * in every five or so.
 *
 * Raising the ceiling cannot mask a slow assertion — these tests read computed style, layout and
 * CSS text and nothing else. It can only mask a stall in the runner, and a genuine hang still
 * fails here.
 */
export const UMBRADESKTOP_THEME_TEST_TIMEOUT_MS = 20_000;

export interface UmbraDesktopThemedMount<T extends HTMLElement> {
  /** The mounted chrome element. */
  element: T;
  /** Its shadow root, where the chrome's own DOM lives. */
  root: ShadowRoot;
  /** Removes the wrapper, and with it the element. */
  dispose: () => void;
}

/** Anything Lit-based, which is every chrome component. */
type Updatable = HTMLElement & { updateComplete: Promise<unknown> };

/**
 * Mount a chrome component under the Win98 palette with the Win98 stylesheet for its surface
 * adopted.
 *
 * The palette rides on a wrapper element's `style` attribute — custom properties inherit through
 * shadow boundaries, which is the whole reason the palette is a viable channel — and the sheet is
 * appended *after* the component's own styles, which is what gives theme rules their authority at
 * equal specificity. Both mirror what `theme.context` and `theme-styles.controller` do at runtime.
 * @param tag The chrome element to mount, e.g. `umbradesktop-window`.
 * @param surface Which of the theme's stylesheets belongs to it.
 * @returns The mounted element, its shadow root, and a teardown.
 */
export async function mountThemed<T extends Updatable>(
  tag: string,
  surface: UmbraDesktopSurface,
): Promise<UmbraDesktopThemedMount<T>> {
  const host = document.createElement('div');
  host.setAttribute('style', paletteCss(WIN98_LIGHT));
  document.body.appendChild(host);

  const element = document.createElement(tag) as T;
  host.appendChild(element);
  await element.updateComplete;

  const sheets = await UMBRADESKTOP_WIN98_THEME.sheets!();
  const sheet = sheets[surface]?.styleSheet;
  // Thrown rather than asserted with chai, so this module depends on nothing but the theme it
  // mounts — it lives under `src/`, and a test framework imported from here would be a
  // devDependency reachable from production code.
  if (!sheet) throw new Error(`The Win98 theme ships no ${surface} stylesheet to mount.`);

  const root = element.shadowRoot!;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  await element.updateComplete;

  return { element, root, dispose: () => host.remove() };
}
