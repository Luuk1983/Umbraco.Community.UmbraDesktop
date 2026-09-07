import type {
  UmbraDesktopApp,
  UmbraDesktopCatalogue,
  UmbraDesktopCatalogueEntry,
  UmbraDesktopLauncherGroup,
  UmbraDesktopRefDescriptor,
  UmbraDesktopRegisteredApp,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';
import type { ManifestUmbraDesktopApp } from './app.extension.js';
import { catalogue } from './catalogue/index.js';
import { inferUrl } from './url-inference.js';
import { deriveApps } from './derive-apps.js';
import { groupApps } from './group-apps.js';
import { normaliseRegisteredApps } from './registered-apps.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from './app-catalogue.context-token.js';
import { UmbraDesktopConditionGateController } from './condition-gate.controller.js';
import type { UmbraDesktopConditionConfig } from './condition-gate';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
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

/**
 * The registry this adapter resolves against: the whole thing, not a facade over it.
 *
 * It was `Pick<…, 'byType' | 'byAlias' | 'byTypeAndAliases'>` while those lookups were all this
 * file and the condition gate called, which documented its own appetite and let a test inject a
 * hand-written stub. `UmbExtensionsManifestInitializer` ends that: it takes an
 * `UmbExtensionRegistry`, that class declares `#private` fields, and a class with private fields is
 * nominal in TypeScript, so *no* structural subset of it is assignable no matter how many methods
 * the subset lists. The choice was therefore between widening here and casting at the one call
 * site, and a cast would be a lie told in the place where it is least visible: the initializer
 * really does reach past `byType`/`byAlias` into `byTypeAndAliases` (it observes each app's
 * condition manifests) and would reach further still if it were given an array of types or a
 * filter.
 *
 * `UmbraDesktopConditionGateController` keeps its own `Pick<…, 'byTypeAndAliases'>` and is handed
 * this, which satisfies it: widening the type this file passes around costs the gate nothing.
 *
 * Nothing is lost in practice. The tests already inject a real `new UmbExtensionRegistry()` rather
 * than a stub, because condition evaluation is the behaviour under test and only the real registry
 * has it, so the facade was already documenting an appetite nobody was exploiting.
 */
type UmbraDesktopExtensionRegistry = typeof umbExtensionsRegistry;

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
 * permitted sections, infers each entry's URL from the registry, collects the
 * self-contained apps packages have registered, then derives and groups the app
 * list. Impure glue around the pure `deriveApps` / `groupApps` (design §6).
 * Provided by the desktop element so it is scoped to the desktop subtree.
 *
 * Every input is *observed*, never sampled, for two reasons that arrive from different directions.
 *
 * The first is timing. Registry contents arrive asynchronously and out of order: Umbraco registers
 * each package's `bundle` declaration in one batch, but then imports every bundle as its own
 * dynamic module, so an entry's `ref` may still be unregistered when the desktop mounts — reliably
 * so when the browser loads straight into the desktop section (an F5, a bookmark), because the
 * current user, and therefore this context, is ready long before third-party bundles finish.
 * Sampling once left such an app missing for the rest of the session, silently for an `optional`
 * entry. Observing makes the list self-healing: an app appears the moment its package registers.
 *
 * The second is not about timing at all, and it is conditions. A curated entry may opt into them
 * (answered by `UmbraDesktopConditionGateController`) and a `umbraDesktopApp` manifest may carry
 * them (answered by the extension initializer below), and a condition can flip while the desktop is
 * up. Nothing else here does that. A `ref` that has registered stays registered, and a user's
 * permitted sections do not change under them mid-session, so for every other input "observe" is
 * only insurance against arriving late. For a conditioned app there is no moment at which sampling
 * would have been correct: the answer is a function of state the desktop does not own (a workspace,
 * a variant, a user permission) and is *expected* to change. Which is why the app list has to be
 * able to shrink as well as grow, and why `#recompute` rebuilds it rather than accumulating into
 * it.
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

  /**
   * Every registered `umbraDesktopApp` manifest whose conditions are currently met, kept current by
   * observation. Manifests rather than normalised apps, so the normalisation (and the drops it
   * reports) happens in one place, in `#recompute`, on the same pass as everything else.
   */
  #registeredAppManifests: ReadonlyArray<ManifestUmbraDesktopApp> = [];

  /**
   * Aliases the curated catalogue has claimed, for the collision check in `#recompute`.
   *
   * Every entry's alias, not only the entries that resolved: the rule has to be answerable without
   * knowing who is looking. Filtering against the apps that actually derived would make a package's
   * app appear for a user without the colliding entry's section and vanish for a user with it, which
   * is a support case nobody can reproduce. Reserved is reserved.
   */
  #curatedAliases: ReadonlySet<string>;

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
   * Whether this context has stopped being about a desktop anyone can see: destroyed, or its host
   * disconnected.
   *
   * It exists because a recompute can happen on the way out, and one of those arms a timer that
   * outlives the thing it is about. Two routes lead there and neither is hypothetical. Leaving the
   * desktop section calls `hostDisconnected` on every controller and destroys none of them, and the
   * extension initializer is the one input that *calls back* during that (it cancels its pending
   * frame and flushes synchronously), so the exit itself recomputes. `destroy()` is worse: the
   * initializer's own `destroy` reports an empty permitted set, and it runs from inside
   * `super.destroy()`, which is to say strictly after this class has cleared its timer, so a
   * diagnostic armed there would survive the very teardown meant to cancel it.
   *
   * Defaults to `false` and is only ever set by the lifecycle hooks, so the guard can never suppress
   * a diagnostic for a desktop nobody has left: a context that has not been disconnected or
   * destroyed behaves exactly as it did before this existed.
   */
  #stopped = false;

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
    this.#curatedAliases = new Set(this.#catalogue.entries.map((e) => e.alias));
    this.#validateCatalogue();

    // A verdict change calls back in to recompute, which is why `track` no-ops on an unchanged
    // condition set: without that, every recompute would rebuild the conditions and recompute again.
    this.#conditionGate = new UmbraDesktopConditionGateController(host, this.#registry, () =>
      this.#recompute(),
    );

    // Self-contained apps any package may register. `UmbExtensionsManifestInitializer` rather than
    // `this.observe(this.#registry.byType('umbraDesktopApp'), …)`, and that is the whole point of
    // this being seven lines instead of five: `byType` hands over raw manifests and never evaluates
    // a manifest's `conditions`, so every registered app would appear whether or not its author
    // said when it should. Condition evaluation lives in the extension-api controllers — one
    // `UmbExtensionManifestInitializer` per manifest, each computing `permitted` from the conditions
    // and calling back when that changes — and this initializer is how they are managed as a set.
    // No conditions means permitted, which is the common case here and stays free.
    //
    // Not the condition gate above, and the two are not redundant. The gate exists because a
    // *curated* entry's conditions are this repository's own data, declared beside the entry and
    // evaluated against a manifest the adapter resolved itself; there are no extension controllers
    // to lean on because the thing being gated is a catalogue row rather than a manifest. A
    // registered app is the other way round: the conditions are the author's, they live on their
    // own manifest, and the platform already has machinery that evaluates exactly that. Each side
    // uses the mechanism that fits what it is gating.
    //
    // The callback's entries are those controllers, not manifests, hence the `.manifest`. It also
    // fires again whenever any app's conditions flip, so an app can appear and disappear mid-session
    // exactly as one whose bundle registers late does; recompute handles both the same way.
    new UmbExtensionsManifestInitializer(
      this,
      this.#registry,
      'umbraDesktopApp',
      null,
      (permitted) => {
        this.#registeredAppManifests = permitted.map((controller) => controller.manifest);
        this.#recompute();
      },
      'observeRegisteredApps',
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
   * The flag is set *before* `super.destroy()`, not merely alongside the cancel: destroying the
   * controllers destroys the extension initializer, whose own `destroy` reports an empty permitted
   * set, which recomputes and would re-arm the timer this method just cancelled.
   *
   * The gate is destroyed here for the same reason from the other end, and because this context
   * constructs it and nothing else can: the gate registers against the *host element*, not against
   * this context, so `super.destroy()` would leave its condition apis and registry observation
   * running on an otherwise unreachable object. Its callback is `#recompute`, which reaches
   * `#scheduleDiagnostics` and can `window.setTimeout` a fresh warning, so a gate left alive would
   * re-arm the very timer this override just cancelled. `destroy()` is idempotent
   * (`UmbClassMixin.destroy` guards on `_host` and nulls it, and `removeUmbController` finds no
   * index on a second pass), so destroying the gate twice is safe.
   */
  override destroy(): void {
    this.#stopped = true;
    this.#cancelDiagnostics();
    this.#conditionGate.destroy();
    super.destroy();
  }

  /**
   * Stops diagnostics when the desktop leaves the DOM, which is what changing backoffice section
   * does.
   *
   * The flag goes up before `super.hostDisconnected()`, because that is what tells the extension
   * initializer to flush, and its flush recomputes. Then the cancel, for a timer armed earlier while
   * the desktop was still open.
   */
  override hostDisconnected(): void {
    this.#stopped = true;
    super.hostDisconnected();
    this.#cancelDiagnostics();
  }

  /**
   * Re-arms diagnostics when the desktop is mounted again, so the guard is a pause and not a mute.
   *
   * Nothing has to be rescheduled here: the observations unsubscribed on the way out and
   * `super.hostConnected()` re-subscribes them, so each one emits its current value and the
   * recompute that follows re-arms whatever is still wrong. A misconfiguration the user walked away
   * from is still worth a line when they walk back.
   */
  override hostConnected(): void {
    this.#stopped = false;
    super.hostConnected();
  }

  /** Drop any armed diagnostic flush, leaving the pending set for the next recompute to rebuild. */
  #cancelDiagnostics(): void {
    if (this.#diagnosticTimer !== undefined) window.clearTimeout(this.#diagnosticTimer);
    this.#diagnosticTimer = undefined;
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
   *
   * Nothing is armed once this context has stopped (see the `#stopped` field): the window is five
   * seconds long, and a desktop the user has left is a desktop nobody wants a warning about.
   */
  #scheduleDiagnostics(): void {
    this.#cancelDiagnostics();
    if (this.#stopped) return;
    if (this.#pendingDiagnostics.size === 0) return;
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
    const apps = deriveApps(
      resolved,
      this.#sections,
      this.#catalogue.excludedSections,
      this.#resolveRegisteredApps(),
    );
    this.#apps.setValue(apps);
    this.#groups.setValue(groupApps(apps, this.#catalogue.groups));
    this.#scheduleDiagnostics();
  }

  /**
   * Normalise the permitted `umbraDesktopApp` manifests, reporting what did not survive.
   *
   * Two things can cost a permitted manifest its tile, and neither is visible from anywhere else: a
   * package registered, Umbraco allowed it, and the launcher simply has no such app in it. So both
   * go through `#diagnose`, which is the register they belong in — dev-facing, console-only,
   * deduplicated, and held back until the registry stops changing so a diagnostic is never printed
   * about a state that was merely transient.
   * @returns The registered apps derivation should see.
   */
  #resolveRegisteredApps(): UmbraDesktopRegisteredApp[] {
    const { apps, dropped } = normaliseRegisteredApps(this.#registeredAppManifests);
    for (const drop of dropped) {
      this.#diagnose(
        `registered-dropped:${drop.alias}`,
        `[UmbraDesktop] Registered app "${drop.alias}" was dropped because ${drop.reason}.`,
      );
    }
    return apps.filter((app) => {
      // Registry uniqueness holds only inside the registered set, so a manifest is free to claim an
      // alias the curated catalogue already uses, and the alias is not decoration: it is the key a
      // pinned favourite is stored under, and the launcher resolves a pin with a `find` over the app
      // list. Two apps under one alias therefore means a pin that opens whichever of them
      // derivation happened to emit first. The curated entry wins because it is the one whose URL
      // and chrome profile this repository has verified, and it used to win by accident of pass
      // ordering; this makes it the decision, and tells the package, which is the half that was
      // missing. (Only catalogue aliases are checked, not derivation's synthesised
      // `section:<alias>` fallbacks: those cannot collide without a manifest deliberately aliasing
      // itself `section:…`, and a package that does that has said what it wants.)
      if (!this.#curatedAliases.has(app.alias)) return true;
      this.#diagnose(
        `registered-collision:${app.alias}`,
        `[UmbraDesktop] Registered app "${app.alias}" was dropped because a curated catalogue entry already owns that alias. Rename the manifest alias.`,
      );
      return false;
    });
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
