import { expect, fixture, html } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments } from '@umbraco-cms/backoffice/extension-api';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopPackageContextsController } from './package-contexts.controller.js';

/** A host standing in for the desktop element. */
@customElement('umbradesktop-package-contexts-test-host')
class TestHost extends UmbLitElement {}

/** A child standing in for an app inside the desktop, which is where a game consumes from. */
@customElement('umbradesktop-package-contexts-test-child')
class TestChild extends UmbLitElement {}

/** Every context the fake api has constructed and destroyed, in order. */
const log: string[] = [];

/** The token the fake context provides itself under, which the consuming child looks up. */
const TOKEN = new UmbContextToken<FakePackageContext>('Test.PackageContext');

/** A package context, as a package would write one. */
class FakePackageContext extends UmbContextBase {
  /** @param host The desktop, as the controller passes it. */
  constructor(host: UmbControllerHost) {
    super(host, TOKEN);
    log.push('created');
  }
  /** Whether teardown has already been recorded. */
  #destroyed = false;
  /**
   * Records teardown so the tests can see the context goes when the desktop does. Once only, because
   * Umbraco's `UmbClassMixin.destroy` calls `host.removeUmbController(this)`, which calls `destroy()`
   * again, so every Umbraco class sees its own destroy twice.
   */
  override destroy(): void {
    if (!this.#destroyed) {
      this.#destroyed = true;
      log.push('destroyed');
    }
    super.destroy();
  }
}

/** A condition that always refuses. */
class Refused extends UmbConditionBase<UmbConditionConfigBase> {
  /** @param host The host. @param args The condition arguments. */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase>) {
    super(host, args);
    this.permitted = false;
  }
}

/** Wait a turn, for the initializer's asynchronous loads. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A host with a child in it, a fresh registry, and the controller under test. */
async function setup() {
  log.length = 0;
  const host = await fixture<TestHost>(html`<umbradesktop-package-contexts-test-host><umbradesktop-package-contexts-test-child></umbradesktop-package-contexts-test-child></umbradesktop-package-contexts-test-host>`);
  const child = host.querySelector('umbradesktop-package-contexts-test-child') as TestChild;
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  const controller = new UmbraDesktopPackageContextsController(host, registry);
  return { host, child, registry, controller };
}

it('creates a registered package context on start, and an app inside the desktop can consume it', async () => {
  const { child, registry, controller } = await setup();
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext } as unknown as UmbExtensionManifest);
  controller.start();
  await settle();
  const found = await child.getContext(TOKEN);
  expect(found).to.be.instanceOf(FakePackageContext);
});

it('creates nothing before start, and destroys what it created on stop', async () => {
  const { registry, controller } = await setup();
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext } as unknown as UmbExtensionManifest);
  await settle();
  expect(log).to.deep.equal([]);
  controller.start();
  await settle();
  controller.stop();
  expect(log).to.deep.equal(['created', 'destroyed']);
});

it('creates a fresh context when the desktop comes back, and ignores a second start', async () => {
  const { registry, controller } = await setup();
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext } as unknown as UmbExtensionManifest);
  controller.start();
  controller.start();
  await settle();
  controller.stop();
  controller.start();
  await settle();
  expect(log).to.deep.equal(['created', 'destroyed', 'created']);
  controller.stop();
});

it('honours a manifest condition', async () => {
  const { registry, controller } = await setup();
  registry.register({ type: 'condition', alias: 'Test.Refused', name: 'Refused', api: Refused } as unknown as UmbExtensionManifest);
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext, conditions: [{ alias: 'Test.Refused' }] } as unknown as UmbExtensionManifest);
  controller.start();
  await settle();
  expect(log).to.deep.equal([]);
});

it('keeps going when one package context fails to load', async () => {
  const { registry, controller } = await setup();
  // Umbraco's initializer does not catch a rejecting loader: it surfaces as an unhandled rejection,
  // which the browser reports in the console. Capture it so it is asserted rather than left to
  // fail the runner, and so the test documents what "reported in the console" really is.
  const reported: unknown[] = [];
  const onRejection = (event: PromiseRejectionEvent) => {
    reported.push(event.reason);
    event.preventDefault();
  };
  window.addEventListener('unhandledrejection', onRejection);
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Broken', name: 'Broken', api: () => Promise.reject(new Error('nope')) } as unknown as UmbExtensionManifest);
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext } as unknown as UmbExtensionManifest);
  controller.start();
  await settle();
  window.removeEventListener('unhandledrejection', onRejection);
  expect(log).to.deep.equal(['created']);
  expect(reported).to.have.length(1);
});
