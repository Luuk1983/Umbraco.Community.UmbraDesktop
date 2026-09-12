import {
  MINESWEEPER_BEGINNER,
  MINESWEEPER_CELL_SIZE_PX,
  MINESWEEPER_DISPLAY_DIGITS,
  MINESWEEPER_GRID_GAP_PX,
  MINESWEEPER_OUTCOME_HEIGHT_PX,
  MINESWEEPER_PADDING_PX,
  MINESWEEPER_STATUS_HEIGHT_PX,
} from './constants.js';
import { createBoard, remainingMines, reveal, toggleFlag } from './rules.js';
import type { MinesweeperBoard, MinesweeperConfig, MinesweeperPlacer } from './rules.js';
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Minesweeper's own glyphs.
 *
 * Hardcoded **deliberately**, and the same goes for {@link DIGIT_COLOURS} below. The app-token
 * contract stops at the surface an app sits on: `docs/desktop-apps.md` §4 says in as many words
 * that there is no mine colour and no flag red, because a theme has no opinion about what a mine
 * looks like and an app that waited for one would have nothing to draw. A mine is this app's
 * domain, so this app owns it.
 *
 * Text glyphs rather than an SVG or an emoji: they inherit the theme's own font stack through
 * `--umbradesktop-app-font`, so the board reads as belonging to the chrome around it, and they
 * scale with the cell without a second asset to keep in step. Emoji were rejected because their
 * rendering is the platform's rather than the theme's, which is the one thing this element is
 * trying not to be.
 */
const MINE_GLYPH = '✹';
/** The flag a player plants. See {@link MINE_GLYPH} for why these are the app's and not a theme's. */
const FLAG_GLYPH = '⚑';

/**
 * The classic adjacency colours, 1 through 8, exactly as the original shipped them.
 *
 * This app's domain palette, for the reason {@link MINE_GLYPH} gives, and the numbers are the
 * original's rather than something derived from the theme: "1 is blue and 2 is green" is knowledge
 * a player brings with them, and a Minesweeper that renumbered its own colours per theme would be
 * harder to read under every one of them. They are also the one thing here a theme genuinely
 * cannot help with, since a count is not a surface, a text or an accent.
 *
 * The array is the single source for both the CSS rules and the digit rendering, so a colour cannot
 * be defined for a number the board never draws or vice versa.
 */
const DIGIT_COLOURS = [
  '#0000ff',
  '#007b00',
  '#e00000',
  '#00007b',
  '#7b0000',
  '#007b7b',
  '#7b007b',
  '#404040',
] as const;

/**
 * How much of the theme's own boundary colour goes into a closed cell's face, as a percentage.
 *
 * This app's, for the same reason {@link MINE_GLYPH} is: which way up a board reads is
 * Minesweeper's domain and not a theme's. Windows 98 is the original and settles it — a closed cell
 * is grey material and an opened one is the white field underneath it — and every theme has to say
 * the same thing, inverted on a dark one, or the board means nothing.
 *
 * No pair of tokens can say it. `surface-raised` against `surface-sunken` is the obvious reading
 * and it is what shipped, and it was reported unplayable: `docs/desktop-apps.md` §4 promises text
 * on the three surfaces and `border` against all three at 3:1, and says nothing whatever about the
 * gap *between* two surfaces, because there is nothing to say — Umbraco's own surface family spans
 * 1.07:1 at its widest. Both Umbraco themes accordingly drew the two states 1.03:1 apart, which is
 * one colour, and macOS and Windows 11 drew them the wrong way up, which is not a palette bug
 * either: `surface-raised` is a control face, a macOS control face is white, and white is right for
 * a button and backwards for a tile nobody has lifted yet.
 *
 * So the face is derived instead: the well's own ground, pulled toward `--umbradesktop-app-border`.
 * That token is the one whose contrast *and* direction the contract fixes, since 3:1 against every
 * surface makes it necessarily darker than a light theme's ground and lighter than a dark theme's.
 * An opened cell is then literally the well showing through, and a closed one is a tile of the
 * theme's own material over it, under any theme, including a sixth.
 *
 * **25 is measured, not picked.** It is the smallest round figure that clears, on every shipped
 * theme, the step macOS and Windows 11 already ship and nobody has ever remarked on: it lands the
 * five between 1.28:1 and 1.84:1, and 1.16:1 on the flattest palette the contract still permits,
 * against the 1.03:1 that was reported. And it checks against the reference from the other end —
 * 25% of Windows 98's black into Windows 98's white is `#bfbfbf`, one 8-bit step from the
 * `#c0c0c0` face that theme names for itself, so that theme's board is derived to the colour it
 * would have hardcoded.
 */
