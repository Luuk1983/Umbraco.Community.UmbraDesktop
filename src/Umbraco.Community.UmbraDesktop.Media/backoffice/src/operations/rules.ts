import type { UmbraDesktopMediaRef } from './media-api.js';

/**
 * Which items may go into a folder (design §4 and §11, plan task 4.2). Pure: the folder's allowed types
 * and its ancestry are read by the caller, and so is what the person may reach: their media start
 * folders and whether they may use the Media root, as Umbraco keeps them for the current user. A folder
 * out of reach is refused here, before anything is tried, so a drag or paste says why up front (a
 * restricted user's check, 2026-10-19: the server refused it, but only after the label had said "Move
 * to Media"). What the server refuses beyond this still comes back from it with its reason, per item,
 * and does not stop the rest.
 */

/** Why an item may not go. */
export type UmbraDesktopRefusal =
  /** The folder does not allow its media type. */
  | 'type'
  /** It is the folder, or a folder the target is inside. */
  | 'self'
  /** It is already in the folder: a move there would do nothing. */
  | 'there'
  /** The folder is out of the person's reach: outside their media start folders. */
  | 'access';

/** What a person may reach of the media library. */
export interface UmbraDesktopMediaAccess {
  /** Whether they may use the Media root itself, which a person without start folders may. */
  root: boolean;
  /** Their media start folders. */
  starts: ReadonlySet<string>;
}

/**
 * Whether a person may put things in a folder: the root with root access, a folder that is one of
 * their start folders or inside one.
 * @param access What they may reach.
 * @param target The folder.
 * @returns True when they may.
 */
export function canReach(access: UmbraDesktopMediaAccess, target: UmbraDesktopTarget): boolean {
  if (access.root) return true;
  if (target.unique === null) return false;
  return access.starts.has(target.unique) || target.ancestors.some((ancestor) => access.starts.has(ancestor));
}

/**
 * The dictionary key that says why an item may not go.
 * @param reason The reason.
 * @returns Its key in this package's dictionary.
 */
export function refusalTerm(reason: Exclude<UmbraDesktopRefusal, 'there'>): string {
  return reason === 'type' ? 'umbraDesktopMedia_refusedType' : reason === 'self' ? 'umbraDesktopMedia_refusedSelf' : 'umbraDesktopMedia_refusedAccess';
}

/** Where items are going. */
export interface UmbraDesktopTarget {
  /** The folder's key, null for the root. */
  unique: string | null;
  /** The keys of the folders it is inside, nearest first. */
  ancestors: ReadonlyArray<string>;
}

/**
 * Put the items that may go apart from those that may not.
 * @param items The items.
 * @param target Where they are going.
 * @param allowed The media types the folder allows, or undefined when every type is allowed.
 * @param mode Moving or copying: copying an item into its own folder makes a duplicate, which is allowed.
 * @param access What the person may reach, when known; a folder out of reach refuses every item.
 * @returns The items that may go, and the others with the reason.
 */
export function split(
  items: ReadonlyArray<UmbraDesktopMediaRef>,
  target: UmbraDesktopTarget,
  allowed: ReadonlySet<string> | undefined,
  mode: 'move' | 'copy',
  access?: UmbraDesktopMediaAccess,
): { allowed: UmbraDesktopMediaRef[]; refused: Array<{ item: UmbraDesktopMediaRef; reason: UmbraDesktopRefusal }> } {
  const result = { allowed: [] as UmbraDesktopMediaRef[], refused: [] as Array<{ item: UmbraDesktopMediaRef; reason: UmbraDesktopRefusal }> };
  if (access && !canReach(access, target)) {
    result.refused = items.map((item) => ({ item, reason: 'access' as const }));
    return result;
  }
  for (const item of items) {
    if (item.unique === target.unique || target.ancestors.includes(item.unique)) result.refused.push({ item, reason: 'self' });
    else if (mode === 'move' && item.parent === target.unique) result.refused.push({ item, reason: 'there' });
    else if (allowed && !allowed.has(item.mediaType)) result.refused.push({ item, reason: 'type' });
    else result.allowed.push(item);
  }
  return result;
}
