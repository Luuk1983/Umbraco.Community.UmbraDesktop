import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbraDesktopMediaContext } from './media.context.js';
import type { MediaContextDeps } from './media.context.js';
import type { MediaSaveRequest } from '../files/media-save.js';

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
