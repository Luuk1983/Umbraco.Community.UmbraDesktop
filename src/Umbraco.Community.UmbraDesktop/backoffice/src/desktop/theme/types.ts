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
 * including the assertion that keeps a chrome-only token from ever landing in this list: nothing
 * else would notice, since a host component declaring one of these on a descendant of `.desktop`
 * would beat the palette it inherits and make it unthemeable (see the fallback doc below).
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
 * | `--umbradesktop-app-edge-width` | `2px` on Win98, `0` on flat themes |
 * | `--umbradesktop-app-radius` | `0` on Win98, `6px` on macOS and Win11 |
 * | `--umbradesktop-app-text` | Primary text |
 * | `--umbradesktop-app-text-muted` | Secondary text |
 * | `--umbradesktop-app-accent` | Selection and focus |
 * | `--umbradesktop-app-font` | The theme's UI font stack |
 *
 * `edge-width` and `radius` are the pair that lets one app stylesheet be both a bevelled Win98
 * control (width `2px`, radius `0`) and a flat rounded one (width `0`, radius `6px`) with no branch
 * in the app. Prefer widening this group over adding a per-theme branch to an app.
 *
 * See {@link UMBRADESKTOP_APP_TOKEN_FALLBACKS} for the fallback each app is expected to write.
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
  '--umbradesktop-app-surface-raised': 'var(--uui-color-surface)',
  '--umbradesktop-app-surface-sunken': 'var(--uui-color-background)',
  '--umbradesktop-app-edge-light': 'transparent',
  '--umbradesktop-app-edge-dark': 'var(--uui-color-border)',
  '--umbradesktop-app-edge-width': '1px',
  '--umbradesktop-app-radius': '3px',
  '--umbradesktop-app-text': 'var(--uui-color-text)',
  '--umbradesktop-app-text-muted': 'var(--uui-color-text-alt)',
  '--umbradesktop-app-accent': 'var(--uui-color-selected)',
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
 * clamp must know where the non-draggable controls are, and the desktop must know how much of its
 * bottom edge the taskbar or dock occupies.
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
