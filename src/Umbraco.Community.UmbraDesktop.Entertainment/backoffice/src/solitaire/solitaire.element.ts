import {
  AUTO_FINISH_STEP_MS,
  CARD_RADIUS_RATIO,
  DEAL_STAGGER_MS,
  DRAG_THRESHOLD_PX,
  FLIP_MS,
  MOVE_MS,
  SOLITAIRE_GAME_ALIAS,
  SOLITAIRE_RESULT_WAIT_MS,
  solitaireBoard,
  STAGGER_MS,
  TOOLBAR_HEIGHT_PX,
} from './constants.js';
import { ArcadeScores } from '../shared/arcade.js';
import type { ArcadeResult } from '../shared/arcade.js';
import { WinCascade } from './cascade.js';
import type { CascadeCard } from './cascade.js';
import { CLASSIC_FACES_ALIAS, THEME_BACK_ALIAS, THEME_BACK_IMAGE } from './backs.js';
import { backImageFor } from './extensions.js';
import type { ManifestSolitaireBack, ManifestSolitaireFaces, SolitaireFaceSet } from './extensions.js';
import { cardPositions, computeLayout } from './layout.js';
import type { TableLayout } from './layout.js';
import { playFlip, snapshot } from './motion.js';
import type { Snapshot } from './motion.js';
import {
  applyTime, canAutoFinish, canDrop, deal, draw, foundationFor, move, movableRun, nextFinishingMove, pile,
  randomShuffle, timeBonus, withTimeBonus,
} from './rules.js';
import type { Card, KlondikeGame, PileId, Shuffler } from './rules.js';
import { savedGames } from './saved-games.js';
import type { SavedGameStore } from './saved-games.js';
import { readSettings, writeSettings } from './settings.js';
import './settings-modal.element.js';
import type { SolitaireSettings, StorageAccess } from './settings.js';
import {
  classMap,
  css,
  customElement,
  html,
  nothing,
  property,
  repeat,
  state,
  unsafeCSS,
  unsafeSVG,
} from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';

/** Localisation area this package's dictionaries live under. */
const AREA = 'umbraDesktopEntertainment';

/** Rank words for the aria labels, used when the dictionary is not loaded. Two to ten read as digits. */
const RANK_WORDS: Readonly<Record<number, string>> = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };

/** Suit words for the aria labels, used when the dictionary is not loaded. */
const SUIT_WORDS = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as const;

/**
 * Every pile, in the order slots are drawn and drops are tested. One list so the slots, the hit
 * test and the card placement can never disagree about which piles exist.
 */
const PILES: ReadonlyArray<PileId> = [
  'stock', 'waste', 'f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6',
];

/**
 * The felt's faint grain: a tile of white fractal noise whose alpha is scaled down, drawn as a data
 * URI so the package ships no image for it. `%23` is the encoded `#` a URL reference needs.
 */
const NOISE_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)'/></svg>";

/** A drag in progress: which cards are lifted, where they came from, and how to stop listening. */
interface Drag {
  /** The pointer that started it; a second finger is ignored. */
  readonly pointerId: number;
  /** The pile the run was lifted from. */
  readonly from: PileId;
  /** Position of the run's lowest card in that pile. */
  readonly index: number;
  /** Where the press began, in viewport px, so movement is measured from it. */
  readonly startX: number;
  /** Where the press began, in viewport px. */
  readonly startY: number;
  /** The lifted card elements, lowest first. */
  readonly elements: ReadonlyArray<HTMLElement>;
  /** Removes the three pointer listeners this drag added, in one call. */
  readonly stop: () => void;
  /** Whether the pointer has travelled far enough for this to be a drag and not a click. */
  active: boolean;
}

/**
 * Solitaire, as a self-contained UmbraDesktop app (design D1-D12).
 *
 * The element holds one `KlondikeGame` from `rules.ts` and renders whatever it is. Every state
 * change goes through `#commit`, which is the FLIP step from `motion.ts`: measure where the cards
 * are, let the new state put them somewhere else, then animate each from the old place. Dealing,
 * drawing, dropping, flying home and snapping back are therefore one code path, which is why a
 * card's DOM node must survive every move: cards are keyed by id and never re-created.
 *
 * Cards are all direct children of one `.table`, in id order, and stacked with `z-index`, rather
 * than nested inside pile elements. A card that moves from one pile to another would otherwise
 * change parent, which destroys the node and with it the animation and the 3D turn.
 *
 * With the Arcade there (design P6), the win screen after the cascade is the Arcade's result card,
 * with the time bonus in its detail line, and the settings dialog gains Leaderboard, which opens the
 * Arcade's panel over the table on the draw mode being played and stops the clock until the player
 * closes it. Without the Arcade the win screen and the dialog are exactly as they always were.
 */
@customElement('umbradesktop-solitaire')
export class SolitaireElement extends UmbLitElement {
  /** The line to the Arcade; injectable for tests. Does nothing without the Arcade. */
  scores: Pick<ArcadeScores, 'submit' | 'reachable'> = new ArcadeScores(this, SOLITAIRE_GAME_ALIAS);

  /** How a new game is shuffled. A seam for tests, as Minesweeper's placer is. */
  @property({ attribute: false })
  shuffle: Shuffler = randomShuffle;

  /** A game to start from instead of dealing or claiming a saved one. For tests only. */
  @property({ attribute: false })
  startingGame?: KlondikeGame;

  /** Where unfinished games are kept. The page's shared store unless a test gives its own. */
  @property({ attribute: false })
  store: SavedGameStore = savedGames;

  /** Where settings are kept. A function so a locked-down browser's throwing storage is caught. */
  @property({ attribute: false })
  settingsStorage: StorageAccess = () => window.localStorage;

  /**
   * Whether to move instantly. Read at each move and never cached, because the player can change
   * the operating system setting while a game is open (design D4).
   */
  @property({ attribute: false })
  reducedMotion: () => boolean = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * How long one second of the game clock takes, in ms. A seam for tests, which tick at 5ms
   * instead of waiting real seconds; players always get 1000.
   */
  @property({ attribute: false })
  clockIntervalMs = 1000;

  /**
   * How long a win waits for the Arcade's answer before showing the game's own win screen, in ms.
   * A seam for tests, as {@link clockIntervalMs} is; players always get {@link SOLITAIRE_RESULT_WAIT_MS}.
   */
  @property({ attribute: false })
  resultWaitMs = SOLITAIRE_RESULT_WAIT_MS;

  /**
   * Asks for the next frame of the win cascade. Unset means `requestAnimationFrame`; a test
   * injects a timer-based one, because background test tabs never deliver real frames.
   */
  @property({ attribute: false })
  cascadeSchedule?: (callback: () => void) => number;

