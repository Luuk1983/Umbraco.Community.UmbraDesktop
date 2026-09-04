import type { CSSResult } from '@umbraco-cms/backoffice/external/lit';

/**
 * Every custom property a theme may set, as a runtime list so it can be checked against the CSS
 * that actually reads them — see `tokens.test.ts`. The type below is derived from it, so a typo in
 * a palette is still a compile error.
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

/** Every custom property a theme may set. */
export type UmbraDesktopToken = (typeof UMBRADESKTOP_TOKENS)[number];

/**
 * One theme's values for one variant. Partial by design: every token has a fallback baked into
 * the component that reads it, so a theme sets only what it wants to change.
 */
export type UmbraDesktopPalette = Partial<Record<UmbraDesktopToken, string>>;

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
