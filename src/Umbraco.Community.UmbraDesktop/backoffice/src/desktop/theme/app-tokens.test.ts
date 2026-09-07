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
 * Every place an app token value is written down: the fallback set plus each theme's palettes, as
 * `[where, token, value]` triples so a failure can name the file a reader has to go and edit.
 *
 * Built once and shared, because the two invariants below (no unitless number, and the fallback
 * surfaces being distinct) are both properties of *values* rather than of names, and a second
 * hand-rolled walk over the same six palettes is a second place to forget a variant.
 *
 * @returns One triple per app token value that any palette or the fallback set actually sets.
 */
function everyAppTokenValue(): ReadonlyArray<readonly [string, UmbraDesktopAppToken, string]> {
  const values: [string, UmbraDesktopAppToken, string][] = [];

  for (const token of UMBRADESKTOP_APP_TOKENS) {
    values.push(['UMBRADESKTOP_APP_TOKEN_FALLBACKS', token, UMBRADESKTOP_APP_TOKEN_FALLBACKS[token]]);
  }

  for (const theme of UMBRADESKTOP_THEMES) {
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      // A theme need not ship a dark palette (Win98 and Umbraco 4 do not).
      if (!palette) continue;
      for (const token of UMBRADESKTOP_APP_TOKENS) {
        const value = palette[token];
        // The identity theme sets none of them, and a missing token is the coverage test's failure.
        if (value === undefined) continue;
        values.push([`${theme.id}.${variant}`, token, value]);
      }
    }
  }

  return values;
}

/**
 * A bare number — `0` above all — is a valid `<length>` on its own and **invalid inside `calc()`,
 * `min()` or `max()`**, where CSS demands a unit even on zero. The failure is silent and takes the
 * whole declaration with it, so this is the one hazard in the group that no amount of review at the
 * consuming end can defend against: the app author reads `edge-width`, writes
 * `max(1px, var(--umbradesktop-app-edge-width))` to floor a grid ruling, and loses the entire
 * `border` shorthand including `border-style`, under exactly the two themes that publish zero.
 *
 * Which is not a hypothetical. Minesweeper, the first consumer of this contract and the first code
 * to read these tokens from outside this repository, hit it on its closed board.
 *
 * The chrome's own tokens can get away with a unitless zero — Win11's `launcher-card-radius` is
 * one — because both ends of that contract are in this repository and a reader that wraps one in
 * `calc()` is a diff away from being fixed. This group cannot: its readers ship in packages this
 * repository cannot inspect, let alone edit. Hence the assertion, rather than a comment in six
 * palette files that the seventh theme author will not have read.
 *
 * Written as "no bare number" rather than "no bare zero" on purpose. Every token in this group is a
 * length or a colour and none of them is legally unitless, so `0.5` would be as broken as `0` and
 * there is nothing to be gained by only catching the value that happens to have shipped.
 */
it('never publishes an app token as a unitless number, which cannot survive a calc()', () => {
  // A value that is nothing but digits (with an optional sign, decimal point or exponent) and no
  // unit. Anything with a unit, a function, a colour or a keyword in it passes.
  const UNITLESS_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

  const offenders = everyAppTokenValue()
    .filter(([, , value]) => UNITLESS_NUMBER.test(value.trim()))
    .map(([where, token, value]) => `${where} sets ${token} to '${value}'`);

  expect(
    offenders,
    'these app token values are unitless numbers — valid as a standalone length but invalid inside ' +
      "calc(), min() or max(), where the whole declaration is dropped silently. Write '0px' rather " +
      "than '0'. The consumers of this group are in other packages and cannot work around it",
  ).to.deep.equal([]);
});

/**
 * The three surfaces are documented as three distinct roles — a panel ground, a control face, a
 * recessed well — so a fallback set that resolves two of them to one value is a defect in the
 * contract's own data rather than a matter of taste. It shipped as one: `surface` and
 * `surface-raised` were both `var(--uui-color-surface)`, and under the identity theme, whose
 * palette is empty and whose values therefore *are* these fallbacks, Minesweeper measured a closed
 * cell against the app ground behind it at 1.00:1 — the same colour, separated only by a 1.43:1
 * hairline.
 *
 * **What this test proves, and what it does not.** These values are `var(--uui-*)` references,
 * resolved by whichever Umbraco theme stylesheet is loaded, so a unit test cannot compute their
 * contrast the way the palette test below computes a theme's hex codes: there is no number here to
 * measure. What it asserts is the weaker property that is still worth having, and the one whose
 * absence caused the bug: the three are three *different* references. That catches the collision
 * that shipped and any future one, and it does not prove the resolved colours are far enough apart
 * to see. They are not, in fact, and no `--uui-*` trio would be: the widest separation Umbraco's
 * surface family offers in its light theme is 1.07:1, well under the 3:1 WCAG 1.4.11 asks of a
 * control boundary. That is the boundary problem the design doc §6.1 settles on the app side with
 * the grid-gap technique in `desktop-apps.md` §4, and it is not something a fallback value can fix
 * without ceasing to be the Umbraco look.
 */
