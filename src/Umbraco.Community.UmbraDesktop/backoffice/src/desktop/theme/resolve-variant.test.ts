import { expect } from '@open-wc/testing';
import { resolveTheme } from './resolve-variant';
import { UMBRADESKTOP_UMBRACO_THEME } from './themes/umbraco/index';
import type { UmbraDesktopTheme } from './types';

const dual: UmbraDesktopTheme = {
  id: 'dual',
  name: 'Dual',
  swatch: { chrome: '#000', accent: '#111', surface: '#222' },
  palettes: {
    light: { '--umbradesktop-window-background': 'white' },
    dark: { '--umbradesktop-window-background': 'black' },
  },
  metrics: {
    titlebarHeight: 30, leadingControlsWidth: 124, trailingControlsWidth: 0,
    grab: 80, taskbarReserve: 62,
  },
};

const lightOnly: UmbraDesktopTheme = { ...dual, id: 'light-only', palettes: { light: dual.palettes.light } };
const catalogue = [UMBRADESKTOP_UMBRACO_THEME, dual, lightOnly];

it('picks the light palette under the light backoffice theme', () => {
  const result = resolveTheme({ themeId: 'dual', umbThemeAlias: 'umb-light-theme', catalogue });
  expect(result.theme).to.equal(dual);
  expect(result.palette).to.equal(dual.palettes.light);
  expect(result.variant).to.equal('light');
});

it('picks the dark palette under the dark backoffice theme', () => {
  const result = resolveTheme({ themeId: 'dual', umbThemeAlias: 'umb-dark-theme', catalogue });
  expect(result.palette).to.equal(dual.palettes.dark);
  expect(result.variant).to.equal('dark');
});

it('falls back to light when a theme ships no dark palette', () => {
  const result = resolveTheme({ themeId: 'light-only', umbThemeAlias: 'umb-dark-theme', catalogue });
  expect(result.theme).to.equal(lightOnly);
  expect(result.palette).to.equal(lightOnly.palettes.light);
  expect(result.variant).to.equal('light');
});

it('forces the Umbraco theme under high contrast, whatever was chosen', () => {
  // Accessibility beats fidelity: the high-contrast stylesheet redefines --uui-* tokens, which
  // only the identity theme reads.
  const result = resolveTheme({ themeId: 'dual', umbThemeAlias: 'umb-high-contrast-theme', catalogue });
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
  expect(result.forcedByContrast).to.equal(true);
});

it('falls back to the Umbraco theme when the stored id is unknown', () => {
  const result = resolveTheme({ themeId: 'removed-in-an-upgrade', umbThemeAlias: 'umb-light-theme', catalogue });
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
  expect(result.forcedByContrast).to.equal(false);
});

it('reports no forcing under a normal backoffice theme', () => {
  expect(resolveTheme({ themeId: 'dual', umbThemeAlias: 'umb-light-theme', catalogue }).forcedByContrast).to.equal(false);
});

it('falls back to the Umbraco theme when the catalogue is empty', () => {
  // The fallback goes straight to the identity theme rather than looking up a default id, so an
  // empty or broken catalogue still resolves to something paintable.
  const result = resolveTheme({ themeId: 'dual', umbThemeAlias: 'umb-light-theme', catalogue: [] });
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
});

it('treats an empty dark palette as a dark variant, not a missing one', () => {
  // `{}` is truthy, and a theme may legitimately ship a dark variant that only needs the CSS
  // fallbacks — that is exactly what the Umbraco identity theme's light palette is.
  const emptyDark: UmbraDesktopTheme = { ...dual, id: 'empty-dark', palettes: { light: {}, dark: {} } };
  const result = resolveTheme({
    themeId: 'empty-dark',
    umbThemeAlias: 'umb-dark-theme',
    catalogue: [emptyDark],
  });
  expect(result.variant).to.equal('dark');
  expect(result.palette).to.equal(emptyDark.palettes.dark);
});
