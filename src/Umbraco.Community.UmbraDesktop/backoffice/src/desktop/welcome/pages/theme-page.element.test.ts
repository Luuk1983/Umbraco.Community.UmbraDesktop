import { expect } from '@open-wc/testing';
import './theme-page.element.js';
import type { UmbraDesktopWelcomeThemePageElement } from './theme-page.element.js';
import { UMBRADESKTOP_THEMES } from '../../theme/themes/index';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbArrayState, UmbStringState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The theme page: the five themes as the picker's own miniatures, each on its own wallpaper, the
 * current one selected (design doc §3.3).
 */

/**
 * Mount the page by hand and wait for its first render.
 * @param value The theme selected.
 * @returns The mounted page.
 */
async function mountPage(value: string): Promise<UmbraDesktopWelcomeThemePageElement> {
  const page = document.createElement('umbradesktop-welcome-theme') as UmbraDesktopWelcomeThemePageElement;
  page.value = value;
  document.body.appendChild(page);
  await page.updateComplete;
  return page;
}

/**
 * The radio for one theme.
 * @param page The page.
 * @param id The theme id.
 * @returns Its input.
 */
function radio(page: UmbraDesktopWelcomeThemePageElement, id: string): HTMLInputElement {
  return page.renderRoot.querySelector<HTMLInputElement>(`input[value="${id}"]`)!;
}

afterEach(() => {
  document.querySelectorAll('umbradesktop-welcome-theme').forEach((element) => element.remove());
});

it('offers every shipped theme, each as a miniature', async () => {
  const page = await mountPage('umbraco');

  expect(page.renderRoot.querySelectorAll('input[name="theme"]').length).to.equal(UMBRADESKTOP_THEMES.length);
  expect(page.renderRoot.querySelectorAll('umbradesktop-theme-preview').length).to.equal(UMBRADESKTOP_THEMES.length);
});

it('selects the current theme', async () => {
  const page = await mountPage('macos');

  expect(radio(page, 'macos').checked).to.equal(true);
  expect(radio(page, 'umbraco').checked).to.equal(false);
});

it("paints each miniature on that theme's own wallpaper, because choosing it brings that wallpaper", async () => {
  const page = await mountPage('umbraco');
  const previews = [...page.renderRoot.querySelectorAll('umbradesktop-theme-preview')] as Array<
    HTMLElement & { wallpaper: { url: string | null } }
  >;

  const win98 = previews[UMBRADESKTOP_THEMES.findIndex((theme) => theme.id === 'win98')];
  const macos = previews[UMBRADESKTOP_THEMES.findIndex((theme) => theme.id === 'macos')];

  expect(win98.wallpaper.url, 'Windows 98 is its own flat ground').to.equal(null);
  expect(macos.wallpaper.url).to.contain('first-light');
});

it('reports a new choice', async () => {
  const page = await mountPage('umbraco');
  let changed = false;
  page.addEventListener(UmbChangeEvent.TYPE, () => (changed = true));

  radio(page, 'win11').click();

  expect(changed).to.equal(true);
  expect(page.value).to.equal('win11');
});

it('keeps each hidden radio inside its tile, for the reason the language page does', async () => {
  const page = await mountPage('umbraco');

  // Compared as a boolean: chai stalls printing a DOM element when the assertion fails.
  expect(radio(page, 'win98').offsetParent === radio(page, 'win98').closest('label')).to.equal(true);
});

