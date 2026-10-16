import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeBoard } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { ruleText, say } from '../shared/phrases.js';
import { ARCADE_PANEL_MAX_WIDTH_PX } from './constants.js';
import { ensureArcadeFont } from './font.js';
import { arcadeLook, arcadeTheme, compactStyles } from './look.js';
import { TROPHY_PATH, entryRow, icon, listRows, podium } from './parts.js';
import { ArcadeThemeController } from './theme.controller.js';

/** The panel's tag. **Published API** (design P2): final once shipped. */
export const ARCADE_LEADERBOARD_ELEMENT = 'umbradesktop-arcade-leaderboard';

/**
 * The leaderboard for one game, as a sheet over it (design P2, P10, P12): the rule, a pill for the
 * mode when there are several, a podium in the full form, the list, the player pinned underneath when
 * outside the top ten, the player count, and "Open in the Arcade ›".
 *
 * A game places it by tag name inside a positioned element covering the game, sets `game`, and opens
 * it by setting `open`. `board` chooses the mode to open on; without it the panel opens on the mode
 * last played. It fires `open` and `close` whenever `open` changes, so a game running underneath can
 * pause on `open` and resume on `close`.
 *
 * `close` always means the player is done with the leaderboard: it fires only when they dismiss it
 * (Esc, ✕, or a click on the dimmed game around it) or when the game itself sets `open = false`.
 * "Open in the Arcade ›" does not close it: opening the hub is going somewhere else, not dismissing
 * the panel, so the panel stays open over the paused game for the player to come back to.
 *
 * Like the card, it is compact in a box narrower than `ARCADE_COMPACT_BELOW_PX`, or when `compact`
 * is set.
 */
@customElement(ARCADE_LEADERBOARD_ELEMENT)
export class UmbraDesktopArcadeLeaderboardElement extends UmbLitElement {
  /** The game's `umbraDesktopGame` alias. */
  @property()
  game = '';

  /** The board to open on; the mode last played when empty. */
  @property()
  board = '';

  /** Whether the panel is showing. */
  @property({ type: Boolean, reflect: true })
  open = false;

  /** Forces the compact form whatever the box. */
  @property({ type: Boolean, reflect: true })
  compact = false;

  /** The board on show. */
  @state()
  private _mode = '';

  /** That board's read, or undefined while loading. */
  @state()
  private _data?: ArcadeBoard;

  /** Whether the read failed. */
  @state()
  private _failed = false;

  /** Whether "Open in the Arcade" last failed to open the hub, shown until the next try or opening. */
  @state()
  private _openFailed = false;

  /** The Arcade, once found. */
  #arcade?: UmbraDesktopArcadeContext;

