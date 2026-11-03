/**
 * JSON Merge Patch, RFC 7386: a patch is an object whose members replace the target's, nested
 * objects merge, and a null removes.
 *
 * The server merges with the same rules (`PackageSettings/JsonMergePatch.cs`) and its answer is the
 * one a site store settles on, so the page only applies a patch itself to show a change at once.
 */

/** A patch: what a site store's `patch` takes. */
export type UmbraDesktopMergePatch = { readonly [member: string]: unknown };

/**
 * Whether a value is a JSON object, which is the one thing a merge looks inside.
 * @param value Anything parsed from JSON.
 * @returns True for a plain object, not an array or null.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge a patch into a target, as RFC 7386 §2 describes.
 * @param target The value now, or undefined for nothing. Not changed.
 * @param patch The patch. Not changed, and nothing of it is shared with the result.
 * @returns The merged value, a new one.
 */
export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (!isObject(patch)) return structuredClone(patch);
  // A target that is not an object is replaced by an empty one, as the RFC asks.
  const result: Record<string, unknown> = isObject(target) ? structuredClone(target) : {};
  for (const [name, value] of Object.entries(patch)) {
    if (value === null) delete result[name];
    else result[name] = applyMergePatch(result[name], value);
  }
  return result;
}

/**
 * One patch that does what two do one after the other, so changes made while a request is out go
 * as one.
 *
 * Not every pair has one. When the first sets a member to something other than an object, removal
 * included, and the second merges an object into it, a single patch would merge into what the member
 * was before the first, keeping members the first had removed. The caller then sends the value whole.
 * @param first The earlier patch.
 * @param second The later patch.
 * @returns The composed patch, or undefined when none exists.
 */
export function composeMergePatches(
  first: UmbraDesktopMergePatch,
  second: UmbraDesktopMergePatch,
): UmbraDesktopMergePatch | undefined {
  const result: Record<string, unknown> = structuredClone(first) as Record<string, unknown>;
  for (const [name, value] of Object.entries(second)) {
    if (!isObject(value) || !(name in result)) {
      result[name] = structuredClone(value);
      continue;
    }
    const earlier = result[name];
    if (!isObject(earlier)) return undefined;
    const composed = composeMergePatches(earlier, value);
    if (!composed) return undefined;
    result[name] = composed;
  }
  return result;
}
