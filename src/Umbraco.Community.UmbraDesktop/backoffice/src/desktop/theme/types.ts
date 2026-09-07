import type { CSSResult } from '@umbraco-cms/backoffice/external/lit';

/**
 * Every custom property a theme may set on the **chrome** (the desktop, taskbar, launcher and
 * window elements this package owns), as a runtime list so it can be checked against the CSS that
 * actually reads them — see `tokens.test.ts`. The type below is derived from it, so a typo in a
 * palette is still a compile error. A theme may also set app tokens: see
 * {@link UMBRADESKTOP_APP_TOKENS}.
 */
export const UMBRADESKTOP_TOKENS = [
  '--umbradesktop-window-background',
  '--umbradesktop-window-body-background',
  '--umbradesktop-window-border',
  '--umbradesktop-window-radius',
  '--umbradesktop-window-shadow',
  '--umbradesktop-window-shadow-active',
  '--umbradesktop-titlebar-height',
  '--umbradesktop-titlebar-background',
  '--umbradesktop-titlebar-border-bottom',
  '--umbradesktop-titlebar-text',
  '--umbradesktop-titlebar-inactive-opacity',
  '--umbradesktop-control-width',
  '--umbradesktop-control-color',
  '--umbradesktop-control-hover-background',
  '--umbradesktop-control-close-hover-background',
  '--umbradesktop-control-close-hover-color',
  '--umbradesktop-taskbar-height',
  '--umbradesktop-taskbar-reserve',
  '--umbradesktop-taskbar-margin',
  '--umbradesktop-taskbar-radius',
  '--umbradesktop-taskbar-background',
  '--umbradesktop-taskbar-background-opaque',
  '--umbradesktop-taskbar-backdrop',
  '--umbradesktop-taskbar-border-top',
  '--umbradesktop-taskbar-shadow',
  '--umbradesktop-taskbar-text',
  '--umbradesktop-taskbar-text-emphasis',
  '--umbradesktop-task-hover-background',
  '--umbradesktop-start-hover-background',
  '--umbradesktop-start-active-background',
  '--umbradesktop-task-active-marker',
  '--umbradesktop-launcher-width',
  '--umbradesktop-launcher-height',
  '--umbradesktop-launcher-max-height',
  '--umbradesktop-launcher-left',
  '--umbradesktop-launcher-bottom',
  '--umbradesktop-launcher-background',
  '--umbradesktop-launcher-backdrop',
  '--umbradesktop-launcher-border',
  '--umbradesktop-launcher-radius',
  '--umbradesktop-launcher-shadow',
  '--umbradesktop-launcher-text',
  '--umbradesktop-launcher-hover-background',
  '--umbradesktop-launcher-border-emphasis',
  '--umbradesktop-launcher-search-radius',
  '--umbradesktop-launcher-card-background',
  '--umbradesktop-launcher-card-border',
  '--umbradesktop-launcher-card-radius',
  '--umbradesktop-launcher-pin-hover-background',
  '--umbradesktop-desktop-background-color',
  '--umbradesktop-desktop-background-image',
  '--umbradesktop-desktop-scrim',
  '--umbradesktop-desktop-watermark-opacity',
] as const;

/**
 * Every custom property a theme may set on the chrome. See {@link UMBRADESKTOP_APP_TOKENS} for the
 * other group a palette can cover.
 */
export type UmbraDesktopToken = (typeof UMBRADESKTOP_TOKENS)[number];

