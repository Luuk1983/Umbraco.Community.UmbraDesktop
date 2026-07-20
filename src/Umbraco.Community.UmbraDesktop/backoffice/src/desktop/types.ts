/**
 * How much of the backoffice shell a window keeps. Lower confidence in an app
 * means keeping more chrome so it still works (see design doc §4.1).
 */
export type UmbraDesktopChromeProfile = 'full-section' | 'workspace-only' | 'bare';

/** A launchable app: a backoffice deep-link plus how to frame it. */
export interface UmbraDesktopApp {
  /** Stable identifier for the app. */
  alias: string;
  /** Human-friendly window title. */
  name: string;
  /** Umbraco icon alias, e.g. "icon-umbraco". */
  icon: string;
  /** Backoffice path the window's iframe loads, e.g. "/umbraco/section/content". */
  url: string;
  /** Default chrome profile for windows of this app. */
  chromeProfile: UmbraDesktopChromeProfile;
  /** Default window size in px. */
  defaultSize?: { w: number; h: number };
}

/** A position/size rectangle in desktop pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Runtime state of a single open window. */
export type UmbraDesktopWindowState = 'normal' | 'minimized' | 'maximized';

/** One open window instance on the desktop. */
export interface UmbraDesktopWindow {
  /** Unique per-instance id. */
  id: string;
  /** The app this window hosts. */
  app: UmbraDesktopApp;
  /** Current rectangle (used when state === 'normal'). */
  rect: Rect;
  /** Stacking order; higher is nearer the front. */
  z: number;
  /** Whether this window currently has focus. */
  active: boolean;
  /** Window state. */
  state: UmbraDesktopWindowState;
}
