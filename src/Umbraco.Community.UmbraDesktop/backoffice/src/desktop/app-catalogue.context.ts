import type {
  UmbraDesktopApp,
  UmbraDesktopCatalogueEntry,
  UmbraDesktopLauncherGroup,
  UmbraDesktopRefDescriptor,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';
import { catalogue } from './catalogue/index.js';
import { inferUrl } from './url-inference.js';
import { deriveApps } from './derive-apps.js';
import { groupApps } from './group-apps.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from './app-catalogue.context-token.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_SECTION_ALIAS_CONDITION_ALIAS } from '@umbraco-cms/backoffice/section';

/** The subset of a referenced manifest this adapter reads. */
interface ReferencedManifest {
  /** The manifest's extension type (section / dashboard / menuItem / …). */
  type: string;
  /** The manifest alias. */
  alias: string;
  /** Menu-item kind, if any. */
  kind?: string;
  /** Manifest display name (fallback for the app title). */
  name?: string;
  /** Dynamic conditions (used to find a dashboard's owning section). */
  conditions?: Array<{ alias: string; match?: string }>;
  /** The manifest meta fields this adapter reads. */
  meta?: { label?: string; pathname?: string; entityType?: string; icon?: string };
}

/**
 * Resolves the curated catalogue against the current install: reads the user's
 * permitted sections, infers each entry's URL from the registry, then derives and
 * groups the app list. Impure glue around the pure `deriveApps` / `groupApps`
 * (design §6). Provided by the desktop element so it is scoped to the desktop subtree.
 */
export class UmbraDesktopAppCatalogueContext extends UmbContextBase {
  #apps = new UmbArrayState<UmbraDesktopApp>([], (a) => a.alias);
  /** Flat list of launchable apps for the current user. */
  public readonly apps = this.#apps.asObservable();

  #groups = new UmbArrayState<UmbraDesktopLauncherGroup>([], (g) => g.group.alias);
  /** Grouped display list for the launcher. */
  public readonly groups = this.#groups.asObservable();

  /** Sections the current user may access, resolved to {alias, label, pathname}. */
  #sections: UmbraDesktopSectionInfo[] = [];

