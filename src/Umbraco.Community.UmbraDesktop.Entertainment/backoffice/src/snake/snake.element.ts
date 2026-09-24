import {
  SNAKE_BOARD,
  SNAKE_CELL_SIZE_PX,
  SNAKE_PADDING_PX,
  SNAKE_POINTS_PER_FOOD,
  SNAKE_STATUS_HEIGHT_PX,
  snakeTickInterval,
} from './constants.js';
import { createGame, steer, step, togglePause } from './rules.js';
import type { SnakeConfig, SnakeDirection, SnakeFoodPlacer, SnakeGame } from './rules.js';
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Localisation area this package's dictionaries live under. */
const AREA = 'umbraDesktopEntertainment';

/**
 * The food's colour.
 *
 * Hardcoded deliberately, for the reason Minesweeper gives for its mine glyph: `docs/desktop-apps.md`
 * §4 stops at the surface an app sits on, and a theme has no opinion about what an apple looks like.
 * Red because that is the colour a player is scanning the board for.
 */
const FOOD_COLOUR = '#e0302a';

/**
 * Where the best score is kept, in this browser.
 *
 * `localStorage` rather than anything on the server, because a high score is a nicety and not data:
 * losing it to a cleared cache costs nothing, and storing it server-side would mean an API and a
 * table for a number nobody else needs to see.
 */
const BEST_SCORE_KEY = 'umbradesktop-entertainment-snake-best';

/** Every key the game answers to, and the direction each one means. WASD for the left hand. */
const KEY_DIRECTIONS: Readonly<Record<string, SnakeDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

/** Keys that pause and resume. Space is the one players reach for; P is the one old games used. */
const PAUSE_KEYS: ReadonlySet<string> = new Set([' ', 'p']);

/**
 * Read the best score, or zero when there is none or storage is unavailable.
 *
 * Storage can throw outright in a locked-down browser, not just come back empty, so every access is
 * guarded and a failure is simply a game with no best score.
 * @returns The best score recorded in this browser.
 */
