import type { UmbraDesktopApp, UmbraDesktopGroup, UmbraDesktopLauncherGroup } from './types';
import {
  UMBRADESKTOP_MORE_GROUP_ALIAS,
  UMBRADESKTOP_MORE_GROUP_LABEL,
  UMBRADESKTOP_MORE_GROUP_WEIGHT,
} from './constants';

/**
 * Compare by weight ascending, then a stable string tiebreak (labels/names are loc tokens).
 *
 * The keys go through `String()` because the type is a promise nothing enforces: an app's name can
 * be inherited from another package's extension label, which a static `umbraco-package.json` can
 * make a number or an object, and `localeCompare` on one of those throws. This is the one place
 * every name and label passes through, and a throw here stops the recompute that called it, which
 * freezes the launcher (package catalogues design D9).
 */
function byWeightThenKey(aw: number, ak: string, bw: number, bk: string): number {
  return aw - bw || String(ak).localeCompare(String(bk));
}

/**
 * The catalogue groups in launcher order: by weight, then label, with the reserved "More" group
 * always last. Exported because the launcher layout inserts a returning catalogue group by this
 * order (design §4.2 step 4), and a second copy of the sort would drift from this one.
 * @param groups Curated and package groups, merged.
 * @returns A new list, More included.
 */
export function launcherGroupOrder(groups: ReadonlyArray<UmbraDesktopGroup>): UmbraDesktopGroup[] {
  const moreGroup: UmbraDesktopGroup = {
    alias: UMBRADESKTOP_MORE_GROUP_ALIAS,
    label: UMBRADESKTOP_MORE_GROUP_LABEL,
    weight: UMBRADESKTOP_MORE_GROUP_WEIGHT,
    auto: true,
  };
  return [...groups, moreGroup].sort((a, b) => byWeightThenKey(a.weight ?? 0, a.label, b.weight ?? 0, b.label));
}

/**
 * The catalogue group an app belongs to: its own `group` when that group exists, otherwise More.
 * @param app The app.
 * @param groups Curated and package groups, merged.
 * @returns A group alias.
 */
export function catalogueGroupOf(app: UmbraDesktopApp, groups: ReadonlyArray<UmbraDesktopGroup>): string {
  return app.group && groups.some((g) => g.alias === app.group) ? app.group : UMBRADESKTOP_MORE_GROUP_ALIAS;
}

/**
 * Group the flat app list into the launcher's display groups: one flat level, sorted by
 * group weight, empties dropped, the reserved auto "More" group always last. Apps whose
 * `group` is unset or unknown fall into "More". Pure.
 * @param apps The flat, tagged app list from `deriveApps`.
 * @param groups Curated flat groups.
 * @returns The launcher display groups.
 */
export function groupApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  groups: ReadonlyArray<UmbraDesktopGroup>,
): UmbraDesktopLauncherGroup[] {
  return launcherGroupOrder(groups)
    .map((group) => ({
      group,
      apps: apps
        .filter((a) => catalogueGroupOf(a, groups) === group.alias)
        .slice()
        .sort((a, b) => byWeightThenKey(a.weight ?? 0, a.name, b.weight ?? 0, b.name)),
    }))
    .filter((lg) => lg.apps.length > 0);
}
