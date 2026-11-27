/**
 * Whether the package's generated API client has been wired into Umbraco's auth context yet.
 *
 * The entry point configures the client (base URL, cookies, bearer token) once the auth context
 * arrives, but nothing makes the backoffice wait for that before it renders: on a full page load
 * straight onto the desktop, the desktop can be built first. Its earliest calls then went out on
 * the client's generated default, `https://localhost:23822`, and failed with a refused connection.
 * Measured on Umbraco 19.0.0-rc1, on one of two loads; see the 19 rc1 design doc. Nothing showed
 * only because the router built the desktop again a moment later.
 *
 * Callers that run at boot await {@link whenClientReady} before calling the server. Calls made later,
 * from a click, never need to: by then the client has long been configured.
 */

/** Lets the waiting callers go. Assigned by the promise's executor, which runs at once. */
let release!: () => void;

/** Settles once, the first time the entry point reports the client configured. */
const ready = new Promise<void>((resolve) => {
  release = resolve;
});

/**
 * Wait until the API client is configured.
 *
 * It never rejects and has no deadline. A client that is never configured means there is no auth
 * context, and then no request of the package's could have succeeded anyway.
 * @returns A promise that resolves once the client is configured, at once when it already is.
 */
export function whenClientReady(): Promise<void> {
  return ready;
}

/**
 * Report the API client configured. Called by the entry point straight after `configureClient`.
 * Safe to call again, which every window's frame does as it runs the same entry point.
 */
export function markClientReady(): void {
  release();
}
