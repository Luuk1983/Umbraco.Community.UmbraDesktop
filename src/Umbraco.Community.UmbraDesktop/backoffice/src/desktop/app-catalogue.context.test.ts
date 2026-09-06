import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopAppCatalogueContext } from './app-catalogue.context';
import type { UmbraDesktopApp, UmbraDesktopCatalogue } from './types';
import { catalogue } from './catalogue/index.js';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbCurrentUserContext } from '@umbraco-cms/backoffice/current-user';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Third-party surfaces reach the catalogue through their own `bundle`, which the backoffice
 * loads as a separate dynamic import. Umbraco registers every package's bundle *declaration* in
 * one batch, but the modules then resolve in whatever order they finish — so an entry's `ref`
 * can still be unregistered at the moment the desktop mounts. Reloading straight into the
 * desktop section (an F5, a bookmark) hits this reliably, and it is silent: no warning, and
 * the app is simply missing until the next full boot.
 *
 * The catalogue must therefore track the registry rather than sample it once.
 */

/** Minimal controller host for the context under test. */
class TestHostElement extends UmbLitElement {}
customElements.define('umbradesktop-catalogue-test-host', TestHostElement);

/**
 * The shortened diagnostic window these tests run with, so a case need not sit on the production
 * delay. Read by both {@link setup} (as `diagnosticDelayMs`) and {@link settleDiagnostics} (as the
 * basis for its wait), so the relationship between the two is stated once rather than typed twice.
 *
 * It is not simply "as short as possible". The quiet-window case asserts that *no* warning has been
 * logged after two `setTimeout(0)` hops, so this value is the budget the runner has to get between
 * two adjacent macrotasks before the timer fires and the assertion wrongly fails. At 20ms that
 * budget was thin enough to flake on a loaded machine — a full run that normally takes 40s took 73s
 * and took this case with it. 150ms is still fast (four cases wait 4x it, so under a second total)
 * while being longer than any plausible stall between adjacent macrotasks.
 */
const TEST_DIAGNOSTIC_DELAY_MS = 150;

const SETTINGS_SECTION = {
  type: 'section',
  alias: 'Umb.Section.Settings',
  name: 'Settings',
  meta: { label: 'Settings', pathname: 'settings' },
};

/** A one-entry catalogue standing in for the real `synchronisation` fragment. */
const CATALOGUE: UmbraDesktopCatalogue = {
  groups: [{ alias: 'synchronisation', label: 'Synchronisation' }],
  entries: [
    {
      alias: 'usync',
      ref: 'usync.menu.item',
      section: 'Umb.Section.Settings',
      group: 'synchronisation',
    },
  ],
  excludedSections: [],
};

/**
 * Mount a host with a stubbed current-user context and a catalogue bound to a fresh registry.
 * @param catalogue The catalogue to resolve. Defaults to the one-entry {@link CATALOGUE} fixture.
 * @param sections The section manifests to register and permit. Defaults to {@link SETTINGS_SECTION}
 *   alone, so every existing call site is unaffected; the shipped-catalogue tests below pass both
 *   Settings and Content, since the Workflow dashboards they exercise derive their gate from Content.
 */
async function setup(
  catalogue: UmbraDesktopCatalogue = CATALOGUE,
  sections: ReadonlyArray<{ alias: string }> = [SETTINGS_SECTION],
) {
  const host = await fixture<TestHostElement>(
    html`<umbradesktop-catalogue-test-host></umbradesktop-catalogue-test-host>`,
  );
  const allowedSections = new UmbArrayState<string>(
    sections.map((s) => s.alias),
    (alias) => alias,
  );
  host.provideContext(UMB_CURRENT_USER_CONTEXT, {
    allowedSections: allowedSections.asObservable(),
    getHostElement: () => host,
  } as unknown as UmbCurrentUserContext);

  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  for (const section of sections) {
    registry.register(section as unknown as UmbExtensionManifest);
  }

  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(String(args[0]));

  const context = new UmbraDesktopAppCatalogueContext(host, {
    catalogue,
    registry,
    // Keep the settle window short so the tests do not sit on the production delay.
    diagnosticDelayMs: TEST_DIAGNOSTIC_DELAY_MS,
  });
  let apps: UmbraDesktopApp[] = [];
  const subscription = context.apps.subscribe((value) => (apps = value));

  return {
    registry,
    warnings,
    aliases: () => apps.map((app) => app.alias),
    app: (alias: string) => apps.find((a) => a.alias === alias),
    teardown: () => {
      console.warn = realWarn;
      subscription.unsubscribe();
      context.destroy();
    },
  };
}