it('keeps the three surface fallbacks mutually distinguishable', () => {
  const surfaces = [
    '--umbradesktop-app-surface',
    '--umbradesktop-app-surface-raised',
    '--umbradesktop-app-surface-sunken',
  ] as const satisfies ReadonlyArray<UmbraDesktopAppToken>;

  // Normalised before comparing so that two spellings of one reference still read as a collision.
  const resolved = surfaces.map((token) => UMBRADESKTOP_APP_TOKEN_FALLBACKS[token].replace(/\s+/g, ''));
  const collisions: string[] = [];

  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      if (resolved[i] === resolved[j]) {
        collisions.push(`${surfaces[i]} and ${surfaces[j]} are both '${resolved[i]}'`);
      }
    }
  }

  expect(
    collisions,
    'these surface fallbacks resolve to the same value, so an app that reads only the published ' +
      'contract draws two of its three documented surfaces in one colour — a control face flush ' +
      'with the panel behind it under the identity theme, which is the default',
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

/**
 * The ratio WCAG 1.4.11 asks of "visual information required to identify user interface components
 * and their states", which is what a grid's ruling, a field's outline and a row separator are.
 *
 * 3:1 rather than the {@link WCAG_AA_BODY_TEXT} above because none of the pairs below is text: a
 * line is a graphical object, and holding it to the body-text ratio would force every theme's
 * divider to the weight of its own prose.
 */
const WCAG_NON_TEXT_BOUNDARY = 3;

/**
 * The boundary token, as the one contrast in this group that is *guaranteed* rather than left to a
 * theme's taste.
 *
 * Measured against **all three** surfaces and not against `surface` alone, which is the whole
 * reason the token exists: an app draws a line wherever it draws a control, so a value that is
 * legible on the panel and invisible in the well is no more usable than no value at all. The
 * `edge-*` pair is deliberately not held to this — a theme is entitled to a bevel as subtle as its
 * own controls, and two of the five publish `edge-width: 0px` — and Windows 11 is what happens when
 * an app has nothing else to reach for: `edge-dark` composited to 1.15:1 against a closed cell in
 * light mode and 1.33:1 in dark, over a fill step of 1.03:1 and 1.20:1. That is what a reported
 * "the contrast is way too low" looks like from inside a palette file, and it was found in a
 * browser by a person rather than here, which is the gap this closes.
 *
 * A palette whose three surfaces are too far apart for any single line colour to clear 3:1 against
 * all of them fails this test, and that failure is the right one: it says the surfaces are not one
 * family, not that the border colour was chosen badly.
 */
it('keeps the boundary token visible against every surface an app may draw it on', () => {
  const grounds = [
    '--umbradesktop-app-surface',
    '--umbradesktop-app-surface-raised',
    '--umbradesktop-app-surface-sunken',
  ] as const satisfies ReadonlyArray<UmbraDesktopAppToken>;

  const failures: string[] = [];
  // Separate from `failures` for the same reason the text test keeps the two apart: a translucent
  // or computed value would quietly empty this test rather than fail it, and a boundary colour has
  // no defined contrast without knowing what is behind it.
  const unmeasurable: string[] = [];

  for (const theme of UMBRADESKTOP_THEMES) {
    // The identity theme sets nothing and its fallbacks are `var(--uui-*)` references with no
    // number in them, exactly as in the text test above.
    if (theme.id === UMBRADESKTOP_UMBRACO_THEME.id) continue;

    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      // A theme need not ship a dark palette (Win98 and Umbraco 4 do not).
      if (!palette) continue;

      const border = palette['--umbradesktop-app-border'];
      // A missing token is the coverage test's failure, not this one's.
      if (border === undefined) continue;

      for (const ground of grounds) {
        const value = palette[ground];
        if (value === undefined) continue;

        const where = `${theme.id}.${variant} --umbradesktop-app-border on ${ground}`;
        const ratio = contrastRatio(border, value);
        if (ratio === null) {
          unmeasurable.push(`${where} (${border} on ${value})`);
          continue;
        }
        if (ratio < WCAG_NON_TEXT_BOUNDARY) {
          failures.push(`${where} is ${ratio.toFixed(2)}:1, below ${WCAG_NON_TEXT_BOUNDARY}:1`);
        }
      }
    }
  }

  expect(
    failures,
    'these boundary pairs fall below WCAG 1.4.11 for a control boundary — an app ruling a grid or ' +
      'outlining a field with this token draws a line nobody can see on that surface, and cannot ' +
      'know it from inside another package',
  ).to.deep.equal([]);
  expect(
    unmeasurable,
    'the boundary token and the surfaces must stay opaque colours (#rgb, #rrggbb or rgb()/rgba() ' +
      'at full alpha) or the 3:1 this token guarantees is not being checked at all',
  ).to.deep.equal([]);
});
