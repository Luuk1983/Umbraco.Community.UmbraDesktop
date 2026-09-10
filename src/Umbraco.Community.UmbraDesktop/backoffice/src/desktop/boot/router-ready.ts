/**
 * Knowing when the backoffice's *section* router is live enough to be navigated.
 *
 * The boot navigates inside the document rather than replacing it, so the user gets one page load
 * and one splash. That only works if core's router is listening when we navigate, and there is a
 * window at the start of every load where it is not: `RouterSlot.add` navigates only if the slot is
 * already connected when its routes are assigned, and `umb-backoffice-main` assigns them to a slot
 * Lit has not connected yet. A `pushState` fired in that window *is* the `changestate` the slot is
 * waiting for, spent on nobody — the URL says desktop and the screen stays empty.
 *
 * Waiting for a rendered section closes it. By then the slot is connected and listening, and the
 * router's own delayed redirect from the root to the first allowed section has already happened,
 * so it cannot complete later and take the user to Content instead. Both halves of that race go
 * away for the price of letting Content mount, invisibly, behind the splash.
 *
 * The signal is core's own global router event: `GLOBAL_ROUTER_EVENTS_TARGET` is `window` and every
 * router slot dispatches `navigationend` there, so this needs nothing from a package subpath that
 * `@umbraco-cms/backoffice` does not export — `UMB_BACKOFFICE_CONTEXT`, the obvious thing to
 * observe, is not in its export map.
 *
 * Do not simplify this to "the first navigationend". The app-level slot dispatches one when it
 * renders the backoffice element itself, while the URL is still the root and no section router
 * exists yet, which is the exact moment this is here to tell apart.
 *
 * An earlier version of the boot replaced the document instead, to sidestep all of this. It works,
 * and it is visibly worse: two page loads means two splashes with a flash of the classic backoffice
 * between them. Do not go back to it without seeing that first.
 */

/** The global router event dispatched when a router slot finishes rendering a route. */
const NAVIGATION_END_EVENT = 'navigationend';

/**
 * Whether a path is one that only a rendered section route can produce.
 *
 * Used to tell the section router's `navigationend` apart from the app-level router's, which fires
 * at the backoffice root before any section exists.
 * @param pathname `location.pathname`.
 * @returns True when the path names a section.
 */
export function isSectionRoutePath(pathname: string): boolean {
  return pathname.includes('/section/');
}

/**
 * Wait until the backoffice has rendered a section route, so a navigation will be picked up.
 *
 * Waits for as long as it takes, with no timeout, and that is deliberate. How long a backoffice
 * needs to get this far is not ours to predict — it waits on the current-user request and on every
 * installed package's extensions — and every timeout considered here was a number picked from
 * whichever machine happened to be measured. If no section route ever renders, the backoffice is
 * broken in a way a boot cannot help with, and the splash lifts on its own so the user is left
 * looking at whatever the backoffice managed to show.
 * @param options Injection points for testing.
 * @param options.target Where the router dispatches its global events. Defaults to `window`.
 * @param options.getPath How to read the current path. Defaults to `location.pathname`.
 * @returns A promise that resolves once a section route has rendered.
 */
export function waitForSectionRoute(options?: { target?: EventTarget; getPath?: () => string }): Promise<void> {
  const target = options?.target ?? window;
  const getPath = options?.getPath ?? (() => window.location.pathname);

  // Already there: a desktop URL typed by hand, or a backoffice that beat us to it.
  if (isSectionRoutePath(getPath())) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const onNavigationEnd = () => {
      if (!isSectionRoutePath(getPath())) return;
      target.removeEventListener(NAVIGATION_END_EVENT, onNavigationEnd);
      resolve();
    };

    target.addEventListener(NAVIGATION_END_EVENT, onNavigationEnd);
  });
}
