import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import type { UmbAuthContext } from '@umbraco-cms/backoffice/auth';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { Observable, Subscription } from '@umbraco-cms/backoffice/external/rxjs';
import { aliasesOf, requestContextFrom, watchProvidedContexts } from '../frame-context.js';

/**
 * Where core's own `makeAuthorizationRequest` sends a page to sign in: the authorize endpoint, which
 * redirects to the sign-in page. Core writes it as `${serverUrl}/umbraco/management/api/...`, with
 * `/umbraco` fixed rather than the backoffice path (17.6, `auth.context.js`), so it is fixed here too.
 */
const AUTHORIZE_PATH = '/umbraco/management/api/v1/security/back-office/authorize';

/**
 * Whether a frame's path is core's sign-in: the sign-in page under the backoffice path, or the
 * authorize endpoint that sends a page there.
 * @param pathname The frame's `location.pathname`.
 * @param backofficePath The backoffice path, with no trailing slash.
 * @returns Whether the frame is signing in rather than showing the backoffice.
 */
export function isSignInPath(pathname: string, backofficePath: string): boolean {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return trimmed === `${backofficePath}/login` || trimmed === AUTHORIZE_PATH;
}

/**
 * Locks the desktop, from the desktop's side, whenever a window's own session ends (design §7).
 *
 * The session modals this package swaps in lock the desktop from inside a window too, but only in a
 * frame where this package has loaded, and a frame that starts up signed out never loads it: core
 * fetches a package's code only once signed in. Measured in the real run: a window opened after the
 * server had ended the session showed core's own sign-in inside its frame, and the desktop stayed
 * up. So the window watches its frame from outside as well, in two ways:
 *
 * - **{@link watch}**: the frame's own auth context. When it times out, the desktop locks.
 * - **{@link landed}**: where the frame lands. Core's router sends a frame it finds unauthorised to
 *   the sign-in page outright when there is one provider
 *   (`UmbAppAuthController.makeAuthorizationRequest('loggingIn')` with `redirect`), with no time-out
 *   to hear. The window stays covered, and is sent back once signed in again.
 *
 * One per window element, which owns the loader that keeps the sign-in page out of sight.
 */
export class UmbraDesktopFrameSessionController extends UmbControllerBase {
  /** The desktop's auth context. */
  #auth?: Pick<UmbAuthContext, 'getIsAuthorized' | 'timeOut' | 'isAuthorized'>;

  /** The wait for the session to come back, while a landing is pending. */
  #waiting?: Subscription;

  constructor(host: UmbControllerHost) {
    super(host);
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => (this.#auth = auth));
  }

  /**
   * Handle a frame that has just loaded, if it landed on the sign-in page.
   *
   * Locks the desktop unless it already is, then waits for the session to be authorised again and
   * sends the frame to `returnTo`. The window keeps its loader up meanwhile, so the sign-in page
   * inside the frame is never on screen.
   * @param iframe The window's frame, just loaded.
   * @param backofficePath The backoffice path, with no trailing slash.
   * @param returnTo Where to send the frame back to: the last page the window was on.
   * @returns Whether the frame landed on the sign-in page, in which case the caller treats this load
   * as no load at all.
   */
  landed(iframe: HTMLIFrameElement, backofficePath: string, returnTo: string): boolean {
    let pathname: string;
    try {
      pathname = iframe.contentWindow?.location.pathname ?? '';
    } catch {
      // Another origin: not core's sign-in, which is always this one.
      return false;
    }
    if (!isSignInPath(pathname, backofficePath)) return false;

    this.#lock();
    this.#waiting?.unsubscribe();
    this.#waiting = this.#auth?.isAuthorized.subscribe((authorized) => {
      if (!authorized) return;
      this.#waiting?.unsubscribe();
      this.#waiting = undefined;
      iframe.src = returnTo;
    });
    return true;
  }

  /**
   * Watch a freshly loaded frame's own auth context, and lock the desktop when it times out.
   *
   * Found the way the other frame watches find contexts (`frame-context.ts`), and also asked of
   * core's `umb-app` directly, which provides it: its provide event may already have gone by the
   * time the frame's load event reaches the window.
   * @param iframe The window's frame, just loaded.
   * @returns A function that stops watching, for the next load and the window's removal.
   */
  watch(iframe: HTMLIFrameElement): () => void {
    let doc: Document | null;
    try {
      doc = iframe.contentDocument;
    } catch {
      doc = null;
    }
    if (!doc) return () => {};
    const [contextAlias, apiAlias] = aliasesOf(UMB_AUTH_CONTEXT);
    const watched = new Set<unknown>();
    const subscriptions: Subscription[] = [];
    const onInstance = (instance: unknown) => {
      if (watched.has(instance)) return true;
      watched.add(instance);
      const signal = (instance as { timeoutSignal?: Observable<void> }).timeoutSignal;
      if (signal) subscriptions.push(signal.subscribe(() => this.#lock()));
      return true;
    };
    const stop = watchProvidedContexts(doc, contextAlias, apiAlias, onInstance);
    const app = doc.querySelector('umb-app');
    if (app) requestContextFrom(app, contextAlias, apiAlias, onInstance);
    return () => {
      stop();
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }

  /**
   * Lock the desktop by timing its own session out, which makes core open its sign-in, which is the
   * lock screen. Left alone when it is locked already, which is also what a session that ran out
   * everywhere at once looks like from here.
   */
  #lock(): void {
    if (this.#auth?.getIsAuthorized()) this.#auth.timeOut();
  }

  override destroy(): void {
    this.#waiting?.unsubscribe();
    this.#waiting = undefined;
    super.destroy();
  }
}
