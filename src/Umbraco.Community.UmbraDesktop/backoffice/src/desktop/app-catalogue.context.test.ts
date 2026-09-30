import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopAppCatalogueContext } from './app-catalogue.context';
import type { UmbraDesktopApp, UmbraDesktopCatalogue, UmbraDesktopGroup } from './types';
import { catalogue } from './catalogue/index.js';
import { UMBRADESKTOP_SECTION_ALIAS, UMBRADESKTOP_SECTION_PATHNAME } from './constants';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import type { UmbConditionConfigBase } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
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
 * A condition that is satisfied as soon as it exists, for the mid-session flip case.
 *
 * `UmbConditionBase` rather than a hand-written object with a `permitted` property, because the
 * behaviour under test is Umbraco's condition evaluation and not our restatement of it: the base
 * class is what a real package's condition extends, and its `permitted` setter is what notifies the
 * extension initializer. Setting it in the constructor is legal and is what a condition with a
 * synchronously knowable answer does (`UmbSwitchCondition` does the same on a timer).
 */
class MetCondition extends UmbConditionBase<UmbConditionConfigBase> {
  /**
   * @param host The extension initializer this condition is a controller of.
   * @param args Umbraco's condition arguments: the config from the manifest, and the callback that
   *   re-evaluates the extension when `permitted` moves.
   */
  constructor(
    host: UmbControllerHost,
    args: { config: UmbConditionConfigBase; onChange: (permitted: boolean) => void },
  ) {
    super(host, args);
    this.permitted = true;
  }
}

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

  // Registered `umbraDesktopApp` manifests reach the context through
  // `UmbExtensionsManifestInitializer`, which coalesces its callbacks on an **animation frame**
  // (`UmbBaseExtensionsInitializer` does, so a burst of registrations is one recompute). This
  // runner gives a page a frame only while that page is the visible one, and running the whole
  // suite makes every page `hidden`: measured, a registration's frame arrives inside a millisecond
  // when this file runs alone and has still not arrived three seconds later when it runs with the
  // other 37, so the registered-app cases below would pass alone and time out in `npm test`. A
  // frame is the one thing a headless background page cannot be asked for, so the debounce is
  // redirected onto the microtask queue for the life of this context. Legitimate because the
  // debounce is a coalescing optimisation and not the behaviour under test, and it is what lets
  // every case below settle the same way every other case in this file does.
  //
  // A microtask specifically, not a `setTimeout`: the initializer schedules its flush at the end of
  // its own `await` chain, so a macrotask replacement would still land *after* the `settle()` the
  // test does immediately after registering, and this would trade a hang for a coin flip. It also
  // must not be synchronous, because the initializer assigns the handle this returns *after* the
  // callback would have run and would then believe a flush was forever pending.
  //
  // `cancelAnimationFrame` is replaced along with it, and has to be: the initializer cancels its
  // pending frame in both `hostDisconnected` and `destroy`, and the handles it holds are the
  // counterfeit ones minted below. Handing those to the *real* `cancelAnimationFrame` is a call to
  // cancel frame 1, 2, 3 of whatever genuinely asked for one in this page, which nothing here would
  // report and every reader would have to rule out. Honouring the cancel is also the truer stand-in:
  // a cancelled flush must not arrive, which is exactly what the real pair guarantees.
  const realRequestAnimationFrame = window.requestAnimationFrame;
  const realCancelAnimationFrame = window.cancelAnimationFrame;
  let frameHandle = 0;
  const cancelledFrames = new Set<number>();
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    // A truthy handle, since the initializer reads its own stored handle as a boolean.
    const handle = ++frameHandle;
    queueMicrotask(() => {
      if (cancelledFrames.has(handle)) return;
      callback(performance.now());
    });
    return handle;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((handle: number) => {
    cancelledFrames.add(handle);
  }) as typeof window.cancelAnimationFrame;

  const context = new UmbraDesktopAppCatalogueContext(host, {
    catalogue,
    registry,
    // Keep the settle window short so the tests do not sit on the production delay.
    diagnosticDelayMs: TEST_DIAGNOSTIC_DELAY_MS,
  });
  let apps: UmbraDesktopApp[] = [];
  const subscription = context.apps.subscribe((value) => (apps = value));
  let catalogueGroups: UmbraDesktopGroup[] = [];
  const groupSubscription = context.catalogueGroups.subscribe((value) => (catalogueGroups = value));

  return {
    /** The context itself, for cases about its own accessors rather than its output. */
    context,
    /** The desktop element the context is scoped to, so a test can take the desktop away. */
    host,
    registry,
    warnings,
    aliases: () => apps.map((app) => app.alias),
    app: (alias: string) => apps.find((a) => a.alias === alias),
    /** The merged catalogue's groups, for the cases about a package bringing a group of its own. */
    catalogueGroups: () => catalogueGroups,
    /** Only the desktop's own warnings, so an unrelated Umbraco line cannot fail an assertion. */
    desktopWarnings: () => warnings.filter((w) => w.includes('[UmbraDesktop]')),
    teardown: () => {
      console.warn = realWarn;
      window.requestAnimationFrame = realRequestAnimationFrame;
      window.cancelAnimationFrame = realCancelAnimationFrame;
      subscription.unsubscribe();
      groupSubscription.unsubscribe();
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

/** A section a test package owns. */
const PKG_SECTION = { type: 'section', alias: 'Pkg.Section', name: 'Pkg', meta: { label: 'Pkg', pathname: 'pkg' } };

/** The desktop's own section, for the cases about not opening a desktop inside itself. */
const DESKTOP_SECTION = {
  type: 'section',
  alias: UMBRADESKTOP_SECTION_ALIAS,
  name: 'Desktop',
  meta: { label: 'Desktop', pathname: UMBRADESKTOP_SECTION_PATHNAME },
};

/**
 * Register a package catalogue the way a package's bundle would.
 * @param registry The registry under test.
 * @param alias The catalogue manifest's alias.
 * @param meta What it defines. Untyped on purpose: several cases send JSON that is wrong.
 * @param over Extra manifest fields, such as `weight` or `conditions`.
 */
function registerCatalogue(
  registry: UmbExtensionRegistry<UmbExtensionManifest>,
  alias: string,
  meta: unknown,
  over: Record<string, unknown> = {},
) {
  registry.register({ type: 'umbraDesktopCatalogue', alias, name: alias, meta, ...over } as unknown as UmbExtensionManifest);
}

/**
 * Register a default-kind menu item, the kind whose URL the desktop infers from an entity type.
 * @param registry The registry under test.
 * @param alias The menu item's alias.
 * @param entityType Its workspace entity type.
 */
function registerMenuItem(registry: UmbExtensionRegistry<UmbExtensionManifest>, alias: string, entityType: string) {
  registry.register({ type: 'menuItem', alias, name: alias, meta: { entityType } } as unknown as UmbExtensionManifest);
}

/**
 * A catalogue whose single entry is a misconfiguration only its author could have made: a `url`
 * with no `section` gate, so it can never appear anywhere.
 *
 * It used to be an entry with an absent `ref`, which is no longer a misconfiguration at all. Every
 * curated entry now points at a package a site need not have — that is what the commercial-package
 * catalogue is — so an unresolved `ref` is the ordinary case and the diagnostic for it was removed
 * rather than made conditional. The lifecycle behaviour below is unchanged and still needs *a*
 * diagnostic to observe, so it observes one that survives.
 */
const MISCONFIGURED_CATALOGUE: UmbraDesktopCatalogue = {
  groups: [{ alias: 'system', label: 'System' }],
  entries: [{ alias: 'ungated', url: '/umbraco/section/settings', group: 'system' }],
  excludedSections: [],
};

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
    expect(harness.app('usync')!.content).to.deep.equal({
      kind: 'iframe',
      url: '/umbraco/section/settings/workspace/usync-root',
    });
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

it('surfaces a registered umbraDesktopApp even though no section permits it', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.Minesweeper',
      element: async () => ({}),
      meta: { label: '#pkg_minesweeper', icon: 'icon-bomb', group: 'games' },
    } as unknown as UmbExtensionManifest);
    await settle();

    const app = harness.app('Pkg.Minesweeper');
    expect(app, 'a registered app needs no permitted section').to.not.be.undefined;
    expect(app!.content.kind).to.equal('element');
    expect(app!.icon).to.equal('icon-bomb');
    expect(app!.group).to.equal('games');
  } finally {
    harness.teardown();
  }
});

