import type { UmbraDesktopApp } from '../types';
import { UMBRADESKTOP_FALLBACK_ALIAS_PREFIX } from '../constants';

/** Operations on the pinned-apps list. Pure: no storage, no DOM, no app catalogue. */

/**
 * Every stored pin that stands for this app: its own alias, and the fallback alias of the section it
 * now covers (design D15). Usually one; two when a user pinned the fallback tile and then pinned the
 * app that replaced it.
 * @param app The app.
 * @param pinned The pinned aliases.
 * @returns The stored aliases that resolve to this app, in pin order.
 */
export function pinKeysFor(app: UmbraDesktopApp, pinned: ReadonlyArray<string>): string[] {
  const fallback = app.coversSection ? `${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}${app.coversSection}` : undefined;
  return pinned.filter((alias) => alias === app.alias || alias === fallback);
}

/**
 * Pin an app, or unpin it: removing **every** key that stands for it, not only its own alias, or an
 * app pinned through its section's fallback would stay pinned after the user unpinned it.
 *
 * New pins are appended so the list stays in pin order — the order the Favourites hero renders
 * them in — rather than jumping to the front.
 * @param pinned The pinned aliases.
 * @param app The app whose pin was clicked.
 * @returns A new list; the input is left untouched.
 */
export function togglePinnedApp(pinned: ReadonlyArray<string>, app: UmbraDesktopApp): string[] {
  const keys = pinKeysFor(app, pinned);
  return keys.length > 0 ? pinned.filter((alias) => !keys.includes(alias)) : [...pinned, app.alias];
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
 *
 * A pin on a section's fallback tile, `section:<alias>`, that no longer resolves falls back to the
 * app that now covers that section, so a package shipping its own entry for its section does not
 * silently cost the users who pinned the fallback their pin (design D15). An app is listed once even
 * when two stored pins stand for it.
 * @param apps The apps this user may launch.
 * @param pinned The pinned aliases, in pin order.
 * @returns The pinned apps, in pin order.
 */
export function resolvePinned(
  apps: ReadonlyArray<UmbraDesktopApp>,
  pinned: ReadonlyArray<string>,
): UmbraDesktopApp[] {
  const resolved: UmbraDesktopApp[] = [];
  for (const alias of pinned) {
    const app = apps.find((candidate) => candidate.alias === alias) ?? coveringApp(apps, alias);
    if (app && !resolved.includes(app)) resolved.push(app);
  }
  return resolved;
}

/**
 * The app covering the section a fallback alias names, if the alias is one.
 * @param apps The apps this user may launch.
 * @param alias A pinned alias.
 * @returns The covering app, or `undefined`.
 */
function coveringApp(apps: ReadonlyArray<UmbraDesktopApp>, alias: string): UmbraDesktopApp | undefined {
  if (!alias.startsWith(UMBRADESKTOP_FALLBACK_ALIAS_PREFIX)) return undefined;
  const section = alias.slice(UMBRADESKTOP_FALLBACK_ALIAS_PREFIX.length);
  return apps.find((candidate) => candidate.coversSection === section);
}
