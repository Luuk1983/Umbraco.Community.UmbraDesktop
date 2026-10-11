/**
 * The link rule for a view beside the editor (design §5): a link in it navigates the owner window,
 * exactly as it would from the view's tab.
 *
 * Needed because every backoffice page routes the anchor clicks that reach its own `window`
 * (`router-slot/util/anchor.js`), and a view beside the editor is on the desktop page, so left alone
 * the desktop's router would take Info's document type link and navigate the whole desktop away.
 */

/** What to do with a click in the pane. */
export type UmbraDesktopBesideLinkAction =
  /** Route the owner's frame there, as its router would route the same click in the tab. */
  | { action: 'route'; path: string }
  /** Load it in the owner's frame: a link the backoffice keeps away from its router. */
  | { action: 'load'; path: string }
  /** Leave it to the browser, as the tab would have. */
  | { action: 'pass' };

/**
 * Decide what a click in the pane does, while the click is in flight.
 *
 * - A backoffice path on this origin routes the owner. The owner's own router then runs it, so its
 *   unsaved-changes prompt still applies, and a modal route on the document opens as a dialog there.
 * - Left to the browser, as in the tab: a modifier key or another button, a `target` other than the
 *   frame itself (Info's public URLs open `_blank`), a download, another origin, a path outside the
 *   backoffice, and a click the view already handled.
 * - A link marked `data-router-slot="disabled"`, which the backoffice never routes, is loaded in the
 *   owner instead, as the tab would have loaded it in the frame.
 *
 * The anchor is found by tag name on the composed path. Core's handler uses `instanceof
 * HTMLAnchorElement`, which is per page, and a view beside the editor holds anchors made by either.
 * @param event The click, read while it is being dispatched.
 * @param backofficeBase The backoffice's base URL, `document.baseURI`, which also resolves a relative
 * href the way the backoffice resolves it.
 * @returns What to do, or undefined when the click is not on a link.
 */
export function besideLinkAction(event: MouseEvent, backofficeBase: string): UmbraDesktopBesideLinkAction | undefined {
  const anchor = event
    .composedPath()
    .find((node): node is Element => (node as Element).tagName?.toUpperCase() === 'A' && (node as Element).hasAttribute('href'));
  if (!anchor) return undefined;
  if (event.defaultPrevented) return { action: 'pass' };
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return { action: 'pass' };
  const target = anchor.getAttribute('target') ?? '';
  if ((target !== '' && target !== '_self') || anchor.hasAttribute('download')) return { action: 'pass' };
  let url: URL;
  let base: URL;
  try {
    base = new URL(backofficeBase);
    url = new URL(anchor.getAttribute('href') ?? '', base);
  } catch {
    return { action: 'pass' };
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return { action: 'pass' };
  const path = `${url.pathname}${url.search}${url.hash}`;
  return (anchor as HTMLElement).dataset?.routerSlot === 'disabled' ? { action: 'load', path } : { action: 'route', path };
}
