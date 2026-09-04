import type { CSSResult } from '@umbraco-cms/backoffice/external/lit';

/**
 * Every custom property a theme may set. Declared as a union rather than a bare string so a typo
 * in a palette is a compile error, and so the desktop element can clear the full set when a theme
 * that does not use a token replaces one that did.
 */
export type UmbraDesktopToken =
  | '--umbradesktop-window-background'
  | '--umbradesktop-window-body-background'
  | '--umbradesktop-window-border'
  | '--umbradesktop-window-radius'
  | '--umbradesktop-window-shadow'
  | '--umbradesktop-window-shadow-active'
  | '--umbradesktop-titlebar-height'
  | '--umbradesktop-titlebar-background'
  | '--umbradesktop-titlebar-border-bottom'
  | '--umbradesktop-titlebar-text'
  | '--umbradesktop-titlebar-inactive-opacity'
  | '--umbradesktop-control-width'
  | '--umbradesktop-control-color'
  | '--umbradesktop-control-hover-background'
  | '--umbradesktop-control-close-hover-background'
  | '--umbradesktop-control-close-hover-color'
  | '--umbradesktop-taskbar-height'
  | '--umbradesktop-taskbar-reserve'
  | '--umbradesktop-taskbar-margin'
  | '--umbradesktop-taskbar-radius'
  | '--umbradesktop-taskbar-background'
  | '--umbradesktop-taskbar-background-opaque'
  | '--umbradesktop-taskbar-backdrop'
  | '--umbradesktop-taskbar-border-top'
  | '--umbradesktop-taskbar-shadow'
  | '--umbradesktop-taskbar-text'
  | '--umbradesktop-taskbar-text-emphasis'
  | '--umbradesktop-task-hover-background'
  | '--umbradesktop-start-hover-background'
  | '--umbradesktop-start-active-background'
  | '--umbradesktop-task-active-marker'
  | '--umbradesktop-launcher-width'
  | '--umbradesktop-launcher-height'
  | '--umbradesktop-launcher-max-height'
  | '--umbradesktop-launcher-left'
  | '--umbradesktop-launcher-bottom'
  | '--umbradesktop-launcher-background'
  | '--umbradesktop-launcher-backdrop'
  | '--umbradesktop-launcher-border'
  | '--umbradesktop-launcher-radius'
  | '--umbradesktop-launcher-shadow'
  | '--umbradesktop-launcher-text'
  | '--umbradesktop-launcher-hover-background'
  | '--umbradesktop-launcher-border-emphasis'
  | '--umbradesktop-launcher-search-radius'
  | '--umbradesktop-launcher-card-background'
  | '--umbradesktop-launcher-card-border'
  | '--umbradesktop-launcher-card-radius'
  | '--umbradesktop-launcher-pin-hover-background'
  | '--umbradesktop-desktop-background-color'
  | '--umbradesktop-desktop-background-image'
  | '--umbradesktop-desktop-scrim'
  | '--umbradesktop-desktop-watermark-opacity';

/**
 * One theme's values for one variant. Partial by design: every token has a fallback baked into
 * the component that reads it, so a theme sets only what it wants to change.
 */
export type UmbraDesktopPalette = Partial<Record<UmbraDesktopToken, string>>;

/**
 * The geometry a theme has to publish because JavaScript — not CSS — needs it: the window bounds
 * clamp must know where the non-draggable controls are, and the desktop must know how much of its
 * bottom edge the taskbar or dock occupies.
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

/** A theme as shipped in the package. */
export interface UmbraDesktopTheme {
  /** Stable id, persisted in settings. */
  id: string;
  /** Display name for the picker. Not localized — these are proper nouns, as with wallpapers. */
  name: string;
  /** The swatch colours the picker draws its preview from: [chrome, accent, surface]. */
  swatch: readonly [string, string, string];
  /** Palettes by variant. `light` is mandatory; `dark` falls back to it when absent. */
  palettes: { light: UmbraDesktopPalette; dark?: UmbraDesktopPalette };
  /** Geometry JavaScript needs. */
  metrics: UmbraDesktopThemeMetrics;
  /** Lazily imported stylesheets. Omitted by a theme that needs none. */
  sheets?: () => Promise<UmbraDesktopThemeSheets>;
}