it('drops a registered app whose condition is never met', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.Gated',
      element: async () => ({}),
      meta: { label: '#pkg_gated' },
      // A condition whose alias nothing registers can never be satisfied, which is what an unmet
      // condition looks like from here. This is the test that fails if the implementation reaches
      // for `byType` instead of the manifest initializer, because `byType` never evaluates these.
      conditions: [{ alias: 'Pkg.Condition.NeverRegistered' }],
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    expect(harness.aliases()).to.not.contain('Pkg.Gated');
  } finally {
    harness.teardown();
  }
});

/**
 * The other direction, and the one a live desktop actually depends on: an app whose condition is
 * unmet must appear the moment it *becomes* met.
 *
 * A condition flipping mid-session is the one thing no other input to this context does, and it is
 * the whole reason the registered apps come through `UmbExtensionsManifestInitializer` rather than a
 * `byType` sample. The unmet direction alone cannot tell that implementation from one that simply
 * drops every conditioned manifest forever, which is a plausible bug and would leave a package's app
 * permanently invisible on a desktop where its condition holds.
 *
 * The flip is staged the way it happens in an install: the app's manifest names a condition alias
 * that nothing has registered yet (its owning package's bundle is still importing), so the
 * initializer has no controller for it and the app is held back; the condition extension then
 * registers, its controller is created, and it reports itself permitted.
 */
