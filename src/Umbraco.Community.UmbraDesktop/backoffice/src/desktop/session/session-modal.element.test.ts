import { expect } from '@open-wc/testing';
import '@umbraco-cms/backoffice/external/uui';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { BehaviorSubject } from '@umbraco-cms/backoffice/external/rxjs';
import './session-modal.element.js';
import type { UmbraDesktopSessionModalElement } from './session-modal.element.js';
import { UMBRADESKTOP_SESSION_SIGN_IN_ALIAS, UMBRADESKTOP_SESSION_WARNING_ALIAS } from './core-session-modals.js';
import type { UmbraDesktopSessionPlacement } from './placement.js';

/**
 * The element registered in place of core's two session modals (design §4). It decides when it
 * renders, by where it is: core's own element anywhere but on a desktop, nothing in a window's frame
 * (with the desktop told to lock), and the lock screen for the sign-in on a desktop.
 */

/** Core's element, as far as these cases need one: something that records what it was handed. */
class CoreStandIn extends HTMLElement {
  manifest?: unknown;
  data?: unknown;
  modalContext?: unknown;
}
customElements.define('test-core-session-stand-in', CoreStandIn);

/** What the modal manager hands a modal element, reduced to what the element under test uses. */
function fakeModalContext() {
  const value = new BehaviorSubject<unknown>({});
  return {
    data: { userLoginState: 'timedOut' },
    value: value.asObservable(),
    submitted: false,
    setValue(next: unknown) {
      value.next(next);
    },
    updateValue(partial: object) {
      value.next({ ...(value.getValue() as object), ...partial });
    },
    submit() {
      this.submitted = true;
    },
    reject() {},
    getValue: () => value.getValue(),
  };
}

/** The part of an auth context these cases touch. */
function fakeAuth(authorized: boolean) {
  const state = new BehaviorSubject(authorized);
  return {
    isAuthorized: state.asObservable(),
    timedOut: 0,
    getIsAuthorized: () => state.getValue(),
    timeOut() {
      this.timedOut++;
      state.next(false);
    },
    authorize: () => state.next(true),
    getHostElement: () => document.body,
  };
}

let teardown: Array<() => void> = [];
afterEach(() => {
  for (const dispose of teardown.reverse()) dispose();
  teardown = [];
});

/**
 * Mount the element the way the modal manager would, inside a container.
 * @param options.alias Which of core's modals it stands in for.
 * @param options.placement Where it is.
 * @param options.parent The element to mount it in; a fresh div by default.
 * @param options.auth The auth context this frame provides, if any.
 * @param options.hostAuth The desktop's auth context, reached from a window, if any.
 * @returns The element and the modal context it was handed.
 */
async function mount(options: {
  alias: string;
  placement: UmbraDesktopSessionPlacement;
  parent?: HTMLElement;
  auth?: ReturnType<typeof fakeAuth>;
  hostAuth?: ReturnType<typeof fakeAuth>;
}) {
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  teardown.push(() => wrapper.remove());
  if (options.auth) new UmbContextProvider(wrapper, UMB_AUTH_CONTEXT, options.auth as never).hostConnected();
  const parent = options.parent ?? document.createElement('div');
  wrapper.appendChild(parent);

  const modalContext = fakeModalContext();
  const element = document.createElement('umbradesktop-session-modal') as UmbraDesktopSessionModalElement;
  element.placement = options.placement;
  element.core = { type: 'modal', alias: options.alias, name: 'Core', element: CoreStandIn } as never;
  element.hostAuth = () => options.hostAuth as never;
  element.manifest = { type: 'modal', alias: options.alias, name: 'UmbraDesktop' } as never;
  element.data = modalContext.data as never;
  element.modalContext = modalContext as never;
  parent.appendChild(element);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve));
  await element.updateComplete;
  return { element, modalContext };
}