  /** Withdraws a frame asked for with {@link cascadeSchedule}. Unset means `cancelAnimationFrame`. */
  @property({ attribute: false })
  cascadeCancel?: (handle: number) => void;

  /** The active theme id, stamped on every app by the desktop (`docs/desktop-apps.md` §5). */
  @property({ attribute: 'data-umbradesktop-theme' })
  theme?: string;

  /** The game. Undefined only between construction and {@link connectedCallback}. */
  @state()
  private _game?: KlondikeGame;

  /** The table's geometry at the current size. Undefined until the element has a size. */
  @state()
  private _layout?: TableLayout;

  /** Seconds of play so far, shown on the toolbar and kept with the saved game. */
  @state()
  private _elapsed = 0;

  /** The player's settings, read when the window opens. */
  @state()
  private _settings!: SolitaireSettings;

  /** Every registered back, for resolving the chosen one. */
  @state()
  private _backs: ReadonlyArray<ManifestSolitaireBack> = [];

  /** Every registered face set, for resolving the chosen one. */
  @state()
  private _facesManifests: ReadonlyArray<ManifestSolitaireFaces> = [];

  /** The face set in use. Undefined while its module is still loading. */
  @state()
  private _faces?: SolitaireFaceSet;

  /** Whether the settings modal is open. */
  @state()
  private _settingsOpen = false;

  /** The pile the dragged cards would land on if dropped now, to light it. */
  @state()
  private _dropTarget?: PileId;

  /** Whether the game is won and the panel is showing. */
  @state()
  private _won = false;

  /**
   * What the Arcade handed back for the win; the result card replaces the win screen when it is set
   * (design P6). Undefined before a win, after New game, and without the Arcade.
   */
  @state()
  private _result?: ArcadeResult;

  /**
   * Whether the Arcade is there, which is when the settings dialog offers the leaderboard and the
   * panel is placed at all. Asked when the window opens and again when the settings dialog opens, and
   * set by an accepted win too: an Arcade that loaded after the window opened would otherwise give the
   * card a Leaderboard button with no panel behind it.
   */
  @state()
  private _arcadeHere = false;

  /**
   * Whether a win's score is still on its way to an Arcade that is there. The win screen waits for
   * the answer meanwhile, so it does not show for a moment and then give way to the card, taking the
   * keyboard with it. Never set without the Arcade, where the win screen shows at once as it always did.
   * Cleared after {@link resultWaitMs} whatever the answer, so a stalled server still gets the player a
   * win screen; a card that arrives later replaces it.
   */
  @state()
  private _awaitingResult = false;

  /**
   * Whether the leaderboard panel is open. Mirrored back from the panel's `close` event, because the
   * panel closes itself (Esc, its close button, the scrim) and a flag left saying `true` would make
   * the next `?open=${true}` a no-op for Lit.
   */
  @state()
  private _panelOpen = false;

  /** The board the panel opens on: the draw mode being played, or the one the card names. */
  @state()
  private _panelBoard = '';

  /** The win's time bonus, for the card's detail line ("incl. 1,520 time bonus", the mock's section 6). */
  #bonus = 0;

  /** Whether the clock was running when the panel opened, so closing it starts the clock again, and only then. */
  #clockBeforePanel = false;

  /**
   * What opened the panel, so closing it gives the keyboard back there: the panel's close button
   * held it and goes away with the panel, which would otherwise leave focus on the page behind.
   */
  #panelOpener: 'settings' | 'card' = 'settings';

  /** Whether the win cascade canvas is on screen. */
  @state()
  private _cascading = false;

  /** Whether auto-finish is playing the game out, which hides its button and locks the cards. */
  @state()
  private _finishing = false;

  /**
   * The piles the lifted cards could legally land on, lit faintly while dragging (design D3). Worked
   * out once when the drag starts, since the cards in play do not change while a card is in the air.
   */
  @state()
  private _legal: ReadonlySet<PileId> = new Set();

  /**
   * Each face set's king of spades, by alias, for the settings modal. Loaded when the modal opens,
   * since loading every set's module only to draw a preview is not worth doing before anyone asks.
   */
  @state()
  private _previews: ReadonlyMap<string, string> = new Map();

  /** This window's id in the saved-game store. Replaced by the claimed id when a game is resumed. */
  #id = `w${Math.random().toString(36).slice(2)}`;

  /** The rendered SVG of each card for the current face set, so a card is drawn once, not per render. */
  #faceCache = new Map<string, string>();

  /** Counts face-set loads, so a slow load that was overtaken cannot overwrite a newer one. */
  #facesLoad = 0;

  /** Watches the element's size, for the changes `relayout` cannot know about by itself. */
  #resize?: ResizeObserver;

  /** The drag in progress, if any. */
  #drag?: Drag;

  /** The clock's interval handle, or undefined when it is not running. */
  #timer?: number;

  /** The running win cascade, so a click, a key or New game can end it. */
  #cascade?: WinCascade;

  /** Set when the player ends the cascade before it was built (while card images decode). */
  #cascadeStopped = false;

  /**
   * Bumped by every new game. A win in progress compares it after each await, so a cascade the
   * player walked away from with New game cannot then raise the win panel over the fresh deal.
   */
  #epoch = 0;

