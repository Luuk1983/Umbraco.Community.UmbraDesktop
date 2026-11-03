import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { sectionUrlFromHref } from './entity-window.js';

/**
 * A backoffice page an app shows beside its own window (#144, plan decision 2): what the Media
 * Manager opens a media item as. The app asks with `umbradesktop-open-attached` and learns what is
 * open from its `attached` property; the window turns the one into attached content and the other
 * back into paths, with the rules here. Pure, so each rule is tested on its own.
 *
 * An app can ask for one of its own element apps the same way, by its alias instead of a path
 * (#141): Media Cleanup's details pane. A package cannot reach the window manager's `openAttached`,
 * so this event is its one way to attach content, and an element of its own is the content a page
 * can never be: one that reads the package's own state.
 */

/** An app's request for a page beside its window, once read and checked. */
export interface UmbraDesktopAttachedPageRequest {
  /** The app's own name for the page; one page per key, per window. */
  key: string;
  /** The page, as an absolute path under `/umbraco/section/`. */
  path: string;
  /** The pane header and window title. */
  name: string;
  /** The pane header and window icon. */
  icon: string;
  /** Whether to open it as a window even where a pane would fit, as Shift-click asks. */
  floating: boolean;
}

/** An app's request for one of its own element apps beside its window, by the app's alias (#141). */
export interface UmbraDesktopAttachedAppRequest {
  /** The app's own name for it; one per key, per window, shared with pages. */
  key: string;
  /** The `umbraDesktopApp` manifest alias, usually one hidden from the launcher. */
  app: string;
  /** The pane header and window title; the app's own name when empty. */
  name: string;
  /** The pane header and window icon; the app's own icon when empty. */
  icon: string;
  /** Whether to open it as a window even where a pane would fit, as Shift-click asks. */
  floating: boolean;
}

/** Either kind of request, told apart by `app`. */
export type UmbraDesktopAttachedRequest = UmbraDesktopAttachedPageRequest | UmbraDesktopAttachedAppRequest;

/** The prefix of every page's alias, which is also how a page is told from other attached content. */
const ALIAS_PREFIX = 'umbradesktop-attached:';

/** The pane width a page asks for: core's media workspace at its narrowest comfortable width. */
const PAGE_SIZE = { w: 720, h: 780 };

/** The narrowest a page pane may get before core's workspace stops laying out. */
const PAGE_MIN_SIZE = { w: 560, h: 480 };

/**
 * The alias of a window's page under a key. Per window and key, because the attached rule is one of
 * each alias per owner, and an app means one page per key.
 * @param windowId The owner window.
 * @param key The app's key.
 * @returns The alias.
 */
export function attachedPageAlias(windowId: string, key: string): string {
  return `${ALIAS_PREFIX}${windowId}:${key}`;
}

/**
 * Read an app's request. A key is required, and either a path or an app alias, never both. A path
 * must land on a backoffice section, read the way launcher search reads a result's link: an address
 * off the site, or one that climbs out of the sections, is refused rather than put in a frame. An app
 * alias is only read here; whether the person may launch it is the window's to look up.
 * @param detail The event's detail, as the app sent it.
 * @returns The request, or undefined when it is refused.
 */
export function readAttachedRequest(detail: unknown): UmbraDesktopAttachedRequest | undefined {
  if (!detail || typeof detail !== 'object') return undefined;
  const { key, path, app, name, icon, floating } = detail as Record<string, unknown>;
  if (typeof key !== 'string' || !key) return undefined;
  if (app !== undefined) {
    if (typeof app !== 'string' || !app || path !== undefined) return undefined;
    return { key, app, name: typeof name === 'string' ? name : '', icon: typeof icon === 'string' ? icon : '', floating: floating === true };
  }
  if (typeof path !== 'string') return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return undefined;
  const url = sectionUrlFromHref(path);
  if (!url) return undefined;
  return {
    key,
    path: url,
    name: typeof name === 'string' ? name : '',
    icon: typeof icon === 'string' && icon ? icon : 'icon-document',
    floating: floating === true,
  };
}

/**
 * The attached content for a request: the page's editor alone (`workspace-only`), sized for core's
 * media workspace.
 * @param windowId The owner window.
 * @param request The request.
 * @returns The app.
 */
export function createAttachedPageApp(windowId: string, request: UmbraDesktopAttachedPageRequest): UmbraDesktopApp {
  return {
    alias: attachedPageAlias(windowId, request.key),
    name: request.name,
    icon: request.icon,
    content: { kind: 'iframe', url: request.path },
    chromeProfile: 'workspace-only',
    defaultSize: PAGE_SIZE,
    minSize: PAGE_MIN_SIZE,
  };
}

/**
 * The attached content for an app request: the app's own element under the window's alias for the
 * key, sized as its manifest asks, and told its owner and its alias (`ownerId`, `appAlias`) as
 * properties, as a feature's attached element is. Only an element app: a backoffice page is asked for
 * by its path, which is checked.
 * @param windowId The owner window.
 * @param request The request.
 * @param source The app the alias names, as the person may launch it.
 * @returns The content, or undefined for an app that is not an element.
 */
export function createAttachedAppApp(
  windowId: string,
  request: UmbraDesktopAttachedAppRequest,
  source: UmbraDesktopApp,
): UmbraDesktopApp | undefined {
  if (source.content.kind !== 'element') return undefined;
  return {
    alias: attachedPageAlias(windowId, request.key),
    name: request.name || source.name,
    icon: request.icon || source.icon,
    content: { kind: 'element', element: source.content.element, props: { ownerId: windowId, appAlias: source.alias } },
    chromeProfile: 'bare',
    ...(source.defaultSize ? { defaultSize: source.defaultSize } : {}),
    ...(source.minSize ? { minSize: source.minSize } : {}),
  };
}

/**
 * The key of a page of this window, from its alias.
 * @param alias Attached content's alias.
 * @param windowId The owner window.
 * @returns The key, or undefined when the content is not one of this window's pages.
 */
export function attachedPageKey(alias: string, windowId: string): string | undefined {
  const prefix = `${ALIAS_PREFIX}${windowId}:`;
  return alias.startsWith(prefix) ? alias.slice(prefix.length) : undefined;
}

/**
 * What the app is told is open beside its window: each key's current page. From the frame's report
 * once it has one, and the page's own url before that. An app of its own is reported by its alias.
 * @param windows The open windows.
 * @param ownerId The app's window.
 * @returns Each open key's path.
 */
export function attachedPaths(windows: ReadonlyArray<UmbraDesktopWindow>, ownerId: string): Record<string, string> {
  const paths: Record<string, string> = {};
  const add = (app: UmbraDesktopApp, location: string | undefined) => {
    const key = attachedPageKey(app.alias, ownerId);
    if (key === undefined) return;
    if (app.content.kind === 'iframe') paths[key] = location ?? app.content.url;
    else if (typeof app.content.props?.appAlias === 'string') paths[key] = app.content.props.appAlias;
  };
  for (const w of windows) {
    if (w.id === ownerId) for (const pane of w.panes ?? []) add(pane.app, pane.location);
    else if (w.owner === ownerId) add(w.app, w.location);
  }
  return paths;
}
