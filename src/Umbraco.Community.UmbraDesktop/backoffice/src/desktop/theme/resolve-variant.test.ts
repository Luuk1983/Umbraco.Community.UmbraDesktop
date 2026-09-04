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
  const result = resolveTheme('dual', 'umb-light-theme', catalogue);
  expect(result.theme).to.equal(dual);
  expect(result.palette).to.equal(dual.palettes.light);
  expect(result.variant).to.equal('light');
});

it('picks the dark palette under the dark backoffice theme', () => {
  const result = resolveTheme('dual', 'umb-dark-theme', catalogue);
  expect(result.palette).to.equal(dual.palettes.dark);
  expect(result.variant).to.equal('dark');
});

it('falls back to light when a theme ships no dark palette', () => {
  const result = resolveTheme('light-only', 'umb-dark-theme', catalogue);
  expect(result.theme).to.equal(lightOnly);
  expect(result.palette).to.equal(lightOnly.palettes.light);
  expect(result.variant).to.equal('light');
});

it('forces the Umbraco theme under high contrast, whatever was chosen', () => {
  // Accessibility beats fidelity: the high-contrast stylesheet redefines --uui-* tokens, which
  // only the identity theme reads.
  const result = resolveTheme('dual', 'umb-high-contrast-theme', catalogue);
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
  expect(result.forcedByContrast).to.equal(true);
});

it('falls back to the Umbraco theme when the stored id is unknown', () => {
  const result = resolveTheme('removed-in-an-upgrade', 'umb-light-theme', catalogue);
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
  expect(result.forcedByContrast).to.equal(false);
});

it('reports no forcing under a normal backoffice theme', () => {
  expect(resolveTheme('dual', 'umb-light-theme', catalogue).forcedByContrast).to.equal(false);
});
