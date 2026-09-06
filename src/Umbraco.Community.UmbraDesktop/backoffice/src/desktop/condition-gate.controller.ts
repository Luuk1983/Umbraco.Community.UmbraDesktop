import type { UmbraDesktopConditionConfig } from './condition-gate';
import { evaluableConditions, isPermitted } from './condition-gate.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { createExtensionApi } from '@umbraco-cms/backoffice/extension-api';
import type { ManifestCondition, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/** The registry surface the gate uses — one observable lookup, nothing more. */
export type UmbraDesktopConditionRegistry = Pick<typeof umbExtensionsRegistry, 'byTypeAndAliases'>;

/** A condition manifest as the gate reads it: enough to match a config and instantiate its api. */
interface UmbraDesktopConditionManifest {
  /** The condition's registered alias. */
  alias: string;
}

/** One entry's live conditions and their latest verdicts, kept in config order. */
interface UmbraDesktopTrackedEntry {
  /**
   * The catalogue entry alias this state is filed under, so an in-flight `#instantiate` can ask
   * whether it is still the current state for that entry before assigning what it built.
   */
  entryAlias: string;
  /**
   * The serialised configs, so re-tracking an unchanged set is a cheap no-op. It covers the whole
   * config and not just the alias on purpose: a manifest can re-register under the same condition
   * aliases with a different `match`, and short-circuiting on alias alone would leave the live api
   * evaluating the stale config. A stale `false` hides an app that should show, which is the one
   * direction this design promises can never happen.
   */
  key: string;
  /** The configs being evaluated, in the order their verdicts are stored. */
  configs: UmbraDesktopConditionConfig[];
  /** Latest verdict per config; `undefined` until that condition first reports. */
  verdicts: Array<boolean | undefined>;
  /** The instantiated condition apis, destroyed when the entry is re-tracked or the gate dies. */
  apis: Array<UmbExtensionCondition | undefined>;
  /**
   * Config indices with a construction in flight. `#instantiate` awaits before it can fill an
   * `apis` slot, and the registry observable fires again whenever the matching manifest set
   * changes — which during boot it does repeatedly, one alias at a time — so two runs can both
   * pass an "is this slot empty?" check for the same index. Reserving the index here closes that
   * window; without it the loser's api is built, never stored, never destroyed, and goes on
   * firing `onChange` for the life of the host.
   */
  pending: Set<number>;
}

/**
 * Answers the conditions a catalogue entry opted into, so the adapter can drop an app whose
 * destination the current user or this install would reject.
 *
 * The adapter observes each `ref`'s manifest already; this controller is told about the manifest
 * as it arrives, instantiates the opted-into conditions against the registry, and calls back when
 * a verdict changes. Verdicts are read synchronously by `#resolveEntry`, so the callback triggers a
 * recompute rather than participating in one — `track` is a no-op when the config set is unchanged,
 * which is what keeps that from looping.
 */
export class UmbraDesktopConditionGateController extends UmbControllerBase {
  /**
   * The host used for the condition apis, so they consume contexts from the desktop's tree.
   *
   * This is a deliberate private copy of the inherited `_host`: that field is typed loosely and
   * `UmbClassMixin.destroy` nulls it to release the element, whereas `createExtensionApi` needs a
   * `UmbControllerHost` on every call. The copy therefore outlives `destroy()` and keeps a strong
   * reference to the host element after teardown — harmless while the host owns the gate (the
   * reference points back at the object that already owns this one), but it is an independent
   * lifetime, so nothing here may assume `#host` going away is what ends the gate's work.
   */
  #host: UmbControllerHost;

  /** The registry the condition manifests are looked up in. */
  #registry: UmbraDesktopConditionRegistry;

  /** Called when any verdict changes, so the adapter can recompute the app list. */
  #onVerdictChange: () => void;

  /** Live state per catalogue entry alias; absent means the entry evaluates nothing. */
  #tracked = new Map<string, UmbraDesktopTrackedEntry>();

  /**
   * @param host The controller host (the desktop element) the conditions are scoped to.
   * @param registry The extension registry the condition manifests are resolved from.
   * @param onVerdictChange Invoked when a verdict changes, to trigger a recompute.
   */
  constructor(
    host: UmbControllerHost,
    registry: UmbraDesktopConditionRegistry,
    onVerdictChange: () => void,
  ) {
    super(host);
    this.#host = host;
    this.#registry = registry;
    this.#onVerdictChange = onVerdictChange;
  }

  /**
   * Destroys every condition api alongside the controller's own teardown. Clearing `#tracked` also
   * covers anything still being constructed: `#instantiate`'s staleness check finds its entry is
   * no longer the current one and destroys what it built rather than leaking it past teardown.
   */
  override destroy(): void {
    for (const tracked of this.#tracked.values()) {
      tracked.apis.forEach((api) => api?.destroy());
    }
    this.#tracked.clear();
    super.destroy();
  }

  /**
   * Point the gate at an entry's freshly resolved manifest. Idempotent: re-tracking an unchanged
   * set of condition configs keeps the live apis and their verdicts, so a recompute does not reset
   * an answered condition to unknown. Any change to those configs, alias or configuration alike,
   * rebuilds them.
   * @param entryAlias The catalogue entry's alias, which keys its verdicts.
   * @param evaluate The aliases the entry opted into, if any.
   * @param conditions The referenced manifest's own conditions, if any.
   */
  public track(
    entryAlias: string,
    evaluate: ReadonlyArray<string> | undefined,
    conditions: ReadonlyArray<UmbraDesktopConditionConfig> | undefined,
  ): void {
    const configs = evaluableConditions(conditions, evaluate);
    const existing = this.#tracked.get(entryAlias);
    // The common case — an entry with no conditions, which is most of the catalogue — never had
    // anything tracked and never will. Without this, every resolve of such an entry still did a
    // `removeUmbControllerByAlias` lookup and a `Map` delete below for no reason on every recompute.
    if (configs.length === 0 && !existing) return;
    // Serialising rather than joining aliases is what makes a changed `match` on an unchanged set
    // of aliases count as a change; see `key` on {@link UmbraDesktopTrackedEntry}. `configs` is a
    // fresh array on every call but its elements are the manifest's own objects, so an unchanged
    // set still serialises identically and still short-circuits — which is what keeps the
    // recompute this runs inside from looping.
    const key = JSON.stringify(configs);
    if (existing?.key === key) return;

    existing?.apis.forEach((api) => api?.destroy());
    this.removeUmbControllerByAlias(this.#observerAlias(entryAlias));

    if (configs.length === 0) {
      this.#tracked.delete(entryAlias);
      // No callback here even though the verdict just changed to "permitted": `track`'s only
      // caller is `#resolveEntry`, which reads `permits()` on the very next line, so the pass
      // already in progress observes this. Calling back would re-enter `#recompute` to produce a
      // list the outer pass then overwrites. A future caller from outside `#recompute` would need
      // to trigger its own recompute.
      return;
    }

    const tracked: UmbraDesktopTrackedEntry = {
      entryAlias,
      key,
      configs,
      verdicts: configs.map(() => undefined),
      apis: configs.map(() => undefined),
      pending: new Set<number>(),
    };
    this.#tracked.set(entryAlias, tracked);

    this.observe(
      this.#registry.byTypeAndAliases('condition', [...new Set(configs.map((c) => c.alias))]),
      (manifests) => {
        void this.#instantiate(tracked, (manifests ?? []) as UmbraDesktopConditionManifest[]);
      },
      this.#observerAlias(entryAlias),
    );
  }

  /**
   * Drop everything tracked for an entry whose referenced manifest has just gone missing (e.g.
   * `registry.unregister`, which a package replacing a core extension does). `#resolveEntry`
   * returns before ever calling `track` in that case, so nothing else would destroy this entry's
   * condition apis: left alone, they keep calling `#onVerdictChange` for the life of the host, for
   * an entry no verdict of theirs can any longer affect.
   * @param entryAlias The catalogue entry's alias.
   */
  public forget(entryAlias: string): void {
    const tracked = this.#tracked.get(entryAlias);
    if (!tracked) return;
    tracked.apis.forEach((api) => api?.destroy());
    this.removeUmbControllerByAlias(this.#observerAlias(entryAlias));
    this.#tracked.delete(entryAlias);
  }

  /**
   * Whether this entry's evaluated conditions permit it. An entry that evaluates nothing, or whose
   * conditions have not reported, is permitted — see {@link isPermitted}.
   * @param entryAlias The catalogue entry's alias.
   * @returns False only when one of its conditions has explicitly denied it.
   */
  public permits(entryAlias: string): boolean {
    const tracked = this.#tracked.get(entryAlias);
    return tracked ? isPermitted(tracked.verdicts) : true;
  }

  /**
   * A stable controller alias per entry, so each entry's condition observation replaces only its
   * own. Without one, `observe` derives an alias from the callback's source — identical on every
   * iteration — and each entry would evict the previous one's observation.
   * @param entryAlias The catalogue entry's alias.
   * @returns The controller alias for that entry's condition observation.
   */
  #observerAlias(entryAlias: string): string {
    return `umbraDesktopConditions:${entryAlias}`;
  }

  /**
   * Create any condition api that has become resolvable, leaving the ones already live alone.
   * A config whose manifest has not registered stays uninstantiated and therefore unknown, which
   * permits — the observation runs again when it does register.
   *
   * Construction is asynchronous while this observation is not, so two runs can overlap: each
   * reserves the indices it is building (`tracked.pending`) before awaiting, and throws away
   * anything it built that arrived too late to be the entry's live api. Both halves matter —
   * an orphaned condition api is never destroyed by `track` or `destroy()` and keeps calling
   * `onChange` forever.
   * @param tracked The entry's live state.
   * @param manifests The condition manifests currently registered for its aliases.
   */
  async #instantiate(
    tracked: UmbraDesktopTrackedEntry,
    manifests: UmbraDesktopConditionManifest[],
  ): Promise<void> {
    for (const [index, config] of tracked.configs.entries()) {
      if (tracked.apis[index] || tracked.pending.has(index)) continue;
      const manifest = manifests.find((candidate) => candidate.alias === config.alias);
      if (!manifest) continue;
      tracked.pending.add(index);
      try {
        // The registry hands these back under the observable's generic manifest type; narrowing to
        // `ManifestCondition` is what lets `createExtensionApi` return a `UmbExtensionCondition`
        // rather than a bare `UmbApi`. `byTypeAndAliases('condition', …)` already guarantees it.
        const api = await createExtensionApi<UmbExtensionCondition>(
          this.#host,
          manifest as ManifestCondition,
          [
            {
              host: this.#host,
              config,
              onChange: (permitted: boolean) => {
                if (tracked.verdicts[index] === permitted) return;
                tracked.verdicts[index] = permitted;
                this.#onVerdictChange();
              },
            },
          ],
        );
        if (!api) continue;
        // Two ways to arrive stale: another run filled the slot while this one awaited, or the
        // entry was re-tracked (or dropped) meanwhile, so `tracked` is no longer what `permits`
        // reads. Either way this api answers nobody, and only destroying it stops its `onChange`.
        if (tracked.apis[index] || this.#tracked.get(tracked.entryAlias) !== tracked) {
          api.destroy();
          continue;
        }
        tracked.apis[index] = api;
      } finally {
        tracked.pending.delete(index);
      }
    }
  }
}

export default UmbraDesktopConditionGateController;
