/** Default backoffice path, used when the document carries no usable base. */
const DEFAULT_BACKOFFICE_PATH = '/umbraco';

/**
 * The backoffice's base path, taken from a document base URI.
 *
 * The backoffice's own view renders `<base href="/umbraco/" />` and that path is configurable, so
 * it is read rather than assumed. This exists for one caller: the bundle module, which runs before
 * any Umbraco context exists to ask. Everything later asks `UMB_SERVER_CONTEXT.getBackofficePath()`
 * and keeps this only as its fallback.
 *
 * A base that resolves to the site root cannot be the backoffice's own base, so it takes the
 * default too — that is a document served without the backoffice's base element, not a backoffice
 * mounted at `/`.
 * @param baseUri `document.baseURI`, or undefined.
 * @returns The base path with no trailing slash.
 */
export function backofficePathFromBaseHref(baseUri: string | undefined): string {
  if (!baseUri) return DEFAULT_BACKOFFICE_PATH;

  let pathname: string;
  try {
    pathname = new URL(baseUri, window.location.origin).pathname;
  } catch {
    return DEFAULT_BACKOFFICE_PATH;
  }

  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return trimmed === '' || trimmed === '/' ? DEFAULT_BACKOFFICE_PATH : trimmed;
}
