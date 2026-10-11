import type { UmbraDesktopApp } from '../types';
import type { UmbraDesktopLauncherLayout, UmbraDesktopLauncherLayoutGroup } from '../settings/types';
import { catalogueGroupOf, launcherGroupOrder } from '../group-apps';
import { pinAppBefore, resolveAppAlias, resolvePinned, withoutApp } from '../settings/pinned';
import { cloneLayout, effectiveLayout, insertCatalogueGroup, resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherArrangement, UmbraDesktopLauncherInputs } from './resolve-launcher';

/**
 * One pure function per thing a user can do to the launcher (design §4.3).
 *
 * Every edit starts from the **effective** layout, the stored one with new apps written in, so what
 * the user sees is what is saved. Positions are "before this app" or "at the end", never an index,
 * because an index counts differently once aliases this user cannot open are interleaved.
 *
 * Nothing passed in is changed. Each edit returns a new `{ pinned, layout }` for
 * `setLauncherArrangement`, one settings write per user action — routed through {@link settled} so
 * an edit that turns out to change nothing relevant to an unarranged launcher does not start storing
 * a layout anyway.
 */

/**
 * An unshared copy of an arrangement, for the edits that turn out to change nothing.
 * @param arrangement The arrangement.
 * @returns A copy.
 */
function unchanged(arrangement: UmbraDesktopLauncherArrangement): UmbraDesktopLauncherArrangement {
  return { pinned: [...arrangement.pinned], layout: arrangement.layout ? cloneLayout(arrangement.layout) : undefined };
}

/**
 * The arrangement an edit should actually return: `result`, unless the launcher had no stored
 * layout before this edit and `result`'s layout is exactly what an unarranged launcher with the new
 * pins already draws — in which case storing it would be pointless, and would freeze the catalogue
 * order for this user for no reason the same way a stored pin would (design §4.3). Every edit's
 * return goes through this, because "before" the launcher's own order and "before" another tile in
 * it look the same from inside an edit and only this comparison, against the seed, tells them apart.
 *
 * Compared with `JSON.stringify` rather than a structural walk: both sides are always built by
 * {@link effectiveLayout} from the same catalogue, so two layouts that mean the same thing are built
 * the same way and serialise identically — there is no second code path here that could format the
 * same data two different ways.
 * @param inputs The catalogue.
 * @param arrangement The arrangement the edit started from.
 * @param result The edit's candidate result.
 * @returns `result`, or the same pins with `layout: undefined` when storing it would be a no-op.
 */
function settled(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  result: UmbraDesktopLauncherArrangement,
): UmbraDesktopLauncherArrangement {
  if (arrangement.layout || !result.layout) return result;
  const seed = effectiveLayout(inputs, { pinned: result.pinned });
  return JSON.stringify(result.layout) === JSON.stringify(seed) ? { pinned: result.pinned, layout: undefined } : result;
}

/**
 * Whether a stored alias stands for an app.
 * @param inputs The catalogue.
 * @param alias A stored alias.
 * @param app The app.
 * @returns True when the alias resolves to it.
 */
function standsFor(inputs: UmbraDesktopLauncherInputs, alias: string, app: UmbraDesktopApp): boolean {
  return resolveAppAlias(inputs.apps, alias) === app;
}

/**
 * Take an app out of every group and out of the removed list, so it can be put somewhere once.
 * @param inputs The catalogue.
 * @param layout The layout; changed in place.
 * @param app The app.
 */
function lift(inputs: UmbraDesktopLauncherInputs, layout: UmbraDesktopLauncherLayout, app: UmbraDesktopApp): void {
  for (const group of layout.groups) group.apps = group.apps.filter((alias) => !standsFor(inputs, alias, app));
  layout.removed = layout.removed.filter((alias) => !standsFor(inputs, alias, app));
}

/**
 * Put an alias into a list before the alias standing for another app, or at the end.
 * @param inputs The catalogue.
 * @param list The list; changed in place.
 * @param alias The alias to insert.
 * @param before The app it lands in front of, if any.
 */
function insertBefore(inputs: UmbraDesktopLauncherInputs, list: string[], alias: string, before?: UmbraDesktopApp): void {
  const at = before ? list.findIndex((candidate) => standsFor(inputs, candidate, before)) : -1;
  if (at === -1) list.push(alias);
  else list.splice(at, 0, alias);
}

/**
 * Whether an id names a catalogue group (curated, package, or More) rather than one the user made.
 * @param inputs The catalogue.
 * @param id A layout group id.
 * @returns True for a catalogue group.
 */
