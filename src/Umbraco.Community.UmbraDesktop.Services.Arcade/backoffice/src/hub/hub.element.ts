import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { AREA } from '../shared/area.js';
import './board.element.js';
import './profile.element.js';

/** The one window-manager member the hub uses, published by the host (`docs/developer/desktop-contexts.md`). */
interface DesktopWindows extends UmbContextMinimal {
  /** Open an app by alias. @param alias The app. @returns Whether it opened. */
  openApp(alias: string): boolean;
}

/** The host's window manager, by its published alias; nothing is imported from the host. */
const DESKTOP_WINDOWS = new UmbContextToken<DesktopWindows>('UmbraDesktopWindowManagerContext');

/** The tab id for the profile; cannot collide with a game alias, which never starts with `#`. */
const PROFILE = '#profile';

/**
 * The Arcade: a tab per game with its boards side by side and a Play button, and a Profile tab
 * (design §7). Lives in the Games group and only appears once a game is registered.
 */
@customElement('umbradesktop-arcade-hub')
export class UmbraDesktopArcadeHubElement extends UmbLitElement {
  /** The registered games. */
  @state()
  private _games: ArcadeGame[] = [];

  /** The selected tab: a game alias or {@link PROFILE}. */
  @state()
  private _tab?: string;

  /** Whether the Arcade context answered at all. */
  @state()
  private _connected = false;

  /** The window manager, for Play. */
  #windows?: DesktopWindows;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this._connected = arcade !== undefined;
      if (arcade) this.observe(arcade.games, (games) => (this._games = games));
    });
    this.consumeContext(DESKTOP_WINDOWS, (windows) => (this.#windows = windows));
  }

  /** The selected game, defaulting to the first; undefined on the Profile tab. */
  get #selected(): ArcadeGame | undefined {
    return this._tab === PROFILE ? undefined : (this._games.find((g) => g.alias === this._tab) ?? this._games[0]);
  }

  /** @returns The hub. */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    if (!this._connected) return html`<p class="missing">${t('needsDesktop', 'The Arcade only works on the desktop.')}</p>`;
    const game = this.#selected;
    return html`
      <uui-tab-group>
        ${this._games.map(
          (g) => html`<uui-tab label=${this.localize.string(g.label)} .active=${g === game} @click=${() => (this._tab = g.alias)}>
            <uui-icon slot="icon" name=${g.icon}></uui-icon>${this.localize.string(g.label)}</uui-tab>`,
        )}
        <uui-tab label=${t('profile', 'Profile')} .active=${this._tab === PROFILE} @click=${() => (this._tab = PROFILE)}>
          <uui-icon slot="icon" name="icon-user"></uui-icon>${t('profile', 'Profile')}</uui-tab>
      </uui-tab-group>
      <div class="body">
        ${game
          ? html`<header>
                <h2>${this.localize.string(game.label)}</h2>
                <uui-button look="primary" data-action="play" label=${t('play', 'Play')} @click=${() => this.#windows?.openApp(game.app)}></uui-button>
              </header>
              <div class="boards">
                ${game.leaderboards.map((b) => html`<umbradesktop-arcade-board .game=${game} .board=${b} .showHeading=${game.leaderboards.length > 1}></umbradesktop-arcade-board>`)}
              </div>`
          : this._tab === PROFILE
            ? html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`
            : nothing}
      </div>`;
  }

  /** Layout and the app surface (desktop-apps.md §4). */
  static override styles = css`
    :host { display: flex; flex-direction: column; height: 100%; background: var(--umbradesktop-app-surface, var(--uui-color-surface)); color: var(--umbradesktop-app-text, var(--uui-color-text)); font-family: var(--umbradesktop-app-font, inherit); }
    /* uui-tab sets height:100%, which in this column flex stretched the strip over the body. */
    uui-tab-group { flex: none; height: auto; }
    uui-tab { height: auto; }
    .body { flex: 1; overflow: auto; padding: var(--uui-size-space-5); }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--uui-size-space-4); }
    h2 { margin: 0; }
    .boards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--uui-size-space-5); }
    .missing { padding: var(--uui-size-space-5); color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt)); }
  `;
}

export { UmbraDesktopArcadeHubElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-hub': UmbraDesktopArcadeHubElement;
  }
}