/**
 * Every custom property an **app** may read — a self-contained app in a window (a game, a
 * calculator), not the chrome around it.
 *
 * Separate from {@link UMBRADESKTOP_TOKENS} on purpose. That list is checked against the CSS of the
 * four chrome components, exactly, so that a token nothing reads cannot sit there as dead weight.
 * These have no reader in this package at all: their consumers ship in other packages, which is
 * what makes them a published contract rather than drift. `app-tokens.test.ts` holds them instead,
 * including the assertion that keeps a chrome token from ever taking a name in this namespace:
 * nothing else would notice, since a chrome component declaring `--umbradesktop-app-*` on a
 * descendant of `.desktop` would beat the palette it inherits and make that name unthemeable for
 * apps (see the fallback doc below).
 *
 * Purpose, one row per token:
 *
 * | Token | Purpose |
 * |---|---|
 * | `--umbradesktop-app-surface` | The app's own panel ground, distinct from the window body behind it |
 * | `--umbradesktop-app-surface-raised` | A control face: a Minesweeper cell, a calculator key |
 * | `--umbradesktop-app-surface-sunken` | A recessed field: the minefield well, a numeric display |
 * | `--umbradesktop-app-edge-light` | The light edge of a bevel, or a top border |
 * | `--umbradesktop-app-edge-dark` | The dark edge |
 * | `--umbradesktop-app-border` | A boundary line that stays visible on all three surfaces: a field's outline, a grid's ruling, a row separator |
 * | `--umbradesktop-app-edge-width` | Bevel thickness. Wide enough to chisel an edge on a theme whose controls are bevelled, down to zero on one whose controls are flat |
 * | `--umbradesktop-app-radius` | Corner rounding. Zero on a theme whose controls are square-cornered, non-zero on one whose controls are rounded |
 * | `--umbradesktop-app-text` | Primary text |
 * | `--umbradesktop-app-text-muted` | Secondary text |
 * | `--umbradesktop-app-accent` | Selection and focus |
 * | `--umbradesktop-app-accent-text` | Text and icons on an `accent` fill. A theme sets whichever of light or dark actually reads on its own accent |
 * | `--umbradesktop-app-font` | The theme's UI font stack |
 *
 * No row states a shipped value, deliberately: this file is the normative contract, so a number
 * here that a palette later contradicts is worse than no number at all. It said `radius` was `6px`
 * "on macOS and Win11" while Win11 shipped `4px`, which is exactly the drift the rows above are now
 * written to be incapable of.
 *
 * `edge-width` and `radius` are the pair that lets one app stylesheet be both a bevelled control
 * (a non-zero width with no rounding) and a flat rounded one (zero width with a rounding) with no
 * branch in the app. `accent-text` is the same idea applied to a fill: no single text colour reads
 * on every theme's accent, so the theme names the one that does rather than the app guessing.
 * Prefer widening this group over adding a per-theme branch to an app.
 *
 * `border` is the group's one **guaranteed** colour, and it exists because the `edge-*` pair is
 * not one. A theme is entitled to make its bevel as subtle as its own controls are: two of the
 * five publish `edge-width: 0px` with an `edge-dark` at 8% black, correctly, and an app whose only
 * boundary comes from that pair draws nothing at all under them. Windows 11's Minesweeper board
 * rendered as one undivided sheet for exactly that reason, in both variants: a 1.03:1 fill step
 * between a closed cell and the well behind it, ruled by a 1.15:1 hairline. `border` is instead
 * asserted at **3:1 against all three of its own palette's surfaces** — WCAG 1.4.11's ratio for
 * the boundary of a user interface component — which `app-tokens.test.ts` measures, so a grid
 * ruled with it is legible under every theme including one not written yet.
 *
 * It cannot be folded into `edge-dark` instead of being its own token. On a dark palette a visible
 * boundary is a *lighter* line than the surface it separates, so strengthening `edge-dark` there
 * would leave it lighter than `edge-light` and invert every bevel an app drew from the pair.
 *
 * The three `surface` tokens may carry **any valid `background` value, including a gradient**. No
 * shipped theme sets a gradient app surface today, but four of the five use gradients elsewhere in
 * their chrome, so the first one to reach for it here is a question of when rather than whether. An
 * app must therefore write `background: var(--umbradesktop-app-surface)` and never
 * `background-color:`, which accepts only a colour and would drop a gradient value entirely,
 * leaving the element unpainted. The `edge-*`, `text*` and `accent*` tokens are plain colours,
 * since each feeds a property that takes one.
 *
 * **A length-valued token in this group always carries a unit, zero included.** `edge-width` and
 * `radius` are written `0px` and never `0`, because a bare number is a valid `<length>` on its own
 * and **invalid inside `calc()`, `min()` or `max()`**, where the invalid value takes the entire
 * declaration with it and nothing is logged. The chrome's own tokens are allowed the shorter
 * spelling — Win11's `launcher-card-radius` is `0` — since both ends of that contract live in this
 * repository and a reader that wraps one in `calc()` is one diff from being fixed. This group's
 * readers ship in packages this repository cannot inspect, so the same value here is a trap rather
 * than a shorthand: the first real consumer wrote `max(1px, var(--umbradesktop-app-edge-width))` to
 * floor a grid ruling and silently lost its `border` shorthand, `border-style` included, under the
 * two themes whose controls are flat. `app-tokens.test.ts` asserts it of every palette and of the
 * fallback set, since a comment in six files is not something a seventh theme's author has read.
 *
 * See {@link UMBRADESKTOP_APP_TOKEN_FALLBACKS} for the fallback each app is expected to write.
 */