/** Yield to the microtask/observable queue so a registration can propagate. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Wait past the (shortened) diagnostic settle window so any warning has been flushed. Four times
 * the delay gives ample slack for the timer callback and its microtasks to run on a busy test
 * runner, while still finishing in well under a second.
 */
const settleDiagnostics = () => new Promise((resolve) => setTimeout(resolve, TEST_DIAGNOSTIC_DELAY_MS * 4));

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

it('picks up an entry whose referenced extension registers after the desktop has mounted', async () => {
  const harness = await setup();
  try {
    await settle();
    expect(harness.aliases(), 'uSync is not installed yet, so no app').to.not.contain('usync');

    // uSync's bundle finishes importing and registers its menu item.
    harness.registry.register({
      type: 'menuItem',
      alias: 'usync.menu.item',
      name: 'uSync',
      meta: { entityType: 'usync-root', icon: 'usync-logo' },
    } as unknown as UmbExtensionManifest);
    await settle();

    expect(harness.aliases(), 'the late-registered uSync app should appear').to.contain('usync');
    expect(harness.app('usync')!.url).to.equal('/umbraco/section/settings/workspace/usync-root');
  } finally {
    harness.teardown();
  }
});

it('picks up a section that registers after the desktop has mounted', async () => {
  const harness = await setup();
  try {
    await settle();
    expect(harness.aliases()).to.contain('section:Umb.Section.Settings');

    // A section the user is permitted but whose owning package had not registered yet.
    harness.registry.register({
      type: 'section',
      alias: 'Umb.Section.Media',
      name: 'Media',
      meta: { label: 'Media', pathname: 'media' },
    } as unknown as UmbExtensionManifest);
    await settle();

    // Still gated: the user is not permitted Media, so it must not appear.
    expect(harness.aliases()).to.not.contain('section:Umb.Section.Media');
  } finally {
    harness.teardown();
  }
});

/**
 * A catalogue whose entry's `ref` is permitted to resolve but never can. `unresolved:` is one of
 * the two diagnostics still routed through the shared `#diagnose` / `#scheduleDiagnostics`
 * machinery in app-catalogue.context.ts, and it is the better trigger of the two because it is
 * only reachable once a manifest arrives — `ungated:` fires synchronously from a bad catalogue
 * entry and cannot exercise the settling behaviour below.
 *
 * The `ref` resolves to a `menuItem` of `kind: 'tree'`; `inferUrl` (url-inference.ts) deliberately
 * refuses to infer a URL for anything but a default-kind menu item, so this entry is permitted
 * (its gate section is registered and allowed) yet still yields no URL — exactly the condition
 * `#resolveEntry` calls `unresolved:` for.
 */
const UNRESOLVABLE_REF_CATALOGUE: UmbraDesktopCatalogue = {
  groups: [{ alias: 'system', label: 'System' }],
  entries: [
    { alias: 'legacy-tree', ref: 'legacy.tree.menu.item', section: 'Umb.Section.Settings', group: 'system' },
  ],
  excludedSections: [],
};

/** The tree-kind menu item manifest that makes {@link UNRESOLVABLE_REF_CATALOGUE}'s entry unresolvable. */
const LEGACY_TREE_MENU_ITEM = {
  type: 'menuItem',
  alias: 'legacy.tree.menu.item',
  name: 'Legacy tree',
  kind: 'tree',
  meta: { entityType: 'legacy-tree' },
} as unknown as UmbExtensionManifest;

/**
 * Protects the quiet window (`#scheduleDiagnostics`'s `DIAGNOSTIC_DELAY_MS` timer), not the
 * `unresolved` diagnostic itself. `#diagnose` never logs inline — it only records a pending
 * diagnostic — precisely because a condition can still resolve itself before the registry
 * settles; only what survives to the flush is a genuine misconfiguration. The regression this
 * guards against is someone making `#diagnose` (or a future diagnostic) call `console.warn`
 * directly: this test still fails if `unresolved:` starts logging the instant the tree-kind
 * manifest registers, before the window has had a chance to elapse.
 */
it('does not warn about a diagnostic condition until the quiet window has elapsed', async () => {
  const harness = await setup(UNRESOLVABLE_REF_CATALOGUE);
  try {
    await settle();
    expect(harness.warnings, 'the ref has not registered yet; an absent ref is silent').to.be.empty;

    // The ref registers, but to a tree-kind menu item — permitted, yet unresolvable.
    harness.registry.register(LEGACY_TREE_MENU_ITEM);
    await settle();

    // The condition holds the instant the manifest arrives, but nothing must be logged yet.
    expect(harness.warnings, 'the diagnostic must sit in the pending set, not log immediately').to.be.empty;

    await settleDiagnostics();
    expect(harness.warnings, 'once the quiet window elapses the surviving diagnostic is flushed').to.have.lengthOf(
      1,
    );
    expect(harness.warnings[0], 'the flushed warning must identify the entry under test').to.contain('legacy-tree');
  } finally {
    harness.teardown();
  }
});

