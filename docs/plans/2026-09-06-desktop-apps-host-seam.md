# Desktop apps: host seam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the desktop to self-contained apps — an element in a window rather than a backoffice deep link — so a separate package can register one and have it look native under every theme.

**Architecture:** Three additive changes to the host, none of which any existing app notices. `UmbraDesktopApp.url` becomes a discriminated `content` union so a window body can be an element instead of an iframe. `deriveApps` gains a third, ungated pass fed by `umbraDesktopApp` manifests observed through `UmbExtensionsManifestInitializer` (which evaluates their `conditions`; `byType` does not). And the theme contract gains an app-surface token group so an app can paint itself correctly under a theme it has never heard of.

**Tech Stack:** TypeScript, Lit, `@umbraco-cms/backoffice` v17 extension API, `@open-wc/testing` in web-test-runner, Vite.

**Spec:** [`docs/design/2026-09-06-desktop-apps-design.md`](../design/2026-09-06-desktop-apps-design.md) §4–§7.

**Where to run commands.** `npm test` and `npm run build` run from `src/Umbraco.Community.UmbraDesktop`, and both `cd backoffice` internally. The single-file `npx web-test-runner …` commands in this plan must be run **from `src/Umbraco.Community.UmbraDesktop/backoffice`**, because that is where `web-test-runner.config.mjs` lives; run from anywhere else the config is not picked up and imports fail to resolve regardless of whether the code is correct. Their paths are relative to `backoffice/`.

`npm run build` regenerates `backoffice/src/desktop/settings/wallpapers.generated.ts`, which can then show as modified with an **empty** diff. That is a line-ending artifact (the generator writes LF, the repo stores CRLF), not a change. Do not commit it; `git restore` it if it appears.

**A mounted `uui-loader` stalls the test runner instead of failing it.** Found while mutation-testing Task 3, and worth knowing before it costs someone an hour: a spinner left in the DOM keeps the runner's page from ever reaching idle, so the file times out at 120 seconds with "Error while running tests" rather than reporting a clean failure. It is a property of web-test-runner, not of this code. Two consequences. A test that renders a loading state must settle it before it ends, as `app-host.element.test.ts`'s pending-state case does by resolving its loader. And if a mutation you introduce produces a 120-second stall rather than a red test, suspect a stuck spinner before you suspect the runner.

---

## Findings that amend the spec

Two things were verified against the installed Umbraco and the theme code while writing this plan. Both change what the spec says; the spec should be amended to match.

**1. §3's open question is answered: `byType` does not evaluate conditions.** `umbExtensionsRegistry.byType()` returns raw manifests. Condition evaluation lives in `UmbBaseExtensionInitializer`, where `permitted` is computed from the manifest's `conditions` and *no conditions means permitted* (`dist-cms/libs/extension-api/controller/base-extension-initializer.controller.js`). The public route to condition-evaluated manifests is `UmbExtensionsManifestInitializer`, exported from `@umbraco-cms/backoffice/extension-api`. Task 5 uses it. The §10 risk row about this can be struck.

**2. App tokens cannot have host-side fallbacks, so the fallback chain is documented contract and lives in each app.** The Umbraco identity theme ships `palettes: { light: {} }` deliberately: every chrome token's fallback lives in the component CSS that *reads* it, which is what makes "the Umbraco theme is unchanged" structural. App tokens have no host reader (spec D8), so there is nowhere in the host to put their fallbacks — and a host component writing `--umbradesktop-app-surface: …` on a descendant of `.desktop` would *beat* the theme palette it inherits, making the token unthemeable.

Therefore each app reads `var(--umbradesktop-app-surface, var(--uui-color-surface))`, exactly mirroring how the chrome does it, and the documented fallback set **is** the Umbraco look. Consequence for testing: the coverage test in Task 2 must exempt the identity theme rather than require it to answer the tokens.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `backoffice/src/desktop/theme/app-tokens.test.ts` | The app token contract's invariants. **Created by Task 1** (prefix, disjointness from the chrome list, fallback coverage); **appended to by Task 2** (every non-identity theme palette answers every token). A worker executing Task 2 alone should append, not recreate |
| `backoffice/src/desktop/app.extension.ts` | The `ManifestUmbraDesktopApp` type + `UmbExtensionManifestMap` augmentation |
| `backoffice/src/desktop/components/app-host.element.ts` | Mounts an app's element into a window body, in light DOM |
| `backoffice/src/desktop/components/app-host.element.test.ts` | Tests for the above |
| `backoffice/src/desktop/registered-apps.ts` | Pure: normalise `umbraDesktopApp` manifests into `UmbraDesktopRegisteredApp` |
| `backoffice/src/desktop/registered-apps.test.ts` | Tests for the above |
| `backoffice/src/desktop/catalogue/groups.test.ts` | The `games` group exists, sorts last, and every group has a token label |
| `docs/desktop-apps.md` | Contributor guide for building a desktop app, written for outside this repo |

**Modified**

| File | Change |
|---|---|
| `backoffice/src/desktop/theme/types.ts` | `UMBRADESKTOP_APP_TOKENS`, `UmbraDesktopAppToken`, widened `UmbraDesktopPalette` |
| `backoffice/src/desktop/theme/themes/{umbraco4,macos,win11,win98}/palette.ts` | App token values (6 palette objects; macos and win11 have dark too) |
| `backoffice/src/desktop/types.ts` | `UmbraDesktopAppContent`, `UmbraDesktopApp.content`, `UmbraDesktopRegisteredApp` |
| `backoffice/src/desktop/derive-apps.ts` | Both passes emit `content`; new third pass for registered apps |
| `backoffice/src/desktop/derive-apps.test.ts` | Updated for `content`; new registered-pass tests |
| `backoffice/src/desktop/app-catalogue.context.ts` | Observe `umbraDesktopApp` via `UmbExtensionsManifestInitializer` |
| `backoffice/src/desktop/components/window.element.ts` | Render element bodies; guard iframe-only paths; stamp the theme id |
| `backoffice/src/desktop/catalogue/groups.ts` | The `games` group |

Note `groupGames` already exists in both `localization/en.ts` and `localization/nl.ts`, added in anticipation. No localization work is needed.

---

### Task 1: The app token contract

**Files:**
- Modify: `backoffice/src/desktop/theme/types.ts`
- Test: `backoffice/src/desktop/theme/app-tokens.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `backoffice/src/desktop/theme/app-tokens.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_APP_TOKENS, UMBRADESKTOP_TOKENS } from './types.js';

/**
 * The app token group is a *published contract* with no reader inside this package — apps that
 * consume it live in other packages (see the design doc §6.1 and D8). That is why it is a separate
 * list from `UMBRADESKTOP_TOKENS`, whose own test asserts every entry is read by one of the four
 * chrome components. These tests hold the invariants that keep the two lists from bleeding.
 */