it('surfaces a registered app when its condition becomes satisfied mid-session', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.Gated.Late',
      element: async () => ({}),
      meta: { label: '#pkg_gated_late' },
      conditions: [{ alias: 'Pkg.Condition.Late' }],
    } as unknown as UmbExtensionManifest);
    await settle();
    expect(harness.aliases(), 'nothing provides the condition yet').to.not.contain('Pkg.Gated.Late');

    // The condition's own package finishes importing.
    harness.registry.register({
      type: 'condition',
      alias: 'Pkg.Condition.Late',
      name: 'Late Condition',
      api: MetCondition,
    } as unknown as UmbExtensionManifest);
    await settle();

    expect(harness.aliases(), 'a met condition must let the app through').to.contain('Pkg.Gated.Late');
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

it('keeps a registered app when its manifest carries no conditions at all', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.Ungated',
      element: async () => ({}),
      meta: { label: '#pkg_ungated' },
      conditions: [],
    } as unknown as UmbExtensionManifest);
    await settle();

    expect(harness.aliases(), 'no conditions means permitted').to.contain('Pkg.Ungated');
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

/**
 * The invariant this whole file exists for, restated for registered apps and with *two*
 * registrations rather than one: a package that finishes importing while the desktop is already up
 * must appear, and it must appear *beside* the app that was already there rather than in place of
 * it. One registration proves neither half, because an implementation that samples the permitted
 * set once and an implementation that replaces it wholesale on every emission both pass a
 * single-app case. The second app is what tells them apart.
 */
it('adds a second registered app without losing the first', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.First',
      element: async () => ({}),
      meta: { label: '#pkg_first' },
    } as unknown as UmbExtensionManifest);
    await settle();
    expect(harness.aliases()).to.contain('Pkg.First');

    // A second package's bundle lands later in the session.
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.Second',
      element: async () => ({}),
      meta: { label: '#pkg_second' },
    } as unknown as UmbExtensionManifest);
    await settle();

    expect(harness.aliases()).to.contain('Pkg.Second');
    expect(harness.aliases(), 'the app that was already there must survive').to.contain('Pkg.First');
  } finally {
    harness.teardown();
  }
});

