/** Operations on the pinned-apps list. Pure: no storage, no DOM, no app catalogue. */

/**
 * Add an alias to the pinned list, or remove it if it is already there.
 *
 * New pins are appended so the list stays in pin order — the order the Favourites hero renders
 * them in — rather than jumping to the front.
 * @param pinned The current pinned aliases.
 * @param alias The app alias to toggle.
 * @returns A new list; the input is left untouched.
 */
export function togglePinned(pinned: ReadonlyArray<string>, alias: string): string[] {
  return pinned.includes(alias) ? pinned.filter((a) => a !== alias) : [...pinned, alias];
}
