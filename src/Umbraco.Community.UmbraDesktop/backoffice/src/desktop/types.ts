/**
 * How much of the backoffice shell a window keeps — a monotonic ladder, each rung stripping
 * one more layer of chrome (see design doc §4.1):
 * - `full-section`: hide only the top backoffice header; keep the section sidebar (menu/tree).
 *   For tools where the tree IS the tool (Document Types, Templates, …).
 * - `workspace-only`: also strip the section sidebar so the workspace fills the window.
 *   For self-contained workspaces (Log Viewer, Webhooks).
 * - `bare`: also strip the dashboard tab strip a section shows when deep-linked to a dashboard.
 *   For single-focus dashboards (Examine, Health Check, Profiling, Models Builder).
 *
 * Lower confidence in an app means choosing a higher rung (more chrome) so it still works.
 */
export type UmbraDesktopChromeProfile = 'full-section' | 'workspace-only' | 'bare';

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

/** A launchable app: what its window body is, plus how to frame and present it. */
export interface UmbraDesktopApp {
  /** Stable identifier for the app. */
  alias: string;
  /** Human-friendly window title. */
  name: string;
  /** Umbraco icon alias, e.g. "icon-umbraco". */
  icon: string;
  /** What this app's window body is: a backoffice iframe, or a self-contained element. */
  content: UmbraDesktopAppContent;
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
  /**
   * True when `ref` points at an extension shipped by a package that may not be installed
   * (a third-party integration such as uSync). Such an entry resolving to nothing is the
   * normal case, not a misconfiguration, so the adapter stays quiet about it instead of
   * warning on every install without that package.
   */
  optional?: boolean;
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
