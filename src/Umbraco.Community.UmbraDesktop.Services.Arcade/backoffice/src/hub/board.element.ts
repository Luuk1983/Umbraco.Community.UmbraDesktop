import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { ArcadeGame, UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';
import { formatScore } from '../shared/format.js';
import { AREA } from '../shared/area.js';

/**
 * One leaderboard: the top ten, the viewer pinned underneath when they are not among them or are
 * private, and moderation for those allowed it (design §7). Whether the viewer may moderate comes
 * from the server's answer (`canModerate`), never from a guess in the browser.
 */
@customElement('umbradesktop-arcade-board')
export class UmbraDesktopArcadeBoardElement extends UmbLitElement {
  /** The game the board belongs to. */
  @property({ attribute: false })
  game?: ArcadeGame;

  /** The board. */
  @property({ attribute: false })
  board?: UmbraDesktopGameLeaderboard;

  /**
   * Whether to draw the board's own heading. The hub turns it off for a game with one board, where
   * the heading would only repeat the game's name; the table keeps its accessible name regardless.
   */
  @property({ type: Boolean, attribute: false })
  showHeading = true;

  /** The game and board last asked for, so the first load is not requested twice (context and willUpdate both want it). */
  #requested?: { game: ArcadeGame; board: UmbraDesktopGameLeaderboard };

  /** The board as last loaded, or undefined while loading or unreachable. */
  @state()
  private _data?: ArcadeBoard;

  /** Whether the last load failed. */
  @state()
  private _failed = false;

  /** What the last failed moderation action said, shown until the next attempt; undefined when none failed. */
  @state()
  private _error?: string;

  /** The Arcade, once found. */
  #arcade?: UmbraDesktopArcadeContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (this.#isStale()) void this.reload();
    });
  }

  /**
   * The hub swaps `game` and `board` on this same element when the tab changes, so the board has to
   * load again for the new pair, not only when the Arcade context first arrives. `willUpdate` so
   * clearing the old data is part of the same render rather than a second one.
   * @param changed The properties that changed.
   */
  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('game') || changed.has('board')) {
      this._data = undefined;
      this._failed = false;
      this._error = undefined;
      if (this.#isStale()) void this.reload();
    }
  }

  /** @returns Whether the current game and board have not been requested yet. */
  #isStale(): boolean {
    return this.#requested?.game !== this.game || this.#requested?.board !== this.board;
  }

  /**
   * Load the board again; also what a moderation action calls once it has changed the board. A
   * slow answer for a game the element has since moved off is dropped rather than shown.
   */
  async reload(): Promise<void> {
    const { game, board } = this;
    if (!this.#arcade || !game || !board) return;
    this.#requested = { game, board };
    const data = await this.#arcade.getBoard(game.alias, board.alias);
    if (game !== this.game || board !== this.board) return;
    this._failed = data === undefined;
    this._data = data;
  }

  /**
   * Run a moderation call and reload on success; on failure say so instead of staying silent.
   * @param action The call; resolves true when the server accepted it.
   */
  async #act(action: () => Promise<boolean> | undefined): Promise<void> {
    this._error = undefined;
    if (await action()) await this.reload();
    else this._error = this.localize.termOrDefault(`${AREA}_actionFailed`, 'That did not work. Try again.');
  }

  /**
   * Ask the owner to confirm something destructive.
   * @param headline The question.
   * @param content What it will do.
   * @param confirmLabel The button.
   * @returns Whether they confirmed.
   */
  #confirm(headline: string, content: string, confirmLabel: string): Promise<boolean> {
    return umbConfirmModal(this, { headline, content, color: 'danger', confirmLabel }).then(
      () => true,
      () => false,
    );
  }

  /** Remove a row after confirming. @param entry The row. */
  async #remove(entry: ArcadeBoardEntry): Promise<void> {
    const ok = await this.#confirm(
      this.localize.termOrDefault(`${AREA}_removeScoreHeadline`, 'Remove this score?'),
      entry.displayName,
      this.localize.termOrDefault(`${AREA}_remove`, 'Remove'),
    );
    if (ok) await this.#act(() => this.#arcade?.removeScore(this.game!.alias, this.board!.alias, entry.userKey));
  }

  /** Empty the board after confirming. */
  async #reset(): Promise<void> {
    const ok = await this.#confirm(
      this.localize.termOrDefault(`${AREA}_resetBoardHeadline`, 'Reset this board?'),
      this.localize.termOrDefault(`${AREA}_resetBoardText`, 'Every score on it is removed. This cannot be undone.'),
      this.localize.termOrDefault(`${AREA}_reset`, 'Reset'),
    );
    if (ok) await this.#act(() => this.#arcade?.resetBoard(this.game!.alias, this.board!.alias));
  }

  /** Put a player's Umbraco name back, after confirming like every other admin action. @param entry The row. */
  async #resetName(entry: ArcadeBoardEntry): Promise<void> {
    const ok = await this.#confirm(
      this.localize.termOrDefault(`${AREA}_resetNameHeadline`, 'Reset this name?'),
      this.localize.termOrDefault(`${AREA}_resetNameText`, 'The player goes back to their Umbraco name: {0}').replace('{0}', entry.displayName),
      this.localize.termOrDefault(`${AREA}_reset`, 'Reset'),
    );
    if (ok) await this.#act(() => this.#arcade?.resetName(entry.userKey));
  }

  /**
   * One table row.
   * @param entry The row.
   * @param moderate Whether to draw the moderation actions.
   * @returns The row.
   */
  #row(entry: ArcadeBoardEntry, moderate: boolean) {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    return html`<tr class=${entry.isViewer ? 'viewer' : ''}>
      <td class="rank">${entry.rank}</td>
      <td class="name">${entry.displayName}</td>
      <td class="score">${formatScore(this.board!.format, entry.value)}</td>
      <td class="date">${this.localize.date(new Date(entry.achievedAtUtc), { dateStyle: 'medium' })}</td>
      ${moderate
        ? html`<td class="actions">
            <uui-button compact look="secondary" data-action="reset-name" label=${t('resetName', 'Reset name')} @click=${() => this.#resetName(entry)}></uui-button>
            <uui-button compact look="secondary" color="danger" data-action="remove" label=${t('remove', 'Remove')} @click=${() => this.#remove(entry)}></uui-button>
          </td>`
        : nothing}
    </tr>`;
  }

  /** Show the loader again and ask again, after the board could not be loaded. */
  #retry(): void {
    this._failed = false;
    this._data = undefined;
    void this.reload();
  }

  /** @returns The board. */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    const label = this.board ? this.localize.string(this.board.label) : '';
    const heading = this.showHeading ? html`<h3>${label}</h3>` : nothing;
    const data = this._data;
    if (this._failed) {
      return html`${heading}<p class="empty">${t('boardUnavailable', 'The board could not be loaded.')}</p>
        <uui-button look="secondary" data-action="retry" label=${t('retry', 'Retry')} @click=${this.#retry}></uui-button>`;
    }
    if (!data) return html`${heading}<uui-loader-bar></uui-loader-bar>`;
    if (!data.played) return html`${heading}<p class="empty">${t('boardEmpty', 'Nobody has played this yet.')}</p>`;
    const pinned = data.viewer && !data.top.some((e) => e.isViewer) ? data.viewer : undefined;
    return html`${heading}
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <table aria-label=${label}>
        <thead>
          <tr>
            <th scope="col" class="rank">${t('colRank', 'Rank')}</th>
            <th scope="col" class="name">${t('colPlayer', 'Player')}</th>
            <th scope="col" class="score">${t('colScore', 'Score')}</th>
            <th scope="col" class="date">${t('colDate', 'Date')}</th>
            ${data.canModerate ? html`<th scope="col" class="hidden">${t('colActions', 'Actions')}</th>` : nothing}
          </tr>
        </thead>
        <tbody>${data.top.map((e) => this.#row(e, data.canModerate))}</tbody>
        ${pinned
          ? html`<tfoot>
              ${this.#row(pinned, false)}
              ${data.viewerIsPublic ? nothing : html`<tr><td colspan="4" class="private">${t('private', 'Private: only you see this')}</td></tr>`}
            </tfoot>`
          : nothing}
      </table>
      ${data.canModerate
        ? html`<uui-button look="secondary" color="danger" data-action="reset-board" label=${t('resetBoard', 'Reset board')} @click=${this.#reset}></uui-button>`
        : nothing}`;
  }

  /** App tokens with fallbacks, so the board follows every theme (desktop-apps.md §4). */
  static override styles = css`
    :host { display: block; color: var(--umbradesktop-app-text, var(--uui-color-text)); font-family: var(--umbradesktop-app-font, inherit); }
    h3 { margin: 0 0 var(--uui-size-space-3); }
    table { width: 100%; border-collapse: collapse; margin-bottom: var(--uui-size-space-3); background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background)); border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-border, var(--uui-color-text-alt)); border-radius: var(--umbradesktop-app-radius, 3px); }
    td { padding: var(--uui-size-space-2) var(--uui-size-space-3); border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt)); }
    .rank, .score { text-align: end; font-variant-numeric: tabular-nums; }
    .date, .private, .empty { color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt)); }
    tr.viewer { background: var(--umbradesktop-app-accent, var(--uui-color-selected)); color: var(--umbradesktop-app-accent-text, var(--uui-color-surface)); }
    tr.viewer .date { color: inherit; }
    tfoot tr:first-child td { border-top: 2px solid var(--umbradesktop-app-border, var(--uui-color-text-alt)); }
    th { padding: var(--uui-size-space-2) var(--uui-size-space-3); text-align: start; font-weight: 600; border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt)); }
    th.rank, th.score { text-align: end; }
    .hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .error { color: var(--uui-color-danger); margin: 0 0 var(--uui-size-space-3); }
    .actions { white-space: nowrap; text-align: end; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-board': UmbraDesktopArcadeBoardElement;
  }
}