function readBestScore(): number {
  try {
    const stored = Number(window.localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

/**
 * Record a best score, silently doing nothing if storage is unavailable.
 * @param score The new best.
 */
function writeBestScore(score: number): void {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Not worth telling the player about: the score still shows for as long as the window is open.
  }
}

/**
 * Snake, as a self-contained UmbraDesktop app.
 *
 * Built the same way as Minesweeper: the element holds one game value from `rules.ts`, hands every
 * key press and every tick to a pure function, and renders whatever comes back. What this element
 * adds is the clock, which Minesweeper only displays and Snake runs on.
 *
 * Keyboard only. The playfield is focusable and takes focus when the window opens, so a player can
 * start with an arrow key straight away. When it loses focus the game pauses, which also covers
 * minimising: the desktop keeps a minimised app running (§7 of the guide), and a Snake that carried
 * on moving where nobody could see it would always be dead by the time it was restored.
 */
@customElement('umbradesktop-snake')
export class SnakeElement extends UmbLitElement {
  /** Board size and opening length. Public for the same reason Minesweeper's `config` is. */
  @property({ attribute: false })
  config: SnakeConfig = SNAKE_BOARD;

  /**
   * Where the food goes, if the caller cares.
   *
   * The injection seam `rules.ts` is built around, surfaced so a test can put food in front of the
   * snake and watch it eat. Unset means random, which is what a player gets.
   */
  @property({ attribute: false })
  placer?: SnakeFoodPlacer;

  /**
   * How long each move takes, given how much has been eaten.
   *
   * Injected so a test can run the game at 10ms a move instead of waiting for a player's speed.
   * Unset means {@link snakeTickInterval}.
   */
  @property({ attribute: false })
  tickInterval?: (eaten: number) => number;

  /** The game. Undefined only between construction and {@link connectedCallback}. */
  @state()
  private _game?: SnakeGame;

  /** The best score seen in this browser, read once and updated as a game beats it. */
  @state()
  private _best = readBestScore();

  /** The pending tick's `setTimeout` handle, or undefined when the snake is not moving. */
  private _tick?: number;

  /**
   * Deal the first game. Here rather than in the constructor because `config` and `placer` are set
   * by whoever mounted the element, after construction. Guarded, because a re-attach is not a new game.
   */
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._game) this._game = createGame(this.config, this.placer);
  }

  /** Stop the clock. Closing the window unmounts the element, and a tick must not outlive it. */
  override disconnectedCallback(): void {
    this.#stopClock();
    super.disconnectedCallback();
  }

  /** Put the focus on the playfield, so the first key press already steers. */
  override firstUpdated(): void {
    this.#focusField();
  }

  /**
   * Record a new best score as soon as the current game beats it.
   *
   * Before the render rather than after it, so the new best is drawn in the same frame as the score
   * that set it. Setting state in `updated` would work too, but it costs a second render every time.
   */
  override willUpdate(): void {
    const points = (this._game?.score ?? 0) * SNAKE_POINTS_PER_FOOD;
    if (points > this._best) {
      this._best = points;
      writeBestScore(points);
    }
  }

  /**
   * Run or stop the clock to match the game after every render.
   *
   * A timeout per move rather than one interval, because the interval changes as the snake eats:
   * each tick reads the current speed when it is scheduled, and nothing has to be cancelled and
   * rebuilt when the score goes up.
   */
  override updated(): void {
    const game = this._game;
    if (game?.status === 'playing') this.#startClock(game);
    else this.#stopClock();
  }

  /**
   * Schedule the next move, unless one is already scheduled.
   * @param game The game being played, whose score sets the speed.
   */
  #startClock(game: SnakeGame): void {
    if (this._tick !== undefined) return;
    const delay = (this.tickInterval ?? snakeTickInterval)(game.score);
    this._tick = window.setTimeout(() => {
      this._tick = undefined;
      if (this._game) this._game = step(this._game, this.placer);
    }, delay);
  }

  /** Cancel the pending move, and forget the handle so a later start is not suppressed. */
  #stopClock(): void {
    if (this._tick === undefined) return;
    window.clearTimeout(this._tick);
    this._tick = undefined;
  }

  /** The focusable playfield, once rendered. */
  #focusField(): void {
    this.shadowRoot?.querySelector<HTMLElement>('.field')?.focus();
  }

  /** Deal a fresh game and hand the keyboard back to the playfield. */
  #newGame(): void {
    this.#stopClock();
    this._game = createGame(this.config, this.placer);
    this.#focusField();
  }

  /**
   * Turn a key press into a move.
   *
   * Only the keys the game uses have their default prevented, so arrows do not scroll the window
   * while everything else (Tab, most importantly) still does what it always does.
   * @param event The key press on the playfield.
   */
  #onKey(event: KeyboardEvent): void {
    const game = this._game;
    if (!game) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const direction = KEY_DIRECTIONS[key];
    if (direction) {
      event.preventDefault();
      this._game = steer(game, direction);
    } else if (PAUSE_KEYS.has(key)) {
      event.preventDefault();
      // Once the game is over, space is the obvious "again", so it deals rather than doing nothing.
      if (game.status === 'over' || game.status === 'won') this.#newGame();
      else this._game = togglePause(game);
    }
  }

  /** Pause when the playfield loses focus, for the reason given on the class. */
  #onBlur(): void {
    if (this._game?.status === 'playing') this._game = togglePause(this._game);
  }

  /**
   * What the banner over the board says, if anything.
   * @param game The game being rendered.
   * @returns A localised line, or an empty string while the snake is moving.
   */
  #message(game: SnakeGame): string {
    switch (game.status) {
      case 'ready':
        return this.localize.termOrDefault(`${AREA}_snakeStart`, 'Press an arrow key to start');
      case 'paused':
        return this.localize.termOrDefault(`${AREA}_snakePaused`, 'Paused. Press space to carry on');
      case 'over':
        return this.localize.termOrDefault(`${AREA}_snakeOver`, 'Game over. Press space to play again');
      case 'won':
        return this.localize.termOrDefault(`${AREA}_snakeWon`, 'You filled the board!');
      default:
        return '';
    }
  }

  /**
   * The whole window body.
   *
   * The board is a grid of plain `div`s rather than buttons, since nothing in it is clicked. Each
   * one says what it holds through `data-part`, which the stylesheet and the tests both read. The
   * playfield is one focusable element with an accessible name, and the score and status are live
   * regions, so a screen reader hears the game's progress without hearing four hundred cells.
   * @returns The status row, the board and the banner, or nothing before the first game.
   */
  override render() {
    const game = this._game;
    if (!game) return nothing;
    const parts = new Map<number, 'head' | 'body' | 'food'>();
    if (game.food !== undefined) parts.set(game.food, 'food');
    game.snake.forEach((cell, index) => parts.set(cell, index === 0 ? 'head' : 'body'));
    const message = this.#message(game);
    return html`
      <div class="board">
        <div class="status">
          <span class="display">
            <span class="label">${this.localize.termOrDefault(`${AREA}_snakeScore`, 'Score')}</span>
            <span class="score" role="status">${game.score * SNAKE_POINTS_PER_FOOD}</span>
          </span>
          <button class="new-game" @click=${() => this.#newGame()}>
            ${this.localize.termOrDefault(`${AREA}_snakeNewGame`, 'New game')}
          </button>
          <span class="display">
            <span class="label">${this.localize.termOrDefault(`${AREA}_snakeBest`, 'Best')}</span>
            <span class="best">${this._best}</span>
          </span>
        </div>
        <div class="well">
          <div
            class="field"
            tabindex="0"
            role="application"
            aria-label=${this.localize.termOrDefault(`${AREA}_snakeBoard`, 'Snake board. Use the arrow keys to steer')}
            data-status=${game.status}
            style="grid-template-columns: repeat(${game.width}, ${SNAKE_CELL_SIZE_PX}px)"
            @keydown=${(event: KeyboardEvent) => this.#onKey(event)}
            @focusout=${() => this.#onBlur()}
          >
            ${Array.from(
              { length: game.width * game.height },
              (_unused, index) => html`<div class="cell" data-part=${parts.get(index) ?? nothing}></div>`,
            )}
          </div>
        </div>
        <p class="message" role="status" ?hidden=${!message}>${message}</p>
      </div>
    `;
  }

  /**
   * One stylesheet for every theme, plus the Windows 98 bevel.
   *
   * Every colour, edge and radius is an app token read with the fallback §4 of the guide publishes,
   * following Minesweeper's stylesheet rule for rule where the two games share a shape: the status
   * row, the displays, the New game button and the recessed well are the same controls and should
   * look the same side by side. The snake is the accent colour, since it is the thing the player
   * controls, and the food is this app's own red.
   */
  static override styles = css`
    :host {
      display: flex;
      box-sizing: border-box;
      min-height: 100%;
      padding: ${SNAKE_PADDING_PX}px;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font-family: var(--umbradesktop-app-font, inherit);
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* Auto margins rather than centring on the host, so a window smaller than the board clips it at
       one end only. The same belt-and-braces Minesweeper wears. */
    .board {
      margin: auto;
      position: relative;
    }

    .status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: ${SNAKE_PADDING_PX}px;
      height: ${SNAKE_STATUS_HEIGHT_PX}px;
    }

    /* The edge is a spread shadow rather than a border so it costs no layout, and the content size
       the manifest declares stays exact under every theme. See Minesweeper's .well for the history. */
    .display,
    .well {
      background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
      box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
      border-radius: var(--umbradesktop-app-radius, 3px);
    }

    .display {
      display: flex;
      gap: 6px;
      align-items: baseline;
      padding: 4px 8px;
      font-variant-numeric: tabular-nums;
    }

    .label {
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
      font-size: 0.85em;
    }

    .score,
    .best {
      font-weight: 700;
      min-width: 3ch;
      text-align: right;
    }

    .new-game {
      padding: 4px 12px;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font: inherit;
      font-family: var(--umbradesktop-app-font, inherit);
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      border: var(--umbradesktop-app-edge-width, 1px) solid
        var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px);
      cursor: pointer;
    }

    .well {
      margin-top: ${SNAKE_PADDING_PX}px;
      padding: ${SNAKE_PADDING_PX}px;
      width: fit-content;
    }

    .field {
      display: grid;
      outline: none;
    }

    /* Focus is shown on the well rather than the field, because the field has no padding and an
       outline drawn on it would sit on top of the outermost row of cells. */
    .well:has(.field:focus-visible) {
      outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      outline-offset: 2px;
    }

    .cell {
      width: ${SNAKE_CELL_SIZE_PX}px;
      height: ${SNAKE_CELL_SIZE_PX}px;
    }

    /* Each segment is inset from its cell by a ring of the well's own ground, so a snake that has
       folded back on itself still reads as a line of segments rather than one solid block. */
    .cell[data-part='head'],
    .cell[data-part='body'] {
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
      box-shadow: inset 0 0 0 1px var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
      border-radius: 3px;
    }

    /* The head is the one segment the player has to find at a glance, so it gets a dot in the accent
       text colour, which the contract guarantees is readable on the accent. */
    .cell[data-part='head'] {
      background:
        radial-gradient(
          circle,
          var(--umbradesktop-app-accent-text, var(--uui-color-surface)) 0 2px,
          transparent 2.5px
        ),
        var(--umbradesktop-app-accent, var(--uui-color-selected));
    }

    .cell[data-part='food'] {
      background: ${unsafeCSS(FOOD_COLOUR)};
      box-shadow: inset 0 0 0 2px var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
      border-radius: 50%;
    }

    /* A banner across the middle of the board, out of flow so it costs the window nothing, and
       pointer-events: none so it never gets in the way of a click that focuses the field.

       Centred three quarters of the way down the board rather than in the middle, because the
       middle row is where the snake starts: a centred banner hid it completely before the first
       key press, so the player could not see which way it was facing. The offset is the status
       row, the gap under it and the well's padding, then three quarters of the board. */
    .message {
      position: absolute;
      top: ${SNAKE_STATUS_HEIGHT_PX + SNAKE_PADDING_PX * 2 + SNAKE_BOARD.height * SNAKE_CELL_SIZE_PX * 0.75}px;
      left: ${SNAKE_PADDING_PX * 2}px;
      right: ${SNAKE_PADDING_PX * 2}px;
      transform: translateY(-50%);
      margin: 0;
      padding: 6px ${SNAKE_PADDING_PX}px;
      text-align: center;
      pointer-events: none;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
      border-radius: var(--umbradesktop-app-radius, 3px);
    }

    .message[hidden] {
      display: none;
    }

    /* Windows 98's two-tone bevels, which no token pair can express. Hardcoded greys, and nothing
       here changes a size: a theme branch may change how the app looks, never how big it is. */
    :host([data-umbradesktop-theme='win98']) .new-game {
      border-color: transparent;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }

    :host([data-umbradesktop-theme='win98']) .well,
    :host([data-umbradesktop-theme='win98']) .display {
      box-shadow:
        inset 1px 1px #808080,
        inset -1px -1px #fff,
        inset 2px 2px #000,
        inset -2px -2px #dfdfdf;
    }
  `;
}

export { SnakeElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-snake': SnakeElement;
  }
}
