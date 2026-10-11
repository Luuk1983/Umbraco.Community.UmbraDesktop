import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopTrayContext, type UmbraDesktopTrayDependencies } from './tray.context.js';
import type { UmbraDesktopTrayItem } from './tray-items.js';
import type { UmbraDesktopApp } from '../../types';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import type { UmbConditionConfigBase } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { of } from '@umbraco-cms/backoffice/external/rxjs';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/** Minimal controller host for the context under test, as the catalogue's tests build one. */
class TrayContextTestHost extends UmbLitElement {}
customElements.define('umbradesktop-tray-context-test-host', TrayContextTestHost);

/**
 * A condition that denies as soon as it exists. `UmbConditionBase` rather than a hand-written
 * object, for the reason `app-catalogue.context.test.ts` gives for its `MetCondition`: what is under
 * test is Umbraco's condition evaluation, reached through the initializer, not a restatement of it.
 */
class DeniedCondition extends UmbConditionBase<UmbConditionConfigBase> {
  /**
   * @param host The extension initializer this condition is a controller of.
   * @param args Umbraco's condition arguments: the manifest's config, and the change callback.
   */
  constructor(
    host: UmbControllerHost,
    args: { config: UmbConditionConfigBase; onChange: (permitted: boolean) => void },
  ) {
    super(host, args);
    this.permitted = false;
  }
}

/**
 * A tray item manifest as a package's bundle would register it.
 * @param alias The manifest alias.
 * @returns The manifest, typed for the registry.
 */
function trayManifest(alias: string): UmbExtensionManifest {
  return {
    type: 'umbraDesktopTrayItem',
    alias,
    name: alias,
    element: () => Promise.resolve({ default: HTMLElement }),
    meta: { label: 'L', description: 'D' },
  } as unknown as UmbExtensionManifest;
}

/**
 * Mount a host and a context over a fresh registry.
 *
 * The animation frame is redirected onto the microtask queue for the life of the context, for the
 * reason `app-catalogue.context.test.ts` gives at length: `UmbExtensionsManifestInitializer`
 * coalesces its callbacks on a frame, and a background page in a full run never gets one, so a case
 * that passes alone would time out in `npm test`. The cancel is honoured, since the initializer
 * cancels its pending frame on the way out and a cancelled flush must not arrive.
 * @param deps What the context needs of the rest of the desktop; each part defaults to doing nothing.
 * @param manifests Tray manifests to register before the context exists.
 * @returns The context, its registry, and a teardown that restores the frame functions.
 */
async function setup(deps: Partial<UmbraDesktopTrayDependencies> = {}, manifests: UmbExtensionManifest[] = []) {
  const host = await fixture<TrayContextTestHost>(
    html`<umbradesktop-tray-context-test-host></umbradesktop-tray-context-test-host>`,
  );
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  for (const manifest of manifests) registry.register(manifest);

  const realRequestAnimationFrame = window.requestAnimationFrame;
  const realCancelAnimationFrame = window.cancelAnimationFrame;
  let frameHandle = 0;
  const cancelledFrames = new Set<number>();
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    const handle = ++frameHandle;
    queueMicrotask(() => {
      if (!cancelledFrames.has(handle)) callback(performance.now());
    });
    return handle;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((handle: number) => {
    cancelledFrames.add(handle);
  }) as typeof window.cancelAnimationFrame;

  const context = new UmbraDesktopTrayContext(
    host,
    { open: () => {}, getApps: () => [], setFeature: () => {}, observeFeatures: () => of({}), ...deps },
    registry,
  );
  let items: ReadonlyArray<UmbraDesktopTrayItem> = [];
  const subscription = context.items.subscribe((value) => (items = value));
  return {
    context,
    registry,
    /** The aliases of the items the context lists now. */
    aliases: () => items.map((item) => item.alias),
    /** The items the context lists now. */
    items: () => items,
    teardown: () => {
      subscription.unsubscribe();
      context.destroy();
      window.requestAnimationFrame = realRequestAnimationFrame;
      window.cancelAnimationFrame = realCancelAnimationFrame;
    },
  };
}