  /** Declares the font, follows the desktop's theme, finds the Arcade (loading the board if already open), closes on Esc, and keeps Tab inside the sheet. */
  constructor() {
    super();
    ensureArcadeFont();
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (arcade && this.open) this.#start();
    });
    this.addEventListener('keydown', (event) => {
      if (!this.open) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.open = false;
      } else if (event.key === 'Tab') {
        this.#trapTab(event);
      }
    });
  }

  /**
   * Wrap Tab and Shift+Tab around the sheet's own buttons. The sheet says `aria-modal`, and without
   * this Shift+Tab from ✕ walks out into the game under the scrim, where a key then plays it (Snake
   * unpauses and moves; Solitaire auto-finishes with its clock frozen). Only this shadow root is
   * looked at: the panel never reaches into the game.
   * @param event The Tab keydown.
   */
  #trapTab(event: KeyboardEvent): void {
    const stops = [...(this.shadowRoot?.querySelectorAll<HTMLElement>('.sheet button:not([disabled]), .sheet [href], .sheet [tabindex]:not([tabindex="-1"])') ?? [])];
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = this.shadowRoot?.activeElement as HTMLElement | null;
    const inside = !!active && stops.includes(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  /** @returns The game, from the Arcade's registered games. */
  get #game(): ArcadeGame | undefined {
    return this.#arcade?.getGames().find((g) => g.alias === this.game);
  }

  /**
   * Fire `open` and `close` as `open` changes, and load the board on opening. After the update, so
   * a game reacting to `open` sees the panel drawn.
   * @param changed The properties that changed.
   */
  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    if (!changed.has('open')) return;
    const before = changed.get('open') as boolean | undefined;
    if (this.open && !before) {
      this.#start();
      this.dispatchEvent(new CustomEvent('open', { bubbles: true }));
      this.shadowRoot?.querySelector<HTMLElement>('[data-action="close"]')?.focus();
    } else if (!this.open && before) {
      this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
    }
  }

  /** Pick the mode to open on (P12) and load it. */
  #start(): void {
    const game = this.#game;
    if (!game) return;
    const wanted = this.board || this.#arcade?.lastBoard(game.alias) || '';
    this._mode = game.leaderboards.some((b) => b.alias === wanted) ? wanted : game.leaderboards[0].alias;
    this._openFailed = false;
    void this.#load();
  }

  /** Read the board on show; a slow answer for a mode switched away from is dropped. */
  async #load(): Promise<void> {
    const mode = this._mode;
    if (!this.#arcade || !mode) return;
    this._data = undefined;
    this._failed = false;
    const data = await this.#arcade.getBoard(this.game, mode);
    if (mode !== this._mode) return;
    this._data = data;
    this._failed = data === undefined;
  }

  /**
   * Show another mode, for the pill: the panel opens on one board, but a game with several (Draw 1,
   * Draw 3) lets the player compare without closing and reopening it. Picking the mode already on
   * show does nothing, so a stray click does not throw away the rows and read them again.
   * @param mode The board to switch to.
   */
  #switch(mode: string): void {
    if (mode === this._mode) return;
    this._mode = mode;
    void this.#load();
  }

  /**
   * Show this board in the hub (§4). The panel stays open: opening the hub is going somewhere else,
   * not being done with the leaderboard, and `close` is kept for that so a game can resume on it.
   * When the hub cannot be opened (no window manager, or it refused), the panel says so, since the
   * button would otherwise look as if it did nothing at all.
   */
  #openInArcade(): void {
    this._openFailed = !this.#arcade?.showBoard(this.game, this._mode);
  }

  /** @returns The sheet, or nothing while closed. */
  override render() {
    if (!this.open) return nothing;
    const l = this.localize;
    const game = this.#game;
    const definition = game?.leaderboards.find((b) => b.alias === this._mode);
    const data = this._data;
    const format = definition?.format ?? 'points';
    const rowOptions = { format, you: say(l, 'you', 'You'), lang: l.lang(), youMode: 'replace' as const };
    const { rows, pinned, gap } = data ? listRows(data) : { rows: [], pinned: undefined, gap: false };
    const onlyYou = data?.viewerIsPublic ? undefined : say(l, 'onlyYou', 'Only you see this');
    // tabindex -1: a click on a plain part of the sheet then focuses the sheet rather than the game
    // under it (or the page), so Esc still reaches the panel's listener on its host.
    return html`<div class="scrim" @click=${() => (this.open = false)}></div>
      <section class="sheet felt surface" tabindex="-1" role="dialog" aria-modal="true" aria-label=${say(l, 'leaderboard', 'Leaderboard')}>
        <header class="shead">
          ${icon(TROPHY_PATH, 'crown')}
          <div class="title">
            <b class="display">${say(l, 'leaderboard', 'Leaderboard')}</b>
            <span class="rule">${definition ? html`<span class="compact-only">${l.string(definition.label)} · </span>` : nothing}${definition ? ruleText(l, definition, game?.rule) : ''}</span>
          </div>
          ${game && game.leaderboards.length > 1
            ? html`<div class="seg" role="tablist">
                ${game.leaderboards.map(
                  (b) => html`<button role="tab" data-mode=${b.alias} aria-selected=${String(b.alias === this._mode)} @click=${() => this.#switch(b.alias)}>${l.string(b.label)}</button>`,
                )}
              </div>`
            : nothing}
          <button class="close" data-action="close" aria-label=${say(l, 'close', 'Close')} @click=${() => (this.open = false)}>✕</button>
        </header>
        ${this._failed
          ? html`<p class="empty">${say(l, 'boardUnavailable', 'The board could not be loaded.')}</p>
              <button class="link" data-action="retry" @click=${() => this.#load()}>${say(l, 'retry', 'Retry')}</button>`
          : !data
            ? html`<uui-loader-bar></uui-loader-bar>`
            : !data.played
              ? html`<p class="empty">${say(l, 'boardEmpty', 'Nobody has played this yet.')}</p>`
              : html`<div class="scroll">
                    <div class="podium-wrap full-only">${podium(rows.slice(0, 3), { ...rowOptions, onlyYou })}</div>
                    <ol class="list">
                      ${rows.map((e) => entryRow(e, { ...rowOptions, onlyYou, className: e.rank <= 3 ? 'on-podium' : undefined }))}
                    </ol>
                  </div>
                  ${pinned
                    ? html`<ol class="pinned">
                        ${gap ? html`<li class="gap" aria-hidden="true">···</li>` : nothing}
                        ${entryRow(pinned, { ...rowOptions, onlyYou })}
                      </ol>`
                    : nothing}`}
        ${this._openFailed ? html`<p class="error" role="alert">${say(l, 'actionFailed', 'That did not work. Try again.')}</p>` : nothing}
        <footer class="sfoot">
          <span>${data ? say(l, 'players', '{0} players', data.players) : ''}</span>
          <button class="link" data-action="open-in-arcade" @click=${() => this.#openInArcade()}>${say(l, 'openInArcade', 'Open in the Arcade')} ›</button>
        </footer>
      </section>`;
  }

  /** A sheet from the bottom of the game, full height in its compact form (mock §7). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { position: absolute; inset: 0; z-index: 6; display: block; container-type: inline-size; }
      :host(:not([open])) { display: none; }
      .scrim { position: absolute; inset: 0; background: var(--arcade-scrim); }
      .sheet {
        position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); box-sizing: border-box;
        width: min(${unsafeCSS(ARCADE_PANEL_MAX_WIDTH_PX)}px, 100%); max-height: calc(100% - 24px);
        /* Only the podium and the list scroll. The header, the player's pinned row and the footer stay
           in sight, as on the hub's game page: when the whole sheet scrolled, Solitaire's window put a
           12th player's own row half under the sheet's bottom edge until they scrolled to it. */
        display: flex; flex-direction: column; overflow: hidden;
        border-radius: var(--arcade-radius) var(--arcade-radius) 0 0; padding: 12px 12px 10px;
        box-shadow: 0 -20px 50px -10px rgb(0 0 0 / 60%), 0 0 0 1px rgb(255 255 255 / 12%);
        animation: up 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .sheet:focus { outline: none; }
      .sheet > * { flex: none; }
      .sheet > .scroll { flex: 0 1 auto; min-height: 0; overflow: auto; }
      .shead { display: flex; align-items: center; gap: 10px; margin: 0 2px 8px; }
      .shead > .crown { width: 18px; height: 18px; }
      .title { flex: 1; min-width: 0; }
      .title b { display: block; font-size: 16px; font-weight: 600; }
      .rule { font-size: 11.5px; color: var(--arcade-faint); }
      .close { border: 0; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--arcade-glass-strong); color: var(--arcade-soft); }
      .podium { margin: 2px 50px 8px; }
      .podium .av { width: 32px; height: 32px; font-size: 11px; }
      .podium .pn { font-size: 12px; }
      .podium .ps { font-size: 14px; }
      .podium .step { font-size: 15px; padding-top: 4px; }
      .podium .step.s1 { height: 34px; }
      .podium .step.s2 { height: 24px; }
      .podium .step.s3 { height: 18px; }
      .lr { padding: 5px 8px; font-size: 13px; gap: 10px; }
      .lr .av, .lr .medal { width: 24px; height: 24px; font-size: 9.5px; }
      .lr .sc { font-size: 14px; }
      .on-podium { display: none; }
      .compact-only { display: none; }
      .sfoot { display: flex; justify-content: space-between; align-items: center; margin: 8px 4px 0; padding-top: 8px; border-top: 1px solid var(--arcade-ring); font-size: 12px; color: var(--arcade-faint); }
      .empty { color: var(--arcade-soft); font-size: 13px; padding: 12px 4px; margin: 0; }
      .error { color: var(--arcade-danger); font-size: 12px; margin: 8px 4px 0; }
      @keyframes up { from { transform: translate(-50%, 24px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
    `,
    compactStyles(
      (scope) => `
        ${scope} .sheet { inset: 0; left: 0; transform: none; width: auto; max-height: none; border-radius: 0; padding: 10px 10px 8px; animation: none; }
        ${scope} .full-only { display: none; }
        ${scope} .on-podium { display: flex; }
        ${scope} .compact-only { display: inline; }
      `,
    ),
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-leaderboard': UmbraDesktopArcadeLeaderboardElement;
  }
}
