import type {
  UmbraDesktopApp,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';
import { inferUrl } from './url-inference';
import { UMBRADESKTOP_MORE_GROUP_ALIAS } from './constants';

/** Fallback icon when neither the entry nor its referenced manifest provides one. */
const DEFAULT_ICON = 'icon-box';

/**
 * Turn resolved catalogue entries + the current user's permitted sections into the
 * flat, tagged app list. Certified entries first (gate-filtered), then an
 * uncertified `full-section` fallback for every permitted section not already
 * represented by a section-root entry. Pure — see design §5.2.
 * @param resolved Catalogue entries the adapter has resolved to URL + gate + presentation.
 * @param permittedSections Sections the current user may access.
 * @param excludedSections Section aliases that must never produce an automatic fallback app.
 * @returns The flat list of launchable apps, each tagged with confidence + placement.
 */
export function deriveApps(
  resolved: ReadonlyArray<UmbraDesktopResolvedEntry>,
  permittedSections: ReadonlyArray<UmbraDesktopSectionInfo>,
  excludedSections: ReadonlyArray<string> = [],
): UmbraDesktopApp[] {
  const permitted = new Set(permittedSections.map((s) => s.alias));
  const excluded = new Set(excludedSections);
  const apps: UmbraDesktopApp[] = [];
  const coveredSections = new Set<string>();

  // Certified pass.
  for (const r of resolved) {
    if (!r.gateSectionAlias || !permitted.has(r.gateSectionAlias)) continue;
    if (!r.url) continue;
    const e = r.entry;
    apps.push({
      alias: e.alias,
      name: e.name ?? r.inheritedName ?? e.alias,
      icon: e.icon ?? r.inheritedIcon ?? DEFAULT_ICON,
      url: r.url,
      chromeProfile: e.chromeProfile ?? 'full-section',
      defaultSize: e.defaultSize,
      minSize: e.minSize,
      allowMultiple: e.allowMultiple,
      weight: e.weight,
      group: e.group,
      sourceSection: r.gateSectionAlias ?? undefined,
      confidence: 'certified',
    });
    if (r.isSectionRoot) coveredSections.add(r.gateSectionAlias);
  }

  // Uncertified section fallback.
  for (const s of permittedSections) {
    if (coveredSections.has(s.alias)) continue;
    if (excluded.has(s.alias)) continue;
    const url = inferUrl({ type: 'section', pathname: s.pathname });
    if (!url) continue;
    apps.push({
      alias: `section:${s.alias}`,
      name: s.label,
      icon: DEFAULT_ICON,
      url,
      chromeProfile: 'full-section',
      group: UMBRADESKTOP_MORE_GROUP_ALIAS,
      sourceSection: s.alias,
      confidence: 'uncertified',
    });
  }

  return apps;
}