  /**
   * Deal or resume the first game and start watching for things that change it.
   *
   * Here rather than the constructor because `shuffle`, `startingGame` and `store` are set by
   * whoever mounted the element, after construction. Guarded, because a re-attach is not a new game.
   */
  override connectedCallback(): void {
    super.connectedCallback();
    this._settings = readSettings(this.settingsStorage);
    if (!this._game) {
      const claimed = this.startingGame ? undefined : this.store.claim();
      if (claimed) {
        this.#id = claimed.id;
        this._game = claimed.saved.game;
        this._elapsed = claimed.saved.elapsedSeconds;
      } else {
        this._game = this.startingGame ?? deal(this._settings.drawCount, this.shuffle);
      }
    }
    if (this._game.moves > 0) this.#startTimer();
    // Whether the Arcade is there decides the win screen and the dialog's Leaderboard; nothing waits on it.
    void this.scores.reachable().then((here) => (this._arcadeHere = here));
    this.observe(umbExtensionsRegistry.byType('umbraDesktopSolitaireBack'), (backs) => (this._backs = backs));
    this.observe(umbExtensionsRegistry.byType('umbraDesktopSolitaireFaces'), (faces) => {
      this._facesManifests = faces;
      void this.#loadFaces();
    });
    this.#resize = new ResizeObserver(() => this.relayout());
    this.#resize.observe(this);
    this.addEventListener('keydown', this.#onKeyDown);
  }

  /**
   * Closing the window: stop watching, stop the clock and forget the saved game. A page unload
   * never gets here, which is what lets a refresh keep the game (design D10).
   */
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize?.disconnect();
    this.removeEventListener('keydown', this.#onKeyDown);
    // Anything still waiting on a timer or an animation (auto-finish, the win) must find the window
    // gone when it wakes, or it would save a game nobody is playing.
    this.#epoch++;
    this.#drag?.stop();
    this.#drag = undefined;
    this.#stopCascade();
    this.#stopTimer();
    this.store.remove(this.#id);
  }

  /**
   * Make sure there is a layout before the first render.
   *
   * Measured here, synchronously, rather than left to the resize observer, because an observer's
   * callback only arrives with the next rendering opportunity: the first paint would be of cards
   * with no size, and in a background tab it would never be anything else. The observer stays for
   * every later size change.
   */
  override willUpdate(): void {
    if (!this._layout) this.relayout();
  }

  /**
   * Measure the element and recompute the table's geometry.
   *
   * Public because it is the one thing the resize observer does, which lets a test that changes
   * the element's size ask for the measurement directly: background test tabs never deliver
   * observer callbacks. Reads `clientWidth`/`clientHeight`, the layout size, rather than a
   * bounding rect, so a transform on an ancestor (a window opening, a desktop zoom) cannot shrink
   * the cards. Does nothing while the element has no size (hidden, or not yet laid out), and does
   * not replace the layout when the size has not changed, so an idle resize event costs no render.
   */
  relayout(): void {
    const width = this.clientWidth;
    const height = this.clientHeight;
    if (width <= 0 || height <= 0) return;
    if (this._layout && this._layout.width === width && this._layout.height === height) return;
    this._layout = computeLayout(width, height);
  }

  /**
   * Give the window the keyboard when it opens, as `docs/desktop-apps.md` §7.1 asks of an app with
   * something to press: the desktop only falls back to this element, which is not focusable. New
   * game is the first control in the tab order, so the next Tab already lands on the stats' neighbour.
   */
  override firstUpdated(): void {
    this.shadowRoot?.querySelector<HTMLElement>('.new-game')?.focus({ preventScroll: true });
  }

  /**
   * Put keyboard focus where the player needs it after the win appears: on the cascade, so a key
   * ends it, and once the cascade is over on Play again, or on the Arcade's card when that is what
   * shows. Watched on all three, because the win screen or the card can arrive after `_won` does,
   * when the Arcade answers late or turns the score down.
   * @param changed The properties that changed in this update.
   */
  override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('_cascading') && this._cascading) {
      this.shadowRoot?.querySelector<HTMLElement>('canvas.cascade')?.focus({ preventScroll: true });
    }
    if ((changed.has('_won') || changed.has('_result') || changed.has('_awaitingResult')) && this._won) {
      this.shadowRoot
        ?.querySelector<HTMLElement>('.play-again, umbradesktop-arcade-result')
        ?.focus({ preventScroll: true });
    }
  }

  /**
   * Load the chosen face set, falling back to classic when its manifest is gone or will not load.
   *
   * A dynamic import, so 52 SVG renders stay out of the main chunk. Runs again whenever the set of
   * registered face sets changes, since the chosen one may have just appeared or vanished.
   */
  async #loadFaces(): Promise<void> {
    const load = ++this.#facesLoad;
    const manifest =
      this._facesManifests.find((m) => m.alias === this._settings.faces) ??
      this._facesManifests.find((m) => m.alias === CLASSIC_FACES_ALIAS);
    let module: { default: SolitaireFaceSet };
    try {
      module = manifest ? await manifest.loader() : await import('./faces/classic/classic.js');
    } catch {
      // A package whose chunk is gone must not leave the table blank: classic is always in this one.
      module = await import('./faces/classic/classic.js');
    }
    if (load !== this.#facesLoad) return;
    this.#faceCache.clear();
    this._faces = module.default;
  }

