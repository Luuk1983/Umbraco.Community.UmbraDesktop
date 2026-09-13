import type { UmbraDesktopApp } from '../types';

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

/**
 * Resolve the pinned aliases against the apps this user may launch, in pin order.
 *
 * One function behind both surfaces that draw the pinned list — the launcher's Pinned hero and the
 * taskbar's fixed row. They have to agree about order and about what a pin resolves to, and the
 * only way two lists cannot disagree is by being one list.
 *
 * An alias with no app behind it is dropped rather than shown as a gap: the catalogue has already
 * filtered its entries against the user's permitted sections, so an unresolvable pin means the app
 * is not installed here or is not this user's to reach. Either way the pin itself is left alone, so
 * it comes back if the package returns or the permission is granted.
 * @param apps The apps this user may launch.
 * @param pinned The pinned aliases, in pin order.
 * @returns The pinned apps, in pin order.
 */
export function resolvePinned(
  apps: ReadonlyArray<UmbraDesktopApp>,
  pinned: ReadonlyArray<string>,
): UmbraDesktopApp[] {
  return pinned
    .map((alias) => apps.find((app) => app.alias === alias))
    .filter((app): app is UmbraDesktopApp => !!app);
}
