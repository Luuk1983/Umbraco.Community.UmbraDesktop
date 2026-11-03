import { expect } from '@open-wc/testing';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMB_SERVER_CONTEXT } from '@umbraco-cms/backoffice/server';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { BehaviorSubject } from '@umbraco-cms/backoffice/external/rxjs';
import './lock-screen.element.js';
import type { UmbraDesktopLockScreenElement } from './lock-screen.element.js';

/**
 * The lock screen (design §5, §6): the user, core's timed-out line, and core's own sign-in buttons,
 * rendered the way core's `umb-auth-view` renders them, so the buttons are always exactly the ones
 * Umbraco itself would offer. Signing in is core's own popup.
 */

/** The shape `umb-auth-view` hands each provider element, as far as these cases call it. */
interface ProviderProps {
  userLoginState: string;
  onSubmit: (provider: string | { forProviderName: string }, loginHint?: string) => Promise<void>;
}

/** The slot the lock screen renders the buttons through. */
type ProviderSlot = HTMLElement & {
  type: string;
  defaultElement: string;
  props: ProviderProps;
  filter: (manifest: { forProviderName: string }) => boolean;
};

let teardown: Array<() => void> = [];
afterEach(() => {
  for (const dispose of teardown.reverse()) dispose();
  teardown = [];
});

/**
 * Mount the lock screen under stand-ins for the three contexts it reads.
 * @param options.allowLocalLogin Whether the server allows signing in with a password.
 * @param options.connected Whether the server connection is up.
 * @param options.authorize What the auth context's `makeAuthorizationRequest` does.
 * @returns The element, the auth stand-in, and the server's connection state.
 */
async function mount(options: { allowLocalLogin?: boolean; connected?: boolean; authorize?: () => Promise<void> } = {}) {
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  teardown.push(() => wrapper.remove());

  const auth = {
    requests: [] as Array<unknown[]>,
    signedOut: 0,
    authorized: false,
    async makeAuthorizationRequest(...args: unknown[]) {
      this.requests.push(args);
      await (options.authorize?.() ?? Promise.resolve());
    },
    getIsAuthorized() {
      return this.authorized;
    },
    async signOut() {
      this.signedOut++;
    },
    getHostElement: () => wrapper,
  };
  const user = new BehaviorSubject({ name: 'Luuk Peters', userName: 'luuk@example.com', avatarUrls: [] as string[] });
  const allowLocalLogin = new BehaviorSubject(options.allowLocalLogin ?? true);
  const isConnected = new BehaviorSubject(options.connected ?? true);
  const server = {
    getHostElement: () => wrapper,
    getServerUrl: () => '',
    getServerConnection: () => ({ allowLocalLogin: allowLocalLogin.asObservable(), isConnected: isConnected.asObservable() }),
  };
  new UmbContextProvider(wrapper, UMB_AUTH_CONTEXT, auth as never).hostConnected();
  new UmbContextProvider(wrapper, UMB_CURRENT_USER_CONTEXT, { currentUser: user.asObservable(), getHostElement: () => wrapper } as never).hostConnected();
  new UmbContextProvider(wrapper, UMB_SERVER_CONTEXT, server as never).hostConnected();

  const element = document.createElement('umbradesktop-lock-screen') as UmbraDesktopLockScreenElement;
  wrapper.appendChild(element);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve));
  await element.updateComplete;
  return { element, auth, isConnected };
}

/**
 * The provider slot the lock screen rendered.
 * @param element The lock screen.
 * @returns The slot, or null.
 */
const slot = (element: UmbraDesktopLockScreenElement) =>
  element.shadowRoot!.querySelector('umb-extension-slot') as ProviderSlot | null;

it('shows whose session it is', async () => {
  const { element } = await mount();

  expect(element.shadowRoot!.textContent).to.contain('Luuk Peters');
  expect(element.shadowRoot!.querySelector('umb-user-avatar')).to.exist;
});

it('offers core’s sign-in buttons, the way core’s timed-out screen does', async () => {
  const { element } = await mount();
  const providers = slot(element)!;

  expect(providers.type).to.equal('authProvider');
  expect(providers.defaultElement).to.equal('umb-auth-provider-default');
  expect(providers.props.userLoginState).to.equal('timedOut');
});

it('hides the Umbraco button when local sign-in is off, as core does', async () => {
  const { element } = await mount({ allowLocalLogin: false });
  const filter = slot(element)!.filter;

  expect(filter({ forProviderName: 'Umbraco' })).to.equal(false);
  expect(filter({ forProviderName: 'umbraco' })).to.equal(false);
  expect(filter({ forProviderName: 'Umbraco.AzureAD' })).to.equal(true);
});

it('shows every button when local sign-in is on', async () => {
  const { element } = await mount({ allowLocalLogin: true });
  const filter = slot(element)!.filter;

  expect(filter({ forProviderName: 'Umbraco' })).to.equal(true);
  expect(filter({ forProviderName: 'Umbraco.AzureAD' })).to.equal(true);
});

it('waits for the server connection before offering anything', async () => {
  const { element, isConnected } = await mount({ connected: false });
  expect(slot(element)).to.equal(null);

  isConnected.next(true);
  await element.updateComplete;
  expect(slot(element)).to.exist;
});

it('signs in through core’s popup, never a redirect, so every window keeps its work', async () => {
  const { element, auth } = await mount();
  const manifest = { forProviderName: 'Umbraco.AzureAD' };

  await slot(element)!.props.onSubmit(manifest, 'hint');

  expect(auth.requests).to.deep.equal([['Umbraco.AzureAD', false, 'hint', manifest]]);
});

it('accepts a provider by name, as a custom provider element may submit one', async () => {
  const { element, auth } = await mount();

  await slot(element)!.props.onSubmit('Umbraco');

  expect(auth.requests).to.deep.equal([['Umbraco', false, undefined, undefined]]);
});

it('shows what went wrong when the sign-in fails', async () => {
  const { element } = await mount({ authorize: () => Promise.reject(new Error('Popup blocked')) });

  await slot(element)!.props.onSubmit('Umbraco');
  await element.updateComplete;

  expect(element.shadowRoot!.textContent).to.contain('Popup blocked');
});

it('logs out the way the launcher does', async () => {
  const { element, auth } = await mount();

  (element.shadowRoot!.querySelector('#logout') as HTMLElement).click();

  expect(auth.signedOut).to.equal(1);
});