it('names every app token under the --umbradesktop-app- prefix', () => {
  expect(UMBRADESKTOP_APP_TOKENS.length).to.be.greaterThan(0);
  for (const token of UMBRADESKTOP_APP_TOKENS) {
    expect(token, `${token} must carry the app prefix`).to.match(/^--umbradesktop-app-[a-z-]+$/);
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

it('has no duplicate app tokens', () => {
  const unique = new Set<string>(UMBRADESKTOP_APP_TOKENS);
  expect(unique.size).to.equal(UMBRADESKTOP_APP_TOKENS.length);
});
```

- [ ] **Step 2: Run test to verify it fails**


```bash
npx web-test-runner "src/desktop/theme/app-tokens.test.ts" --node-resolve
```

Expected: FAIL. The import of `UMBRADESKTOP_APP_TOKENS` is undefined, so the first test errors on `.length` of undefined.

- [ ] **Step 3: Add the token list and widen the palette type**

In `backoffice/src/desktop/theme/types.ts`, immediately after the existing `UmbraDesktopToken` type, add:

```ts
/**
 * Every custom property an **app** may read — a self-contained app in a window (a game, a
 * calculator), not the chrome around it.
 *
 * Separate from {@link UMBRADESKTOP_TOKENS} on purpose. That list is checked against the CSS of the
 * four chrome components, exactly, so that a token nothing reads cannot sit there as dead weight.
 * These have no reader in this package at all: their consumers ship in other packages, which is
 * what makes them a published contract rather than drift. `app-tokens.test.ts` holds them instead.
 *
 * **There are no host-side fallbacks for these, and there cannot be.** The chrome puts each token's
 * fallback in the component that reads it, which is why the Umbraco identity theme can ship an
 * empty palette. An app's reader is in another package, and a host component declaring these on a
 * descendant of `.desktop` would beat the palette it inherits and make them unthemeable. So an app
 * carries its own fallback, and the fallback it is expected to carry is the Umbraco look:
 *
 * | Token | Fallback an app should write |
 * |---|---|
 * | `--umbradesktop-app-surface` | `var(--uui-color-surface)` |
 * | `--umbradesktop-app-surface-raised` | `var(--uui-color-surface)` |
 * | `--umbradesktop-app-surface-sunken` | `var(--uui-color-background)` |
 * | `--umbradesktop-app-edge-light` | `transparent` |
 * | `--umbradesktop-app-edge-dark` | `var(--uui-color-border)` |
 * | `--umbradesktop-app-edge-width` | `1px` |
 * | `--umbradesktop-app-radius` | `3px` |
 * | `--umbradesktop-app-text` | `var(--uui-color-text)` |
 * | `--umbradesktop-app-text-muted` | `var(--uui-color-text-alt)` |
 * | `--umbradesktop-app-accent` | `var(--uui-color-selected)` |
 * | `--umbradesktop-app-font` | `inherit` |
 *
 * `edge-width` and `radius` are the pair that lets one app stylesheet be both a bevelled Win98
 * control (width `2px`, radius `0`) and a flat rounded one (width `0`, radius `6px`) with no branch
 * in the app. Prefer widening this group over adding a per-theme branch to an app.
 */
export const UMBRADESKTOP_APP_TOKENS = [
  '--umbradesktop-app-surface',
  '--umbradesktop-app-surface-raised',
  '--umbradesktop-app-surface-sunken',
  '--umbradesktop-app-edge-light',
  '--umbradesktop-app-edge-dark',
  '--umbradesktop-app-edge-width',
  '--umbradesktop-app-radius',
  '--umbradesktop-app-text',
  '--umbradesktop-app-text-muted',
  '--umbradesktop-app-accent',
  '--umbradesktop-app-font',
] as const;

/** Every custom property an app may read. */
export type UmbraDesktopAppToken = (typeof UMBRADESKTOP_APP_TOKENS)[number];
```

Then change the `UmbraDesktopPalette` type so a palette may set either group:

```ts
export type UmbraDesktopPalette = Partial<
  Record<UmbraDesktopToken | UmbraDesktopAppToken, string>
>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx web-test-runner "src/desktop/theme/app-tokens.test.ts" --node-resolve
```

Expected: PASS, 3 tests.

Then confirm nothing else moved:

```bash
npm test
```

Expected: PASS. `tokens.test.ts` is unaffected — it compares `UMBRADESKTOP_TOKENS` against component CSS, and neither changed. Its semicolon lint now also covers app token values, which is wanted.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/theme/types.ts backoffice/src/desktop/theme/app-tokens.test.ts
git commit -m "feat: an app token group in the theme contract"
```

---

### Task 2: Every theme answers the app tokens

**Files:**
- Modify: `backoffice/src/desktop/theme/app-tokens.test.ts`
- Modify: `backoffice/src/desktop/theme/themes/win98/palette.ts`
- Modify: `backoffice/src/desktop/theme/themes/umbraco4/palette.ts`
- Modify: `backoffice/src/desktop/theme/themes/macos/palette.ts`
- Modify: `backoffice/src/desktop/theme/themes/win11/palette.ts`

- [ ] **Step 1: Write the failing coverage test**

Append to `backoffice/src/desktop/theme/app-tokens.test.ts`:

```ts
import { UMBRADESKTOP_THEMES } from './themes/index.js';
import { UMBRADESKTOP_UMBRACO_THEME } from './themes/umbraco/index.js';

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
```

Both the skip above and the emptiness assertion below now key off the same theme object, so they cannot disagree about which theme is the identity one.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx web-test-runner "src/desktop/theme/app-tokens.test.ts" --node-resolve
```

Expected: FAIL, listing 66 missing entries (11 tokens × 6 palettes: umbraco4 light, macos light, macos dark, win11 light, win11 dark, win98 light).

- [ ] **Step 3: Add the Win98 values**

In `backoffice/src/desktop/theme/themes/win98/palette.ts`, add to the `WIN98_LIGHT` object:

```ts
  // Apps. Win98 is the theme the app token group was shaped around: `edge-width: 2px` with
  // `radius: 0` is what makes a plain app stylesheet render as a bevelled control here and as a
  // flat rounded one everywhere else, with no branch in the app.
  '--umbradesktop-app-surface': WIN98_FACE,
  '--umbradesktop-app-surface-raised': WIN98_FACE,
  '--umbradesktop-app-surface-sunken': WIN98_WINDOW,
  '--umbradesktop-app-edge-light': WIN98_HILIGHT,
  '--umbradesktop-app-edge-dark': WIN98_SHADOW,
  '--umbradesktop-app-edge-width': '2px',
  '--umbradesktop-app-radius': '0',
  '--umbradesktop-app-text': WIN98_TEXT,
  '--umbradesktop-app-text-muted': WIN98_SHADOW,
  '--umbradesktop-app-accent': WIN98_MENU_HILIGHT,
  '--umbradesktop-app-font': WIN98_FONT,
```

- [ ] **Step 4: Add the Umbraco 4 values**

In `backoffice/src/desktop/theme/themes/umbraco4/palette.ts`, add to the `U4_LIGHT` object:

```ts
  // Apps. A single hairline edge rather than a two-tone bevel: Umbraco 4's controls were outlined,
  // not chiselled, so `edge-light` is the same white it uses to lift a panel and `edge-dark` is its
  // ordinary border colour.
  '--umbradesktop-app-surface': U4_FACE,
  '--umbradesktop-app-surface-raised': U4_FACE_LIT,
  '--umbradesktop-app-surface-sunken': U4_WELL,
  '--umbradesktop-app-edge-light': U4_HILIGHT,
  '--umbradesktop-app-edge-dark': U4_EDGE,
  '--umbradesktop-app-edge-width': '1px',
  '--umbradesktop-app-radius': '2px',
  '--umbradesktop-app-text': U4_TEXT,
  '--umbradesktop-app-text-muted': U4_TEXT_SOFT,
  '--umbradesktop-app-accent': U4_SELECT_LINE,
  '--umbradesktop-app-font': U4_FONT,
```

- [ ] **Step 5: Add the macOS values**

In `backoffice/src/desktop/theme/themes/macos/palette.ts`, add to `MACOS_LIGHT`:

```ts
  // Apps. No bevel at all: `edge-width: 0` is the point, and the separation comes from the sunken
  // surface instead. `edge-dark` matches the window border so an app that does draw a rule agrees
  // with the frame around it.
  '--umbradesktop-app-surface': '#ffffff',
  '--umbradesktop-app-surface-raised': '#ffffff',
  '--umbradesktop-app-surface-sunken': '#f2f2f7',
  '--umbradesktop-app-edge-light': '#ffffff',
  '--umbradesktop-app-edge-dark': 'rgba(0, 0, 0, 0.16)',
  '--umbradesktop-app-edge-width': '0',
  '--umbradesktop-app-radius': '6px',
  '--umbradesktop-app-text': '#2c2c2e',
  '--umbradesktop-app-text-muted': '#6e6e73',
  '--umbradesktop-app-accent': '#0a84ff',
  '--umbradesktop-app-font': MACOS_FONT,
```

And to `MACOS_DARK`:

```ts
  '--umbradesktop-app-surface': '#1e1e1e',
  '--umbradesktop-app-surface-raised': '#2c2c2e',
  '--umbradesktop-app-surface-sunken': '#000000',
  '--umbradesktop-app-edge-light': 'rgba(255, 255, 255, 0.10)',
  '--umbradesktop-app-edge-dark': 'rgba(0, 0, 0, 0.60)',
  '--umbradesktop-app-edge-width': '0',
  '--umbradesktop-app-radius': '6px',
  '--umbradesktop-app-text': '#f5f5f7',
  '--umbradesktop-app-text-muted': '#98989d',
  '--umbradesktop-app-accent': '#0a84ff',
  '--umbradesktop-app-font': MACOS_FONT,
```

- [ ] **Step 6: Add the Windows 11 values**

In `backoffice/src/desktop/theme/themes/win11/palette.ts`, add to `W11_LIGHT`:

```ts
  // Apps. Mica's flat planes, so no bevel; the raised surface is a step *lighter* than the ground,
  // which is the inverse of Win98 and is why an app should read these rather than assume a
  // direction. Accent is the theme's own, so a selection matches the taskbar.
  '--umbradesktop-app-surface': '#f3f3f3',
  '--umbradesktop-app-surface-raised': '#fbfbfb',
  '--umbradesktop-app-surface-sunken': '#ffffff',
  '--umbradesktop-app-edge-light': '#ffffff',
  '--umbradesktop-app-edge-dark': 'rgba(0, 0, 0, 0.08)',
  '--umbradesktop-app-edge-width': '0',
  '--umbradesktop-app-radius': '4px',
  '--umbradesktop-app-text': '#1a1a1a',
  '--umbradesktop-app-text-muted': '#5d5d5d',
  '--umbradesktop-app-accent': W11_ACCENT,
  '--umbradesktop-app-font': W11_FONT,
```

And to `W11_DARK`:

```ts
  '--umbradesktop-app-surface': '#202020',
  '--umbradesktop-app-surface-raised': '#2b2b2b',
  '--umbradesktop-app-surface-sunken': '#1c1c1c',
  '--umbradesktop-app-edge-light': 'rgba(255, 255, 255, 0.08)',
  '--umbradesktop-app-edge-dark': 'rgba(0, 0, 0, 0.40)',
  '--umbradesktop-app-edge-width': '0',
  '--umbradesktop-app-radius': '4px',
  '--umbradesktop-app-text': '#ffffff',
  '--umbradesktop-app-text-muted': '#a0a0a0',
  '--umbradesktop-app-accent': W11_ACCENT_DARK,
  '--umbradesktop-app-font': W11_FONT,
```

- [ ] **Step 7: Run the tests and the build**

```bash
npm test
npm run build
```

Expected: both PASS. If `tsc` reports an unused import for a palette constant you did not end up using, remove it rather than suppressing it.

These values are the starting set. The spec's §9 browser checkpoint, run against a real game, is what promotes them from provisional to settled; a value that reads wrong beside its own chrome is a palette fix, not a contract change.

- [ ] **Step 8: Update the theming guide, which is now wrong**

`docs/theming.md` is the guide for theme authors, written deliberately for someone outside this repository, and this task is the one that asks them to set app tokens. Three places in it are false as of Task 1:

- **Line ~130:** "you can only set tokens the chrome actually reads. The normative list is `UMBRADESKTOP_TOKENS`". A palette may now also set app tokens, which no component in this package reads.
- **Line ~132:** "53 tokens in these groups", followed by a group table with no app row. Add the app group to the table and correct the count, or better, stop stating a count that has now gone stale twice and name the two lists instead.
- **Line ~374:** the PR checklist names only `tokens.test.ts`. Name `app-tokens.test.ts` beside it, since a theme that misses an app token fails that one and not the other.

Explain the two-list split in the author's terms: the chrome group is checked against the components that read it, the app group is a published contract for apps in other packages, and the identity theme answers only the chrome group because an app's own fallbacks are the Umbraco look.

- [ ] **Step 9: Commit**

```bash
git add backoffice/src/desktop/theme docs/theming.md
git commit -m "feat: app token values for every theme that paints its own palette"
```

---

### Task 3: The content discriminator

**Files:**
- Modify: `backoffice/src/desktop/types.ts`
- Modify: `backoffice/src/desktop/derive-apps.ts`
- Modify: `backoffice/src/desktop/derive-apps.test.ts`
- Modify: `backoffice/src/desktop/components/window.element.ts`
- Modify: `backoffice/src/desktop/constants.ts` (see the note below)

**Inherited from Task 4: unify the 12-second load patience.** Task 4 gave the app host a load timeout and deliberately set it to the same twelve seconds the iframe path already allows in `#onIframeLoad`'s `setTimeout`, on the grounds that one shell should not run out of patience at two different moments depending on which kind of app a window opened. It could not unify them because `window.element.ts` was out of its scope, and it left the reasoning in `APP_LOAD_TIMEOUT_MS`'s doc comment.

You own that file, so finish it: move the number to a named constant in `constants.ts` with the reasoning, and have both `app-host.element.ts` and `window.element.ts` read it. This is the repo's "derive numbers, never type them" rule, and two copies of a duration whose whole justification is that they are the same number is exactly the drift it exists to prevent. The host's own `APP_LOAD_TIMEOUT_MS` goes away rather than becoming an alias: its test matches the timer by *value*, not by name, so the canonical constant satisfies it unchanged and a second exported name would re-open the seam this step closes.

- [ ] **Step 1: Write the failing test**

In `backoffice/src/desktop/derive-apps.test.ts`, replace the first test (`emits a certified app for a permitted, resolved entry`) with this, and add the second:

```ts
it('emits a certified app whose content is an iframe pointing at the resolved URL', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'content', group: 'editing' }), url: '/umbraco/section/content', gateSectionAlias: 'Umb.Section.Content', isSectionRoot: true })],
    SECTIONS,
  );
  const app = apps.find((a) => a.alias === 'content')!;
  expect(app.confidence).to.equal('certified');
  expect(app.content).to.deep.equal({ kind: 'iframe', url: '/umbraco/section/content' });
  expect(app.group).to.equal('editing');
  expect(app.sourceSection).to.equal('Umb.Section.Content');
});

it('emits section fallbacks as iframe content too', () => {
  const apps = deriveApps([], SECTIONS);
  const fallback = apps.filter((a) => a.confidence === 'uncertified');
  expect(fallback.map((a) => a.content)).to.deep.equal([
    { kind: 'iframe', url: '/umbraco/section/content' },
    { kind: 'iframe', url: '/umbraco/section/settings' },
  ]);
});
```

Then update every other assertion in that file that reads `app.url` or `a.url` to read the content instead. There are four: in `adds an uncertified fallback…`, `does NOT add a fallback…`, `still falls back a section…` and `omits fallback apps for excluded sections`. The pattern is:

```ts
// before
expect(fallback.map((a) => a.url)).to.have.members([...]);
// after
expect(fallback.map((a) => a.content)).to.have.deep.members([
  { kind: 'iframe', url: '/umbraco/section/content' },
  { kind: 'iframe', url: '/umbraco/section/settings' },
]);
```

and for the single-app filters:

```ts
// before
apps.filter((a) => a.confidence === 'uncertified' && a.url === '/umbraco/section/content')
// after
apps.filter(
  (a) => a.confidence === 'uncertified' && a.content.kind === 'iframe' && a.content.url === '/umbraco/section/content',
)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx web-test-runner "src/desktop/derive-apps.test.ts" --node-resolve
```

Expected: FAIL. `app.content` is undefined, so the first `deep.equal` fails.

- [ ] **Step 3: Add the union to `types.ts`**

In `backoffice/src/desktop/types.ts`, add above `UmbraDesktopApp`:

```ts
/**
 * What a window's body is.
 *
 * `iframe` is every app derived from the curated catalogue: a whole second backoffice, deep-linked,
 * needing its chrome stripped and its theme mirrored across the document boundary. `element` is a
 * self-contained app registered by a package (see `app.extension.ts`): one custom element in the
 * body, in this document, inheriting the desktop's tokens by ordinary CSS inheritance.
 *
 * A union rather than an optional `url` plus an optional `element`, because that pair makes both
 * "neither" and "both" representable and neither means anything. Here the compiler finds every
 * place that has to care.
 */
export type UmbraDesktopAppContent =
  | { kind: 'iframe'; url: string }
  | { kind: 'element'; element: () => Promise<unknown> };
```

In the `UmbraDesktopApp` interface, replace:

```ts
  /** Backoffice path the window's iframe loads, e.g. "/umbraco/section/content". */
  url: string;
```

with:

```ts
  /** What this app's window body is: a backoffice iframe, or a self-contained element. */
  content: UmbraDesktopAppContent;
```

`chromeProfile` stays required on `UmbraDesktopApp`; an element app is given `'bare'` in Task 4, and nothing reads it on that path.

- [ ] **Step 4: Update `derive-apps.ts`**

In the certified pass, replace `url: r.url,` with:

```ts
      content: { kind: 'iframe', url: r.url },
```

In the uncertified fallback pass, replace `url,` with:

```ts
      content: { kind: 'iframe', url },
```

- [ ] **Step 5: Update `window.element.ts`**

Replace the body line in `render()`:

```ts
          <iframe class="body" src=${w.app.url} @load=${this.#onIframeLoad}></iframe>
```

with:

```ts
          ${this.#renderBody(w)}
```

Add these two members just above `render()`:

```ts
  /**
   * The window body: a backoffice iframe, or a self-contained app element.
   *
   * The element branch deliberately carries none of the iframe branch's machinery: no chrome
   * injection, no theme mirroring, no reload-in-place, because all three exist to manage a booting
   * second backoffice and there is not one here. The app host owns its own load state, including a
   * timeout for a dynamic import that never resolves, so this window does not put an overlay over
   * it either.
   * @param w The window to render the body of.
   * @returns The body template.
   */
  #renderBody(w: UmbraDesktopWindow) {
    if (w.app.content.kind === 'element') {
      return html`<umbradesktop-app-host
        class="body"
        data-umbradesktop-theme=${this.#chromeThemeId}
        .load=${w.app.content.element}></umbradesktop-app-host>`;
    }
    return html`<iframe
      class="body"
      src=${w.app.content.url}
      @load=${this.#onIframeLoad}></iframe>`;
  }
```

Guard the two iframe-only helpers. In `#frameDocument()`, the existing `querySelector('iframe.body')` already returns null for an element body, so `#applyFrameTheme` is a no-op there with no change needed. In `#onReload`, add an element branch at the top:

```ts
  #onReload() {
    const w = this.window;
    if (!w) return;
    if (w.app.content.kind === 'element') {
      // Recreating the element *is* the reload: a fresh instance starts from its initial state,
      // which for a game is "new game". Bumping the key discards the old instance.
      this._appInstance += 1;
      return;
    }
    const iframe = this.renderRoot?.querySelector('iframe.body') as HTMLIFrameElement | null;
    if (!iframe) return;
```

and leave the rest of the existing method body unchanged, replacing its final `iframe.src = this.window.app.url;` with `iframe.src = w.app.content.url;`.

Add the reload counter and the theme id beside the other private fields:

```ts
  /** Bumped by reload so an element body is torn down and recreated rather than reused. */
  @state()
  private _appInstance = 0;

  /** The desktop chrome theme id in force, stamped onto an element app so it may branch (D9). */
  #chromeThemeId = '';
```

Then use the counter to force recreation, by wrapping the element in Lit's `keyed` directive. Add **two** imports:

```ts
import { keyed } from '@umbraco-cms/backoffice/external/lit';
import './app-host.element.js';
```

The second is not optional and is not a type import. It is a **side-effect import** that registers the custom element, following the convention `desktop.element.ts` and `taskbar.element.ts` already use for the components they render. Without it nothing in the bundle imports that module, Vite tree-shakes it out, and `<umbradesktop-app-host>` is never defined.

That failure is invisible to both gates: `tsc` type-checks the file because it is under `include`, and its own test file imports it directly, so `npm run build` and `npm test` both stay green. It shows up only in a browser, as a blank window body. Check the built output for the element's tag name after this task if you want certainty.

and change the element branch's return to:

```ts
      return keyed(
        this._appInstance,
        html`<umbradesktop-app-host
          class="body"
          data-umbradesktop-theme=${this.#chromeThemeId}
          .load=${w.app.content.element}></umbradesktop-app-host>`,
      );
```

- [ ] **Step 6: Run the tests and the build**

```bash
npm test
npm run build
```

Expected: both PASS. Task 4 already shipped `umbradesktop-app-host`, so the element branch resolves.

`#chromeThemeId` is declared here but only assigned in Task 8, which is deliberate: an unassigned private field is valid TypeScript and stamps an empty attribute, so the element branch works and Task 8 only has to give the field a value. Do not reach forward into Task 8 to populate it, and do not remove the field to silence a linter.

- [ ] **Step 7: Commit**

```bash
git add backoffice/src/desktop/types.ts backoffice/src/desktop/derive-apps.ts backoffice/src/desktop/derive-apps.test.ts backoffice/src/desktop/components/window.element.ts
git commit -m "refactor: a window body is an iframe or an element, not always a URL"
```

---

### Task 4: The manifest type and the app host element

**Files:**
- Create: `backoffice/src/desktop/app.extension.ts`
- Create: `backoffice/src/desktop/components/app-host.element.ts`
- Modify: `backoffice/src/desktop/types.ts`

- [ ] **Step 1: Write the failing test**

Create `backoffice/src/desktop/components/app-host.element.test.ts`:

```ts
import { expect, fixture, html } from '@open-wc/testing';
import './app-host.element.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';

/** A trivial app element, standing in for a game. */
class TestAppElement extends HTMLElement {
  connectedCallback() {
    this.textContent = 'app ready';
  }
}
customElements.define('umbradesktop-test-app', TestAppElement);

it('mounts the element the manifest loader resolves to', async () => {
  const host = await fixture<UmbraDesktopAppHostElement>(
    html`<umbradesktop-app-host></umbradesktop-app-host>`,
  );
  host.load = async () => ({ element: TestAppElement });
  await host.updateComplete;
  await host.mounted;
  expect(host.querySelector('umbradesktop-test-app')).to.not.be.null;
});

it('reports a loader that throws rather than leaving an empty body', async () => {
  const host = await fixture<UmbraDesktopAppHostElement>(
    html`<umbradesktop-app-host></umbradesktop-app-host>`,
  );
  host.load = async () => {
    throw new Error('bundle missing');
  };
  await host.updateComplete;
  await host.mounted;
  expect(host.textContent).to.contain('could not be loaded');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx web-test-runner "src/desktop/components/app-host.element.test.ts" --node-resolve
```

Expected: FAIL, cannot resolve `./app-host.element.js`.

- [ ] **Step 3: Write the manifest type**

Create `backoffice/src/desktop/app.extension.ts`:

```ts
import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopApp` manifest carries beyond the extension basics.
 *
 * Note what is **absent**: no `url`, no `section`, no `chromeProfile`. A self-contained app points
 * at nothing, is gated by nothing, and has no backoffice chrome to strip. Their absence is what
 * keeps the design's boundary structural rather than advisory — a package cannot express a
 * deep-linked catalogue entry through this type even if it wants to, so deep links stay curated in
 * this repository where their URL and chrome profile can be verified.
 */
export interface MetaUmbraDesktopApp {
  /** Window title. A localisation token (`#myPackage_minesweeper`) or a literal string. */
  label: string;
  /** Umbraco icon alias, e.g. `icon-bomb`. Native `icon-*` only; falls back to `icon-box`. */
  icon?: string;
  /** Launcher group alias. Unknown or unset lands the app in the reserved "More" group. */
  group?: string;
  /** Default window size in px. */
  defaultSize?: { w: number; h: number };
  /** Minimum window size in px; falls back to the global minimum when unset. */
  minSize?: { w: number; h: number };
  /** Whether more than one window of this app may be open at once. Default: allowed. */
  allowMultiple?: boolean;
}

/**
 * A self-contained desktop app: one custom element, opened in a window, registered by any package.
 *
 * Extends `ManifestWithDynamicConditions` so Umbraco's own condition system decides availability.
 * That is a better answer than a section gate, which is what the curated catalogue uses and which
 * means nothing here: there is no backing section to be permitted to. No conditions means always
 * available, which for a game is right — reaching the desktop at all is already gated by the
 * desktop section's permission.
 */
export interface ManifestUmbraDesktopApp
  extends ManifestElement<HTMLElement>,
    ManifestWithDynamicConditions {
  type: 'umbraDesktopApp';
  meta: MetaUmbraDesktopApp;
}

declare global {
  interface UmbExtensionManifestMap {
    umbraDesktopApp: ManifestUmbraDesktopApp;
  }
}
```

- [ ] **Step 4: Write the app host element**

Create `backoffice/src/desktop/components/app-host.element.ts`:

```ts
import { customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Mounts a self-contained app's element inside a window body.
 *
 * Renders into the **light DOM** (`createRenderRoot` returns `this`) rather than a shadow root, on
 * purpose: an app is someone else's element and must be able to size itself against this box and
 * be inspected by whoever wrote it, and a shadow boundary here would buy isolation the app already
 * has from its own shadow root.
 *
 * A loader that throws is reported in place. It is the one failure mode with no other surface: the
 * manifest resolved, so the app is in the launcher and the window opened, and an empty body would
 * read as a broken desktop rather than a missing bundle.
 */
@customElement('umbradesktop-app-host')
export class UmbraDesktopAppHostElement extends UmbLitElement {
  /** The manifest's element loader. Set by the window from the app's `content`. */
  @property({ attribute: false })
  load?: () => Promise<unknown>;

  @state()
  private _failed = false;

  /** Resolves once the load has been attempted, whether it succeeded or not. For tests. */
  public mounted: Promise<void> = Promise.resolve();

  /** Light DOM: the app's element is the app author's to style and inspect. */
  override createRenderRoot() {
    return this;
  }

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('load')) this.mounted = this.#mount();
  }

  /**
   * Resolve the loader and append the element it yields.
   *
   * Accepts either shape an Umbraco element loader can resolve to: the module (whose `element`,
   * `default` or first exported constructor is the class) or the constructor itself. Registering
   * the custom element is the app's own job, done by its module's side effects, so this only has to
   * construct it.
   */
  async #mount(): Promise<void> {
    this.replaceChildren();
    this._failed = false;
    if (!this.load) return;
    try {
      const resolved = (await this.load()) as
        | { element?: CustomElementConstructor; default?: CustomElementConstructor }
        | CustomElementConstructor;
      const ctor =
        typeof resolved === 'function'
          ? resolved
          : (resolved.element ?? resolved.default);
      if (typeof ctor !== 'function') throw new Error('loader resolved to no element constructor');
      this.replaceChildren(new ctor());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[UmbraDesktop] app element failed to load', error);
      this._failed = true;
    }
  }

  override render() {
    return this._failed ? html`<p>This app could not be loaded.</p>` : html``;
  }
}

export default UmbraDesktopAppHostElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-app-host': UmbraDesktopAppHostElement;
  }
}
```

- [ ] **Step 5: Add the normalised registered-app type**

In `backoffice/src/desktop/types.ts`, add below `UmbraDesktopAppContent`:

```ts
/**
 * A `umbraDesktopApp` manifest reduced to what derivation needs. The context normalises the
 * condition-evaluated manifests into these so `deriveApps` stays pure and has no opinion about
 * where an app came from.
 */
export interface UmbraDesktopRegisteredApp {
  /** The manifest alias; becomes the app alias, so it keys pins. */
  alias: string;
  /** Window title (localisation token or literal). */
  name: string;
  /** Icon alias, already defaulted. */
  icon: string;
  /** The element loader from the manifest. */
  element: () => Promise<unknown>;
  /** Launcher group alias, if the manifest named one. */
  group?: string;
  /** Sort weight within the group. */
  weight?: number;
  /** Default window size in px. */
  defaultSize?: { w: number; h: number };
  /** Minimum window size in px. */
  minSize?: { w: number; h: number };
  /** Whether more than one window may open. */
  allowMultiple?: boolean;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx web-test-runner "src/desktop/components/app-host.element.test.ts" --node-resolve
npm run build
```

Expected: both PASS. The build now resolves `umbradesktop-app-host` from Task 3.

- [ ] **Step 7: Commit**

```bash
git add backoffice/src/desktop/app.extension.ts backoffice/src/desktop/components/app-host.element.ts backoffice/src/desktop/components/app-host.element.test.ts backoffice/src/desktop/types.ts
git commit -m "feat: a umbraDesktopApp manifest type and the element host that mounts one"
```

---

### Task 5: Derive registered apps

**Files:**
- Create: `backoffice/src/desktop/registered-apps.ts`
- Create: `backoffice/src/desktop/registered-apps.test.ts`
- Modify: `backoffice/src/desktop/derive-apps.ts`
- Modify: `backoffice/src/desktop/derive-apps.test.ts`

- [ ] **Step 1: Write the failing normalisation test**

Create `backoffice/src/desktop/registered-apps.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { normaliseRegisteredApps } from './registered-apps';
import type { ManifestUmbraDesktopApp } from './app.extension';

const loader = async () => ({});

function manifest(over: Partial<ManifestUmbraDesktopApp> = {}): ManifestUmbraDesktopApp {
  return {
    type: 'umbraDesktopApp',
    alias: 'Pkg.Minesweeper',
    element: loader,
    meta: { label: '#pkg_minesweeper' },
    ...over,
  } as ManifestUmbraDesktopApp;
}

/**
 * The loader must come through **by reference**, which is why the last assertion is an identity
 * check and must stay one rather than relaxing to "is a function".
 *
 * `umbradesktop-app-host` remounts when its `load` property changes, and it compares by function
 * identity. Derivation re-runs on every registry emission, so wrapping the manifest's loader in a
 * fresh closure here would hand the host a new function each time and remount every open app: a
 * game would lose its board because an unrelated package finished registering. Passing the
 * manifest's own function through keeps identity stable for as long as the manifest is registered.
 */
it('carries alias, label, icon and the element loader through', () => {
  const [app] = normaliseRegisteredApps([
    manifest({ meta: { label: '#pkg_minesweeper', icon: 'icon-bomb', group: 'games' } }),
  ]);
  expect(app.alias).to.equal('Pkg.Minesweeper');
  expect(app.name).to.equal('#pkg_minesweeper');
  expect(app.icon).to.equal('icon-bomb');
  expect(app.group).to.equal('games');
  expect(app.element, 'must be the manifest loader itself, not a wrapper').to.equal(loader);
});

it('defaults a missing icon to icon-box, the same fallback the catalogue uses', () => {
  const [app] = normaliseRegisteredApps([manifest()]);
  expect(app.icon).to.equal('icon-box');
});

it('falls back to the manifest name, then the alias, when meta has no label', () => {
  const [named] = normaliseRegisteredApps([
    manifest({ name: 'Minesweeper', meta: { label: undefined as unknown as string } }),
  ]);
  expect(named.name).to.equal('Minesweeper');
  const [bare] = normaliseRegisteredApps([
    manifest({ name: undefined, meta: { label: undefined as unknown as string } }),
  ]);
  expect(bare.name).to.equal('Pkg.Minesweeper');
});

it('carries sizes, weight and allowMultiple through', () => {
  const [app] = normaliseRegisteredApps([
    manifest({
      weight: 20,
      meta: {
        label: 'x',
        defaultSize: { w: 360, h: 460 },
        minSize: { w: 320, h: 400 },
        allowMultiple: false,
      },
    }),
  ]);
  expect(app.weight).to.equal(20);
  expect(app.defaultSize).to.deep.equal({ w: 360, h: 460 });
  expect(app.minSize).to.deep.equal({ w: 320, h: 400 });
  expect(app.allowMultiple).to.be.false;
});

it('drops a manifest with no element loader rather than opening an empty window', () => {
  const apps = normaliseRegisteredApps([
    manifest({ element: undefined as unknown as ManifestUmbraDesktopApp['element'] }),
  ]);
  expect(apps).to.deep.equal([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx web-test-runner "src/desktop/registered-apps.test.ts" --node-resolve
```

Expected: FAIL, cannot resolve `./registered-apps`.

- [ ] **Step 3: Write the normaliser**

Create `backoffice/src/desktop/registered-apps.ts`:

```ts
import type { ManifestUmbraDesktopApp } from './app.extension';
import type { UmbraDesktopRegisteredApp } from './types';

/** Fallback icon, matching the curated catalogue's own default. */
const DEFAULT_ICON = 'icon-box';

/**
 * Reduce condition-evaluated `umbraDesktopApp` manifests to the shape derivation needs.
 *
 * A manifest with no `element` is dropped rather than passed on: it would reach the launcher as a
 * tile that opens a window with nothing in it, which is worse than not being there. That is a
 * package's bug and its own console warning is the wrong place to spend a user's attention, so this
 * is silent.
 * @param manifests The permitted manifests, in registry order.
 * @returns The normalised apps, in the same order.
 */
export function normaliseRegisteredApps(
  manifests: ReadonlyArray<ManifestUmbraDesktopApp>,
): UmbraDesktopRegisteredApp[] {
  const apps: UmbraDesktopRegisteredApp[] = [];
  for (const manifest of manifests) {
    if (typeof manifest.element !== 'function') continue;
    apps.push({
      alias: manifest.alias,
      name: manifest.meta?.label ?? manifest.name ?? manifest.alias,
      icon: manifest.meta?.icon ?? DEFAULT_ICON,
      element: manifest.element as () => Promise<unknown>,
      group: manifest.meta?.group,
      weight: manifest.weight,
      defaultSize: manifest.meta?.defaultSize,
      minSize: manifest.meta?.minSize,
      allowMultiple: manifest.meta?.allowMultiple,
    });
  }
  return apps;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx web-test-runner "src/desktop/registered-apps.test.ts" --node-resolve
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing derivation test**

Append to `backoffice/src/desktop/derive-apps.test.ts`:

```ts
import type { UmbraDesktopRegisteredApp } from './types';

const MINESWEEPER: UmbraDesktopRegisteredApp = {
  alias: 'Pkg.Minesweeper',
  name: '#pkg_minesweeper',
  icon: 'icon-bomb',
  element: async () => ({}),
  group: 'games',
  weight: 10,
};

it('derives a registered app with no section gate at all', () => {
  const apps = deriveApps([], [], [], [MINESWEEPER]);
  const app = apps.find((a) => a.alias === 'Pkg.Minesweeper')!;
  expect(app, 'a registered app must not need a permitted section').to.not.be.undefined;
  expect(app.content.kind).to.equal('element');
  expect(app.sourceSection, 'there is no section behind it').to.be.undefined;
  expect(app.confidence).to.equal('certified');
  expect(app.group).to.equal('games');
});

it('places registered apps ahead of the uncertified section fallback', () => {
  const apps = deriveApps([], SECTIONS, [], [MINESWEEPER]);
  const registeredAt = apps.findIndex((a) => a.alias === 'Pkg.Minesweeper');
  const firstFallbackAt = apps.findIndex((a) => a.confidence === 'uncertified');
  expect(registeredAt).to.be.lessThan(firstFallbackAt);
});

it('gives a registered app the bare chrome profile, which nothing on that path reads', () => {
  const apps = deriveApps([], [], [], [MINESWEEPER]);
  expect(apps[0].chromeProfile).to.equal('bare');
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx web-test-runner "src/desktop/derive-apps.test.ts" --node-resolve
```

Expected: FAIL. `deriveApps` takes three parameters, so the fourth is ignored and no registered app is derived.

**A hand-written function type will not do here.** Casting the missing loader to `() => Promise<unknown>` type-checks in the test runner and fails the build: esbuild does not type-check, and `tsc` rejects it because `Promise<unknown>` is not assignable to Umbraco's `ElementLoaderProperty` union. Cast to `ManifestUmbraDesktopApp['element']` instead, which is the same runtime value and cannot drift from whatever Umbraco's type becomes. This is the "neither command subsumes the other" rule earning its keep, so run both.

- [ ] **Step 7: Add the third pass**

In `backoffice/src/desktop/derive-apps.ts`, add the import:

```ts
import type { UmbraDesktopRegisteredApp } from './types';
```

Change the signature and doc comment:

```ts
/**
 * Turn resolved catalogue entries, registered app manifests and the current user's permitted
 * sections into the flat, tagged app list. Certified catalogue entries first (gate-filtered), then
 * registered apps (ungated), then an uncertified `full-section` fallback for every permitted
 * section not already represented by a section-root entry. Pure — see design §5.2.
 * @param resolved Catalogue entries the adapter has resolved to URL + gate + presentation.
 * @param permittedSections Sections the current user may access.
 * @param excludedSections Section aliases that must never produce an automatic fallback app.
 * @param registered Self-contained apps whose manifests are registered and condition-permitted.
 * @returns The flat list of launchable apps, each tagged with confidence + placement.
 */
export function deriveApps(
  resolved: ReadonlyArray<UmbraDesktopResolvedEntry>,
  permittedSections: ReadonlyArray<UmbraDesktopSectionInfo>,
  excludedSections: ReadonlyArray<string> = [],
  registered: ReadonlyArray<UmbraDesktopRegisteredApp> = [],
): UmbraDesktopApp[] {
```

Then between the certified pass and the fallback pass, insert:

```ts
  // Registered apps. No gate: a self-contained app has no backing section to be permitted to, and
  // Umbraco has already evaluated its manifest conditions before it reaches here. Tagged
  // `certified` because that tier means "this will work", and an element in a box cannot get a
  // deep link or a chrome profile wrong — the two things certification is about.
  for (const app of registered) {
    apps.push({
      alias: app.alias,
      name: app.name,
      icon: app.icon,
      content: { kind: 'element', element: app.element },
      // Nothing on the element path reads this, but the field is required and `bare` is the honest
      // value: there is no backoffice chrome here to keep.
      chromeProfile: 'bare',
      defaultSize: app.defaultSize,
      minSize: app.minSize,
      allowMultiple: app.allowMultiple,
      weight: app.weight,
      group: app.group,
      confidence: 'certified',
    });
  }
```

- [ ] **Step 8: Run the tests and the build**

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add backoffice/src/desktop/registered-apps.ts backoffice/src/desktop/registered-apps.test.ts backoffice/src/desktop/derive-apps.ts backoffice/src/desktop/derive-apps.test.ts
git commit -m "feat: derive registered apps as an ungated third pass"
```

---

### Task 6: Observe registered apps in the catalogue context

**Files:**
- Modify: `backoffice/src/desktop/app-catalogue.context.ts`
- Modify: `backoffice/src/desktop/app-catalogue.context.test.ts`

**Two findings inherited from Task 5's review, both landing here because this is where the impure glue lives.**

**A. Report a dropped manifest through `#diagnose`.** `normaliseRegisteredApps` drops a manifest it cannot get an element out of, silently, and that was justified as "not worth a user's attention". True but beside the point: this context already has `#diagnose`, a deduplicating console-only warning held back by a quiet window, used for two neighbouring cases (an unknown `ref`, an entry that resolved to nothing). It is dev-facing, not user-facing, which is exactly the register this needs. Today a package author whose app never appears in the launcher gets no signal at all.

Keep the pure function pure: have it report which aliases it dropped (return them, or expose a second pure helper), and let this context turn that into a diagnostic. Do not make the normaliser log.

**B. Decide what happens when a registered alias collides with a curated one.** Registry uniqueness only holds *within* the registered set. A manifest whose alias matches a curated entry produces two apps with the same alias, and alias is what keys pinned favourites: `launcher.element.ts` resolves a pin with `.find(a => a.alias === alias)`, so whichever comes first wins. Today the pass order makes the curated entry win, which is the right precedence, but only by accident of ordering rather than by decision.

Make it a decision: drop the registered app when its alias is already taken by a curated one, and diagnose it. A package cannot fix a collision it cannot see, and two tiles with one alias means a pin that silently points at the wrong app.

- [ ] **Step 1: Write the failing test**

Append to `backoffice/src/desktop/app-catalogue.context.test.ts`. This uses that file's existing `setup()` harness (which returns `{ registry, warnings, aliases, app, teardown }`) and its existing `settle()` helper — no new helpers, no new imports:

```ts
it('surfaces a registered umbraDesktopApp even though no section permits it', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.Minesweeper',
      element: async () => ({}),
      meta: { label: '#pkg_minesweeper', icon: 'icon-bomb', group: 'games' },
    } as unknown as UmbExtensionManifest);
    await settle();

    const app = harness.app('Pkg.Minesweeper');
    expect(app, 'a registered app needs no permitted section').to.not.be.undefined;
    expect(app!.content.kind).to.equal('element');
    expect(app!.icon).to.equal('icon-bomb');
    expect(app!.group).to.equal('games');
  } finally {
    harness.teardown();
  }
});

it('drops a registered app whose condition is never met', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.Gated',
      element: async () => ({}),
      meta: { label: '#pkg_gated' },
      // A condition whose alias nothing registers can never be satisfied, which is what an unmet
      // condition looks like from here. This is the test that fails if the implementation reaches
      // for `byType` instead of the manifest initializer, because `byType` never evaluates these.
      conditions: [{ alias: 'Pkg.Condition.NeverRegistered' }],
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    expect(harness.aliases()).to.not.contain('Pkg.Gated');
  } finally {
    harness.teardown();
  }
});

it('keeps a registered app when its manifest carries no conditions at all', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.Ungated',
      element: async () => ({}),
      meta: { label: '#pkg_ungated' },
      conditions: [],
    } as unknown as UmbExtensionManifest);
    await settle();

    expect(harness.aliases(), 'no conditions means permitted').to.contain('Pkg.Ungated');
  } finally {
    harness.teardown();
  }
});
```

The `settleDiagnostics()` helper (80ms) is used for the negative case rather than `settle()` (0ms) because a condition controller resolves asynchronously: asserting absence immediately would pass even against a broken implementation that is merely slow.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx web-test-runner "src/desktop/app-catalogue.context.test.ts" --node-resolve
```

Expected: FAIL on the first test — nothing observes `umbraDesktopApp`, so the app never appears.

- [ ] **Step 3: Add the observation**

In `backoffice/src/desktop/app-catalogue.context.ts`, add imports:

```ts
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { normaliseRegisteredApps } from './registered-apps.js';
import type { ManifestUmbraDesktopApp } from './app.extension';
import type { UmbraDesktopRegisteredApp } from './types';
```

Widen the registry facade so the initializer can take it:

```ts
type UmbraDesktopExtensionRegistry = Pick<
  typeof umbExtensionsRegistry,
  'byType' | 'byAlias' | 'extensions'
>;
```

Add the field:

```ts
  /** Self-contained apps whose manifests are registered and condition-permitted. */
  #registeredApps: ReadonlyArray<UmbraDesktopRegisteredApp> = [];
```

And in the constructor, after the `byType('section')` observation:

```ts
    // Registered self-contained apps. `byType` is deliberately NOT used here: it returns raw
    // manifests and never evaluates `conditions`, so every app would appear regardless of whether
    // its conditions are met. `UmbExtensionsManifestInitializer` is the public route to
    // condition-evaluated manifests — it hands back only the permitted ones, and re-fires whenever
    // a condition flips.
    new UmbExtensionsManifestInitializer(
      host,
      this.#registry as unknown as typeof umbExtensionsRegistry,
      'umbraDesktopApp',
      null,
      (permitted) => {
        this.#registeredApps = normaliseRegisteredApps(
          permitted.map((controller) => controller.manifest as ManifestUmbraDesktopApp),
        );
        this.#recompute();
      },
      'observeRegisteredApps',
    );
```

Finally, pass them to derivation in `#recompute()`:

```ts
    const apps = deriveApps(
      resolved,
      this.#sections,
      this.#catalogue.excludedSections,
      this.#registeredApps,
    );
```

- [ ] **Step 4: Run the tests and the build**

```bash
npm test
npm run build
```

Expected: both PASS. If the initializer rejects the narrowed registry facade at compile time, widen `UmbraDesktopExtensionRegistry` to the full `typeof umbExtensionsRegistry` rather than casting in more places — the facade exists to keep the test double small, and one honest widening beats three casts.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/app-catalogue.context.ts backoffice/src/desktop/app-catalogue.context.test.ts
git commit -m "feat: observe registered apps with their conditions evaluated"
```

---

### Task 7: The games group

**Files:**
- Modify: `backoffice/src/desktop/catalogue/groups.ts`
- Test: `backoffice/src/desktop/group-apps.test.ts` (or the existing groups test, if one covers `groups.ts`)

- [ ] **Step 1: Write the failing test**

Create `backoffice/src/desktop/catalogue/groups.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { groups } from './groups';

/**
 * The `games` group is a curated label in the host, not a list of games: the entertainment package
 * names this alias from its own manifests, and nothing here knows which games exist. That is what
 * keeps the two packages' releases independent of each other's contents.
 */
it('declares a games group whose label is the existing loc token', () => {
  const games = groups.find((g) => g.alias === 'games');
  expect(games, 'the games group must exist for registered game apps to land in').to.not.be
    .undefined;
  expect(games!.label).to.equal('#umbraDesktop_groupGames');
});

it('sorts games after every work group', () => {
  const games = groups.find((g) => g.alias === 'games')!;
  const others = groups.filter((g) => g.alias !== 'games');
  for (const group of others) {
    expect(
      games.weight!,
      `games must sort after ${group.alias} — it is the last thing an editor is looking for`,
    ).to.be.greaterThan(group.weight!);
  }
});

it('gives every group a unique alias and a token label', () => {
  const aliases = groups.map((g) => g.alias);
  expect(new Set(aliases).size).to.equal(aliases.length);
  for (const group of groups) {
    expect(group.label, `${group.alias} must use a loc token`).to.match(/^#/);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx web-test-runner "src/desktop/catalogue/groups.test.ts" --node-resolve
```

Expected: FAIL, `games` is undefined.

- [ ] **Step 3: Add the group**

In `backoffice/src/desktop/catalogue/groups.ts`, append to the array:

```ts
  // Games, last of the real groups and before the reserved "More". Populated entirely by registered
  // apps from the entertainment package — nothing in this repository puts an app here, which is why
  // the group can exist without either package knowing the other's release schedule.
  { alias: 'games', label: '#umbraDesktop_groupGames', weight: 60 },
```

- [ ] **Step 4: Run the tests**

```bash
npm test
```

Expected: PASS. `en.ts` and `nl.ts` already carry `groupGames`, so no localisation change is needed.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/catalogue/groups.ts backoffice/src/desktop/catalogue/groups.test.ts
git commit -m "feat: a games group for registered apps to land in"
```

---

### Task 8: Stamp the theme id on an app element

**Files:**
- Modify: `backoffice/src/desktop/components/window.element.ts`
- Modify: `backoffice/src/desktop/components/app-host.element.ts`
- Test: `backoffice/src/desktop/components/app-host.element.test.ts` and the window's body test

> **Read this before Step 1: the attribute is currently on the wrong element.**
>
> Task 3 stamped `data-umbradesktop-theme` on `<umbradesktop-app-host>`, following this plan's own sketch. That sketch contradicted the design it was implementing. D9 and §6.2 both say the id goes **on the app element**, and they are right: the selector the design promises an app author is
>
> ```css
> :host([data-umbradesktop-theme='win98']) .cell { /* hand-tuned bevels */ }
> ```
>
> `:host` matches the app's *own* element. An attribute on its parent is invisible to it. The ancestor form that *would* see it, `:host-context`, is the one D9 explicitly rejected because Firefox has never shipped it. So as it stands the attribute is unreadable by the only mechanism the design offers, and §6.2's example would silently never match.
>
> **So this task's real work is forwarding it one level down**, from the host onto the element the host constructs. Two requirements, and the second is the one that will bite:
>
> 1. The app's element must carry the attribute **before its first render**, or a Win98 app paints unstyled and then corrects itself.
> 2. A theme change must **update the attribute in place, never remount**. The host remounts when `load` changes; if a theme switch went through that path a game would lose its board every time somebody toggled dark mode. So the host has to treat the theme id as its own reactive input and write it onto the already-mounted element, independently of the mount path.
>
> The window keeps stamping the host too. That costs nothing, and it is what lets an app that renders into light DOM (no shadow root, so no `:host`) still read the theme from its parent.
>
> Keep `#chromeThemeId` in the window as the source: Task 3 declared it unassigned for exactly this task to fill in.

- [ ] **Step 1: Write the failing test**

Append to `backoffice/src/desktop/components/desktop-chrome.test.ts`, reusing that file's existing fixture helpers for mounting a window:

Task 3 already shipped `backoffice/src/desktop/components/window-body.test.ts`, which covers "which body does a window render, and never both", including that an element window renders a host and no iframe and keeps no overlay. **Append to that file and reuse its `mountWindow` helper.** Do not write these in `desktop-chrome.test.ts`: that file is about re-asserting the section-tab hide, a different subject, and both it and `window-body.test.ts` document that `fixture()` never resolves in the backgrounded pages this runner uses with several files in flight, so the helper exists for a reason.

Two assertions are genuinely new here. Everything else the earlier sketch of this task proposed is already covered, so writing it again would only duplicate:

1. **The app's own element carries the theme id**, not merely the host. Mount an element window whose loader resolves to a test element, wait for the host's `mountComplete`, then read `data-umbradesktop-theme` from the *app element inside the host*. This is the assertion that would have caught the original defect, so it has to look at the app element rather than the host.
2. **A theme change updates the attribute in place without remounting.** Capture the app element by identity, drive a theme change, and assert both that the attribute changed *and* that it is still the same node (`.to.equal(before)`). Identity is the whole point: a remount is what would throw a player's board away.

Add a third if the empty-value decision below goes that way: an unresolved theme renders **no** attribute rather than an empty one.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx web-test-runner "src/desktop/components/window-body.test.ts" --node-resolve
```

Expected: FAIL. `#chromeThemeId` is declared but never assigned, and nothing forwards it to the app element, so both new assertions fail rather than passing vacuously. Check the failure messages say what you expect: an assertion that passes here means it is not testing what you think.

**Decide the empty case deliberately.** `#chromeThemeId` starts as `''`, and `data-umbradesktop-theme=""` still *matches* `[data-umbradesktop-theme]`, so an app testing for the attribute's existence gets a match and no usable value. Prefer rendering nothing at all until the theme resolves (Lit's `nothing` on the attribute binding), so the selector an app writes is either absent or right, never present and useless.

**`#chromeThemeId` is a plain private field, so writing to it will not re-render.** Either call `requestUpdate()` after assigning, as Step 3 does, or make it `@state`, which removes the need to remember. Say which you chose.

- [ ] **Step 3: Consume the desktop theme context**

In `backoffice/src/desktop/components/window.element.ts`, add the import:

```ts
import { UMBRADESKTOP_THEME_CONTEXT } from '../theme/theme.context-token.js';
```

and in the constructor, beside the other `consumeContext` calls:

```ts
    // The desktop chrome theme, distinct from Umbraco's light/dark above. An element app inherits
    // the theme's tokens by ordinary CSS inheritance and needs nothing for that; this is only for
    // an app that wants to *branch* — Win98 Minesweeper drawing real bevels rather than reading a
    // bevel colour. Stamped on the app element rather than exposed as an ancestor selector because
    // `:host-context` has never shipped in Firefox.
    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(
        context.resolved,
        (resolved) => {
          this.#chromeThemeId = resolved?.theme.id ?? '';
          this.requestUpdate();
        },
        'observeChromeThemeId',
      );
    });
```

The context publishes `resolved` (theme + variant + palette + metrics) and derives `paletteStyle` and `metrics` from it with `asObservablePart`; there is no `themeId` observable and this does not need one. Reading `resolved.theme.id` matches how `metrics` reaches `resolved.theme.metrics`.

- [ ] **Step 4: Run the tests and the build**

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/components/window.element.ts backoffice/src/desktop/components/desktop-chrome.test.ts
git commit -m "feat: stamp the chrome theme id on an element app"
```

---

### Task 9: Definition of done

The repo's checklist (CLAUDE.md) is part of the feature, not paperwork after it. Walk it and state which items did not apply.

**Files:**
- Modify: `README.md`
- Modify: `umbraco-marketplace.json`
- Modify: `docs/design/2026-09-06-desktop-apps-design.md`
- Create: `docs/desktop-apps.md`

- [ ] **Step 1: Amend the design doc with the two findings**

In §3, replace the "Verify before building" block with the answer: `byType` does not evaluate conditions, `UmbExtensionsManifestInitializer` is the public route, and it is what the implementation uses. In §10, strike the risk row about it.

In §6.1, two edits. Add that app tokens have no host-side fallbacks and cannot, that the documented fallback chain is the Umbraco look, that it lives in `UMBRADESKTOP_APP_TOKEN_FALLBACKS` as type-checked data rather than prose, and that each app carries those values itself. Then correct its **last paragraph**, which currently reads "Every theme answers all of them, per the existing contract" — that is now false and is the sentence a later reader will trust over an executed and archived plan. The identity theme answers none, on purpose.

Also cite `docs/theming.md` (updated in Task 2) and `docs/desktop-apps.md` from §6.1, so a theme author and an app author each have somewhere to go from the spec.

- [ ] **Step 2: Write the contributor guide**

Create `docs/desktop-apps.md`, written for someone outside this repository, the way `docs/theming.md` is: the manifest shape (§4 of the design), the app token table with the fallback each app should write, how to branch per theme, and the boundary — a self-contained app is registerable, a backoffice deep link is a PR against `catalogue/`.

- [ ] **Step 3: Update the README**

Add desktop apps to the Features list *and* give them their own short section, checking every place apps could be named rather than the first. Markdown only, no raw HTML: this file is the NuGet package readme.

- [ ] **Step 4: Update the marketplace listing**

Add to `Description` in `umbraco-marketplace.json` — an optional games package is exactly something a person would choose the package for — and add a tag (`games`, `apps`). A screenshot belongs to the entertainment plan, once there is a game to photograph.

- [ ] **Step 5: Run everything and commit**

```bash
npm test
npm run build
```

```bash
git add README.md umbraco-marketplace.json docs/
git commit -m "docs: how to build a desktop app, and the seam in the README"
```

---

## Self-review

**Spec coverage.** §4 manifest contract → Task 4. §5 content kinds → Task 3. §6.1 app tokens → Tasks 1–2. §6.2 theme branching → Task 8. §6.3 the second token list → Task 1. §7 placement and groups → Tasks 5 and 7. §3 the registered-app source → Task 6. §9 testing → tests live in the task that introduces the behaviour, and the browser checkpoint belongs to the entertainment plan since it needs a real game.

**Not covered, deliberately.** §8 is the entertainment package, which is the next plan. Nothing here creates the second project.

**Ordering: Task 4 is done before Task 3.** As written, Task 3 left the build red between its Step 5 and Task 4, because the window references the app host element before it exists. Task 4 is purely additive (new files nothing else imports), so doing it first removes that window entirely rather than documenting it. Executed order is 1, 2, **4, 3**, 5, 6, 7, 8, 9. Every task ends green on both `npm test` and `npm run build`.

**Correction to Task 4's Step 4 sketch, found by executing it.** The sketch's `#mount` used `this.replaceChildren(new ctor())` alongside `createRenderRoot() { return this; }`. That combination is permanently broken, not merely fragile: `replaceChildren` removes the marker comments Lit uses to track its own template parts, so the *next* update throws `This ChildPart has no parentNode and therefore cannot accept a value`. Implementing the sketch verbatim gave 0 passed / 9 failed, every failure that same error.

The working arrangement is to make the app element **a value in the template** rather than a child appended beside it: hold the constructed element in `@state`, return it from `render()` (`html\`${this._app ?? nothing}\``), and have `#mount` assign rather than append, so Lit owns every child of the light-DOM root. Lit compares node values by identity, so a re-render that does not change the state leaves the app's element physically untouched, which is what a game mid-play needs. The shipped tests hold this by asserting node *identity* across an unrelated `requestUpdate()`, not merely that something is still there.

**Verified against the installed packages while writing**, so no step rests on a guess: `keyed` is re-exported from `@umbraco-cms/backoffice/external/lit` (Task 3); `UmbExtensionsManifestInitializer` is exported from `@umbraco-cms/backoffice/extension-api` and `permitted` is computed from a manifest's `conditions`, with no conditions meaning permitted (Task 6); the `UmbExtensionManifestMap` global augmentation is how Umbraco's own kinds declare themselves (Task 4); the theme context publishes `resolved`, not a `themeId` (Task 8); `groupGames` already exists in both locale files (Task 7); and the Umbraco identity theme ships an empty palette on purpose, which is why Task 2's coverage test exempts it.
