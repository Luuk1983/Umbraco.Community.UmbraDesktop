import { UMBRADESKTOP_SECTION_PATHNAME } from '../constants';
import { UMBRADESKTOP_BOOT_PARAM, UMBRADESKTOP_BOOT_PARAM_OFF } from './constants';

/**
 * Whether to boot into the desktop, and whether to cover the screen while it happens, as pure
 * functions over what the caller has read.
 *
 * Pure on purpose: the two callers run at very different moments — one during the bundle module's
 * own evaluation, one after the current user has resolved — and neither is a place where a mistake
 * is easy to see. Keeping the rules here means every branch is a test rather than something you
 * have to reproduce in a browser.
 */

/** Everything the boot decision depends on, gathered by the caller so this stays pure. */
export interface UmbraDesktopBootInputs {
  /** `location.pathname`. */
  pathname: string;
  /** The backoffice's base path, e.g. `/umbraco`. Configurable, so never assumed. */
  backofficePath: string;
  /** `location.search`, including the leading `?`. */
  search: string;
  /** The current user's stored preference. */
  preference: boolean;
  /** Whether the user has exited the desktop in this tab. */
  exited: boolean;
  /** Whether a previous boot attempt never reported a mounted desktop. */
  markerPresent: boolean;
  /** Whether the current user is granted the desktop section. */
  hasSectionAccess: boolean;
}

/**
 * What the splash decision depends on. Deliberately smaller than {@link UmbraDesktopBootInputs}:
 * it runs before anything can say who is logged in, so there is no preference and no access to
 * consult, only this browser's mirrored hint.
 */
export interface UmbraDesktopSplashInputs {
  /** `location.pathname`. */
  pathname: string;
  /** The backoffice's base path. */
  backofficePath: string;
  /** `location.search`, including the leading `?`. */
  search: string;
  /** This browser's mirrored preference. */
  hint: boolean;
  /** Whether the user has exited the desktop in this tab. */
  exited: boolean;
  /** Whether a previous boot attempt never reported a mounted desktop. */
  markerPresent: boolean;
}

/**
 * Strip a trailing slash, so `/umbraco` and `/umbraco/` are one path.
 * @param pathname The path to normalise.
 * @returns The path without its trailing slash, never empty.
 */
function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/**
 * Whether a path is the backoffice root, which is the only path a boot may redirect away from.
 *
 * Anything deeper is somebody's link — a bookmark, a notification, a shared workspace URL — and a
 * setting that swallowed those would break every link anyone has saved. Compared whole rather than
 * by prefix, so `/umbraco-admin` is not the root of `/umbraco`.
 * @param pathname `location.pathname`.
 * @param backofficePath The backoffice base path.
 * @returns True when this is the root.
 */
export function isBackofficeRoot(pathname: string, backofficePath: string): boolean {
  return withoutTrailingSlash(pathname) === withoutTrailingSlash(backofficePath);
}

/**
 * The desktop section's path under a given backoffice base.
 * @param backofficePath The backoffice base path.
 * @returns The absolute path of the desktop section.
 */
export function desktopSectionPath(backofficePath: string): string {
  return `${withoutTrailingSlash(backofficePath)}/section/${UMBRADESKTOP_SECTION_PATHNAME}`;
}

/**
 * Whether a path is inside the desktop section, including any route below it.
 *
 * The `/` in the prefix check is what stops a hypothetical sibling section whose pathname merely
 * starts the same from being mistaken for this one.
 * @param pathname `location.pathname`.
 * @param backofficePath The backoffice base path.
 * @returns True when the path is the desktop section or below it.
 */
export function isDesktopSectionPath(pathname: string, backofficePath: string): boolean {
  const section = desktopSectionPath(backofficePath);
  const path = withoutTrailingSlash(pathname);
  return path === section || path.startsWith(`${section}/`);
}

/**
 * Where leaving the desktop goes: the Content section, under whatever backoffice path is in force.
 *
 * Only the section segment and everything below it is replaced, so a configured backoffice path
 * survives without having to be passed in. A path with no section segment is returned unchanged
 * rather than having one invented for it — that is not a route Exit is ever reached from, and
 * guessing would be worse than doing nothing.
 *
 * Here rather than inline in the taskbar so the substitution is testable: it is the one piece of
 * the exit flow that can be, since the rest of it is a confirmation modal.
 * @param pathname The current `location.pathname`, inside the desktop section.
 * @returns The path to navigate to.
 */
export function exitDesktopPath(pathname: string): string {
  return pathname.replace(/\/section\/.*$/, '/section/content');
}

/**
 * Whether the URL asks for the boot to be skipped: `?desktop=off`.
 *
 * A URL flag rather than another stored setting, on purpose. It survives a refresh, it works when
 * localStorage is unreadable, and it is short enough to read down a phone line — which matters
 * because the desktop hides the backoffice header as it mounts, so somebody whose desktop breaks
 * needs a way back that does not depend on the desktop.
 * @param search `location.search`.
 * @returns True when the flag is present and off.
 */
export function isBootDisabledByUrl(search: string): boolean {
  return new URLSearchParams(search).get(UMBRADESKTOP_BOOT_PARAM) === UMBRADESKTOP_BOOT_PARAM_OFF;
}

/**
 * Whether to navigate to the desktop for this load.
 * @param inputs Everything the decision depends on.
 * @returns True when the desktop should open.
 */
export function shouldBootIntoDesktop(inputs: UmbraDesktopBootInputs): boolean {
  if (!inputs.preference) return false;
  if (!inputs.hasSectionAccess) return false;
  if (!isBackofficeRoot(inputs.pathname, inputs.backofficePath)) return false;
  if (isBootDisabledByUrl(inputs.search)) return false;
  if (inputs.exited) return false;
  if (inputs.markerPresent) return false;
  return true;
}

/**
 * Whether to cover the page while the desktop gets ready.
 *
 * Two cases, and the second is not a boot at all. A fresh load of a desktop URL flashes the classic
 * header, and then a desktop wearing the default theme and wallpaper, because nothing about the
 * stored settings is known until the current-user call returns. So the splash covers any fresh load
 * that lands in the desktop, whether it was redirected there or typed — and in the typed case it
 * covers regardless of the hint, the suppression or the URL flag, none of which are about a
 * deliberate visit to a desktop URL.
 *
 * In-app navigation deliberately gets nothing: by then the user is loaded and reading the stored
 * settings is synchronous, so there is no gap worth covering and a splash would only be noise.
 * @param inputs What is known before the user is.
 * @returns True when the splash should be raised.
 */
export function shouldRaiseSplash(inputs: UmbraDesktopSplashInputs): boolean {
  if (isDesktopSectionPath(inputs.pathname, inputs.backofficePath)) return true;
  if (!inputs.hint) return false;
  if (!isBackofficeRoot(inputs.pathname, inputs.backofficePath)) return false;
  if (isBootDisabledByUrl(inputs.search)) return false;
  if (inputs.exited) return false;
  if (inputs.markerPresent) return false;
  return true;
}
