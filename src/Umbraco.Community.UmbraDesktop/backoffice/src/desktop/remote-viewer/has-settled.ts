/** The two fields of a `PerformanceResourceTiming` this needs, so a test can pass plain objects. */
export interface SettleEntryLike {
  /** The URL the request was made to. */
  name: string;
  /** When the request finished, in milliseconds on the frame's own clock. */
  responseEnd: number;
}

/**
 * Whether a frame that is booting a backoffice has finished, judged from what it has requested.
 *
 * There is no event for "the backoffice is done": it boots in stages, each of which starts more
 * requests, and the last of them is not something a page outside the frame can observe. What it can
 * see is the frame's resource timing, and a boot looks like bursts of requests with quiet between
 * them. Quiet alone is fooled twice: once between the backoffice's own files and its first data call,
 * and again between its boot calls and the tree, which it asks for only after rendering the section.
 * The second lifted the cover on an empty tree in the real app. So the frame must also have had the
 * call its first screen depends on answered through the proxy, and only then be quiet for the period.
 * @param entries The frame's resource timing entries.
 * @param now The frame's clock now, in the same unit as the entries.
 * @param quietMs How long nothing may have finished before the frame counts as settled.
 * @param proxyBase The proxy's address, absolute.
 * @param requiredPath A path fragment the proxy must have answered, such as `/tree/document/root`.
 * @returns True when that call came back through the proxy and the frame has been quiet since.
 */
export function hasSettled(
  entries: ReadonlyArray<SettleEntryLike>,
  now: number,
  quietMs: number,
  proxyBase: string,
  requiredPath: string,
): boolean {
  const answered = entries.some((entry) => entry.name.startsWith(proxyBase) && entry.name.includes(requiredPath));
  if (answered === false) return false;
  const lastFinished = entries.reduce((latest, entry) => Math.max(latest, entry.responseEnd), 0);
  return now - lastFinished >= quietMs;
}
