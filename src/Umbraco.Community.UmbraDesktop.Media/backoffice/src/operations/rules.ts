import type { UmbraDesktopMediaRef } from './media-api.js';

/**
 * Which items may go into a folder (design §4 and §11, plan task 4.2). Pure: the folder's allowed types
 * and its ancestry are read by the caller. What the server refuses beyond this (permissions, start
 * nodes) comes back from the server with its reason, per item, and does not stop the rest.
 */

/** Why an item may not go. */
export type UmbraDesktopRefusal =
  /** The folder does not allow its media type. */
  | 'type'
  /** It is the folder, or a folder the target is inside. */
  | 'self'
  /** It is already in the folder: a move there would do nothing. */
  | 'there';

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
 * @returns The items that may go, and the others with the reason.
 */
export function split(
  items: ReadonlyArray<UmbraDesktopMediaRef>,
  target: UmbraDesktopTarget,
  allowed: ReadonlySet<string> | undefined,
  mode: 'move' | 'copy',
): { allowed: UmbraDesktopMediaRef[]; refused: Array<{ item: UmbraDesktopMediaRef; reason: UmbraDesktopRefusal }> } {
  const result = { allowed: [] as UmbraDesktopMediaRef[], refused: [] as Array<{ item: UmbraDesktopMediaRef; reason: UmbraDesktopRefusal }> };
  for (const item of items) {
    if (item.unique === target.unique || target.ancestors.includes(item.unique)) result.refused.push({ item, reason: 'self' });
    else if (mode === 'move' && item.parent === target.unique) result.refused.push({ item, reason: 'there' });
    else if (allowed && !allowed.has(item.mediaType)) result.refused.push({ item, reason: 'type' });
    else result.allowed.push(item);
  }
  return result;
}
