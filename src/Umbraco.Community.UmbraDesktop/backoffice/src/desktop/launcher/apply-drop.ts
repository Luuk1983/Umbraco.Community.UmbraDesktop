import type { UmbraDesktopApp } from '../types';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants';
import { moveApp, moveGroup, pinApp, removeApp } from './layout-edits';
import { resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherArrangement, UmbraDesktopLauncherInputs } from './resolve-launcher';
import type { UmbraDesktopDropTarget } from './drop-target';

/**
 * Turning a drop into an edit. One place for both normal mode and arrange mode, since a drop means
 * the same thing in both: only which targets are on screen differs.
 */

/**
 * The edit an app drop makes.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The dragged app.
 * @param target Where it was dropped.
 * @returns The new arrangement, or `undefined` when the drop changes nothing.
 */
export function applyAppDrop(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
  target: UmbraDesktopDropTarget,
): UmbraDesktopLauncherArrangement | undefined {
  switch (target.kind) {
    case 'remove':
    case 'palette':
      return removeApp(inputs, arrangement, app);
    case 'group':
      return target.groupId === UMBRADESKTOP_PINNED_GROUP_ID
        ? pinApp(inputs, arrangement, app)
        : moveApp(inputs, arrangement, app, target.groupId);
    case 'tile': {
      const view = resolveLauncher(inputs, arrangement);
      const pinned = target.groupId === UMBRADESKTOP_PINNED_GROUP_ID;
      const list = pinned ? view.pinned : (view.groups.find((g) => g.id === target.groupId)?.apps ?? []);
      const at = list.findIndex((candidate) => candidate.alias === target.alias);
      if (at === -1) return undefined;
      const before = target.after ? list.slice(at + 1).find((candidate) => candidate !== app) : list[at];
      if (before === app) return undefined;
      return pinned ? pinApp(inputs, arrangement, app, before) : moveApp(inputs, arrangement, app, target.groupId, before);
    }
  }
}

/**
 * The edit a group drop makes: before the group it lands on, or after it.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The dragged group.
 * @param target Where it was dropped.
 * @returns The new arrangement, or `undefined` when the drop changes nothing.
 */
export function applyGroupDrop(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
  target: UmbraDesktopDropTarget,
): UmbraDesktopLauncherArrangement | undefined {
  if (target.kind !== 'group' || target.groupId === groupId || target.groupId === UMBRADESKTOP_PINNED_GROUP_ID) {
    return undefined;
  }
  const ids = resolveLauncher(inputs, arrangement).groups.map((g) => g.id);
  const at = ids.indexOf(target.groupId);
  if (at === -1) return undefined;
  const before = target.after ? ids.slice(at + 1).find((id) => id !== groupId) : ids[at];
  return moveGroup(inputs, arrangement, groupId, before);
}