export const UMBRADESKTOP_APP_TOKENS = [
  '--umbradesktop-app-surface',
  '--umbradesktop-app-surface-raised',
  '--umbradesktop-app-surface-sunken',
  '--umbradesktop-app-edge-light',
  '--umbradesktop-app-edge-dark',
  '--umbradesktop-app-border',
  '--umbradesktop-app-edge-width',
  '--umbradesktop-app-radius',
  '--umbradesktop-app-text',
  '--umbradesktop-app-text-muted',
  '--umbradesktop-app-accent',
  '--umbradesktop-app-accent-text',
  '--umbradesktop-app-font',
] as const;

/** Every custom property an app may read. */
export type UmbraDesktopAppToken = (typeof UMBRADESKTOP_APP_TOKENS)[number];

/**
 * The published fallback contract for {@link UMBRADESKTOP_APP_TOKENS}: the value every app is
 * expected to write as its own CSS fallback (`var(--umbradesktop-app-surface, <this value>)`),
 * since there are no host-side fallbacks for these and there cannot be. The chrome puts each of
 * *its* tokens' fallback in the component that reads it, which is why the Umbraco identity theme
 * can ship an empty palette. An app's reader lives in another package, so it carries its own
 * fallback instead — and this is data, not prose, precisely so it cannot drift from the token list
 * above: `satisfies Record<UmbraDesktopAppToken, string>` makes a missing or extra key a compile
 * error, and `app-tokens.test.ts` asserts the same at runtime, since the test runner does not
 * type-check.
 *
 * These values are deliberately the Umbraco look. An app that reads only these therefore renders as
 * the identity theme by construction, which is the other half of why that theme's own palette can
 * stay empty: the chrome side is empty because each chrome component already carries the Umbraco
 * fallback, and the app side is empty because every app already carries this one.
 */
export const UMBRADESKTOP_APP_TOKEN_FALLBACKS = {
  '--umbradesktop-app-surface': 'var(--uui-color-surface)',
  // Not `--uui-color-surface` again, which is what shipped and was a defect in this contract's own
  // data: two tokens documented as distinct roles resolved to one value, so under the identity
  // theme — whose palette is empty and whose values therefore *are* these fallbacks — a raised
  // control was exactly the colour of the panel behind it. Minesweeper measured 1.00:1.
  //
  // `--uui-color-surface-emphasis` is Umbraco's own "a step off `surface`" token, and it is the
  // only member of that family that differs from `--uui-color-surface` in all three of Umbraco's
  // themes: light (`#fafafa` against `#fff`), dark (`#333a42` against `#2d333b`) and high contrast
  // (`#dadada` against `#fff`). `--uui-color-surface-alt` is the obvious alternative and does not
  // work: in the light theme it is `--uui-palette-sand`, the same value as `--uui-color-background`
  // and therefore a collision with `surface-sunken` below instead.
  //
  // Being three values is all this fixes. The steps are thin — 1.04:1 in light, 1.11:1 in dark —
  // because Umbraco publishes no surface trio with more, and a boundary that meets WCAG 1.4.11's
  // 3:1 is not something a fallback can invent while still being the Umbraco look. That is the
  // separate problem the design doc's §6.1 settles on the app side: rule a tiled grid with the
  // grid's own `edge-dark` ground showing through a 1px gap (`docs/desktop-apps.md` §4).
  '--umbradesktop-app-surface-raised': 'var(--uui-color-surface-emphasis)',
  '--umbradesktop-app-surface-sunken': 'var(--uui-color-background)',
  '--umbradesktop-app-edge-light': 'transparent',
  '--umbradesktop-app-edge-dark': 'var(--uui-color-border)',
  // Not `--uui-color-border`, which is what `edge-dark` above uses and is a 1.43:1 hairline against
  // Umbraco's own surfaces — the value that left the identity theme's board as hard to read as
  // Win11's. Nothing in Umbraco's border family reaches the 3:1 this token promises, so the
  // fallback borrows the muted text colour, which does, and which tracks the backoffice's
  // light/dark setting the way every other value here does. Under the identity theme `border` and
  // `text-muted` therefore resolve to one colour. They are still two tokens: a theme that wants a
  // delicate 3:1 rule rather than a text-weight one only has to say so, and five of them do.
  '--umbradesktop-app-border': 'var(--uui-color-text-alt)',
  // Both lengths carry a unit even when the value is zero, and every palette's app tokens must too:
  // a bare `0` is a valid length on its own and invalid inside `calc()`, `min()` or `max()`, where
  // it drops the whole declaration silently. A chrome token can get away with that because its
  // reader is in this repository; these readers are not, which is why `app-tokens.test.ts` asserts
  // no app token value anywhere is a unitless number.
  '--umbradesktop-app-edge-width': '1px',
  '--umbradesktop-app-radius': '3px',
  '--umbradesktop-app-text': 'var(--uui-color-text)',
  '--umbradesktop-app-text-muted': 'var(--uui-color-text-alt)',
  '--umbradesktop-app-accent': 'var(--uui-color-selected)',
  // The Umbraco look puts white-ish text on its selected blue, so the fallback is the surface
  // colour rather than a bare `#fff`: it tracks the backoffice's own light/dark setting the way
  // every other value here does.
  '--umbradesktop-app-accent-text': 'var(--uui-color-surface)',
  '--umbradesktop-app-font': 'inherit',
} as const satisfies Record<UmbraDesktopAppToken, string>;