const CLOSED_CELL_TINT_PERCENT = 25;

/** Localisation area this package's dictionaries live under. */
const AREA = 'umbraDesktopEntertainment';

/**
 * Highest number either display can show, derived from the digit count rather than typed as 999, so
 * a four-digit display would need no second edit. The clock stops here, as the original's does.
 */
const DISPLAY_MAX = 10 ** MINESWEEPER_DISPLAY_DIGITS - 1;

/**
 * Format a number for the three-digit displays.
 *
 * Negative values are possible on the mine counter (a player may plant more flags than there are
 * mines) and are shown with a leading minus and one digit fewer, which is what the original does
 * rather than an invention here.
 * @param value The number to show.
 * @returns Exactly {@link MINESWEEPER_DISPLAY_DIGITS} characters.
 */
function formatDisplay(value: number): string {
  const clamped = Math.max(-DISPLAY_MAX, Math.min(DISPLAY_MAX, Math.trunc(value)));
  const digits = MINESWEEPER_DISPLAY_DIGITS - (clamped < 0 ? 1 : 0);
  return (clamped < 0 ? '-' : '') + String(Math.abs(clamped)).padStart(digits, '0');
}

/**
 * Minesweeper, as a self-contained UmbraDesktop app.
 *
 * The element is the window body and nothing else: it holds a board value from `rules.ts` in one
 * reactive field, hands every gesture to a pure function, and renders whatever comes back. All of
 * the game's logic is therefore testable without a DOM, and everything here is testable through
 * one.
 *
 * Its styling reads the thirteen app tokens with the fallbacks `docs/desktop-apps.md` §4 publishes,
 * and it has exactly one per-theme branch, for Windows 98's bevels. Every other difference between
 * the five themes is carried by `--umbradesktop-app-edge-width` and `--umbradesktop-app-radius`
 * doing their job: a theme with square bevelled controls and one with flat rounded ones are the
 * same stylesheet with different numbers in it.
 */
@customElement('umbradesktop-minesweeper')
export class MinesweeperElement extends UmbLitElement {
  /**
   * Board size and difficulty. Public so a future manifest could ship an intermediate board as a
   * second app off the same element rather than a second element.
   */
  @property({ attribute: false })
  config: MinesweeperConfig = MINESWEEPER_BEGINNER;

  /**
   * Where the mines go, if the caller cares.
   *
   * The injection seam `rules.ts` is built around, surfaced here for the same reason it exists
   * there: it is what lets a test say "there is a mine in that cell" and then click it. Unset means
   * `randomPlacer`, which is what a player gets.
   */
  @property({ attribute: false })
  placer?: MinesweeperPlacer;

  /** The game. Undefined only between construction and {@link connectedCallback}. */
  @state()
  private _board?: MinesweeperBoard;

  /** Seconds the current game has been running, as shown on the clock. */
  @state()
  private _elapsed = 0;

  /** The running clock's `setInterval` handle, or undefined when it is not running. */
  private _clock?: number;

