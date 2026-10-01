/**
 * Klondike's rules, as pure functions over one immutable game value.
 *
 * Same shape as Minesweeper's and Snake's `rules.ts`: no DOM, no timer, no `Math.random` on
 * any path a test takes. The shuffle is injected, so a test can deal an unshuffled deck and know
 * where every card is. Every transition returns a new game without mutating anything, so the
 * element can hold the whole game in one `@state()` field and re-render on assignment.
 *
 * Piles are bottom-first arrays (stock, waste, foundations, tableau columns), so the top card
 * is always the last element. This makes appending cheaper than prepending and lets us avoid
 * reversing on the fly.
 */
import {
  SCORE,
  SOLITAIRE_COLUMNS,
  SOLITAIRE_FOUNDATIONS,
  TIME_BONUS_MIN_S,
  TIME_BONUS_NUMERATOR,
  TIME_PENALTY_EVERY_S,
} from './constants.js';

/** Spades, hearts, diamonds, clubs. */
export type Suit = 'S' | 'H' | 'D' | 'C';

/**
 * Every suit, in deck order. Spades and clubs are black; hearts and diamonds are red.
 * The order is stable across games so identical shuffles produce identical deals.
 */
export const SUITS: ReadonlyArray<Suit> = ['S', 'H', 'D', 'C'];

/** How many cards one click on the stock turns over. */
export type DrawCount = 1 | 3;

/** One card. `id` is rank then suit (`'1S'` to `'13C'`), unique and stable across games. */
export interface Card {
  readonly id: string;
  readonly suit: Suit;
  /** 1 (ace) to 13 (king). */
  readonly rank: number;
  readonly faceUp: boolean;
}

/** A pile: stock, waste, a foundation `f0`-`f3` or a tableau column `t0`-`t6`. */
export type PileId = 'stock' | 'waste' | `f${number}` | `t${number}`;

/** Orders a deck. Returns a new array. */
export type Shuffler = (cards: ReadonlyArray<Card>) => Card[];

/** A whole game. Every pile is bottom-first: the top card is the last element. */
export interface KlondikeGame {
  readonly stock: ReadonlyArray<Card>;
  readonly waste: ReadonlyArray<Card>;
  readonly foundations: ReadonlyArray<ReadonlyArray<Card>>;
  readonly tableau: ReadonlyArray<ReadonlyArray<Card>>;
  readonly drawCount: DrawCount;
  readonly score: number;
  readonly moves: number;
  readonly status: 'playing' | 'won';
}

/**
 * Whether a suit is red.
 * @param suit The suit.
 * @returns True for hearts and diamonds.
 */
export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

/**
 * The 52 cards, face down, spades to clubs, ace to king.
 * @returns A new deck.
 */
export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({
      id: `${i + 1}${suit}`,
      suit,
      rank: i + 1,
      faceUp: false,
    })),
  );
}

/**
 * A Fisher-Yates shuffle driven by mulberry32.
 *
 * Given the same seed, this always produces the same permutation. The mulberry32 PRG is
 * fast, short, and produces good distribution without requiring state arrays or multiplies
 * that ES2020 would struggle with across platforms.
 * @param seed Any 32-bit integer.
 * @returns A shuffler function.
 */
export function seededShuffle(seed: number): Shuffler {
  return (cards) => {
    let state = seed >>> 0;
    const random = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...cards];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
}

/**
 * The shuffle a real game uses: seeded shuffle with a random seed.
 *
 * Injected into tests so they can use `seededShuffle` for deterministic decks, but callers
 * who care about unpredictability use this.
 */
export const randomShuffle: Shuffler = (cards) =>
  seededShuffle(Math.floor(Math.random() * 2 ** 32))(cards);

/**
 * A new game: column `n` gets `n + 1` cards with only the last face up.
 *
 * The remaining 24 cards go into the stock, face down. Foundations start empty.
 * @param drawCount Draw 1 or Draw 3.
 * @param shuffle How to order the deck.
 * @returns The dealt game.
 */
