import { backofficePathFromBaseHref } from '../boot/backoffice-path';
import { bootLanding } from '../boot/landing';
import { UMBRADESKTOP_SECTION_PATHNAME } from '../constants';

/** The query parameter a deep link into Help uses: `/umbraco/section/umbradesktop?help=<target>`. */
export const UMBRADESKTOP_HELP_PARAM = 'help';

/**
 * The deep link to a Help target, as a path on this site. Absolute, because a relative `?help=`
 * resolves against the backoffice's `<base href>`, which is the backoffice root and not the desktop.
 * @param target A target string.
 * @returns The path, such as `/umbraco/section/umbradesktop?help=umbradesktop/snapping`.
 */
export function helpDeepLinkHref(target: string): string {
  return `${backofficePathFromBaseHref(document.baseURI)}/section/${UMBRADESKTOP_SECTION_PATHNAME}?${UMBRADESKTOP_HELP_PARAM}=${target}`;
}

/**
 * The Help target a query string asks for.
 * @param search A query string, with or without its `?`.
 * @returns The target, not yet validated, or undefined when there is none.
 */
export function helpDeepLinkTarget(search: string): string | undefined {
  return new URLSearchParams(search).get(UMBRADESKTOP_HELP_PARAM) || undefined;
}

/**
 * An address with the help parameter taken out, so a reload does not open Help again.
 * @param href The address.
 * @returns The address without it, or undefined when it had none.
 */
export function withoutHelpParam(href: string): string | undefined {
  const url = new URL(href);
  if (!url.searchParams.has(UMBRADESKTOP_HELP_PARAM)) return undefined;
  url.searchParams.delete(UMBRADESKTOP_HELP_PARAM);
  return url.toString();
}

/** Whether this page load's deep link has been taken, so a desktop built again after Exit does not repeat it. */
let taken = false;

/**
 * The deep link this page load arrived with, once. Read from the landing record rather than from
 * `location`, because Umbraco's router rewrites the address within moments of the load, and the
 * landing record is the address as it was typed or clicked. Taking it also removes the parameter
 * from the current address, where it is still there.
 * @returns The target, not yet validated, or undefined when there is none or it was already taken.
 */
export function takeHelpDeepLink(): string | undefined {
  if (taken) return undefined;
  taken = true;
  const target = helpDeepLinkTarget(bootLanding().search);
  const cleaned = withoutHelpParam(window.location.href);
  if (cleaned) window.history.replaceState(window.history.state, '', cleaned);
  return target;
}
