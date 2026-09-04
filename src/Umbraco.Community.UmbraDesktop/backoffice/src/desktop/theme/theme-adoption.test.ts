import { expect } from '@open-wc/testing';
import '../components/desktop.element.js';
import type { UmbraDesktopDesktopElement } from '../components/desktop.element.js';
import type { UmbraDesktopSettingsContext } from '../settings/settings.context.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { UmbraDesktopSurface, UmbraDesktopTheme } from './types';
import { UMBRADESKTOP_MACOS_THEME } from './themes/macos/index.js';
import { UMBRADESKTOP_WIN98_THEME } from './themes/win98/index.js';

/**
 * The theming system has two independent channels, and only one of them is visible to the tests
 * that came with it. The palette travels as custom properties in a `style` attribute — plain
 * strings, exercised by `palette-css.test`. The stylesheets travel as objects through the theme
 * context's state and into each component's `adoptedStyleSheets`, and nothing asserted that they
 * arrive. They did not: `UmbObjectState` deep-freezes whatever it holds, and a Lit `CSSResult`
 * memoizes its lazily built `CSSStyleSheet` onto itself the first time `.styleSheet` is read — a
 * write to a frozen object, which throws in a module's strict mode. The result was a theme that
 * recoloured the chrome but never restyled it: no dock, no traffic lights, no fullscreen launcher.
 *
 * These tests drive the whole chain the way the browser does — pick a theme, watch the chrome —
 * rather than any one link in it, because every link was individually defensible. Each theme with
 * sheets gets its own case: a theme reaches the chrome through *its own* lazily imported module, so
 * a theme whose module fails to load, exports the wrong shape, or throws at import time (a stray
 * backtick in a CSS comment does exactly that) is caught here and nowhere else — and the theme
 * context deliberately swallows that failure so a broken theme cannot take the desktop down with
 * it, which is precisely why it has to be asserted rather than noticed.
 */

/** Reaches the settings context the desktop provides, so the test can choose a theme. */
@customElement('umbradesktop-theme-test-probe')
class UmbraDesktopThemeTestProbe extends UmbLitElement {
  /** The desktop's settings context, once it has resolved. */
  public settings?: UmbraDesktopSettingsContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.settings = context ?? undefined;
    });
  }
}

/**
 * How long one of these tests may take before Mocha calls it hung, well above its 5s default.
 *
 * The default is genuinely too tight here, and finding that out cost a run of intermittent
 * failures. Each test below mounts a whole desktop and then waits on three separate
 * settle-and-poll steps, the slowest link in each being a dynamic import served by the test
 * runner's own dev server — which a full-suite run has every other test file competing for. Three
 * `until` calls alone can spend six seconds of the ceiling before anything is actually wrong, so
 * the default fired as a bare timeout rather than as the assertion that would have explained it.
 *
 * This raises the ceiling for a genuine failure to report; it does not make any assertion below
 * more forgiving. `until` still gives up after two seconds per step.
 */
const ADOPTION_TIMEOUT_MS = 20_000;

/**
 * Poll until `check` is true, or fail with `message`. The chain under test crosses a context
 * resolution, an observable and a dynamic import, so there is no single promise to await.
 * @param check The condition to wait for.
 * @param message What to report if it never becomes true.
 * @returns Nothing; throws when the condition never holds.
 */
async function until(check: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect.fail(message);
}

/**
 * Mount a desktop and reach the settings context it provides, so a test can choose a theme the
 * way the settings dialog does.
 * @returns The desktop, its probe, and a teardown that removes the desktop from the document.
 */
async function mountDesktopWithSettings(): Promise<{
  desktop: UmbraDesktopDesktopElement;
  probe: UmbraDesktopThemeTestProbe;
  dispose: () => void;
}> {
  const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
  document.body.appendChild(desktop);
  await desktop.updateComplete;

  const probe = document.createElement('umbradesktop-theme-test-probe') as UmbraDesktopThemeTestProbe;
  desktop.appendChild(probe);
  await until(() => !!probe.settings, 'the settings context should resolve for a child of the desktop');

  return { desktop, probe, dispose: () => desktop.remove() };
}