export function deal(drawCount: DrawCount, shuffle: Shuffler): KlondikeGame {
  const deck = shuffle(createDeck()).map((card) => ({
    ...card,
    faceUp: false,
  }));
  let next = 0;
  const tableau = Array.from({ length: SOLITAIRE_COLUMNS }, (_, column) => {
    const cards = deck.slice(next, next + column + 1);
    next += column + 1;
    return cards.map((card, i) => (i === column ? { ...card, faceUp: true } : card));
  });
  return {
    stock: deck.slice(next),
    waste: [],
    foundations: Array.from({ length: SOLITAIRE_FOUNDATIONS }, () => []),
    tableau,
    drawCount,
    score: 0,
    moves: 0,
    status: 'playing',
  };
}

/**
 * The cards in a pile, bottom first.
 * @param game The game.
 * @param id The pile.
 * @returns Its cards; an unknown index reads as empty.
 */
export function pile(game: KlondikeGame, id: PileId): ReadonlyArray<Card> {
  if (id === 'stock') return game.stock;
  if (id === 'waste') return game.waste;
  const index = Number(id.slice(1));
  return (id[0] === 'f' ? game.foundations[index] : game.tableau[index]) ?? [];
}

/**
 * The game with one pile replaced.
 *
 * Used internally to apply moves without mutating the game value.
 * @param game The game.
 * @param id The pile to replace.
 * @param cards Its new cards.
 * @returns A new game.
 */
function withPile(
  game: KlondikeGame,
  id: PileId,
  cards: ReadonlyArray<Card>,
): KlondikeGame {
  if (id === 'stock') return { ...game, stock: cards };
  if (id === 'waste') return { ...game, waste: cards };
  const index = Number(id.slice(1));
  if (id[0] === 'f') {
    return {
      ...game,
      foundations: game.foundations.map((f, i) => (i === index ? cards : f)),
    };
  }
  return {
    ...game,
    tableau: game.tableau.map((t, i) => (i === index ? cards : t)),
  };
}

/**
 * The game with points added, floored at zero.
 *
 * Windows Solitaire never goes below zero. This helper is internal; moves and time
 * penalties both use it.
 * @param game The game.
 * @param delta Points, possibly negative.
 * @returns A new game.
 */
function addScore(game: KlondikeGame, delta: number): KlondikeGame {
  return delta === 0 ? game : { ...game, score: Math.max(0, game.score + delta) };
}

/**
 * A click on the stock: turn one or three onto the waste, or recycle it when stock is empty.
 * @param game The game.
 * @returns The next game, or the same object when there is nothing to do.
 */
export function draw(game: KlondikeGame): KlondikeGame {
  if (game.status !== 'playing') return game;
  if (game.stock.length === 0) {
    if (game.waste.length === 0) return game;
    const recycled: KlondikeGame = {
      ...game,
      stock: [...game.waste].reverse().map((c) => ({ ...c, faceUp: false })),
      waste: [],
      moves: game.moves + 1,
    };
    return game.drawCount === 1
      ? addScore(recycled, SCORE.recycleDrawOne)
      : recycled;
  }
  const count = Math.min(game.drawCount, game.stock.length);
  const taken = game.stock
    .slice(-count)
    .reverse()
    .map((c) => ({ ...c, faceUp: true }));
  return {
    ...game,
    stock: game.stock.slice(0, -count),
    waste: [...game.waste, ...taken],
    moves: game.moves + 1,
  };
}

/**
 * Whether two cards stack in a column: opposite colour, one rank lower.
 *
 * Tableau stacking is what makes a sequence valid for bulk moves. The check is strict:
 * spades/clubs on hearts/diamonds, or vice versa, with the lower card one rank less.
 * @param lower The card placed on top.
 * @param upper The card it goes on.
 * @returns True when legal.
 */
function stacks(lower: Card, upper: Card): boolean {
  return (
    isRed(lower.suit) !== isRed(upper.suit) &&
    lower.rank === upper.rank - 1
  );
}

/**
 * The cards a player may lift from a pile, starting at `index`.
 *
 * From the waste or a foundation only the top card; from a column any face-up card and
 * everything on it, provided that is a valid sequence; never from the stock.
 * @param game The game.
 * @param from The pile.
 * @param index Position of the lowest card to lift.
 * @returns The run, or `undefined` when it cannot be lifted.
 */
