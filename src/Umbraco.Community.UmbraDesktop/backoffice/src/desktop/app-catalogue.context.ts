import type {
  UmbraDesktopApp,
  UmbraDesktopCatalogue,
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
import { UmbraDesktopConditionGateController } from './condition-gate.controller.js';
import type { UmbraDesktopConditionConfig } from './condition-gate';
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
  /**
   * Dynamic conditions. Two consumers: `#dashboardSectionAlias` reads the section-alias one
   * structurally, and the condition gate instantiates whichever of the rest the entry opted into.
   */
  conditions?: Array<UmbraDesktopConditionConfig & { match?: string }>;
  /** The manifest meta fields this adapter reads. */
  meta?: { label?: string; pathname?: string; entityType?: string; icon?: string };
}

/** The registry surface this adapter uses — the three observable lookups (`byType`, `byAlias`, `byTypeAndAliases`), nothing more. */
type UmbraDesktopExtensionRegistry = Pick<
  typeof umbExtensionsRegistry,
  'byType' | 'byAlias' | 'byTypeAndAliases'
>;

/**
 * How long the registry must stay quiet before a still-unresolved entry is reported. Long
 * enough for every package bundle to have imported, so a `ref` that is merely slow is not
 * mistaken for a misconfigured one.
 */
const DIAGNOSTIC_DELAY_MS = 5000;

/** Dependency overrides. All default to the real thing; tests inject their own. */
export interface UmbraDesktopAppCatalogueOptions {
  /** The curated catalogue to resolve. Defaults to the shipped catalogue. */
  catalogue?: UmbraDesktopCatalogue;
  /** The extension registry to resolve against. Defaults to the backoffice registry. */
  registry?: UmbraDesktopExtensionRegistry;
  /** Registry-quiet window before diagnostics are reported. Defaults to {@link DIAGNOSTIC_DELAY_MS}. */
  diagnosticDelayMs?: number;
}

/**
 * Resolves the curated catalogue against the current install: reads the user's
 * permitted sections, infers each entry's URL from the registry, then derives and
 * groups the app list. Impure glue around the pure `deriveApps` / `groupApps`
 * (design §6). Provided by the desktop element so it is scoped to the desktop subtree.
 *
 * Every input is *observed*, never sampled. Registry contents arrive asynchronously and out of
 * order: Umbraco registers each package's `bundle` declaration in one batch, but then imports
 * every bundle as its own dynamic module, so an entry's `ref` may still be unregistered when the
 * desktop mounts — reliably so when the browser loads straight into the desktop section (an F5,
 * a bookmark), because the current user, and therefore this context, is ready long before
 * third-party bundles finish. Sampling once left such an app missing for the rest of the session,
 * silently, since nothing warns about an absent package. Observing makes the list self-healing:
 * an app appears the moment its package registers.
 */
export class UmbraDesktopAppCatalogueContext extends UmbContextBase {
  #apps = new UmbArrayState<UmbraDesktopApp>([], (a) => a.alias);
  /** Flat list of launchable apps for the current user. */
  public readonly apps = this.#apps.asObservable();

  #groups = new UmbArrayState<UmbraDesktopLauncherGroup>([], (g) => g.group.alias);
  /** Grouped display list for the launcher. */
  public readonly groups = this.#groups.asObservable();

  /** The catalogue being resolved. */
  #catalogue: UmbraDesktopCatalogue;

  /** The registry being resolved against. */
  #registry: UmbraDesktopExtensionRegistry;

  /** Sections the current user may access, resolved to {alias, label, pathname}. */
  #sections: UmbraDesktopSectionInfo[] = [];

  /** Every registered `section` manifest, kept current by observation. */
  #registeredSections: ReadonlyArray<ReferencedManifest> = [];

  /** Section aliases the current user may access, kept current by observation. */
  #allowedSections: ReadonlyArray<string> = [];

  /** The manifest behind each catalogue `ref`, kept current by observation (absent = not registered). */
  #manifests = new Map<string, ReferencedManifest | undefined>();

  /** Registry-quiet window before diagnostics are reported. */
  #diagnosticDelayMs: number;

  /** Diagnostics from the latest recompute, keyed by entry + reason, awaiting the quiet window. */
  #pendingDiagnostics = new Map<string, string>();

  /** Diagnostics already reported, so a later recompute does not repeat them. */
  #reportedDiagnostics = new Set<string>();

  /** Answers the conditions catalogue entries opted into (see `condition-gate.controller.ts`). */
  #conditionGate: UmbraDesktopConditionGateController;

