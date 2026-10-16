import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopPackageSettingsContext } from './package-settings.context.js';
import { UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT } from './package-settings.context-token.js';
import type { UmbraDesktopPackageSettingsDocument } from './package-store/package-settings-store.js';
import { fakeUserDataServer } from './package-store/fake-user-data-server.test-helper.js';
import type { UmbraDesktopFakeUserDataServer } from './package-store/fake-user-data-server.test-helper.js';
import type { UmbraDesktopUserDataClient } from '../user-data/types.js';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbCurrentUserContext } from '@umbraco-cms/backoffice/current-user';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbBasicState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The global context packages reach the desktop through (design §5). Its storage and its modal are
 * the two things a bare test page cannot have, so both go through seams the probe below records;
 * what is under test is which store a caller gets, when it loads, and where settings would open.
 */

/** A context whose storage and modal are recorded instead of real. */
class ProbeContext extends UmbraDesktopPackageSettingsContext {
  /** The keys a document was made for, in order. */
  public documents: string[] = [];
  /** The keys whose document was read, in order. */
  public reads: string[] = [];
  /** Every request to open settings, as the desktop it went to and the package. */
  public opened: Array<[UmbControllerHost, string]> = [];
  /** Whether a read fails, as it does when the account cannot be reached. */
  public failing = false;

  /**
   * A document that holds nothing and records being read.
   * @param key The package's group.
   * @returns The document.
   */
  protected override _documentFor(key: string): UmbraDesktopPackageSettingsDocument {
    this.documents.push(key);
    return {
      read: async () => {
        this.reads.push(key);
        return this.failing ? undefined : null;
      },
      write: async () => true,
    };
  }

  /**
   * Record the request instead of opening a modal, which needs a backoffice.
   * @param host The desktop it would open on.
   * @param packageName The package it would open at.
   */
  protected override _open(host: UmbControllerHost, packageName: string): void {
    this.opened.push([host, packageName]);
  }
}

/**
 * A context whose real documents talk to a fake server. Two of them on one server are two tabs of
 * one user: separate pages, separate documents, one account.
 */
class TabContext extends UmbraDesktopPackageSettingsContext {
  /**
   * @param host The host the context lives on.
   * @param server The server every document of this context talks to.
   */
  constructor(
    host: UmbControllerHost,
    private readonly server: UmbraDesktopFakeUserDataServer,
  ) {
    super(host);
  }

  /**
   * The shared fake server, in place of the backoffice's endpoints.
   * @returns Its client.
   */
  protected override _userDataClient(): UmbraDesktopUserDataClient {
    return this.server.client;
  }
}

/** A connected element to hang a context on, for the tests that need a current user provided. */
class TestHostElement extends UmbLitElement {}
customElements.define('umbradesktop-package-settings-test-host', TestHostElement);

/** Bare hosts made by a test, destroyed after it so no store's channel outlives it. */
let hosts: UmbElementControllerHost[] = [];

/** Contexts on fixture hosts, destroyed after each test for the same reason. */
let contexts: UmbraDesktopPackageSettingsContext[] = [];

afterEach(() => {
  for (const host of hosts) host.destroy();
  hosts = [];
  for (const subject of contexts) subject.destroy();
  contexts = [];
});

/**
 * A context on a host with no current user, as most tests want: nothing ever loads.
 * @returns The context.
 */
function context(): ProbeContext {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  return new ProbeContext(host);
}

/**
 * A context on a connected host that provides a current user whose id the test controls.
 * @param unique The signed-in user's id to start with, or undefined for nobody yet.
 * @returns The context, and the state to sign someone in through.
 */
async function contextWithUser(
  unique: string | undefined,
): Promise<{ subject: ProbeContext; user: UmbBasicState<string | undefined> }> {
  const host = await fixture<TestHostElement>(html`<umbradesktop-package-settings-test-host></umbradesktop-package-settings-test-host>`);
  const user = new UmbBasicState<string | undefined>(unique);
  host.provideContext(UMB_CURRENT_USER_CONTEXT, {
    unique: user.asObservable(),
    getHostElement: () => host,
  } as unknown as UmbCurrentUserContext);
  const subject = new ProbeContext(host);
  contexts.push(subject);
  return { subject, user };
}

/**
 * A stand-in for a desktop element.
 * @returns The host.
 */
function desktop(): UmbElementControllerHost {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  return host;
}

it('hands out one store per key, so every element in the page shares one value', () => {
  const subject = context();
  expect(subject.store('Pkg.Group') === subject.store('Pkg.Group')).to.equal(true);
  expect(subject.documents).to.deep.equal(['Pkg.Group']);
});

it('refuses the desktop’s own group, and an empty key', () => {
  const subject = context();
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    expect(subject.store('Umbraco.Community.UmbraDesktop')).to.equal(undefined);
    expect(subject.store(' umbraco.community.umbradesktop ')).to.equal(undefined);
    expect(subject.store('')).to.equal(undefined);
  } finally {
    console.warn = warn;
  }
  expect(subject.documents).to.deep.equal([]);
});

