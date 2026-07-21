import type {
  UmbraDesktopApp,
  UmbraDesktopCategory,
  UmbraDesktopGroup,
  UmbraDesktopLauncherCategory,
} from './types';
import {
  UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS,
  UMBRADESKTOP_UNCERTIFIED_CATEGORY_LABEL,
  UMBRADESKTOP_UNCERTIFIED_CATEGORY_WEIGHT,
} from './constants';

/** Compare by weight ascending, then label alphabetically. */
function byWeightThenLabel(aw: number, al: string, bw: number, bl: string): number {
  return aw - bw || al.localeCompare(bl);
}

/**
 * Group derived apps into the launcher's display tree: header → optional collapsible
 * group → apps, sorted by weight then label, empties dropped, the reserved "More"
 * header always last. Pure — see design §5.3.
 * @param apps The flat, tagged app list from `deriveApps`.
 * @param categories Curated headers.
 * @param groups Curated collapsible sub-groups.
 * @returns The launcher display tree.
 */
export function groupApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  categories: ReadonlyArray<UmbraDesktopCategory>,
  groups: ReadonlyArray<UmbraDesktopGroup>,
): UmbraDesktopLauncherCategory[] {
  // Ensure the reserved "More" category always exists as a home for fallback apps.
  const allCategories: UmbraDesktopCategory[] = [
    ...categories,
    {
      alias: UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS,
      label: UMBRADESKTOP_UNCERTIFIED_CATEGORY_LABEL,
      weight: UMBRADESKTOP_UNCERTIFIED_CATEGORY_WEIGHT,
    },
  ];

  const result: UmbraDesktopLauncherCategory[] = [];

  for (const category of allCategories) {
    const inCategory = apps.filter(
      (a) => (a.categoryAlias ?? UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS) === category.alias,
    );
    if (inCategory.length === 0) continue;

    const categoryGroups = groups
      .filter((g) => g.categoryAlias === category.alias)
      .slice()
      .sort((a, b) => byWeightThenLabel(a.weight ?? 0, a.label, b.weight ?? 0, b.label));

    const launcherGroups = categoryGroups
      .map((group) => ({
        group,
        apps: inCategory
          .filter((a) => a.groupAlias === group.alias)
          .sort((a, b) => byWeightThenLabel(a.weight ?? 0, a.name, b.weight ?? 0, b.name)),
      }))
      .filter((lg) => lg.apps.length > 0);

    const groupedAliases = new Set(categoryGroups.map((g) => g.alias));
    const looseApps = inCategory
      .filter((a) => !a.groupAlias || !groupedAliases.has(a.groupAlias))
      .sort((a, b) => byWeightThenLabel(a.weight ?? 0, a.name, b.weight ?? 0, b.name));

    result.push({ category, apps: looseApps, groups: launcherGroups });
  }

  return result.sort((a, b) =>
    byWeightThenLabel(
      a.category.weight ?? 0,
      a.category.label,
      b.category.weight ?? 0,
      b.category.label,
    ),
  );
}
