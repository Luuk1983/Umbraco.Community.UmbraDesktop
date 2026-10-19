/**
 * Renaming a media item from a manager window (F2, decided 2026-10-17). Saved through core's media
 * detail repository, with the person's own permissions, until phase 4 moves it onto the operations
 * engine so it can be undone.
 */

/** As much of a media item's detail as a rename changes. */
interface UmbraDesktopMediaDetailShape {
  /** Its names, one per culture; media are invariant, so usually one. */
  variants: Array<{ name: string }>;
}

/** The part of core's media detail repository a rename uses, so a test can hand in its own. */
export interface UmbraDesktopMediaDetailStore {
  /**
   * Read an item's detail.
   * @param unique The key.
   */
  requestByUnique(unique: string): Promise<{ data?: UmbraDesktopMediaDetailShape | undefined }>;
  /**
   * Save an item's detail.
   * @param model The detail, changed.
   */
  save(model: UmbraDesktopMediaDetailShape): Promise<{ error?: unknown }>;
}

/**
 * The name to save, or nothing when there is nothing to save.
 * @param next What was typed.
 * @param current The name now.
 * @returns The trimmed new name, or undefined when it is empty or the same.
 */
export function cleanName(next: string, current: string): string | undefined {
  const name = next.trim();
  return name && name !== current.trim() ? name : undefined;
}

/**
 * Rename an item.
 * @param store Core's media detail repository.
 * @param unique The item's key.
 * @param name The name typed.
 * @returns True when a new name was saved.
 */
export async function renameMedia(store: UmbraDesktopMediaDetailStore, unique: string, name: string): Promise<boolean> {
  const { data } = await store.requestByUnique(unique);
  if (!data) return false;
  const next = cleanName(name, data.variants[0]?.name ?? '');
  if (!next) return false;
  const { error } = await store.save({ ...data, variants: data.variants.map((variant) => ({ ...variant, name: next })) });
  return !error;
}
