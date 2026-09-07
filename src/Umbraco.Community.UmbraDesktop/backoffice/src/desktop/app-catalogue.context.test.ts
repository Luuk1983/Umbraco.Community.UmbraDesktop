import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopAppCatalogueContext } from './app-catalogue.context';
import type { UmbraDesktopApp, UmbraDesktopCatalogue } from './types';
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
 * desktop section (an F5, a bookmark) hits this reliably, and for an `optional` entry it is
 * silent: no warning, and the app is simply missing until the next full boot.
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
      optional: true,
      group: 'synchronisation',
    },
  ],
  excludedSections: [],
};

/** Mount a host with a stubbed current-user context and a catalogue bound to a fresh registry. */
async function setup(catalogue: UmbraDesktopCatalogue = CATALOGUE) {
  const host = await fixture<TestHostElement>(
    html`<umbradesktop-catalogue-test-host></umbradesktop-catalogue-test-host>`,
  );
  const allowedSections = new UmbArrayState<string>(['Umb.Section.Settings'], (alias) => alias);
  host.provideContext(UMB_CURRENT_USER_CONTEXT, {
    allowedSections: allowedSections.asObservable(),
    getHostElement: () => host,
  } as unknown as UmbCurrentUserContext);

  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(SETTINGS_SECTION as unknown as UmbExtensionManifest);

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
    diagnosticDelayMs: 20,
  });
  let apps: UmbraDesktopApp[] = [];
  const subscription = context.apps.subscribe((value) => (apps = value));

  return {
    /** The desktop element the context is scoped to, so a test can take the desktop away. */
    host,
    registry,
    warnings,
    aliases: () => apps.map((app) => app.alias),
    app: (alias: string) => apps.find((a) => a.alias === alias),
    /** Only the desktop's own warnings, so an unrelated Umbraco line cannot fail an assertion. */
    desktopWarnings: () => warnings.filter((w) => w.includes('[UmbraDesktop]')),
    teardown: () => {
      console.warn = realWarn;
      window.requestAnimationFrame = realRequestAnimationFrame;
      window.cancelAnimationFrame = realCancelAnimationFrame;
      subscription.unsubscribe();
      context.destroy();
    },
  };
}

/** Yield to the microtask/observable queue so a registration can propagate. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Wait past the (shortened) diagnostic settle window so any warning has been flushed. */
const settleDiagnostics = () => new Promise((resolve) => setTimeout(resolve, 80));

/** A catalogue whose single entry is mandatory, so an absent `ref` is a real misconfiguration. */
const MANDATORY_CATALOGUE: UmbraDesktopCatalogue = {
  groups: [{ alias: 'system', label: 'System' }],
  entries: [{ alias: 'log-viewer', ref: 'Umb.MenuItem.LogViewer', section: 'Umb.Section.Settings', group: 'system' }],
  excludedSections: [],
};

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

it('does not warn about a ref that registers while the registry is still settling', async () => {
  const harness = await setup(MANDATORY_CATALOGUE);
  try {
    await settle();
    // The core menu item's own bundle finishes importing shortly after the desktop mounts.
    harness.registry.register({
      type: 'menuItem',
      alias: 'Umb.MenuItem.LogViewer',
      name: 'Log Viewer',
      meta: { entityType: 'log-viewer' },
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    expect(harness.aliases()).to.contain('log-viewer');
    expect(harness.warnings, 'a ref that arrived in time is not a misconfiguration').to.deep.equal([]);
  } finally {
    harness.teardown();
  }
});

it('warns exactly once about a ref that never registers', async () => {
  const harness = await setup(MANDATORY_CATALOGUE);
  try {
    await settleDiagnostics();
    // A recompute after the flush must not repeat the message.
    harness.registry.register({
      type: 'section',
      alias: 'Umb.Section.Media',
      name: 'Media',
      meta: { label: 'Media', pathname: 'media' },
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    const unknownRef = harness.warnings.filter((w) => w.includes('references unknown extension'));
    expect(unknownRef).to.have.lengthOf(1);
    expect(unknownRef[0]).to.contain('Umb.MenuItem.LogViewer');
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
 * Registry uniqueness holds only within the registered set, so a manifest is free to claim an alias
 * the curated catalogue already uses. Two apps under one alias is not a cosmetic duplicate: an
 * alias is the key a pinned favourite is stored under, and `launcher.element.ts` resolves a pin with
 * a `find`, so which of the two a pin opens would come down to derivation order. The curated entry
 * keeps the alias (it is the one whose URL and chrome profile this repository has verified) and the
 * registered app is dropped with a diagnostic, because a package cannot fix a collision nothing
 * tells it about.
 */
it('drops a registered app whose alias a curated entry already owns, and says so', async () => {
  const harness = await setup();
  try {
    // The curated `usync` entry's own ref, so the collision is between two apps that both exist.
    harness.registry.register({
      type: 'menuItem',
      alias: 'usync.menu.item',
      name: 'uSync',
      meta: { entityType: 'usync-root' },
    } as unknown as UmbExtensionManifest);
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'usync',
      element: async () => ({}),
      meta: { label: '#pkg_usync' },
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    expect(harness.aliases().filter((a) => a === 'usync'), 'one alias, one app').to.have.lengthOf(1);
    expect(harness.app('usync')!.content.kind, 'the curated entry keeps the alias').to.equal('iframe');
    const collision = harness.warnings.filter((w) => w.includes('"usync"') && w.includes('curated'));
    expect(collision).to.have.lengthOf(1);
  } finally {
    harness.teardown();
  }
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
  const harness = await setup(MANDATORY_CATALOGUE);
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
  const harness = await setup(MANDATORY_CATALOGUE);
  try {
    await settle();
    harness.host.remove();
    await settleDiagnostics();
    expect(harness.desktopWarnings(), 'nothing while it was closed').to.deep.equal([]);

    document.body.appendChild(harness.host);
    await settleDiagnostics();

    const unknownRef = harness.warnings.filter((w) => w.includes('references unknown extension'));
    expect(unknownRef, 'a desktop that is open again gets its diagnostic').to.have.lengthOf(1);
  } finally {
    harness.host.remove();
    harness.teardown();
  }
});
