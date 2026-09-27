import type { UmbraDesktopPackageEntry, UmbraDesktopPackageGroup } from './catalogue.extension';
import type { UmbraDesktopPackageCatalogue } from './package-catalogues';
import type { UmbraDesktopCatalogue, UmbraDesktopCatalogueEntry, UmbraDesktopCatalogueReport, UmbraDesktopGroup } from './types';

/** A registered `umbraDesktopApp`'s claim on an alias in the shared entry namespace. */
export interface UmbraDesktopAppClaim {
  /** The app's alias, which is its manifest alias. */
  alias: string;
  /** The manifest's root weight, on Umbraco's higher-first scale; 0 when unset. */
  manifestWeight: number;
}

/** What {@link mergeCatalogues} is given. */
export interface UmbraDesktopMergeInput {
  /** The desktop's own curated catalogue. */
  curated: UmbraDesktopCatalogue;
  /** The validated package catalogues currently in effect, in any order. */
  packages: ReadonlyArray<UmbraDesktopPackageCatalogue>;
  /** The registered apps that survived normalisation, as claims on their aliases. */
  apps: ReadonlyArray<UmbraDesktopAppClaim>;
}

/** What {@link mergeCatalogues} answers. */
export interface UmbraDesktopMergedCatalogue {
  /** The curated catalogue with every package definition applied, in the fixed order of design §4. */
  catalogue: UmbraDesktopCatalogue;
  /** Which package catalogue each package-defined entry came from, for naming it in diagnostics. */
  entrySources: ReadonlyMap<string, string>;
  /** Aliases of registered apps that lost to a package entry, which derivation must not emit. */
  droppedApps: ReadonlySet<string>;
  /** Clashes between packages, replacements that changed something, and the same-screen hint. */
  reports: UmbraDesktopCatalogueReport[];
}

/** One definition competing for an alias in the shared entry namespace. */
type Claim =
  | { kind: 'entry'; alias: string; source: string; weight: number; entry: UmbraDesktopPackageEntry }
  | { kind: 'app'; alias: string; source: string; weight: number };

/**
 * Order by precedence: higher manifest weight first, then the lower manifest alias, compared
 * ordinally so the answer is the same in every browser and every locale (design D6). Stable, so
 * one package's own items keep their order.
 * @param a One source.
 * @param b The other.
 * @returns A sort comparison.
 */
function byPrecedence(a: { weight: number; source: string }, b: { weight: number; source: string }): number {
  if (a.weight !== b.weight) return b.weight - a.weight;
  return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
}

/**
 * Where an entry actually goes. `url` wins over `ref` because `#resolveEntry` checks it first.
 * @param entry The entry.
 * @returns Its effective destination.
 */
function destination(entry: UmbraDesktopCatalogueEntry): string | undefined {
  return entry.url ?? entry.ref;
}

/**
 * Whether two entries open the same thing, which is what makes a replacement like-for-like (D13).
 * @param a One entry.
 * @param b The other.
 * @returns True when both go to the same destination.
 */
function sameTarget(a: UmbraDesktopCatalogueEntry, b: UmbraDesktopCatalogueEntry): boolean {
  const target = destination(a);
  return target !== undefined && target === destination(b);
}

/**
 * What an entry opens, in words, for a report.
 * @param entry The entry, or `undefined` for a registered app.
 * @returns A phrase such as `ref "Umb.Section.Settings"`.
 */
function describe(entry: UmbraDesktopCatalogueEntry | undefined): string {
  if (!entry) return 'a self-contained app';
  return entry.url ? `url "${entry.url}"` : `ref "${entry.ref}"`;
}

/**
 * A group's weight, in words, for a report: a group may arrive with none, and "moving it to
 * undefined" says nothing a reader can act on.
 * @param weight The group's weight, if it has one.
 * @returns A phrase such as `weight 60`, or `no weight`.
 */
function weightOf(weight: number | undefined): string {
  return weight === undefined ? 'no weight' : `weight ${weight}`;
}

/**
 * Apply every package catalogue in effect, and every registered app, over the curated catalogue
 * (design §4). Pure: the reports are returned, never printed.
 *
 * Groups and entries are separate namespaces, as they always were. Entries and registered apps share
 * one, because an alias is what a pin is stored under and one alias must mean one app. Within each
 * namespace the first definition in precedence order wins; a later one that disagrees is reported.
 * A package definition replaces ours whole (D3), silently only when it is like-for-like (D13).
 * @param input The curated catalogue, the package catalogues and the app claims.
 * @returns The merged catalogue, where each package entry came from, the apps that lost, the reports.
 */
