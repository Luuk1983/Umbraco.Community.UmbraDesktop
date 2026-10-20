import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbraDesktopMediaContext } from './media.context.js';
import type { MediaContextDeps } from './media.context.js';
import type { MediaSaveRequest } from '../files/media-save.js';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbCurrentUserContext } from '@umbraco-cms/backoffice/current-user';
import { UmbBasicState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_ACTION_EVENT_CONTEXT } from '@umbraco-cms/backoffice/action';

/** A bare element to host the context, as the desktop element does in production. */
@customElement('umbradesktop-media-context-test-host')
class TestHost extends UmbLitElement {}

/** An app inside the desktop, which finds the context the way another package does. */
@customElement('umbradesktop-media-context-test-app')
class TestApp extends UmbLitElement {}

/**
 * Fakes for the four operations, recording the host each call ran on, so a test can check the call
 * ran on a host of its own and that the host was let go afterwards.
 * @returns The fakes and the hosts they saw.
 */
function fakes() {
  const hosts: UmbControllerHost[] = [];
  const deps: MediaContextDeps = {
    open: async (host) => {
      hosts.push(host);
      return { status: 'cancelled' };
    },
    save: async (host, request) => {
      hosts.push(host);
      return { ok: true, unique: `saved:${request.name}` };
    },
    pickSaveFolder: async (host) => {
      hosts.push(host);
      return { status: 'chosen', folder: 'f1' };
    },
    confirmOverwrite: async (host, name) => {
      hosts.push(host);
      return name === 'yes';
    },
  };
  return { deps, hosts };
}

/**
 * The context on a desktop stand-in, with an app inside it.
 * @param deps The operations the context runs.
 * @returns The host, the context and the app.
 */
async function mount(deps: MediaContextDeps) {
  const host = await fixture<TestHost>(html`<umbradesktop-media-context-test-host
    ><umbradesktop-media-context-test-app></umbradesktop-media-context-test-app
  ></umbradesktop-media-context-test-host>`);
  const context = new UmbraDesktopMediaContext(host, deps);
  const app = host.querySelector('umbradesktop-media-context-test-app') as TestApp;
  return { host, context, app };
}

/** A save request to vary. */
const request = (name: string): MediaSaveRequest => ({ file: new File(['x'], `${name}.txt`), name, folder: null });

/**
 * The alias is the published API: another package builds its own token from the string and imports
 * nothing, so a test that does exactly that is the one that would catch a rename.
 */
it('is found by another package through a token of its own with the published alias', async () => {
  const { context, app } = await mount(fakes().deps);
  const token = new UmbContextToken<UmbContextMinimal & { open(): Promise<unknown> }>('UmbraDesktopMediaContext');
  const found = await app.getContext(token);
  expect(found).to.equal(context);
});

it('runs each operation and hands back its answer', async () => {
  const { context } = await mount(fakes().deps);
  expect(await context.open()).to.deep.equal({ status: 'cancelled' });
  expect(await context.save(request('a'))).to.deep.equal({ ok: true, unique: 'saved:a' });
  expect(await context.pickSaveFolder()).to.deep.equal({ status: 'chosen', folder: 'f1' });
  expect(await context.confirmOverwrite('yes')).to.equal(true);
  expect(await context.confirmOverwrite('no')).to.equal(false);
});

/**
 * The context lives as long as the desktop, and each operation creates backoffice repositories on the
 * host it is given. Given the context itself, a day of saving would leave every one of them attached
 * to it, so each call gets a host of its own that is let go when the call is done.
 */
it('runs each call on a host of its own, and lets it go afterwards', async () => {
  const { deps, hosts } = fakes();
  const { context } = await mount(deps);
  await context.open();
  await context.save(request('a'));
  expect(hosts).to.have.length(2);
  expect(hosts[0]).to.not.equal(hosts[1]);
  for (const used of hosts) {
    expect(used).to.not.equal(context);
    expect(context.hasUmbController(used as never)).to.equal(false);
  }
});

it('lets a call host go when the call fails, and passes the failure on', async () => {
  const { deps, hosts } = fakes();
  deps.open = async (host) => {
    hosts.push(host);
    throw new Error('no picker');
  };
  const { context } = await mount(deps);
  let thrown: unknown;
  await context.open().catch((error) => (thrown = error));
  expect((thrown as Error)?.message).to.equal('no picker');
  expect(context.hasUmbController(hosts[0] as never)).to.equal(false);
});

it('passes the key to open, so a recent item opens without the picker', async () => {
  const { deps } = fakes();
  const seen: Array<{ unique?: string } | undefined> = [];
  deps.open = async (_host, options) => {
    seen.push(options);
    return { status: 'cancelled' };
  };
  const { context } = await mount(deps);
  await context.open({ unique: 'k1' });
  await context.open();
  expect(seen[0]).to.deep.equal({ unique: 'k1' });
  expect(seen[1]?.unique).to.equal(undefined);
});

