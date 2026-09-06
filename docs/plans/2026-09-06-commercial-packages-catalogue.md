# Commercial Packages Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit catalogue support for the eight Umbraco commercial packages — sixteen curated entries across eight fragment files — and make the resolver safe enough to carry them.

**Architecture:** Two ordered halves. First the resolver changes: remove `optional` (a flag that gated only a `console.warn` and promised something the catalogue cannot keep), then add per-entry condition evaluation so an entry gated on a permission or feature flag cannot open a blank window. Then the catalogue itself: one fragment file per package, every entry resolved by `ref` so it appears only where the package is installed, folded into existing groups plus one new `marketing-sales`.

**Tech Stack:** TypeScript, Lit, `@umbraco-cms/backoffice` 17.6.0, `@open-wc/testing` on web-test-runner in real Chrome.

**Design:** [docs/design/2026-09-06-commercial-packages-catalogue-design.md](../design/2026-09-06-commercial-packages-catalogue-design.md) — read §3 (surface inventory) before touching any fragment; every alias in this plan came from reading the package's own source and is not guessable.

**Issue:** [#10](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/10)

---

## Working agreements

**Do not commit.** The repository owner reviews one diff and decides when it becomes history. Finish each task, run the verification commands, report what changed, and leave the work in the working tree. This overrides the commit steps the plan-writing skill would normally include.

**Both commands, every time.** From `src/Umbraco.Community.UmbraDesktop`:

```bash
npm test
```

```bash
npm run build
```

They check different things and neither subsumes the other: the test runner transpiles through esbuild and does **not** type-check, while `tsc` never renders anything. A green test run over a broken build has shipped here before.

To run one test file while iterating:

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

**JSDoc on everything, including private members.** Say why the code exists, not what its name already says. The existing files set the density; match them rather than the language's minimum.

---

## File structure

| File | Responsibility |
|---|---|
| `src/desktop/condition-gate.ts` | **Create.** Pure: which of a manifest's conditions this entry opted into, and whether the verdicts permit it. No registry, no controller. |
| `src/desktop/condition-gate.controller.ts` | **Create.** Impure: instantiates those conditions against the registry and observes their verdicts. |
| `src/desktop/condition-gate.test.ts` | **Create.** Unit tests for the two pure functions. |
| `src/desktop/types.ts` | **Modify.** Remove `optional`, add `evaluateConditions`. |
| `src/desktop/app-catalogue.context.ts` | **Modify.** Drop the `unknown-ref` diagnostic; consult the gate in `#resolveEntry`. |
| `src/desktop/catalogue/groups.ts` | **Modify.** Add `marketing-sales`. |
| `src/desktop/catalogue/{forms,workflow,deploy,ui-builder,commerce,engage,automate,ai}.ts` | **Create.** One fragment per package. |
| `src/desktop/catalogue/commercial.test.ts` | **Create.** Shared invariants across the eight fragments. |
| `src/desktop/catalogue/index.ts` | **Modify.** Spread the new fragments. |
| `src/desktop/localization/{en,nl}.ts` | **Modify.** One group label, nine app names. |
| `README.md`, `umbraco-marketplace.json` | **Modify.** Definition of done. |

All paths below are relative to `src/Umbraco.Community.UmbraDesktop/backoffice/` unless stated otherwise.

---

## Task 1: Remove `optional`

`optional` appears in exactly one place in the resolver — it guards a `console.warn` and nothing else. Its inverse cannot be stated honestly, because a package may unregister a core extension, so no `ref` is ever guaranteed. See design §5.

**Files:**
- Modify: `src/desktop/types.ts`
- Modify: `src/desktop/app-catalogue.context.ts`
- Modify: `src/desktop/app-catalogue.context.test.ts`
- Modify: `src/desktop/catalogue/synchronisation.ts`
- Modify: `src/desktop/catalogue/advanced-security.ts`
- Modify: `src/desktop/catalogue/advanced-security.test.ts`
- Modify: `README.md` (repository root)

- [ ] **Step 1: Write the failing test**

In `src/desktop/app-catalogue.context.test.ts`, replace the `MANDATORY_CATALOGUE` constant and add a new case after it. The old constant and any test using it go away — an entry can no longer be "mandatory".

Find and delete this block:

```ts
/** A catalogue whose single entry is mandatory, so an absent `ref` is a real misconfiguration. */
const MANDATORY_CATALOGUE: UmbraDesktopCatalogue = {
  groups: [{ alias: 'system', label: 'System' }],
  entries: [{ alias: 'log-viewer', ref: 'Umb.MenuItem.LogViewer', section: 'Umb.Section.Settings', group: 'system' }],
  excludedSections: [],
};
```

Replace it with:

```ts
/**
 * A catalogue whose entry points at an extension nothing registers. Every entry is now in this
 * position on some install — a package the site does not have — so an absent `ref` must be silent.
 */
const ABSENT_REF_CATALOGUE: UmbraDesktopCatalogue = {
  groups: [{ alias: 'system', label: 'System' }],
  entries: [{ alias: 'log-viewer', ref: 'Umb.MenuItem.LogViewer', section: 'Umb.Section.Settings', group: 'system' }],
  excludedSections: [],
};

it('says nothing when a ref never registers', async () => {
  const harness = await setup(ABSENT_REF_CATALOGUE);
  try {
    await settleDiagnostics();
    expect(harness.aliases(), 'an unresolvable entry produces no app').to.not.contain('log-viewer');
    expect(harness.warnings, 'an absent package is the normal case, not a misconfiguration').to.be.empty;
  } finally {
    harness.teardown();
  }
});
```

Then search the rest of the file for `MANDATORY_CATALOGUE` and delete any remaining test that used it — those asserted the warning this task removes. Also delete `optional: true` from the `CATALOGUE` fixture near the top of the file, and reword the file's header comment: the phrase "and for an `optional` entry it is silent" becomes "and it is silent".

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/app-catalogue.context.test.ts" --node-resolve
```

Expected: FAIL on `says nothing when a ref never registers`, because `warnings` contains
`[UmbraDesktop] Catalogue entry "log-viewer" references unknown extension "Umb.MenuItem.LogViewer".`

- [ ] **Step 3: Remove the diagnostic**

In `src/desktop/app-catalogue.context.ts`, find this block inside `#resolveEntry`:

```ts
    const manifest = this.#manifests.get(entry.ref);
    if (!manifest) {
      // An `optional` entry references a package that need not be installed (uSync, …), so an
      // absent manifest is the expected case there — drop the app without the noise. It is also
      // the transient case while that package's bundle is still importing; this ref's observation
      // recomputes as soon as it registers.
      if (!entry.optional) {
        this.#diagnose(
          `unknown-ref:${entry.alias}`,
          `[UmbraDesktop] Catalogue entry "${entry.alias}" references unknown extension "${entry.ref}".`,
        );
      }
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
```

Replace it with:

```ts
    const manifest = this.#manifests.get(entry.ref);
    if (!manifest) {
      // Most of the catalogue points at packages an install need not have, so an absent manifest
      // is the normal case rather than a misconfiguration. It is also the transient case while a
      // package's bundle is still importing; this ref's observation recomputes when it registers.
      // A mistyped `ref` therefore says nothing here — it surfaces as a missing tile, which is
      // where a typo gets noticed. What a missing tile does *not* explain is a ref that resolves
      // but yields no URL, and the `unresolved` diagnostic below still covers that.
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
```

In the same file, find the class JSDoc phrase `silently for an `optional` entry` and change that sentence to read `silently, since nothing warns about an absent package`.

- [ ] **Step 4: Remove the field**

In `src/desktop/types.ts`, delete this property and its JSDoc from `UmbraDesktopCatalogueEntry`:

```ts
  /**
   * True when `ref` points at an extension shipped by a package that may not be installed
   * (a third-party integration such as uSync). Such an entry resolving to nothing is the
   * normal case, not a misconfiguration, so the adapter stays quiet about it instead of
   * warning on every install without that package.
   */
  optional?: boolean;
```

- [ ] **Step 5: Remove it from the two fragments**

In `src/desktop/catalogue/synchronisation.ts`, delete the line `optional: true,` from the uSync entry, and replace the fragment's header JSDoc with:

```ts
/**
 * Synchronisation — moving a site's shape and content between environments.
 *
 * These are third-party package surfaces, so every entry points at the package's own registered
 * extension by `ref`: the app appears only on installs that actually have the package, and
 * resolving to nothing elsewhere is silent. Umbraco Deploy lives in `deploy.ts` beside this.
 */
```

In `src/desktop/catalogue/advanced-security.ts`, delete all eight `optional: true,` lines, and change the header JSDoc sentence `Every entry is `optional`: it resolves only where the package is installed, and its absence elsewhere is silent rather than a warning.` to `Every entry resolves only where the package is installed, and its absence elsewhere is silent.`

In `src/desktop/catalogue/advanced-security.test.ts`, delete this whole case:

```ts
it('marks every entry optional so a v17 install stays quiet', () => {
  for (const e of entries) {
    expect(e.optional, `${e.alias} must be optional`).to.be.true;
  }
});
```

The load-bearing invariant — `references every tool by ref so an absent menu item drops the app` — stays exactly as it is.

- [ ] **Step 6: Update the README paragraph that documents the flag**

In `README.md`, under `### Custom and third-party apps`, replace this paragraph:

```markdown
A curated entry for a package that not every install has is marked `optional`. Because it points at the package's own extension by alias, it resolves only where that package is registered, and stays silently absent everywhere else. uSync ships this way: install it and a uSync app appears in the Synchronisation group, opening its dashboard without the Settings tree beside it.
```

with:

```markdown
A curated entry points at its extension by alias rather than by URL, so it resolves only where that package is registered and stays silently absent everywhere else. No flag is needed and none exists: any package can unregister any extension, so no entry is ever guaranteed to resolve. uSync ships this way — install it and a uSync app appears in the Synchronisation group, opening its dashboard without the Settings tree beside it.
```

- [ ] **Step 7: Verify**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm test
```

Expected: PASS, including `says nothing when a ref never registers`.

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: exit 0. If `tsc` reports `optional` on a catalogue entry anywhere, that fragment was missed in Step 5.

---

## Task 2: Pure condition helpers

**Files:**
- Create: `src/desktop/condition-gate.ts`
- Create: `src/desktop/condition-gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/desktop/condition-gate.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { evaluableConditions, isPermitted } from './condition-gate';

/**
 * The gate's whole job is deciding what *not* to answer. A manifest's conditions are a mix of
 * mount-dependent ones the iframe answers correctly and user- or install-dependent ones the
 * desktop can answer early; only the second kind may be evaluated here, and an entry names them
 * explicitly. Getting this backwards hides an app on every install, so it is tested directly.
 */

const SECTION = { alias: 'Umb.Condition.SectionAlias', match: 'Umb.Section.Content' };
const PERMISSION = { alias: 'Workflow.Condition.UserPermission', match: 'Workflow.ReleaseSet.Read' };
const SETTING = { alias: 'Workflow.Condition.SettingEnabled', match: 'releaseSetsEnabled' };

describe('evaluableConditions', () => {
  it('keeps only the conditions the entry opted into', () => {
    const result = evaluableConditions(
      [SECTION, PERMISSION, SETTING],
      ['Workflow.Condition.UserPermission', 'Workflow.Condition.SettingEnabled'],
    );
    expect(result).to.deep.equal([PERMISSION, SETTING]);
  });

  it('evaluates nothing when the entry opted into nothing', () => {
    expect(evaluableConditions([SECTION, PERMISSION], undefined)).to.be.empty;
    expect(evaluableConditions([SECTION, PERMISSION], [])).to.be.empty;
  });

  it('ignores an opted-in alias the manifest does not actually carry', () => {
    expect(evaluableConditions([SECTION], ['Workflow.Condition.UserPermission'])).to.be.empty;
  });

  it('handles a manifest with no conditions at all', () => {
    expect(evaluableConditions(undefined, ['Workflow.Condition.UserPermission'])).to.be.empty;
  });
});

describe('isPermitted', () => {
  it('permits an entry with nothing to evaluate', () => {
    expect(isPermitted([])).to.be.true;
  });

  it('permits while a condition has not yet reported', () => {
    expect(isPermitted([undefined]), 'unknown must never hide an app').to.be.true;
    expect(isPermitted([true, undefined])).to.be.true;
  });

  it('permits when every condition has said yes', () => {
    expect(isPermitted([true, true])).to.be.true;
  });

  it('denies as soon as one condition has explicitly said no', () => {
    expect(isPermitted([false])).to.be.false;
    expect(isPermitted([true, false, undefined])).to.be.false;
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/condition-gate.test.ts" --node-resolve
```

Expected: FAIL — the module `./condition-gate` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/desktop/condition-gate.ts`:

```ts
/**
 * One condition config as it appears in a manifest's `conditions` array. Only the alias matters
 * to the pure layer; the rest of the object is the condition's own configuration and is passed
 * through to it untouched.
 */
export interface UmbraDesktopConditionConfig {
  /** The registered alias of the condition this config configures. */
  alias: string;
}

/**
 * The condition configs on a referenced manifest that this entry has opted into evaluating.
 *
 * A manifest's conditions are a mix of two kinds. Mount-dependent ones (`Umb.Condition.SectionAlias`,
 * `Umb.Condition.WorkspaceAlias`, the block and collection conditions) are answered relative to the
 * section or workspace the extension renders in; the desktop shell is mounted in its own section, so
 * evaluating them here would deny every entry in the catalogue. The iframe is mounted in the right
 * place and answers those correctly. User- or install-dependent ones — a permission, a server
 * setting, an existence check — give the same answer in either place, and answering them here is
 * what stops a window opening empty.
 *
 * Nothing infers which is which. The entry names the aliases worth answering, so the judgment sits
 * in the catalogue diff rather than in a global list that has to track 54 CMS conditions and
 * whatever every package adds.
 * @param configs The referenced manifest's own conditions, if it has any.
 * @param evaluate The aliases the catalogue entry opted into, if it opted into any.
 * @returns The subset of `configs` to instantiate; empty when the entry opted into nothing.
 */
export function evaluableConditions<T extends UmbraDesktopConditionConfig>(
  configs: ReadonlyArray<T> | undefined,
  evaluate: ReadonlyArray<string> | undefined,
): T[] {
  if (!configs?.length || !evaluate?.length) return [];
  return configs.filter((config) => evaluate.includes(config.alias));
}

/**
 * Whether an entry's evaluated conditions permit it to appear.
 *
 * Only an explicit `false` denies. A condition whose manifest has not registered yet, whose api
 * failed to load, or which has been created but has not reported, is `undefined` and permits — a
 * condition arriving late must make an app appear, never make one vanish. That direction matters:
 * the desktop's standing rule is that a missing affordance is a bug, and a permanently unresolvable
 * condition failing closed would silently delete a working app.
 * @param states The latest verdict per evaluated condition; `undefined` where none has arrived.
 * @returns False only when some condition has explicitly denied the entry.
 */
export function isPermitted(states: ReadonlyArray<boolean | undefined>): boolean {
  return !states.includes(false);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/condition-gate.test.ts" --node-resolve
```

Expected: PASS, 8 passing.

- [ ] **Step 5: Verify the build**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: exit 0.

---

## Task 3: The gate controller, wired into the adapter

**Files:**
- Create: `src/desktop/condition-gate.controller.ts`
- Modify: `src/desktop/types.ts`
- Modify: `src/desktop/app-catalogue.context.ts`
- Modify: `src/desktop/app-catalogue.context.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/desktop/app-catalogue.context.test.ts`:

```ts
/**
 * A catalogue entry whose referenced dashboard is gated on a condition the desktop can answer:
 * a user permission, which reads the same in the host as it does in the iframe. The section
 * condition beside it is mount-dependent and must be ignored, or the entry never shows at all.
 */
const CONDITIONAL_CATALOGUE: UmbraDesktopCatalogue = {
  groups: [{ alias: 'editing', label: 'Editing' }],
  entries: [
    {
      alias: 'release-sets',
      ref: 'Workflow.ReleaseSets.Dashboard',
      evaluateConditions: ['Workflow.Condition.UserPermission'],
      group: 'editing',
    },
  ],
  excludedSections: [],
};

/** Registers a dashboard carrying one mount-dependent and one answerable condition. */
function registerGatedDashboard(registry: UmbExtensionRegistry<UmbExtensionManifest>) {
  registry.register({
    type: 'dashboard',
    alias: 'Workflow.ReleaseSets.Dashboard',
    name: 'Release Sets',
    meta: { label: 'Release sets', pathname: 'release-sets' },
    conditions: [
      { alias: 'Umb.Condition.SectionAlias', match: 'Umb.Section.Settings' },
      { alias: 'Workflow.Condition.UserPermission', match: 'releaseSet.read' },
    ],
  } as unknown as UmbExtensionManifest);
}

/** A condition manifest whose api reports the verdict this test wants, once. */
function registerCondition(registry: UmbExtensionRegistry<UmbExtensionManifest>, permitted: boolean) {
  registry.register({
    type: 'condition',
    alias: 'Workflow.Condition.UserPermission',
    name: 'Workflow User Permission Condition',
    api: class {
      permitted = permitted;
      constructor(_host: unknown, args: { onChange: (value: boolean) => void }) {
        args.onChange(permitted);
      }
      destroy() {}
    },
  } as unknown as UmbExtensionManifest);
}

it('shows a conditional entry while its condition has not reported', async () => {
  const harness = await setup(CONDITIONAL_CATALOGUE);
  try {
    registerGatedDashboard(harness.registry);
    await settle();
    expect(
      harness.aliases(),
      'an unanswered condition must never hide an app',
    ).to.contain('release-sets');
  } finally {
    harness.teardown();
  }
});

it('drops a conditional entry when its condition denies it', async () => {
  const harness = await setup(CONDITIONAL_CATALOGUE);
  try {
    registerGatedDashboard(harness.registry);
    registerCondition(harness.registry, false);
    await settle();
    await settle();
    expect(harness.aliases(), 'a denied condition removes the app').to.not.contain('release-sets');
  } finally {
    harness.teardown();
  }
});

it('keeps a conditional entry when its condition permits it', async () => {
  const harness = await setup(CONDITIONAL_CATALOGUE);
  try {
    registerGatedDashboard(harness.registry);
    registerCondition(harness.registry, true);
    await settle();
    await settle();
    expect(harness.aliases()).to.contain('release-sets');
  } finally {
    harness.teardown();
  }
});

it('ignores the mount-dependent condition beside it', async () => {
  const harness = await setup(CONDITIONAL_CATALOGUE);
  try {
    registerGatedDashboard(harness.registry);
    registerCondition(harness.registry, true);
    await settle();
    await settle();
    // The dashboard's SectionAlias condition names Settings; the desktop is not mounted there.
    // If the gate evaluated it, this entry would be gone.
    expect(
      harness.aliases(),
      'SectionAlias is the iframe’s question, not the desktop’s',
    ).to.contain('release-sets');
  } finally {
    harness.teardown();
  }
});
```

Note the fixture's `setup()` already grants `Umb.Section.Settings`, which is the gate section this
dashboard's `Umb.Condition.SectionAlias` names, so the entry is section-permitted in all four cases
and only the condition verdict varies.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/app-catalogue.context.test.ts" --node-resolve
```

Expected: FAIL on `drops a conditional entry when its condition denies it` — the app is still listed, because nothing evaluates conditions yet. The other three may already pass; that is fine, they are the regression net.

- [ ] **Step 3: Add the field to the entry type**

In `src/desktop/types.ts`, add this property to `UmbraDesktopCatalogueEntry`, directly after `group`:

```ts
  /**
   * Condition aliases on the referenced manifest that the desktop should answer before showing
   * this app.
   *
   * Only conditions whose answer is independent of where the extension is mounted belong here —
   * a user permission, a server setting, an existence check. A mount-dependent condition
   * (`Umb.Condition.SectionAlias`, `Umb.Condition.WorkspaceAlias`, the block and collection ones)
   * is answered by the iframe, which is mounted in the right place; naming one here denies the
   * entry on every install. Omit the field to evaluate nothing, which is how every entry behaved
   * before this existed.
   */
  evaluateConditions?: string[];
```

- [ ] **Step 4: Write the controller**

Create `src/desktop/condition-gate.controller.ts`:

```ts
import type { UmbraDesktopConditionConfig } from './condition-gate';
import { evaluableConditions, isPermitted } from './condition-gate.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { createExtensionApi } from '@umbraco-cms/backoffice/extension-api';
import type { UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
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
  /** The evaluated aliases joined, so re-tracking an unchanged set is a cheap no-op. */
  key: string;
  /** The configs being evaluated, in the order their verdicts are stored. */
  configs: UmbraDesktopConditionConfig[];
  /** Latest verdict per config; `undefined` until that condition first reports. */
  verdicts: Array<boolean | undefined>;
  /** The instantiated condition apis, destroyed when the entry is re-tracked or the gate dies. */
  apis: Array<UmbExtensionCondition | undefined>;
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
  /** The host used for the condition apis, so they consume contexts from the desktop's tree. */
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

  /** Destroys every condition api alongside the controller's own teardown. */
  override destroy(): void {
    for (const tracked of this.#tracked.values()) {
      tracked.apis.forEach((api) => api?.destroy());
    }
    this.#tracked.clear();
    super.destroy();
  }

  /**
   * Point the gate at an entry's freshly resolved manifest. Idempotent: re-tracking the same set
   * of condition aliases keeps the live apis and their verdicts, so a recompute does not reset
   * an answered condition to unknown.
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
    const key = configs.map((config) => config.alias).join('|');
    const existing = this.#tracked.get(entryAlias);
    if (existing?.key === key) return;

    existing?.apis.forEach((api) => api?.destroy());
    this.removeUmbControllerByAlias(this.#observerAlias(entryAlias));

    if (configs.length === 0) {
      this.#tracked.delete(entryAlias);
      if (existing) this.#onVerdictChange();
      return;
    }

    const tracked: UmbraDesktopTrackedEntry = {
      key,
      configs,
      verdicts: configs.map(() => undefined),
      apis: configs.map(() => undefined),
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
   * @param tracked The entry's live state.
   * @param manifests The condition manifests currently registered for its aliases.
   */
  async #instantiate(
    tracked: UmbraDesktopTrackedEntry,
    manifests: UmbraDesktopConditionManifest[],
  ): Promise<void> {
    for (const [index, config] of tracked.configs.entries()) {
      if (tracked.apis[index]) continue;
      const manifest = manifests.find((candidate) => candidate.alias === config.alias);
      if (!manifest) continue;
      const api = await createExtensionApi<UmbExtensionCondition>(
        this.#host,
        manifest as Parameters<typeof createExtensionApi>[1],
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
      if (api) tracked.apis[index] = api;
    }
  }
}

export default UmbraDesktopConditionGateController;
```

- [ ] **Step 5: Wire it into the adapter**

In `src/desktop/app-catalogue.context.ts`, add the imports:

```ts
import { UmbraDesktopConditionGateController } from './condition-gate.controller.js';
import type { UmbraDesktopConditionConfig } from './condition-gate';
```

Widen `ReferencedManifest.conditions` so the gate can read a condition's own configuration, not just its alias and `match`. Replace:

```ts
  /** Dynamic conditions (used to find a dashboard's owning section). */
  conditions?: Array<{ alias: string; match?: string }>;
```

with:

```ts
  /**
   * Dynamic conditions. Two consumers: `#dashboardSectionAlias` reads the section-alias one
   * structurally, and the condition gate instantiates whichever of the rest the entry opted into.
   */
  conditions?: Array<UmbraDesktopConditionConfig & { match?: string }>;
```

Widen the registry type so `byTypeAndAliases` is available to the gate. Replace:

```ts
type UmbraDesktopExtensionRegistry = Pick<typeof umbExtensionsRegistry, 'byType' | 'byAlias'>;
```

with:

```ts
type UmbraDesktopExtensionRegistry = Pick<
  typeof umbExtensionsRegistry,
  'byType' | 'byAlias' | 'byTypeAndAliases'
>;
```

Add the field, after `#reportedDiagnostics`:

```ts
  /** Answers the conditions catalogue entries opted into (see `condition-gate.controller.ts`). */
  #conditionGate: UmbraDesktopConditionGateController;
```

Construct it in the constructor, immediately after `this.#validateCatalogue();` and before the first
`this.observe(...)` call — `#recompute` reads its verdicts, so it must exist before any observation
fires:

```ts
    // A verdict change calls back in to recompute, which is why `track` no-ops on an unchanged
    // condition set: without that, every recompute would rebuild the conditions and recompute again.
    this.#conditionGate = new UmbraDesktopConditionGateController(host, this.#registry, () =>
      this.#recompute(),
    );
```

Finally, in `#resolveEntry`, after the `const manifest = this.#manifests.get(entry.ref);` block that returns on an absent manifest, add:

```ts
    // Tell the gate about this manifest's conditions, then read its verdict. `track` is a no-op
    // unless the evaluated set changed, so this does not re-enter the recompute it runs inside.
    this.#conditionGate.track(entry.alias, entry.evaluateConditions, manifest.conditions);
    if (!this.#conditionGate.permits(entry.alias)) {
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/app-catalogue.context.test.ts" --node-resolve
```

Expected: PASS, including all four conditional cases.

- [ ] **Step 7: Verify the whole suite and the build**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm test
```

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: both exit 0.

---

## Task 4: The `marketing-sales` group and its labels

**Files:**
- Modify: `src/desktop/catalogue/groups.ts`
- Modify: `src/desktop/localization/en.ts`
- Modify: `src/desktop/localization/nl.ts`
- Create: `src/desktop/catalogue/commercial.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/desktop/catalogue/commercial.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { groups } from './groups';

/**
 * Invariants shared by the eight commercial-package fragments. Each fragment is a handful of data
 * literals, so the risk is never logic — it is an alias that does not exist, a group that does not
 * exist, or a `url` where a `ref` belongs. The last one is the expensive mistake: a `url` is not
 * checked against the registry, so it ships a tile that opens a 404 on every install without that
 * package. Cases are added here as each fragment lands.
 */

describe('the marketing-sales group', () => {
  it('exists with a localised label', () => {
    const group = groups.find((g) => g.alias === 'marketing-sales');
    expect(group, 'Commerce and Engage have nowhere else to go').to.not.be.undefined;
    expect(group!.label).to.equal('#umbraDesktop_groupMarketingSales');
  });

  it('sorts between Editing and Development', () => {
    const weightOf = (alias: string) => groups.find((g) => g.alias === alias)!.weight!;
    expect(weightOf('marketing-sales')).to.be.greaterThan(weightOf('editing'));
    expect(weightOf('marketing-sales')).to.be.lessThan(weightOf('development'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: FAIL — `expected undefined to not be undefined`.

- [ ] **Step 3: Add the group**

In `src/desktop/catalogue/groups.ts`, insert between the `editing` and `development` entries:

```ts
  // Commerce and Engage. One business function rather than two product names bolted together, so
  // a future marketing package lands here without a rename.
  { alias: 'marketing-sales', label: '#umbraDesktop_groupMarketingSales', weight: 15 },
```

- [ ] **Step 4: Add the labels**

In `src/desktop/localization/en.ts`, add to the `// app names` block:

```ts
    appWorkflowTasks: 'Workflow tasks',
    appWorkflowSearch: 'Workflow search',
    appWorkflowReleaseSets: 'Release sets',
    appDeploy: 'Deploy',
    appDeployEnvironments: 'Deploy environments',
    appDeployStatus: 'Deploy status',
    appDeploySchema: 'Deploy schema',
    appDeployConfiguration: 'Deploy configuration',
    appEngageConfiguration: 'Engage configuration',
```

and to the `// group labels` block, after `groupEditing`:

```ts
    groupMarketingSales: 'Marketing and sales',
```

In `src/desktop/localization/nl.ts`, add the same keys after `appAdvancedElementTypeAccess`:

```ts
    appWorkflowTasks: 'Workflow-taken',
    appWorkflowSearch: 'Workflow-zoeken',
    appWorkflowReleaseSets: 'Release sets',
    appDeploy: 'Deploy',
    appDeployEnvironments: 'Deploy-omgevingen',
    appDeployStatus: 'Deploy-status',
    appDeploySchema: 'Deploy-schema',
    appDeployConfiguration: 'Deploy-configuratie',
    appEngageConfiguration: 'Engage-configuratie',
```

and after `groupEditing`:

```ts
    groupMarketingSales: 'Marketing en verkoop',
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: PASS, 2 passing.

---

## Task 5: Forms and Workflow

Four of Workflow's entries and one of Forms'. Read design §3.1 and §3.3 first. The three Workflow
dashboards live in the **Content** section, so they need no `section` — the adapter derives the gate
from each dashboard's own `Umb.Condition.SectionAlias`.

**Files:**
- Create: `src/desktop/catalogue/forms.ts`
- Create: `src/desktop/catalogue/workflow.ts`
- Modify: `src/desktop/catalogue/index.ts`
- Modify: `src/desktop/catalogue/commercial.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/desktop/catalogue/commercial.test.ts`:

```ts
import { entries as forms } from './forms';
import { entries as workflow } from './workflow';

describe('Forms', () => {
  it('is one entry, the section itself', () => {
    expect(forms.map((e) => e.ref)).to.deep.equal(['Umb.Section.Forms']);
  });

  it('opens full-section, because the Forms sidebar is the navigation', () => {
    expect(forms[0].chromeProfile).to.equal('full-section');
  });

  it('inherits its name and supplies a core icon', () => {
    expect(forms[0].name, 'the section manifest label is #sections_forms').to.be.undefined;
    expect(forms[0].icon, 'a section manifest carries no icon').to.equal('icon-umb-contour');
  });
});

describe('Workflow', () => {
  it('carries the section plus its three Content-section dashboards', () => {
    expect(workflow.map((e) => e.ref)).to.deep.equal([
      'Umb.Section.Workflow',
      'workflow.editor.dashboard',
      'Workflow.AdvancedSearch.Dashboard',
      'Workflow.ReleaseSets.Dashboard',
    ]);
  });

  it('names the dashboards itself, because two would otherwise read as "Workflow"', () => {
    // workflow.editor.dashboard's label is #workflow_workflow — the same string as the section's.
    const dashboards = workflow.filter((e) => e.ref !== 'Umb.Section.Workflow');
    for (const entry of dashboards) {
      expect(entry.name, `${entry.alias} must name itself`).to.be.a('string');
    }
    expect(workflow[0].name, 'the section inherits #workflow_workflow').to.be.undefined;
  });

  it('evaluates only the two conditions the desktop can answer', () => {
    const search = workflow.find((e) => e.alias === 'workflow-search')!;
    const releaseSets = workflow.find((e) => e.alias === 'workflow-release-sets')!;
    expect(search.evaluateConditions).to.deep.equal(['Workflow.Condition.UserPermission']);
    expect(releaseSets.evaluateConditions).to.deep.equal([
      'Workflow.Condition.UserPermission',
      'Workflow.Condition.SettingEnabled',
    ]);
  });

  it('leaves the dashboards ungated, so the adapter derives Content from the manifest', () => {
    for (const entry of workflow) {
      expect(entry.section, `${entry.alias} must not hardcode a section`).to.be.undefined;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: FAIL — `./forms` cannot be resolved.

- [ ] **Step 3: Write the Forms fragment**

Create `src/desktop/catalogue/forms.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Forms — the section, and only the section.
 *
 * Forms puts every destination in its own sidebar (`Umb.Menu.Forms`), and four of its five menu
 * items are `kind: 'tree'`, which `inferUrl` deliberately does not infer (design §5.1). Only
 * `Forms.MenuItem.Analytics` is default-kind, and a tile for it would duplicate a sidebar link the
 * section already shows. So this opens `full-section` and the sidebar does the navigating, the same
 * call as Content and Media.
 *
 * The name is inherited: the section manifest's label is `#sections_forms`, which Forms translates
 * itself and we should not. The icon is not inherited, because a section manifest carries none —
 * `icon-umb-contour` is the Forms icon in Umbraco's own core set, so it renders whether or not the
 * package is installed.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'forms',
    ref: 'Umb.Section.Forms',
    icon: 'icon-umb-contour',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'editing',
    weight: 40,
  },
];
```

- [ ] **Step 4: Write the Workflow fragment**

Create `src/desktop/catalogue/workflow.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Workflow — the administrator's section, plus the three tools it puts in *Content*.
 *
 * The split is by audience. The Workflow section is where an administrator manages approval groups
 * and reads history, and its four menu items are all reachable from its own sidebar, so it opens
 * `full-section` and gets no per-tool tiles. The three dashboards below are aimed at the editor and
 * live in the Content section, where they are otherwise buried behind its dashboard tab strip —
 * exactly the case `bare` exists for.
 *
 * None declares a `section`: a dashboard's gate is derived from its own `Umb.Condition.SectionAlias`,
 * which for all three names Content.
 *
 * Two carry conditions beyond that, and both are answerable from the desktop — one reads the current
 * user's workflow permissions, the other a server setting. Neither depends on where the extension is
 * mounted, so evaluating them here just saves opening an empty window. The `Umb.Condition.SectionAlias`
 * beside them is *not* listed, and must not be: it is answered relative to the mount point, and the
 * iframe is the thing mounted in Content.
 *
 * Workflow also registers a content-calendar dashboard in its source. It is commented out and never
 * reaches the registry, so it has no entry here.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'workflow',
    ref: 'Umb.Section.Workflow',
    // Label is `#workflow_workflow`; the package translates it.
    icon: 'icon-stamp',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'editing',
    weight: 50,
  },
  {
    // The editor's own dashboard: my tasks, my submissions. Its label is `#workflow_workflow`,
    // identical to the section's, so an inherited name would give two tiles called "Workflow".
    alias: 'workflow-tasks',
    ref: 'workflow.editor.dashboard',
    name: '#umbraDesktop_appWorkflowTasks',
    icon: 'icon-checkbox-dotted-active',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'editing',
    weight: 60,
  },
  {
    alias: 'workflow-search',
    ref: 'Workflow.AdvancedSearch.Dashboard',
    // Inherited label is "Advanced search", which says nothing about Workflow on a flat tile.
    name: '#umbraDesktop_appWorkflowSearch',
    icon: 'icon-document-search',
    evaluateConditions: ['Workflow.Condition.UserPermission'],
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'editing',
    weight: 70,
  },
  {
    alias: 'workflow-release-sets',
    ref: 'Workflow.ReleaseSets.Dashboard',
    name: '#umbraDesktop_appWorkflowReleaseSets',
    icon: 'icon-calendar',
    // Release sets are a feature you switch on, so the setting condition is the one that matters:
    // without it this tile would appear on every install and open empty on most.
    evaluateConditions: ['Workflow.Condition.UserPermission', 'Workflow.Condition.SettingEnabled'],
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'editing',
    weight: 80,
  },
];
```

- [ ] **Step 5: Wire both into the collated catalogue**

In `src/desktop/catalogue/index.ts`, add the imports after `import { entries as content } from './content';`:

```ts
import { entries as forms } from './forms';
import { entries as workflow } from './workflow';
```

and add to the `entries` array, directly after `...content,`:

```ts
    ...forms,
    ...workflow,
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: PASS, 9 passing.

- [ ] **Step 7: Verify the build**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: exit 0.

---

## Task 6: Deploy

Five entries covering two incompatible majors. Read design §3.2 first — v18 removed both v17
dashboards and replaced them with Settings menu items, so an install resolves either the first two
or the last three, never all five.

**Files:**
- Create: `src/desktop/catalogue/deploy.ts`
- Modify: `src/desktop/catalogue/index.ts`
- Modify: `src/desktop/catalogue/commercial.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/desktop/catalogue/commercial.test.ts`:

```ts
import { entries as deploy } from './deploy';

describe('Deploy', () => {
  it('carries both majors, v17 dashboards then v18 menu items', () => {
    expect(deploy.map((e) => e.ref)).to.deep.equal([
      'Deploy.Management.Dashboard',
      'Deploy.Environments.Dashboard',
      'Deploy.MenuItem.Status',
      'Deploy.MenuItem.Schema',
      'Deploy.MenuItem.Configuration',
    ]);
  });

  it('gates the v18 menu items on Settings and leaves the v17 dashboards to derive', () => {
    const menuItems = deploy.filter((e) => e.ref!.startsWith('Deploy.MenuItem.'));
    const dashboards = deploy.filter((e) => e.ref!.endsWith('.Dashboard'));
    for (const entry of menuItems) {
      expect(entry.section, `${entry.alias} infers its URL from the section prefix`).to.equal(
        'Umb.Section.Settings',
      );
    }
    for (const entry of dashboards) {
      expect(entry.section, `${entry.alias} derives its gate from the manifest`).to.be.undefined;
    }
  });

  it('names every entry itself, because "Status" and "Schema" say nothing on a tile', () => {
    for (const entry of deploy) {
      expect(entry.name, `${entry.alias} must name itself`).to.be.a('string');
    }
  });

  it('resolves everything by ref, so the wrong major drops silently', () => {
    for (const entry of deploy) {
      expect(entry.ref, `${entry.alias} must resolve through the registry`).to.be.a('string');
      expect(entry.url, `${entry.alias} must not hardcode a URL`).to.be.undefined;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: FAIL — `./deploy` cannot be resolved.

- [ ] **Step 3: Write the fragment**

Create `src/desktop/catalogue/deploy.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Deploy — five entries covering **two incompatible majors**.
 *
 * Deploy registers no section of its own, so every entry is a dashboard or a menu item. v17 puts a
 * management dashboard in Settings and an environments dashboard in Content. v18 removes both and
 * restructures around a `Deploy.Menu.Settings` sidebar menu holding three menu items instead.
 *
 * The two sets are disjoint: an install resolves the first two or the last three, never all five.
 * Nothing detects the version, and nothing needs to — this works for the same reason
 * `advanced-security.ts` does, and breaks the same way if anyone replaces a `ref` with a `url`,
 * because a URL is not checked against the registry and would ship three dead tiles to every v17
 * install.
 *
 * The dashboards derive their gate from their own `Umb.Condition.SectionAlias`. The menu items
 * cannot — nothing in a menu-item manifest says which section it belongs to — so they state it.
 *
 * Every name is ours. v18's labels are `#deploy_status`, `#deploy_schema` and `#deploy_configuration`,
 * which render as "Status", "Schema" and "Configuration": fine in a Deploy sidebar, meaningless as
 * three flat tiles beside Content and Media. The v18 icons *are* inherited, because those menu items
 * carry one each.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  // v17 — removed in v18.
  {
    alias: 'deploy',
    ref: 'Deploy.Management.Dashboard',
    name: '#umbraDesktop_appDeploy',
    icon: 'icon-umb-deploy',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 20,
  },
  {
    alias: 'deploy-environments',
    ref: 'Deploy.Environments.Dashboard',
    name: '#umbraDesktop_appDeployEnvironments',
    icon: 'icon-umb-deploy',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 30,
  },

  // v18 and later — absent on v17.
  {
    alias: 'deploy-status',
    ref: 'Deploy.MenuItem.Status',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDeployStatus',
    // Icon inherited: the menu item declares `icon-medical-emergency`.
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 40,
  },
  {
    alias: 'deploy-schema',
    ref: 'Deploy.MenuItem.Schema',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDeploySchema',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 50,
  },
  {
    alias: 'deploy-configuration',
    ref: 'Deploy.MenuItem.Configuration',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDeployConfiguration',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 60,
  },
];
```

- [ ] **Step 4: Wire it in**

In `src/desktop/catalogue/index.ts`, add after the `synchronisation` import:

```ts
import { entries as deploy } from './deploy';
```

and in the `entries` array, directly after `...synchronisation,`:

```ts
    ...deploy,
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: PASS, 13 passing.

- [ ] **Step 6: Verify the build**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: exit 0.

---

## Task 7: UI Builder and Commerce

Two single-entry fragments for opposite reasons — read design §3.4 and §3.6.

**Files:**
- Create: `src/desktop/catalogue/ui-builder.ts`
- Create: `src/desktop/catalogue/commerce.ts`
- Modify: `src/desktop/catalogue/index.ts`
- Modify: `src/desktop/catalogue/commercial.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/desktop/catalogue/commercial.test.ts`:

```ts
import { entries as uiBuilder } from './ui-builder';
import { entries as commerce } from './commerce';

describe('UI Builder', () => {
  it('is its one static surface, the Settings menu item', () => {
    expect(uiBuilder.map((e) => e.ref)).to.deep.equal(['UiBuilder.MenuItem.Settings']);
    expect(uiBuilder[0].section).to.equal('Umb.Section.Settings');
  });

  it('inherits both name and icon, which the menu item supplies', () => {
    expect(uiBuilder[0].name).to.be.undefined;
    expect(uiBuilder[0].icon).to.be.undefined;
  });
});

describe('Commerce', () => {
  it('references the bare alias "commerce", which is not a typo', () => {
    // Commerce registers `alias: 'commerce'`, not `Umb.Section.Commerce`. Asserted so that a
    // well-meaning reviewer does not "fix" it into something that resolves to nothing.
    expect(commerce.map((e) => e.ref)).to.deep.equal(['commerce']);
  });

  it('lands in marketing-sales and opens full-section', () => {
    expect(commerce[0].group).to.equal('marketing-sales');
    expect(commerce[0].chromeProfile).to.equal('full-section');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: FAIL — `./ui-builder` cannot be resolved.

- [ ] **Step 3: Write the UI Builder fragment**

Create `src/desktop/catalogue/ui-builder.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco UI Builder — one entry, and it is not a section.
 *
 * UI Builder generates its sections, section views, menus and dashboards at runtime from server
 * configuration, with aliases interpolated from whatever the site configured
 * (`UiBuilder.Section.{alias}`). No catalogue can know them, and none needs to: the desktop's
 * uncertified fallback already surfaces any permitted section it does not recognise in "More",
 * which is the honest answer for a section whose alias is unknowable.
 *
 * What *is* static is the UI Builder entry in Settings → Advanced. It is a default-kind menu item
 * over entity type `uibuilder-root`, so its URL infers, and it declares both a label and an icon,
 * so both are inherited.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'ui-builder',
    ref: 'UiBuilder.MenuItem.Settings',
    section: 'Umb.Section.Settings',
    // Name ("UI Builder") and icon (`icon-tools`) both come from the menu item.
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'development',
    weight: 40,
  },
];
```

- [ ] **Step 4: Write the Commerce fragment**

Create `src/desktop/catalogue/commerce.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Commerce — one entry, because there is nothing else to point at.
 *
 * Commerce navigates by a custom `ucStoreMenuItem` extension type the registry adapter has no case
 * for, and every destination below the section is scoped to a store id. There is no store-independent
 * URL for orders, discounts or gift cards, so a tile for any of them would need a store chosen at
 * catalogue-authoring time. The section opens `full-section` and its own sidebar does the work.
 *
 * **The alias really is the bare string `commerce`**, not `Umb.Section.Commerce`. It looks like an
 * oversight in the package and is not; `commercial.test.ts` asserts it so that nobody corrects it
 * into something that resolves to nothing. Same shape on the 17.x and 18.x branches.
 *
 * The label is the plain string "Commerce", so the name is inherited. Commerce registers no icons,
 * hence a core one.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'commerce',
    ref: 'commerce',
    icon: 'icon-shopping-basket',
    chromeProfile: 'full-section',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    allowMultiple: true,
    group: 'marketing-sales',
    weight: 10,
  },
];
```

- [ ] **Step 5: Wire both in**

In `src/desktop/catalogue/index.ts`, add:

```ts
import { entries as uiBuilder } from './ui-builder';
import { entries as commerce } from './commerce';
```

and in the `entries` array, `...commerce,` after `...workflow,` and `...uiBuilder,` after
`...development,`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: PASS, 17 passing.

- [ ] **Step 7: Verify the build**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: exit 0.

---

## Task 8: Engage, Automate and AI

Read design §3.5, §3.7 and §3.8. Engage is the only fragment whose entries land in two different
groups, and the only one that can use the package's own icon.

**Files:**
- Create: `src/desktop/catalogue/engage.ts`
- Create: `src/desktop/catalogue/automate.ts`
- Create: `src/desktop/catalogue/ai.ts`
- Modify: `src/desktop/catalogue/index.ts`
- Modify: `src/desktop/catalogue/commercial.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/desktop/catalogue/commercial.test.ts`:

```ts
import { entries as engage } from './engage';
import { entries as automate } from './automate';
import { entries as ai } from './ai';

describe('Engage', () => {
  it('is the section plus its Settings configuration item', () => {
    expect(engage.map((e) => e.ref)).to.deep.equal([
      'Umb.Section.Engage',
      'Engage.MenuItem.Configuration',
    ]);
  });

  it('splits across two groups, because configuration is not marketing', () => {
    expect(engage[0].group).to.equal('marketing-sales');
    expect(engage[1].group).to.equal('system');
  });

  it("uses the package's own icon, which exists exactly when Engage does", () => {
    expect(engage[0].icon, 'registered by Engage.Icons.Backoffice, no icon- prefix').to.equal(
      'engage',
    );
  });
});

describe('Automate', () => {
  it('is the section alone, referenced by alias so the pathname rename cannot break it', () => {
    expect(automate.map((e) => e.ref)).to.deep.equal(['Ua.Section.Automate']);
    expect(automate[0].url, 'the pathname is changing from automate to automation').to.be.undefined;
  });
});

describe('Umbraco AI', () => {
  it('references the bare alias "ai", which is not a typo', () => {
    expect(ai.map((e) => e.ref)).to.deep.equal(['ai']);
  });

  it('lands in system', () => {
    expect(ai[0].group).to.equal('system');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: FAIL — `./engage` cannot be resolved.

- [ ] **Step 3: Write the Engage fragment**

Create `src/desktop/catalogue/engage.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Engage — the section, and the Settings item that configures it.
 *
 * Engage replaces the section element wholesale with its own `engageSection` kind and navigates
 * internally by a bespoke `engageScreenElement` type. Its analytics, personalization, A/B testing,
 * profiles and reporting screens are all that type, so none is addressable through the registry, and
 * `Engage.SectionView.Root` — the one standard `sectionView` it registers — *is* the section root.
 * One tile, therefore, and the section's own tab strip does the rest.
 *
 * The icon is Engage's own: it registers an icon literally named `engage`, with no `icon-` prefix,
 * through `Engage.Icons.Backoffice`. The launcher passes `app.icon` straight to `<umb-icon name>`,
 * so this works exactly as uSync's `usync-logo` does, and it is present precisely when the entry is.
 *
 * The configuration item goes to System rather than beside its section: it is a Settings-section
 * workspace for administrators, which is what that group holds. Its inherited label is
 * `#engage_configuration` — "Configuration" — too generic for a flat tile, so this one names itself.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'engage',
    ref: 'Umb.Section.Engage',
    // Label is `#engage_engage`; the package translates it.
    icon: 'engage',
    chromeProfile: 'full-section',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    allowMultiple: true,
    group: 'marketing-sales',
    weight: 20,
  },
  {
    alias: 'engage-configuration',
    ref: 'Engage.MenuItem.Configuration',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appEngageConfiguration',
    // Icon inherited: the menu item declares `icon-settings`.
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'system',
    weight: 50,
  },
];
```

- [ ] **Step 4: Write the Automate fragment**

Create `src/desktop/catalogue/automate.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Automate — the section alone.
 *
 * Its menu items are tree-kind, which `inferUrl` does not infer, and its two other dashboards
 * (`Ua.Dashboard.Runs`, `Ua.Dashboard.Approvals`) are gated on `Ua.Condition.WorkspacesExist`. Both
 * are reachable from the section's own sidebar, so neither earns a tile; if one ever does, that
 * condition is answerable from the desktop and belongs in `evaluateConditions`.
 *
 * **Referencing the alias rather than a URL is load-bearing here.** A live branch
 * (`v18/feature/rename-automate-section-url`) changes this section's pathname from `automate` to
 * `automation` while leaving the alias alone. A section `ref` reads the pathname from the manifest
 * at runtime and survives that; a hardcoded URL would break silently on upgrade.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'automate',
    ref: 'Ua.Section.Automate',
    // Label is `#uaSections_automate`; the package translates it.
    icon: 'icon-lightning',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'system',
    weight: 60,
  },
];
```

- [ ] **Step 5: Write the AI fragment**

Create `src/desktop/catalogue/ai.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco AI — the section alone.
 *
 * **The alias really is the bare string `ai`**, as Commerce's is `commerce`. Asserted in
 * `commercial.test.ts` so nobody expands it into something that resolves to nothing.
 *
 * AI's sidebar mixes three default-kind menu items (Settings, Analytics, Logs) with seven of a kind
 * the package defines itself, `entityContainer`, across the AI, AI Agent and AI Prompt sub-packages.
 * All ten are reachable from the section, so none gets a tile.
 *
 * Worth knowing if that ever changes: the `entityContainer` element builds
 * `section/{pathname}/workspace/{entityType}` — byte-identical to the default kind's route — so
 * `inferUrl` could accept the kind and resolve all seven. It deliberately does not (design D9),
 * because nothing here needs it and it would encode a third-party kind's routing rule on spec.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'ai',
    ref: 'ai',
    // Label is the plain string "AI".
    icon: 'icon-wand',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'system',
    weight: 70,
  },
];
```

- [ ] **Step 6: Wire all three in**

In `src/desktop/catalogue/index.ts`, add:

```ts
import { entries as engage } from './engage';
import { entries as automate } from './automate';
import { entries as ai } from './ai';
```

and in the `entries` array: `...engage,` after `...commerce,`, then `...automate,` and `...ai,` after
`...system,`.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: PASS, 23 passing.

- [ ] **Step 8: Verify the build**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: exit 0.

---

## Task 9: Shared invariants across all eight fragments

The per-package cases above check each fragment's shape. These check the properties that must hold
across every one of them, and the ones that only make sense against the collated catalogue.

**Files:**
- Modify: `src/desktop/catalogue/commercial.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/desktop/catalogue/commercial.test.ts`:

```ts
import { catalogue } from './index';

/** Every commercial fragment's entries, in the order the launcher will weigh them. */
const COMMERCIAL = [
  ...forms,
  ...workflow,
  ...deploy,
  ...uiBuilder,
  ...commerce,
  ...engage,
  ...automate,
  ...ai,
];

/** The only condition aliases the desktop may answer. See design §4.1. */
const ANSWERABLE_CONDITIONS = [
  'Workflow.Condition.UserPermission',
  'Workflow.Condition.SettingEnabled',
  'Ua.Condition.WorkspacesExist',
];

describe('every commercial entry', () => {
  it('is sixteen entries', () => {
    expect(COMMERCIAL).to.have.lengthOf(16);
  });

  it('resolves by ref and hardcodes no URL', () => {
    // The load-bearing invariant. A `ref` is checked against the registry, so an absent package
    // drops the app; a `url` is not, so it ships a tile that 404s on every install without it.
    for (const entry of COMMERCIAL) {
      expect(entry.ref, `${entry.alias} must resolve through the registry`).to.be.a('string');
      expect(entry.url, `${entry.alias} must not hardcode a URL`).to.be.undefined;
    }
  });

  it('names a group that exists', () => {
    const known = new Set(catalogue.groups.map((g) => g.alias));
    for (const entry of COMMERCIAL) {
      expect(known.has(entry.group!), `${entry.alias} points at unknown group "${entry.group}"`).to
        .be.true;
    }
  });

  it('gates every menu-item ref on a section, and no other ref', () => {
    // A menu item's manifest does not say which section it belongs to, so `inferUrl` cannot build
    // its URL without one — the entry would resolve to null and vanish. A dashboard and a section
    // both derive their own, and stating one there would override the manifest with a guess.
    for (const entry of COMMERCIAL) {
      const isMenuItem = entry.ref!.includes('MenuItem');
      expect(
        entry.section !== undefined,
        `${entry.alias} (${entry.ref}) ${isMenuItem ? 'needs' : 'must not declare'} a section`,
      ).to.equal(isMenuItem);
    }
  });

  it('evaluates only conditions the desktop can answer', () => {
    // Naming a mount-dependent condition here would deny the entry on every install, because the
    // desktop shell is mounted in its own section rather than the app's. Fail here instead.
    for (const entry of COMMERCIAL) {
      for (const alias of entry.evaluateConditions ?? []) {
        expect(
          ANSWERABLE_CONDITIONS,
          `${entry.alias} evaluates "${alias}", which is not a documented answerable condition`,
        ).to.contain(alias);
      }
    }
  });

  it('reaches the collated catalogue', () => {
    const collated = new Set(catalogue.entries.map((e) => e.alias));
    for (const entry of COMMERCIAL) {
      expect(collated.has(entry.alias), `${entry.alias} is not spread into index.ts`).to.be.true;
    }
  });
});

describe('the collated catalogue', () => {
  it('gives every entry a unique alias', () => {
    // Aliases key pinned favourites, so a duplicate silently steals another app's pin.
    const aliases = catalogue.entries.map((e) => e.alias);
    expect(new Set(aliases).size, `duplicate alias among ${aliases.join(', ')}`).to.equal(
      aliases.length,
    );
  });

  it('gives every entry a unique weight within its group', () => {
    const byGroup = new Map<string, number[]>();
    for (const entry of catalogue.entries) {
      const weights = byGroup.get(entry.group!) ?? [];
      weights.push(entry.weight!);
      byGroup.set(entry.group!, weights);
    }
    for (const [group, weights] of byGroup) {
      expect(new Set(weights).size, `${group} has two entries at the same weight`).to.equal(
        weights.length,
      );
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it passes or tells you what is wrong**

```bash
cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/catalogue/commercial.test.ts" --node-resolve
```

Expected: PASS, 31 passing. Unlike the earlier tasks this suite may pass first time — it is a net
over work already done. If `reaches the collated catalogue` fails, a fragment was created but not
spread into `index.ts`; if `unique weight within its group` fails, two entries collided and the
weights in the design's §6.3 table are the reference.

- [ ] **Step 3: Verify the whole suite and the build**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm test
```

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: both exit 0.

---

## Task 10: README

**Files:**
- Modify: `README.md` (repository root)

- [ ] **Step 1: Update the Features list**

In the `## Features` section, the launcher bullet currently reads:

```markdown
- A launcher that stays out of the way. Apps are grouped into Editing, Development, Synchronisation, Security, Advanced security, Diagnostics and System, so you find things by what they do.
```

Replace it with:

```markdown
- A launcher that stays out of the way. Apps are grouped into Editing, Marketing and sales, Development, Synchronisation, Security, Advanced security, Diagnostics and System, so you find things by what they do.
```

Then add a new bullet directly after it:

```markdown
- Knows the commercial packages. Forms, Deploy, Workflow, Commerce, Engage, UI Builder, Automate and Umbraco AI each get proper apps with the right name, icon, group and window chrome, instead of a generic tile in More. Nothing to configure: an app appears only if you have that package.
```

- [ ] **Step 2: Add a section documenting the coverage**

Insert a new section directly after `### The app catalogue` and before `### Apps that aren't in the catalogue`:

```markdown
### Umbraco's commercial packages

The catalogue covers the eight commercial packages explicitly, so each opens as a proper app rather
than a generic tile. Entries resolve against the package's own registered extensions, so an app
appears only on installs that have that package, and nothing needs configuring either way.

| Package | What you get | Where it lands |
| --- | --- | --- |
| Umbraco Forms | The Forms section | Editing |
| Umbraco Workflow | The Workflow section, plus Workflow tasks, Workflow search and Release sets as their own windows | Editing |
| Umbraco Deploy | Deploy and Deploy environments on v17; Deploy status, schema and configuration on v18 | Synchronisation |
| Umbraco Commerce | The Commerce section | Marketing and sales |
| Umbraco Engage | The Engage section, and Engage configuration | Marketing and sales, System |
| Umbraco UI Builder | The UI Builder settings workspace | Development |
| Umbraco Automate | The Automate section | System |
| Umbraco AI | The AI section | System |

Most of these are a single app on purpose. Commerce, Engage and UI Builder navigate internally in
ways that have no stable link to point a tile at — Commerce scopes everything to a store, Engage
uses its own screen system, UI Builder generates its sections from your configuration at runtime —
so the section opens with its own sidebar and does the navigating, which is what you want anyway.

UI Builder's generated sections still appear on their own, in More, as any unrecognised section does.

Three Workflow apps only show when they apply to you: Workflow search and Release sets check your
Workflow permissions, and Release sets also checks whether the feature is switched on. Rather than
give you a tile that opens an empty window, the desktop asks first.
```

- [ ] **Step 3: Check the file renders as Markdown only**

```bash
cd /d/github/Umbraco.Community.UmbraDesktop && grep -nE '<(img|br|div|span|table|p) ' README.md
```

Expected: no output. This file is the NuGet package readme (`PackageReadmeFile` in the csproj) and
NuGet escapes raw HTML rather than rendering it, so an `<img>` would show up on the package page as
its own source code.

---

## Task 11: Marketplace listing

**Files:**
- Modify: `umbraco-marketplace.json` (repository root)
- Create: `docs/screenshots/launcher-commercial.png`

- [ ] **Step 1: Update the description**

Replace the `Description` value with:

```json
  "Description": "An OS-style windowed desktop for the Umbraco backoffice. Open content, media, settings and other sections as real draggable, resizable windows and work in several of them side by side. Knows Umbraco's commercial packages: Forms, Deploy, Workflow, Commerce, Engage, UI Builder, Automate and Umbraco AI each get a proper app with the right name, icon and window chrome, and appear only if you have them. Includes a grouped app launcher with pinnable apps, a taskbar, per-user wallpapers, and five chrome themes: the Umbraco look, a retro Umbraco 4, macOS, Windows 11 and Windows 98. Themes restyle the desktop only, never the backoffice inside a window, and adding one of your own is a folder of CSS.",
```

- [ ] **Step 2: Add the tags**

Add these to the `Tags` array, after `"wallpapers"`:

```json
    "umbraco forms",
    "umbraco deploy",
    "umbraco commerce",
    "umbraco engage",
    "umbraco workflow"
```

- [ ] **Step 3: Capture the screenshot**

Open the launcher on an install with at least Forms and Deploy present, so the new groups and apps
are visible, and capture it at the size you want it displayed — the README cannot resize an image,
because NuGet strips the HTML that would do it. Save as `docs/screenshots/launcher-commercial.png`,
matching the dimensions of the existing `docs/screenshots/launcher.png`:

```bash
cd /d/github/Umbraco.Community.UmbraDesktop && ls -l docs/screenshots/
```

- [ ] **Step 4: Reference it**

Add to the `Screenshots` array, after the existing `launcher.png` entry:

```json
    {
      "ImageUrl": "https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/launcher-commercial.png",
      "Caption": "Commercial packages get real apps: Forms in Editing, Commerce in Marketing and sales, Deploy beside uSync."
    },
```

- [ ] **Step 5: Verify the JSON parses**

```bash
cd /d/github/Umbraco.Community.UmbraDesktop && node -e "JSON.parse(require('fs').readFileSync('umbraco-marketplace.json','utf8')); console.log('valid')"
```

Expected: `valid`.

---

## Task 12: Final verification

- [ ] **Step 1: Run both gates**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm test
```

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build
```

Expected: both exit 0.

- [ ] **Step 2: Confirm `optional` is gone**

```bash
cd /d/github/Umbraco.Community.UmbraDesktop && grep -rn "optional" src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop --include='*.ts' | grep -v "optionally"
```

Expected: no output. Any hit is a fragment or test missed in Task 1.

- [ ] **Step 3: Smoke-test in a real backoffice**

Start the site, open the desktop, and check:

- The launcher shows a **Marketing and sales** group between Editing and Development, but only if
  Commerce or Engage is installed — an empty group must not render.
- On an install with none of the eight packages, nothing new appears and the console is silent.
  Watch for at least five seconds: the diagnostic window is `DIAGNOSTIC_DELAY_MS`, so a warning
  arrives late or not at all.
- With a package installed, its app has the right icon and name — not `icon-box`, not a raw
  localisation token like `#sections_forms`. A visible `#…` token means the key is missing from
  `en.ts`.
- Opening each new app lands on the right screen with the right amount of chrome, and no window
  opens blank.

- [ ] **Step 4: Report, do not commit**

Summarise which files changed and which of the sixteen entries were verified against a real install
versus only against the source. Leave everything uncommitted for review.

---

## Notes for whoever executes this

**The aliases are not guessable and not verifiable from this repository.** Every one came from
reading the package's own source on GitHub. If something does not resolve, check design §3 before
assuming the plan is wrong — and if the plan *is* wrong, the package's repository is the arbiter,
not this document.

**Do not "fix" `ref: 'commerce'` or `ref: 'ai'`.** Both are the bare aliases those packages register.

**If a fragment needs a `url` instead of a `ref`, stop.** That is the one change that turns a silent
absence into a dead tile on every install without the package, and it is what `commercial.test.ts`
exists to prevent. Raise it rather than working around the test.

**Task 3 is the only one with real complexity.** If the gate controller misbehaves, the pure
functions in Task 2 are almost certainly fine — the bug will be in lifecycle: an observation alias
colliding, or `track` being called with a fresh config array each recompute so the `key` comparison
never matches and the conditions are rebuilt in a loop.

**As built, `key` is `JSON.stringify(configs)`, not the joined alias string this plan originally
specified.** Review found that comparing aliases alone lets a manifest re-register with the same
aliases but a changed `match` and keep a live api evaluating the stale config — and a stale `false`
hides an app, which is the one direction this design forbids. Serialising the configs still
short-circuits on an unchanged set, because `configs` is a fresh array of the manifest's own objects
and serialises identically. Do not "simplify" it back to aliases.
