import type { ElementLoaderProperty } from '@umbraco-cms/backoffice/extension-api';

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
 * `element` rarely holds an element: it is Umbraco's `ElementLoaderProperty`, the union its own
 * `ManifestElement.element` is typed as, and it can be a module path string, a function resolving
 * to a module, an already-imported module object, or the constructor itself. Carrying that whole
 * type rather than the one arm this desktop happens to have handled first is the correction: a
 * narrower type here does not make the other forms unreachable, it only makes them arrive
 * unannounced. The string arm in particular is the only form a static `umbraco-package.json` can
 * express, and it used to be dropped on the floor.
 *
 * Which also means nothing downstream may assume it can *call* this: resolution belongs to
 * Umbraco's `loadManifestElement`, which is the only code that knows every arm. See
 * `components/app-host.element.ts`.
 *
 * It is named `element` rather than after the code consuming it (`load`, `#mount`) because that is
 * Umbraco's own vocabulary for this field, which is what {@link UmbraDesktopRegisteredApp} copies
 * it from. Local consistency is not worth diverging from the manifest this whole union is derived
 * from.
 *
 * A union rather than an optional `url` plus an optional `element`, because that pair makes both
 * "neither" and "both" representable and neither means anything. Here the compiler finds every
 * place that has to care.
 */
export type UmbraDesktopAppContent =
  | { kind: 'iframe'; url: string }
  | { kind: 'element'; element: ElementLoaderProperty };

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
  /**
   * The **content** box this app opens at, in px — its own box, with the active theme's chrome
   * added by the host. See `window-chrome.ts` for why the host owns that arithmetic and not the
   * app.
   *
   * One meaning for both sources, deliberately. A curated entry's numbers were written as window
   * sizes, and re-reading them as content sizes makes an iframe window a caption taller than
   * before; two semantics for one field would have been worse than that, and "the same amount of
   * backoffice whichever theme is on" is the better reading of a round number like 1200x780
   * anyway.
   */
  defaultSize?: { w: number; h: number };
  /**
   * The smallest **content** box this app can work in, in px; falls back to the desktop's global
   * content minimum when unset. The resize floor is this plus the chrome, or what the chrome itself
   * needs — whichever is larger.
   */
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
  /**
   * The manifest's own `element` value, in whatever form it wrote it, passed through by reference.
   * See {@link UmbraDesktopAppContent} for why the whole of Umbraco's union is carried and why
   * nobody but `loadManifestElement` resolves it.
   */
  element: ElementLoaderProperty;
  /** Launcher group alias, if the manifest named one. */
  group?: string;
  /**
   * Sort weight within the group, on the desktop's **ascending** scale (lower shows first), already
   * inverted from the manifest's Umbraco-convention weight by `registered-apps.ts`.
   */
  weight?: number;
  /** The manifest's `meta.defaultSize`: the app's **content** box in px, chrome excluded. */
  defaultSize?: { w: number; h: number };
  /** The manifest's `meta.minSize`: the smallest **content** box, in px, chrome excluded. */
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
  /**
   * Whether the backoffice inside this window is holding unsaved changes.
   *
   * Optional, and absent rather than `false` on a freshly opened window: nothing is dirty until the
   * frame's own workspace says so, and a window whose content has no editable workspace — Log
   * Viewer, any dashboard — never carries it at all. Written only by the dirty watcher, through
   * the manager; read by the titlebar marker and by every guard that could throw the work away.
   */
  dirty?: boolean;

  /**
   * Whether the server holds a version of this window's subject that neither this window's editor
   * nor its last save produced, i.e. somebody else wrote it.
   *
   * Optional and absent rather than `false`, like {@link dirty}, and set only by the server-event
   * router after it has classified an event. Meaningful only alongside `dirty`: a window with
   * nothing unsaved takes the server's version in place instead of carrying this.
   */
  changedElsewhere?: boolean;

  /**
   * Whether this window's subject has been moved to the recycle bin.
   *
   * A trashed node still exists, but core's document workspace context adds a read-only guard while
   * `isTrashed` is true, so it cannot be saved once the window has reloaded to see that. It stays
   * fully editable until then, because `isTrashed` comes from the workspace's own data and a dirty
   * window has not reloaded. Either way, a restore undoes it completely, which is why this is a
   * warning and not the error {@link deleted} is.
   */
  trashed?: boolean;

  /**
   * Whether this window's subject has been permanently deleted.
   *
   * The one state that marks a clean window, because it is the one with nothing to refresh to.
   * `submit()` branches on `getIsNew()`, which is false for a loaded document, so a save from here
   * always takes the `PUT` path and receives a 404: it cannot succeed and it recreates nothing.
   */
  deleted?: boolean;

  /**
   * Whether the editor has confirmed they mean to keep their own version over somebody else's.
   *
   * Quiets that notice's banner and nothing else: the marker and the taskbar badge stay, so an
   * acknowledged window never goes back to looking safe.
   */
  acknowledged?: boolean;

  /**
   * Whether a workspace in this window is re-fetching itself after somebody else changed it.
   *
   * Drives the titlebar reload glyph and nothing else. Deliberately not the window element's own
   * `_loading`, which also raises the body overlay: covering the content is the exact opposite of
   * what a refresh in place is for, since the editor keeps their scroll position, their open tab
   * and their split view and the only thing that should move is the glyph. On the model rather than
   * in the element because both refresh paths are triggered from outside it, by the server-event
   * router and by the banner's discard action. Design D7.
   */
  refreshing?: boolean;
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
  /** The window **body's** size in px when this entry opens; the theme's chrome is added on top. */
  defaultSize?: { w: number; h: number };
  /**
   * The smallest body, in px, the user may resize to; falls back to the desktop's global content
   * minimum. Floored at what the active theme's chrome needs either way.
   */
  minSize?: { w: number; h: number };
  /** Whether more than one instance may open. */
  allowMultiple?: boolean;
  /** Sort weight within its group (ascending). */
  weight?: number;
  /** Curatorial group alias (see catalogue/groups.ts). */
  group?: string;
  /**
   * Condition aliases on the referenced manifest that the desktop should answer before showing
   * this app.
   *
   * Only conditions whose answer is independent of where the extension is mounted belong here —
   * a user permission, a server setting, an existence check. A mount-dependent condition
   * (`Umb.Condition.SectionAlias`, `Umb.Condition.WorkspaceAlias`, the block and collection ones)
   * is answered by the iframe, which is mounted in the right place; naming one here denies the
   * entry on every install. Omit the field to evaluate nothing, which is how every entry behaved
   * before this existed.
   */
  evaluateConditions?: string[];
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
