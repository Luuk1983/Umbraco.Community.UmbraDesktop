import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { entryRow, listRows, podium } from '../pieces/parts.js';
import { ArcadeThemeController } from '../pieces/theme.controller.js';
import { ruleText, say } from '../shared/phrases.js';
import { DESKTOP_WINDOWS } from '../shared/windows.js';
import type { DesktopWindows } from '../shared/windows.js';

/**
 * One game's page (design P11, P12): the game's name and rule with Play alone on the right, the mode
 * pill centred above the board it switches, the top three on a podium, ranks four to ten as a list,
 * and the player's own row pinned under a divider when they are outside the top ten. Moderators get a
 * "⋯" menu per player (remove score, reset name) and Reset this board at the bottom, each confirmed
 * (D11). Whether the viewer may moderate comes from the server's `canModerate`, never a guess.
 *
 * The rows are the board as the viewer sees it ({@link listRows}): a hidden viewer who places inside
 * the list stands at their own rank and the rest are renumbered, so the ranks shown can differ from
 * the server's. A moderator's menu therefore acts on the row's player (`userKey`), never its rank.
 */
@customElement('umbradesktop-arcade-game-page')
export class UmbraDesktopArcadeGamePageElement extends UmbLitElement {
  /** The game the page is about, set by the hub. */
  @property({ attribute: false })
  game?: ArcadeGame;

  /** The mode to open on; the one last played when empty, else the game's first. */
  @property()
  board = '';

  /** The mode on show. */
  @state()
  private _mode = '';

  /** That board's read, or undefined while loading or after a failure. */
  @state()
  private _data?: ArcadeBoard;

  /** Whether the read failed, which swaps the board for a message and Retry. */
  @state()
  private _failed = false;

  /** What the last failed moderation call said, shown until the next attempt or a mode switch. */
  @state()
  private _error?: string;

  /** The Arcade, which reads and moderates the board. */
  #arcade?: UmbraDesktopArcadeContext;

  /** The window manager, for Play. */
  #windows?: DesktopWindows;

  /**
   * The game the current mode was picked for. The context arriving and the first `willUpdate` both
   * start the page, so without this the first board would be read twice.
   */
  #startedFor?: ArcadeGame;

  /**
   * The Arcade's `scoresChanged` as last seen. The state hands over its current value on subscribe,
   * which is not a change: the page reads its board on starting anyway.
   */
  #changes?: number;

  /** Counts reads, so only the newest one's answer is drawn, whichever order the answers arrive in. */
  #reads = 0;

