import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';
import type { UmbraDesktopLauncherLayout, UmbraDesktopLauncherLayoutGroup } from '../settings/types';
import { groupApps, launcherGroupOrder } from '../group-apps';
import { resolveAppAlias, resolvePinned } from '../settings/pinned';
import { groupLabel } from './group-labels';
import type { UmbraDesktopGroupLabel } from './group-labels';

/**
 * Building what the launcher shows (design §4.2). Pure: no DOM, no storage, no contexts.
 *
 * The launcher is always built from the catalogue. A stored layout is only the user's changes to it,
 * and anything the catalogue has that the layout does not mention is placed here, on every build,
 * rather than written into storage. That is what lets a package install keep showing up after the
 * user has arranged their launcher (design D2, D3).
 */

/** What the catalogue says exists for this user. */
export interface UmbraDesktopLauncherInputs {
  /** The apps this user may open, as the catalogue context publishes them (permissions applied). */
  apps: ReadonlyArray<UmbraDesktopApp>;
  /** Every group in the merged catalogue, curated and package. */
  catalogueGroups: ReadonlyArray<UmbraDesktopGroup>;
}

/** What the user has chosen: the pins, and their changes to the groups. */
export interface UmbraDesktopLauncherArrangement {
  /** The pinned aliases, which are the Pinned place (design D5). */
  pinned: ReadonlyArray<string>;
  /** The user's changes to the groups; absent when they have never arranged. */
  layout?: UmbraDesktopLauncherLayout;
}

/** One group as drawn. */
export interface UmbraDesktopLauncherViewGroup {
  /** The layout group's id. */
  id: string;
  /** Its heading. */
  label: UmbraDesktopGroupLabel;
  /** The apps it shows, in order. Empty groups are kept; normal mode skips them, arrange mode draws them. */
  apps: UmbraDesktopApp[];
  /** Whether it is the user's own group rather than a catalogue group. */
  custom: boolean;
}

/** One catalogue group's worth of apps that are not on the launcher. */
export interface UmbraDesktopPaletteGroup {
  /** The catalogue group. */
  group: UmbraDesktopGroup;
  /** Its apps that are not shown, in catalogue order. */
  apps: UmbraDesktopApp[];
  /** Whether the group itself is on the launcher: "Add all" when it is, "Add group" when not. */
  onLauncher: boolean;
}

/** Everything the launcher draws. */
export interface UmbraDesktopLauncherView {
  /** The Pinned place, in pin order. */
  pinned: UmbraDesktopApp[];
  /** The groups, in order. */
  groups: UmbraDesktopLauncherViewGroup[];
  /** What is not on the launcher, for arrange mode's palette. */
  palette: UmbraDesktopPaletteGroup[];
}

/**
 * A deep copy of a layout, so an edit never reaches back into the settings state it was read from.
 * @param layout The layout.
 * @returns An unshared copy.
 */
export function cloneLayout(layout: UmbraDesktopLauncherLayout): UmbraDesktopLauncherLayout {
  return {
    groups: layout.groups.map((group) => ({ ...group, apps: [...group.apps] })),
    removed: [...layout.removed],
    deletedGroups: [...layout.deletedGroups],
  };
}

/**
 * Insert a catalogue group where it belongs among the user's groups: directly after the nearest
 * catalogue group before it, in catalogue order, that the layout still holds, or first when there
 * is none. User groups have no catalogue position, so they only ever move with their neighbours.
 * @param groups The layout's groups; changed in place.
 * @param group The group to insert.
 * @param catalogueGroups The merged catalogue groups.
 */
export function insertCatalogueGroup(
  groups: UmbraDesktopLauncherLayoutGroup[],
  group: UmbraDesktopLauncherLayoutGroup,
  catalogueGroups: ReadonlyArray<UmbraDesktopGroup>,
): void {
  const order = launcherGroupOrder(catalogueGroups).map((g) => g.alias);
  const predecessors = order.slice(0, Math.max(order.indexOf(group.id), 0)).reverse();
  for (const predecessor of predecessors) {
    const at = groups.findIndex((g) => g.id === predecessor);
    if (at !== -1) {
      groups.splice(at + 1, 0, group);
      return;
    }
  }
  groups.unshift(group);
}

/**
 * The layout a launcher nobody has arranged is equivalent to: the catalogue's grouping over every
 * app that is not pinned, each group keeping its catalogue id and a `null` label.
 * @param inputs The catalogue.
 * @param pinned The pinned aliases.
 * @returns A fresh layout.
 */
