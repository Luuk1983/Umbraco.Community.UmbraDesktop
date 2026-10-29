import { expect } from '@open-wc/testing';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { BehaviorSubject, Subject } from '@umbraco-cms/backoffice/external/rxjs';
import { isSignInPath, UmbraDesktopFrameSessionController } from './frame-session.js';
import '../components/window.element.js';
import type { UmbraDesktopWindowElement } from '../components/window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';

/**
 * A window that boots or reloads while the session is gone is redirected, frame and all, to core's
 * sign-in page, which no modal swap can reach (design §7). The desktop catches the landing instead:
 * the window stays covered, the desktop locks, and once signed in again the window goes back to
 * where it was.
 */

describe('isSignInPath', () => {
  it('knows core’s sign-in page and the authorize endpoint that sends a frame there', () => {
    expect(isSignInPath('/umbraco/login', '/umbraco')).to.equal(true);
    expect(isSignInPath('/umbraco/login/', '/umbraco')).to.equal(true);
    expect(isSignInPath('/umbraco/management/api/v1/security/back-office/authorize', '/umbraco')).to.equal(true);
  });

  it('follows the backoffice path', () => {
    expect(isSignInPath('/cms/login', '/cms')).to.equal(true);
    expect(isSignInPath('/umbraco/login', '/cms')).to.equal(false);
  });

  it('leaves every other page alone', () => {
    expect(isSignInPath('/umbraco/section/content', '/umbraco')).to.equal(false);
    expect(isSignInPath('/umbraco/section/content/login', '/umbraco')).to.equal(false);
    expect(isSignInPath('/umbraco/logout', '/umbraco')).to.equal(false);
    expect(isSignInPath('/umbraco/loginx', '/umbraco')).to.equal(false);
  });
});

describe('a window landing on the sign-in page', () => {
  /** How long a case may take: a window loads a frame, twice. */
  const TIMEOUT_MS = 20_000;

  /** A page the test server serves, standing in for a backoffice section. */
  const PAGE = new URL('./frame-session.test.ts', import.meta.url).pathname;

  /** Core's sign-in page. The test server answers it with a 404, which is still a same-origin page. */
  const SIGN_IN = '/umbraco/login';

  const SECTION: UmbraDesktopApp = {
    alias: 'section',
    name: 'Section',
    icon: 'icon-document',
    content: { kind: 'iframe', url: PAGE },
    chromeProfile: 'bare',
  };

  let cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const dispose of cleanup) dispose();
    cleanup = [];
  });

  /** Until a condition holds, polling, so a case does not depend on how fast events are delivered. */
  async function until(condition: () => boolean): Promise<void> {
    for (let tries = 0; tries < 80 && !condition(); tries++) await new Promise((resolve) => setTimeout(resolve, 25));
  }

  /**
   * A window for `SECTION` on a desktop whose auth context is a stand-in, with its frame loaded.
   * @returns The window's state, its element, its frame, and the auth stand-in.
   */
  async function mounted() {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: fixed; left: 0; top: 0; width: 1000px; height: 700px;';
    document.body.appendChild(wrapper);
    const host = new UmbElementControllerHost(wrapper);
    const manager = new UmbraDesktopWindowManagerContext(host);
    new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
    const authorized = new BehaviorSubject(true);
    const auth = {
      timedOut: 0,
      isAuthorized: authorized.asObservable(),
      getIsAuthorized: () => authorized.getValue(),
      timeOut() {
        this.timedOut++;
        authorized.next(false);
      },
      authorize: () => authorized.next(true),
      getHostElement: () => wrapper,
    };
    new UmbContextProvider(wrapper, UMB_AUTH_CONTEXT, auth as never).hostConnected();
    cleanup.push(() => {
      host.destroy();
      wrapper.remove();
    });
    manager.open(SECTION);
    const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
    const state = (): UmbraDesktopWindow => manager.getWindows()[0];
    const sync = () => (element.window = { ...state() });
    const subscription = manager.windows.subscribe(() => element.isConnected && sync());
    cleanup.push(() => subscription.unsubscribe());
    wrapper.appendChild(element);
    sync();
    await element.updateComplete;
    const iframe = element.shadowRoot!.querySelector('iframe')!;
    await until(() => state().location === PAGE);
    return { state, element, iframe, auth };
  }

  /**
   * Send the frame to core's sign-in page, the way core's router does: a full navigation.
   * @param iframe The window's frame.
   */
  async function landOnSignIn(iframe: HTMLIFrameElement) {
    const loaded = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
    iframe.contentWindow!.location.href = SIGN_IN;
    await loaded;
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('locks the desktop and keeps the sign-in page covered', async function () {
    this.timeout(TIMEOUT_MS);
    const { element, iframe, auth, state } = await mounted();

    await landOnSignIn(iframe);
    await element.updateComplete;

    expect(auth.timedOut).to.equal(1);
    expect(element.shadowRoot!.querySelector('.loading'), 'the window stays covered').to.exist;
    // The sign-in page is not where this window is: reopening it later must not land there.
    expect(state().location).to.equal(PAGE);
  });

  it('sends the window back to where it was once signed in again', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, auth } = await mounted();
    await landOnSignIn(iframe);

    auth.authorize();
    await until(() => iframe.contentWindow?.location.pathname === PAGE);

    expect(iframe.contentWindow!.location.pathname).to.equal(PAGE);
  });

  it('does not lock a desktop that is already locked again', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, auth } = await mounted();
    auth.timeOut();

    await landOnSignIn(iframe);

    expect(auth.timedOut).to.equal(1);
  });

  /**
   * Stand in for core's auth context inside a frame: provided from a `umb-app` element the way
   * `UmbContextProvider` provides it, and optionally announced with the provide event core fires.
   * @param frame The frame's window.
   * @param announce Whether to fire the provide event, rather than having been provided before anyone listened.
   * @returns The frame's time-out signal, to fire.
   */
  function provideFrameAuth(frame: Window, announce: boolean) {
    const doc = frame.document;
    const app = doc.createElement('umb-app');
    doc.body.appendChild(app);
    const timeoutSignal = new Subject<void>();
    app.addEventListener('umb:context-request', (e: Event) => {
      const request = e as Event & { contextAlias: string; callback: (i: unknown) => boolean };
      if (request.contextAlias === 'UmbAuthContext' && request.callback({ timeoutSignal: timeoutSignal.asObservable() })) {
        e.stopPropagation();
      }
    });
    if (announce) {
      const event = new (frame as Window & typeof globalThis).Event('umb:context-provide', { bubbles: true, composed: true });
      Object.assign(event, { contextAlias: 'UmbAuthContext' });
      app.dispatchEvent(event);
    }
    return timeoutSignal;
  }

  it('locks the desktop when a window’s own session times out', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, auth } = await mounted();

    // A frame that starts up signed out never loads this package, so only the desktop can see it.
    provideFrameAuth(iframe.contentWindow!, true).next();

    expect(auth.timedOut).to.equal(1);
  });

  it('finds a session provided before the frame’s load event', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, auth } = await mounted();
    const signal = provideFrameAuth(iframe.contentWindow!, false);
    const host = new UmbElementControllerHost(iframe.parentElement!);
    const controller = new UmbraDesktopFrameSessionController(host);
    host.hostConnected();
    cleanup.push(() => host.destroy());
    await new Promise((resolve) => setTimeout(resolve));

    // Asked of core's `umb-app` directly, since its provide event came and went before anyone listened.
    cleanup.push(controller.watch(iframe));
    signal.next();

    expect(auth.timedOut).to.equal(1);
  });
});
