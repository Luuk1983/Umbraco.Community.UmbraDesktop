/*
 * Show where (design §16, owner 2026-10-25): which pages, media and members use the images a run would
 * replace, place by place, each with its path, so an editor can tell the places apart.
 */

/** One place that uses an image. */
export interface Place {
  /** What it is: a page, another media item, a member, or anything else Umbraco tracks. */
  kind: 'document' | 'media' | 'member' | 'other';
  /** Its name. */
  name: string;
  /** Its ancestors' names, root first, without its own; empty for a member, or at the root. */
  path: string[];
  /** Its type's icon, as Umbraco gives it. */
  icon?: string;
}

/** One image that is used, as the run counted it. */
export interface UsedImage {
  /** The image's key. */
  unique: string;
  /** Its name. */
  name: string;
  /** In how many places it is used. */
  count: number;
}

/** How many places each image lists before "and n more": a glance, not a report. */
export const PLACES_SHOWN = 5;

/**
 * The images used most first, so the ones that matter most to the decision are at the top. Stable, so
 * images used equally often keep the order of the selection.
 * @param images The images.
 * @returns A sorted copy.
 */
export function sortByUse<T extends UsedImage>(images: readonly T[]): T[] {
  return images
    .map((image, index) => ({ image, index }))
    .sort((a, b) => b.image.count - a.image.count || a.index - b.index)
    .map(({ image }) => image);
}
