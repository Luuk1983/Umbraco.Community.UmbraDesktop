import type {
  UmbraDesktopApp,
  UmbraDesktopRegisteredApp,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';
import { inferUrl } from './url-inference';
import {
  UMBRADESKTOP_DEFAULT_ICON,
  UMBRADESKTOP_FALLBACK_ALIAS_PREFIX,
  UMBRADESKTOP_MORE_GROUP_ALIAS,
} from './constants';

/**
 * Turn resolved catalogue entries, registered app manifests and the current user's permitted
 * sections into the flat, tagged app list. Certified catalogue entries first (gate-filtered), then
 * registered apps (ungated), then an uncertified `full-section` fallback for every permitted
 * section not already represented by a section-root entry. Pure — see design §5.2.
 * @param resolved Catalogue entries the adapter has resolved to URL + gate + presentation.
 * @param permittedSections Sections the current user may access.
 * @param excludedSections Section aliases that must never produce an automatic fallback app.
 * @param registered Self-contained apps whose manifests are registered and condition-permitted.
 * @returns The flat list of launchable apps, each tagged with confidence + placement.
 */
export function deriveApps(
  resolved: ReadonlyArray<UmbraDesktopResolvedEntry>,
  permittedSections: ReadonlyArray<UmbraDesktopSectionInfo>,
  excludedSections: ReadonlyArray<string> = [],
  registered: ReadonlyArray<UmbraDesktopRegisteredApp> = [],
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
      icon: e.icon ?? r.inheritedIcon ?? UMBRADESKTOP_DEFAULT_ICON,
      content: { kind: 'iframe', url: r.url },
      chromeProfile: e.chromeProfile ?? 'full-section',
      defaultSize: e.defaultSize,
      minSize: e.minSize,
      allowMultiple: e.allowMultiple,
      resizable: e.resizable,
      weight: e.weight,
      group: e.group,
      sourceSection: r.gateSectionAlias ?? undefined,
      confidence: 'certified',
      // Only on a section's own app, and absent rather than `undefined` everywhere else, so an app
      // either covers a section or does not carry the field at all (design D15). Only the first such
      // app per section: a package tile for a section we already have (design D7) shows beside ours,
      // and two apps covering one section would both read as pinned through one fallback pin while
      // Favourites listed just one of them.
      ...(r.isSectionRoot && !coveredSections.has(r.gateSectionAlias) ? { coversSection: r.gateSectionAlias } : {}),
    });
    if (r.isSectionRoot) coveredSections.add(r.gateSectionAlias);
  }

  // Registered apps. No gate: a self-contained app has no backing section to be permitted to, and
  // Umbraco has already evaluated its manifest conditions before it reaches here. Tagged
  // `certified` because that tier means "this will work", and an element in a box cannot get a
  // deep link or a chrome profile wrong (the two things certification is about).
  for (const app of registered) {
    apps.push({
      alias: app.alias,
      name: app.name,
      icon: app.icon,
      content: { kind: 'element', element: app.element },
      // Nothing on the element path reads this, but the field is required and `bare` is the honest
      // value: there is no backoffice chrome here to keep.
      chromeProfile: 'bare',
      defaultSize: app.defaultSize,
      minSize: app.minSize,
      allowMultiple: app.allowMultiple,
      resizable: app.resizable,
      opensSettings: app.opensSettings,
      weight: app.weight,
      group: app.group,
      confidence: 'certified',
    });
  }

  // Uncertified section fallback.
  for (const s of permittedSections) {
    if (coveredSections.has(s.alias)) continue;
    if (excluded.has(s.alias)) continue;
    const url = inferUrl({ type: 'section', pathname: s.pathname });
    if (!url) continue;
    apps.push({
      alias: `${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}${s.alias}`,
      name: s.label,
      icon: UMBRADESKTOP_DEFAULT_ICON,
      content: { kind: 'iframe', url },
      chromeProfile: 'full-section',
      group: UMBRADESKTOP_MORE_GROUP_ALIAS,
      sourceSection: s.alias,
      confidence: 'uncertified',
    });
  }

  return apps;
}