  /**
   * Stamps the theme, and finds the Arcade (starting the page once it answers, and reading the board
   * again whenever its scores change) and the window manager.
   */
  constructor() {
    super();
    // Inside the hub, but its own shadow root: the hub's theme stamp does not reach `:host` here.
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      this.observe(
        arcade.scoresChanged,
        (changes) => {
          if (this.#changes !== undefined && changes !== this.#changes) void this.#load(true);
          this.#changes = changes;
        },
        '_scoresChanged',
      );
      this.#start();
    });
    this.consumeContext(DESKTOP_WINDOWS, (windows) => (this.#windows = windows));
  }

  /**
   * Start over when the hub hands over another game or mode. `willUpdate` so clearing the old board
   * is part of the same render rather than a second one.
   * @param changed The properties that changed.
   */
  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('game') || changed.has('board')) this.#start();
  }

  /** Pick the mode to show (P12): the one asked for, else the one last played, else the first; and load it. */
  #start(): void {
    const game = this.game;
    if (!game || !this.#arcade) return;
    const wanted = this.board || this.#arcade.lastBoard(game.alias) || '';
    const mode = game.leaderboards.some((b) => b.alias === wanted) ? wanted : game.leaderboards[0].alias;
    if (game === this.#startedFor && mode === this._mode) return;
    this.#startedFor = game;
    this._mode = mode;
    this._error = undefined;
    void this.#load();
  }

  /**
   * Read the board on show; also how Retry and a change to the scores read it again. Only the newest
   * read is drawn, so a slow answer for a game or mode moved away from, or one overtaken by a later
   * read, is dropped.
   * @param quiet Keep the board on show until the answer arrives, rather than the loader: for reading
   *   the same board again (after a moderation, a score, a setting), where the loader would only
   *   flash and throw the player back to the top. A first read and a mode or game change are loud.
   */
  async #load(quiet = false): Promise<void> {
    const game = this.game;
    const mode = this._mode;
    if (!this.#arcade || !game || !mode) return;
    const read = ++this.#reads;
    if (!quiet) this._data = undefined;
    this._failed = false;
    const data = await this.#arcade.getBoard(game.alias, mode);
    if (read !== this.#reads) return;
    this._data = data;
    this._failed = data === undefined;
  }

  /**
   * Show another mode. A moderation error belonged to the board left behind, so it goes too.
   * @param mode The mode the pill switched to.
   */
  #switch(mode: string): void {
    if (mode === this._mode) return;
    this._mode = mode;
    this._error = undefined;
    void this.#load();
  }

  /**
   * Run a moderation call, and say so on failure instead of staying silent. On success there is
   * nothing to do here: the Arcade's `scoresChanged` moves, and the page reads the board again
   * quietly through that, once, as it does for any other change.
   * @param action The call; resolves true when the server accepted it.
   */
  async #act(action: () => Promise<boolean> | undefined): Promise<void> {
    this._error = undefined;
    if (!(await action())) this._error = say(this.localize, 'actionFailed', 'That did not work. Try again.');
  }

  /**
   * Ask before something destructive.
   * @param headline The question.
   * @param content What it will do.
   * @param confirmLabel The button.
   * @returns Whether they confirmed; a cancelled modal rejects, which is a no.
   */
  #confirm(headline: string, content: string, confirmLabel: string): Promise<boolean> {
    return umbConfirmModal(this, { headline, content, color: 'danger', confirmLabel }).then(
      () => true,
      () => false,
    );
  }

  /**
   * Remove one player's score from the board on show, after confirming. By the row's `userKey`: the
   * rank shown may be renumbered around a hidden viewer, so it does not name a player.
   * @param entry The row whose score to remove.
   */
  async #remove(entry: ArcadeBoardEntry): Promise<void> {
    const l = this.localize;
    if (await this.#confirm(say(l, 'removeScoreHeadline', 'Remove this score?'), entry.displayName, say(l, 'remove', 'Remove'))) {
      await this.#act(() => this.#arcade?.removeScore(this.game!.alias, this._mode, entry.userKey));
    }
  }

  /**
   * Put a player's chosen name back to their Umbraco name, after confirming like every other admin
   * action. The name is the player's, so it changes on every board, not only this one.
   * @param entry The row whose player to reset.
   */
  async #resetName(entry: ArcadeBoardEntry): Promise<void> {
    const l = this.localize;
    if (await this.#confirm(say(l, 'resetNameHeadline', 'Reset this name?'), say(l, 'resetNameText', 'The player goes back to their Umbraco name: {0}', entry.displayName), say(l, 'reset', 'Reset'))) {
      await this.#act(() => this.#arcade?.resetName(entry.userKey));
    }
  }

  /** Empty the board on show. */
  async #reset(): Promise<void> {
    const l = this.localize;
    if (await this.#confirm(say(l, 'resetBoardHeadline', 'Reset this board?'), say(l, 'resetBoardText', 'Every score on it is removed. This cannot be undone.'), say(l, 'reset', 'Reset'))) {
      await this.#act(() => this.#arcade?.resetBoard(this.game!.alias, this._mode));
    }
  }

  /**
   * A moderator's menu for one player, or nothing. Hidden until the row is hovered or has keyboard
   * focus (the styles), and always in the tab order, so a keyboard reaches it.
   *
   * `umb-dropdown` takes its button text in the `label` slot, its `label` property being only the
   * accessible name; `uui-menu-item` fires `click-label` (17.7.0: `dropdown.element.js`, and UUI's
   * `UUIMenuItemEvent.CLICK_LABEL`).
   * @param entry The row.
   * @returns The menu.
   */
  #menu(entry: ArcadeBoardEntry) {
    if (!this._data?.canModerate) return nothing;
    const l = this.localize;
    return html`<umb-dropdown class="more" compact hide-expand look="secondary" label=${say(l, 'moreActions', 'More actions for {0}', entry.displayName)}>
      <span slot="label" aria-hidden="true">⋯</span>
      <uui-menu-item data-action="remove" label=${say(l, 'removeScore', 'Remove score')} @click-label=${() => this.#remove(entry)}></uui-menu-item>
      <uui-menu-item data-action="reset-name" label=${say(l, 'resetName', 'Reset name')} @click-label=${() => this.#resetName(entry)}></uui-menu-item>
    </umb-dropdown>`;
  }

  /** @returns The page: the game's header, the pill, any moderation error, and the board. */
  override render() {
    const game = this.game;
    if (!game) return nothing;
    const l = this.localize;
    const definition = game.leaderboards.find((b) => b.alias === this._mode) ?? game.leaderboards[0];
    return html`
      <header class="ghero">
        <div class="art"><uui-icon name=${game.icon}></uui-icon></div>
        <div>
          <h2 class="display">${l.string(game.label)}</h2>
          <div class="tsub">${ruleText(l, definition, game.rule)}</div>
        </div>
        <button class="btn play" data-action="play" @click=${() => this.#windows?.openApp(game.app)}>▶&nbsp; ${say(l, 'play', 'Play')}</button>
      </header>
      ${game.leaderboards.length > 1
        ? html`<div class="pill-row"><div class="seg" role="tablist">
            ${game.leaderboards.map(
              (b) => html`<button role="tab" data-mode=${b.alias} aria-selected=${String(b.alias === this._mode)} @click=${() => this.#switch(b.alias)}>${l.string(b.label)}</button>`,
            )}
          </div></div>`
        : nothing}
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      ${this.#board(definition.format)}`;
  }

  /**
   * The board: podium, list, pinned row, and Reset this board for a moderator.
   * @param format The board's format.
   * @returns The board, a loader, the empty state, or the failure and Retry.
   */
  #board(format: 'points' | 'time') {
    const l = this.localize;
    const data = this._data;
    if (this._failed) {
      return html`<p class="empty">${say(l, 'boardUnavailable', 'The board could not be loaded.')}</p>
        <button class="btn ghost sm" data-action="retry" @click=${() => this.#load()}>${say(l, 'retry', 'Retry')}</button>`;
    }
    if (!data) return html`<uui-loader-bar></uui-loader-bar>`;
    if (!data.played) return html`<p class="empty">${say(l, 'boardEmpty', 'Nobody has played this yet.')}</p>`;
    const date = (entry: ArcadeBoardEntry) => l.date(new Date(entry.achievedAtUtc), { day: 'numeric', month: 'short' });
    const onlyYou = data.viewerIsPublic ? undefined : say(l, 'onlyYou', 'Only you see this');
    const options = { format, you: say(l, 'you', 'You'), lang: l.lang(), youMode: 'mark' as const, onlyYou };
    const { rows, pinned, gap } = listRows(data);
    const rest = rows.filter((entry) => entry.rank > 3);
    return html`
      ${podium(rows.slice(0, 3), { ...options, extra: (entry) => this.#menu(entry) })}
      ${rest.length || pinned
        ? html`<div class="glass list-box">
            <ol class="list">${rest.map((entry) => entryRow(entry, { ...options, date: date(entry), extra: this.#menu(entry) }))}</ol>
            ${pinned
              ? html`<ol class="pinned">
                  ${gap ? html`<li class="gap" aria-hidden="true">···</li>` : nothing}
                  ${entryRow(pinned, { ...options, date: date(pinned) })}
                </ol>`
              : nothing}
          </div>`
        : nothing}
      ${data.canModerate
        ? html`<div class="admin"><button class="btn danger sm" data-action="reset-board" @click=${() => this.#reset()}>${say(l, 'resetBoard', 'Reset this board')}</button></div>`
        : nothing}`;
  }

  /** The mock's game page (section 2). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { display: block; }
      .ghero { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
      .ghero h2 { margin: 0; font-weight: 700; font-size: 28px; line-height: 1.1; }
      .art { width: 72px; height: 72px; border-radius: 18px; display: grid; place-items: center; font-size: 32px; flex: none; background: linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 4%)); box-shadow: var(--arcade-edge); }
      .tsub { font-size: 12px; color: var(--arcade-faint); }
      .play { margin-inline-start: auto; padding: 11px 26px; font-size: 14px; }
      .pill-row { text-align: center; margin: 10px 0 2px; }
      .podium { margin: 0 60px 10px; }
      .podium .av { width: 42px; height: 42px; font-size: 13px; }
      .pod[data-rank='1'] .av { width: 50px; height: 50px; }
      .pod[data-rank='1'] > .crown { width: 22px; height: 22px; }
      .list-box { padding: 6px; }
      /* Hidden, not removed: opacity keeps the menu in the tab order, and focus shows it like hover does. */
      .more { opacity: 0; transition: opacity 120ms; }
      .lr:hover .more, .lr:focus-within .more, .pod:hover .more, .pod:focus-within .more { opacity: 1; }
      /* Nothing hovers on a touch screen, so there the menu is always shown. */
      @media (hover: none) { .more { opacity: 1; } }
      .admin { display: flex; justify-content: flex-end; margin-top: 14px; }
      .error { color: var(--arcade-danger); }
      .empty { color: var(--arcade-soft); }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-game-page': UmbraDesktopArcadeGamePageElement;
  }
}