function isCatalogueGroup(inputs: UmbraDesktopLauncherInputs, id: string): boolean {
  return launcherGroupOrder(inputs.catalogueGroups).some((group) => group.alias === id);
}

/**
 * Whether the app a deleted group's alias resolves to is still visible without that group: pinned,
 * so the Pinned place already shows it, or listed in one of the groups that survive the deletion,
 * since an app listed twice counts at its first occurrence (design §4.2 step 3). Either way it has
 * not left the launcher, so `deleteGroup` must not mark it removed.
 * @param inputs The catalogue.
 * @param pinnedApps The apps pinned in this arrangement.
 * @param survivors The layout's groups once the deleted one has been filtered out.
 * @param alias An alias from the group being deleted.
 * @returns True when the alias's app is still shown elsewhere. An alias nothing resolves to is
 * never "elsewhere": it still goes to `removed`, exactly as before, so it comes back in place if its
 * app returns.
 */
function shownElsewhere(
  inputs: UmbraDesktopLauncherInputs,
  pinnedApps: ReadonlySet<UmbraDesktopApp>,
  survivors: ReadonlyArray<UmbraDesktopLauncherLayoutGroup>,
  alias: string,
): boolean {
  const app = resolveAppAlias(inputs.apps, alias);
  if (!app) return false;
  return pinnedApps.has(app) || survivors.some((group) => group.apps.some((candidate) => standsFor(inputs, candidate, app)));
}

/**
 * The layout's group for a catalogue group, brought back first if the user deleted it or it is
 * missing, at its catalogue position.
 * @param inputs The catalogue.
 * @param layout The layout; changed in place.
 * @param id The catalogue group's alias.
 * @returns The group.
 */
function ensureCatalogueGroup(
  inputs: UmbraDesktopLauncherInputs,
  layout: UmbraDesktopLauncherLayout,
  id: string,
): UmbraDesktopLauncherLayoutGroup {
  layout.deletedGroups = layout.deletedGroups.filter((deleted) => deleted !== id);
  let group = layout.groups.find((g) => g.id === id);
  if (!group) {
    group = { id, label: null, apps: [] };
    insertCatalogueGroup(layout.groups, group, inputs.catalogueGroups);
  }
  return group;
}

/**
 * A fresh id for a group the user creates. Not `crypto.randomUUID`, which only exists in a secure
 * context, and a backoffice on plain http on an intranet host is not one.
 * @returns A `custom-` id.
 */
export function newGroupId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Move an app into a group, before another app or at the end. Unpins it if it was pinned.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The app being moved.
 * @param groupId The target group.
 * @param before The app it lands in front of; omitted means the end.
 * @returns The new arrangement.
 */
export function moveApp(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
  groupId: string,
  before?: UmbraDesktopApp,
): UmbraDesktopLauncherArrangement {
  if (before === app) return unchanged(arrangement);
  const layout = effectiveLayout(inputs, arrangement);
  const target = layout.groups.find((g) => g.id === groupId);
  if (!target) return unchanged(arrangement);
  lift(inputs, layout, app);
  insertBefore(inputs, target.apps, app.alias, before);
  return settled(inputs, arrangement, { pinned: withoutApp(arrangement.pinned, app), layout });
}

/**
 * Pin an app, before another pinned app or at the end. On a launcher nobody has arranged this
 * changes the pins alone: a pinned app is left out of the groups anyway, and storing a layout for a
 * pin would freeze the catalogue order for this user (design §4.3).
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The app being pinned.
 * @param before The pinned app it lands in front of; omitted means the end.
 * @returns The new arrangement.
 */
export function pinApp(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
  before?: UmbraDesktopApp,
): UmbraDesktopLauncherArrangement {
  const pinned = pinAppBefore(arrangement.pinned, app, before);
  if (!arrangement.layout) return settled(inputs, arrangement, { pinned, layout: undefined });
  const layout = effectiveLayout(inputs, arrangement);
  lift(inputs, layout, app);
  return settled(inputs, arrangement, { pinned, layout });
}

/**
 * Take an app off the launcher. It waits in the palette and in All apps. Unpins it if pinned.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The app.
 * @returns The new arrangement.
 */
export function removeApp(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  lift(inputs, layout, app);
  layout.removed.push(app.alias);
  return settled(inputs, arrangement, { pinned: withoutApp(arrangement.pinned, app), layout });
}

/**
 * Put an app from the palette back at the end of its catalogue group, bringing the group back if
 * it had been deleted.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The app.
 * @returns The new arrangement.
 */