for (const alias of [UMBRADESKTOP_SESSION_WARNING_ALIAS, UMBRADESKTOP_SESSION_SIGN_IN_ALIAS]) {
  it(`shows core’s own element outside a desktop (${alias})`, async () => {
    const { element, modalContext } = await mount({ alias, placement: 'elsewhere' });

    const core = element.shadowRoot!.querySelector('test-core-session-stand-in') as CoreStandIn;
    expect(core).to.exist;
    expect(core.data).to.equal(modalContext.data);
    expect(core.modalContext).to.equal(modalContext);
    expect(element.shadowRoot!.querySelector('umbradesktop-lock-screen')).to.equal(null);
  });
}

it('shows core’s own warning on the desktop', async () => {
  const { element } = await mount({ alias: UMBRADESKTOP_SESSION_WARNING_ALIAS, placement: 'desktop' });

  expect(element.shadowRoot!.querySelector('test-core-session-stand-in')).to.exist;
});

it('shows the lock screen for the sign-in on the desktop', async () => {
  const { element } = await mount({ alias: UMBRADESKTOP_SESSION_SIGN_IN_ALIAS, placement: 'desktop' });

  expect(element.shadowRoot!.querySelector('umbradesktop-lock-screen')).to.exist;
  expect(element.shadowRoot!.querySelector('test-core-session-stand-in')).to.equal(null);
});

for (const alias of [UMBRADESKTOP_SESSION_WARNING_ALIAS, UMBRADESKTOP_SESSION_SIGN_IN_ALIAS]) {
  it(`shows nothing in a window, not even its dialog (${alias})`, async () => {
    const dialog = document.createElement('uui-modal-dialog');
    const { element } = await mount({ alias, placement: 'window', parent: dialog, hostAuth: fakeAuth(false) });

    expect(element.shadowRoot!.children.length).to.equal(0);
    // The dialog is open in the frame's top layer; it must not paint, backdrop included.
    const native = dialog.shadowRoot!.querySelector('dialog')!;
    expect(native.getBoundingClientRect().width).to.equal(0);
    expect(getComputedStyle(dialog).display).to.equal('none');
  });
}

it('locks the desktop when a window’s session times out on its own', async () => {
  const hostAuth = fakeAuth(true);
  await mount({ alias: UMBRADESKTOP_SESSION_SIGN_IN_ALIAS, placement: 'window', hostAuth });

  expect(hostAuth.timedOut).to.equal(1);
});

it('leaves a desktop that is already locked alone', async () => {
  const hostAuth = fakeAuth(false);
  await mount({ alias: UMBRADESKTOP_SESSION_SIGN_IN_ALIAS, placement: 'window', hostAuth });

  expect(hostAuth.timedOut).to.equal(0);
});

it('never locks the desktop for the warning', async () => {
  const hostAuth = fakeAuth(true);
  await mount({ alias: UMBRADESKTOP_SESSION_WARNING_ALIAS, placement: 'window', hostAuth });

  // The warning in a window is the same moment as the desktop's own warning; nothing has ended yet.
  expect(hostAuth.timedOut).to.equal(0);
});

for (const placement of ['window', 'desktop'] as const) {
  it(`closes the sign-in once the session is authorised again (${placement})`, async () => {
    const auth = fakeAuth(false);
    const { modalContext } = await mount({
      alias: UMBRADESKTOP_SESSION_SIGN_IN_ALIAS,
      placement,
      auth,
      hostAuth: fakeAuth(false),
    });
    expect(modalContext.submitted).to.equal(false);

    auth.authorize();

    expect(modalContext.submitted).to.equal(true);
    // What core's own sign-in submits, and what `UmbAppAuthController` reads.
    expect(modalContext.getValue()).to.deep.equal({ success: true });
  });
}

it('leaves the warning in a window open, so it never refreshes the session itself', async () => {
  const auth = fakeAuth(true);
  const { modalContext } = await mount({ alias: UMBRADESKTOP_SESSION_WARNING_ALIAS, placement: 'window', auth });

  // Rejecting it would make core refresh the token from a window nobody is looking at. Core closes
  // it itself, on a session update or a time-out.
  expect(modalContext.submitted).to.equal(false);
});
