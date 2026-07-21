import type {
  UmbraDesktopApp,
  UmbraDesktopCatalogueEntry,
  UmbraDesktopLauncherCategory,
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

/** Condition alias that scopes a dashboard (and similar) to a section. */
const SECTION_ALIAS_CONDITION = 'Umb.Condition.SectionAlias';

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

  #tree = new UmbArrayState<UmbraDesktopLauncherCategory>([], (c) => c.category.alias);
  /** Grouped display tree for the launcher. */
  public readonly tree = this.#tree.asObservable();

  /** Sections the current user may access, resolved to {alias, label, pathname}. */
  #sections: UmbraDesktopSectionInfo[] = [];

  /**
   * @param host The controller host (the desktop element) this context is scoped to.
   */
  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_APP_CATALOGUE_CONTEXT);
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (currentUser) => {
      if (!currentUser) return;
      this.observe(currentUser.allowedSections, (allowed) => {
        this.#sections = this.#resolveSections(allowed ?? []);
        this.#recompute();
      });
    });
  }

  /** Registered sections filtered to the ones the user may access. */
  #resolveSections(allowedAliases: ReadonlyArray<string>): UmbraDesktopSectionInfo[] {
    const allowed = new Set(allowedAliases);
    // Snapshot of registered sections (kind-merged); sections exist by desktop-mount time.
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
    const apps = deriveApps(resolved, this.#sections);
    this.#apps.setValue(apps);
    this.#tree.setValue(groupApps(apps, catalogue.categories, catalogue.groups));
  }

  /** Resolve one catalogue entry to a concrete URL + gate + inherited presentation. */
  #resolveEntry(entry: UmbraDesktopCatalogueEntry): UmbraDesktopResolvedEntry {
    // Explicit-URL entry: the gate is the stated section.
    if (entry.url) {
      return { entry, url: entry.url, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    if (!entry.ref) {
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    const manifest = umbExtensionsRegistry.getByAlias(entry.ref) as
      | { type: string; alias: string; kind?: string; name?: string; conditions?: Array<{ alias: string; match?: string }>; meta?: Record<string, unknown> }
      | undefined;
    if (!manifest) {
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    const described = this.#describe(manifest, entry);
    return {
      entry,
      url: described.ref ? inferUrl(described.ref) : null,
      gateSectionAlias: described.gateSectionAlias,
      isSectionRoot: described.isSectionRoot,
      inheritedName: (manifest.meta?.label as string | undefined) ?? manifest.name,
      inheritedIcon: manifest.meta?.icon as string | undefined,
    };
  }

  /** Build a RefDescriptor + gate/root flags from a referenced manifest. */
  #describe(
    manifest: { type: string; alias: string; kind?: string; conditions?: Array<{ alias: string; match?: string }>; meta?: Record<string, unknown> },
    entry: UmbraDesktopCatalogueEntry,
  ): { ref: UmbraDesktopRefDescriptor | null; gateSectionAlias: string | null; isSectionRoot: boolean } {
    switch (manifest.type) {
      case 'section':
        return {
          ref: { type: 'section', pathname: manifest.meta?.pathname as string | undefined },
          gateSectionAlias: manifest.alias,
          isSectionRoot: true,
        };
      case 'dashboard': {
        const sectionAlias = entry.section ?? this.#dashboardSectionAlias(manifest);
        return {
          ref: {
            type: 'dashboard',
            pathname: manifest.meta?.pathname as string | undefined,
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
            entityType: manifest.meta?.entityType as string | undefined,
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
  #dashboardSectionAlias(manifest: { conditions?: Array<{ alias: string; match?: string }> }): string | null {
    const condition = (manifest.conditions ?? []).find((c) => c.alias === SECTION_ALIAS_CONDITION);
    return condition?.match ?? null;
  }
}

export default UmbraDesktopAppCatalogueContext;
