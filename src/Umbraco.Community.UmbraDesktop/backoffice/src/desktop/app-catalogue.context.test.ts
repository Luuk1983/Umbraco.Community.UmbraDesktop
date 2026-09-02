import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopAppCatalogueContext } from './app-catalogue.context';
import type { UmbraDesktopApp, UmbraDesktopCatalogue } from './types';
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
 * desktop section (an F5, a bookmark) hits this reliably, and for an `optional` entry it is
 * silent: no warning, and the app is simply missing until the next full boot.
 *
 * The catalogue must therefore track the registry rather than sample it once.
 */

/** Minimal controller host for the context under test. */
class TestHostElement extends UmbLitElement {}
customElements.define('umbradesktop-catalogue-test-host', TestHostElement);

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

  const context = new UmbraDesktopAppCatalogueContext(host, {
    catalogue,
    registry,
    // Keep the settle window short so the tests do not sit on the production delay.
    diagnosticDelayMs: 20,
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