/**
 * Protects `#reportedDiagnostics`, the set that keeps a surviving diagnostic from being logged
 * again on a later recompute. `#recompute` rebuilds `#pendingDiagnostics` from scratch on every
 * registry change and `#diagnose` bails out early for any key already in `#reportedDiagnostics`,
 * so a diagnostic that has already fired must not fire a second time just because something
 * unrelated (here, an unrelated section registering) causes another recompute and another settle.
 * The regression this guards against is that guard being dropped, which would turn one real
 * misconfiguration into a `console.warn` on every recompute for the rest of the session.
 */
it('reports a surviving diagnostic once, not again on a later recompute', async () => {
  const harness = await setup(UNRESOLVABLE_REF_CATALOGUE);
  try {
    await settle();
    harness.registry.register(LEGACY_TREE_MENU_ITEM);
    await settle();
    await settleDiagnostics();
    expect(harness.warnings, 'the diagnostic must have been flushed once already').to.have.lengthOf(1);
    expect(harness.warnings[0], 'the flushed warning must identify the entry under test').to.contain('legacy-tree');

    // An unrelated recompute (see "picks up a section that registers after the desktop has
    // mounted" above) must not cause the already-reported diagnostic to be logged again.
    harness.registry.register({
      type: 'section',
      alias: 'Umb.Section.Media',
      name: 'Media',
      meta: { label: 'Media', pathname: 'media' },
    } as unknown as UmbExtensionManifest);
    await settle();
    await settleDiagnostics();

    expect(harness.warnings, 'the diagnostic must still have been reported exactly once').to.have.lengthOf(1);
    expect(harness.warnings[0], 'the flushed warning must identify the entry under test').to.contain('legacy-tree');
  } finally {
    harness.teardown();
  }
});

/**
 * Protects `#recompute`'s `this.#pendingDiagnostics.clear()`. Every recompute rebuilds the pending
 * set from scratch, so a condition that no longer holds by the time the next recompute runs
 * simply is not re-recorded — it drops out before `#scheduleDiagnostics`'s quiet window ever
 * flushes it. This models a real case: a package's bundle unregistering (or re-registering under
 * a different shape) while another package's bundle is still importing, which is exactly the
 * out-of-order boot `app-catalogue.context.ts`'s class doc describes.
 *
 * The regression this guards against is that `.clear()` being dropped from `#recompute`: without
 * it, a diagnostic recorded once would survive in `#pendingDiagnostics` even after its condition
 * resolves, and would be flushed and logged despite nothing being wrong by the time the window
 * elapses.
 */
it('drops a diagnostic whose condition resolves before the window elapses', async () => {
  const harness = await setup(UNRESOLVABLE_REF_CATALOGUE);
  try {
    await settle();

    // The ref registers as unresolvable (permitted, but no URL can be inferred): recorded as
    // pending, not yet flushed, exactly as in the tests above.
    harness.registry.register(LEGACY_TREE_MENU_ITEM);
    await settle();

    // The package unregisters its menu item again before the quiet window elapses — e.g. it
    // re-registers under a different kind, or its bundle tears itself down. The condition that
    // triggered `unresolved:legacy-tree` no longer holds.
    harness.registry.unregister(LEGACY_TREE_MENU_ITEM.alias);
    await settle();

    await settleDiagnostics();
    expect(harness.warnings, 'a condition gone before the flush must never be logged').to.be.empty;
  } finally {
    harness.teardown();
  }
});

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

/**
 * A condition manifest whose api reports the verdict this test wants, once.
 *
 * The alias is a parameter rather than a constant because the point of several of these cases is
 * *which* conditions the gate instantiates, not just what they answer. Registering a denying
 * condition under an alias the entry never opted into is the only way a test can tell "the gate
 * ignored it" apart from "the gate looked it up and found nothing registered".
 * @param registry The harness registry to register into.
 * @param alias The condition alias to register under.
 * @param permitted The verdict the api reports the moment it is constructed.
 */
