import type {
  UmbraDesktopApp,
  UmbraDesktopCatalogue,
  UmbraDesktopCatalogueEntry,
  UmbraDesktopGroup,
  UmbraDesktopRefDescriptor,
  UmbraDesktopRegisteredApp,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';
import type { ManifestUmbraDesktopApp } from './app.extension.js';
import { catalogue } from './catalogue/index.js';
import { inferUrl } from './url-inference.js';
import { deriveApps } from './derive-apps.js';
import { normaliseRegisteredApps } from './registered-apps.js';
import type { ManifestUmbraDesktopCatalogue } from './catalogue.extension.js';
import { normalisePackageCatalogues, type UmbraDesktopPackageCatalogue } from './package-catalogues.js';
import { mergeCatalogues, type UmbraDesktopAppClaim } from './merge-catalogues.js';
import { isFiniteNumber, isNonEmptyString, isRecord } from './manifest-values.js';
import { UMBRADESKTOP_SECTION_ALIAS } from './constants.js';
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

/**
 * A value read from another package's manifest, when it is text, or the fallback when it is not.
 *
 * Those manifests are typed by nothing once they come from a static `umbraco-package.json`, and a
 * label or name that is a number or an object would otherwise become a tile's name and reach
 * `groupApps` (design D9 of the package catalogues design).
 * @param value The value as the manifest has it.
 * @param fallback What to use instead.
 * @returns The value when it is a non-empty string, otherwise the fallback.
 */
function textOr<T>(value: unknown, fallback: T): string | T {
  return isNonEmptyString(value) ? value : fallback;
}

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
 * self-contained apps packages have registered, then derives the app list and
 * publishes it beside the merged catalogue's groups. Impure glue around the pure `deriveApps`
 * (design §6); grouping is the launcher's, over both.
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
 *
 * A third input joined the two above with package catalogues: `umbraDesktopCatalogue` manifests any
 * package may register, each carrying groups and deep links in the curated fragments' shape. They
 * are validated and merged over the curated catalogue on every recompute, the package winning on a
 * shared alias (see `merge-catalogues.ts` and the 2026-09-25 package catalogues design). Because a
 * package entry can name a ref nothing watched before, the set of watched refs follows the merged
 * catalogue rather than being fixed at construction; `#watchRefs` says how that avoids recursing.
 */
export class UmbraDesktopAppCatalogueContext extends UmbContextBase {
  #apps = new UmbArrayState<UmbraDesktopApp>([], (a) => a.alias);
  /** Flat list of launchable apps for the current user. */
  public readonly apps = this.#apps.asObservable();

  /**
   * The launchable apps right now, for a caller that wants one answer rather than a subscription.
   *
   * The same shape and the same reason as the window manager's `getWindows()`: the AI desk tools
   * answer a single question at the moment they are called, so a subscription would be state to
   * hold and release for nothing. Empty rather than absent before the first recompute, because a
   * tool can be called while the desktop is still mounting and "nothing yet" is an honest answer.
   * @returns The apps, in launcher order.
   */
  public getApps(): ReadonlyArray<UmbraDesktopApp> {
    return this.#apps.getValue();
  }

  /**
   * Whether a `ref` the merged catalogue names is registered on this install, regardless of whether
   * the current user may reach what it points at.
   *
   * The one question `apps` cannot answer. An app missing from that list has two quite different
   * causes — the package is not installed, or this user may not reach its section — and a caller
   * that has to *explain* the absence rather than merely handle it needs to tell them apart. The
   * taskbar's AI chat feature is the caller: Desktop settings lists it whether or not it can be
   * switched on, and the reason it gives sends the reader to a different colleague in each case.
   *
   * A snapshot rather than an observable, for the same reason `getApps` is one: every caller asks
   * while recomputing something that is already observing `apps`, and both are written on the same
   * pass, so a subscription would be state to hold for no extra answer. Refs the catalogue does not
   * carry are unknown here and answer false, which is the safe direction — nothing is observing
   * them, so nothing could ever make the answer true.
   *
   * A ref first named by a package catalogue is subscribed by the recompute that found it, before
   * that recompute resolves anything, so the list it emits already carries the answer. The one
   * weakening of the same-pass guarantee above is a closed desktop: nothing new is subscribed while
   * it is closed, so a ref first named then answers `false` until reopening recomputes.
   * @param ref The referenced manifest's alias.
   * @returns True when a manifest with that alias is registered.
   */
  public isRefRegistered(ref: string): boolean {
    return this.#manifests.get(ref) !== undefined;
  }

  /**
   * The `ref` of the merged catalogue's entry with this alias, if it has one.
   *
   * A package can replace one of our entries with one that points somewhere else, so a host feature
   * that needs a curated entry's ref (the taskbar's AI chat is the one today) asks here rather than
   * reading the static catalogue at module load, which would answer for an entry that no longer
   * exists.
   * @param alias The entry alias.
   * @returns Its ref, or `undefined`.
   */
  public getEntryRef(alias: string): string | undefined {
    return this.#merged.entries.find((entry) => entry.alias === alias)?.ref;
  }

  #catalogueGroups = new UmbArrayState<UmbraDesktopGroup>([], (g) => g.alias);
  /**
   * Every group in the merged catalogue, curated and package, whether or not it holds an app for
   * this user. The launcher groups the apps itself (`launcher/resolve-launcher.ts`), because it
   * needs all of these rather than only the ones holding apps: to name a group and to put a
   * returning one back in catalogue order.
   */
  public readonly catalogueGroups = this.#catalogueGroups.asObservable();

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
   * Every registered `umbraDesktopCatalogue` manifest whose conditions are currently met, kept current
   * by the second extension initializer. Manifests rather than validated catalogues, for the same
   * reason as `#registeredAppManifests`: validation, and its reports, happen once, in `#recompute`.
   */
  #packageCatalogueManifests: ReadonlyArray<ManifestUmbraDesktopCatalogue> = [];

  /**
   * The catalogue the last recompute resolved: curated, with every package definition applied.
   * Starts as the curated catalogue, so `getEntryRef` has an answer before the first recompute.
   */
  #merged: UmbraDesktopCatalogue;

  /** Which package catalogue each package-defined entry came from, for naming it in diagnostics. */
  #entrySources: ReadonlyMap<string, string> = new Map();

  /** Refs with an observation, marked before it is created (design D16). */
  #watchedRefs = new Set<string>();

  /** The entry aliases the last recompute resolved, so the gate can forget the ones that leave. */
  #entryAliases: ReadonlySet<string> = new Set();

  /**
   * While true, `#recompute` returns at once: a batch of synchronous emissions is being collected,
   * and exactly one recompute follows it. Construction, reconnection and `#watchRefs` each raise it,
   * which is what turns the forty-odd recomputes construction used to do into one (design D16).
   */
  #batching = false;

  /**
   * Whether `destroy()` has run. `#recompute` is a no-op from then on: the initializers report empty
   * lists from inside `super.destroy()`, and a recompute then would re-track entries on a gate that
   * has already been destroyed, leaving condition checks nothing tears down.
   */
  #destroyed = false;

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
    this.#merged = this.#catalogue;
    this.#validateCatalogue();

    // Everything below emits synchronously as it is set up. Collect it all, then recompute once
    // (design D16). The first recompute is also what starts watching every curated ref.
    this.#batching = true;

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

    // Package catalogues, through the same kind of initializer and for the same reason: it is the
    // route that evaluates a manifest's conditions, so a catalogue whose conditions are unmet never
    // reaches the merge and claims nothing (design D5). It also applies Umbraco's `overwrites`
    // between catalogue manifests before we see them.
    new UmbExtensionsManifestInitializer(
      this,
      this.#registry,
      'umbraDesktopCatalogue',
      null,
      (permitted) => {
        this.#packageCatalogueManifests = permitted.map((controller) => controller.manifest);
        this.#recompute();
      },
      'observePackageCatalogues',
    );

    this.observe(
      this.#registry.byType('section'),
      (sections) => {
        this.#registeredSections = (sections ?? []) as ReadonlyArray<ReferencedManifest>;
        this.#recompute();
      },
      'observeRegisteredSections',
    );

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

    this.#batching = false;
    this.#recomputeGuarded();
  }

  /**
   * `#recompute`, for the two places that call it directly rather than from an observation.
   *
   * Every other call arrives inside an RxJS subscriber or an extension initializer's callback, which
   * catch a throw and report it. These two do not: the constructor runs inside the desktop element's
   * setup, and `hostConnected` inside Umbraco's `UmbControllerHostMixin.hostConnected`, a plain
   * `forEach` over the element's controllers. A throw escaping from here stops that loop and leaves
   * every controller registered after this one, the theme styles and the server events among them,
   * disconnected. Validation (design D9) means nothing known throws; this is what keeps an unknown
   * cause from taking the rest of the desktop with it.
   */
  #recomputeGuarded(): void {
    try {
      this.#recompute();
    } catch (error) {
      console.error('[UmbraDesktop] Rebuilding the app list failed; the launcher keeps its last list.', error);
    }
  }

  /**
   * Cancels any pending diagnostic flush and releases the condition gate, along with the
   * controller's own teardown.
   *
   * The flag is set *before* `super.destroy()`, not merely alongside the cancel: destroying the
   * controllers destroys the extension initializer, whose own `destroy` reports an empty permitted
   * set, which recomputes and would re-arm the timer this method just cancelled. `#destroyed` goes
   * up first of all, so the recomputes the initializers trigger from inside `super.destroy()` do
   * nothing.
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
    this.#destroyed = true;
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
   *
   * Re-subscribing makes every observation emit at once, so the batch collects them and one
   * recompute follows, which is also where any ref that could not be watched while the desktop was
   * closed gets its observation. The batch is lowered in a `finally`: left raised by a throw, it
   * would make every later recompute a no-op, which is the frozen launcher design D9 exists to
   * prevent.
   */
  override hostConnected(): void {
    this.#stopped = false;
    this.#batching = true;
    try {
      super.hostConnected();
    } finally {
      this.#batching = false;
    }
    this.#recomputeGuarded();
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
        // Read defensively: a section manifest is any package's JSON, and a label that is not text
        // would become a fallback tile's name and reach `groupApps` (design D9).
        label: textOr(s.meta?.label, textOr(s.name, s.alias)),
        pathname: textOr(s.meta?.pathname, ''),
      }));
  }

  /** Re-merge and re-resolve the catalogue, and publish the derived and grouped apps. */
  #recompute(): void {
    if (this.#destroyed || this.#batching) return;
    this.#pendingDiagnostics.clear();
    this.#sections = this.#resolveSections();
    const registered = this.#normaliseRegisteredApps();
    const merged = mergeCatalogues({
      curated: this.#catalogue,
      packages: this.#normalisePackageCatalogues(),
      apps: this.#appClaims(registered),
    });
    for (const report of merged.reports) this.#diagnose(report.key, report.message);
    this.#merged = merged.catalogue;
    this.#entrySources = merged.entrySources;
    this.#watchRefs(merged.catalogue.entries);
    this.#forgetDepartedEntries(merged.catalogue.entries);
    const resolved = merged.catalogue.entries.map((entry) => this.#resolveEntry(entry));
    const apps = deriveApps(
      resolved,
      this.#sections,
      merged.catalogue.excludedSections,
      registered.filter((app) => !merged.droppedApps.has(app.alias)),
    );
    this.#apps.setValue(apps);
    this.#catalogueGroups.setValue(merged.catalogue.groups);
    this.#scheduleDiagnostics();
  }

  /**
   * Start watching every `ref` in these entries that nothing watches yet (design D16).
   *
   * Three rules, each for a failure that was found rather than imagined. **Mark before subscribing:**
   * `UmbObserverController` subscribes, and so emits, from inside its own constructor, before it has
   * even registered as a controller, and the callback recomputes, so a ref marked afterwards is found
   * unwatched again by that very recompute and subscribed again, until the stack overflows. **Batch
   * the callbacks:** while subscribing they only record the manifest, and the recompute that called
   * this carries on with every new manifest recorded. **Respect the lifecycle:** nothing is subscribed
   * once destroyed, where it would outlive the context, or while stopped, where an observation created
   * during `hostDisconnected` is never reached by that pass and stays live with the desktop closed.
   * Refs skipped while stopped are simply still unwatched, and the recompute after reconnecting picks
   * them up.
   *
   * A ref that later drops out of the catalogue stays watched. That saves re-subscribing when a
   * condition flips back; the cost is one registry scan per watched ref per registry change, bounded by
   * the refs any catalogue has named this session.
   * @param entries The merged catalogue's entries.
   */
  #watchRefs(entries: ReadonlyArray<UmbraDesktopCatalogueEntry>): void {
    if (this.#destroyed || this.#stopped) return;
    const fresh = [...new Set(entries.map((entry) => entry.ref))].filter(
      (ref): ref is string => !!ref && !this.#watchedRefs.has(ref),
    );
    if (fresh.length === 0) return;
    const batching = this.#batching;
    this.#batching = true;
    try {
      for (const ref of fresh) {
        this.#watchedRefs.add(ref);
        // One observation per distinct ref, each under its own controller alias: `observe` otherwise
        // derives one from the callback's source, identical on every iteration, and each would evict
        // the last. `byAlias` also kind-merges the manifest, so a menu item's `kind` resolves.
        this.observe(
          this.#registry.byAlias(ref),
          (manifest) => {
            this.#manifests.set(ref, manifest as ReferencedManifest | undefined);
            this.#recompute();
          },
          `observeRef:${ref}`,
        );
      }
    } finally {
      this.#batching = batching;
    }
  }

  /**
   * Tell the condition gate to drop every entry that has left the merged catalogue, so its condition
   * checks stop firing. Before package catalogues, an entry could only lose its ref; now it can leave
   * the catalogue altogether, and `#resolveEntry` never sees it again to forget it.
   * @param entries The merged catalogue's entries.
   */
  #forgetDepartedEntries(entries: ReadonlyArray<UmbraDesktopCatalogueEntry>): void {
    const present = new Set(entries.map((entry) => entry.alias));
    for (const alias of this.#entryAliases) if (!present.has(alias)) this.#conditionGate.forget(alias);
    this.#entryAliases = present;
  }

  /**
   * The registered apps' claims on their aliases, carrying each manifest's own root weight: the
   * normalised app's weight has already been inverted onto the launcher's scale, and the merge
   * compares manifests on Umbraco's.
   * @param registered The normalised apps.
   * @returns One claim per app.
   */
  #appClaims(registered: ReadonlyArray<UmbraDesktopRegisteredApp>): UmbraDesktopAppClaim[] {
    const weights = new Map(
      this.#registeredAppManifests.map((manifest) => [manifest.alias, isFiniteNumber(manifest.weight) ? manifest.weight : 0] as const),
    );
    return registered.map((app) => ({ alias: app.alias, manifestWeight: weights.get(app.alias) ?? 0 }));
  }

  /**
   * Validate the permitted package catalogues, reporting what did not survive.
   * @returns The usable catalogues.
   */
  #normalisePackageCatalogues(): UmbraDesktopPackageCatalogue[] {
    const { catalogues, reports } = normalisePackageCatalogues(this.#packageCatalogueManifests, window.location.origin);
    for (const report of reports) this.#diagnose(report.key, report.message);
    return catalogues;
  }

  /**
   * How a diagnostic names an entry: by alias, plus the package catalogue it came from, if any. Two
   * packages can use one alias for different things, so the source goes into the key as well.
   * @param entry The entry.
   * @returns The name to print, such as `"Pkg.App" from "Pkg.Catalogue"`.
   */
  #entryLabel(entry: UmbraDesktopCatalogueEntry): string {
    const source = this.#entrySources.get(entry.alias);
    return source ? `"${entry.alias}" from "${source}"` : `"${entry.alias}"`;
  }

  /**
   * Normalise the permitted `umbraDesktopApp` manifests, reporting what did not survive and which
   * fields were ignored. Which app keeps an alias shared with an entry is the merge's decision now
   * (design D4), so nothing here filters on aliases.
   *
   * Neither report is visible from anywhere else: a package registered, Umbraco allowed it, and the
   * launcher simply has no such app in it, or shows it without the field its author set. So both go
   * through `#diagnose`, which is the register they belong in — dev-facing, console-only,
   * deduplicated, and held back until the registry stops changing so a diagnostic is never printed
   * about a state that was merely transient.
   * @returns The registered apps the merge should see.
   */
  #normaliseRegisteredApps(): UmbraDesktopRegisteredApp[] {
    const { apps, dropped, ignored } = normaliseRegisteredApps(this.#registeredAppManifests);
    for (const drop of dropped) {
      this.#diagnose(
        `registered-dropped:${drop.alias}`,
        `[UmbraDesktop] Registered app "${drop.alias}" was dropped because ${drop.reason}.`,
      );
    }
    for (const { alias, field } of ignored) {
      this.#diagnose(
        `registered-ignored:${alias}:${field}`,
        `[UmbraDesktop] Registered app "${alias}": "${field}" has the wrong type, so it was ignored.`,
      );
    }
    return apps;
  }

  /** Resolve one catalogue entry to a concrete URL + gate + inherited presentation. */
  #resolveEntry(entry: UmbraDesktopCatalogueEntry): UmbraDesktopResolvedEntry {
    // Explicit-URL entry: the gate is the stated section.
    if (entry.url) {
      // A url entry is never gated, so anything the gate was tracking under this alias is stale: a
      // package can now replace a conditioned `ref` entry (Workflow's, say) with a `url` one, and
      // without this its condition checks would keep firing for the rest of the session.
      this.#conditionGate.forget(entry.alias);
      if (!entry.section) {
        this.#diagnose(
          `ungated:${this.#entrySources.get(entry.alias) ?? ''}:${entry.alias}`,
          `[UmbraDesktop] Catalogue entry ${this.#entryLabel(entry)} has a "url" but no "section" gate, so it will never appear. Add "section".`,
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
    // `excludedSections` only guards the fallback, so an entry whose gate is the desktop's own section
    // (a dashboard registered there, say) would open a desktop inside a desktop window (design D14).
    if (described.gateSectionAlias === UMBRADESKTOP_SECTION_ALIAS) {
      this.#diagnose(
        `desktop:${this.#entrySources.get(entry.alias) ?? ''}:${entry.alias}`,
        `[UmbraDesktop] Catalogue entry ${this.#entryLabel(entry)} would open the desktop inside a desktop window, so it is not shown.`,
      );
      return { entry, url: null, gateSectionAlias: null, isSectionRoot: false };
    }
    const url = described.ref ? inferUrl(described.ref) : null;
    // A null URL is expected when the entry is gated out (its owning section isn't
    // permitted for this user); only warn when the entry IS relevant but still
    // failed to resolve — a genuine misconfiguration (e.g. an unsupported ref kind).
    const gatePermitted =
      !described.gateSectionAlias ||
      this.#sections.some((s) => s.alias === described.gateSectionAlias);
    if (!url && gatePermitted) {
      const missingSection = manifest.type === 'menuItem' && !entry.section;
      this.#diagnose(
        `unresolved:${this.#entrySources.get(entry.alias) ?? ''}:${entry.alias}`,
        missingSection
          ? `[UmbraDesktop] Catalogue entry ${this.#entryLabel(entry)} (ref "${entry.ref}") is a menu item with no "section", so its URL cannot be built. Add "section".`
          : `[UmbraDesktop] Catalogue entry ${this.#entryLabel(entry)} (ref "${entry.ref}", type "${manifest.type}") is permitted but could not be resolved to a URL — it may need an explicit "url".`,
      );
    }
    return {
      entry,
      url,
      gateSectionAlias: described.gateSectionAlias,
      isSectionRoot: described.isSectionRoot,
      // Inherited from another package's manifest, so only when it is text: a number here would be
      // a tile's name and reach `groupApps` (design D9).
      inheritedName: textOr(manifest.meta?.label, textOr(manifest.name, undefined)),
      inheritedIcon: textOr(manifest.meta?.icon, undefined),
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
    // Guarded because `conditions` is another package's JSON: anything but a list here used to make
    // `.find` throw inside the recompute, which froze the launcher (design D9).
    const conditions: ReadonlyArray<unknown> = Array.isArray(manifest.conditions) ? manifest.conditions : [];
    const condition = conditions.find(
      (c): c is { match?: unknown } => isRecord(c) && c.alias === UMB_SECTION_ALIAS_CONDITION_ALIAS,
    );
    return textOr(condition?.match, null);
  }
}

export default UmbraDesktopAppCatalogueContext;
