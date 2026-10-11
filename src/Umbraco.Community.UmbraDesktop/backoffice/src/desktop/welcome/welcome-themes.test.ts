import { expect } from '@open-wc/testing';
import '../components/desktop.element.js';
import type { UmbraDesktopDesktopElement } from '../components/desktop.element.js';
import type { UmbraDesktopSettingsContext } from '../settings/settings.context.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_THEMES } from '../theme/themes/index.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The wizard under every theme (design doc §10). It is theme-neutral, and a theme may restyle the
 * desktop's own surface, so what is pinned is that no theme's desktop stylesheet reaches the
 * wizard and hides, shrinks or recolours it: it covers the whole desktop, opaque, on its own ground.
 */

/** Reaches the settings context the desktop provides, so the test can choose a theme. */
@customElement('umbradesktop-welcome-theme-probe')
class UmbraDesktopWelcomeThemeProbe extends UmbLitElement {
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
 * Poll until `check` is true, or fail with `message`.
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
 * A painted desktop with the wizard up, and its settings context.
 * @returns The desktop and the context.
 */
async function mountWithWizard(): Promise<{ desktop: UmbraDesktopDesktopElement; settings: UmbraDesktopSettingsContext }> {
  const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
  desktop.style.cssText = 'position:fixed;inset:0;';
  document.body.appendChild(desktop);
  desktop.reportSettingsLoaded(true);
  (desktop as unknown as { _welcome: boolean })._welcome = true;
  desktop.requestUpdate();
  await desktop.updateComplete;

  const probe = document.createElement('umbradesktop-welcome-theme-probe') as UmbraDesktopWelcomeThemeProbe;
  desktop.appendChild(probe);
  await until(() => !!probe.settings, 'the settings context should resolve for a child of the desktop');

  return { desktop, settings: probe.settings! };
}

afterEach(() => {
  document.querySelectorAll('umbradesktop-desktop').forEach((element) => element.remove());
});

for (const theme of UMBRADESKTOP_THEMES) {
  it(`covers the whole desktop, unstyled by the theme, under ${theme.name}`, async function () {
    this.timeout(20_000);
    const { desktop, settings } = await mountWithWizard();

    settings.setTheme(theme.id);
    // Long enough for a theme's lazily imported stylesheets to be adopted.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await desktop.updateComplete;

    const wizard = desktop.renderRoot.querySelector('umbradesktop-welcome-screen') as HTMLElement;
    const screen = wizard.shadowRoot!.querySelector('.screen') as HTMLElement;
    const style = getComputedStyle(wizard);
    const box = wizard.getBoundingClientRect();
    const whole = desktop.getBoundingClientRect();

    expect(style.display, 'displayed').to.not.equal('none');
    expect(style.visibility, 'visible').to.equal('visible');
    expect(style.opacity, 'opaque').to.equal('1');
    expect(Math.round(box.width), 'as wide as the desktop').to.equal(Math.round(whole.width));
    expect(Math.round(box.height), 'as tall as the desktop').to.equal(Math.round(whole.height));
    expect(getComputedStyle(screen).backgroundColor, 'on its own ground').to.equal('rgb(11, 16, 36)');
  });
}