/**
 * Assert that selecting `theme` adopts its own stylesheets into the chrome, and that returning to
 * the Umbraco identity theme takes them away again.
 *
 * Asserted by sheet *identity* rather than by watching `adoptedStyleSheets` grow, and that is the
 * load-bearing detail here. The theme a desktop mounts on is not knowable from inside a test:
 * settings persist to `localStorage`, the runner serves every test file from one origin, and it
 * runs them in parallel — so a sibling file that mounted a desktop can leave any theme stored, and
 * this desktop may already have the theme under test adopted before the first assertion runs.
 * Counting sheets made that an intermittent failure. Naming the exact sheets that have to be there
 * makes the starting state irrelevant, and says something stricter besides: that *this* theme's
 * stylesheets arrived, not merely that some sheet did.
 * @param theme The theme to select. Must ship `sheets`.
 * @param surfaces Which of its surfaces to check, and what each one styles — the description is
 * folded into the failure message, so a break says what the user would have seen.
 * @returns Nothing; throws on the first surface that does not behave.
 */
async function expectAdoptsSheets(
  theme: UmbraDesktopTheme,
  surfaces: ReadonlyArray<{ surface: UmbraDesktopSurface; hostTag?: string; ifMissing: string }>,
): Promise<void> {
  // The same `CSSStyleSheet` instances the theme context will publish: `CSSResult.styleSheet`
  // builds once and memoizes onto the `CSSResult`, and this module graph has exactly one of those.
  const sheets = await theme.sheets!();
  const mounted = await mountDesktopWithSettings();
  try {
    const roots = surfaces.map((entry) => {
      const host = entry.hostTag
        ? mounted.desktop.renderRoot.querySelector(entry.hostTag)
        : mounted.desktop;
      expect(host, `the desktop should render ${entry.hostTag ?? 'itself'}`).to.not.equal(null);
      const sheet = sheets[entry.surface]?.styleSheet;
      expect(sheet, `the ${theme.id} theme should style the ${entry.surface} surface`).to.not.equal(
        undefined,
      );
      const root = (host as Element & { renderRoot?: ParentNode }).renderRoot as ShadowRoot;
      return { ...entry, adopted: () => root.adoptedStyleSheets.includes(sheet!) };
    });

    // Start from a known theme rather than from whatever happened to be stored, so what the
    // assertions below observe is this test's own selection.
    mounted.probe.settings!.setTheme('umbraco');
    await until(
      () => roots.every((entry) => !entry.adopted()),
      'the Umbraco theme ships no sheets at all, so none of them should be adopted',
    );

    mounted.probe.settings!.setTheme(theme.id);
    for (const entry of roots) {
      await until(entry.adopted, `choosing ${theme.name} should adopt its ${entry.surface} stylesheet — ${entry.ifMissing}`);
    }

    // And back: the Umbraco theme ships no sheets, so its selection has to *remove* them again
    // rather than leave the previous theme's rules standing.
    mounted.probe.settings!.setTheme('umbraco');
    await until(
      () => roots.every((entry) => !entry.adopted()),
      `returning to the Umbraco theme should un-adopt every ${theme.name} stylesheet rather than leaving its rules in force`,
    );
  } finally {
    mounted.dispose();
  }
}

it('adopts the macOS theme stylesheets, and un-adopts them again on the way out', async function () {
  this.timeout(ADOPTION_TIMEOUT_MS);
  await expectAdoptsSheets(UMBRADESKTOP_MACOS_THEME, [
    {
      surface: 'taskbar',
      hostTag: 'umbradesktop-taskbar',
      ifMissing: 'without it the dock stays a full-width bar',
    },
    {
      surface: 'desktop',
      ifMissing: 'without it the dock is never centred and the watermark stays put',
    },
  ]);
});

it('adopts the Win98 theme stylesheets, and un-adopts them again on the way out', async function () {
  this.timeout(ADOPTION_TIMEOUT_MS);
  await expectAdoptsSheets(UMBRADESKTOP_WIN98_THEME, [
    {
      surface: 'taskbar',
      hostTag: 'umbradesktop-taskbar',
      ifMissing:
        'without it the bar keeps its rounded, frosted Umbraco look instead of a flush grey one ' +
        'with bevelled buttons',
    },
  ]);
});
