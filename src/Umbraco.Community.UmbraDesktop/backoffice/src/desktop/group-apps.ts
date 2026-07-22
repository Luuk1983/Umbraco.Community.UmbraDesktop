import type { UmbraDesktopApp, UmbraDesktopGroup, UmbraDesktopLauncherGroup } from './types';
import {
  UMBRADESKTOP_MORE_GROUP_ALIAS,
  UMBRADESKTOP_MORE_GROUP_LABEL,
  UMBRADESKTOP_MORE_GROUP_WEIGHT,
} from './constants';

/** Compare by weight ascending, then a stable string tiebreak (labels/names are loc tokens). */
function byWeightThenKey(aw: number, ak: string, bw: number, bk: string): number {
  return aw - bw || ak.localeCompare(bk);
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
  const moreGroup: UmbraDesktopGroup = {
    alias: UMBRADESKTOP_MORE_GROUP_ALIAS,
    label: UMBRADESKTOP_MORE_GROUP_LABEL,
    weight: UMBRADESKTOP_MORE_GROUP_WEIGHT,
    auto: true,
  };
  const allGroups = [...groups, moreGroup];
  const known = new Set(groups.map((g) => g.alias));
  const groupOf = (a: UmbraDesktopApp) =>
    a.group && known.has(a.group) ? a.group : UMBRADESKTOP_MORE_GROUP_ALIAS;

  return allGroups
    .map((group) => ({
      group,
      apps: apps
        .filter((a) => groupOf(a) === group.alias)
        .slice()
        .sort((a, b) => byWeightThenKey(a.weight ?? 0, a.name, b.weight ?? 0, b.name)),
    }))
    .filter((lg) => lg.apps.length > 0)
    .sort((a, b) =>
      byWeightThenKey(a.group.weight ?? 0, a.group.label, b.group.weight ?? 0, b.group.label),
    );
}
