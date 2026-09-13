import { expect } from '@open-wc/testing';
import './appearance.element.js';
import type { UmbraDesktopSettingsAppearanceElement } from './appearance.element.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token.js';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../../theme/theme.context-token.js';
import { UMBRADESKTOP_UMBRACO_THEME } from '../../../theme/themes/umbraco/index.js';
import type { UmbraDesktopResolvedTheme } from '../../../theme/resolve-variant.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbArrayState, UmbObjectState, UmbStringState } from '@umbraco-cms/backoffice/observable-api';

/**
 * "Theme" means two things in this backoffice and they used to be set in two places: ours in here,
 * Umbraco's own — Light, Dark, High contrast — in the current-user modal. Appearance now holds both,
 * and these tests are about the distinction staying visible: three rows, the backoffice's own kept
 * apart from our five skins rather than folded in among them, and the sentence explaining high
 * contrast sitting under the control that causes it.
 */

/** The three core registers, as the theme context hands them over. */
const CORE = [
  { alias: 'umb-light-theme', name: 'Light' },
  { alias: 'umb-dark-theme', name: 'Dark (Experimental)' },
  { alias: 'umb-high-contrast-theme', name: 'High contrast (Experimental)' },
];

let wrapper: HTMLElement;
let panel: UmbraDesktopSettingsAppearanceElement;
let alias: UmbStringState<string>;
let resolved: UmbObjectState<UmbraDesktopResolvedTheme>;

/**
 * Mount the Appearance screen under stub contexts.
 *
 * By hand rather than with `fixture()`: the screen renders `uui-icon` through its rows, which is
 * not registered in a bare test page, so `fixture()` never settles.
 * @param highContrast Whether the backoffice is in high contrast.
 * @param current The backoffice theme alias in force.
 */
async function mountPanel(highContrast = false, current = 'umb-light-theme') {
  alias = new UmbStringState(current);
  resolved = new UmbObjectState<UmbraDesktopResolvedTheme>({
    theme: UMBRADESKTOP_UMBRACO_THEME,
    variant: highContrast ? 'dark' : 'light',
    palette: UMBRADESKTOP_UMBRACO_THEME.palettes.light,
    highContrast,
  });

  wrapper = document.createElement('div');
  document.body.append(wrapper);
  new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
    wallpaper: new UmbObjectState({ ref: { kind: 'none' } }).asObservable(),
    theme: new UmbStringState('umbraco').asObservable(),
    getHostElement: () => wrapper,
  } as never).hostConnected();
  new UmbContextProvider(wrapper, UMBRADESKTOP_THEME_CONTEXT, {
    resolved: resolved.asObservable(),
    backofficeThemes: new UmbArrayState(CORE, (theme) => theme.alias).asObservable(),
    backofficeTheme: alias.asObservable(),
    setBackofficeTheme: () => undefined,
    getHostElement: () => wrapper,
  } as never).hostConnected();

  panel = document.createElement('umbradesktop-settings-appearance') as UmbraDesktopSettingsAppearanceElement;
  wrapper.append(panel);
  await panel.updateComplete;
}

/** The screen's sections, in the order it draws them. */
const sections = () => [...panel.shadowRoot!.querySelectorAll<HTMLElement>('section')];

afterEach(() => wrapper?.remove());

it('holds the backoffice colours as a third row of its own, below theme and wallpaper', async () => {
  await mountPanel();

  // Its own row, and last: folding Light and Dark into the theme picker above would say they are
  // desktop skins, which is exactly what they are not — they restyle the documents inside the
  // windows, and ours never touch those.
  expect(sections()).to.have.lengthOf(3);
  expect(sections()[2].querySelector('h4')?.textContent?.trim()).to.match(/backoffice/i);
  expect(sections()[2].querySelector('umbradesktop-settings-row')).to.not.equal(null);
});

it('shows the colours in force beside the row, in the same box as the previews above it', async () => {
  await mountPanel();

  // Three settings of one kind showing three sizes of picture is what made this panel look
  // assembled rather than designed, and a bare icon between two 16:10 previews is the same fault
  // in a smaller way. The swatch takes the preview's box, so the three rows' text starts on one
  // line.
  const swatch = sections()[2].querySelector('.scheme') as HTMLElement;
  const wallpaper = sections()[1].querySelector('.preview') as HTMLElement;

  expect(swatch, 'no colour swatch on the backoffice row').to.not.equal(null);
  expect(swatch.getBoundingClientRect().width).to.be.closeTo(wallpaper.getBoundingClientRect().width, 0.5);
  expect(swatch.getBoundingClientRect().height).to.be.closeTo(wallpaper.getBoundingClientRect().height, 0.5);
});

it('paints that swatch from the tokens the backoffice itself sets, not from named colours', async () => {
  await mountPanel();
  const swatch = sections()[2].querySelector('.scheme') as HTMLElement;

  // The whole reason it can be honest about a theme nobody here has heard of: the panel is inside
  // the backoffice document, so these tokens already hold whatever the theme in force set them to.
  // Naming Light's white and Dark's near-black would be a third list to keep in step, and would
  // have nothing to say about a theme a package registered.
  wrapper.style.setProperty('--uui-color-surface', 'rgb(12, 34, 56)');
  await panel.updateComplete;

  expect(getComputedStyle(swatch).backgroundColor).to.equal('rgb(12, 34, 56)');
});

it('names the backoffice theme in use on that row', async () => {
  await mountPanel(false, 'umb-dark-theme');

  const row = sections()[2].querySelector('umbradesktop-settings-row');
  expect(row?.getAttribute('headline')).to.equal('Dark (Experimental)');
});

it('follows the setting when it is changed in the current-user modal', async () => {
  await mountPanel();

  alias.setValue('umb-high-contrast-theme');
  await panel.updateComplete;

  expect(sections()[2].querySelector('umbradesktop-settings-row')?.getAttribute('headline')).to.equal(
    'High contrast (Experimental)',
  );
});

it('puts the high-contrast explanation under the control that causes it', async () => {
  await mountPanel(true);

  // It used to sit under the theme row, explaining something set on a screen the user could not
  // reach from here. Now it is under the row that sets it.
  expect(sections()[0].querySelector('.hint'), 'the hint is still under the desktop theme row').to.equal(null);
  expect(sections()[2].querySelector('.hint'), 'no high-contrast hint under the backoffice row').to.not.equal(null);
});

it('says nothing about high contrast when the backoffice is not in it', async () => {
  await mountPanel(false);

  expect(sections()[2].querySelector('.hint')).to.equal(null);
});
