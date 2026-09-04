import { expect } from '@open-wc/testing';
import '../components/desktop.element.js';
import type { UmbraDesktopDesktopElement } from '../components/desktop.element.js';
import type { UmbraDesktopSettingsContext } from '../settings/settings.context.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

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
 * This test drives the whole chain the way the browser does — pick a theme, watch the chrome —
 * rather than any one link in it, because every link was individually defensible.
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

it('adopts the active theme stylesheets into the chrome components', async () => {
  const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
  document.body.appendChild(desktop);
  try {
    await desktop.updateComplete;

    const taskbar = desktop.renderRoot.querySelector('umbradesktop-taskbar');
    expect(taskbar, 'the desktop should render a taskbar').to.not.equal(null);
    const taskbarRoot = taskbar!.shadowRoot!;
    const desktopRoot = desktop.renderRoot as ShadowRoot;

    const taskbarBase = taskbarRoot.adoptedStyleSheets.length;
    const desktopBase = desktopRoot.adoptedStyleSheets.length;

    const probe = document.createElement('umbradesktop-theme-test-probe') as UmbraDesktopThemeTestProbe;
    desktop.appendChild(probe);
    await until(() => !!probe.settings, 'the settings context should resolve for a child of the desktop');

    probe.settings!.setTheme('macos');

    await until(
      () => taskbarRoot.adoptedStyleSheets.length > taskbarBase,
      'choosing macOS should adopt a taskbar stylesheet — without it the dock stays a full-width bar',
    );
    expect(
      desktopRoot.adoptedStyleSheets.length,
      'choosing macOS should adopt a desktop-surface stylesheet',
    ).to.be.greaterThan(desktopBase);

    // And back: the Umbraco theme ships no sheets, so its selection has to *remove* them again
    // rather than leave the previous theme's rules standing.
    probe.settings!.setTheme('umbraco');
    await until(
      () => taskbarRoot.adoptedStyleSheets.length === taskbarBase,
      'returning to the Umbraco theme should un-adopt the macOS taskbar stylesheet',
    );
  } finally {
    desktop.remove();
  }
});
