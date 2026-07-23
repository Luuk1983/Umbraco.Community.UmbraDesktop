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
 * Seed favourites until real persistence (Plan 2). Aliases reference real derived apps; any
 * alias with no matching app (not curated, or gated out for this user) is silently skipped.
 * Pinning/unpinning is live but in-session only — it resets on reload until Plan 2 persists it.
 */
const SEED_FAVOURITE_ALIASES = ['content', 'media', 'log-viewer'];

/**
 * The start-menu-style launcher panel: search, a full-width Favourites hero, the curated app
 * groups as cards of icon-tiles, and a footer (user, desktop settings, log out, exit). Each tile
 * carries a pin control to add/remove it from Favourites. Mounted by `<umbradesktop-taskbar>`,
 * which owns the panel's open/close state and outside-click/Escape dismissal.
 */
@customElement('umbradesktop-launcher')
export class UmbraDesktopLauncherElement extends UmbLitElement {
  @state()
  private _groups: UmbraDesktopLauncherGroup[] = [];

  @state()
  private _apps: UmbraDesktopApp[] = [];

  @state()
  private _pinned: string[] = [...SEED_FAVOURITE_ALIASES];

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

  /** The pinned apps, in pin order, resolved against the flat app list (missing ones dropped). */
  get #favourites(): UmbraDesktopApp[] {
    return this._pinned
      .map((alias) => this._apps.find((a) => a.alias === alias))
      .filter((a): a is UmbraDesktopApp => !!a);
  }

  /** Launch an app and let the taskbar know so it can close the launcher. */
  #open(app: UmbraDesktopApp) {
    this.#manager?.open(app);
    this.dispatchEvent(new CustomEvent('launched'));
  }

  /** Toggle an app's Favourites membership (in-session only until Plan 2 persistence). */
  #togglePin(e: Event, app: UmbraDesktopApp) {
    e.stopPropagation();
    this._pinned = this._pinned.includes(app.alias)
      ? this._pinned.filter((a) => a !== app.alias)
      : [...this._pinned, app.alias];
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

  /**
   * The pin control glyph: a hollow pushpin when unpinned (click to pin) and a filled one when
   * pinned (click to unpin) — the outline/filled toggle everyone reads as off/on, without
   * relying on colour. Custom inline SVG (chrome, like the window controls).
   * @param pinned Whether the app is currently pinned.
   * @returns The pin SVG template.
   */
  #pinGlyph(pinned: boolean) {
    return pinned
      ? html`<svg class="pin-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3h6l-1 7 3 3H7l3-3z" fill="currentColor" stroke="none"></path>
          <path d="M12 13v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
        </svg>`
      : html`<svg
          class="pin-ico"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M9 3h6l-1 7 3 3H7l3-3z"></path>
          <path d="M12 13v8"></path>
        </svg>`;
  }

  #tile(app: UmbraDesktopApp) {
    const pinned = this._pinned.includes(app.alias);
    const pinLabel = this.localize.term(pinned ? 'umbraDesktop_unpin' : 'umbraDesktop_pin');
    return html`
      <div class="tile">
        <button class="launch" title=${this.localize.string(app.name)} @click=${() => this.#open(app)}>
          <umb-icon name=${app.icon}></umb-icon>
          <span class="tlb">${this.localize.string(app.name)}</span>
        </button>
        <button
          class="pin ${pinned ? 'on' : ''}"
          title=${pinLabel}
          aria-label=${pinLabel}
          aria-pressed=${pinned ? 'true' : 'false'}
          @click=${(e: Event) => this.#togglePin(e, app)}>
          ${this.#pinGlyph(pinned)}
        </button>
      </div>
    `;
  }

  /** A grid of app tiles. */
  #grid(apps: ReadonlyArray<UmbraDesktopApp>) {
    return html`<div class="grid">${repeat(apps, (a) => a.alias, (a) => this.#tile(a))}</div>`;
  }

  /** Favourites render as the prominent, full-width hero card above the columned group cards. */
  #renderFavourites() {
    const favs = this.#favourites;
    if (favs.length === 0) return '';
    return html`
      <div class="card fav">
        <div class="ch">${this.localize.term('umbraDesktop_favourites')}</div>
        ${this.#grid(favs)}
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
        ${this.#renderFavourites()}
        <div class="cards">
          ${repeat(
            this._groups,
            (g) => g.group.alias,
            (g) => html`
              <div class="card">
                <div class="ch">${this.localize.string(g.group.label)}</div>
                ${this.#grid(g.apps)}
              </div>
            `,
          )}
        </div>
      </div>
      ${this.#renderFooter()}
    `;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        /* Roomy: cards flow into as many columns as fit, so the panel only scrolls on
           genuinely small screens. */
        width: min(960px, 92vw);
        max-height: calc(100vh - 66px);
        overflow: hidden;
        /* Light-grey canvas so the white group cards read as distinct "boxes". */
        background: var(--uui-color-surface-alt, var(--uui-color-background));
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
        background: var(--uui-color-surface);
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
        gap: var(--uui-size-space-5);
        padding: var(--uui-size-space-4);
      }
      /* Group cards flow into as many columns as the width allows; each card is wide enough
         (min 260px) to hold 2-3 tiles per row. */
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: var(--uui-size-space-5);
        /* Equal-height cards per row — tidier than ragged, content-sized boxes. */
        align-items: stretch;
      }
      .card {
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: 6px;
        padding: var(--uui-size-space-4);
      }
      .card.fav {
        /* Full-width hero, whatever the column layout below does. */
        grid-column: 1 / -1;
      }
      .ch {
        font-size: var(--uui-type-small-size);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        opacity: 0.6;
        margin: 0 0 var(--uui-size-space-3);
      }
      .fav .ch {
        text-transform: none;
        letter-spacing: 0;
        font-size: calc(var(--uui-type-small-size) + 2px);
        opacity: 1;
      }
      /* Exactly three tiles per row, evenly filling the card width with symmetric padding —
         no ragged right edge. The full-width Pinned hero overrides this to fill its own width. */
      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--uui-size-space-3);
      }
      .fav .grid {
        grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      }
      .tile {
        position: relative;
      }
      .launch {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--uui-size-space-1);
        width: 100%;
        padding: var(--uui-size-space-2) var(--uui-size-space-1);
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        cursor: pointer;
        font-family: inherit;
        text-align: center;
      }
      .tile:hover .launch {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .launch umb-icon {
        font-size: 26px;
      }
      .tlb {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        max-width: 100%;
        font-size: var(--uui-type-small-size);
        line-height: 1.2;
        /* Reserve two lines so every tile is the same height whether the name wraps or not. */
        min-height: 2.4em;
        /* Lato sits high in its line box; nudge the label down ~1px so it optically centers. */
        transform: translateY(1px);
      }
      /* Pin: a solid badge that peeks out of the tile's top-right corner (notification style),
         hover-only in BOTH states. Unpinned = neutral chip ("pin it"); pinned = coral chip
         ("pinned — click to unpin"). A pinned app is self-evidently pinned via the Pinned card,
         so nothing shows until hover. */
      .pin {
        position: absolute;
        top: 3px;
        right: 3px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        opacity: 0;
        cursor: pointer;
        transition: opacity 90ms ease;
      }
      .pin .pin-ico {
        width: 15px;
        height: 15px;
      }
      .tile:hover .pin,
      .pin:focus-visible {
        opacity: 1;
      }
      .pin:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.06));
      }
      .footer {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-3) var(--uui-size-space-4);
        background: var(--uui-color-surface);
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
