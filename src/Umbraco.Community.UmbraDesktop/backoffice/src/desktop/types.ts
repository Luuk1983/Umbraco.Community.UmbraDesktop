/**
 * How much of the backoffice shell a window keeps. Lower confidence in an app
 * means keeping more chrome so it still works (see design doc §4.1).
 */
export type UmbraDesktopChromeProfile = 'full-section' | 'workspace-only' | 'bare';

/** A launchable app: a backoffice deep-link plus how to frame and present it. */
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
  /** Minimum window size in px (resize floor); falls back to the global minimum when unset. */
  minSize?: { w: number; h: number };
  /** Whether more than one instance may open (default: allowed). */
  allowMultiple?: boolean;
  /** Sort weight within its group (ascending). */
  weight?: number;
  /** Curatorial group alias; undefined → the reserved "More" group. */
  group?: string;
  /** Source section alias — permission gate + default-group hint. */
  sourceSection?: string;
  /** Confidence tier (always set by derivation; optional for back-compat). */
  confidence?: UmbraDesktopConfidence;
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

/** Whether an app was maintainer-certified or auto-derived as an untested fallback. */
export type UmbraDesktopConfidence = 'certified' | 'uncertified';

/** A single curatorial group in the launcher. Flat — groups never nest. */
export interface UmbraDesktopGroup {
  /** Stable id, referenced by an app's `group`. */
  alias: string;
  /** Display label — a localization token, e.g. '#umbraDesktop_groupDiagnostics'. */
  label: string;
  /** Sort weight (ascending; lower shows first). */
  weight?: number;
  /** True for the reserved auto-generated "More" group. */
  auto?: boolean;
}

/**
 * One curated catalogue entry. Links to a destination via `ref` (URL inferred from
 * the registry) or `url` (explicit escape hatch), plus display placement.
 */
export interface UmbraDesktopCatalogueEntry {
  /** Stable app id. */
  alias: string;
  /** Alias of a registered `section`/`dashboard`/`menuItem`; URL inferred from it. */
  ref?: string;
  /** Explicit hand-verified URL (for surfaces `ref` can't infer). */
  url?: string;
  /** Permission gate + section prefix; required for a menu-item `ref` or a `url` entry. */
  section?: string;
  /** Override window title (defaults to the referenced extension's label). */
  name?: string;
  /** Override icon (defaults to the referenced extension's icon). */
  icon?: string;
  /** Chrome profile (defaults to `full-section`). */
  chromeProfile?: UmbraDesktopChromeProfile;
  /** Default window size in px. */
  defaultSize?: { w: number; h: number };
  /** Minimum window size in px (resize floor); falls back to the global minimum when unset. */
  minSize?: { w: number; h: number };
  /** Whether more than one instance may open. */
  allowMultiple?: boolean;
  /** Sort weight within its group (ascending). */
  weight?: number;
  /** Curatorial group alias (see catalogue/groups.ts). */
  group?: string;
}

/** The collated curated catalogue (groups + entries). */
export interface UmbraDesktopCatalogue {
  /** Curated flat groups. */
  groups: UmbraDesktopGroup[];
  /** App entries. */
  entries: UmbraDesktopCatalogueEntry[];
  /** Section aliases the fallback must never surface (see catalogue/exclusions.ts). */
  excludedSections: string[];
}

/** Primitives extracted from a referenced manifest, fed to `inferUrl`. */
export interface UmbraDesktopRefDescriptor {
  /** Which registry surface the reference points at. */
  type: 'section' | 'dashboard' | 'menuItem';
  /** Menu-item kind, if any ('tree' | 'link' | 'action'); undefined/'default' = navigable. */
  kind?: string;
  /** The section's own pathname, or a dashboard's own pathname. */
  pathname?: string;
  /** The owning-section pathname (for dashboard / menu-item refs). */
  sectionPathname?: string;
  /** The workspace entity type (for menu-item refs). */
  entityType?: string;
}

/** A catalogue entry after the adapter resolved its URL + gate + inherited presentation. */
export interface UmbraDesktopResolvedEntry {
  /** The original entry. */
  entry: UmbraDesktopCatalogueEntry;
  /** Resolved absolute URL (inferred or explicit), or null when unresolvable. */
  url: string | null;
  /** The section alias that must be permitted for this entry to show. */
  gateSectionAlias: string | null;
  /** True when this entry represents a whole section (suppresses its fallback). */
  isSectionRoot: boolean;
  /** Name inherited from the referenced manifest, if any. */
  inheritedName?: string;
  /** Icon inherited from the referenced manifest, if any. */
  inheritedIcon?: string;
}

/** A section the current user may access, with the primitives needed to build URLs. */
export interface UmbraDesktopSectionInfo {
  /** Section alias, e.g. "Umb.Section.Content". */
  alias: string;
  /** Display label. */
  label: string;
  /** URL pathname, e.g. "content". */
  pathname: string;
}

/** A group with its resolved apps, for the launcher display. */
export interface UmbraDesktopLauncherGroup {
  /** The group. */
  group: UmbraDesktopGroup;
  /** Apps in this group, sorted. */
  apps: UmbraDesktopApp[];
}
