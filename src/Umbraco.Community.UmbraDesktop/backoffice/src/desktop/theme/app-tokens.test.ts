import { expect } from '@open-wc/testing';
import type { UmbraDesktopAppToken } from './types.js';
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
    // demanding all of the app tokens from the one theme that must answer none. Compared against
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
    Object.keys(UMBRADESKTOP_UMBRACO_THEME.palettes.light),
    'the identity theme renders today\'s look by setting nothing; app fallbacks are its values',
  ).to.deep.equal([]);
  // The dark half is checked here rather than nowhere. The coverage test above skips this theme
  // outright, so a `palettes.dark` grown here later would be asserted by nothing at all: it would
  // silently break the "sets nothing" guarantee in exactly the variant hardest to notice by eye.
  expect(
    Object.keys(UMBRADESKTOP_UMBRACO_THEME.palettes.dark ?? {}),
    'the identity theme must not ship a dark palette either; its dark look comes from the --uui-* ' +
      'fallbacks the chrome and the apps already carry',
  ).to.deep.equal([]);
});

/**
 * Contrast, as an enforced invariant rather than a reviewed one.
 *
 * Every failure the review of this group found — Win98's muted grey at 2.17:1 on its own face, both
 * macOS accents unable to carry text in either direction — was caught by a human reading hex codes
 * in a diff, which is not a process that scales to a sixth theme. The threshold is WCAG 2.1 AA for
 * body text, **4.5:1**, and it matters more here than anywhere in the chrome: an app author in
 * another package writes `color: var(--umbradesktop-app-text-muted)` on
 * `background: var(--umbradesktop-app-surface)` on the strength of this contract, has no way to
 * know that one theme's muted grey is illegible on its own ground, and would have no way to fix it
 * if they did. The chrome, by contrast, is ours: an unreadable taskbar is a bug we can see and
 * change in one file. A published token pair is a bug in somebody else's shipped package.
 *
 * 4.5:1 rather than the 3:1 of WCAG 1.4.11 because every pair below is text on a ground, and none
 * of these tokens is documented as large-text-only.
 */
const WCAG_AA_BODY_TEXT = 4.5;

/**
 * One text-on-ground pair the contract promises is legible, as a pair of app token names so a
 * renamed token is a compile error rather than a test that quietly measures nothing.
 */
interface ContrastPair {
  /** The token an app would put in `color`. */
  foreground: UmbraDesktopAppToken;
  /** The token an app would put in `background` underneath it. */
  background: UmbraDesktopAppToken;
}

/**
 * The pairs an app is entitled to assume are readable. `text` is checked against all three
 * surfaces because an app puts primary text on any of them — a label on the panel, a digit on a
 * key, a count in a well — while `text-muted` is only promised on the plain ground, which is the
 * one place secondary text actually goes. `accent-text` on `accent` is the pair that exists purely
 * so an app can fill a selection and write on it without branching per theme.
 */
const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: '--umbradesktop-app-text', background: '--umbradesktop-app-surface' },
  { foreground: '--umbradesktop-app-text', background: '--umbradesktop-app-surface-raised' },
  { foreground: '--umbradesktop-app-text', background: '--umbradesktop-app-surface-sunken' },
  { foreground: '--umbradesktop-app-text-muted', background: '--umbradesktop-app-surface' },
  { foreground: '--umbradesktop-app-accent-text', background: '--umbradesktop-app-accent' },
];

/**
 * Parse a palette value into 8-bit sRGB channels, or `null` when it is not an opaque colour.
 *
 * Deliberately narrow. It understands `#rgb`, `#rrggbb` and `rgb()`/`rgba()`, which is every form
 * the six palettes actually use for these tokens, and refuses everything else — a gradient, a
 * `var()`, a named colour, `transparent`, or an `rgba()` with alpha below 1. Refusing is the point:
 * a translucent or computed value has no defined luminance without knowing what is behind it, and
 * inventing a backdrop to measure against would turn a real unknown into a confident wrong number.
 * The caller skips what this returns `null` for and reports it separately.
 *
 * @param value The palette value as written in a `palette.ts`.
 * @returns The `[r, g, b]` channels in 0-255, or `null` if the value is not an opaque colour.
 */
