/**
 * What a click on a link inside a manager window means.
 *
 * Core's media collection renders links meant for the Media section: a card links to the media
 * workspace, Create's options to a create route, the view switcher to a view path under the current
 * address. In a desktop window, following any of them would let Umbraco's router navigate the whole
 * backoffice away from the desktop, so the manager reads each one here and acts on it in the window
 * instead (hosting spike, workarounds 2 and 3). Pure: the element decides what to do with the answer.
 */

import type { UmbraDesktopMediaPlace } from './location.js';

/** What a link means to a manager window. */
export type UmbraDesktopMediaLinkIntent =
  /** The Media root or the recycle bin, as the tree links them: show it in the window. */
  | { kind: 'place'; place: UmbraDesktopMediaPlace }
  /** A media item's edit link: open it. */
  | { kind: 'item'; unique: string }
  /** A create link: open the create workspace for this type, in this parent. */
  | { kind: 'create'; parent: string | null; mediaType: string; path: string }
  /** A collection view switch: set this window's view. */
  | { kind: 'view'; alias: string }
  /** Any other backoffice link: never followed from inside a window. */
  | { kind: 'section' }
  /** A link off the backoffice, such as a file's own URL: left to the browser. */
  | { kind: 'other' };

/** A collection view, as much of its manifest as the rule reads. */
export interface UmbraDesktopMediaViewLink {
  /** The view's extension alias. */
  alias: string;
  /** Its `meta.pathName`, the last segment of its link. */
  pathName: string;
}

/** Where the backoffice lives on the site; core's relative hrefs are relative to it. */
const BACKOFFICE = '/umbraco/';

/** A media key. */
const KEY = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Core's media edit route, with anything after the key. Under any section: the collection writes
 * `section/media/...` (`UMB_EDIT_MEDIA_WORKSPACE_PATH_PATTERN`), but a tree item builds its link from
 * the section it is in, which on the desktop is the desktop's own.
 */
const EDIT = new RegExp(`^/umbraco/section/[^/]+/workspace/media/edit/(${KEY})(?:/|$)`, 'i');

/** The tree's root item and the recycle bin's, which link to workspaces of their own. */
const PLACE = /^\/umbraco\/section\/[^/]+\/workspace\/(media-root|media-recycle-bin-root)(?:\/|$)/;

/** Core's media create route, `UMB_CREATE_MEDIA_WORKSPACE_PATH_PATTERN`. */
const CREATE = new RegExp(`^/umbraco/section/media/workspace/media/create/parent/(media|media-root)/(${KEY}|null)/(${KEY})/?$`, 'i');

/**
 * Read a link.
 * @param href The link's `href`, absolute or relative to the backoffice as core writes it.
 * @param views The collection views on offer in this window.
 * @returns What it means.
 */
export function linkIntent(href: string, views: ReadonlyArray<UmbraDesktopMediaViewLink>): UmbraDesktopMediaLinkIntent {
  let url: URL;
  try {
    url = new URL(href, new URL(BACKOFFICE, window.location.origin));
  } catch {
    return { kind: 'other' };
  }
  if (url.origin !== window.location.origin || !url.pathname.startsWith(BACKOFFICE)) return { kind: 'other' };
  const path = url.pathname;
  const edit = EDIT.exec(path);
  if (edit) return { kind: 'item', unique: edit[1] };
  const place = PLACE.exec(path);
  if (place) return { kind: 'place', place: place[1] === 'media-root' ? { kind: 'root' } : { kind: 'bin' } };
  const create = CREATE.exec(path);
  if (create) {
    return { kind: 'create', parent: create[2] === 'null' ? null : create[2], mediaType: create[3], path };
  }
  const last = path.replace(/\/+$/, '').split('/').pop() ?? '';
  const view = views.find((each) => each.pathName === last);
  if (view && !path.includes('/workspace/')) return { kind: 'view', alias: view.alias };
  return { kind: 'section' };
}
