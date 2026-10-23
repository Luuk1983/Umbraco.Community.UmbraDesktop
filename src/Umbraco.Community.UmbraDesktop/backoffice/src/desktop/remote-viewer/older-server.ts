/**
 * What a frame needs added to an answer from an older Umbraco before its own backoffice can read it.
 *
 * The frame is this instance's backoffice, so when the remote runs an older major, the frame's code
 * is newer than the server answering it, and a field the newer code reads unconditionally is simply
 * not there. Each entry here was found by opening a real older instance (upgrade plan, B5), not by
 * reading a changelog, and fills only what is missing with the value that means "none". So the same
 * table is safe whatever the two versions are: an answer that already has a field keeps its own.
 *
 * A newer remote under an older frame needs nothing from this: the older code ignores what it does not
 * know. What is left across majors is a package whose own API changed between them, which this cannot
 * know about, and which the viewer reports as the call that was refused.
 */

/** One answer an older server gives without fields a newer backoffice reads. */
interface OlderServerDefaults {
  /** The management API path, below the version segment, with no query string. */
  path: RegExp;
  /** The missing fields, each with the value that means "none". */
  defaults: Readonly<Record<string, unknown>>;
}

/**
 * Every answer that needs filling in.
 *
 * - **The current user, from Umbraco 17 under an 18 frame.** 18 added Elements, and its
 *   `getCurrentUser` maps `elementStartNodeIds` without a guard, so the frame never booted. A 17 site
 *   has no Elements, so it has no start nodes there and no root to have access to.
 */
const OLDER_SERVER_DEFAULTS: ReadonlyArray<OlderServerDefaults> = [
  {
    path: /^\/umbraco\/management\/api\/v\d+\/user\/current$/,
    defaults: { elementStartNodeIds: [], hasElementRootAccess: false },
  },
];

/**
 * The fields to fill in on the answer to one remote path, if it is one that needs any.
 * @param path The path and query on the remote, as the routing table gives it.
 * @returns The defaults, or undefined for every other path.
 */
export function olderServerDefaultsFor(path: string): Readonly<Record<string, unknown>> | undefined {
  const bare = path.split('?')[0];
  return OLDER_SERVER_DEFAULTS.find((entry) => entry.path.test(bare))?.defaults;
}

/**
 * An answer with the missing fields filled in, leaving every field it has alone.
 * @param json The answer as parsed.
 * @param defaults The fields to fill in.
 * @returns A new object with the defaults under the answer's own fields, or the answer unchanged when
 *   it is not a plain object.
 */
export function withOlderServerDefaults(json: unknown, defaults: Readonly<Record<string, unknown>>): unknown {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return json;
  return { ...defaults, ...(json as Record<string, unknown>) };
}