/**
 * A manifest with no `element` is dropped, and the drop is *reported*. Silence was the earlier
 * behaviour and it is the one failure mode a package author cannot debug: their tile never appears,
 * with nothing in the console to say the desktop saw the manifest and refused it. This context
 * already owns the dev-facing register for exactly that (see `#diagnose`), so the drop goes there.
 */
it('reports a registered app dropped for having no element', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.NoElement',
      meta: { label: '#pkg_noelement' },
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    expect(harness.aliases(), 'a tile with nothing behind it is worse than no tile').to.not.contain('Pkg.NoElement');
    const dropped = harness.warnings.filter((w) => w.includes('Pkg.NoElement'));
    expect(dropped, 'the author needs one line saying why').to.have.lengthOf(1);
  } finally {
    harness.teardown();
  }
});

/**
 * The same drop, but for the manifest an author is far more likely to have actually written: `js`
 * instead of `element`. `js` is inherited from `ManifestElement`, it is the field every other
 * element extension accepts, and it type-checks, so the compiler gives no hint. Asserted here as
 * well as in `registered-apps.test.ts` because the reason is only worth anything if it survives the
 * trip to the console: this context composes the line, and a wording change that stopped reaching
 * the author would pass the pure test and fix nothing.
 */
it('tells a registered app dropped for using "js" that "js" is why', async () => {
  const harness = await setup();
  try {
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'Pkg.WrongField',
      js: '/App_Plugins/pkg/game.js',
      meta: { label: '#pkg_wrongfield' },
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    expect(harness.aliases(), 'the desktop reads only "element"').to.not.contain('Pkg.WrongField');
    const [line, ...rest] = harness.warnings.filter((w) => w.includes('Pkg.WrongField'));
    expect(rest, 'one line, not one per field').to.deep.equal([]);
    expect(line, 'the console line names the field that was ignored').to.contain('"js"');
  } finally {
    harness.teardown();
  }
});

/**
 * A registered app that reuses a curated alias now takes it over (design D4), where it used to be
 * dropped. One alias still means one app, since a pin is stored under it, and the console says what
 * was replaced, because an app replacing a deep link is never like-for-like (D13).
 */
it('lets a registered app take over an alias a curated entry owns, and says so', async () => {
  const harness = await setup();
  try {
    registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'usync',
      element: async () => ({}),
      meta: { label: '#pkg_usync' },
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    expect(harness.aliases().filter((a) => a === 'usync'), 'one alias, one app').to.have.lengthOf(1);
    expect(harness.app('usync')!.content.kind, 'the package wins').to.equal('element');
    expect(harness.desktopWarnings().filter((w) => w.includes('"usync"') && w.includes('replaces'))).to.have.lengthOf(1);
  } finally {
    harness.teardown();
  }
});

