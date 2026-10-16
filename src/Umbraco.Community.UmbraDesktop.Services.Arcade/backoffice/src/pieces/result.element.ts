import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeBoard, ArcadeProfile } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { ArcadeGameResult, UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';
import { formatScore } from '../shared/format.js';
import { chaseText, say, unitText } from '../shared/phrases.js';
import { ARCADE_CARD_WIDTH_PX, ARCADE_COMPACT_CARD_WIDTH_PX, ARCADE_PIECE_MARGIN_PX } from './constants.js';
import { ensureArcadeFont } from './font.js';
import { arcadeLook, arcadeTheme, compactStyles } from './look.js';
import { CROWN_PATH, entryRow, icon, medal, shortBoardRows } from './parts.js';
import { ArcadeThemeController } from './theme.controller.js';

/** The card's tag. **Published API** (design P2): final once shipped. */
export const ARCADE_RESULT_ELEMENT = 'umbradesktop-arcade-result';

/**
 * The result card for one submitted score (design P2, P4 to P7, P10): what happened, how good it is,
 * a short board, and Leaderboard › and Play again. The first time, it asks whether to show the
 * player's scores instead, worded around the rank the score would have (P7, P9).
 *
 * A game places it by tag name over whatever it wants covered, inside a positioned element, and sets
 * `result` to what the Arcade's `submit` handed back with `{ showsResult: true }`. It fills that box,
 * dims what is under it, and picks its compact form when the box is narrower than
 * `ARCADE_COMPACT_BELOW_PX` (P10), or when `compact` is set.
 *
 * Events, both bubbling within the game's shadow root: `leaderboard` (detail `{ game, board }`), for
 * the game to open the panel on the mode just played; `play-again`, for the game's own new game.
 * The card never closes itself: the game removes it when a new game starts.
 */
@customElement(ARCADE_RESULT_ELEMENT)
export class UmbraDesktopArcadeResultElement extends UmbLitElement {
  /** What `submit` handed back. Nothing is drawn without it. */
  @property({ attribute: false })
  result?: ArcadeGameResult;

  /** "You won" or "Game over": the game's call (settled point 6). */
  @property({ reflect: true })
  outcome: 'won' | 'over' = 'won';

  /** Forces the compact form whatever the box (P10). */
  @property({ type: Boolean, reflect: true })
  compact = false;

  /** The board read for this result: its count, its rows, the entry above. */
  @state()
  private _board?: ArcadeBoard;

  /** The player's settings as the Arcade last knew them; overrides the result once known. */
  @state()
  private _profile?: ArcadeProfile;

  /** Whether an answer is being saved, so it cannot be sent twice. */
  @state()
  private _saving = false;

  /**
   * Whether the last answer failed to save. Until the player answers, the card shows neither its
   * actions nor Play again, so a silent failure would leave them stuck; this says so and keeps the
   * question up for another try.
   */
  @state()
  private _saveFailed = false;

  /** The Arcade, once found. */
  #arcade?: UmbraDesktopArcadeContext;

  /** The result the board was last read for, so it is read once per result (§6). */
  #loadedFor?: ArcadeGameResult;

  /** Declares the font, follows the desktop's theme, and finds the Arcade, reading the board once it is found. */
  constructor() {
    super();
    ensureArcadeFont();
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      this.observe(arcade.profile, (profile) => (this._profile = profile), '_arcadeProfile');
      void this.#load();
    });
  }

  /**
   * Read the board again when the game hands over a new result.
   * @param changed The properties that changed.
   */
  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('result')) void this.#load();
  }

  /**
   * Read the board for the current result, once; `again` reads it after an answer changed who is shown.
   * A slow answer for a result the game has since replaced is dropped.
   * @param again Read even though this result was read already.
   */
  async #load(again = false): Promise<void> {
    const result = this.result;
    if (!this.#arcade || !result || (!again && this.#loadedFor === result)) return;
    this.#loadedFor = result;
    if (!again) this._board = undefined;
    const board = await this.#arcade.getBoard(result.game, result.board);
    if (this.result === result) this._board = board;
  }

  /** @returns The board's definition, from the game's manifest. */
  get #definition(): UmbraDesktopGameLeaderboard | undefined {
    const result = this.result;
    return this.#arcade?.getGames().find((g) => g.alias === result?.game)?.leaderboards.find((b) => b.alias === result?.board);
  }

  /** @returns Whether the player has answered the question, by the result or since. */
  get #asked(): boolean {
    return !!this.result?.askedAboutPublic || !!this._profile?.askedAboutPublic;
  }

  /** @returns Whether the player's scores are shown: the latest known settings, else the result's. */
  get #shown(): boolean {
    return this._profile ? this._profile.isPublic : !!this.result?.isPublic;
  }

  /**
   * Save the player's answer, then read the board again, since showing changes who is on it. A
   * refused save says so in the card and leaves the question as it was, so the player can try again;
   * each attempt clears the last failure first, so a second failure reads as a fresh one.
   * @param shown Show their scores.
   */
  async #answer(shown: boolean): Promise<void> {
    if (!this.#arcade || this._saving) return;
    this._saving = true;
    this._saveFailed = false;
    let saved = false;
    try {
      saved = await this.#arcade.setScoresShown(shown);
    } finally {
      this._saving = false;
    }
    if (!saved) {
      this._saveFailed = true;
      return;
    }
    await this.#load(true);
  }

  /**
   * Tell the game what was chosen.
   * @param name The event.
   */
  #fire(name: 'leaderboard' | 'play-again'): void {
    const result = this.result;
    this.dispatchEvent(new CustomEvent(name, { detail: { game: result?.game, board: result?.board }, bubbles: true }));
  }

  /** @returns The card, or nothing without a result. */
  override render() {
    const result = this.result;
    if (!result) return nothing;
    const l = this.localize;
    const definition = this.#definition;
    const format = definition?.format ?? 'points';
    const outcome = this.outcome === 'over' ? say(l, 'outcomeOver', 'Game over') : say(l, 'outcomeWon', 'You won');
    const unit = unitText(l, format, result.value);
    // No live region on the card itself: it would read the buttons out again on every update. The
    // standing line is the region (see #standing), and a failed save is its own alert.
    return html`<div class="card felt surface">
      <p class="kicker">${outcome}${definition ? ` · ${l.string(definition.label)}` : ''}</p>
      <p class="big"><b>${formatScore(format, result.value, l.lang())}</b>${unit ? html`<span>${unit}</span>` : nothing}</p>
      ${this.#asked ? this.#standing(format) : this.#question()}
      ${this.#asked ? this.#shortBoard(format) : nothing}
      ${this.#asked
        ? html`<div class="acts">
            <button class="link" data-action="leaderboard" @click=${() => this.#fire('leaderboard')}>${say(l, 'leaderboardLink', 'Leaderboard')} ›</button>
            <button class="btn sm" data-action="play-again" @click=${() => this.#fire('play-again')}>${say(l, 'playAgain', 'Play again')}</button>
          </div>`
        : nothing}
      ${this.#asked && !this.#shown
        ? html`<p class="quiet">
            ${say(l, 'hiddenLine', 'Your scores are hidden from the leaderboard.')}
            <button class="link" data-action="show" ?disabled=${this._saving} @click=${() => this.#answer(true)}>${say(l, 'showThemLink', 'Show them')}</button>
          </p>`
        : nothing}
      ${this._saveFailed ? html`<p class="error" role="alert">${say(l, 'saveFailed', 'Your changes could not be saved.')}</p>` : nothing}
    </div>`;
  }

  /** @returns The first-time question and its two equal answers (P7, P9). */
  #question() {
    const l = this.localize;
    const result = this.result!;
    const players = this._board?.players;
    const standing = players ? `${say(l, 'askStanding', "That's {0} of {1}.", result.rankText, players)} ` : '';
    return html`<p class="q">${standing}${say(l, 'ask', 'Show your scores on the Arcade leaderboard, where colleagues can see them?')}</p>
      <div class="answers">
        <button class="btn ghost sm" data-answer="show" ?disabled=${this._saving} @click=${() => this.#answer(true)}>${say(l, 'answerShow', 'Yes, show my scores')}</button>
        <button class="btn ghost sm" data-answer="hide" ?disabled=${this._saving} @click=${() => this.#answer(false)}>${say(l, 'answerHide', 'No, only I see them')}</button>
      </div>`;
  }

  /**
   * How good it is: the ribbon and the standing line, laid out for each form. The full form puts them
   * on one line with the game's own `detail` slot; the compact form stacks them with the medal and
   * the person to chase.
   * @param format The board's format.
   * @returns Both forms; CSS shows one.
   */
  #standing(format: 'points' | 'time') {
    const l = this.localize;
    const result = this.result!;
    const lang = l.lang();
    const shown = this.#shown;
    const players = this._board?.players;
    const ofPlayers = players ? say(l, 'standing', '{0} of {1}', result.rankText, players) : result.rankText;
    const best = result.isPersonalBest ? result.value : (result.previousBest ?? result.value);
    const yourBest = say(l, 'yourBest', 'Your best {0}', formatScore(format, best, lang));
    const first = shown && result.isPersonalBest && result.rank === 1;
    let line: string;
    if (!shown) {
      const wouldBe = say(l, 'wouldBe', 'would be {0}', result.rankText);
      line = result.isPersonalBest ? wouldBe : `${yourBest} · ${wouldBe}`;
    } else if (first && result.passed) {
      line = say(l, 'passed', "past {0}'s {1}", result.passed.displayName, formatScore(format, result.passed.value, lang));
    } else if (result.isPersonalBest) {
      line = ofPlayers;
    } else if (result.rank === 1) {
      line = say(l, 'stillLeads', 'Your best {0} still leads', formatScore(format, best, lang));
    } else {
      line = `${yourBest} · ${ofPlayers}`;
    }
    const ribbon = result.isPersonalBest
      ? html`<span class="ribbon">${first ? icon(CROWN_PATH, 'crown') : nothing}${first ? say(l, 'ribbonFirst', 'First place') : say(l, 'ribbonNewBest', 'New best')}</span>`
      : nothing;
    const above = this._board?.above;
    // The standing line is the card's live region, in each form; the one CSS hides is not announced.
    return html`<p class="meta full-only">${ribbon}<span class="line" role="status">${line}</span><slot name="detail"></slot></p>
      <div class="compact-only">
        ${ribbon}
        <p class="standing1">${medal(result.rank)}<span role="status">${line}</span></p>
        ${result.rank > 1 && above ? html`<p class="chase">${chaseText(l, format, best, above)}</p>` : nothing}
      </div>`;
  }

  /**
   * The short board of three with the player's row lit (settled point 2), full form only.
   * @param format The board's format.
   * @returns The list, or nothing until the board has loaded.
   */
  #shortBoard(format: 'points' | 'time') {
    const board = this._board;
    if (!board) return nothing;
    const l = this.localize;
    const options = {
      format,
      you: say(l, 'you', 'You'),
      lang: l.lang(),
      youMode: 'replace' as const,
      onlyYou: this.#shown ? undefined : say(l, 'onlyYou', 'Only you see this'),
    };
    return html`<ol class="short full-only">
      ${shortBoardRows(board).map((row) => (row === 'gap' ? html`<li class="gap" aria-hidden="true">···</li>` : entryRow(row, options)))}
    </ol>`;
  }

  /** The card, its two forms, and its one-time motion (P14). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host {
        position: absolute; inset: 0; z-index: 5; display: grid; place-items: center;
        container-type: inline-size; background: var(--arcade-scrim); backdrop-filter: blur(1.5px);
      }
      /* A game focuses the card itself (tabindex -1) so keys land on it; a ring around the whole overlay says nothing. Its buttons keep theirs. */
      :host(:focus) { outline: none; }
      .card {
        width: ${unsafeCSS(ARCADE_CARD_WIDTH_PX)}px; max-width: calc(100% - ${unsafeCSS(2 * ARCADE_PIECE_MARGIN_PX)}px);
        /* A short game (Minesweeper's well) can be lower than the card: it scrolls inside its margins rather than spilling. */
        max-height: calc(100% - ${unsafeCSS(2 * ARCADE_PIECE_MARGIN_PX)}px); overflow: auto;
        box-sizing: border-box; border-radius: calc(var(--arcade-radius) + 2px); padding: 16px 16px 12px;
        box-shadow: var(--arcade-shadow); animation: rise 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      p { margin: 0; }
      .kicker { font-weight: 600; font-size: 12px; color: var(--arcade-soft); }
      .big { display: flex; align-items: baseline; gap: 6px; margin: 4px 0 2px; }
      .big b { font-weight: 800; font-size: 46px; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .big span { font-weight: 600; font-size: 16px; color: var(--arcade-soft); }
      .meta { font-size: 12px; color: var(--arcade-soft); margin: 6px 0 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .short { margin-bottom: 4px; }
      .short .lr { padding: 6px 8px; font-size: 12.5px; gap: 9px; }
      .short .lr .av, .short .lr .medal { width: 22px; height: 22px; font-size: 9px; }
      .short .lr .sc { font-size: 13px; }
      .short .lr.mine { animation: shine 900ms ease-out 300ms 1 both; background-size: 300% 100%; }
      /* The full card's tallest state is a hidden player below third: four rows with the gap, then the
         quiet line. It wanted 336px and Snake's whole game area gives it 330 inside the margins, so the
         gap marker, the actions and the quiet line give back twelve pixels between them.
         result.layout.test.ts measures every state in both games' areas. */
      .short .gap { padding: 0; line-height: 1; }
      .acts { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
      .q { font-size: 12.5px; line-height: 1.45; margin: 4px 0 10px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--arcade-accent) 12%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--arcade-accent) 35%, transparent); }
      .answers { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .quiet { margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--arcade-ring); font-size: 11.5px; color: var(--arcade-faint); line-height: 1.5; }
      .error { margin-top: 10px; font-size: 12px; color: var(--arcade-danger); }
      .compact-only { display: none; }
      .crown { animation: settle 400ms ease-out 200ms 1 both; }
      @keyframes rise { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }
      @keyframes shine { from { background-position: 100% 0; } to { background-position: 0 0; } }
      @keyframes settle { from { transform: translateY(-6px) rotate(-12deg); opacity: 0; } to { transform: none; opacity: 1; } }
    `,
    compactStyles(
      (scope) => `
        ${scope} .card { width: ${ARCADE_COMPACT_CARD_WIDTH_PX}px; padding: 14px 16px 12px; text-align: center; }
        ${scope} .full-only { display: none; }
        ${scope} .compact-only { display: block; }
        ${scope} .big { justify-content: center; margin: 6px 0 4px; }
        ${scope} .big b { font-size: 42px; }
        ${scope} .ribbon { margin: 2px auto 0; }
        ${scope} .standing1 { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; color: var(--arcade-soft); margin-top: 10px; }
        ${scope} .standing1 .medal { width: 24px; height: 24px; font-size: 11px; }
        ${scope} .chase { font-size: 12px; color: var(--arcade-faint); margin-top: 3px; }
        ${scope} .acts { justify-content: center; gap: 14px; margin-top: 14px; }
        ${scope} .q { background: none; box-shadow: none; padding: 0; font-size: 13px; }
        ${scope} .answers { grid-template-columns: 1fr; }
      `,
    ),
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-result': UmbraDesktopArcadeResultElement;
  }
}