export function movableRun(
  game: KlondikeGame,
  from: PileId,
  index: number,
): ReadonlyArray<Card> | undefined {
  const cards = pile(game, from);
  if (from === 'stock' || index < 0 || index >= cards.length) return undefined;
  if (from[0] !== 't' && index !== cards.length - 1) return undefined;
  const run = cards.slice(index);
  if (!run.every((c) => c.faceUp)) return undefined;
  for (let i = 1; i < run.length; i++) {
    if (!stacks(run[i], run[i - 1])) return undefined;
  }
  return run;
}

/**
 * Whether a run may land on a pile.
 * @param game The game.
 * @param run The lifted cards, lowest first.
 * @param to The target pile.
 * @returns True when legal.
 */
export function canDrop(
  game: KlondikeGame,
  run: ReadonlyArray<Card>,
  to: PileId,
): boolean {
  if (to === 'stock' || to === 'waste' || run.length === 0) return false;
  const cards = pile(game, to);
  const first = run[0];
  if (to[0] === 'f') {
    if (run.length !== 1) return false;
    const top = cards[cards.length - 1];
    return top
      ? top.suit === first.suit && first.rank === top.rank + 1
      : first.rank === 1;
  }
  // Tableau: drop only on empty or on a face-up card one rank higher of opposite colour.
  const top = cards[cards.length - 1];
  return top ? top.faceUp && stacks(first, top) : first.rank === 13;
}

/**
 * Move a run, score it, turn over whatever it uncovered, and check for the win.
 * @param game The game.
 * @param from The pile the run leaves.
 * @param index Position of its lowest card.
 * @param to Where it goes.
 * @returns The next game, or `undefined` when the move is illegal.
 */
export function move(
  game: KlondikeGame,
  from: PileId,
  index: number,
  to: PileId,
): KlondikeGame | undefined {
  if (game.status !== 'playing' || from === to) return undefined;
  // Refuse foundation-to-foundation moves.
  if (from[0] === 'f' && to[0] === 'f') return undefined;
  const run = movableRun(game, from, index);
  if (!run || !canDrop(game, run, to)) return undefined;
  let next = withPile(
    withPile(game, from, pile(game, from).slice(0, index)),
    to,
    [...pile(game, to), ...run],
  );
  next = { ...next, moves: game.moves + 1 };
  let delta = 0;
  if (to[0] === 'f') delta += SCORE.toFoundation;
  else if (from === 'waste') delta += SCORE.wasteToTableau;
  else if (from[0] === 'f') delta += SCORE.foundationToTableau;
  if (from[0] === 't') {
    const left = pile(next, from);
    const top = left[left.length - 1];
    if (top && !top.faceUp) {
      next = withPile(next, from, [
        ...left.slice(0, -1),
        { ...top, faceUp: true },
      ]);
      delta += SCORE.turnOver;
    }
  }
  next = addScore(next, delta);
  return next.foundations.every((f) => f.length === 13)
    ? { ...next, status: 'won' }
    : next;
}

/**
 * The foundation a pile's top card can go to, for double-click auto-move.
 * @param game The game.
 * @param from The pile.
 * @returns The first foundation that accepts it, or `undefined`.
 */
export function foundationFor(
  game: KlondikeGame,
  from: PileId,
): PileId | undefined {
  const cards = pile(game, from);
  const run = movableRun(game, from, cards.length - 1);
  if (!run) return undefined;
  for (let f = 0; f < SOLITAIRE_FOUNDATIONS; f++) {
    const id: PileId = `f${f}`;
    if (canDrop(game, run, id)) return id;
  }
  return undefined;
}

/**
 * Whether the rest of the game is a formality: nothing in stock or waste, nothing face down.
 * @param game The game.
 * @returns True when auto-finish may be offered.
 */
export function canAutoFinish(game: KlondikeGame): boolean {
  return (
    game.status === 'playing' &&
    game.stock.length === 0 &&
    game.waste.length === 0 &&
    game.tableau.some((column) => column.length > 0) &&
    game.tableau.every((column) => column.every((c) => c.faceUp))
  );
}

/**
 * The next auto-finish move: the lowest-ranked column top that can go home.
 * @param game The game.
 * @returns The move, or `undefined` when none can.
 */