  /**
   * Deal the first board.
   *
   * Here rather than in the constructor for two independent reasons, and both are traps
   * `docs/desktop-apps.md` §8 names. The desktop stamps `data-umbradesktop-theme` on the element
   * *after* constructing it, so a constructor is too early to read anything about the theme (this
   * element reads the theme only in CSS, which is safe at any time, but the same ordering applies
   * to the property bindings below). And `config` and `placer` are set by whoever mounted the
   * element, which has also not happened yet at construction time.
   *
   * Guarded, because a re-attach is not a new game: moving the element in the DOM would otherwise
   * silently deal a fresh board out from under the player.
   */
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._board) this._board = createBoard(this.config, this.placer);
  }

  /**
   * Stop the clock.
   *
   * The whole of teardown, and it matters: closing the window unmounts the element, and an interval
   * left running would tick against a detached board for as long as the backoffice tab lives.
   * Minimizing, by contrast, does **not** unmount (§7 of the guide), so a minimized game keeps
   * counting, which is the correct behaviour for a timed one and is why the cancel belongs here
   * rather than on a visibility signal.
   */
  override disconnectedCallback(): void {
    this.#stopClock();
    super.disconnectedCallback();
  }

  /** Start or stop the clock to match the board, after every render. */
  override updated(): void {
    if (this._board?.status === 'playing') this.#startClock();
    else this.#stopClock();
  }

  /** Begin ticking, unless already ticking. */
  #startClock(): void {
    if (this._clock !== undefined) return;
    this._clock = window.setInterval(() => {
      this._elapsed = Math.min(this._elapsed + 1, DISPLAY_MAX);
    }, 1000);
  }

  /** Stop ticking, and forget the handle so a later start is not suppressed. */
  #stopClock(): void {
    if (this._clock === undefined) return;
    window.clearInterval(this._clock);
    this._clock = undefined;
  }

  /** Deal a fresh board and put the clock back to zero. */
  #newGame(): void {
    this.#stopClock();
    this._elapsed = 0;
    this._board = createBoard(this.config, this.placer);
  }

  /**
   * Open a cell.
   * @param index The cell the player clicked.
   */
  #onReveal(index: number): void {
    if (this._board) this._board = reveal(this._board, index);
  }

  /**
   * Plant or lift a flag.
   *
   * `contextmenu` is the gesture, which is right-click on a pointer and the context-menu key on a
   * keyboard, and the default is prevented so the browser's own menu does not open over the board.
   * @param event The context-menu event, whose default is cancelled.
   * @param index The cell the player marked.
   */
  #onFlag(event: Event, index: number): void {
    event.preventDefault();
    if (this._board) this._board = toggleFlag(this._board, index);
  }

  /**
   * A cell's state, as the attribute both the stylesheet and the tests read.
   * @param board The board being rendered.
   * @param index The cell in question.
   * @returns `open`, `flagged` or `closed`.
   */
  #stateOf(board: MinesweeperBoard, index: number): 'open' | 'flagged' | 'closed' {
    const cell = board.cells[index];
    if (cell.revealed) return 'open';
    return cell.flagged ? 'flagged' : 'closed';
  }

  /**
   * What a screen reader should say a cell holds.
   *
   * Spoken rather than drawn, which is why it exists at all: the glyphs are legible and the digit
   * colours are meaningful only to someone looking at them, and a grid of eighty-one buttons
   * announcing nothing but their coordinates would be unplayable. The empty and numbered cases
   * differ because "empty" is information a player acts on.
   * @param board The board being rendered.
   * @param index The cell to describe.
   * @returns A localised word, or the adjacent-mine count as a number.
   */
  #describe(board: MinesweeperBoard, index: number): string | number {
    const cell = board.cells[index];
    if (cell.flagged) return this.localize.termOrDefault(`${AREA}_minesweeperFlagged`, 'flagged');
    if (!cell.revealed) return this.localize.termOrDefault(`${AREA}_minesweeperClosed`, 'closed');
    if (cell.mine) return this.localize.termOrDefault(`${AREA}_minesweeperMine`, 'mine');
    return cell.adjacent || this.localize.termOrDefault(`${AREA}_minesweeperEmpty`, 'empty');
  }

  /**
   * One cell.
   * @param board The board being rendered.
   * @param index The cell to draw.
   * @returns The cell's button.
   */
  #renderCell(board: MinesweeperBoard, index: number) {
    const cell = board.cells[index];
    const state = this.#stateOf(board, index);
    const number = cell.revealed && !cell.mine && cell.adjacent > 0 ? cell.adjacent : undefined;
    const glyph = state === 'flagged' ? FLAG_GLYPH : cell.revealed && cell.mine ? MINE_GLYPH : '';
    // Coordinates rather than a cell index, because "4, 7" is a position a player can find on the
    // board and "index 58" is not. One-based for the same reason.
    const column = (index % board.width) + 1;
    const row = Math.floor(index / board.width) + 1;
    return html`<button
      class="cell"
      data-state=${state}
      data-adjacent=${number ?? nothing}
      aria-label=${`${column}, ${row}: ${this.#describe(board, index)}`}
      @click=${() => this.#onReveal(index)}
      @contextmenu=${(event: Event) => this.#onFlag(event, index)}
    >
      ${number ?? glyph}
    </button>`;
  }

  /**
   * The whole window body.
   *
   * The minefield is a `role="group"` of buttons rather than a `role="grid"`, which was the first
   * thing written and is wrong: `grid` wants rows and gridcells beneath it, while a cell here is a
   * thing you click, so a button is what a screen reader should be offered. The group's label is
   * what names the collection instead.
   * Everything sits in one `.board` box, which exists for one reason: a window can be bigger than
   * this app (maximize it and it is much bigger), the grid does not reflow, so the whole of it
   * centres at its natural size rather than staying pinned to the top-left corner with an empty
   * expanse beside it. One box also means one thing to centre instead of three that would have to
   * agree.
   * @returns The status row, the minefield and the outcome, or nothing before the first board.
   */
  override render() {
    const board = this._board;
    if (!board) return nothing;
    const outcome =
      board.status === 'won' || board.status === 'lost'
        ? this.localize.termOrDefault(
            `${AREA}_minesweeper${board.status === 'won' ? 'Won' : 'Lost'}`,
            board.status === 'won' ? 'Cleared.' : 'Boom.',
          )
        : '';
    return html`
      <div class="board">
        <div class="status">
          <span
            class="display mines"
            aria-label=${this.localize.termOrDefault(`${AREA}_minesweeperMinesLeft`, 'Mines left')}
            >${formatDisplay(remainingMines(board))}</span
          >
          <button class="new-game" @click=${() => this.#newGame()}>
            ${this.localize.termOrDefault(`${AREA}_minesweeperNewGame`, 'New game')}
          </button>
          <span
            class="display clock"
            aria-label=${this.localize.termOrDefault(`${AREA}_minesweeperElapsed`, 'Seconds elapsed')}
            >${formatDisplay(this._elapsed)}</span
          >
        </div>
        <div class="well">
          <div
            class="grid"
            role="group"
            aria-label=${this.localize.termOrDefault(`${AREA}_minesweeperBoard`, 'Minefield')}
            style="grid-template-columns: repeat(${board.width}, ${MINESWEEPER_CELL_SIZE_PX}px)"
          >
            ${board.cells.map((_cell, index) => this.#renderCell(board, index))}
          </div>
        </div>
        <p class="outcome" role="status" data-result=${board.status}>${outcome}</p>
      </div>
    `;
  }

  /**
   * One stylesheet for five themes, plus one branch.
   *
   * Every colour, edge and radius is an app token read with the fallback §4 of the guide publishes,
   * so this renders as the Umbraco identity theme when no theme has set anything, which is also
   * what happens in the moment before a theme resolves. Every ground is `background` and never
   * `background-color`, because a surface token may carry a gradient and `background-color` would
   * drop it and leave the element unpainted.
   *
   * `--umbradesktop-app-edge-width` and `--umbradesktop-app-radius` are what make it native under
   * all five without a branch: a theme whose controls are bevelled sets a wide edge and no rounding
   * and gets chiselled squares, a theme whose controls are flat sets a hairline and a radius and
   * gets rounded tiles. The Windows 98 block at the end is the one place that is not enough, since
   * a real two-tone bevel is two colours per edge and no token pair can express that.
   *
   * The one thing here that is **not** a token read straight off is a closed cell's face, which is
   * derived from two of them — see {@link CLOSED_CELL_TINT_PERCENT}. Reading it off
   * `surface-raised` is what this did, and it is why the board came out unreadable under two themes
   * and upside down under two more: which of a theme's surfaces is the darker one, and by how much,
   * is not part of the contract and never was.
   */
  static override styles = css`
    :host {
      display: flex;
      box-sizing: border-box;
      min-height: 100%;
      padding: ${MINESWEEPER_PADDING_PX}px;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font-family: var(--umbradesktop-app-font, inherit);
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* Centred with auto margins rather than with place-content on the host, and the difference is
       what happens when the window is *smaller* than the board. Auto margins never resolve
       negative, so a board that does not fit is pushed against the top-left corner and clipped at
       one end only, where centring would clip it at both and hide the first row and column with
       nothing able to scroll them back. The host's sizing makes that case unreachable — a window's
       minimum is this app's declared content box plus the chrome — so this is the belt to those
       braces. */
    .board {
      margin: auto;
      /* The banner's containing block. The outcome line is taken out of flow so that a line shown for
         the few seconds between a last click and a new game does not charge every window it is
         ever opened in for the height of it. */
      position: relative;
    }

    .status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: ${MINESWEEPER_PADDING_PX}px;
      height: ${MINESWEEPER_STATUS_HEIGHT_PX}px;
    }

    /* Both displays and the well are the same recessed surface: one theme's sunken token, one
       theme's edge, one theme's radius.

       The edge is a *spread shadow* rather than a border, and that is load-bearing rather than a
       flourish. A border here put edge-width — a value the theme sets and a manifest cannot read —
       into this app's outer width and height, so the content size the manifest declares was exact
       under the two themes that publish zero and two to four pixels short under the ones that
       publish a bevel. The app's own answer to that was an EDGE_SLACK_PX of 8: over-declare by the
       widest bevel it happened to know about and hope no future theme wants a wider one. A spread
       shadow paints the same ring, follows the same radius, and takes no layout at all, so the
       declared size is exact under any value any theme ever picks and the guess is gone.

       One pixel of border, not edge-width of it, and drawn in border rather than edge-dark.
       Tying the ring's *width* to the theme's bevel meant the two themes that publish 0px drew a
       recessed field with no boundary at all, and tying its *colour* to edge-dark meant the ring
       was invisible even where it was drawn: Win11 publishes an 8% black there, which is right for
       a Mica card and 1.15:1 against what this app puts inside it. border is the token that
       promises 3:1 on all three surfaces, so this is a field a player can see the edges of under
       every theme, present or future. Windows 98 replaces the whole shadow with its own bevel
       below, as it always did.

       The cells keep their edge-dark borders. They are fixed-size and border-box, so an edge
       inside them costs the board nothing, and §4 of the guide is explicit that a control's own
       edge is what that token is for — the ruling *between* controls is what it could not do. */
    .display,
    .well {
      background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
      box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
      border-radius: var(--umbradesktop-app-radius, 3px);
    }

    .display {
      padding: 4px 8px;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.08em;
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
      margin-top: ${MINESWEEPER_PADDING_PX}px;
      padding: ${MINESWEEPER_PADDING_PX}px;
      width: fit-content;
    }

    /* The grid rules itself: its own ground shows through a one-pixel gap between the cells, which
       needs no arithmetic on a token and no per-theme branch, and leaves the cells reading
       edge-width for whatever edge the theme does want on top.

       The ground is border and not edge-dark, and the difference between those two tokens is
       this rule's whole history. A tiled grid of controls needs a boundary between neighbours, and
       edge-width cannot supply one: macOS and Windows 11 both publish 0px, correctly, because
       *their* controls are flat. Ruling the gap in edge-dark was the answer to that and only got
       half way, because a theme is entitled to make its bevel as subtle as its own controls are —
       Win11's is 8% black, which came out at 1.15:1 against a cell in light mode and 1.33:1 in
       dark, so the board still rendered as one undivided sheet and was reported as exactly that.
       border is the token that guarantees 3:1 against all three surfaces, which is what a grid
       ruling needs and what WCAG 1.4.11 asks of a control boundary. */
    .grid {
      display: grid;
      gap: ${MINESWEEPER_GRID_GAP_PX}px;
      background: var(--umbradesktop-app-border, var(--uui-color-text-alt));
      line-height: 1;
    }

    .cell {
      width: ${MINESWEEPER_CELL_SIZE_PX}px;
      height: ${MINESWEEPER_CELL_SIZE_PX}px;
      display: grid;
      place-items: center;
      padding: 0;
      /* A count has to be legible at this size under five different UI fonts, so it is derived from
         the cell rather than picked: much smaller and the digits disappear, much larger and the
         mine glyph touches the bevel. */
      font-size: ${Math.round(MINESWEEPER_CELL_SIZE_PX * 0.6)}px;
      font-family: var(--umbradesktop-app-font, inherit);
      font-weight: 700;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      /* The control face, which is what a closed cell is *nearly* right to be and what an engine
         without color-mix still gets. See the @supports block below for why nearly is not enough
         and what replaces it. */
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      /* The theme's own edge, exactly as published: the cell is one of the controls the
         edge-width/radius pair is meant to draw, and a theme that says its controls are flat and
         rounded gets flat rounded cells. Never wrapped in calc() or max(), which was the first
         thing tried here and does not work: two of the five themes publish edge-width as a
         unitless zero, which is a valid length on its own and is invalid inside a math function,
         and the failure takes the whole shorthand with it, border-style included. So the ruling a
         grid needs is the gap below rather than a floor on this. */
      border: var(--umbradesktop-app-edge-width, 1px) solid
        var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px);
      /* The light edge, drawn as a shadow rather than a border colour so that a theme whose
         edge-light is the documented transparent gets a plain flat control rather than a box
         missing two of its sides. */
      box-shadow: inset var(--umbradesktop-app-edge-width, 1px)
        var(--umbradesktop-app-edge-width, 1px) 0 var(--umbradesktop-app-edge-light, transparent);
      cursor: pointer;
    }

    /* A closed cell is a tile of the theme's own material laid over the well, which is the whole
       of what {@link CLOSED_CELL_TINT_PERCENT} exists to say. Both states are derived from one
       ground — the well's — so the open one is the well showing through and the closed one is that
       same ground moved toward the theme's boundary colour, rather than two unrelated surface
       tokens hoping to differ.

       In an @supports block rather than inline, matching the pattern the desktop's own
       desktop.element.ts uses for its scrim: the plain declaration above stands as the answer for
       an engine without color-mix, and this upgrades it. Written as a separate block and not as
       var(--token, color-mix(...)), which is the tempting shorthand and does not work — an
       unknown function inside a var() fallback takes the whole declaration down with it on exactly
       the engines the fallback was for.

       It cannot silently paint nothing either, which is the other way this could have gone wrong.
       color-mix takes colours, not gradients, and --umbradesktop-app-surface-* is documented as a
       ground that may carry any background value — but the desktop's own app-tokens.test.ts
       measures text contrast against all three surfaces and fails on any value it cannot parse as
       an opaque colour, so "these three are flat colours" is an invariant with a test behind it
       rather than a hope.

       in srgb, and not in oklab, which is the better instinct and the worse answer. Perceptual
       interpolation is the right tool for a gradient and the wrong one here, because mixing toward
       a light colour in oklab barely moves a near-black ground and the dark themes are where this
       step is already tightest: measured in Chrome, oklab at this same percentage gives 1.09:1 on
       macOS dark against srgb's 1.35:1. */
    @supports (background-color: color-mix(in srgb, red 50%, white)) {
      .cell {
        background: color-mix(
          in srgb,
          var(--umbradesktop-app-border, var(--uui-color-text-alt)) ${CLOSED_CELL_TINT_PERCENT}%,
          var(--umbradesktop-app-surface-sunken, var(--uui-color-background))
        );
      }
    }

    .cell[data-state='open'] {
      /* The well's ground, undisturbed: an opened cell is a hole in the field rather than a
         differently-coloured tile, so it matches the well's own padding around the board and the
         revealed region reads as one continuous space.

         This wins over the @supports block above on specificity rather than on order — (0,2,0)
         against (0,1,0) — so an engine that supports color-mix and one that does not both paint an
         opened cell with exactly this, and the two states can never collapse into each other. */
      background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
      /* The border stays, and only the bevel goes: an opened cell is still part of a ruled grid,
         and the ruling is what separates two opened neighbours, which now share a ground exactly
         rather than approximately. */
      box-shadow: none;
      cursor: default;
    }

    .cell:focus-visible {
      outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      outline-offset: -2px;
    }

    /* A banner across the middle of the board, out of flow, and empty for all but the last few
       seconds of a game.

       It was a row under the well, with a fixed height and a margin, and both were a term in the
       size the manifest declares: 32px of the window's height reserved for a line that says nothing
       until the game ends. In the tightest of the five frames that read as a dead band under the
       board and was reported as too much space by default. Out of flow it costs nothing, so the
       window is the size of the game rather than the size of the game plus a caption it might one
       day print.

       pointer-events: none is not optional. The banner spans a full row of cells whether or not
       it has anything in it, and without this it would swallow the clicks aimed at them for the
       whole game. The height is a minimum rather than a height so a theme whose font wraps the
       line gets a taller banner instead of a clipped one — nothing depends on the number now. */
    .outcome {
      position: absolute;
      top: 50%;
      left: ${MINESWEEPER_PADDING_PX}px;
      right: ${MINESWEEPER_PADDING_PX}px;
      transform: translateY(-50%);
      margin: 0;
      min-height: ${MINESWEEPER_OUTCOME_HEIGHT_PX}px;
      display: grid;
      place-content: center;
      text-align: center;
      pointer-events: none;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    }

    /* Both outcomes get an opaque ground, which they did not need while this was a row of its own:
       a banner sits over a board that has just revealed every mine on it, and text alone on top of
       that is unreadable. The border is the same guaranteed 3:1 line the well uses, so the banner
       has an edge under a theme whose surface it happens to match. */
    .outcome[data-result='won'],
    .outcome[data-result='lost'] {
      padding: 0 ${MINESWEEPER_PADDING_PX}px;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
      border-radius: var(--umbradesktop-app-radius, 3px);
    }

    /* The one place the accent and its text colour belong here: a win is the app's own selected
       state. The accent-text token rather than white, because white is unreadable on some themes'
       accents, which is the whole reason that token exists. */
    .outcome[data-result='won'] {
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
      color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
    }

    ${unsafeCSS(
      DIGIT_COLOURS.map(
        (colour, index) => `.cell[data-adjacent='${index + 1}'] { color: ${colour}; }`,
      ).join('\n'),
    )}

    /* The one deliberate per-theme branch. A Windows 98 control's edge is two greys and two whites
       in a fixed order, which is structure rather than a value, so no token pair can express it:
       edge-light and edge-dark are one colour each. Written as a refinement on top of the
       correct unbranched rules above, never as the base case, so a sixth theme cannot break this
       app. The greys are Windows 98's own and are hardcoded for the same reason the mine glyph is:
       they are not this theme's tokens, they are that operating system's. */
    :host([data-umbradesktop-theme='win98']) .cell[data-state='closed'],
    :host([data-umbradesktop-theme='win98']) .cell[data-state='flagged'],
    :host([data-umbradesktop-theme='win98']) .new-game {
      border-color: transparent;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }

    :host([data-umbradesktop-theme='win98']) .cell[data-state='open'] {
      box-shadow: inset 1px 1px #808080;
    }

    /* Windows 98's cells are 2px bevels butted directly together, which is both what the original
       did and its own ruling, so a drawn line between them would be one that operating system never
       drew. This used to say gap: 0, and removing the gap is what broke the window: the gap is a
       term in the content size the manifest declares, that size is one number for all five themes,
       and so this theme alone rendered a board eight pixels smaller than the window the host had
       opened for it, in both directions. Painting the gap in the face colour instead leaves the
       geometry identical everywhere and the bevels reading as one field, which is what the theme
       wanted from gap: 0 in the first place. */
    :host([data-umbradesktop-theme='win98']) .grid {
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    }

    /* Sunken is the same bevel inverted: dark on the top and left, light on the bottom and right.
       It replaces the spread shadow above outright, which is the same refinement-on-top pattern as
       the cells and costs this theme nothing in layout either. */
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

export { MinesweeperElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-minesweeper': MinesweeperElement;
  }
}
