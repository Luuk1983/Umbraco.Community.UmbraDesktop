import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import type { UmbAuthContext } from '@umbraco-cms/backoffice/auth';
import { createExtensionElement } from '@umbraco-cms/backoffice/extension-api';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import type { ManifestModal } from '@umbraco-cms/backoffice/modal';
import { findHostDesktopContext } from '../host-desktop.js';
import { coreSessionModal, UMBRADESKTOP_SESSION_SIGN_IN_ALIAS } from './core-session-modals.js';
import { sessionPlacement } from './placement.js';
import type { UmbraDesktopSessionPlacement } from './placement.js';
import './lock-screen.element.js';

/** The part of the desktop's auth context a window reaches for, to lock the desktop. */
type UmbraDesktopHostAuth = Pick<UmbAuthContext, 'getIsAuthorized' | 'timeOut'>;

/**
 * The dialog elements core wraps its two session modals in: `uui-modal-dialog` for the warning (a
 * `'dialog'` modal) and `umb-persistent-modal-dialog` for the sign-in (a `'custom'` one, which
 * `UmbAppAuthController` asks for so Escape cannot dismiss it).
 */
const DIALOG_TAGS = new Set(['uui-modal-dialog', 'umb-persistent-modal-dialog']);

/**
 * Registered in place of core's session warning and core's sign-in screen, in every frame (design
 * §4). One element for both, told apart by the alias it was registered under, because what each
 * does depends far more on where it has opened than on which it is:
 *
 * | Where | Warning | Sign-in |
 * |---|---|---|
 * | A window's frame on a desktop | nothing | nothing, and the desktop is told to lock |
 * | A document showing a desktop | core's own | the lock screen |
 * | Anywhere else | core's own | core's own |
 *
 * Decided when it connects, never at registration, because one document can be a desktop now and
 * the classic backoffice after Exit.
 *
 * **In a window the warning stays open, invisibly.** Rejecting it would make core refresh the token,
 * silently extending the session from a window nobody is looking at. Core closes it itself, on the
 * session update the desktop's own Stay signed in sends every frame, or on the time-out.
 *
 * **The sign-in closes itself once the session is authorised again**, whoever did that, exactly as
 * core's own `umb-app-auth-modal` does, and with the value core's `UmbAppAuthController` reads.
 */
@customElement('umbradesktop-session-modal')
export class UmbraDesktopSessionModalElement extends UmbModalBaseElement {
  /** Where this modal has opened. Worked out on connect when unset; a test sets it. */
  @property({ attribute: false })
  public placement?: UmbraDesktopSessionPlacement;

  /** Core's own manifest for this modal, to hand back to. Looked up by alias when unset. */
  @property({ attribute: false })
  public core?: ManifestModal;

  /**
   * How a window reaches the desktop's auth context. Through the frame, as the desk tools reach the
   * window manager; replaceable for a test.
   */
  @property({ attribute: false })
  public hostAuth: () => UmbraDesktopHostAuth | undefined = () => findHostDesktopContext(UMB_AUTH_CONTEXT);

  /** What this modal decided to be on connect. */
  @state()
  private _placement?: UmbraDesktopSessionPlacement;

  /** Core's element, when this modal hands back to it. */
  @state()
  private _core?: HTMLElement;

  /** Whether this has submitted, so a session authorised twice submits once. */
  #submitted = false;

  /** Whether this modal stands in for core's sign-in rather than its warning. */
  get #isSignIn(): boolean {
    return this.manifest?.alias === UMBRADESKTOP_SESSION_SIGN_IN_ALIAS;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Once: a modal that moved would be a modal that changed its mind about what it is.
    if (this._placement) return;
    const placement = this.placement ?? sessionPlacement();
    this._placement = placement;

    if (placement === 'elsewhere' || (placement === 'desktop' && !this.#isSignIn)) {
      void this.#handBack();
      return;
    }

    const dialog = this.#dialog();
    if (placement === 'window') {
      // Not painted at all, backdrop included. The frame is inert behind it while it is open, which
      // costs nothing: the desktop's own warning or lock covers every window at the same moment.
      dialog?.style.setProperty('display', 'none', 'important');
      if (this.#isSignIn) this.#lockDesktop();
    } else {
      // The lock screen fills the viewport, so the dialog around it should not round its corners
      // onto the backdrop.
      dialog?.style.setProperty('--uui-modal-dialog-border-radius', '0');
    }

    if (this.#isSignIn) {
      this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
        this.observe(auth?.isAuthorized, (authorized) => authorized && this.#close(), '_authorized');
      });
    }
  }

  /**
   * Show core's own element for this modal, handed exactly what the modal manager handed this one,
   * the way `modal.element.js` hands it to an element it creates.
   */
  async #handBack(): Promise<void> {
    const manifest = this.core ?? coreSessionModal(this.manifest?.alias ?? '');
    if (!manifest) return;
    const element = (await createExtensionElement(manifest)) as
      | (HTMLElement & Pick<UmbModalBaseElement, 'manifest' | 'data' | 'modalContext'>)
      | undefined;
    if (!element) return;
    element.manifest = manifest;
    element.data = this.data;
    element.modalContext = this.modalContext;
    this._core = element;
  }

  /**
   * Lock the desktop, from a window whose own session has ended while the desktop's has not.
   *
   * The case this issue exists for: core's `timeOut()` is local to the frame that calls it, so a
   * window whose refresh the server rejected times out alone while the desktop still looks alive.
   * The refresh token is shared, so the desktop is no better off; timing it out shows the lock. Left
   * alone when the desktop is already locked, which is also the ordinary case of a session that ran
   * out everywhere at once.
   */
  #lockDesktop(): void {
    const auth = this.hostAuth();
    if (auth?.getIsAuthorized()) auth.timeOut();
  }

  /** Close the sign-in with the value core's `UmbAppAuthController` reads as signed in. */
  #close(): void {
    if (this.#submitted) return;
    this.#submitted = true;
    this.value = { success: true };
    this._submitModal();
  }

  /**
   * The dialog core wrapped this modal in, found by walking up through shadow roots.
   * @returns The dialog element, or undefined when this is not inside one (a test).
   */
  #dialog(): HTMLElement | undefined {
    let node: Node | null = this.parentNode;
    while (node) {
      if (node instanceof HTMLElement && DIALOG_TAGS.has(node.localName)) return node;
      node = node instanceof ShadowRoot ? node.host : node.parentNode;
    }
    return undefined;
  }

  override render() {
    if (this._core) return this._core;
    if (this._placement === 'desktop' && this.#isSignIn) return html`<umbradesktop-lock-screen></umbradesktop-lock-screen>`;
    return nothing;
  }

  static override styles = css`
    :host {
      display: contents;
    }
  `;
}

export default UmbraDesktopSessionModalElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-session-modal': UmbraDesktopSessionModalElement;
  }
}
