import type { UmbraDesktopApp, UmbraDesktopLauncherGroup } from '../types';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { css, customElement, html, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_SEARCH_MODAL } from '@umbraco-cms/backoffice/search';
import { UMB_CURRENT_USER_CONTEXT, UMB_CURRENT_USER_MODAL } from '@umbraco-cms/backoffice/current-user';
import type { UmbCurrentUserModel } from '@umbraco-cms/backoffice/current-user';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * Dummy favourites until persistence (Plan 2). Aliases reference real derived apps;
 * any alias with no matching app (e.g. not curated, or gated out for this user) is
 * silently skipped.
 */
const DUMMY_FAVOURITE_ALIASES = ['content', 'media', 'log-viewer'];

/** How many apps the dummy "Recent" zone shows, until real recency tracking exists (Plan 2). */
const DUMMY_RECENT_COUNT = 4;

/**
 * The start-menu-style launcher panel: search, dummy Favourites/Recent, the curated
 * app groups as icon-tiles, and a footer (user, desktop settings, log out, exit).
 * Mounted by `<umbradesktop-taskbar>`, which owns the panel's open/close state and
 * outside-click/Escape dismissal.
 */
@customElement('umbradesktop-launcher')
export class UmbraDesktopLauncherElement extends UmbLitElement {
  @state()
  private _groups: UmbraDesktopLauncherGroup[] = [];

  @state()
  private _apps: UmbraDesktopApp[] = [];

  @state()
  private _currentUser?: UmbCurrentUserModel;

  #manager?: UmbraDesktopWindowManagerContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, (ctx) => {
      if (!ctx) return;
      this.observe(ctx.groups, (groups) => (this._groups = groups));
      this.observe(ctx.apps, (apps) => (this._apps = apps));
    });
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
    });
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (ctx) => {
      if (!ctx) return;
      this.observe(ctx.currentUser, (user) => (this._currentUser = user));
    });
  }

  /** Dummy favourites: the curated aliases resolved against the flat app list, missing ones dropped. */
  get #favourites(): UmbraDesktopApp[] {
    return DUMMY_FAVOURITE_ALIASES.map((alias) => this._apps.find((a) => a.alias === alias)).filter(
      (a): a is UmbraDesktopApp => !!a,
    );
  }

  /** Dummy recent: just the first few apps in the flat list, until real recency tracking exists. */
  get #recent(): UmbraDesktopApp[] {
    return this._apps.slice(0, DUMMY_RECENT_COUNT);
  }

  /** Launch an app and let the taskbar know so it can close the launcher. */
  #open(app: UmbraDesktopApp) {
    this.#manager?.open(app);
    this.dispatchEvent(new CustomEvent('launched'));
  }

  /** Open the native backoffice search modal. */
  async #openSearch() {
    await umbOpenModal(this, UMB_SEARCH_MODAL).catch(() => undefined);
  }

  /** Open the native current-user modal (profile, MFA, etc.). */
  async #openUser() {
    await umbOpenModal(this, UMB_CURRENT_USER_MODAL).catch(() => undefined);
  }

  /** Sign the current user out. */
  async #logout() {
    const auth = await this.getContext(UMB_AUTH_CONTEXT);
    await auth?.signOut();
  }

  /** Ask the taskbar to run its exit-desktop confirm flow. */
  #exit() {
    this.dispatchEvent(new CustomEvent('exit'));
  }

  #tile(app: UmbraDesktopApp) {
    return html`
      <button class="tile" title=${this.localize.string(app.name)} @click=${() => this.#open(app)}>
        <umb-icon name=${app.icon}></umb-icon>
        <span class="tlb">${this.localize.string(app.name)}</span>
      </button>
    `;
  }

  /** A labelled zone of app tiles (Favourites, Recent, or a curated group); omitted entirely when empty. */
  #zone(label: string, apps: ReadonlyArray<UmbraDesktopApp>) {
    if (apps.length === 0) return '';
    return html`
      <div class="zone">
        <div class="zl">${label}</div>
        <div class="grid">${repeat(apps, (a) => a.alias, (a) => this.#tile(a))}</div>
      </div>
    `;
  }

  #renderFooter() {
    const user = this._currentUser;
    return html`
      <div class="footer">
        <button class="user" title=${user?.name ?? ''} @click=${this.#openUser}>
          <umb-user-avatar .name=${user?.name} .imgUrls=${user?.avatarUrls ?? []}></umb-user-avatar>
          <span class="user-name">${user?.name ?? ''}</span>
        </button>
        <div class="actions">
          <button
            class="fbtn"
            disabled
            title=${this.localize.term('umbraDesktop_desktopSettings')}
            aria-label=${this.localize.term('umbraDesktop_desktopSettings')}>
            <umb-icon name="icon-settings"></umb-icon>
          </button>
          <button
            class="fbtn"
            title=${this.localize.term('umbraDesktop_logout')}
            aria-label=${this.localize.term('umbraDesktop_logout')}
            @click=${this.#logout}>
            <umb-icon name="icon-log-out"></umb-icon>
          </button>
          <button
            class="fbtn"
            title=${this.localize.term('umbraDesktop_exitDesktop')}
            aria-label=${this.localize.term('umbraDesktop_exitDesktop')}
            @click=${this.#exit}>
            <umb-icon name="icon-door-open"></umb-icon>
          </button>
        </div>
      </div>
    `;
  }

  override render() {
    return html`
      <button class="search" @click=${this.#openSearch}>
        <umb-icon name="icon-search"></umb-icon>
        <span>${this.localize.term('umbraDesktop_search')}</span>
      </button>
      <div class="body">
        ${this.#zone(this.localize.term('umbraDesktop_favourites'), this.#favourites)}
        ${this.#zone(this.localize.term('umbraDesktop_recent'), this.#recent)}
        ${repeat(
          this._groups,
          (g) => g.group.alias,
          (g) => this.#zone(this.localize.string(g.group.label), g.apps),
        )}
      </div>
      ${this.#renderFooter()}
    `;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 360px;
        max-height: 80vh;
        overflow: hidden;
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-4);
      }
      .search {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3);
        margin: var(--uui-size-space-4) var(--uui-size-space-4) 0;
        padding: var(--uui-size-space-3) var(--uui-size-space-4);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        background: var(--uui-color-surface-alt, var(--uui-color-background));
        color: var(--uui-color-text);
        font-family: inherit;
        font-size: var(--uui-type-small-size);
        text-align: left;
        cursor: pointer;
      }
      .search:hover {
        border-color: var(--uui-color-border-emphasis, var(--uui-color-border));
      }
      .search umb-icon {
        flex-shrink: 0;
        font-size: 16px;
        opacity: 0.7;
      }
      .body {
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-4);
        padding: var(--uui-size-space-4);
      }
      .zone {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2);
      }
      .zl {
        font-size: var(--uui-type-small-size);
        font-weight: 700;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        opacity: 0.7;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
        gap: var(--uui-size-space-2);
      }
      .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-3) var(--uui-size-space-2);
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        cursor: pointer;
        font-family: inherit;
        text-align: center;
      }
      .tile:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .tile umb-icon {
        font-size: 26px;
      }
      .tlb {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        max-width: 100%;
        font-size: calc(var(--uui-type-small-size) + 1px);
        line-height: 1.2;
        /* Lato sits high in its line box; nudge the label down ~1px so it optically
           centers, matching the taskbar/window title treatment. */
        transform: translateY(1px);
      }
      .footer {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-3) var(--uui-size-space-4);
        border-top: 1px solid var(--uui-color-border);
      }
      .user {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3);
        min-width: 0;
        padding: var(--uui-size-space-2);
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        cursor: pointer;
        font-family: inherit;
      }
      .user:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .user-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: calc(var(--uui-type-small-size) + 1px);
        transform: translateY(1px);
      }
      .actions {
        flex-shrink: 0;
        display: flex;
        gap: var(--uui-size-space-1);
      }
      .fbtn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        cursor: pointer;
      }
      .fbtn:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .fbtn:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .fbtn umb-icon {
        font-size: 18px;
      }
    `,
  ];
}

export default UmbraDesktopLauncherElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-launcher': UmbraDesktopLauncherElement;
  }
}