function seedLayout(inputs: UmbraDesktopLauncherInputs, pinned: ReadonlyArray<string>): UmbraDesktopLauncherLayout {
  const pinnedApps = new Set(resolvePinned(inputs.apps, pinned));
  const unpinned = inputs.apps.filter((app) => !pinnedApps.has(app));
  return {
    groups: groupApps(unpinned, inputs.catalogueGroups).map((g) => ({
      id: g.group.alias,
      label: null,
      apps: g.apps.map((a) => a.alias),
    })),
    removed: [],
    deletedGroups: [],
  };
}

/**
 * The stored layout with every unplaced app written in (design §4.2 step 4), or the seed when
 * nothing is stored. This is what an edit starts from, so what the user sees is what gets saved,
 * and an alias they cannot open right now keeps its position.
 *
 * An unplaced app is one that is not pinned, not in any group and not removed: a new install, a
 * newly granted permission, or an app just unpinned. It goes to the end of its catalogue group; a
 * group the layout lacks is inserted by {@link insertCatalogueGroup}, unless the user deleted it, in
 * which case the app waits in the palette.
 * @param inputs The catalogue.
 * @param arrangement The pins and the stored layout.
 * @returns A fresh layout; nothing passed in is changed.
 */
export function effectiveLayout(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
): UmbraDesktopLauncherLayout {
  if (!arrangement.layout) return seedLayout(inputs, arrangement.pinned);
  const layout = cloneLayout(arrangement.layout);
  const pinnedApps = new Set(resolvePinned(inputs.apps, arrangement.pinned));
  const placed = new Set<UmbraDesktopApp>();
  for (const group of layout.groups) {
    for (const alias of group.apps) {
      const app = resolveAppAlias(inputs.apps, alias);
      if (app) placed.add(app);
    }
  }
  const removed = new Set(
    layout.removed.map((alias) => resolveAppAlias(inputs.apps, alias)).filter((a): a is UmbraDesktopApp => !!a),
  );

  // Walked in catalogue order, so two new groups arriving together are inserted in the right order
  // and the apps of one new group arrive sorted by weight.
  for (const catalogueGroup of groupApps(inputs.apps, inputs.catalogueGroups)) {
    const id = catalogueGroup.group.alias;
    for (const app of catalogueGroup.apps) {
      if (pinnedApps.has(app) || placed.has(app) || removed.has(app)) continue;
      const existing = layout.groups.find((g) => g.id === id);
      if (existing) existing.apps.push(app.alias);
      else if (!layout.deletedGroups.includes(id)) {
        insertCatalogueGroup(layout.groups, { id, label: null, apps: [app.alias] }, inputs.catalogueGroups);
      }
    }
  }
  return layout;
}

/**
 * Everything the launcher draws: the Pinned place, the groups, and the palette.
 *
 * An app is shown once at most: pinned apps are left out of every group, and an app listed twice
 * shows where it first appears. Aliases with no app behind them are skipped, never removed.
 * @param inputs The catalogue.
 * @param arrangement The pins and the stored layout.
 * @returns The view.
 */
export function resolveLauncher(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
): UmbraDesktopLauncherView {
  const pinned = resolvePinned(inputs.apps, arrangement.pinned);
  const pinnedApps = new Set(pinned);
  const layout = effectiveLayout(inputs, arrangement);
  const catalogueIds = new Set(launcherGroupOrder(inputs.catalogueGroups).map((g) => g.alias));
  const shown = new Set<UmbraDesktopApp>();

  const groups = layout.groups.map((group) => {
    const apps: UmbraDesktopApp[] = [];
    for (const alias of group.apps) {
      const app = resolveAppAlias(inputs.apps, alias);
      if (!app || pinnedApps.has(app) || shown.has(app)) continue;
      shown.add(app);
      apps.push(app);
    }
    return {
      id: group.id,
      label: groupLabel(group.id, group.label, inputs.catalogueGroups),
      apps,
      custom: !catalogueIds.has(group.id),
    };
  });

  const onLauncher = new Set(layout.groups.map((g) => g.id));
  const palette = groupApps(
    inputs.apps.filter((app) => !pinnedApps.has(app) && !shown.has(app)),
    inputs.catalogueGroups,
  ).map((g) => ({ group: g.group, apps: g.apps, onLauncher: onLauncher.has(g.group.alias) }));

  return { pinned, groups, palette };
}
