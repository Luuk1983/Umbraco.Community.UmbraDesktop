import { expect, fixture, html } from '@open-wc/testing';
import { AccessoriesHostSettings, UmbraDesktopAccessoriesSettingsController } from './settings.source.js';
import { UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS } from './settings.js';
import { UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT } from '../shared/package-settings.js';
import type { UmbraDesktopPackageSettingsContext, UmbraDesktopPackageSettingsStore } from '../shared/package-settings.js';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The package's settings now live in the desktop's store (design 2026-10-03 §8); this adapter turns
 * its untyped value into `AccessoriesSettings`, so the screensaver never sees a malformed one.
 */

/**
 * A host store the test drives.
 * @param value What it starts out holding.
 * @param status Its status, if anything is wrong.
 * @returns The store, which also records what was set and can be made to change as another tab would.
 */
function fakeStore(value: unknown = undefined, status?: 'unread' | 'unsaved') {
  const listeners = new Set<(value: unknown) => void>();
  const store: UmbraDesktopPackageSettingsStore & { emit(next: unknown): void; sets: unknown[] } = {
    value,
    status,
    sets: [],
    set(next) {
      this.sets.push(next);
      (this as { value: unknown }).value = next;
      for (const listener of listeners) listener(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(next) {
      (this as { value: unknown }).value = next;
      for (const listener of listeners) listener(next);
    },
  };
  return store;
}

/** Settings with the screensaver switched on, which the default is not. */
const ON = { screensaver: { enabled: true, saver: 'mystify', waitMinutes: 5 } } as const;

it('is the default until there is a store, and says nothing is wrong', () => {
  const subject = new AccessoriesHostSettings();
  expect([subject.value, subject.status]).to.deep.equal([UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS, undefined]);
});

it('reads the store’s value as Accessories settings', () => {
  const subject = new AccessoriesHostSettings();
  subject.use(fakeStore(ON));
  expect(subject.value).to.deep.equal(ON);
});

it('falls back field by field when the stored value is malformed', () => {
  const subject = new AccessoriesHostSettings();
  subject.use(fakeStore({ screensaver: { enabled: 'yes', saver: 'mystify' } }));
  expect(subject.value.screensaver).to.deep.equal({
    ...UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS.screensaver,
    saver: 'mystify',
  });
});

it('passes the store’s status through', () => {
  const subject = new AccessoriesHostSettings();
  subject.use(fakeStore(ON, 'unsaved'));
  expect(subject.status).to.equal('unsaved');
});

it('writes a change to the store', () => {
  const store = fakeStore();
  const subject = new AccessoriesHostSettings();
  subject.use(store);
  subject.set(ON);
  expect(store.sets).to.deep.equal([ON]);
});

it('tells its subscribers when the store changes, and when it gets a store', () => {
  const store = fakeStore();
  const subject = new AccessoriesHostSettings();
  const heard: unknown[] = [];
  subject.subscribe((value) => heard.push(value.screensaver.enabled));
  subject.use(store);
  store.emit(ON);
  expect(heard).to.deep.equal([false, true]);
});

/** An element that provides contexts, standing for the backoffice the desktop's context is global on. */
class ProviderElement extends UmbLitElement {}
customElements.define('umbradesktop-accessories-settings-test-provider', ProviderElement);

/** An element that consumes them, standing for a settings box or the idle watcher's host. */
class ConsumerElement extends UmbLitElement {}
customElements.define('umbradesktop-accessories-settings-test-consumer', ConsumerElement);

it('finds the desktop’s context and reads Accessories’ own store from it', async () => {
  // The token is a hand-written copy of the host's, so this is what proves the alias and the key
  // Accessories asks for still meet the desktop's.
  const provider = await fixture<ProviderElement>(html`
    <umbradesktop-accessories-settings-test-provider>
      <umbradesktop-accessories-settings-test-consumer></umbradesktop-accessories-settings-test-consumer>
    </umbradesktop-accessories-settings-test-provider>
  `);
  const asked: string[] = [];
  const store = fakeStore(ON);
  provider.provideContext(UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT, {
    store: (key: string) => {
      asked.push(key);
      return store;
    },
    openSettings: () => false,
    getHostElement: () => provider,
  } as unknown as UmbraDesktopPackageSettingsContext);
  const consumer = provider.querySelector<ConsumerElement>('umbradesktop-accessories-settings-test-consumer')!;
  const subject = new UmbraDesktopAccessoriesSettingsController(consumer);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect([asked, subject.value]).to.deep.equal([['Umbraco.Community.UmbraDesktop.Accessories'], ON]);
});

/** Closed with its element or entry point, it must stop hearing a store that lives as long as the page. */
it('stops hearing the store when closed, and is the default again', () => {
  const store = fakeStore(ON);
  const subject = new AccessoriesHostSettings();
  subject.use(store);
  const heard: unknown[] = [];
  subject.subscribe((value) => heard.push(value.screensaver.enabled));
  subject.close();
  store.emit({ screensaver: { ...ON.screensaver, waitMinutes: 10 } });
  expect([heard, subject.value]).to.deep.equal([[false], UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS]);
});
