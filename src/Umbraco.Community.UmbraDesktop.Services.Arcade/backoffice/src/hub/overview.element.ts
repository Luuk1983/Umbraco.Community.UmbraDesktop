import { css, customElement, html, nothing, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeBoardSummary, ArcadeOverview } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { ArcadeGame, UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { CROWN_PATH, icon, medal } from '../pieces/parts.js';
import { ArcadeThemeController } from '../pieces/theme.controller.js';
import { formatScore } from '../shared/format.js';
import { ruleText, say } from '../shared/phrases.js';
import { DESKTOP_WINDOWS } from '../shared/windows.js';
import type { DesktopWindows } from '../shared/windows.js';
import { HUB_ONE_COLUMN_BELOW_PX } from './constants.js';

/**
 * Where the hub opens (design P11): the player's standing across everything, then a tile per game
 * with one row per mode, the player's medal and best beside the leader and their crown, or who is
 * next when the player leads. One read for all of it (design §3), and boards of games that are not
 * installed are left out, as round one's hub did.
 *
 * Fires `open-game` (detail `{ game }`) for the hub to route; Play opens the game itself.
 */
@customElement('umbradesktop-arcade-overview')
export class UmbraDesktopArcadeOverviewElement extends UmbLitElement {
  /** The installed games, by weight. */
  @state()
  private _games: ArcadeGame[] = [];

  /** The overview, once read. */
  @state()
  private _overview?: ArcadeOverview;

  /** Whether the read failed, which swaps the tiles for a message and Retry. */
  @state()
  private _failed = false;

  /** The Arcade, which reads the overview. */
  #arcade?: UmbraDesktopArcadeContext;

  /** The window manager, for Play. */
  #windows?: DesktopWindows;

  /**
   * The Arcade's `scoresChanged` as last seen. The state hands over its current value on subscribe,
   * which is not a change: the overview is read on arrival anyway.
   */
  #changes?: number;

  /** Counts reads, so only the newest one's answer is drawn, whichever order the answers arrive in. */
  #reads = 0;

  /**
   * Stamps the theme, finds the Arcade and the window manager, reads the overview once the Arcade
   * answers, and reads it again whenever the Arcade's scores change: the hub stays open while the
   * player plays, and would otherwise say "Not played yet" beside a game just won.
   */
  constructor() {
    super();
    // Inside the hub, but its own shadow root: the hub's theme stamp does not reach `:host` here.
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      this.observe(arcade.games, (games) => (this._games = games), '_games');
      this.observe(
        arcade.scoresChanged,
        (changes) => {
          if (this.#changes !== undefined && changes !== this.#changes) void this.#load();
          this.#changes = changes;
        },
        '_scoresChanged',
      );
      void this.#load();
    });
    this.consumeContext(DESKTOP_WINDOWS, (windows) => (this.#windows = windows));
  }

  /**
   * Read the overview: on arrival, on Retry, and when the scores change. Quiet: what is on show stays
   * until the answer arrives, so reading again never flashes the loader (only the first read, with
   * nothing to show yet, does).
   */
  async #load(): Promise<void> {
    if (!this.#arcade) return;
    const read = ++this.#reads;
    this._failed = false;
    const overview = await this.#arcade.getOverview();
    if (read !== this.#reads) return;
    this._overview = overview;
    this._failed = overview === undefined;
  }

  /**
   * One board's summary.
   * @param game The game.
   * @param board The board's alias.
   * @returns Its summary, if the server knows it.
   */
  #summary(game: ArcadeGame, board: string): ArcadeBoardSummary | undefined {
    return this._overview?.boards.find((b) => b.game === game.alias && b.board === board);
  }

  /**
   * A board's name for the standing strip: the game's, plus the mode's when it has several.
   * @param summary The board, of an installed game (the strip only counts those).
   * @returns The name.
   */
  #boardName(summary: ArcadeBoardSummary): string {
    const game = this._games.find((g) => g.alias === summary.game)!;
    const label = this.localize.string(game.label);
    if (game.leaderboards.length < 2) return label;
    const board = game.leaderboards.find((b) => b.alias === summary.board);
    return `${label} ${board ? this.localize.string(board.label) : summary.board}`;
  }

  /**
   * The standing strip's list of boards, each name kept whole so a line breaks only between names:
   * "Solitaire Draw one" broke before its last word and left "one" on a line of its own.
   * @param summaries The boards.
   * @returns The names, comma separated.
   */
  #boardNames(summaries: ArcadeBoardSummary[]) {
    return summaries.map((b, index) => html`${index ? ', ' : ''}<span class="bname">${this.#boardName(b)}</span>`);
  }

  /**
   * Ask the hub to show a game's page; the hub routes, this only says which.
   * @param game The game to show.
   */
  #openGame(game: ArcadeGame): void {
    this.dispatchEvent(new CustomEvent('open-game', { detail: { game: game.alias }, bubbles: true, composed: true }));
  }

  /** @returns The overview: the standing strip and the tiles, a loader, or the failure and Retry. */
  override render() {
    const l = this.localize;
    if (this._failed) {
      return html`<p class="empty">${say(l, 'overviewUnavailable', 'The Arcade could not be loaded.')}</p>
        <button class="btn ghost sm" data-action="retry" @click=${() => this.#load()}>${say(l, 'retry', 'Retry')}</button>`;
    }
    const overview = this._overview;
    if (!overview) return html`<uui-loader-bar></uui-loader-bar>`;
    const installed = new Set(this._games.flatMap((g) => g.leaderboards.map((b) => `${g.alias}|${b.alias}`)));
    const boards = overview.boards.filter((b) => installed.has(`${b.game}|${b.board}`));
    const led = boards.filter((b) => b.viewer?.rank === 1);
    const topThree = boards.filter((b) => b.viewer && b.viewer.rank >= 2 && b.viewer.rank <= 3);
    return html`
      <div class="standing">
        <div class="glass" data-stat="lead">${icon(CROWN_PATH, 'crown big')}<b>${led.length}</b><span>${say(l, 'standLead', 'Boards you lead')}<br />${this.#boardNames(led)}</span></div>
        <div class="glass" data-stat="top3">${medal(2)}<b>${topThree.length}</b><span>${say(l, 'standTopThree', 'More in your top three')}<br />${this.#boardNames(topThree)}</span></div>
        <div class="glass" data-stat="colleagues"><span class="medal p" aria-hidden="true">#</span><b>${overview.colleagues}</b><span>${say(l, 'standColleagues', 'Colleagues playing')}</span></div>
      </div>
      <div class="tiles">${this._games.map((game) => this.#tile(game))}</div>`;
  }

  /**
   * One game's tile: art, name, rule, Play, and a row per mode. Selecting the tile opens the game's
   * page; its name is the keyboard's way to do the same.
   * @param game The game.
   * @returns The tile.
   */
  #tile(game: ArcadeGame) {
    const l = this.localize;
    return html`<article class="tile glass ${game.leaderboards.length > 1 ? 'wide' : ''}" data-game=${game.alias} @click=${() => this.#openGame(game)}>
      <div class="ttop">
        <div class="art"><uui-icon name=${game.icon}></uui-icon></div>
        <div class="tinfo">
          <button class="tname display" data-action="open-game" @click=${(event: Event) => { event.stopPropagation(); this.#openGame(game); }}>${l.string(game.label)}</button>
          <div class="tsub">${ruleText(l, game.leaderboards[0], game.rule)}</div>
        </div>
        <button class="btn sm" data-action="play" @click=${(event: Event) => { event.stopPropagation(); this.#windows?.openApp(game.app); }}>${say(l, 'play', 'Play')}</button>
      </div>
      ${game.leaderboards.map((board) => this.#modeRow(game, board))}
    </article>`;
  }

  /**
   * One mode: its name, the player's medal and best or "Not played yet", and the leader with the
   * crown, or "Next" when the player leads.
   * @param game The game.
   * @param board The mode.
   * @returns The row.
   */
  #modeRow(game: ArcadeGame, board: UmbraDesktopGameLeaderboard) {
    const l = this.localize;
    const lang = l.lang();
    const summary = this.#summary(game, board.alias);
    const viewer = summary?.viewer;
    const score = (value: number) => html`<b>${formatScore(board.format, value, lang)}</b>`;
    let lead: unknown = nothing;
    if (viewer?.rank === 1 && summary?.next) {
      lead = html`<span class="who" title=${summary.next.displayName}>${say(l, 'next', 'Next: {0}', summary.next.displayName)}</span> ${score(summary.next.value)}`;
    } else if (summary?.leader && viewer?.rank !== 1) {
      lead = html`${icon(CROWN_PATH, 'crown')}<span class="who" title=${summary.leader.displayName}>${summary.leader.displayName}</span> ${score(summary.leader.value)}`;
    }
    return html`<div class="mrow" data-board=${board.alias}>
      <span class="mode">${l.string(board.label)}</span>
      ${viewer
        ? html`<span class="mine">${medal(viewer.rank)}${score(viewer.value)}</span>`
        : html`<span class="mine none">${say(l, 'notPlayed', 'Not played yet')}</span>`}
      <span class="lead">${lead}</span>
    </div>`;
  }

  /** The mock's overview (section 1); one column below {@link HUB_ONE_COLUMN_BELOW_PX}. */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { display: block; container-type: inline-size; }
      .standing { display: flex; gap: 10px; margin-bottom: 16px; }
      .standing .glass { flex: 1; padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
      .standing b { font-weight: 700; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; }
      .standing span { font-size: 12px; color: var(--arcade-soft); line-height: 1.3; }
      .crown.big { width: 26px; height: 26px; }
      .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .tile { padding: 16px 16px 8px; position: relative; overflow: hidden; cursor: pointer; }
      .tile.wide { grid-column: span 2; }
      .ttop { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
      .ttop .btn { margin-inline-start: auto; }
      .art { width: 48px; height: 48px; border-radius: 13px; display: grid; place-items: center; flex: none; font-size: 26px; background: linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 4%)); box-shadow: var(--arcade-edge); }
      .tname { border: 0; background: none; padding: 0; font-weight: 600; font-size: 18px; text-align: start; }
      .tsub { font-size: 12px; color: var(--arcade-faint); }
      /* A one-mode tile has one row, so its best takes only what it needs and the leader's name gets
         the rest: split evenly, "Arcade Carol" was cut in a tile with room to spare. A wide tile has a
         row per mode, which keep their even split so their columns line up. */
      .mrow { display: grid; grid-template-columns: 76px max-content minmax(0, 1fr); align-items: center; gap: 10px; padding: 9px 2px; border-top: 1px solid var(--arcade-ring); }
      .tile.wide .mrow { grid-template-columns: 76px minmax(0, 1fr) minmax(0, 1fr); }
      .mode { font-weight: 600; font-size: 13px; color: var(--arcade-soft); }
      .mine { display: flex; align-items: center; gap: 9px; }
      .mine b { font-weight: 700; font-size: 20px; font-variant-numeric: tabular-nums; }
      .mine.none { font-size: 13px; color: var(--arcade-faint); }
      .lead { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; color: var(--arcade-soft); }
      /* A name stays on one line and gives way with an ellipsis (its title holds it whole); the crown
         and the score never shrink. Wrapped, "Arcade / Carol" read as two people. */
      .lead .who { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .lead .crown, .lead b { flex: none; }
      .lead b { color: var(--arcade-text); font-variant-numeric: tabular-nums; }
      .bname { white-space: nowrap; }
      .empty { color: var(--arcade-soft); }
      @container (width < ${unsafeCSS(HUB_ONE_COLUMN_BELOW_PX)}px) {
        .tiles { grid-template-columns: 1fr; }
        .tile.wide { grid-column: auto; }
        .standing { flex-direction: column; }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-overview': UmbraDesktopArcadeOverviewElement;
  }
}
