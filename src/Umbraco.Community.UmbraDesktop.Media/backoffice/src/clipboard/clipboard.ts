import type { UmbraDesktopMediaRef } from '../operations/media-api.js';

/**
 * The manager's clipboard (design §5): what was cut or copied, held for every manager window at once,
 * as an OS file manager's clipboard is. Pure rules here; the context holds it.
 */

/** What is held. */
export interface UmbraDesktopMediaClipboard {
  /** Cut moves on Paste; copy makes copies, and can be pasted again. */
  mode: 'cut' | 'copy';
  /** The items. */
  items: ReadonlyArray<UmbraDesktopMediaRef>;
}

/**
 * What Paste does with what is held.
 * @param clipboard What is held.
 * @returns A move for a cut, a copy for a copy, nothing when nothing is held.
 */
export function pasteKind(clipboard: UmbraDesktopMediaClipboard | undefined): 'move' | 'copy' | undefined {
  if (!clipboard?.items.length) return undefined;
  return clipboard.mode === 'cut' ? 'move' : 'copy';
}

/**
 * Where a paste lands. A copied folder pasted onto itself lands beside it, in its parent, as a copy of
 * it: what a file manager does with a folder copied and pasted where it is (owner's test,
 * 2026-10-18). A folder cannot hold a copy of itself, and a cut of one onto itself stays refused.
 * @param clipboard What is held.
 * @param target The folder pasted on, null for the root.
 * @returns The folder the paste goes into, null for the root.
 */
export function pasteInto(clipboard: UmbraDesktopMediaClipboard | undefined, target: string | null): string | null {
  if (clipboard?.mode !== 'copy' || target === null) return target;
  const self = clipboard.items.find((item) => item.isFolder && item.unique === target);
  return self ? self.parent : target;
}

/**
 * What is held after a paste: a cut is used up, as in every OS; a copy stays for pasting again.
 * @param clipboard What was held.
 * @returns What is held now.
 */
export function afterPaste(clipboard: UmbraDesktopMediaClipboard | undefined): UmbraDesktopMediaClipboard | undefined {
  return clipboard?.mode === 'copy' ? clipboard : undefined;
}

/**
 * The items shown faded: those of a cut, which stay where they are until pasted (design §5).
 * @param clipboard What is held.
 * @returns Their keys.
 */
export function cutKeys(clipboard: UmbraDesktopMediaClipboard | undefined): string[] {
  return clipboard?.mode === 'cut' ? clipboard.items.map((item) => item.unique) : [];
}