export function mergeCatalogues({ curated, packages, apps }: UmbraDesktopMergeInput): UmbraDesktopMergedCatalogue {
  const reports: UmbraDesktopCatalogueReport[] = [];
  const ordered = [...packages].sort((a, b) =>
    byPrecedence({ weight: a.manifestWeight, source: a.manifestAlias }, { weight: b.manifestWeight, source: b.manifestAlias }),
  );

  const packageGroups = new Map<string, { group: UmbraDesktopPackageGroup; source: string }>();
  for (const pkg of ordered) {
    for (const group of pkg.groups) {
      const winner = packageGroups.get(group.alias);
      if (!winner) {
        packageGroups.set(group.alias, { group, source: pkg.manifestAlias });
      } else if (winner.group.weight !== group.weight) {
        reports.push({
          key: `merge:group-clash:${group.alias}:${pkg.manifestAlias}`,
          message: `[UmbraDesktop] Catalogues "${winner.source}" and "${pkg.manifestAlias}" both define launcher group "${group.alias}", at ${weightOf(winner.group.weight)} and ${weightOf(group.weight)}; "${winner.source}"'s is used. Give them the same weight, or rename one.`,
        });
      }
    }
  }

  const claims: Claim[] = [
    ...ordered.flatMap((pkg) =>
      pkg.entries.map((entry): Claim => ({ kind: 'entry', alias: entry.alias, source: pkg.manifestAlias, weight: pkg.manifestWeight, entry })),
    ),
    ...apps.map((app): Claim => ({ kind: 'app', alias: app.alias, source: app.alias, weight: app.manifestWeight })),
  ].sort(byPrecedence);

  const winners = new Map<string, Claim>();
  const droppedApps = new Set<string>();
  for (const claim of claims) {
    const winner = winners.get(claim.alias);
    if (!winner) {
      winners.set(claim.alias, claim);
      continue;
    }
    if (claim.kind === 'app') droppedApps.add(claim.alias);
    const agree = winner.kind === 'entry' && claim.kind === 'entry' && sameTarget(winner.entry, claim.entry);
    if (!agree) {
      reports.push({
        key: `merge:entry-clash:${claim.alias}:${claim.source}`,
        message: `[UmbraDesktop] "${winner.source}" and "${claim.source}" both define the app "${claim.alias}", opening ${describe(winner.kind === 'entry' ? winner.entry : undefined)} and ${describe(claim.kind === 'entry' ? claim.entry : undefined)}; "${winner.source}"'s is used, because its manifest has the higher weight or sorts first. Rename one of them.`,
      });
    }
  }

  const entries: UmbraDesktopCatalogueEntry[] = [];
  const entrySources = new Map<string, string>();
  for (const entry of curated.entries) {
    const winner = winners.get(entry.alias);
    if (!winner) {
      entries.push(entry);
      continue;
    }
    const replacement = winner.kind === 'entry' ? winner.entry : undefined;
    if (replacement) {
      entries.push(replacement);
      entrySources.set(entry.alias, winner.source);
      if (sameTarget(entry, replacement)) continue;
    }
    reports.push({
      key: `merge:replaced:${entry.alias}:${winner.source}`,
      message: `[UmbraDesktop] "${winner.source}" replaces the desktop's own app "${entry.alias}", which opened ${describe(entry)}, with ${describe(replacement)}. If that is not intended, give it a namespaced alias of its own.`,
    });
  }

  const curatedAliases = new Set(curated.entries.map((entry) => entry.alias));
  const curatedByRef = new Map(
    curated.entries.filter((entry) => entry.ref !== undefined).map((entry) => [entry.ref!, entry] as const),
  );
  for (const winner of winners.values()) {
    if (winner.kind !== 'entry' || curatedAliases.has(winner.alias)) continue;
    entries.push(winner.entry);
    entrySources.set(winner.alias, winner.source);
    const twin = winner.entry.ref === undefined ? undefined : curatedByRef.get(winner.entry.ref);
    if (twin && entries.includes(twin)) reports.push(sameScreenHint(winner.source, winner.entry, twin));
  }

  const groups: UmbraDesktopGroup[] = [];
  for (const group of curated.groups) {
    const winner = packageGroups.get(group.alias);
    if (!winner) {
      groups.push(group);
      continue;
    }
    groups.push(winner.group);
    if (winner.group.weight !== group.weight) {
      reports.push({
        key: `merge:group-replaced:${group.alias}:${winner.source}`,
        message: `[UmbraDesktop] "${winner.source}" redefines the desktop's own launcher group "${group.alias}", moving it from ${weightOf(group.weight)} to ${weightOf(winner.group.weight)}. Define a group of your own instead: other packages place their groups against ours.`,
      });
    }
  }
  const curatedGroups = new Set(curated.groups.map((group) => group.alias));
  for (const [alias, winner] of packageGroups) if (!curatedGroups.has(alias)) groups.push(winner.group);

  return { catalogue: { groups, entries, excludedSections: curated.excludedSections }, entrySources, droppedApps, reports };
}

/**
 * The design D7 hint: a package entry opening a screen one of ours already opens, under another
 * alias, so both tiles show. For a core `Umb.*` screen it says only that the tile exists, because
 * inviting a package to take over a core tile is rarely what it needed to hear.
 * @param source The package catalogue.
 * @param entry The package entry.
 * @param twin Our entry for the same screen.
 * @returns The report.
 */
function sameScreenHint(source: string, entry: UmbraDesktopPackageEntry, twin: UmbraDesktopCatalogueEntry): UmbraDesktopCatalogueReport {
  const key = `merge:same-screen:${entry.alias}:${source}`;
  if (entry.ref!.startsWith('Umb.')) {
    return {
      key,
      message: `[UmbraDesktop] "${source}" entry "${entry.alias}" opens ref "${entry.ref}", which already has the desktop's own tile "${twin.alias}", so both appear.`,
    };
  }
  return {
    key,
    message: `[UmbraDesktop] "${source}" entry "${entry.alias}" opens the same screen as the desktop's own app "${twin.alias}" (ref "${entry.ref}"), so both appear. To replace ours, give your entry the alias "${twin.alias}", which also keeps users' pins; otherwise remove it.`,
  };
}