function parseOpaqueColor(value: string): [number, number, number] | null {
  const text = value.trim();

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) {
    // `#abc` is `#aabbcc`, not `#0a0b0c`: each digit is doubled, not zero-padded.
    return [1, 2, 3].map((i) => parseInt(short[i] + short[i], 16)) as [number, number, number];
  }

  const long = /^#([0-9a-f]{6})$/i.exec(text);
  if (long) {
    return [0, 2, 4].map((i) => parseInt(long[1].slice(i, i + 2), 16)) as [number, number, number];
  }

  // Both the legacy comma syntax and the modern space syntax, with either separator before alpha.
  const functional = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (functional) {
    if (functional[4] !== undefined && Number(functional[4]) < 1) return null;
    return [1, 2, 3].map((i) => Number(functional[i])) as [number, number, number];
  }

  return null;
}

/**
 * Relative luminance per WCAG 2.1: each channel linearised out of sRGB's transfer curve, then
 * weighted for the eye's response, which is why green dominates the sum.
 *
 * @param rgb The `[r, g, b]` channels in 0-255.
 * @returns Relative luminance in 0-1.
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * The WCAG contrast ratio of two palette values, `(lighter + 0.05) / (darker + 0.05)`.
 *
 * Symmetric by construction — it sorts the two luminances rather than trusting the caller to pass
 * the lighter one first — so a pair whose direction flips between a theme's light and dark variants
 * (as Win11's accent does) needs no special handling at the call site.
 *
 * @param a One value.
 * @param b The other.
 * @returns The ratio, from 1 (identical) to 21 (black on white), or `null` if either value is not
 * an opaque colour and the pair therefore cannot be measured.
 */
function contrastRatio(a: string, b: string): number | null {
  const first = parseOpaqueColor(a);
  const second = parseOpaqueColor(b);
  if (!first || !second) return null;

  const luminances = [relativeLuminance(first), relativeLuminance(second)];
  const lighter = Math.max(...luminances);
  const darker = Math.min(...luminances);
  return (lighter + 0.05) / (darker + 0.05);
}

it('keeps every app text pair legible on the ground it is promised against', () => {
  // Accumulated rather than asserted per pair, the way the coverage test above accumulates missing
  // tokens: one run has to report every failure, because fixing a colour usually means re-checking
  // the others it sits next to and a fail-fast run would hide them one at a time.
  const failures: string[] = [];
  // The pairs that could not be measured at all. Kept separate from `failures` so the two cannot be
  // confused, and asserted empty below: without it, changing a palette value to a gradient or a
  // `var()` would empty this test of most of its coverage and still show green.
  //
  // Note the one place this is stricter than the contract. A `surface` token is explicitly allowed
  // to carry any `background` value, gradients included, and no shipped palette uses one for an app
  // surface today — every value below is a flat colour, so the assertion holds. If a theme ever
  // does want a gradient app ground, the right answer is to *extend* this helper to measure the
  // text against the worst of the gradient's colour stops, not to relax the assertion: dropping the
  // pair would quietly retire the only check that theme's readability has.
  const unmeasurable: string[] = [];

  for (const theme of UMBRADESKTOP_THEMES) {
    // Skipped for the same reason the coverage test skips it: its palette is empty by design, and
    // the values an app would actually resolve are `--uui-*` references this helper cannot read.
    if (theme.id === UMBRADESKTOP_UMBRACO_THEME.id) continue;

    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      // A theme need not ship a dark palette (Win98 and Umbraco 4 do not).
      if (!palette) continue;

      for (const { foreground, background } of CONTRAST_PAIRS) {
        const where = `${theme.id}.${variant} ${foreground} on ${background}`;
        const fg = palette[foreground];
        const bg = palette[background];

        // A token missing outright is the coverage test's failure, not this one's; reporting it
        // twice would make one palette mistake read as two unrelated defects.
        if (fg === undefined || bg === undefined) continue;

        const ratio = contrastRatio(fg, bg);
        if (ratio === null) {
          unmeasurable.push(`${where} (${fg} on ${bg})`);
          continue;
        }
        if (ratio < WCAG_AA_BODY_TEXT) {
          failures.push(`${where} is ${ratio.toFixed(2)}:1, below ${WCAG_AA_BODY_TEXT}:1`);
        }
      }
    }
  }

  expect(
    failures,
    `these app token pairs fail WCAG AA for body text (${WCAG_AA_BODY_TEXT}:1) — an app in another ` +
      'package reads these values on trust and cannot know a theme made its text illegible',
  ).to.deep.equal([]);
  expect(
    unmeasurable,
    'these app token pairs could not be measured, so this test is no longer checking them — a text ' +
      'or ground token must stay an opaque colour (#rgb, #rrggbb or rgb()/rgba() at full alpha) or ' +
      'the contrast it promises cannot be verified at all',
  ).to.deep.equal([]);
});