export function addApp(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  lift(inputs, layout, app);
  ensureCatalogueGroup(inputs, layout, catalogueGroupOf(app, inputs.catalogueGroups)).apps.push(app.alias);
  return settled(inputs, arrangement, { pinned: [...arrangement.pinned], layout });
}

/**
 * Put a whole catalogue group back with every palette app that belongs to it ("Add group" and
 * "Add all"). Does nothing for a group id that is not in the catalogue: a group the user created has
 * no palette apps "waiting" for it, since nothing was ever removed on its account, so there is
 * nothing to add back.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The catalogue group's alias.
 * @returns The new arrangement.
 */
export function addGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
): UmbraDesktopLauncherArrangement {
  if (!isCatalogueGroup(inputs, groupId)) return unchanged(arrangement);
  const waiting = resolveLauncher(inputs, arrangement).palette.find((p) => p.group.alias === groupId)?.apps ?? [];
  const layout = effectiveLayout(inputs, arrangement);
  const group = ensureCatalogueGroup(inputs, layout, groupId);
  for (const app of waiting) {
    lift(inputs, layout, app);
    group.apps.push(app.alias);
  }
  return settled(inputs, arrangement, { pinned: [...arrangement.pinned], layout });
}

/**
 * Delete a group. Its apps go to the palette, hidden aliases included, so they stay off when access
 * returns — unless an alias is pinned, or also listed in a group that survives (see
 * {@link shownElsewhere}), in which case it is left out of `removed`: it never actually left the
 * launcher, so marking it removed would be wrong. A catalogue group is remembered as deleted, so its
 * new apps wait in the palette rather than bringing it back (design D3).
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The group.
 * @returns The new arrangement.
 */
export function deleteGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  const group = layout.groups.find((g) => g.id === groupId);
  if (!group) return unchanged(arrangement);
  layout.groups = layout.groups.filter((g) => g !== group);
  const pinnedApps = new Set(resolvePinned(inputs.apps, arrangement.pinned));
  for (const alias of group.apps) {
    if (!shownElsewhere(inputs, pinnedApps, layout.groups, alias) && !layout.removed.includes(alias)) {
      layout.removed.push(alias);
    }
  }
  if (isCatalogueGroup(inputs, groupId) && !layout.deletedGroups.includes(groupId)) layout.deletedGroups.push(groupId);
  return settled(inputs, arrangement, { pinned: [...arrangement.pinned], layout });
}

/**
 * Create an empty group at the end.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param id Its id, from {@link newGroupId}; a parameter so a test can name it.
 * @param label Its name.
 * @returns The new arrangement.
 */
export function createGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  id: string,
  label: string,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  layout.groups.push({ id, label, apps: [] });
  return settled(inputs, arrangement, { pinned: [...arrangement.pinned], layout });
}

/**
 * Rename a group. Clearing a catalogue group's name gives it back its translated name; a group the
 * user made cannot be left nameless, so clearing it changes nothing.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The group.
 * @param text What the user typed.
 * @returns The new arrangement.
 */
export function renameGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
  text: string,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  const group = layout.groups.find((g) => g.id === groupId);
  if (!group) return unchanged(arrangement);
  const trimmed = text.trim();
  if (trimmed) group.label = trimmed;
  else if (isCatalogueGroup(inputs, groupId)) group.label = null;
  else return unchanged(arrangement);
  return settled(inputs, arrangement, { pinned: [...arrangement.pinned], layout });
}

/**
 * Move a group before another group, or to the end.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The group being moved.
 * @param beforeId The group it lands in front of; omitted means the end.
 * @returns The new arrangement.
 */
export function moveGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
  beforeId?: string,
): UmbraDesktopLauncherArrangement {
  if (beforeId === groupId) return unchanged(arrangement);
  const layout = effectiveLayout(inputs, arrangement);
  const group = layout.groups.find((g) => g.id === groupId);
  if (!group) return unchanged(arrangement);
  layout.groups = layout.groups.filter((g) => g !== group);
  const at = beforeId ? layout.groups.findIndex((g) => g.id === beforeId) : -1;
  if (at === -1) layout.groups.push(group);
  else layout.groups.splice(at, 0, group);
  return settled(inputs, arrangement, { pinned: [...arrangement.pinned], layout });
}

/**
 * Back to the catalogue's grouping. Pins stay: a button in the launcher should not rearrange the
 * taskbar (design D10).
 * @param arrangement The current arrangement.
 * @returns The arrangement without a layout.
 */
export function resetLayout(arrangement: UmbraDesktopLauncherArrangement): UmbraDesktopLauncherArrangement {
  return { pinned: [...arrangement.pinned], layout: undefined };
}
