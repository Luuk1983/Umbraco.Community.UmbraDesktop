import { routeRequest } from './route-request';

/** The two fields of a `PerformanceResourceTiming` this needs, so a test can pass plain objects. */
export interface ResourceEntryLike {
  /** The URL the request was made to. */
  name: string;
  /** When the request started, in milliseconds on the frame's own clock. */
  startTime: number;
}

/** A resource timing entry's URL and the HTTP status the browser recorded for it. */
export interface StatusEntryLike {
  /** The URL the request was made to. */
  name: string;
  /** The response status, or 0 when the browser did not record one. */
  responseStatus: number;
}

/**
 * Which calls through the proxy were refused or broke, which means the frame is not showing the
 * remote whatever it looks like.
 *
 * Needed because settling is judged on quiet alone, and a frame whose calls all failed goes quiet as
 * readily as one whose calls all worked. That is how it was found: the first real run reported the
 * frame ready over a backoffice that had stopped booting, because its first two calls were refused.
 * 401, 403 and 5xx count. 404 does not: the backoffice asks for things that may not exist and handles
 * the answer itself.
 * @param entries The frame's resource timing entries.
 * @param proxyBase The proxy's absolute address for this connection.
 * @returns `status path` for each failed call, empty when none failed.
 */
export function findFailedProxyCalls(entries: ReadonlyArray<StatusEntryLike>, proxyBase: string): string[] {
  return entries
    .filter((entry) => entry.name.startsWith(proxyBase))
    .filter((entry) => entry.responseStatus === 401 || entry.responseStatus === 403 || entry.responseStatus >= 500)
    .map((entry) => `${entry.responseStatus} ${entry.name.slice(proxyBase.length)}`);
}

/**
 * Which requests reached the local instance that should have gone to the remote, because they were
 * made before the shim was installed.
 *
 * The shim is installed on the frame's window as soon as the frame's document exists, but that is
 * a race against the backoffice's own first scripts, and it cannot be made a certainty from outside
 * the frame. A lost race would not fail loudly: the tree would simply fill with the local instance's
 * content, looking exactly like the remote's. So the loader asks the browser's own resource timing
 * afterwards, which records every request the frame made, and this picks out the ones that the
 * routing table says were remote data but that went out untouched, or that it would have refused,
 * such as a connection to this instance's event hub.
 * @param entries The frame's resource timing entries.
 * @param installedAt When the shim was installed, on the same clock as the entries.
 * @param origin The frame's origin, which is the local instance.
 * @returns The URLs of the requests that escaped, empty when none did.
 */
export function findEscapedRequests(entries: ReadonlyArray<ResourceEntryLike>, installedAt: number, origin: string): string[] {
  const escaped: string[] = [];
  for (const entry of entries) {
    if (entry.startTime >= installedAt) continue;
    let url: URL;
    try {
      url = new URL(entry.name);
    } catch {
      continue;
    }
    // Remote-bound data that went out untouched, or a call the shim would have refused outright
    // (this instance's event hub), made before it was there to refuse it.
    const target = routeRequest('GET', url, origin).target;
    if (target === 'remote' || target === 'blocked') escaped.push(entry.name);
  }
  return escaped;
}
