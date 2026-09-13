import { expect } from '@open-wc/testing';
import { backofficeVariant, resolveTheme } from './resolve-variant';
import { UMBRADESKTOP_UMBRACO_THEME } from './themes/umbraco/index';
import type { UmbraDesktopTheme } from './types';

const dual: UmbraDesktopTheme = {
  id: 'dual',
  name: 'Dual',
  descriptionKey: 'umbraDesktop_themeAboutDual',
  palettes: {
    light: { '--umbradesktop-window-background': 'white' },
    dark: { '--umbradesktop-window-background': 'black' },
  },
  metrics: {
    titlebarHeight: 30, leadingControlsWidth: 124, trailingControlsWidth: 0,
    grab: 80, chromeWidth: 0, chromeHeight: 29, pathbarHeight: 24, taskbarReserve: 62,
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

it('keeps the chosen theme under high contrast, on its darkest palette', () => {
  // High contrast used to throw the chosen theme away for the identity one. It no longer does:
  // the accessibility win is in the *content*, which is a separate document running Umbraco's own
  // high-contrast stylesheet either way, and losing your chrome for it bought nothing.
  const result = resolveTheme({ themeId: 'dual', umbThemeAlias: 'umb-high-contrast-theme', catalogue });
  expect(result.theme).to.equal(dual);
  expect(result.palette).to.equal(dual.palettes.dark);
  expect(result.variant).to.equal('dark');
  expect(result.highContrast).to.equal(true);
});

it('falls back to light under high contrast when a theme ships no dark palette', () => {
  // Nothing to fall back *to* is a legitimate outcome: such a theme simply looks the same under
  // all three backoffice themes, and its windows still go high contrast.
  const result = resolveTheme({ themeId: 'light-only', umbThemeAlias: 'umb-high-contrast-theme', catalogue });
  expect(result.theme).to.equal(lightOnly);
  expect(result.variant).to.equal('light');
  expect(result.highContrast).to.equal(true);
});

it('still falls back to the Umbraco theme under high contrast when the stored id is unknown', () => {
  const result = resolveTheme({ themeId: 'gone', umbThemeAlias: 'umb-high-contrast-theme', catalogue });
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
});

it('falls back to the Umbraco theme when the stored id is unknown', () => {
  const result = resolveTheme({ themeId: 'removed-in-an-upgrade', umbThemeAlias: 'umb-light-theme', catalogue });
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
  expect(result.highContrast).to.equal(false);
});

it('reports no high contrast under a normal backoffice theme', () => {
  expect(resolveTheme({ themeId: 'dual', umbThemeAlias: 'umb-light-theme', catalogue }).highContrast).to.equal(false);
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

it('reads the backoffice as dark whether or not the chosen theme has a dark palette', () => {
  // Distinct from `resolveTheme().variant`, which answers a different question: *which palette is
  // being painted*, and so says "light" for a theme that never wrote a dark one. This says what the
  // backoffice itself is set to, which is what a row of previews of *other* themes needs — each of
  // those does its own fallback.
  expect(backofficeVariant('umb-dark-theme')).to.equal('dark');
  expect(backofficeVariant('umb-high-contrast-theme')).to.equal('dark');
  expect(backofficeVariant('umb-light-theme')).to.equal('light');
  // An alias from a theme nobody registers any more is not dark, which is also what core falls
  // back to when it cannot load a theme's stylesheet.
  expect(backofficeVariant('acme-gone')).to.equal('light');
  expect(backofficeVariant('')).to.equal('light');
});

it('does not report a dark backoffice as light just because the theme has no dark palette', () => {
  // The bug this pair exists for: with the Umbraco theme chosen — it ships no dark palette — the
  // resolved variant is "light" in a dark backoffice, and the theme picker painted every miniature
  // in it. Four themes leave the window body on the backoffice's own token and looked dark anyway;
  // macOS is the one theme that states the body colour in both palettes, so it alone came out
  // white, in a dark panel, next to four dark ones.
  const resolved = resolveTheme({ themeId: 'light-only', umbThemeAlias: 'umb-dark-theme', catalogue });

  expect(resolved.variant, 'the palette in force is still the light one').to.equal('light');
  expect(backofficeVariant('umb-dark-theme'), 'but the backoffice is dark').to.equal('dark');
});
