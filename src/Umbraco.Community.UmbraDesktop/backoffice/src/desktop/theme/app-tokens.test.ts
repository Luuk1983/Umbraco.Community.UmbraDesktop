import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_APP_TOKEN_FALLBACKS, UMBRADESKTOP_APP_TOKENS, UMBRADESKTOP_TOKENS } from './types.js';
import { UMBRADESKTOP_THEMES } from './themes/index.js';
import { UMBRADESKTOP_UMBRACO_THEME } from './themes/umbraco/index.js';

/**
 * The app token group is a *published contract* with no reader inside this package — apps that
 * consume it live in other packages (see the design doc §6.1 and D8). That is why it is a separate
 * list from `UMBRADESKTOP_TOKENS`, whose own test asserts every entry is read by one of the four
 * chrome components. These tests hold the invariants that keep the two lists from bleeding.
 */

it('names every app token under the --umbradesktop-app- prefix', () => {
  expect(UMBRADESKTOP_APP_TOKENS.length).to.be.greaterThan(0);
  for (const token of UMBRADESKTOP_APP_TOKENS) {
    expect(token, `${token} must carry the app prefix`).to.match(/^--umbradesktop-app-[a-z]+(?:-[a-z]+)*$/);
  }
});

it('keeps the app tokens disjoint from the chrome tokens', () => {
  const chrome = new Set<string>(UMBRADESKTOP_TOKENS);
  const overlap = UMBRADESKTOP_APP_TOKENS.filter((token) => chrome.has(token));
  expect(
    overlap,
    'these tokens are in both lists — a token belongs to the chrome (read by a component, checked ' +
      'by tokens.test.ts) or to apps (read by another package), never both',
  ).to.deep.equal([]);
});

it('never lets a chrome token wander into the app namespace', () => {
  // Nothing else would catch this: a `--umbradesktop-app-*` name declared in UMBRADESKTOP_TOKENS
  // would satisfy tokens.test.ts (it would just need matching chrome CSS), satisfy the disjointness
  // test above (it would only be in one list), and never appear in UMBRADESKTOP_APP_TOKENS at all.
  // A host component declaring it on a descendant of `.desktop` would then beat the palette an app
  // inherits and make that name unthemeable by the app's own package — the exact failure mode the
  // fallback doc on UMBRADESKTOP_APP_TOKENS above warns about.
  const offenders = UMBRADESKTOP_TOKENS.filter((token) => token.startsWith('--umbradesktop-app-'));
  expect(
    offenders,
    'these chrome tokens use the app prefix — a chrome-owned custom property must not start with ' +
      '--umbradesktop-app-, since that namespace is reserved for tokens with no reader in this package',
  ).to.deep.equal([]);
});

it('has no duplicate app tokens', () => {
  const unique = new Set<string>(UMBRADESKTOP_APP_TOKENS);
  expect(unique.size).to.equal(UMBRADESKTOP_APP_TOKENS.length);
});

it('gives every app token exactly one fallback entry, no more and no fewer', () => {
  // The `satisfies Record<UmbraDesktopAppToken, string>` clause on UMBRADESKTOP_APP_TOKEN_FALLBACKS
  // covers this at compile time, but web-test-runner transpiles through esbuild without type
  // checking (see the repo's "run both npm test and npm run build" rule), so this is what actually
  // catches drift in a test run.
  const declared = new Set<string>(UMBRADESKTOP_APP_TOKENS);
  const fallbackKeys = Object.keys(UMBRADESKTOP_APP_TOKEN_FALLBACKS);

  const missingFallback = UMBRADESKTOP_APP_TOKENS.filter(
    (token) => !Object.prototype.hasOwnProperty.call(UMBRADESKTOP_APP_TOKEN_FALLBACKS, token),
  );
  const extraFallback = fallbackKeys.filter((key) => !declared.has(key));

  expect(
    missingFallback,
    'these app tokens have no entry in UMBRADESKTOP_APP_TOKEN_FALLBACKS — an app consuming them has ' +
      'no published fallback to write',
  ).to.deep.equal([]);
  expect(
    extraFallback,
    'these fallback keys do not correspond to any entry in UMBRADESKTOP_APP_TOKENS — either the ' +
      'token was removed and the fallback is stale, or the key is misspelled',
  ).to.deep.equal([]);
});

/**
 * A theme that answers the chrome tokens but not the app tokens would render a correct desktop
 * around an app painted in another theme's colours. The identity theme is the deliberate exception:
 * its palette is empty by design, and the fallbacks an app carries *are* the Umbraco look, so
 * requiring it to restate them here would duplicate the contract and break that guarantee.
 */
it('has every non-identity theme palette answer every app token', () => {
  const missing: string[] = [];

  for (const theme of UMBRADESKTOP_THEMES) {
    // Identified by id, not by "is the palette empty". The heuristic would invert this test's
    // intent the moment the identity theme sets a single chrome token: it would silently start
    // demanding all eleven app tokens from the one theme that must answer none. Compared against
    // the theme's own id rather than the literal 'umbraco' so a rename cannot leave this stale.
    if (theme.id === UMBRADESKTOP_UMBRACO_THEME.id) continue;
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      // A theme need not ship a dark palette (Win98 and Umbraco 4 do not).
      if (!palette) continue;
      for (const token of UMBRADESKTOP_APP_TOKENS) {
        if (!(token in palette)) missing.push(`${theme.id}.${variant} is missing ${token}`);
      }
    }
  }

  expect(
    missing,
    'every theme other than the identity theme must answer the whole app token group, or an app ' +
      'will fall back to the Umbraco look on some tokens and this theme on others',
  ).to.deep.equal([]);
});

it('keeps the Umbraco identity theme palette empty', () => {
  expect(
    Object.keys(UMBRADESKTOP_UMBRACO_THEME.palettes.light ?? {}),
    'the identity theme renders today\'s look by setting nothing; app fallbacks are its values',
  ).to.deep.equal([]);
});
