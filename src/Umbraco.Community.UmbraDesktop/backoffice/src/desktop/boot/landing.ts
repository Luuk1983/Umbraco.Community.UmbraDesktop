/**
 * Where this page load landed, captured once.
 *
 * The boot turns on one question — did this load arrive at the backoffice root? — and the answer
 * has a short shelf life. Core's router redirects the root to the first allowed section a few
 * hundred milliseconds in, so `location` stops being able to answer it almost immediately.
 *
 * Captured at module scope, which is what makes this reliable rather than merely earlier: the first
 * thing that imports this is `bundle.manifests`, evaluated while the backoffice route guard is still
 * running, and every later reader gets that same recorded value. Two attempts to solve this by
 * reading `location` "early enough" both failed, and the trace showed why. The first read it after
 * awaiting the current user, long after the redirect. The second read it as the first statement of
 * the entrypoint's `onInit` — which sounds early, and is not: `onInit` arrives via a dynamic import
 * of its own chunk, and on a throttled connection that fetch alone outlives the redirect. There is
 * no "early enough" for a live read; there is only a recorded one.
 */

/** The location this page load arrived at, read once when this module is first evaluated. */
const LANDING = Object.freeze({
  pathname: window.location.pathname,
  search: window.location.search,
});

/** Where a page load arrived, as opposed to wherever the router has since gone. */
export interface UmbraDesktopLanding {
  /** `location.pathname` as it was when the package's first module was evaluated. */
  readonly pathname: string;
  /** `location.search` as it was at that same moment, including the leading `?`. */
  readonly search: string;
}

/**
 * The location this page load landed on.
 *
 * Never re-reads `location`, and that is the point: callers run at wildly different times — the
 * bundle module, an entrypoint behind a dynamic import, an element that mounts later still — and
 * they must all agree about where the load began.
 * @returns The recorded landing location.
 */
export function bootLanding(): UmbraDesktopLanding {
  return LANDING;
}