/** Storage backed by a map, standing in for the browser's. */
class MapStorage {
  /** What is stored. */
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

it('records what any app opens or saves, and lists it per user', async () => {
  const { deps } = fakes();
  const blob = new Blob(['x']);
  deps.open = async () => ({
    status: 'opened',
    unique: 'k1',
    name: 'Beach',
    blob,
    extension: 'jpg',
    folder: 'f1',
    folderName: 'Holidays',
  });
  deps.save = async (_host, saved) => ({ ok: true, unique: saved.existing ?? 'k2' });
  const host = await fixture<TestHost>(html`<umbradesktop-media-context-test-host></umbradesktop-media-context-test-host>`);
  const user = new UmbBasicState<string | undefined>(undefined);
  host.provideContext(UMB_CURRENT_USER_CONTEXT, {
    unique: user.asObservable(),
    getHostElement: () => host,
  } as unknown as UmbCurrentUserContext);
  const storage = new MapStorage();
  const context = new UmbraDesktopMediaContext(host, deps, storage);

  await context.open();
  expect(await context.recent(), 'nothing until the user is known').to.deep.equal([]);
  expect(storage.map.size).to.equal(0);

  user.setValue('u1');
  await context.open();
  await context.save({ file: new File(['x'], 'notes.txt'), name: 'Notes', folder: 'f3' });
  await context.save({ file: new File(['x'], 'beach.webp'), name: 'Beach', folder: null, existing: 'k1' });
  expect(await context.save({ file: new File(['x'], 'x.png'), name: 'X', folder: null }).then(() => 1)).to.equal(1);

  const listed = await context.recent(['jpg', 'webp']);
  expect(listed.map((e) => e.unique), 'the save over k1 moved it to the top').to.deep.equal(['k1']);
  expect(listed[0].extension).to.equal('webp');
  expect(listed[0].folderName, 'the open knew its folder').to.equal('Holidays');
  expect((await context.recent()).map((e) => e.unique)).to.include('k2');

  context.forgetRecent('k1');
  expect((await context.recent(['jpg', 'webp'])).length).to.equal(0);

  user.setValue('u2');
  expect(await context.recent(), 'another user has their own list').to.deep.equal([]);
});

it('does not record a cancelled open or a failed save', async () => {
  const { deps } = fakes();
  deps.save = async () => ({ ok: false, message: 'no' });
  const host = await fixture<TestHost>(html`<umbradesktop-media-context-test-host></umbradesktop-media-context-test-host>`);
  host.provideContext(UMB_CURRENT_USER_CONTEXT, {
    unique: new UmbBasicState<string | undefined>('u1').asObservable(),
    getHostElement: () => host,
  } as unknown as UmbCurrentUserContext);
  const context = new UmbraDesktopMediaContext(host, deps, new MapStorage());
  await context.open();
  await context.save(request('a'));
  expect(await context.recent()).to.deep.equal([]);
});

/**
 * A save tells the windows on the desktop page what changed, through core's own action events, as
 * core's media workspace does after its own save (#137). Found in a real backoffice: a Media Manager
 * window kept the old preview after the Image Editor saved over the picture, until the folder was
 * loaded again. Core clears its thumbnail cache on the save; the events are what make the cards ask.
 */
describe('telling the windows what a save changed', () => {
  /**
   * The context under a stand-in of core's action event context, recording what it is told.
   * @param deps The operations.
   * @returns The context and the events it dispatched, as type and entity.
   */
  async function withEvents(deps: MediaContextDeps) {
    const seen: Array<[string, string, string | null]> = [];
    const events = new EventTarget();
    for (const type of ['entity-updated', 'request-reload-structure-for-entity', 'request-reload-children-of-entity']) {
      events.addEventListener(type, (event) => {
        const entity = event as Event & { getEntityType(): string; getUnique(): string | null };
        seen.push([event.type, entity.getEntityType(), entity.getUnique()]);
      });
    }
    const host = await fixture<TestHost>(html`<umbradesktop-media-context-test-host></umbradesktop-media-context-test-host>`);
    host.provideContext(UMB_ACTION_EVENT_CONTEXT, Object.assign(events, { getHostElement: () => host }) as never);
    const context = new UmbraDesktopMediaContext(host, deps, new MapStorage());
    return { context, seen };
  }

  it('says the item changed after a save over it, so its thumbnails and its row load again', async () => {
    const { deps } = fakes();
    deps.save = async () => ({ ok: true, unique: 'k1' });
    const { context, seen } = await withEvents(deps);
    await context.save({ ...request('beach'), existing: 'k1', folder: 'f1' });
    expect(seen).to.deep.equal([
      ['entity-updated', 'media', 'k1'],
      ['request-reload-structure-for-entity', 'media', 'k1'],
    ]);
  });

  it('reloads the folder a new item went into, so the item shows there', async () => {
    const { deps } = fakes();
    deps.save = async () => ({ ok: true, unique: 'new1' });
    const { context, seen } = await withEvents(deps);
    await context.save({ ...request('copy'), folder: 'f1' });
    await context.save({ ...request('copy'), folder: null });
    expect(seen).to.deep.equal([
      ['request-reload-children-of-entity', 'media', 'f1'],
      ['request-reload-children-of-entity', 'media-root', null],
    ]);
  });

  it('says nothing after a failed save', async () => {
    const { deps } = fakes();
    deps.save = async () => ({ ok: false, message: 'no' });
    const { context, seen } = await withEvents(deps);
    await context.save({ ...request('beach'), existing: 'k1' });
    expect(seen).to.deep.equal([]);
  });
});