/**
 * Either token group a palette can cover: the chrome, whose fallback lives in the component that
 * reads it, and the app surface, whose fallback lives in {@link UMBRADESKTOP_APP_TOKEN_FALLBACKS}
 * instead because its readers ship in other packages.
 */
export type UmbraDesktopPaletteToken = UmbraDesktopToken | UmbraDesktopAppToken;

/**
 * One theme's values for one variant. Partial by design: a chrome token's fallback is baked into
 * the component that reads it and an app token's fallback is carried by the app itself (see
 * {@link UMBRADESKTOP_APP_TOKEN_FALLBACKS}), so a theme sets only what it wants to change. Covers
 * both token groups: a theme paints its own chrome and may also opt into restyling the app surface,
 * since a palette is one flat set of custom properties regardless of who ends up reading each one.
 */
export type UmbraDesktopPalette = Partial<Record<UmbraDesktopPaletteToken, string>>;

/**
 * The geometry a theme has to publish because JavaScript — not CSS — needs it: the window bounds
 * clamp must know where the non-draggable controls are, the window manager must know what this
 * theme's chrome costs an app before it can size a window around one, and the desktop must know
 * how much of its bottom edge the taskbar or dock occupies.
 *
 * Sibling shape to {@link UmbraDesktopKeepVisible `UmbraDesktopKeepVisible`} in `window-model.ts`,
 * with different field names for a deliberate reason rather than an oversight: this one is
 * theme-authoring vocabulary, spelled out for a hand-edited theme file, while the other is
 * clamp-math vocabulary, kept terse to match the geometry variables in `clampWindowPosition`. An
 * adapter between the two is written by hand rather than unifying the shapes.
 */