describe('package catalogues', () => {
  it('shows the group and section entry a catalogue defines, instead of the fallback tile', async () => {
    const harness = await setup(CATALOGUE, [SETTINGS_SECTION, PKG_SECTION]);
    try {
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        groups: [{ alias: 'pkg', label: '#pkg_group', weight: 22 }],
        entries: [{ alias: 'Pkg.App', ref: 'Pkg.Section', icon: 'icon-rocket', group: 'pkg' }],
      });
      await settle();

      const app = harness.app('Pkg.App');
      expect(app, 'a package entry resolves like a curated one').to.not.equal(undefined);
      expect(app!.content).to.deep.equal({ kind: 'iframe', url: '/umbraco/section/pkg' });
      expect(app!.coversSection).to.equal('Pkg.Section');
      expect(harness.aliases(), 'the section needs no fallback tile any more').to.not.contain('section:Pkg.Section');
      expect(harness.catalogueGroups().map((group) => group.alias)).to.contain('pkg');
      expect(app!.group, 'and its app is in it').to.equal('pkg');
    } finally {
      harness.teardown();
    }
  });

  it('replaces a curated entry that shares its alias, silently when it opens the same screen', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', chromeProfile: 'bare' }],
      });
      await settleDiagnostics();

      expect(harness.app('usync')!.chromeProfile, "the package's definition is used").to.equal('bare');
      expect(harness.desktopWarnings(), 'a like-for-like replacement is the feature working').to.deep.equal([]);
    } finally {
      harness.teardown();
    }
  });

  it('reports a replacement that opens something else', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'usync', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settleDiagnostics();

      expect(harness.desktopWarnings().some((w) => w.includes('replaces the desktop\'s own app "usync"'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  /**
   * The recursion trap (design D16): a package entry introduces a ref nothing watched, and the
   * context subscribes it from inside a recompute. Marking after subscribing, with the callbacks free
   * to recompute, loops until the stack overflows, and RxJS swallows the overflow: measured, the case
   * still finishes, with the right app, after a couple of hundred nested subscriptions. So it counts
   * the subscriptions rather than trusting that it finished.
   */
  it('picks up a catalogue before the extension its entry points at, and again when that registers', async () => {
    const harness = await setup();
    try {
      let observations = 0;
      const byAlias = harness.registry.byAlias.bind(harness.registry);
      harness.registry.byAlias = ((alias: string) => {
        if (alias === 'Pkg.MenuItem') observations++;
        return byAlias(alias);
      }) as typeof harness.registry.byAlias;
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'Pkg.Tool', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settle();
      expect(harness.aliases(), 'nothing to open yet').to.not.contain('Pkg.Tool');
      expect(observations, 'the new ref is observed once, not once per nested recompute').to.equal(1);

      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-tool');
      await settle();
      expect(harness.app('Pkg.Tool')!.content).to.deep.equal({
        kind: 'iframe',
        url: '/umbraco/section/settings/workspace/pkg-tool',
      });
    } finally {
      harness.teardown();
    }
  });

  it("keeps the curated entry while a catalogue's condition is unmet", async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
      registerCatalogue(
        harness.registry,
        'Pkg.Catalogue',
        { entries: [{ alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', chromeProfile: 'bare' }] },
        { conditions: [{ alias: 'Pkg.Condition.Never' }] },
      );
      await settle();

      expect(harness.app('usync')!.chromeProfile, 'a catalogue not in effect claims nothing (D5)').to.equal('full-section');
    } finally {
      harness.teardown();
    }
  });

  it('gives the curated entry back when the catalogue goes away', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', chromeProfile: 'bare' }],
      });
      await settle();
      expect(harness.app('usync')!.chromeProfile).to.equal('bare');

      harness.registry.unregister('Pkg.Catalogue');
      await settle();
      expect(harness.app('usync')!.chromeProfile).to.equal('full-section');
    } finally {
      harness.teardown();
    }
  });

  /** The review's blocker, end to end: one broken package must not freeze the launcher (D9). */
  it('never throws on a malformed catalogue, and keeps listening', async () => {
    const harness = await setup();
    try {
      registerCatalogue(harness.registry, 'Pkg.Broken', {
        entries: { alias: 'x', ref: 'y' },
        groups: [null, 7, { alias: 'g', label: 3 }],
      });
      harness.registry.register({
        type: 'umbraDesktopApp',
        alias: 'Pkg.NumberLabel',
        element: async () => ({}),
        meta: { label: 42 },
      } as unknown as UmbExtensionManifest);
      await settle();

      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-tool');
      registerCatalogue(harness.registry, 'Pkg.Good', {
        entries: [{ alias: 'Pkg.Tool', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settleDiagnostics();

      expect(harness.aliases(), 'the next catalogue still arrives').to.contain('Pkg.Tool');
      expect(harness.desktopWarnings().some((w) => w.includes('"Pkg.Broken"'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  it('refuses a url that leaves the backoffice, and keeps one that does not', async () => {
    const harness = await setup();
    try {
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [
          { alias: 'Pkg.Evil', url: 'javascript:alert(1)', section: 'Umb.Section.Settings' },
          { alias: 'Pkg.Fine', url: '/umbraco/section/settings/workspace/pkg-root', section: 'Umb.Section.Settings' },
        ],
      });
      await settleDiagnostics();

      expect(harness.aliases()).to.not.contain('Pkg.Evil');
      expect(harness.aliases()).to.contain('Pkg.Fine');
      expect(harness.desktopWarnings().some((w) => w.includes('"Pkg.Evil"'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  it("does not open a dashboard that lives in the desktop's own section", async () => {
    const harness = await setup(CATALOGUE, [SETTINGS_SECTION, DESKTOP_SECTION]);
    try {
      harness.registry.register({
        type: 'dashboard',
        alias: 'Pkg.Dashboard',
        name: 'Pkg dashboard',
        meta: { label: 'Pkg', pathname: 'pkg' },
        conditions: [{ alias: 'Umb.Condition.SectionAlias', match: UMBRADESKTOP_SECTION_ALIAS }],
      } as unknown as UmbExtensionManifest);
      registerCatalogue(harness.registry, 'Pkg.Catalogue', { entries: [{ alias: 'Pkg.Dash', ref: 'Pkg.Dashboard' }] });
      await settleDiagnostics();

      expect(harness.aliases()).to.not.contain('Pkg.Dash');
      expect(harness.desktopWarnings().some((w) => w.includes('desktop inside'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  it("brings a section's fallback back when an app replaces its section-root entry", async () => {
    const harness = await setup({ groups: [], entries: [{ alias: 'settings', ref: 'Umb.Section.Settings' }], excludedSections: [] });
    try {
      await settle();
      expect(harness.aliases()).to.not.contain('section:Umb.Section.Settings');

      harness.registry.register({
        type: 'umbraDesktopApp',
        alias: 'settings',
        element: async () => ({}),
        meta: { label: '#pkg_settings' },
      } as unknown as UmbExtensionManifest);
      await settle();

      expect(harness.app('settings')!.content.kind).to.equal('element');
      expect(harness.aliases(), 'nothing else opens the section now').to.contain('section:Umb.Section.Settings');
    } finally {
      harness.teardown();
    }
  });

  it('names the package in a diagnostic about its entry, and asks for a missing section', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [
          { alias: 'Pkg.Ungated', url: '/umbraco/section/settings/workspace/x' },
          { alias: 'Pkg.Sectionless', ref: 'Pkg.MenuItem' },
        ],
      });
      await settleDiagnostics();

      const warnings = harness.desktopWarnings();
      expect(warnings.some((w) => w.includes('"Pkg.Ungated" from "Pkg.Catalogue"'))).to.equal(true);
      expect(warnings.some((w) => w.includes('"Pkg.Sectionless"') && w.includes('Add "section"'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  /**
   * Design D7's hint, printed once. A later, unrelated catalogue recomputes the whole list again, and
   * the hint must survive that as one line rather than one per recompute.
   */
  it('says once that a package entry opens a screen the desktop already has a tile for', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'Pkg.Usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings' }],
      });
      await settle();
      registerCatalogue(harness.registry, 'Pkg.Other', { groups: [] });
      await settleDiagnostics();

      expect(harness.aliases(), 'both tiles show').to.contain('usync').and.to.contain('Pkg.Usync');
      expect(harness.desktopWarnings().filter((w) => w.includes('both appear'))).to.have.lengthOf(1);
    } finally {
      harness.teardown();
    }
  });

  /**
   * The lifecycle half of design D16, as far as it can be seen from outside: nothing is subscribed
   * while the desktop is closed, and a catalogue that arrived meanwhile is picked up, its ref
   * observed exactly once, when the desktop opens again. The narrower case, a ref first named by the
   * initializer's own flush during `hostDisconnected`, is closed off by `#watchRefs` refusing to
   * subscribe while stopped; it cannot be staged reliably from a test.
   */
  it('subscribes nothing while the desktop is closed, and catches up once when it reopens', async () => {
    const harness = await setup();
    try {
      let observations = 0;
      const byAlias = harness.registry.byAlias.bind(harness.registry);
      harness.registry.byAlias = ((alias: string) => {
        if (alias === 'Pkg.MenuItem') observations++;
        return byAlias(alias);
      }) as typeof harness.registry.byAlias;

      harness.host.remove();
      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-tool');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'Pkg.Tool', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settle();
      expect(observations, 'nothing subscribes while the desktop is closed').to.equal(0);

      document.body.appendChild(harness.host);
      await settleDiagnostics();
      expect(observations, 'and exactly once when it reopens').to.equal(1);
      expect(harness.aliases()).to.contain('Pkg.Tool');
    } finally {
      harness.host.remove();
      harness.teardown();
    }
  });

  /**
   * Design D9 reaches past the catalogue itself: a tile with no `name` inherits the label of the
   * extension it points at, and a fallback tile takes its section's label, both from manifests any
   * package wrote, which a static `umbraco-package.json` can make a number. Found by the branch
   * review; a non-text name used to reach `groupApps` and throw.
   */
  it('names a tile by its alias when the extension it points at has a label that is not text', async () => {
    const harness = await setup();
    try {
      harness.registry.register({
        type: 'menuItem',
        alias: 'Pkg.MenuItem',
        name: 'Pkg menu item',
        meta: { entityType: 'pkg-root', label: 42, icon: 7 },
      } as unknown as UmbExtensionManifest);
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'Pkg.Tool', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settle();

      const app = harness.app('Pkg.Tool');
      expect(app!.name, 'a label that is not text is not a name').to.equal('Pkg menu item');
      expect(app!.icon).to.equal('icon-box');
    } finally {
      harness.teardown();
    }
  });

  it("names a section's fallback tile by its alias when the section's label is not text", async () => {
    const odd = { type: 'section', alias: 'Pkg.Odd', name: 42, meta: { label: { en: 'Odd' }, pathname: 'odd' } };
    const harness = await setup(CATALOGUE, [SETTINGS_SECTION, odd]);
    try {
      await settle();
      expect(harness.app('section:Pkg.Odd')!.name).to.equal('Pkg.Odd');
    } finally {
      harness.teardown();
    }
  });

  it('keeps listening after a dashboard whose conditions are not a list', async () => {
    const harness = await setup();
    try {
      harness.registry.register({
        type: 'dashboard',
        alias: 'Pkg.Dashboard',
        name: 'Pkg dashboard',
        meta: { label: 'Pkg', pathname: 'pkg' },
        conditions: 'Umb.Condition.SectionAlias',
      } as unknown as UmbExtensionManifest);
      registerCatalogue(harness.registry, 'Pkg.Catalogue', { entries: [{ alias: 'Pkg.Dash', ref: 'Pkg.Dashboard' }] });
      await settle();

      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-tool');
      registerCatalogue(harness.registry, 'Pkg.Good', {
        entries: [{ alias: 'Pkg.Tool', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settle();
      expect(harness.aliases(), 'a later catalogue still arrives').to.contain('Pkg.Tool');
    } finally {
      harness.teardown();
    }
  });

  /** A host feature that needs an entry's ref asks the merged catalogue, not the static one. */
  it("answers an entry's ref from the merged catalogue", async () => {
    const harness = await setup();
    try {
      expect(harness.context.getEntryRef('usync')).to.equal('usync.menu.item');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'usync', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settle();
      expect(harness.context.getEntryRef('usync')).to.equal('Pkg.MenuItem');
    } finally {
      harness.teardown();
    }
  });

  /**
   * The teardown guard. With an app registered and permitted, an extension initializer reports an
   * empty list from inside `super.destroy()`, and without `#destroyed` the recompute that follows
   * would empty the list and re-track entries on a gate that is already gone. The app still being
   * listed afterwards is how this case knows that recompute was swallowed. It first shipped without
   * the registered app, where nothing had been permitted, so no empty list was ever reported and the
   * case passed with the guard deleted (found by the branch review).
   */
  it('publishes the merged catalogue groups, including groups a package brings', async () => {
    const { context, registry, teardown } = await setup();
    try {
      registerCatalogue(registry, 'Pkg.Catalogue', { groups: [{ alias: 'pkg', label: 'Package', weight: 80 }], entries: [] });
      await settle();
      await settle();
      let groups: ReadonlyArray<{ alias: string }> = [];
      context.catalogueGroups.subscribe((value) => (groups = value)).unsubscribe();
      expect(groups.map((g) => g.alias)).to.include.members(['synchronisation', 'pkg']);
    } finally {
      teardown();
    }
  });

  it('does nothing once destroyed', async () => {
    const harness = await setup();
    try {
      harness.registry.register({
        type: 'umbraDesktopApp',
        alias: 'Pkg.App',
        element: async () => ({}),
        meta: { label: '#pkg_app' },
      } as unknown as UmbExtensionManifest);
      await settle();
      expect(harness.aliases()).to.contain('Pkg.App');

      harness.context.destroy();
      registerCatalogue(harness.registry, 'Pkg.Catalogue', { entries: [{ alias: 'Pkg.Other', ref: 'Pkg.Section' }] });
      await settle();
      expect(harness.aliases(), 'no recompute ran after destroy').to.contain('Pkg.App');
    } finally {
      harness.teardown();
    }
  });
});

/**
 * A diagnostic must not outlive the desktop it is about.
 *
 * Leaving the desktop section removes the element, and Lit's `disconnectedCallback` calls
 * `hostDisconnected` on every controller *without* destroying any of them, so nothing here has yet
 * been torn down. The extension initializer is also the one input that calls back during
 * `hostDisconnected` (it cancels its pending frame and flushes synchronously), which means the way
 * out of the section runs a recompute and arms a five-second timer. Console-only and one line, but a
 * warning about a screen the user is no longer on is the kind of thing somebody spends an afternoon
 * chasing.
 */
it('does not print a diagnostic after the desktop has gone', async () => {
  const harness = await setup(MISCONFIGURED_CATALOGUE);
  try {
    // Armed but not yet flushed: the shortened window is longer than this settle.
    await settle();
    harness.host.remove();
    await settleDiagnostics();

    expect(harness.desktopWarnings(), 'nobody is looking at this desktop any more').to.deep.equal([]);
  } finally {
    harness.teardown();
  }
});

/**
 * And the guard must be a pause, not a mute. The desktop section is re-entered by mounting the
 * element again, which reconnects every controller here (the observers unsubscribed on the way out,
 * so reconnecting re-subscribes and recomputes), and the misconfiguration the first visit was about
 * is still a misconfiguration. A guard that suppressed this would be worse than the timer it
 * replaced: silence, with nothing to say it was chosen.
 */
it('prints the diagnostic again once the desktop is reopened', async () => {
  const harness = await setup(MISCONFIGURED_CATALOGUE);
  try {
    await settle();
    harness.host.remove();
    await settleDiagnostics();
    expect(harness.desktopWarnings(), 'nothing while it was closed').to.deep.equal([]);

    document.body.appendChild(harness.host);
    await settleDiagnostics();

    const ungated = harness.warnings.filter((w) => w.includes('but no "section" gate'));
    expect(ungated, 'a desktop that is open again gets its diagnostic').to.have.lengthOf(1);
  } finally {
    harness.host.remove();
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
      const releaseSets = harness.app('workflow-release-sets')!.content;
      expect(releaseSets.kind, 'a curated dashboard is an iframe destination').to.equal('iframe');
      expect(releaseSets.kind === 'iframe' && releaseSets.url).to.equal(
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

describe('the app snapshot', () => {
  it('reports the same apps the observable does', async () => {
    // Added for the AI desk tool, which answers one question once and has no use for a
    // subscription — the same reason the window manager grew `getWindows()`. Asserted against the
    // observable rather than against a fixed list so the two cannot drift apart.
    const harness = await setup(catalogue, [SETTINGS_SECTION, CONTENT_SECTION]);
    try {
      await settle();
      expect(harness.context.getApps().map((app) => app.alias)).to.deep.equal(harness.aliases());
    } finally {
      harness.teardown();
    }
  });

  it('is empty rather than absent before anything resolves', async () => {
    // A tool can be called while the desktop is still mounting, and "no apps yet" has to read as an
    // empty desk rather than as a crash.
    const harness = await setup(catalogue, []);
    try {
      expect(harness.context.getApps()).to.be.an('array');
    } finally {
      harness.teardown();
    }
  });
});