  /** Timer for the pending diagnostic flush, if one is scheduled. */
  #diagnosticTimer?: number;

  /**
   * @param host The controller host (the desktop element) this context is scoped to.
   * @param options Dependency overrides (catalogue / registry / diagnostic delay); all default
   *   to the real thing.
   */
  constructor(host: UmbControllerHost, options: UmbraDesktopAppCatalogueOptions = {}) {
    super(host, UMBRADESKTOP_APP_CATALOGUE_CONTEXT);
    this.#catalogue = options.catalogue ?? catalogue;
    this.#registry = options.registry ?? umbExtensionsRegistry;
    this.#diagnosticDelayMs = options.diagnosticDelayMs ?? DIAGNOSTIC_DELAY_MS;
    this.#validateCatalogue();

    // A verdict change calls back in to recompute, which is why `track` no-ops on an unchanged
    // condition set: without that, every recompute would rebuild the conditions and recompute again.
    this.#conditionGate = new UmbraDesktopConditionGateController(host, this.#registry, () =>
      this.#recompute(),
    );

    this.observe(
      this.#registry.byType('section'),
      (sections) => {
        this.#registeredSections = (sections ?? []) as ReadonlyArray<ReferencedManifest>;
        this.#recompute();
      },
      'observeRegisteredSections',
    );

