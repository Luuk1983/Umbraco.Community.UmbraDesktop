import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher';
import { UMBRADESKTOP_BACKOFFICE_SECTION_PATH } from '../url-inference';

/**
 * A window on one entity: a document, a media item, a data type. Built in one place because two
 * features open them, the AI chat's open tool and the launcher's search, and the same item opened
 * from both must be one window rather than two with different aliases and sizes.
 */

/** Backoffice mount path: core's path patterns and search hrefs are relative to it. */
const BACKOFFICE_PATH = '/umbraco';

/**
 * The size an entity window opens at: one workspace with no section sidebar to lean on, so larger
 * than a section, as the catalogue's `workspace-only` entries open.
 */
export const UMBRADESKTOP_ENTITY_WINDOW_SIZE = { w: 1200, h: 780 };

/** The resize floor below which a workspace's own layout stops working. */
export const UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE = { w: 900, h: 540 };

/**
 * Mount a core path pattern's output under the backoffice. `generateAbsolute` returns no leading
 * slash, so plain concatenation produces `/umbracosection/...`; normalised rather than assumed, in
 * case a future version corrects that.
 * @param path A path from `UmbPathPattern.generateAbsolute`.
 * @returns The URL to put in a window's iframe.
 */
export function backofficeUrl(path: string): string {
  return `${BACKOFFICE_PATH}/${path.replace(/^\/+/, '')}`;
}

/**
 * The window URL for a search result's `href`, or undefined when it does not land on a backoffice
 * section. Core's hrefs are relative to the backoffice (`section/content/...`), except member
 * type's, whose leading slash means the same thing; both normalise to `/umbraco/section/...`. A
 * third-party source can return anything, so an external address, or one that climbs out of the
 * sections, is refused rather than put in a window.
 * @param href The result's href.
 * @returns The absolute path to open, or undefined.
 */
export function sectionUrlFromHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const base = `${window.location.origin}${BACKOFFICE_PATH}/`;
  const relative = href.startsWith(`${BACKOFFICE_PATH}/`) ? href : href.replace(/^\/+/, '');
  let url: URL;
  try {
    url = new URL(relative, base);
  } catch {
    return undefined;
  }
  if (url.origin !== window.location.origin) return undefined;
  if (!url.pathname.startsWith(`${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/`)) return undefined;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The app alias for a window on one entity. Window identity keys off the alias, so this is what
 * makes the same item opened twice, from anywhere, one window.
 * @param entityType The entity type.
 * @param unique The entity's key.
 * @returns A stable alias.
 */
export function entityWindowAlias(entityType: string, unique: string): string {
  return `umbradesktop-entity:${entityType}:${unique}`;
}

/** The part of the window manager a lookup reads, so a test can hand in a plain object. */
export interface UmbraDesktopEntityWindowView {
  /** The open windows. */
  getWindows(): ReadonlyArray<UmbraDesktopWindow>;
  /**
   * What a window's frame reports it is editing.
   * @param id The window's id.
   */
  subjectsOf(id: string): ReadonlyArray<UmbraDesktopWorkspaceSubject>;
}

/**
 * A window already showing this entity. By subject first, because the user very often has it open
 * in their Content window already, and a second editor on one document is the conflict the
 * overwrite guard warns about. By alias as well, to cover the gap between a window opening and its
 * frame reporting what it loaded. An element app's subject never counts (#176): the Image Editor
 * reports the media item it has open, and opening that item must still open the item.
 * @param desk The desktop.
 * @param entityType The entity type wanted.
 * @param unique The key wanted.
 * @returns The window's id, or undefined.
 */
export function findEntityWindow(desk: UmbraDesktopEntityWindowView, entityType: string, unique: string): string | undefined {
  const alias = entityWindowAlias(entityType, unique);
  for (const win of desk.getWindows()) {
    if (win.app.alias === alias) return win.id;
    // Not an element app's subject (#176): the Image Editor showing a media item is not the item's page.
    if (desk.subjectsOf(win.id).some((s) => !s.version && s.entityType === entityType && s.unique === unique)) return win.id;
  }
  return undefined;
}

/** What {@link entityWindowApp} needs to build a window. */
export interface UmbraDesktopEntityWindowTarget {
  /** The entity type. */
  entityType: string;
  /** The entity's key. */
  unique: string;
  /** The window title. */
  name: string;
  /** The window icon. */
  icon: string;
  /** The absolute backoffice path the window loads. */
  url: string;
  /** Overrides the alias, for a deliberate second window. */
  alias?: string;
  /** True only for a deliberate second window; otherwise the manager focuses instead of stacking. */
  allowMultiple?: boolean;
}

/**
 * The app for a window on one entity: just its editor (`workspace-only`, since a section's tree
 * beside one item is navigation nobody asked for), at the entity window size.
 * @param target What to open.
 * @returns The app to hand the window manager.
 */
export function entityWindowApp(target: UmbraDesktopEntityWindowTarget): UmbraDesktopApp {
  return {
    alias: target.alias ?? entityWindowAlias(target.entityType, target.unique),
    name: target.name,
    icon: target.icon,
    content: { kind: 'iframe', url: target.url },
    chromeProfile: 'workspace-only',
    defaultSize: UMBRADESKTOP_ENTITY_WINDOW_SIZE,
    minSize: UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE,
    allowMultiple: target.allowMultiple ?? false,
  };
}