  /**
   * The URL of the chosen back under the current theme.
   * @returns The chosen back's image, or Match theme's when the chosen back is not registered.
   */
  #backUrl(): string {
    const manifest =
      this._backs.find((b) => b.alias === this._settings.back) ??
      this._backs.find((b) => b.alias === THEME_BACK_ALIAS);
    return backImageFor(manifest?.meta.image ?? THEME_BACK_IMAGE, this.theme);
  }

  /**
   * A card's front, drawn once and cached.
   * @param card The card.
   * @returns SVG markup, or an empty string while the face set is still loading.
   */
  #front(card: Card): string {
    let svg = this.#faceCache.get(card.id);
    if (svg === undefined && this._faces) {
      svg = this._faces.render(card);
      this.#faceCache.set(card.id, svg);
    }
    return svg ?? '';
  }

  /**
   * A card's accessible name. A face-down card says nothing about what it is.
   * @param card The card.
   * @returns A localised phrase such as "Ace of spades".
   */
  #cardName(card: Card): string {
    if (!card.faceUp) return this.localize.termOrDefault(`${AREA}_solitaireFaceDown`, 'Face-down card');
    const rank = this.localize.termOrDefault(
      `${AREA}_solitaireRank${card.rank}`,
      RANK_WORDS[card.rank] ?? String(card.rank),
    );
    const suit = this.localize.termOrDefault(`${AREA}_solitaireSuit${card.suit}`, SUIT_WORDS[card.suit]);
    return this.localize.termOrDefault(`${AREA}_solitaireCardName`, `${rank} of ${suit}`, rank, suit);
  }

  /**
   * Every card with the pile it is in and its position there.
   * @returns One entry per card, 52 in a whole game.
   */
  #placed(): Array<{ card: Card; pile: PileId; index: number }> {
    const game = this._game!;
    return PILES.flatMap((id) => pile(game, id).map((card, index) => ({ card, pile: id, index })));
  }

  /**
   * The elapsed time as m:ss.
   * @returns The clock as shown on the toolbar.
   */
  #clock(): string {
    return `${Math.floor(this._elapsed / 60)}:${String(this._elapsed % 60).padStart(2, '0')}`;
  }

  /**
   * The card's detail line: the time bonus the win earned, in the backoffice language's digits, as
   * the card shows the score beside it ("incl. 1,520 time bonus", the mock's section 6). The English
   * fallback is filled here, because `termOrDefault` hands a fallback back unprocessed when the key
   * is missing.
   * @returns The line.
   */
  #bonusLine(): string {
    const bonus = this.localize.number(this.#bonus);
    return this.localize.termOrDefault(`${AREA}_solitaireBonus`, `incl. ${bonus} time bonus`, bonus);
  }

  /**
   * Every card element, for FLIP.
   * @returns The rendered cards in DOM order.
   */
  #cardElements(): HTMLElement[] {
    return [...(this.shadowRoot?.querySelectorAll<HTMLElement>('.card') ?? [])];
  }

  /**
   * The one way the game changes: snapshot, apply, animate, save, and check for the win.
   *
   * The snapshot is a parameter with a default so the drop handler can pass one taken while the
   * cards were still under the pointer; the default is evaluated when the call is made, which is
   * before `_game` changes, so every other caller gets the positions from just before the move.
   * @param next The new game.
   * @param stagger Delay between moving cards, in ms.
   * @param before Where the cards were, if not where they are now.
   */
  async #commit(
    next: KlondikeGame,
    stagger = STAGGER_MS,
    before: Snapshot = snapshot(this.#cardElements()),
  ): Promise<void> {
    const first = this._game?.moves === 0 && next.moves > 0;
    this._game = next;
    await this.updateComplete;
    this.#flip(this.#cardElements(), before, stagger);
    if (first && this.isConnected) this.#startTimer();
    if (next.status === 'won') return this.#win();
    // A fresh deal is not worth keeping, so a game is saved from its first move. Never once the
    // window has closed: a move that was still in flight would bring the saved game back.
    if (next.moves > 0 && this.isConnected) this.store.save(this.#id, { game: next, elapsedSeconds: this._elapsed });
  }

  /**
   * Animate cards from where they were, and keep each one raised for as long as it is moving.
   *
   * A flight is laid out at its destination's stacking order, so a card sent to a foundation, whose
   * cards sit lowest, would fly underneath the columns it crosses, and one gliding back from a drop
   * would pass under the columns to its right. `flying` lifts it above the resting cards while
   * keeping the moving cards in their own order relative to each other, and comes off when the
   * card's last animation ends or is cancelled by the next flip.
   * @param cards The card elements, already in their new places.
   * @param before Where they were.
   * @param stagger Delay between moving cards, in ms.
   */
  #flip(cards: Iterable<HTMLElement>, before: Snapshot, stagger: number): void {
    const animations = playFlip(cards, before, { duration: MOVE_MS, stagger, reduced: this.reducedMotion() });
    for (const animation of animations) {
      const card = (animation.effect as KeyframeEffect | null)?.target as HTMLElement | null;
      if (!card) continue;
      card.classList.add('flying');
      const release = (): void => {
        if (card.getAnimations().every((a) => a.playState !== 'running')) {
          card.classList.remove('flying');
        }
      };
      animation.finished.then(release, release);
    }
  }

  /** A click on the stock: draw, or recycle the waste when the stock is empty. */
  #draw(): void {
    if (!this._game) return;
    const next = draw(this._game);
    if (next !== this._game) void this.#commit(next);
  }

  /**
   * A click on a card. Only the stock's cards respond, by drawing, since its top card covers the
   * stock's slot and so takes the click the slot would have had.
   * @param event The click.
   */
  #onCardClick = (event: MouseEvent): void => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.card');
    if (card?.dataset.pile === 'stock') this.#draw();
  };

  /**
   * Double-click: send the card home if it is the top of its pile and a foundation takes it.
   * @param event The double-click.
   */
  #onDoubleClick = (event: MouseEvent): void => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.card');
    if (!card || !this._game || this._finishing) return;
    const from = card.dataset.pile as PileId;
    const index = Number(card.dataset.index);
    if (index !== pile(this._game, from).length - 1) return;
    const to = foundationFor(this._game, from);
    const next = to && move(this._game, from, index, to);
    if (next) void this.#commit(next);
  };

  /**
   * Press on a face-up card: arm a drag of it and everything on it.
   *
   * Nothing moves until the pointer travels {@link DRAG_THRESHOLD_PX}, so a click that wobbles is
   * still a click. The listeners go on the card itself, which also holds the pointer capture, so
   * the moves and the release keep arriving when the pointer leaves the window.
   * @param event The press.
   */
  #onPointerDown = (event: PointerEvent): void => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.card.up');
    if (!card || !this._game || event.button !== 0 || this.#drag || this._finishing) return;
    const from = card.dataset.pile as PileId;
    const index = Number(card.dataset.index);
    if (!movableRun(this._game, from, index)) return;
    const elements = this.#cardElements()
      .filter((c) => c.dataset.pile === from && Number(c.dataset.index) >= index)
      .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
    const abort = new AbortController();
    this.#drag = {
      pointerId: event.pointerId,
      from,
      index,
      startX: event.clientX,
      startY: event.clientY,
      elements,
      stop: () => abort.abort(),
      active: false,
    };
    try {
      card.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer, as the tests send, has nothing to capture; a real one always does.
    }
    const { signal } = abort;
    card.addEventListener('pointermove', this.#onPointerMove, { signal });
    card.addEventListener('pointerup', this.#onPointerUp, { signal });
    card.addEventListener('pointercancel', this.#onPointerUp, { signal });
    // The browser takes the capture away for reasons that send no cancel (an element removed, a
    // system dialog); without this the cards would stay lifted and every later press be ignored.
    // A normal release also loses capture, but by then the listeners above have been removed.
    card.addEventListener('lostpointercapture', this.#onPointerUp, { signal });
  };

  /**
   * Move the lifted cards with the pointer and light the pile they would land on.
   * @param event The pointer move.
   */
  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.active && this._game) this._legal = this.#legalPiles(this._game, drag);
    drag.active = true;
    for (const el of drag.elements) {
      el.classList.add('lifted');
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(-2deg)`;
    }
    this._dropTarget = this.#targetUnder(drag.elements[0]);
  };

  /**
   * Drop: move if the pile under the cards takes them, otherwise glide back.
   *
   * The snapshot is taken before the transform is cleared, so the cards fly on from where they
   * were let go rather than from where they were picked up. A cancelled pointer (a palm, a system
   * gesture) never moves anything.
   * @param event The release or cancellation.
   */
  #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.stop();
    // Read the target while the drag is still set: #targetUnder uses it.
    const target = drag.active && event.type === 'pointerup' ? this.#targetUnder(drag.elements[0]) : undefined;
    this.#drag = undefined;
    this._dropTarget = undefined;
    this._legal = new Set();
    if (!this._game) return;
    const before = snapshot(this.#cardElements());
    for (const el of drag.elements) {
      el.classList.remove('lifted');
      el.style.transform = '';
    }
    const next = target && move(this._game, drag.from, drag.index, target);
    if (next) {
      void this.#commit(next, 0, before);
    } else if (drag.active) {
      this.#flip(drag.elements, before, 0);
    }
  };

  /**
   * Every pile the lifted cards could be dropped on.
   * @param game The game.
   * @param drag The drag in progress.
   * @returns The piles, none when the run cannot be lifted.
   */
  #legalPiles(game: KlondikeGame, drag: Drag): ReadonlySet<PileId> {
    const run = movableRun(game, drag.from, drag.index);
    if (!run) return new Set();
    return new Set(PILES.filter((id) => id !== drag.from && canDrop(game, run, id)));
  }

  /**
   * The legal pile under the dragged cards' top-left card, if any.
   *
   * Columns reach to the bottom of the table, so a card can be let go anywhere below one rather
   * than having to hit the sliver of the last card. The point tested is the dragged card's centre.
   * @param card The first lifted card.
   * @returns The pile to drop on, or `undefined` when there is none.
   */
  #targetUnder(card: HTMLElement): PileId | undefined {
    const layout = this._layout;
    const drag = this.#drag;
    if (!layout || !this._game || !drag) return undefined;
    const host = this.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const x = rect.left - host.left + rect.width / 2;
    const y = rect.top - host.top + rect.height / 2;
    const run = movableRun(this._game, drag.from, drag.index);
    if (!run) return undefined;
    for (const id of PILES) {
      if (id === 'stock' || id === 'waste' || id === drag.from) continue;
      const at = layout.slot(id);
      const bottom = id[0] === 't' ? layout.height : at.y + layout.cardH;
      if (x >= at.x && x <= at.x + layout.cardW && y >= at.y && y <= bottom && canDrop(this._game, run, id)) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Open the settings modal and start loading the face previews it shows. Asks again whether the
   * Arcade is there, so one that loaded after the window opened is offered as Leaderboard; only ever
   * turned on here, since a panel already placed should not vanish from under the player.
   */
  #openSettings(): void {
    this._settingsOpen = true;
    void this.#loadPreviews();
    void this.scores.reachable().then((here) => {
      if (here) this._arcadeHere = true;
    });
  }

  /**
   * Close the settings modal and give the keyboard back to the gear that opened it, so a keyboard
   * player is not dropped at the start of the page.
   */
  #closeSettings = (): void => {
    this._settingsOpen = false;
    this.shadowRoot?.querySelector<HTMLElement>('.settings')?.focus();
  };

  /**
   * Open the Arcade's leaderboard panel over the table. The panel stops the clock itself, through
   * its `open` event, so a panel that never draws (the Arcade gone since) stops nothing.
   * @param board The board to open it on.
   * @param opener What opened it, which gets the keyboard back when it closes.
   */
  #openPanel(board: string, opener: 'settings' | 'card'): void {
    this._panelBoard = board;
    this.#panelOpener = opener;
    this._panelOpen = true;
  }

  /** The panel opened over the table: stop the clock, remembering whether it ran (settled point 13). */
  #onPanelOpen = (): void => {
    this.#clockBeforePanel = this.#timer !== undefined;
    this.#stopTimer();
  };

  /**
   * The panel closed. `close` always means the player is done with it (Esc, its close button, the
   * scrim): "Open in the Arcade" leaves it open over the stopped game. So carry on timing if the clock
   * was running before, and only a game still being played, and give the keyboard back to what opened
   * it. A `close` that follows New game setting the panel shut finds it already closed and has
   * nothing left to do.
   */
  #onPanelClose = (): void => {
    if (!this._panelOpen) return;
    this._panelOpen = false;
    if (this.#clockBeforePanel && this._game?.status === 'playing') this.#startTimer();
    this.#clockBeforePanel = false;
    const back = this.#panelOpener === 'card' ? 'umbradesktop-arcade-result' : '.settings';
    void this.updateComplete.then(() => this.shadowRoot?.querySelector<HTMLElement>(back)?.focus());
  };

  /**
   * Draw every registered face set's king of spades for the modal.
   *
   * Every module is loaded, but only here, when the modal opens. A loader that rejects (a package
   * whose chunk is gone) gets no preview and does not stop the others or the modal: its choice is
   * still listed, just with an empty thumbnail.
   */
  async #loadPreviews(): Promise<void> {
    const king = { suit: 'S', rank: 13 } as const;
    const results = await Promise.allSettled(
      this._facesManifests.map(async (m) => [m.alias, (await m.loader()).default.render(king)] as const),
    );
    const next = new Map(this._previews);
    for (const result of results) {
      if (result.status === 'fulfilled') next.set(result.value[0], result.value[1]);
    }
    this._previews = next;
  }

  /**
   * What the modal shows for a face set: its loaded preview, or for the one in use, a fresh draw
   * from the set already loaded, so the current choice never waits for the previews.
   * @param alias The face set's alias.
   * @returns SVG markup, or an empty string when there is none.
   */
  #previewFor(alias: string): string {
    if (alias === this._settings.faces && this._faces) return this._faces.render({ suit: 'S', rank: 13 });
    return this._previews.get(alias) ?? '';
  }

  /**
   * Apply a settings change and store it.
   *
   * A back or a face set applies at once; the draw mode is left alone here, because the game
   * under way keeps the mode it was dealt with and the next deal reads the stored setting.
   * @param event The modal's change event, carrying only the fields that changed.
   */
  #onSettingsChange = (event: CustomEvent<Partial<SolitaireSettings>>): void => {
    // Merged into what is stored now, not into what this window read when it opened: another
    // Solitaire window may have changed a different field since, and writing this window's stale
    // copy back would undo it.
    const inUse = this._settings.faces;
    this._settings = { ...readSettings(this.settingsStorage), ...event.detail };
    writeSettings(this._settings, this.settingsStorage);
    // Reloaded whenever the merged face set is not the one drawn, which includes a change another
    // window made and this one is only now learning of, not just one picked in this modal.
    if (this._settings.faces !== inUse) void this.#loadFaces();
  };

  /**
   * Start a new game: forget the save, gather every card into the stock, then deal from it.
   *
   * Gathering first, without animation, is what makes the deal visibly come from the stock. The
   * epoch bump cancels a win still in progress, and the clock restarts with the first move. The last
   * win's card goes, and the panel shuts without restarting the clock it stopped: that was the old game's.
   */
  async #newGame(): Promise<void> {
    this.#epoch++;
    this.#stopTimer();
    this.#stopCascade();
    this.store.remove(this.#id);
    this._won = false;
    this._result = undefined;
    this._awaitingResult = false;
    this._panelOpen = false;
    this.#clockBeforePanel = false;
    this._cascading = false;
    this._finishing = false;
    this._elapsed = 0;
    const dealt = deal(this._settings.drawCount, this.shuffle);
    const all = [dealt.stock, ...dealt.tableau].flat().map((c) => ({ ...c, faceUp: false }));
    this._game = { ...dealt, stock: all, tableau: dealt.tableau.map(() => []) };
    await this.updateComplete;
    await this.#commit(dealt, DEAL_STAGGER_MS);
  }

  /**
   * Start the clock, once, at the first move.
   *
   * One interval rather than a timeout per tick, since every tick is the same length. Each tick
   * charges the rules' time penalty and saves, so a reload loses at most the last second.
   */
  #startTimer(): void {
    if (this.#timer !== undefined) return;
    this.#timer = window.setInterval(() => {
      if (!this._game || this._game.status !== 'playing') return;
      this._game = applyTime(this._game, this._elapsed, this._elapsed + 1);
      this._elapsed++;
      this.store.save(this.#id, { game: this._game, elapsedSeconds: this._elapsed });
    }, this.clockIntervalMs);
  }

  /** Stop the clock and forget the handle so a later start is not suppressed. */
  #stopTimer(): void {
    window.clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /**
   * Play the rest of the game out, lowest card first.
   *
   * Each move goes through `#commit`, so the cards fly exactly as they do for a player's move. The
   * pause between moves is skipped with reduced motion. The last move wins, which ends the loop.
   */
  async #autoFinish(): Promise<void> {
    if (this._finishing) return;
    this._finishing = true;
    const epoch = this.#epoch;
    let step = this._game && nextFinishingMove(this._game);
    while (this._game && step && epoch === this.#epoch) {
      const next = move(this._game, step.from, pile(this._game, step.from).length - 1, step.to);
      if (!next) break;
      await this.#commit(next, 0);
      if (epoch !== this.#epoch) return;
      if (!this.reducedMotion()) await new Promise((r) => setTimeout(r, AUTO_FINISH_STEP_MS));
      step = this._game.status === 'playing' ? nextFinishingMove(this._game) : undefined;
    }
    if (epoch === this.#epoch) this._finishing = false;
  }

  /**
   * The win: stop the clock, add the bonus, forget the save, celebrate.
   *
   * With reduced motion the cascade is skipped and the panel appears at once (design D4). The
   * epoch is checked after each wait so that New game during the cascade wins the race.
   */
  async #win(): Promise<void> {
    const epoch = this.#epoch;
    this.#stopTimer();
    this._game = withTimeBonus(this._game!, this._elapsed);
    // Before the cascade's awaits: a New game started mid-cascade bumps the epoch and returns early,
    // and must not cost the player the score they just won. The game's own draw mode, never the
    // settings', which only apply to the next deal. It asks for the result card's data rather than the
    // Arcade's dialog and toast (design P3, P6). `this._elapsed` is the one `withTimeBonus` just used,
    // so the bonus the card shows is the bonus the score counted.
    this.#bonus = timeBonus(this._elapsed);
    this._awaitingResult = this._arcadeHere;
    if (this._awaitingResult) {
      // A stalled server must not leave the table without a win screen; the epoch keeps this from
      // touching a game dealt since.
      window.setTimeout(() => {
        if (epoch === this.#epoch) this._awaitingResult = false;
      }, this.resultWaitMs);
    }
    void this.scores.submit(solitaireBoard(this._game.drawCount), this._game.score, { showsResult: true }).then((result) => {
      // A New game since has bumped the epoch: the answer belongs to a game no longer on the table.
      if (epoch !== this.#epoch) return;
      this._result = result;
      this._awaitingResult = false;
      // An accepted win proves the Arcade is there, even if it was not when the window opened.
      if (result) this._arcadeHere = true;
    });
    this.store.remove(this.#id);
    this.#cascadeStopped = false;
    if (!this.reducedMotion() && this._layout) {
      this._cascading = true;
      await this.updateComplete;
      const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>('canvas.cascade');
      if (canvas) {
        const cards = await this.#cascadeCards();
        if (epoch !== this.#epoch) return;
        if (!this.#cascadeStopped) {
          const size = { w: this._layout.cardW, h: this._layout.cardH };
          this.#cascade = new WinCascade(canvas, cards, size, {
            schedule: this.cascadeSchedule,
            cancel: this.cascadeCancel,
          });
          await this.#cascade.start();
          this.#cascade = undefined;
        }
      }
      if (epoch !== this.#epoch) return;
      this._cascading = false;
    }
    this._won = true;
  }

  /**
   * End the cascade early, whether it is running or still being built. Safe at any time.
   */
  #stopCascade(): void {
    this.#cascadeStopped = true;
    this.#cascade?.stop();
  }

  /**
   * A key press on the host ends the cascade, the keyboard twin of clicking it.
   */
  #onKeyDown = (): void => {
    if (this._cascading) this.#stopCascade();
  };

  /**
   * Each foundation's cards, king first and round-robin, as decoded images at their foundation.
   *
   * The fronts are the face set's own SVG, so the cascade shows the cards the player has been
   * using. A card whose image will not decode is still launched; the cascade skips it when it
   * cannot draw it.
   * @returns The cards in launch order.
   */
  async #cascadeCards(): Promise<CascadeCard[]> {
    const layout = this._layout!;
    const game = this._game!;
    const pending: Array<Promise<CascadeCard>> = [];
    for (let rank = 13; rank >= 1; rank--) {
      for (let f = 0; f < game.foundations.length; f++) {
        const card = game.foundations[f][rank - 1];
        if (!card) continue;
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.#front(card));
        const at = layout.slot(`f${f}`);
        // Decoded together, not one after another, so the cascade starts in one wait and not 52.
        pending.push(image.decode().then(() => ({ image, x: at.x, y: at.y }), () => ({ image, x: at.x, y: at.y })));
      }
    }
    return Promise.all(pending);
  }

  /**
   * The whole window body: a toolbar, then the table.
   *
   * Slots are drawn for every pile so an empty one is still a place, and are what a click on an
   * empty stock lands on. Cards are rendered in id order, stacked by `z-index` and keyed by id, so
   * a move never reorders the DOM. A face-down card's front is only rendered once it has been seen
   * (the cache check), which leaves the 3D turn a face to turn to without drawing 52 SVGs up front.
   *
   * A win shows the Arcade's card when the Arcade accepted the score, nothing while an Arcade that is
   * there is still answering, and the game's own win screen otherwise. The Arcade's panel is placed
   * only when the Arcade answered, and lies over everything on the felt, toolbar included, as the
   * mock's section 7 shows.
   * @returns The toolbar and the table, or nothing before the first game.
   */
  override render() {
    if (!this._game) return nothing;
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    const game = this._game;
    const layout = this._layout;
    const positions = layout ? cardPositions(game, layout) : new Map<string, { x: number; y: number; z: number }>();
    const back = this.#backUrl();
    const target = this._dropTarget;
    const legal = this._legal;
    const targetTop = target ? pile(game, target).length - 1 : -1;
    // The aliases in use, not the stored ones: a stored alias whose package is gone falls back to
    // Match theme and classic, and the modal must show those as selected.
    const backAlias = this._backs.find((b) => b.alias === this._settings.back)?.alias ?? THEME_BACK_ALIAS;
    const facesAlias =
      this._facesManifests.find((m) => m.alias === this._settings.faces)?.alias ?? CLASSIC_FACES_ALIAS;
    const placed = this.#placed().sort((a, b) => a.card.id.localeCompare(b.card.id));
    return html`
      <div class="felt" style="--card-w:${layout?.cardW ?? 0}px;--card-h:${layout?.cardH ?? 0}px">
        <div class="toolbar">
          <button class="new-game" @click=${() => void this.#newGame()}>${t('solitaireNewGame', 'New game')}</button>
          <div class="stats">
            <span class="score">${t('solitaireScore', 'Score')}<b>${game.score}</b></span>
            <span class="time">${t('solitaireTime', 'Time')}<b>${this.#clock()}</b></span>
            <span class="moves">${t('solitaireMoves', 'Moves')}<b>${game.moves}</b></span>
          </div>
          <button
            class="settings"
            aria-label=${t('solitaireSettings', 'Settings')}
            aria-expanded=${String(this._settingsOpen)}
            @click=${() => this.#openSettings()}
          >
            ${unsafeSVG(GEAR)}
          </button>
        </div>
        <div
          class="table"
          role="group"
          aria-label=${t('solitaireTable', 'Card table')}
          @click=${this.#onCardClick}
          @dblclick=${this.#onDoubleClick}
          @pointerdown=${this.#onPointerDown}
        >
          ${layout
            ? PILES.map((id) => {
                const at = layout.slot(id);
                return html`<div
                  class=${classMap({ slot: true, legal: legal.has(id), target: this._dropTarget === id })}
                  data-slot=${id}
                  style="left:${at.x}px;top:${at.y}px"
                  @click=${id === 'stock' ? () => this.#draw() : nothing}
                ></div>`;
              })
            : nothing}
          ${repeat(
            placed,
            (p) => p.card.id,
            (p) => {
              const at = positions.get(p.card.id);
              const top = p.index === pile(game, p.pile).length - 1;
              return html`<div
                class=${classMap({
                  card: true,
                  up: p.card.faceUp,
                  target: p.pile === target && p.index === targetTop,
                  legal: top && legal.has(p.pile),
                })}
                data-id=${p.card.id}
                data-pile=${p.pile}
                data-index=${p.index}
                aria-label=${this.#cardName(p.card)}
                role="img"
                style="left:${at?.x ?? 0}px;top:${at?.y ?? 0}px;--z:${at?.z ?? 0}"
              >
                <div class="inner">
                  <div class="front">
                    ${p.card.faceUp || this.#faceCache.has(p.card.id) ? unsafeSVG(this.#front(p.card)) : nothing}
                  </div>
                  <div class="back"><img src=${back} alt="" draggable="false" /></div>
                </div>
              </div>`;
            },
          )}
        </div>
        ${canAutoFinish(game) && !this._finishing && !this._won
          ? html`<button class="auto-finish" @click=${() => void this.#autoFinish()}>
              ${t('solitaireAutoFinish', 'Finish')}
            </button>`
          : nothing}
        ${this._cascading
          ? html`<canvas class="cascade" tabindex="-1" @click=${() => this.#stopCascade()}></canvas>`
          : nothing}
        ${this._won && this._result
          ? html`<umbradesktop-arcade-result
              tabindex="-1"
              .result=${this._result}
              @leaderboard=${(event: CustomEvent<{ board: string }>) => this.#openPanel(event.detail.board, 'card')}
              @play-again=${() => void this.#newGame()}
            >
              ${this.#bonus > 0
                ? html`<span slot="detail">${this.#bonusLine()}</span>`
                : nothing}
            </umbradesktop-arcade-result>`
          : this._won && !this._awaitingResult
          ? html`<div class="win" role="status">
              <h2>${t('solitaireWon', 'You won')}</h2>
              <p>
                ${t('solitaireScore', 'Score')} <b>${game.score}</b> &middot; ${t('solitaireTime', 'Time')}
                <b>${this.#clock()}</b>
              </p>
              <button class="play-again" @click=${() => void this.#newGame()}>
                ${t('solitairePlayAgain', 'Play again')}
              </button>
            </div>`
          : nothing}
        ${this._settingsOpen
          ? html`<umbradesktop-solitaire-settings
              data-umbradesktop-theme=${this.theme ?? nothing}
              .drawCount=${this._settings.drawCount}
              .backs=${this._backs.map((b) => ({
                alias: b.alias,
                label: b.meta.label,
                image: backImageFor(b.meta.image, this.theme),
              }))}
              .faces=${this._facesManifests.map((f) => ({
                alias: f.alias,
                label: f.meta.label,
                preview: this.#previewFor(f.alias),
              }))}
              .selectedBack=${backAlias}
              .selectedFaces=${facesAlias}
              .showLeaderboard=${this._arcadeHere}
              @solitaire-settings-change=${this.#onSettingsChange}
              @solitaire-settings-close=${this.#closeSettings}
              @solitaire-settings-leaderboard=${() => {
                this.#closeSettings();
                // The game's own draw mode, never the dialog's, which is the next game's.
                this.#openPanel(solitaireBoard(game.drawCount), 'settings');
              }}
            ></umbradesktop-solitaire-settings>`
          : nothing}
        ${this._arcadeHere
          ? html`<umbradesktop-arcade-leaderboard
              game=${SOLITAIRE_GAME_ALIAS}
              board=${this._panelBoard}
              ?open=${this._panelOpen}
              @open=${this.#onPanelOpen}
              @close=${this.#onPanelClose}
            ></umbradesktop-arcade-leaderboard>`
          : nothing}
      </div>
    `;
  }

  /**
   * The table and the cards.
   *
   * The felt colours are the one thing hardcoded per theme: `docs/desktop-apps.md` §4 stops at the
   * surface an app sits on, and a theme has no opinion about what a card table looks like. Sizes
   * that script also needs come from `constants.ts`, so the toolbar height the layout reserves and
   * the one drawn here are the same number. The toolbar is translucent pills on the felt (design
   * D8), so it reads the theme's font but not its surfaces, and only Windows 98, whose controls are
   * bevelled everywhere, swaps the pills for grey bevelled buttons. The settings modal, unlike the
   * toolbar, does read the app tokens. `.table` is its own stacking context: the cards' z-indices
   * run to 52 and lifted cards far higher, and without the isolation they would paint over, and
   * take the clicks of, everything above them: the toolbar, the cascade, the win panel and the modal.
   * The same isolation is what lets the Arcade's card and panel, which set their own z-index (5 and
   * 6) and fill the felt, lie over the cards; they sit above the toolbar (2) too, so their scrim dims it.
   */
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      user-select: none;
      font-family: var(--umbradesktop-app-font, inherit);
      --felt: radial-gradient(120% 90% at 50% 20%, #2c3d86 0%, #1b264f 55%, #0f1636 100%);
    }
    :host([data-umbradesktop-theme='umbraco4']) {
      --felt: radial-gradient(120% 90% at 50% 20%, #4f8a63 0%, #356447 55%, #20402c 100%);
    }
    :host([data-umbradesktop-theme='macos']) {
      --felt: radial-gradient(120% 90% at 50% 20%, #2f5e86 0%, #1e3d5c 55%, #122740 100%);
    }
    :host([data-umbradesktop-theme='win11']) {
      --felt: radial-gradient(120% 90% at 50% 20%, #13896a 0%, #0c5c48 55%, #073a2e 100%);
    }
    :host([data-umbradesktop-theme='win98']) {
      --felt: #008000;
    }
    .felt {
      position: absolute;
      inset: 0;
      background: var(--felt);
    }
    .felt::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.35;
      mix-blend-mode: overlay;
      background-image: url("${unsafeCSS(NOISE_SVG)}");
    }
    :host([data-umbradesktop-theme='win98']) .felt::before {
      display: none;
    }
    .felt::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      box-shadow: inset 0 0 120px rgb(0 0 0 / 35%);
    }
    .toolbar {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: ${unsafeCSS(TOOLBAR_HEIGHT_PX)}px;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      color: #eef0ff;
      font-family: var(--umbradesktop-app-font, inherit);
    }
    .toolbar button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      border: 0;
      border-radius: 999px;
      padding: 6px 12px;
      background: rgb(255 255 255 / 10%);
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 14%);
    }
    .toolbar button:hover {
      background: rgb(255 255 255 / 18%);
    }
    .toolbar button:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .settings {
      display: flex;
      padding: 6px 8px;
    }
    .settings svg {
      width: 17px;
      height: 17px;
    }
    .stats {
      display: flex;
      gap: 16px;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .stats b {
      margin-left: 6px;
      font-weight: 600;
      color: #fff;
    }
    .table {
      position: absolute;
      inset: 0;
      z-index: 1;
      isolation: isolate;
    }
    .slot {
      position: absolute;
      width: var(--card-w);
      height: var(--card-h);
      border-radius: calc(var(--card-w) * ${unsafeCSS(CARD_RADIUS_RATIO)});
      box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 16%);
      background: rgb(0 0 0 / 12%);
    }
    .slot[data-slot='stock'] {
      cursor: pointer;
    }
    .slot.legal,
    .card.legal {
      box-shadow: 0 0 0 1.5px rgb(245 193 188 / 40%), 0 0 12px rgb(245 193 188 / 18%);
    }
    .slot.target,
    .card.target {
      box-shadow: 0 0 0 2px rgb(245 193 188 / 85%), 0 0 22px rgb(245 193 188 / 45%);
    }
    .card {
      position: absolute;
      width: var(--card-w);
      height: var(--card-h);
      perspective: 800px;
      touch-action: none;
      z-index: var(--z);
      border-radius: calc(var(--card-w) * ${unsafeCSS(CARD_RADIUS_RATIO)});
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 25%)) drop-shadow(0 3px 6px rgb(0 0 0 / 22%));
    }
    .card.up {
      cursor: grab;
    }
    .card.flying {
      z-index: calc(var(--z) + 100);
    }
    .card.lifted {
      cursor: grabbing;
      filter: drop-shadow(0 18px 18px rgb(0 0 0 / 40%)) drop-shadow(0 4px 6px rgb(0 0 0 / 25%));
      z-index: calc(var(--z) + 1000);
    }
    .inner {
      position: absolute;
      inset: 0;
      transform-style: preserve-3d;
      transform: rotateY(180deg);
      transition: transform ${unsafeCSS(FLIP_MS)}ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .card.up .inner {
      transform: none;
    }
    .front,
    .back {
      position: absolute;
      inset: 0;
      backface-visibility: hidden;
    }
    .front svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .back {
      transform: rotateY(180deg);
      background: #fff;
      border-radius: calc(var(--card-w) * ${unsafeCSS(CARD_RADIUS_RATIO)});
      padding: calc(var(--card-w) * 0.05);
      box-sizing: border-box;
    }
    .back img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      border-radius: calc(var(--card-w) * 0.04);
    }
    .auto-finish {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      z-index: 3;
      font: inherit;
      font-family: var(--umbradesktop-app-font, inherit);
      color: #eef0ff;
      cursor: pointer;
      border: 0;
      border-radius: 999px;
      padding: 8px 18px;
      background: rgb(255 255 255 / 16%);
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 24%);
    }
    .auto-finish:hover {
      background: rgb(255 255 255 / 26%);
    }
    .auto-finish:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    canvas.cascade {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 10;
      cursor: pointer;
      outline: none;
    }
    .win {
      font-family: var(--umbradesktop-app-font, inherit);
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 15;
      min-width: 220px;
      padding: 18px 28px;
      text-align: center;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: calc(var(--umbradesktop-app-radius, 3px) * 3);
      box-shadow: 0 30px 70px rgb(0 0 0 / 45%);
    }
    .win h2 {
      margin: 0 0 8px;
      font-size: 20px;
    }
    .win p {
      margin: 0 0 14px;
    }
    .win button {
      font: inherit;
      cursor: pointer;
      padding: 6px 16px;
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
      color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
      border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px);
    }
    .win button:focus-visible {
      outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      outline-offset: 2px;
    }
    /* Windows 98: the same bevel Minesweeper draws, on the pills and on the panel. */
    :host([data-umbradesktop-theme='win98']) .toolbar button,
    :host([data-umbradesktop-theme='win98']) .auto-finish,
    :host([data-umbradesktop-theme='win98']) .win,
    :host([data-umbradesktop-theme='win98']) .win button {
      background: #c0c0c0;
      color: #000;
      border: 0;
      border-radius: 0;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .toolbar button:hover,
    :host([data-umbradesktop-theme='win98']) .auto-finish:hover {
      background: #c0c0c0;
    }
    @media (prefers-reduced-motion: reduce) {
      .inner {
        transition: none;
      }
    }
  `;
}

/** The settings gear, drawn to match the toolbar's text size. */
const GEAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 ' +
  '3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 ' +
  '1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.5-1c-1.6.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 ' +
  '1.7 0 0 0 1.1-2.5c-.9-1.6.8-3.3 2.4-2.4a1.7 1.7 0 0 0 2.5-1.1z"/><circle cx="12" cy="12" r="3"/></svg>';

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-solitaire': SolitaireElement;
  }
}

export { SolitaireElement as element };