describe("the backoffice's own colours", () => {
  /** The three core registers, as the desktop's theme context hands them on. */
  const CORE = [
    { alias: 'umb-light-theme', name: 'Light' },
    { alias: 'umb-dark-theme', name: 'Dark (Experimental)' },
    { alias: 'umb-high-contrast-theme', name: 'High contrast (Experimental)' },
  ];

  let wrapper: HTMLElement;
  let applied: string[];

  /**
   * Mount the page under a stub theme context carrying the backoffice's themes.
   * @param current The backoffice theme in force.
   * @returns The page.
   */
  async function mountWithBackoffice(current: string): Promise<UmbraDesktopWelcomeThemePageElement> {
    applied = [];
    const alias = new UmbStringState(current);
    wrapper = document.createElement('div');
    document.body.append(wrapper);
    new UmbContextProvider(wrapper, UMBRADESKTOP_THEME_CONTEXT, {
      backofficeThemes: new UmbArrayState(CORE, (theme) => theme.alias).asObservable(),
      backofficeTheme: alias.asObservable(),
      backofficeVariant: alias.asObservablePart((a) => (a === 'umb-dark-theme' ? 'dark' : 'light')),
      setBackofficeTheme: (next: string) => {
        applied.push(next);
        alias.setValue(next);
      },
      getHostElement: () => wrapper,
    } as never).hostConnected();

    const page = document.createElement('umbradesktop-welcome-theme') as UmbraDesktopWelcomeThemePageElement;
    page.value = 'umbraco';
    wrapper.append(page);
    await page.updateComplete;
    return page;
  }

  /**
   * The radio for one backoffice theme.
   * @param page The page.
   * @param alias The theme's alias.
   * @returns Its input.
   */
  const colours = (page: UmbraDesktopWelcomeThemePageElement, alias: string) =>
    page.renderRoot.querySelector<HTMLInputElement>(`input[name="backoffice"][value="${alias}"]`)!;

  afterEach(() => wrapper?.remove());

  it('offers what the backoffice has registered, by name', async () => {
    const page = await mountWithBackoffice('umb-light-theme');

    const names = [...page.renderRoot.querySelectorAll('input[name="backoffice"]')].map((input) =>
      input.closest('label')!.textContent!.trim(),
    );

    expect(names).to.deep.equal(CORE.map((theme) => theme.name));
  });

  it('selects the one in force', async () => {
    const page = await mountWithBackoffice('umb-dark-theme');

    expect(colours(page, 'umb-dark-theme').checked).to.equal(true);
    expect(colours(page, 'umb-light-theme').checked).to.equal(false);
  });

  it('applies a choice at once, through the desktop theme context', async () => {
    const page = await mountWithBackoffice('umb-light-theme');

    colours(page, 'umb-high-contrast-theme').click();

    expect(applied).to.deep.equal(['umb-high-contrast-theme']);
  });

  it('does not count a backoffice colour as a desktop theme choice', async () => {
    const page = await mountWithBackoffice('umb-light-theme');
    let changed = false;
    page.addEventListener(UmbChangeEvent.TYPE, () => (changed = true));

    colours(page, 'umb-dark-theme').click();

    expect(changed).to.equal(false);
    expect(page.value).to.equal('umbraco');
  });

  it('marks the miniatures as high contrast under that theme, and only under it', async () => {
    const page = await mountWithBackoffice('umb-light-theme');
    const contrasts = () =>
      [...page.renderRoot.querySelectorAll('umbradesktop-theme-preview')].map(
        (preview) => (preview as HTMLElement & { highContrast: boolean }).highContrast,
      );
    expect(contrasts().every((on) => on === false)).to.equal(true);

    colours(page, 'umb-high-contrast-theme').click();
    await page.updateComplete;

    expect(contrasts().every((on) => on === true)).to.equal(true);
  });

  it('heads each choice with its name and what it changes', async () => {
    const page = await mountWithBackoffice('umb-light-theme');

    const labels = [...page.renderRoot.querySelectorAll('.section-label')].map((label) => label.textContent!.trim());
    const hints = page.renderRoot.querySelectorAll('.section-hint');

    expect(labels).to.deep.equal([
      page.localize.term('umbraDesktop_welcomeDesktopTheme'),
      page.localize.term('umbraDesktop_backofficeTheme'),
    ]);
    expect(hints.length).to.equal(2);
  });

  it('paints the miniatures in the colours chosen', async () => {
    const page = await mountWithBackoffice('umb-light-theme');

    colours(page, 'umb-dark-theme').click();
    await page.updateComplete;

    const preview = page.renderRoot.querySelector('umbradesktop-theme-preview') as HTMLElement & { variant: string };
    expect(preview.variant).to.equal('dark');
  });
});