it('cannot open settings while no desktop is showing', () => {
  const subject = context();
  expect(subject.openSettings('My Package')).to.equal(false);
  expect(subject.opened).to.deep.equal([]);
});

it('opens settings on the desktop that attached itself, latest first', () => {
  const subject = context();
  const first = desktop();
  const second = desktop();
  subject.attachDesktop(first);
  const detach = subject.attachDesktop(second);
  expect(subject.openSettings('My Package')).to.equal(true);
  expect(subject.opened[0][0] === second).to.equal(true);
  expect(subject.opened[0][1]).to.equal('My Package');
  detach();
  subject.openSettings('My Package');
  expect(subject.opened[1][0] === first).to.equal(true);
});

it('opens settings at a package name with stray spaces, as the row it names is trimmed', () => {
  const subject = context();
  subject.attachDesktop(desktop());
  subject.openSettings(' My Package ');
  expect(subject.opened[0][1]).to.equal('My Package');
});

it('makes no request until a store is asked for', async () => {
  const { subject } = await contextWithUser('user-1');
  expect(subject.documents).to.deep.equal([]);
  expect(subject.reads).to.deep.equal([]);
});

it('loads a store created while somebody is signed in at once', async () => {
  const { subject } = await contextWithUser('user-1');
  subject.store('Pkg.Group');
  expect(subject.reads).to.deep.equal(['Pkg.Group']);
});

it('reads a store that could not be read again when it is asked for again, and a loaded one never', async () => {
  // What "close Desktop settings and open them again to retry" relies on: a box asks for its store
  // each time the panel builds it.
  // Waiting rather than calling `load()`, which would do the retry itself.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const { subject } = await contextWithUser('user-1');
  subject.failing = true;
  const store = subject.store('Pkg.Group')!;
  await settle();
  expect(store.status).to.equal('unread');
  subject.failing = false;
  subject.store('Pkg.Group');
  await settle();
  expect([store.status, subject.reads.length]).to.deep.equal([undefined, 2]);
  subject.store('Pkg.Group');
  await settle();
  expect(subject.reads.length).to.equal(2);
});

it('waits for a signed-in user before loading, then loads every store', async () => {
  const { subject, user } = await contextWithUser(undefined);
  subject.store('Pkg.One');
  subject.store('Pkg.Two');
  expect(subject.reads).to.deep.equal([]);
  user.setValue('user-1');
  expect(subject.reads).to.deep.equal(['Pkg.One', 'Pkg.Two']);
});

it('is provided under the alias packages build their own token from', () => {
  // Public API (design §5): a package cannot import the token, so it writes this string itself.
  expect(UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT.contextAlias).to.equal('UmbraDesktop.PackageSettingsContext');
});

/**
 * A context standing for one tab, its documents on the given server.
 * @param server The account every tab shares.
 * @returns The context.
 */
function tab(server: UmbraDesktopFakeUserDataServer): TabContext {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  return new TabContext(host, server);
}

it('keeps one row when two tabs save in turn, so the latest change is the one stored', async () => {
  // Nothing stored yet. The first tab's save makes the row; the second tab hears the change, and
  // its own save must update that row rather than make another, or a reload can read either.
  const server = fakeUserDataServer();
  const here = tab(server).store('Pkg.TwoTabs')!;
  const there = tab(server).store('Pkg.TwoTabs')!;
  await Promise.all([here.load(), there.load()]);
  const heard = new Promise<unknown>((resolve) => there.subscribe(resolve));
  here.set({ n: 1 });
  await here.saved();
  expect(await heard).to.deep.equal({ n: 1 });
  there.set({ n: 2 });
  await there.saved();
  const rows = server.rows.filter((row) => row.group === 'Pkg.TwoTabs' && row.identifier === 'Settings');
  expect(rows.map((row) => row.value)).to.deep.equal(['{"n":2}']);
});

it('reads the lowest-keyed of duplicate rows, as Accessories did, and keeps only it on the next save', async () => {
  // Users upgrading from Accessories' own store may have duplicates it made; they must see the row
  // they saw before, not whichever the server happens to list first.
  const row = (key: string, value: string) => ({ key, group: 'Pkg.Duplicates', identifier: 'Settings', value });
  const server = fakeUserDataServer([row('b', '{"n":2}'), row('a', '{"n":1}')]);
  const store = tab(server).store('Pkg.Duplicates')!;
  await store.load();
  expect(store.value).to.deep.equal({ n: 1 });
  store.set({ n: 3 });
  await store.saved();
  expect(server.rows).to.deep.equal([row('a', '{"n":3}')]);
});

it('closes its stores when it is destroyed', () => {
  const subject = context();
  const store = subject.store('Pkg.Group')!;
  let closed = false;
  const close = store.close.bind(store);
  store.close = () => {
    closed = true;
    close();
  };
  subject.destroy();
  expect(closed).to.equal(true);
});