function registerCondition(
  registry: UmbExtensionRegistry<UmbExtensionManifest>,
  alias: string,
  permitted: boolean,
) {
  registry.register({
    type: 'condition',
    alias,
    name: `${alias} (test)`,
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
    registerCondition(harness.registry, 'Workflow.Condition.UserPermission', false);
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
    registerCondition(harness.registry, 'Workflow.Condition.UserPermission', true);
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
    // A SectionAlias condition that says no. The entry does not name it in evaluateConditions,
    // so the gate must never instantiate it — the iframe, mounted in the right section, is what
    // answers this one. If the gate ever evaluated it, every dashboard entry would vanish.
    registerCondition(harness.registry, 'Umb.Condition.SectionAlias', false);
    registerCondition(harness.registry, 'Workflow.Condition.UserPermission', true);
    await settle();
    await settle();
    expect(
      harness.aliases(),
      'SectionAlias is the iframe’s question, not the desktop’s',
    ).to.contain('release-sets');
  } finally {
    harness.teardown();
  }
});

/** Content, which the shipped Workflow dashboards derive as their gate from their own manifests. */
const CONTENT_SECTION = {
  type: 'section',
  alias: 'Umb.Section.Content',
  name: 'Content',
  meta: { label: 'Content', pathname: 'content' },
};

/**
 * Registers the two shipped Workflow dashboards that name `evaluateConditions`, with the conditions
 * transcribed from the design doc's surface inventory rather than copied from `workflow.ts` — so an
 * alias that drifts between the fragment and the package fails here rather than silently permitting.
 */
function registerWorkflowDashboards(registry: UmbExtensionRegistry<UmbExtensionManifest>) {
  const section = { alias: 'Umb.Condition.SectionAlias', match: 'Umb.Section.Content' };
  registry.register({
    type: 'dashboard',
    alias: 'Workflow.AdvancedSearch.Dashboard',
    name: 'Advanced search',
    meta: { label: '#workflow_search_advancedSearch', pathname: 'advanced-search' },
    conditions: [section, { alias: 'Workflow.Condition.UserPermission', match: 'search' }],
  } as unknown as UmbExtensionManifest);
  registry.register({
    type: 'dashboard',
    alias: 'Workflow.ReleaseSets.Dashboard',
    name: 'Release sets',
    meta: { label: '#workflow_releaseSets', pathname: 'release-sets' },
    conditions: [
      section,
      { alias: 'Workflow.Condition.UserPermission', match: 'releaseSet.read' },
      { alias: 'Workflow.Condition.SettingEnabled', match: 'releaseSetsEnabled' },
    ],
  } as unknown as UmbExtensionManifest);
}

/**
 * The shipped catalogue's only two conditional entries, resolved through the real adapter. They
 * meet the gate *together* — both name `Workflow.Condition.UserPermission` — and one names two
 * conditions. The single-entry fixture above cannot tell a per-entry observation apart from one
 * that evicts its predecessor, nor a per-config verdict slot apart from one that always writes
 * index 0.
 */
describe('the shipped catalogue through the condition gate', () => {
  it('resolves both Workflow dashboards when no condition has reported', async () => {
    const harness = await setup(catalogue, [SETTINGS_SECTION, CONTENT_SECTION]);
    try {
      registerWorkflowDashboards(harness.registry);
      await settle();
      expect(harness.aliases()).to.contain('workflow-search');
      expect(harness.aliases()).to.contain('workflow-release-sets');
      expect(harness.app('workflow-release-sets')!.url).to.equal(
        '/umbraco/section/content/dashboard/release-sets',
      );
    } finally {
      harness.teardown();
    }
  });

  it('drops both when the condition they share denies', async () => {
    // One condition alias, two tracked entries. If the gate's per-entry observation alias were
    // dropped, the second entry's observation would evict the first's and workflow-search would
    // survive with an uninstantiated condition.
    const harness = await setup(catalogue, [SETTINGS_SECTION, CONTENT_SECTION]);
    try {
      registerWorkflowDashboards(harness.registry);
      registerCondition(harness.registry, 'Workflow.Condition.UserPermission', false);
      await settle();
      await settle();
      expect(harness.aliases()).to.not.contain('workflow-search');
      expect(harness.aliases()).to.not.contain('workflow-release-sets');
    } finally {
      harness.teardown();
    }
  });

  it('denies release sets alone when only its second condition says no', async () => {
    // The catalogue's only two-condition entry. A verdict slot that ignored its config index would
    // still pass every other case in this file.
    const harness = await setup(catalogue, [SETTINGS_SECTION, CONTENT_SECTION]);
    try {
      registerWorkflowDashboards(harness.registry);
      registerCondition(harness.registry, 'Workflow.Condition.UserPermission', true);
      registerCondition(harness.registry, 'Workflow.Condition.SettingEnabled', false);
      await settle();
      await settle();
      expect(harness.aliases(), 'search evaluates only the permission').to.contain('workflow-search');
      expect(harness.aliases()).to.not.contain('workflow-release-sets');
    } finally {
      harness.teardown();
    }
  });
});
