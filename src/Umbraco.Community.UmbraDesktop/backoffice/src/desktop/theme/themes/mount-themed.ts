import { paletteCss } from '../palette-css.js';
import type { UmbraDesktopPalette, UmbraDesktopSurface, UmbraDesktopTheme } from '../types';

/**
 * Test support shared by the themes' browser-rendered checks: mount one chrome component exactly
 * as the theme context would, so a test can measure what a theme really paints rather than what
 * its CSS text says it should.
 *
 * Test-only, and imported only by `*.test.ts` files and by the per-theme bindings beside them. It
 * sits here, one level above the themes, because two of them now need it: Win98 mounts its chrome
 * in four test files and macOS in one, and the mounting is the fiddly part — get the palette or
 * the sheet order wrong and every measurement is quietly meaningless. A theme-specific copy of
 * that is exactly the kind of duplication these tests exist to catch elsewhere.
 *
 * **Mount once per test file, in a `before` hook, and share it.** Mounting a second chrome
 * component in the same page is intermittently very slow — the components consume several Umbraco
 * contexts that never resolve outside a desktop — and a per-test mount made these files fail
 * Mocha's timeout at random. These tests only read computed style and layout, so sharing one mount
 * costs nothing and is what makes them stable.
 */

/**
 * How long a theme's rendered-geometry test may take before Mocha calls it hung, well above its 5s
 * default. Shared by every such file.
 *
 * Two things are slow, and both are slow only because a full-suite run has two dozen pages
 * competing for one browser and one dev server: mounting a chrome component, which drags in
 * several Umbraco contexts that never resolve outside a desktop, and importing the theme's
 * stylesheets, which is several dynamic imports served by the test runner itself.
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

/** One mounted chrome component, with the handles a measuring test needs. */
export interface UmbraDesktopThemedMount<T extends HTMLElement> {
  /** The mounted chrome element. */
  element: T;
  /** Its shadow root, where the chrome's own DOM lives. */
  root: ShadowRoot;
  /** Removes the wrapper, and with it the element. */
  dispose: () => void;
}

/** Anything Lit-based, which is every chrome component. */
export type UmbraDesktopUpdatable = HTMLElement & { updateComplete: Promise<unknown> };

/**
 * Mount a chrome component under a theme's palette with that theme's stylesheet for the given
 * surface adopted.
 *
 * The palette rides on a wrapper element's `style` attribute — custom properties inherit through
 * shadow boundaries, which is the whole reason the palette is a viable channel — and the sheet is
 * appended *after* the component's own styles, which is what gives theme rules their authority at
 * equal specificity. Both mirror what `theme.context` and `theme-styles.controller` do at runtime.
 * @param theme The theme to mount under, whose `sheets` supply the surface stylesheet.
 * @param palette The variant to apply, normally the theme's light palette.
 * @param tag The chrome element to mount, e.g. `umbradesktop-window`.
 * @param surface Which of the theme's stylesheets belongs to it.
 * @returns The mounted element, its shadow root, and a teardown.
 * @throws If the theme ships no stylesheet for that surface, which would leave the test measuring
 * the untouched base chrome and passing or failing for reasons that have nothing to do with it.
 */
export async function mountThemedWith<T extends UmbraDesktopUpdatable>(
  theme: UmbraDesktopTheme,
  palette: UmbraDesktopPalette,
  tag: string,
  surface: UmbraDesktopSurface,
): Promise<UmbraDesktopThemedMount<T>> {
  const host = document.createElement('div');
  host.setAttribute('style', paletteCss(palette));
  document.body.appendChild(host);

  const element = document.createElement(tag) as T;
  host.appendChild(element);
  await element.updateComplete;

  const sheets = await theme.sheets!();
  const sheet = sheets[surface]?.styleSheet;
  // Thrown rather than asserted with chai, so this module depends on nothing but the theme it
  // mounts — it lives under `src/`, and a test framework imported from here would be a
  // devDependency reachable from production code.
  if (!sheet) throw new Error(`The ${theme.name} theme ships no ${surface} stylesheet to mount.`);

  const root = element.shadowRoot!;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  await element.updateComplete;

  return { element, root, dispose: () => host.remove() };
}
