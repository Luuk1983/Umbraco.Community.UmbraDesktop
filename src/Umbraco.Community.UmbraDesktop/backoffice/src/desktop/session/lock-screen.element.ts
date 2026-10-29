import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import type { ManifestAuthProvider, UmbAuthContext } from '@umbraco-cms/backoffice/auth';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbCurrentUserModel } from '@umbraco-cms/backoffice/current-user';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_SERVER_CONTEXT } from '@umbraco-cms/backoffice/server';

/**
 * The desktop's lock screen, shown over everything when the session has ended (issue #160, design
 * §5 and §6).
 *
 * In the desktop's own look, the boot splash's and the welcome wizard's, and the same under every
 * theme: Luuk chose consistency over per-theme character. Opaque, so nothing of the desktop behind
 * shows while nobody is signed in.
 *
 * **The sign-in is core's, on purpose.** The buttons are rendered exactly as core's `umb-auth-view`
 * renders them on its own timed-out screen: an `authProvider` extension slot with core's default
 * button, the same filter, and `userLoginState` `'timedOut'`. So the lock offers precisely what
 * Umbraco would offer, a provider's own button element included, and every case behind a button
 * (a password, two-factor, Entra ID, a locked account) is handled by core's sign-in in core's popup.
 * A sign-in of our own was considered and dropped: the endpoints it would need are not in the
 * Management API's published spec.
 *
 * Closing is not this element's job. The modal it sits in closes when the session is authorised
 * again, whoever did that, and this element is gone with it.
 */
@customElement('umbradesktop-lock-screen')
export class UmbraDesktopLockScreenElement extends UmbLitElement {
  /** Whose session ended, from the current-user context, which keeps it after a time-out. */
  @state()
  private _user?: UmbCurrentUserModel;

  /** Whether the server allows signing in with a password, which decides the Umbraco button. */
  @state()
  private _allowLocalLogin = false;

  /** Whether the server connection is up. Core waits for it before offering buttons, and so does this. */
  @state()
  private _connected = false;

  /** What went wrong with the last sign-in, as core's own screen shows it. */
  @state()
  private _error?: string;

  /** The auth context, for signing in and out. */
  #auth?: Pick<UmbAuthContext, 'makeAuthorizationRequest' | 'signOut'>;

  constructor() {
    super();
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => (this.#auth = auth));
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      this.observe(context?.currentUser, (user) => (this._user = user), '_user');
    });
    this.consumeContext(UMB_SERVER_CONTEXT, (context) => {
      const connection = context?.getServerConnection();
      this.observe(connection?.allowLocalLogin, (allow) => (this._allowLocalLogin = allow ?? false), '_local');
      this.observe(connection?.isConnected, (connected) => (this._connected = connected ?? false), '_connected');
    });
  }

  /**
   * Which providers get a button: every one, except Umbraco's own when local sign-in is off. The
   * filter core's `umb-auth-view` applies, written the same way.
   * @param provider A registered auth provider.
   * @returns Whether it gets a button.
   */
  #filter = (provider: ManifestAuthProvider): boolean =>
    this._allowLocalLogin || provider.forProviderName.toLowerCase() !== 'umbraco';

  /**
   * Sign in with a provider, the way core's own screen does when the user has timed out: a popup
   * rather than a redirect, so every window on the desktop keeps what it was doing. When the popup
   * finishes, core broadcasts the session to every frame, and the modal around this closes.
   * @param providerOrManifest The provider, as a manifest or by name; a provider's own button may
   * submit either.
   * @param loginHint A login hint, if the provider's button passes one.
   */
  #onSubmit = async (providerOrManifest: string | ManifestAuthProvider, loginHint?: string): Promise<void> => {
    this._error = undefined;
    const manifest = typeof providerOrManifest === 'string' ? undefined : providerOrManifest;
    const name = typeof providerOrManifest === 'string' ? providerOrManifest : providerOrManifest.forProviderName;
    try {
      await this.#auth?.makeAuthorizationRequest(name, false, loginHint, manifest);
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
    }
  };

  /** Sign out, as the launcher's Log out does. Core sends the whole page to its sign-out. */
  #logout = () => {
    void this.#auth?.signOut();
  };

  override render() {
    const user = this._user;
    return html`
      <div class="screen">
        <div class="stack">
          <umb-user-avatar .name=${user?.name} .imgUrls=${user?.avatarUrls ?? []}></umb-user-avatar>
          <h2>${user?.name ?? ''}</h2>
          <p class="timeout">${this.localize.term('login_timeout')}</p>
          ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : ''}
          ${this._connected
            ? html`<umb-extension-slot
                id="providers"
                .type=${'authProvider'}
                .defaultElement=${'umb-auth-provider-default'}
                .props=${{ userLoginState: 'timedOut', onSubmit: this.#onSubmit }}
                .filter=${this.#filter}></umb-extension-slot>`
            : html`<uui-loader></uui-loader>`}
          <p class="other">
            ${this.localize.term('umbraDesktop_lockNotYou')}
            <button id="logout" type="button" @click=${this.#logout}>${this.localize.term('umbraDesktop_logout')}</button>
          </p>
        </div>
      </div>
    `;
  }

  static override styles = css`
    /* The whole viewport: the dialog around this is the size of what it holds. */
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      color: #fff;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      /* The welcome wizard's overrides, for the same reason: the backoffice's primary colour is its
         dark navy, which disappears on this ground. */
      --uui-color-default: #3544b1;
      --uui-color-default-emphasis: #2152a3;
      --uui-color-default-contrast: #fff;
      --uui-color-focus: rgba(255, 255, 255, 0.92);
      /* Core's outline button reads these; on this ground they need to be light. */
      --uui-color-default-standalone: #fff;
      --uui-color-border-standalone: rgba(255, 255, 255, 0.45);
    }

    /* The boot splash's ground and lift, as the welcome wizard and the migration screen write it. */
    .screen {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      overflow: auto;
      display: grid;
      place-items: center;
      padding: 24px 16px;
      background-color: #0b1024;
      background-image:
        radial-gradient(60% 72% at 50% 46%, rgba(38, 56, 111, 0.3) 0%, transparent 70%),
        radial-gradient(80% 90% at 50% 48%, transparent 38%, rgba(3, 5, 14, 0.7) 100%);
    }

    .stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: min(340px, 100%);
      text-align: center;
    }

    umb-user-avatar {
      font-size: 32px;
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.14);
      border-radius: 50%;
    }

    /* The welcome wizard's page heading. */
    h2 {
      margin: 18px 0 0;
      font-size: 28px;
      font-weight: 600;
      line-height: 1.2;
    }

    /* The wizard's hint colour. */
    .timeout,
    .other {
      margin: 10px 0 0;
      font-size: 14px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.72);
    }

    .error {
      margin: 14px 0 0;
      font-size: 14px;
      color: #ffb4ab;
    }

    /* Core's provider column, spaced as core spaces it. */
    #providers {
      display: flex;
      flex-direction: column;
      gap: var(--uui-size-space-5);
      width: 100%;
      margin-top: 28px;
    }

    uui-loader {
      margin-top: 28px;
    }

    .other {
      margin-top: 30px;
      font-size: 13px;
    }

    #logout {
      padding: 0;
      border: 0;
      background: none;
      color: #fff;
      font: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    #logout:focus-visible {
      outline: 2px solid var(--uui-color-focus);
      outline-offset: 2px;
    }
  `;
}

export default UmbraDesktopLockScreenElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-lock-screen': UmbraDesktopLockScreenElement;
  }
}
