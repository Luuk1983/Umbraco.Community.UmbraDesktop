import { css, customElement, html, keyed, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeProfile } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { ensureArcadeFont } from '../pieces/font.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { TROPHY_PATH, avatar, icon } from '../pieces/parts.js';
import { say } from '../shared/phrases.js';
import './game-page.element.js';
import './overview.element.js';
import './profile.element.js';

/** Where the hub is: its overview, one game's page, or the player's profile. */
type HubView = { kind: 'overview' } | { kind: 'game'; game: string; board?: string } | { kind: 'profile' };

/**
 * The Arcade (design P11): it opens on the overview, a tile opens a game's page, and the player's
 * name opens their profile. The top bar navigates and nothing else. It also takes a request from the
 * Arcade context to show a board, when it opens and while it is open, which is how the panel's
 * "Open in the Arcade" and the beaten toast land on the right board (design §4).
 */
@customElement('umbradesktop-arcade-hub')
export class UmbraDesktopArcadeHubElement extends UmbLitElement {
  /** Where the hub is. */
  @state()
  private _view: HubView = { kind: 'overview' };

  /** Whether the Arcade context answered at all. */
  @state()
  private _connected = false;

  /** The registered games. */
  @state()
  private _games: ArcadeGame[] = [];

  /** The player's settings, for their name in the top bar. */
  @state()
  private _profile?: ArcadeProfile;

  /**
   * Loads the display font, then follows the Arcade's games, the player's settings and the request
   * to show a board. A request is taken as soon as it arrives and cleared, so the next one (or the
   * same one, asked again) is heard; one for a game that is not installed leaves the hub on its
   * overview, because the view only routes to a game it can find.
   */
  constructor() {
    super();
    ensureArcadeFont();
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this._connected = arcade !== undefined;
      if (!arcade) return;
      this.observe(arcade.games, (games) => (this._games = games), '_games');
      this.observe(arcade.profile, (profile) => (this._profile = profile), '_profile');
      this.observe(
        arcade.hubRequest,
        (request) => {
          if (!request) return;
          this._view = { kind: 'game', game: request.game, board: request.board };
          arcade.clearHubRequest();
        },
        '_hubRequest',
      );
      void arcade.refreshProfile();
    });
  }

  /** The name opens the profile, and closes it again. */
  #toggleProfile(): void {
    this._view = this._view.kind === 'profile' ? { kind: 'overview' } : { kind: 'profile' };
  }

  /** @returns The hub: the top bar, and the overview, a game's page or the profile under it. */
  override render() {
    const l = this.localize;
    if (!this._connected) return html`<p class="missing">${say(l, 'needsDesktop', 'The Arcade only works on the desktop.')}</p>`;
    const view = this._view;
    const game = view.kind === 'game' ? this._games.find((g) => g.alias === view.game) : undefined;
    const name = this._profile?.displayName ?? '';
    const atHome = view.kind === 'overview' || (view.kind === 'game' && !game);
    return html`<div class="room felt">
      <header class="hhead">
        ${atHome
          ? html`${icon(TROPHY_PATH, 'trophy')}<h1 class="display">${say(l, 'hub', 'Arcade')}</h1>`
          : html`<button class="back link" data-action="back" @click=${() => (this._view = { kind: 'overview' })}>‹ ${say(l, 'allGames', 'All games')}</button>`}
        <button class="me ${view.kind === 'profile' ? 'open' : ''}" data-action="profile" title=${say(l, 'yourProfile', 'Your profile')}
          aria-expanded=${String(view.kind === 'profile')} @click=${() => this.#toggleProfile()}>
          ${avatar({ userKey: 'me', displayName: name || '?', isViewer: true })}<span>${name}</span><span class="chev" aria-hidden="true">${view.kind === 'profile' ? '▲' : '▼'}</span>
        </button>
      </header>
      <div class="body">
        ${view.kind === 'profile'
          ? html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`
          : game
            ? // Keyed by the view, which is a new object per request and per tile: a request for the
              // board already on show (the panel's "Open in the Arcade" again, after the player moved
              // the pill) hands the page the same `board` string, which it would not see as a change.
              // A fresh page reads the board again and selects the mode asked for.
              keyed(view, html`<umbradesktop-arcade-game-page .game=${game} .board=${view.kind === 'game' ? (view.board ?? '') : ''}></umbradesktop-arcade-game-page>`)
            : html`<umbradesktop-arcade-overview @open-game=${(event: CustomEvent<{ game: string }>) => (this._view = { kind: 'game', game: event.detail.game })}></umbradesktop-arcade-overview>`}
      </div>
    </div>`;
  }

  /** The room, the top bar and the scrolling body (mock §1 to §3). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { display: flex; flex-direction: column; height: 100%; }
      .room { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 22px 24px 0; }
      .hhead { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex: none; }
      .hhead h1 { margin: 0; font-weight: 700; font-size: 28px; line-height: 1; }
      .trophy { width: 34px; height: 34px; color: var(--arcade-gold); }
      .back { font-size: 13px; }
      .me { margin-inline-start: auto; display: flex; align-items: center; gap: 9px; padding: 4px 14px 4px 4px; border: 0; border-radius: var(--arcade-control-radius); background: var(--arcade-glass-strong); box-shadow: var(--arcade-edge); font-weight: 600; font-size: 13px; }
      .me.open { background: color-mix(in srgb, var(--arcade-accent) 18%, transparent); }
      .chev { color: var(--arcade-faint); font-size: 10px; }
      .body { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 22px; }
      .missing { padding: 20px; color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt)); }
    `,
  ];
}

export { UmbraDesktopArcadeHubElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-hub': UmbraDesktopArcadeHubElement;
  }
}
