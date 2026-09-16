/**
 * Putting `<link rel="manifest">` into the backoffice head.
 *
 * Umbraco 17 generates the backoffice HTML in C# and ships no `index.html` to extend, so the link
 * has to be appended at runtime. That this works at all was not assumed: it was measured, because
 * the widely repeated advice says it does not. Chrome 153, Edge 153 and Firefox 155 all honour a
 * link appended five seconds after load — see `docs/design/spikes/2026-09-13-manifest-injection/`,
 * which keeps the fixture so a future browser can be re-tested rather than re-argued.
 *
 * It is behaviour rather than specification, though, and nothing in the manifest spec promises
 * re-evaluation on link mutation. If a browser ever regresses, the fallback is response-rewriting
 * middleware over the backoffice HTML, and the spike's `c.html` is the variant to reach for.
 */

/** Id stamped on our link, so a second call can recognise its own work. */
export const UMBRADESKTOP_MANIFEST_LINK_ID = 'umbradesktop-manifest';

/**
 * Where the flattened 180px Safari icon is served.
 *
 * Exported so the test asserts against this constant rather than retyping the path, which is the
 * only way a typo here fails a test instead of silently costing iOS its icon.
 */
export const APPLE_TOUCH_ICON_HREF =
  '/App_Plugins/Umbraco.Community.UmbraDesktop/appicons/apple-touch-icon.png';

/**
 * Where the manifest is served.
 *
 * A site-root path rather than one derived from the backoffice path, because the endpoint is routed
 * at the site root — everything under `/umbraco` belongs to Umbraco's own routing, and planting a
 * route in it invites a collision with a future core release. Nothing is lost: a manifest's own URL
 * does not have to fall within the `scope` it declares. The paths *inside* the manifest are still
 * derived from the configured backoffice path, server-side, by `WebAppManifestBuilder`.
 * @returns The manifest URL.
 */
export function manifestHref(): string {
  return '/umbradesktop/manifest.webmanifest';
}

/**
 * Declare this document installable: a manifest link, and the icon Safari reads instead.
 *
 * **A manifest link the host already declared is never replaced.** A site that has somehow put its
 * own manifest on this document made a deliberate choice, and silently overriding it would take an
 * installed app away from someone in order to give them ours. Ours is the one that yields.
 *
 * The two links are decided independently, which is the point of the second guard rather than one
 * early return: a host manifest is a reason to leave the manifest link alone and no reason at all
 * to leave Safari without an icon, since Safari does not read manifest icons in the first place.
 * @param head The head to add to. Injectable so the tests need no real document.
 */
export function upsertManifestLink(head: HTMLHeadElement = document.head): void {
  if (!head.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.id = UMBRADESKTOP_MANIFEST_LINK_ID;
    link.rel = 'manifest';
    link.href = manifestHref();
    head.appendChild(link);
  }

  // iOS does not composite transparency and renders it black, which is why this points at a
  // separately flattened render rather than reusing `icon-192.png`.
  if (!head.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'apple-touch-icon';
    icon.href = APPLE_TOUCH_ICON_HREF;
    head.appendChild(icon);
  }
}

/**
 * Make the browser read the manifest again, after the site's name or icon has changed.
 *
 * Browsers read the manifest when a page loads and then leave it alone, so changing the setting on
 * a desktop that is already open changed nothing visible until the next refresh. Replacing the link
 * element is what prompts a re-read — the same behaviour the injection spike measured, used here on
 * purpose rather than relied on by accident.
 *
 * **Replaced, not mutated.** Setting `href` to the same value is a no-op the browser can reasonably
 * ignore; removing the element and appending a new one is an unambiguous change. The server sends
 * `Cache-Control: no-cache` on the manifest so the re-read actually reaches it rather than a cached
 * copy.
 *
 * **A host-declared manifest is left alone**, exactly as in {@link upsertManifestLink}. Refreshing
 * must not become a way to take an installed app away from someone who declared their own.
 *
 * What this cannot do is rename an app somebody has *already installed*. The browser owns that
 * metadata and updates it on its own schedule; all this guarantees is that the browser is looking
 * at current information.
 * @param head The head to refresh. Injectable so the tests need no real document.
 */
export function refreshManifestLink(head: HTMLHeadElement = document.head): void {
  const existing = head.querySelector('link[rel="manifest"]');

  if (existing && existing.id !== UMBRADESKTOP_MANIFEST_LINK_ID) return;

  existing?.remove();
  upsertManifestLink(head);
}