/** Yield a macrotask, so the initializer's microtask flush and the state's emission have run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('UmbraDesktopTrayContext', () => {
  it('emits the item default when nothing is stored', async () => {
    const harness = await setup({}, [trayManifest('A')]);
    try {
      await settle();
      const seen: boolean[] = [];
      const sub = harness.context.trayItemEnabled('A').subscribe((value) => seen.push(value));
      expect(seen).to.deep.equal([true]);
      sub.unsubscribe();
    } finally {
      harness.teardown();
    }
  });

  it('follows the stored choice as it changes, without repeating a value', async () => {
    const stored = new UmbObjectState<Record<string, boolean>>({});
    const harness = await setup({ observeFeatures: () => stored.asObservable() }, [trayManifest('A')]);
    try {
      await settle();
      const seen: boolean[] = [];
      const sub = harness.context.trayItemEnabled('A').subscribe((value) => seen.push(value));
      stored.setValue({ A: false });
      stored.setValue({ A: false });
      stored.setValue({ A: true });
      expect(seen).to.deep.equal([true, false, true]);
      sub.unsubscribe();
    } finally {
      harness.teardown();
    }
  });

  it('is false for an alias that is not a tray item', async () => {
    const harness = await setup({}, [trayManifest('A')]);
    try {
      await settle();
      const seen: boolean[] = [];
      const sub = harness.context.trayItemEnabled('nope').subscribe((value) => seen.push(value));
      expect(seen).to.deep.equal([false]);
      sub.unsubscribe();
    } finally {
      harness.teardown();
    }
  });

  it('flips from false to the default when the item registers late', async () => {
    const harness = await setup();
    try {
      await settle();
      const seen: boolean[] = [];
      const sub = harness.context.trayItemEnabled('Late').subscribe((value) => seen.push(value));
      harness.registry.register(trayManifest('Late'));
      await settle();
      expect(seen).to.deep.equal([false, true]);
      sub.unsubscribe();
    } finally {
      harness.teardown();
    }
  });

  it('lists registered tray items', async () => {
    const harness = await setup({}, [trayManifest('My.Tray')]);
    try {
      await settle();
      expect(harness.aliases()).to.deep.equal(['My.Tray']);
    } finally {
      harness.teardown();
    }
  });

  it('lists an item registered after it started, as a late package bundle does', async () => {
    const harness = await setup();
    try {
      await settle();
      expect(harness.aliases()).to.deep.equal([]);
      harness.registry.register(trayManifest('Late.Tray'));
      await settle();
      expect(harness.aliases()).to.deep.equal(['Late.Tray']);
    } finally {
      harness.teardown();
    }
  });

  it('hands over the same manifest object on every emission', async () => {
    // The tray items controller shares an element load per manifest object, and discards a load
    // whose manifest was replaced; both depend on an unchanged item keeping its manifest's identity.
    const harness = await setup({}, [trayManifest('First.Tray')]);
    try {
      await settle();
      const before = harness.items()[0].manifest;
      harness.registry.register(trayManifest('Second.Tray'));
      await settle();
      expect(harness.aliases()).to.deep.equal(['First.Tray', 'Second.Tray']);
      expect(harness.items()[0].manifest).to.equal(before);
    } finally {
      harness.teardown();
    }
  });

  it('leaves the registry manifests unfrozen, so appendCondition still works on them', async () => {
    // `umbExtensionsRegistry.appendCondition` copies the manifest shallowly and pushes into its
    // original `conditions` array. A context that deep-froze the manifests it lists would make that
    // documented call throw for every tray item, which is a package author's bug report waiting.
    const harness = await setup({}, [
      { ...trayManifest('Conditioned.Tray'), conditions: [] } as unknown as UmbExtensionManifest,
    ]);
    try {
      await settle();
      expect(harness.aliases()).to.deep.equal(['Conditioned.Tray']);
      expect(Object.isFrozen(harness.items()[0].manifest), 'the listed manifest is the registry object itself').to.equal(false);
      expect(() => harness.registry.appendCondition('Conditioned.Tray', { alias: 'Test.Condition.Appended' })).to.not.throw();
    } finally {
      harness.teardown();
    }
  });

  it('leaves out an item whose conditions deny it', async () => {
    const harness = await setup({}, [
      { type: 'condition', alias: 'Test.Condition.Denied', name: 'Denied', api: DeniedCondition } as unknown as UmbExtensionManifest,
      trayManifest('Open.Tray'),
      { ...trayManifest('Gated.Tray'), conditions: [{ alias: 'Test.Condition.Denied' }] } as unknown as UmbExtensionManifest,
    ]);
    try {
      await settle();
      // The open item is there so an empty list cannot pass this: the list was computed, and the
      // gated item is missing from it because its condition said no.
      expect(harness.aliases()).to.deep.equal(['Open.Tray']);
    } finally {
      harness.teardown();
    }
  });

  it('leaves out an item that fails validation, and says so once', async () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    const harness = await setup({}, [
      trayManifest('Good.Tray'),
      { ...trayManifest('Bad.Tray'), meta: { label: 'L' } } as unknown as UmbExtensionManifest,
    ]);
    try {
      await settle();
      harness.registry.register(trayManifest('Other.Tray'));
      await settle();
      expect(harness.aliases()).to.deep.equal(['Good.Tray', 'Other.Tray']);
      const reports = warnings.filter((w) => w.includes('"Bad.Tray"'));
      expect(reports).to.have.length(1);
      expect(reports[0]).to.contain('[UmbraDesktop]');
    } finally {
      console.warn = realWarn;
      harness.teardown();
    }
  });

  it('opens a registered app by alias, and refuses one it does not know', async () => {
    const opened: string[] = [];
    const app = { alias: 'Pkg.App' } as unknown as UmbraDesktopApp;
    const harness = await setup({ open: (a) => opened.push(a.alias), getApps: () => [app] });
    try {
      expect(harness.context.openApp('Pkg.App')).to.equal(true);
      expect(harness.context.openApp('Nope')).to.equal(false);
      expect(opened).to.deep.equal(['Pkg.App']);
    } finally {
      harness.teardown();
    }
  });

  it('switches a tray item off, and nothing that is not a tray item', async () => {
    const set: Array<[string, boolean]> = [];
    const harness = await setup({ setFeature: (id, on) => set.push([id, on]) }, [trayManifest('My.Tray')]);
    try {
      await settle();
      expect(harness.context.setTrayItemEnabled('fullscreen', false)).to.equal(false);
      expect(harness.context.setTrayItemEnabled('My.Tray', false)).to.equal(true);
      expect(set).to.deep.equal([['My.Tray', false]]);
    } finally {
      harness.teardown();
    }
  });
});
