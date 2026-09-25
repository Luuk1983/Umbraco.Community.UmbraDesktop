/**
 * Calling the management API through the backoffice's own HTTP client, the way every app in this
 * package that talks to a server does: Sticky Notes to its own controller, Disk Cleanup to Umbraco's
 * recycle bins. The backoffice has already wired `umbHttpClient` to its authentication, so a call
 * carries the logged-in user without this package configuring anything.
 */

/** Tells `umbHttpClient` to send the backoffice's bearer token, as its own documentation asks. */
export const SECURITY = [{ type: 'http', scheme: 'bearer' }] as const;

/**
 * The status an error carries, whichever shape it arrived in.
 * @param error What the call threw or returned as its error.
 * @returns The HTTP status, if there is one.
 */
export function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Run one call, turning a thrown error into a returned one.
 *
 * **The backoffice's HTTP client throws on every error status in a running backoffice**, whatever its
 * types say about an `{ error }` result: its response interceptors turn the response into a problem
 * details object and the call rejects with it. Found by running Sticky Notes against a real Umbraco,
 * where a 409 threw and the conflict dialog never appeared. So every call goes through here, and its
 * callers read one shape.
 * @param call The request.
 * @returns The data, or the error.
 */
export async function attempt<T>(call: () => Promise<{ data?: unknown; error?: unknown }>): Promise<{ data?: T; error?: unknown }> {
  try {
    const { data, error } = await call();
    return error ? { error } : { data: data as T };
  } catch (error) {
    return { error: error ?? { status: undefined } };
  }
}

/**
 * Whether an error means the current user may not, rather than that something broke. Checks the
 * problem details too, which is where the status is when the error arrived wrapped.
 * @param error The call's error.
 * @returns True for 401 and 403.
 */
export function isDenied(error: unknown): boolean {
  const status = statusOf(error) ?? statusOf((error as { problemDetails?: unknown } | null)?.problemDetails);
  return status === 401 || status === 403;
}