export interface UmbraDesktopThemeMetrics {
  /** Titlebar height in px. Kept in sync with the theme's own CSS. */
  titlebarHeight: number;
  /** Width in px of non-draggable controls at the titlebar's physical left end. */
  leadingControlsWidth: number;
  /** Width in px of non-draggable controls at the titlebar's physical right end. */
  trailingControlsWidth: number;
  /** Draggable titlebar, in px, that must stay on screen while dragging. */
  grab: number;
  /**
   * Width in px this theme's chrome takes out of a window's declared size before anything reaches
   * the app inside it. Zero for a theme whose frame sizes content-box, since its border ring is
   * then painted outside the width the window manager set.
   *
   * Published because `meta.defaultSize` and `meta.minSize` are an app's **content** size and the
   * host adds the chrome: an app ships in another package and cannot read a titlebar height, a
   * frame ring or a sunken well, so it cannot do this arithmetic and must not have to try. See
   * `window-chrome.ts`, and its sibling {@link chromeHeight}.
   *
   * Measured in the same reference frame the window's size is written in — the box `.frame`'s
   * `width` sizes — so a theme that opts `.frame` into `border-box` counts its ring here and one
   * that leaves it content-box does not. Every theme's own `metrics.test.ts` subtracts the app's
   * rendered box from the window's rect and holds this number against the difference, which is the
   * only check that catches a `padding` or a `box-sizing` nobody folded back into the sum.
   */
  chromeWidth: number;
  /**
   * Height in px this theme's chrome takes out of a window's declared size: the titlebar, plus
   * whatever else sits outside the app's box on the vertical axis.
   *
   * Not the same number as {@link titlebarHeight}, and the difference is what the reported bug was
   * made of. That one is measured from the window's outer top edge for the drag clamp, so it
   * includes a frame ring painted outside the sized box and excludes anything below the caption.
   * This one is what the app does not get: under Windows 98 that is a ring at the top *and* the
   * bottom plus a sunken well, which is why an app's "tallest titlebar of the five" guess came out
   * 32px short there and looked right everywhere else.
   */
  chromeHeight: number;
  /** Height in px reserved at the desktop's bottom edge for the taskbar or dock. */
  taskbarReserve: number;
}

/** A theme's per-surface stylesheets. Every surface is optional; a theme styles what it needs. */
export interface UmbraDesktopThemeSheets {
  /** Rules adopted into `umbradesktop-desktop`. */
  desktop?: CSSResult;
  /** Rules adopted into `umbradesktop-taskbar`. */
  taskbar?: CSSResult;
  /** Rules adopted into `umbradesktop-launcher`. */
  launcher?: CSSResult;
  /** Rules adopted into `umbradesktop-window`. */
  window?: CSSResult;
}

/** Which chrome component a stylesheet belongs to. */
export type UmbraDesktopSurface = keyof UmbraDesktopThemeSheets;

/**
 * The same set once built into stylesheets a shadow root can adopt.
 *
 * Themes author their CSS with Lit's `css` tag, which hands back a `CSSResult` whose real
 * `CSSStyleSheet` is built lazily on first read of `.styleSheet` and memoized **onto the
 * `CSSResult` itself**. That write is the problem: the theme context publishes its sheets through
 * an observable state, and Umbraco's `UmbObjectState` deep-freezes everything it holds, so the
 * first component to read `.styleSheet` off a published `CSSResult` threw
 * `TypeError: Cannot add property _styleSheet, object is not extensible` — silently, inside an
 * observer — and no theme CSS was ever adopted.
 *
 * Building the stylesheets *before* they are published closes that off: what crosses the
 * observable is a finished `CSSStyleSheet` with no lazy work left to do, so it no longer matters
 * what a state does to it on the way through. Themes keep authoring in `css`.
 */
export type UmbraDesktopAdoptedSheets = Partial<Record<UmbraDesktopSurface, CSSStyleSheet>>;

/**
 * The three colours the settings picker paints as a theme's preview. Named rather than a
 * positional triple: a theme author writing a Win98 or macOS palette has to map these onto a
 * design language that has no such words, and a swapped tuple would be invisible.
 */
export interface UmbraDesktopSwatch {
  /** The dominant colour of the chrome itself — the taskbar or dock. */
  chrome: string;
  /** The colour this theme marks the active or selected thing with. */
  accent: string;
  /** The colour a window's own surface is painted. */
  surface: string;
}

/** A theme as shipped in the package. */
export interface UmbraDesktopTheme {
  /** Stable id, persisted in settings. */
  id: string;
  /** Display name for the picker. Not localized — these are proper nouns, as with wallpapers. */
  name: string;
  /** The colours the picker draws its preview from. */
  swatch: UmbraDesktopSwatch;
  /** Palettes by variant. `light` is mandatory; `dark` falls back to it when absent. */
  palettes: { light: UmbraDesktopPalette; dark?: UmbraDesktopPalette };
  /** Geometry JavaScript needs. */
  metrics: UmbraDesktopThemeMetrics;
  /** Lazily imported stylesheets. Omitted by a theme that needs none. */
  sheets?: () => Promise<UmbraDesktopThemeSheets>;
}