    // One observation per distinct `ref`. Each needs its own controller alias: `observe` otherwise
    // derives one from the callback's source, which is identical on every iteration, so each
    // observation would evict the previous one. `byAlias` also kind-merges the manifest, which the
    // former `getByAlias` snapshot did not — so a menu item's `kind` now resolves correctly.
    for (const ref of this.#refs()) {
      this.observe(
        this.#registry.byAlias(ref),
        (manifest) => {
          this.#manifests.set(ref, manifest as ReferencedManifest | undefined);
          this.#recompute();
        },
        `observeRef:${ref}`,
      );
    }

    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (currentUser) => {
      if (!currentUser) return;
      this.observe(
        currentUser.allowedSections,
        (allowed) => {
          this.#allowedSections = allowed ?? [];
          this.#recompute();
        },
        'observeAllowedSections',
      );
    });
  }

  /**
   * Cancels any pending diagnostic flush and releases the condition gate, along with the
   * controller's own teardown.
   *
   * The gate is destroyed here because this context constructs it, and nothing else can: the gate
   * registers against the *host element*, not against this context, so `super.destroy()` leaves
   * its condition apis and registry observation running on an otherwise unreachable object. That
   * is also what makes cancelling the timer stick. The gate's callback is `#recompute`, which
   * reaches `#scheduleDiagnostics` and can `window.setTimeout` a fresh warning, so a gate left
   * alive would re-arm the very timer this override just cancelled. `destroy()` is idempotent
   * (`UmbClassMixin.destroy` guards on `_host` and nulls it, and `removeUmbController` finds no
   * index on a second pass), so destroying the gate twice is safe.
   */
  override destroy(): void {
    if (this.#diagnosticTimer !== undefined) window.clearTimeout(this.#diagnosticTimer);
    this.#diagnosticTimer = undefined;
    this.#conditionGate.destroy();
    super.destroy();
  }

  /**
   * Record a diagnostic for the current recompute. Nothing is logged yet: an entry whose `ref`
   * has not registered is indistinguishable from one whose package is still importing, and
   * recompute now runs on every registry change — logging inline would both cry wolf during
   * boot and repeat itself dozens of times.
   * @param key Identifies the diagnostic (entry alias + reason).
   * @param message The message to log if the condition survives the quiet window.
   */
  #diagnose(key: string, message: string): void {
    if (this.#reportedDiagnostics.has(key)) return;
    this.#pendingDiagnostics.set(key, message);
  }

  /**
   * (Re)start the quiet window. Each recompute rebuilds the pending set from scratch, so a
   * condition resolved by a late registration simply drops out before the flush runs; what is
   * left when the registry finally goes quiet is a genuine misconfiguration.
   */
  #scheduleDiagnostics(): void {
    if (this.#diagnosticTimer !== undefined) window.clearTimeout(this.#diagnosticTimer);
    if (this.#pendingDiagnostics.size === 0) {
      this.#diagnosticTimer = undefined;
      return;
    }
    this.#diagnosticTimer = window.setTimeout(() => {
      this.#diagnosticTimer = undefined;
      for (const [key, message] of this.#pendingDiagnostics) {
        this.#reportedDiagnostics.add(key);
        console.warn(message);
      }
      this.#pendingDiagnostics.clear();
    }, this.#diagnosticDelayMs);
  }

  /** The distinct `ref` aliases the catalogue points at. */
  #refs(): string[] {
    const refs = this.#catalogue.entries.map((e) => e.ref).filter((ref): ref is string => !!ref);
    return [...new Set(refs)];
  }

  /**
   * Dev diagnostic: warn about catalogue entries whose display placement references
   * a group that isn't defined, so a contributor's typo doesn't make an app silently
   * misplace in the launcher (it still shows — falling into "More" — just not where intended).
   *
   * Also warns about an entry that names both `url` and `evaluateConditions`: `#resolveEntry`'s
   * `url` branch returns before the gate is ever consulted, so the conditions would silently never
   * be evaluated. Not reachable in the shipped catalogue today (no `url` entry names conditions),
   * but nothing stops a future one from making that mistake, and the wrong direction — an entry
   * that should be gated but never is — is exactly the kind of thing this validation exists to
   * catch before it ships silently.
   */
  #validateCatalogue(): void {
    const known = new Set(this.#catalogue.groups.map((g) => g.alias));
    for (const entry of this.#catalogue.entries) {
      if (entry.group && !known.has(entry.group)) {
        console.warn(
          `[UmbraDesktop] Catalogue entry "${entry.alias}" references unknown group "${entry.group}"; it will fall into "More".`,
        );
      }
      if (entry.url && entry.evaluateConditions?.length) {
        console.warn(
          `[UmbraDesktop] Catalogue entry "${entry.alias}" has both "url" and "evaluateConditions"; ` +
            `the explicit "url" bypasses registry resolution, so its conditions will never be evaluated.`,
        );
      }
    }
  }

  /** The observed section manifests, filtered to the ones the current user may access. */
  #resolveSections(): UmbraDesktopSectionInfo[] {
    const allowed = new Set(this.#allowedSections);
    return this.#registeredSections
      .filter((s) => allowed.has(s.alias))
      .map((s) => ({
        alias: s.alias,
        label: s.meta?.label ?? s.name ?? s.alias,
        pathname: s.meta?.pathname ?? '',
      }));
  }

  /** Re-resolve the catalogue and publish the derived + grouped apps. */
  #recompute(): void {
    this.#pendingDiagnostics.clear();
    this.#sections = this.#resolveSections();
    const resolved = this.#catalogue.entries.map((e) => this.#resolveEntry(e));
    const apps = deriveApps(resolved, this.#sections, this.#catalogue.excludedSections);
    this.#apps.setValue(apps);
    this.#groups.setValue(groupApps(apps, this.#catalogue.groups));
    this.#scheduleDiagnostics();
  }

  /** Resolve one catalogue entry to a concrete URL + gate + inherited presentation. */
  #resolveEntry(entry: UmbraDesktopCatalogueEntry): UmbraDesktopResolvedEntry {
    // Explicit-URL entry: the gate is the stated section.
    if (entry.url) {
      if (!entry.section) {
        this.#diagnose(
          `ungated:${entry.alias}`,
          `[UmbraDesktop] Catalogue entry "${entry.alias}" has a "url" but no "section" gate, so it will never appear. Add "section".`,
        );
      }
      return { entry, url: entry.url, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    if (!entry.ref) {
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    const manifest = this.#manifests.get(entry.ref);
    if (!manifest) {
      // Any entry may point at a package this install does not have — and even a core `ref` can be
      // unregistered by another package — so an absent manifest is the normal case rather than a
      // misconfiguration. It is also the transient case while a package's bundle is still
      // importing; this ref's observation recomputes when it registers.
      // A mistyped `ref` therefore says nothing here — it surfaces as a missing tile, which is
      // where a typo gets noticed. What a missing tile does *not* explain is a ref that resolves
      // but yields no URL, and the `unresolved` diagnostic below still covers that.
      // The entry may have been tracked under a manifest that has since been unregistered (a
      // package replacing a core extension does this); forget it here so its condition apis don't
      // keep calling back for an entry that can no longer show anyway.
      this.#conditionGate.forget(entry.alias);
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    // Tell the gate about this manifest's conditions, then read its verdict. `track` is a no-op
    // unless the evaluated set changed, so this does not re-enter the recompute it runs inside.
    this.#conditionGate.track(entry.alias, entry.evaluateConditions, manifest.conditions);
    if (!this.#conditionGate.permits(entry.alias)) {
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
      this.#diagnose(
        `unresolved:${entry.alias}`,
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
