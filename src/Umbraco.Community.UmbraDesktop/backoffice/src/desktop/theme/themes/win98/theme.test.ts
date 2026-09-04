import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from '../index.js';
import { UMBRADESKTOP_TOKENS } from '../../types.js';
import type { UmbraDesktopThemeSheets } from '../../types.js';
import { UMBRADESKTOP_WIN98_THEME } from './index.js';
import { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import { WIN98_TASKBAR_HEIGHT } from './metrics.js';

/**
 * The Win98 theme's side of the theming contract, checked as rules rather than by eye. Everything
 * here is something a later edit could break silently: a radius token left unset would round one
 * corner of an otherwise square design, a `display: none` slipped into a sheet would strip a
 * launcher affordance and leave a user with no route back to the theme picker, and an
 * `!important` would win at the wrong moment and stop being overridable at all.
 *
 * The rendered geometry — where the drag clamp thinks the controls are — is checked separately in
 * `metrics.test.ts`, against what a real browser paints.
 */

/** Load the theme's authored sheets, or fail the test if it ships none. */
async function win98Sheets(): Promise<UmbraDesktopThemeSheets> {
  const load = UMBRADESKTOP_WIN98_THEME.sheets;
  expect(load, 'the Win98 theme should ship stylesheets').to.be.a('function');
  return await load!();
}

/** Every surface's CSS text as one string, so a rule can be looked for across the whole theme. */
async function win98Css(): Promise<string> {
  const sheets = await win98Sheets();
  return Object.values(sheets)
    .map((sheet) => sheet?.cssText ?? '')
    .join('\n');
}

it('is registered in the shipped catalogue, after the themes that came before it', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const ids = UMBRADESKTOP_THEMES.map((theme) => theme.id);

  expect(ids, 'the Win98 theme should be selectable').to.include('win98');
  expect(
    ids.indexOf('win98'),
    'the catalogue is in picker order, and Win98 was added after Umbraco and macOS',
  ).to.be.greaterThan(ids.indexOf('macos'));
});

it('ships a light palette only, so all three backoffice themes resolve to the same chrome', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  expect(
    UMBRADESKTOP_WIN98_THEME.palettes.dark,
    'Windows 98 had no dark appearance; the chrome is the same under light, dark and high ' +
      'contrast, and only the window content follows the backoffice',
  ).to.equal(undefined);
  expect(Object.keys(UMBRADESKTOP_WIN98_THEME.palettes.light).length).to.be.greaterThan(0);
});

it('squares every corner the chrome can round', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const palette = UMBRADESKTOP_WIN98_THEME.palettes.light;
  const radiusTokens = UMBRADESKTOP_TOKENS.filter((token) => token.endsWith('-radius'));
  const notSquared = radiusTokens.filter((token) => palette[token] !== '0');

  expect(
    notSquared,
    'these radius tokens are not set to "0", so their Umbraco fallback rounds a corner of a ' +
      'design that has none — Win98 must square every one of them',
  ).to.deep.equal([]);
  // Guards the guard: a rename in UMBRADESKTOP_TOKENS that dropped the '-radius' suffix would
  // otherwise turn the check above into a vacuous pass over an empty list.
  expect(radiusTokens.length, 'the chrome should still expose radius tokens').to.be.greaterThan(0);
});

it('reports a taskbar reserve equal to the bar it actually paints', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // A flush bar occupies exactly its own height, unlike the macOS dock which also needs the gap
  // beneath it. Both numbers come from WIN98_TASKBAR_HEIGHT so they cannot drift, and this is the
  // assertion that says so out loud.
  expect(UMBRADESKTOP_WIN98_THEME.metrics.taskbarReserve).to.equal(WIN98_TASKBAR_HEIGHT);
  expect(
    UMBRADESKTOP_WIN98_THEME.palettes.light['--umbradesktop-taskbar-reserve'],
    'the palette and the metrics have to agree, or windows and the bar disagree about the bottom edge',
  ).to.equal(`${WIN98_TASKBAR_HEIGHT}px`);
});

it('keeps its window controls at the titlebar\'s trailing end', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const { leadingControlsWidth, trailingControlsWidth } = UMBRADESKTOP_WIN98_THEME.metrics;

  expect(
    leadingControlsWidth,
    'Win98 puts nothing at the leading end of the caption, so the drag clamp reserves nothing there',
  ).to.equal(0);
  expect(
    trailingControlsWidth,
    'the four window buttons live at the trailing end and are not draggable',
  ).to.be.greaterThan(0);
});

it('paints a swatch the picker can tell apart from every other theme', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const win98 = UMBRADESKTOP_WIN98_THEME.swatch;

  for (const other of UMBRADESKTOP_THEMES.filter((theme) => theme.id !== 'win98')) {
    const differences = (['chrome', 'accent', 'surface'] as const).filter(
      (slot) => other.swatch[slot].toLowerCase() !== win98[slot].toLowerCase(),
    );
    expect(
      differences.length,
      `the Win98 swatch differs from "${other.id}" in only ${differences.length} of its three ` +
        'colours — two previews that share two stripes are not distinguishable at picker size',
    ).to.be.greaterThan(1);
  }
});

it('restyles the launcher without removing any of its affordances', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const css = await win98Css();
  const hidden = css.match(/display\s*:\s*none/g) ?? [];

  expect(
    hidden,
    'a Win98 sheet hides an element. A theme may restyle, never remove: search, tiles, pinning, ' +
      'the user button, Desktop settings and Exit all have to stay reachable, or a user can end ' +
      'up in this theme with no way back to the picker',
  ).to.deep.equal([]);
});

it('needs no !important anywhere, because theme sheets are appended and already win', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Asserted across every shipped theme rather than Win98 alone: the rule is the system's, and
  // the moment one theme reaches for !important the next one cannot override it.
  const offenders: string[] = [];

  for (const theme of UMBRADESKTOP_THEMES) {
    if (!theme.sheets) continue;
    const sheets = await theme.sheets();
    for (const [surface, sheet] of Object.entries(sheets)) {
      if (sheet?.cssText.includes('!important')) offenders.push(`${theme.id}/${surface}`);
    }
  }

  expect(
    offenders,
    'these theme stylesheets use !important. Theme sheets are adopted after each component\'s ' +
      'own styles, so they already win at equal specificity — a rule that is not applying has ' +
      'the wrong selector',
  ).to.deep.equal([]);
});