export function nextFinishingMove(
  game: KlondikeGame,
): { from: PileId; to: PileId } | undefined {
  let best: { from: PileId; to: PileId; rank: number } | undefined;
  game.tableau.forEach((column, t) => {
    const top = column[column.length - 1];
    if (!top) return;
    const from: PileId = `t${t}`;
    const to = foundationFor(game, from);
    if (to && (!best || top.rank < best.rank)) {
      best = { from, to, rank: top.rank };
    }
  });
  return best && { from: best.from, to: best.to };
}

/**
 * The time penalty for a stretch of play: 2 points for each 10-second boundary crossed.
 * @param game The game.
 * @param fromSeconds Elapsed seconds before.
 * @param toSeconds Elapsed seconds after.
 * @returns The game with the penalty charged.
 */
export function applyTime(
  game: KlondikeGame,
  fromSeconds: number,
  toSeconds: number,
): KlondikeGame {
  if (game.status !== 'playing') return game;
  const steps =
    Math.floor(toSeconds / TIME_PENALTY_EVERY_S) -
    Math.floor(fromSeconds / TIME_PENALTY_EVERY_S);
  return steps > 0 ? addScore(game, steps * SCORE.timePenalty) : game;
}

/**
 * The win bonus.
 * @param seconds Seconds the game took.
 * @returns 700000 / seconds, rounded down, from 30 seconds on; otherwise 0.
 */
export function timeBonus(seconds: number): number {
  return seconds >= TIME_BONUS_MIN_S
    ? Math.floor(TIME_BONUS_NUMERATOR / seconds)
    : 0;
}

/**
 * The game with its win bonus added.
 * @param game A won game.
 * @param seconds Seconds it took.
 * @returns The game with the bonus in its score.
 */
export function withTimeBonus(
  game: KlondikeGame,
  seconds: number,
): KlondikeGame {
  return addScore(game, timeBonus(seconds));
}

/**
 * Whether a value read back from storage is a whole, sane game.
 *
 * 52 distinct cards across 13 piles, a known draw count and status, and each card's suit
 * and rank matching its id. Returns false (never throws) on untrusted data: null cards,
 * arrays that are not arrays, missing fields, invalid enum values.
 * @param value The parsed value.
 * @returns True when it can be played.
 */
export function isKlondikeGame(value: unknown): value is KlondikeGame {
  if (!value || typeof value !== 'object') return false;
  const g = value as Partial<KlondikeGame>;
  if (g.drawCount !== 1 && g.drawCount !== 3) return false;
  if (g.status !== 'playing' && g.status !== 'won') return false;
  if (typeof g.score !== 'number' || typeof g.moves !== 'number') return false;
  if (
    !Array.isArray(g.stock) ||
    !Array.isArray(g.waste) ||
    !Array.isArray(g.foundations) ||
    !Array.isArray(g.tableau)
  ) {
    return false;
  }
  if (
    g.foundations.length !== SOLITAIRE_FOUNDATIONS ||
    g.tableau.length !== SOLITAIRE_COLUMNS
  ) {
    return false;
  }
  // Check all piles are arrays and all cards are non-null objects.
  if (!g.foundations.every((f) => Array.isArray(f))) return false;
  if (!g.tableau.every((t) => Array.isArray(t))) return false;
  const allCards = [g.stock, g.waste, ...g.foundations, ...g.tableau];
  for (const p of allCards) {
    for (const c of p) {
      if (!c || typeof c !== 'object') return false;
    }
  }
  // Check each card's suit and rank match its id.
  const all = allCards.flat() as Card[];
  for (const c of all) {
    const { id, suit, rank } = c;
    if (id !== `${rank}${suit}`) return false;
    if (suit !== 'S' && suit !== 'H' && suit !== 'D' && suit !== 'C') {
      return false;
    }
    if (rank < 1 || rank > 13) return false;
  }
  // Check all 52 cards are present and valid.
  const valid = new Set(createDeck().map((c) => c.id));
  return (
    all.length === 52 &&
    new Set(all.map((c) => c?.id)).size === 52 &&
    all.every((c) => valid.has(c.id) && typeof c.faceUp === 'boolean')
  );
}
