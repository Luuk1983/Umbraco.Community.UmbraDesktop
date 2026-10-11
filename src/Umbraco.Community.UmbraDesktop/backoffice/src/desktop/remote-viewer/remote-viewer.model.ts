/**
 * The decisions the remote content viewer makes before it opens a frame, kept apart from the element
 * so they can be tested without a backoffice.
 */

/** Where the connection proxy lives, below an origin. Under `umbradesktop/`, which the frame keeps local. */
const PROXY_PATH = '/umbraco/management/api/v1/umbradesktop/connection-proxy/';

/**
 * The proxy address for one connection, which the frame's data calls are redirected to.
 * @param origin This instance's origin.
 * @param connectionId The connection's id.
 * @returns The absolute proxy address, with no trailing slash.
 */
export function proxyBaseFor(origin: string, connectionId: string): string {
  return `${origin}${PROXY_PATH}${connectionId}`;
}

/**
 * The origin of a connection's address, which is where its public media is served from.
 * @param baseUrl The address as stored on the connection.
 * @returns The origin, or undefined when the address does not parse.
 */
export function remoteOriginOf(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl.trim()).origin;
  } catch {
    return undefined;
  }
}

/**
 * Which connection to open.
 * @param ids The ids of the connections there are, in the order they are listed.
 * @param remembered The id chosen last time, if any.
 * @returns The remembered one if it still exists, otherwise the first, otherwise nothing.
 */
export function chooseConnection(ids: ReadonlyArray<string>, remembered: string | undefined): string | undefined {
  return remembered && ids.includes(remembered) ? remembered : ids[0];
}

/** How two Umbraco versions compare, for the question "will the editors here read that site's data". */
export type VersionComparison = 'same' | 'different' | 'unknown';

/**
 * Compare two Umbraco versions by major and minor.
 *
 * Patch and pre-release are ignored. What matters is whether property editors and the management API
 * models can differ, and in Umbraco they change between minors, not between patches. There is no
 * version handshake anywhere in the API (its path is `v1` in every release), so this is the only
 * warning anyone gets.
 * @param local This instance's version.
 * @param remote The connection's version.
 * @returns Whether they are the same, different, or not known.
 */
export function compareVersions(local: string | null | undefined, remote: string | null | undefined): VersionComparison {
  const a = majorMinor(local);
  const b = majorMinor(remote);
  if (!a || !b) return 'unknown';
  return a === b ? 'same' : 'different';
}

/**
 * The major and minor of a version string.
 * @param version A version such as `17.2.0` or `17.2.0-rc.1`.
 * @returns `17.2`, or undefined when it is not a version.
 */
function majorMinor(version: string | null | undefined): string | undefined {
  const match = /^(\d+)\.(\d+)/.exec(version ?? '');
  return match ? `${match[1]}.${match[2]}` : undefined;
}
