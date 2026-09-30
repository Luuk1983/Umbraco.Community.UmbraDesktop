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
 * The app a stored alias stands for: the app with that alias, or, for a section's fallback alias
 * (`section:<alias>`), the app that covers that section now (design D15 of the package catalogues
 * design).
 *
 * Shared by pins and by the launcher layout, which store aliases the same way and have to resolve
 * them the same way. Two copies of this rule would disagree the first time a package replaced a
 * fallback tile.
 * @param apps The apps this user may launch.
 * @param alias A stored alias.
 * @returns The app, or `undefined` when nothing answers to it.
 */
export function resolveAppAlias(apps: ReadonlyArray<UmbraDesktopApp>, alias: string): UmbraDesktopApp | undefined {
  return apps.find((candidate) => candidate.alias === alias) ?? coveringApp(apps, alias);
}

/**
 * The pinned list without an app: every key that stands for it, fallback alias included.
 * @param pinned The pinned aliases.
 * @param app The app to take out.
 * @returns A new list; the input is left untouched.
 */
export function withoutApp(pinned: ReadonlyArray<string>, app: UmbraDesktopApp): string[] {
  const keys = pinKeysFor(app, pinned);
  return pinned.filter((alias) => !keys.includes(alias));
}

/**
 * Pin an app at a position: before another pinned app, or at the end.
 *
 * Used by the launcher's drag and Move to, which say where a pin lands. An app that is already
 * pinned moves rather than appearing twice. `before` is matched through `pinKeysFor`, so a pin held
 * under a section's fallback alias is still a valid position.
 * @param pinned The pinned aliases.
 * @param app The app to pin.
 * @param before The pinned app it lands in front of; omitted, or the app itself, means the end.
 * @returns A new list; the input is left untouched.
 */
export function pinAppBefore(
  pinned: ReadonlyArray<string>,
  app: UmbraDesktopApp,
  before?: UmbraDesktopApp,
): string[] {
  const list = withoutApp(pinned, app);
  const at = before && before !== app ? list.findIndex((alias) => pinKeysFor(before, [alias]).length > 0) : -1;
  if (at === -1) list.push(app.alias);
  else list.splice(at, 0, app.alias);
  return list;
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
    const app = resolveAppAlias(apps, alias);
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