  /**
   * @param host The controller host (the desktop element) this context is scoped to.
   */
  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_APP_CATALOGUE_CONTEXT);
    this.#validateCatalogue();
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (currentUser) => {
      if (!currentUser) return;
      this.observe(currentUser.allowedSections, (allowed) => {
        this.#sections = this.#resolveSections(allowed ?? []);
        this.#recompute();
      });
    });
  }

  /**
   * Dev diagnostic: warn about catalogue entries whose display placement references
   * a group that isn't defined, so a contributor's typo doesn't make an app silently
   * misplace in the launcher (it still shows — falling into "More" — just not where intended).
   */
  #validateCatalogue(): void {
    const known = new Set(catalogue.groups.map((g) => g.alias));
    for (const entry of catalogue.entries) {
      if (entry.group && !known.has(entry.group)) {
        console.warn(
          `[UmbraDesktop] Catalogue entry "${entry.alias}" references unknown group "${entry.group}"; it will fall into "More".`,
        );
      }
    }
  }

  /** Registered sections filtered to the ones the user may access. */
  #resolveSections(allowedAliases: ReadonlyArray<string>): UmbraDesktopSectionInfo[] {
    const allowed = new Set(allowedAliases);
    // Snapshot of registered sections (kind-merged). Sections are registered at boot, well before
    // the desktop mounts, so a snapshot is sufficient; a section registered AFTER mount is only
    // picked up when allowedSections next emits (accepted limitation — see design §6).
    const sections = umbExtensionsRegistry.getByType('section') as Array<{
      alias: string;
      name?: string;
      meta?: { label?: string; pathname?: string };
    }>;
    return sections
      .filter((s) => allowed.has(s.alias))
      .map((s) => ({
        alias: s.alias,
        label: s.meta?.label ?? s.name ?? s.alias,
        pathname: s.meta?.pathname ?? '',
      }));
  }

  /** Re-resolve the catalogue and publish the derived + grouped apps. */
  #recompute(): void {
    const resolved = catalogue.entries.map((e) => this.#resolveEntry(e));
    const apps = deriveApps(resolved, this.#sections, catalogue.excludedSections);
    this.#apps.setValue(apps);
    this.#groups.setValue(groupApps(apps, catalogue.groups));
  }

  /** Resolve one catalogue entry to a concrete URL + gate + inherited presentation. */
  #resolveEntry(entry: UmbraDesktopCatalogueEntry): UmbraDesktopResolvedEntry {
    // Explicit-URL entry: the gate is the stated section.
    if (entry.url) {
      if (!entry.section) {
        console.warn(
          `[UmbraDesktop] Catalogue entry "${entry.alias}" has a "url" but no "section" gate, so it will never appear. Add "section".`,
        );
      }
      return { entry, url: entry.url, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    if (!entry.ref) {
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    const manifest = umbExtensionsRegistry.getByAlias(entry.ref) as ReferencedManifest | undefined;
    if (!manifest) {
      // An `optional` entry references a package that need not be installed (uSync, …), so an
      // absent manifest is the expected case there — drop the app without the noise.
      if (!entry.optional) {
        console.warn(`[UmbraDesktop] Catalogue entry "${entry.alias}" references unknown extension "${entry.ref}".`);
      }
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    const described = this.#describe(manifest, entry);
    const url = described.ref ? inferUrl(described.ref) : null;
    // A null URL is expected when the entry is gated out (its owning section isn't
    // permitted for this user); only warn when the entry IS relevant but still
    // failed to resolve — a genuine misconfiguration (e.g. an unsupported ref kind).
    const gatePermitted =
      !described.gateSectionAlias ||
      this.#sections.some((s) => s.alias === described.gateSectionAlias);
    if (!url && gatePermitted) {
      console.warn(
        `[UmbraDesktop] Catalogue entry "${entry.alias}" (ref "${entry.ref}", type "${manifest.type}") is permitted but could not be resolved to a URL — it may need an explicit "url".`,
      );
    }
    return {
      entry,
      url,
      gateSectionAlias: described.gateSectionAlias,
      isSectionRoot: described.isSectionRoot,
      inheritedName: manifest.meta?.label ?? manifest.name,
      inheritedIcon: manifest.meta?.icon,
    };
  }

  /** Build a RefDescriptor + gate/root flags from a referenced manifest. */
  #describe(
    manifest: ReferencedManifest,
    entry: UmbraDesktopCatalogueEntry,
  ): { ref: UmbraDesktopRefDescriptor | null; gateSectionAlias: string | null; isSectionRoot: boolean } {
    switch (manifest.type) {
      case 'section':
        return {
          ref: { type: 'section', pathname: manifest.meta?.pathname },
          gateSectionAlias: manifest.alias,
          isSectionRoot: true,
        };
      case 'dashboard': {
        const sectionAlias = entry.section ?? this.#dashboardSectionAlias(manifest);
        return {
          ref: {
            type: 'dashboard',
            pathname: manifest.meta?.pathname,
            sectionPathname: this.#pathnameOf(sectionAlias),
          },
          gateSectionAlias: sectionAlias,
          isSectionRoot: false,
        };
      }
      case 'menuItem':
        return {
          ref: {
            type: 'menuItem',
            kind: manifest.kind,
            entityType: manifest.meta?.entityType,
            sectionPathname: this.#pathnameOf(entry.section ?? null),
          },
          gateSectionAlias: entry.section ?? null,
          isSectionRoot: false,
        };
      default:
        return { ref: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
  }

  /** Pathname of a permitted section alias, or undefined. */
  #pathnameOf(sectionAlias: string | null): string | undefined {
    if (!sectionAlias) return undefined;
    return this.#sections.find((s) => s.alias === sectionAlias)?.pathname;
  }

  /** The section a dashboard is scoped to, read from its section-alias condition. */
  #dashboardSectionAlias(manifest: Pick<ReferencedManifest, 'conditions'>): string | null {
    const condition = (manifest.conditions ?? []).find((c) => c.alias === UMB_SECTION_ALIAS_CONDITION_ALIAS);
    return condition?.match ?? null;
  }
}

export default UmbraDesktopAppCatalogueContext;
