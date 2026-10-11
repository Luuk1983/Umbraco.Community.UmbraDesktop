# Solitaire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klondike Solitaire as the third game in the UmbraDesktop Entertainment package, per
[`2026-09-30-solitaire-design.md`](./2026-09-30-solitaire-design.md) (referred to below as "the
design", decisions D1 to D12).

**Architecture:** Pure rules and pure layout maths, each tested without a DOM, under a Lit element
that renders every card as a keyed absolutely-positioned DOM node and animates every state change
with one FLIP step. A canvas exists only for the win cascade. Card backs and face sets are two
manifest types this package declares, and the built-in ones are registered through them.

**Tech Stack:** TypeScript, Lit (via `@umbraco-cms/backoffice`), Web Animations API, web-test-runner
with `@open-wc/testing` in real Chrome, Vite. Build scripts use `sharp` (card backs) and `svgo`
(court art).

---

## Ground rules for whoever executes this

- **Never commit.** The repository owner reviews one diff. Where a normal plan says "commit", this
  one says "leave uncommitted". Also no `git push`, no PR. This overrides any skill that says to
  commit.
- **Tests first, every time.** Write the test, run it, watch it fail for the reason you expect, then
  implement. `CLAUDE.md` insists and it has caught real bugs here.
- **JSDoc on everything, including private members**, saying why the code exists. Match the density
  of `src/Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/snake/*.ts`. The code blocks
  below carry shorter comments than the finished files should; expand them to that standard.
- **Derive numbers, never type them.** Every number that CSS and script share lives in
  `solitaire/constants.ts`.
- **Target ES2020.** `tsconfig.json` sets `lib: ES2020`, so no `Array.prototype.at`, no
  `Object.hasOwn`, no `structuredClone` in typed code.
- **Run both** `npm test` and `npm run build` in the Entertainment package before calling any task
  done. The test runner does not type-check and `tsc` does not render.
- **Test runner traps** (from earlier builds): run with `--concurrency 2` if the suite stalls; a
  failing `expect(el).to.equal(null)` can hang the runner, so compare to `undefined` or booleans;
  fixtures stall in background tabs.

All paths below are relative to `src/Umbraco.Community.UmbraDesktop.Entertainment/` unless they
start with `docs/` or name another project. All commands run from that folder.

```bash
npm test
npm run build
```

## File map

```
backoffice/
  art/fomin/                         court card sources (CC0) + SOURCES.md          (Task 9)
  public/solitaire/backs/win98.svg   the one hand-drawn back, committed             (Task 8)
  public/solitaire/backs/*.avif      wallpaper crops, generated, gitignored         (Task 8)
  scripts/build-card-backs.mjs       crops the host's wallpaper PNGs                (Task 8)
  scripts/build-courts.mjs           optimises + recolours the court art            (Task 9)
  src/solitaire/
    constants.ts                     every shared number                            (Task 1)
    rules.ts / rules.test.ts         the game, pure                                 (Tasks 1-4)
    layout.ts / layout.test.ts       where every card sits, pure                    (Task 5)
    settings.ts / settings.test.ts   per-browser settings                           (Task 6)
    saved-games.ts / .test.ts        per-tab unfinished games (D10)                 (Task 6)
    extensions.ts / .test.ts         the two manifest types (D11)                   (Task 7)
    backs.ts                         built-in backs and faces as manifests          (Task 7)
    faces/classic/suits.ts           suit paths, the logomark                       (Task 10)
    faces/classic/courts.generated.ts   output of build-courts.mjs, committed       (Task 9)
    faces/classic/classic.ts / .test.ts  the default face set                       (Task 10)
    motion.ts / motion.test.ts       FLIP                                           (Task 11)
    cascade.ts / cascade.test.ts     the win cascade                                (Task 11)
    settings-modal.element.ts / .test.ts                                            (Task 12)
    solitaire.element.ts / .test.ts                                                 (Tasks 13-16)
  src/bundle.manifests.ts / .test.ts  register it all                               (Task 17)
  src/localization/en.ts, nl.ts                                                     (Task 17)
package.json                          sharp, svgo, build script                     (Task 8)
```

---

### Task 1: Constants, deck and deal

**Files:**
- Create: `backoffice/src/solitaire/constants.ts`
- Create: `backoffice/src/solitaire/rules.ts`
- Test: `backoffice/src/solitaire/rules.test.ts`

- [ ] **Step 1: Write the constants** (no behaviour to test yet; the tests below read them)

```ts
// backoffice/src/solitaire/constants.ts
/**
 * Every number Solitaire needs in more than one place: the rules, the layout, the element's CSS and
 * the manifest all read from here, never from literals. Separate from `rules.ts` so the manifest can
 * import sizes without pulling the lazy-loaded game into the main chunk, as Snake's does.
 */

/** Columns in the tableau. */
export const SOLITAIRE_COLUMNS = 7;
/** Foundation piles. */
export const SOLITAIRE_FOUNDATIONS = 4;

/** A card's height over its width: the poker-card proportion the SVG faces are drawn at (100 x 140). */
export const CARD_RATIO = 1.4;
/** Smallest card width in px: the corner index is still readable at this size. */
export const CARD_MIN_WIDTH_PX = 64;
/** Largest card width in px: past this the cards only get bigger, not clearer. */
export const CARD_MAX_WIDTH_PX = 132;
/** Card width the window opens at. */
export const CARD_DEFAULT_WIDTH_PX = 100;

/** Gap between columns, as a fraction of the card width. */
export const COLUMN_GAP_RATIO = 0.18;
/** Gap between the top row and the tableau, as a fraction of the card height. */
export const ROW_GAP_RATIO = 0.2;
/** Vertical step between face-down cards in a column, as a fraction of the card height. */
export const FAN_DOWN_RATIO = 0.1;
/** Preferred vertical step between face-up cards, as a fraction of the card height. */
export const FAN_UP_RATIO = 0.25;
/** The face-up step never compresses below this, so a rank stays visible. */
export const FAN_UP_MIN_RATIO = 0.14;
/** Horizontal step of the three visible waste cards in Draw 3, as a fraction of the card width. */
export const WASTE_FAN_RATIO = 0.18;
/** How much taller than two cards the tableau is guaranteed to be, in card heights, for sizing. */
export const TABLEAU_MIN_CARDS = 2.2;

/** Padding around the table in px. */
export const TABLE_PADDING_PX = 16;
/** Height of the toolbar (New game, stats, settings) in px. */
export const TOOLBAR_HEIGHT_PX = 44;

/** One card move, in ms. */
export const MOVE_MS = 260;
/** Delay between cards moving together, in ms. */
export const STAGGER_MS = 35;
/** Delay between cards while dealing, in ms. */
export const DEAL_STAGGER_MS = 28;
/** A card turning over, in ms. */
export const FLIP_MS = 220;
/** Pause between auto-finish moves, in ms. */
export const AUTO_FINISH_STEP_MS = 110;
/** Pointer travel in px before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

/** Windows standard scoring (design D2). */
export const SCORE = {
  wasteToTableau: 5,
  toFoundation: 10,
  turnOver: 5,
  foundationToTableau: -15,
  recycleDrawOne: -100,
  timePenalty: -2,
} as const;
/** The time penalty is charged once per this many seconds of play. */
export const TIME_PENALTY_EVERY_S = 10;
/** The win bonus is this divided by the seconds taken. */
export const TIME_BONUS_NUMERATOR = 700_000;
/** No bonus below this many seconds, as in the original. */
export const TIME_BONUS_MIN_S = 30;

/**
 * Table width for a card width: seven columns, six gaps, padding both sides.
 * @param cardW Card width in px.
 * @returns Content width in px.
 */
export function tableWidthFor(cardW: number): number {
  return SOLITAIRE_COLUMNS * cardW + (SOLITAIRE_COLUMNS - 1) * cardW * COLUMN_GAP_RATIO + TABLE_PADDING_PX * 2;
}

/**
 * Table height for a card width: toolbar, padding, the top row, the row gap and a tableau of
 * {@link TABLEAU_MIN_CARDS} card heights.
 * @param cardW Card width in px.
 * @returns Content height in px.
 */
export function tableHeightFor(cardW: number): number {
  const cardH = cardW * CARD_RATIO;
  return TOOLBAR_HEIGHT_PX + TABLE_PADDING_PX * 2 + cardH + cardH * ROW_GAP_RATIO + cardH * TABLEAU_MIN_CARDS;
}

/** The content box the window opens at (the host adds its chrome). */
export const SOLITAIRE_CONTENT_SIZE = {
  w: Math.ceil(tableWidthFor(CARD_DEFAULT_WIDTH_PX)),
  h: Math.ceil(tableHeightFor(CARD_DEFAULT_WIDTH_PX)),
} as const;

/** The smallest content box: the table at the smallest readable card. */
export const SOLITAIRE_MIN_CONTENT_SIZE = {
  w: Math.ceil(tableWidthFor(CARD_MIN_WIDTH_PX)),
  h: Math.ceil(tableHeightFor(CARD_MIN_WIDTH_PX)),
} as const;
```

- [ ] **Step 2: Write the failing tests for the deck and the deal**

```ts
// backoffice/src/solitaire/rules.test.ts
import { expect } from '@open-wc/testing';
import { createDeck, deal, seededShuffle } from './rules.js';
import type { Card, Shuffler } from './rules.js';

/** The unshuffled deck, so every case can name exactly where each card lands. */
const identity: Shuffler = (cards) => [...cards];

describe('solitaire rules: deck and deal', () => {
  it('makes 52 distinct face-down cards', () => {
    const deck = createDeck();
    expect(deck.length).to.equal(52);
    expect(new Set(deck.map((c) => c.id)).size).to.equal(52);
    expect(deck.every((c) => !c.faceUp)).to.equal(true);
    expect(deck[0]).to.deep.equal({ id: '1S', suit: 'S', rank: 1, faceUp: false });
  });

  it('deals 1 to 7 cards into the columns with only the last one face up', () => {
    const game = deal(1, identity);
    expect(game.tableau.map((column) => column.length)).to.deep.equal([1, 2, 3, 4, 5, 6, 7]);
    for (const column of game.tableau) {
      expect(column.map((c) => c.faceUp)).to.deep.equal(column.map((_, i) => i === column.length - 1));
    }
    // Unshuffled: column 0 is the ace of spades, column 4 ends on the two of hearts.
    expect(game.tableau[0][0].id).to.equal('1S');
    expect(game.tableau[4][4].id).to.equal('2H');
  });

  it('puts the other 24 in the stock, face down, and starts at zero', () => {
    const game = deal(3, identity);
    expect(game.stock.length).to.equal(24);
    expect(game.stock.every((c: Card) => !c.faceUp)).to.equal(true);
    expect(game.waste).to.deep.equal([]);
    expect(game.foundations.map((f) => f.length)).to.deep.equal([0, 0, 0, 0]);
    expect(game).to.include({ drawCount: 3, score: 0, moves: 0, status: 'playing' });
  });

  it('shuffles the same way for the same seed, and differently for another', () => {
    const a = seededShuffle(42)(createDeck()).map((c) => c.id);
    const b = seededShuffle(42)(createDeck()).map((c) => c.id);
    const c = seededShuffle(43)(createDeck()).map((c) => c.id);
    expect(a).to.deep.equal(b);
    expect(a).to.not.deep.equal(c);
    expect(new Set(a).size).to.equal(52);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `npm test`
Expected: FAIL, `rules.js` cannot be resolved.

- [ ] **Step 4: Implement the types, deck and deal**

```ts
// backoffice/src/solitaire/rules.ts
/**
 * Klondike's rules, as pure functions over one immutable game value, the same shape as
 * Minesweeper's and Snake's `rules.ts`: no DOM, no timer, no `Math.random` on any path a test takes.
 * The shuffle is injected, so a test can deal an unshuffled deck and know where every card is.
 */
import { SOLITAIRE_COLUMNS, SOLITAIRE_FOUNDATIONS } from './constants.js';

/** Spades, hearts, diamonds, clubs. */
export type Suit = 'S' | 'H' | 'D' | 'C';
/** Every suit, in deck order. */
export const SUITS: ReadonlyArray<Suit> = ['S', 'H', 'D', 'C'];
/** How many cards one click on the stock turns over. */
export type DrawCount = 1 | 3;

/** One card. `id` is rank then suit (`'1S'` to `'13C'`), unique in the deck and stable across games. */
export interface Card {
  readonly id: string;
  readonly suit: Suit;
  /** 1 (ace) to 13 (king). */
  readonly rank: number;
  readonly faceUp: boolean;
}

/** A pile: the stock, the waste, a foundation `f0`-`f3` or a tableau column `t0`-`t6`. */
export type PileId = 'stock' | 'waste' | `f${number}` | `t${number}`;

/** Orders a deck. Returns a new array. */
export type Shuffler = (cards: ReadonlyArray<Card>) => Card[];

/** A whole game. Every pile lists its cards bottom first, so the top card is the last. */
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
    Array.from({ length: 13 }, (_, i) => ({ id: `${i + 1}${suit}`, suit, rank: i + 1, faceUp: false })),
  );
}

/**
 * A Fisher-Yates shuffle driven by mulberry32, so a seed always gives the same deal.
 * @param seed Any 32-bit integer.
 * @returns A shuffler.
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

/** The shuffle a real game uses: a seeded shuffle with a random seed. */
export const randomShuffle: Shuffler = (cards) => seededShuffle(Math.floor(Math.random() * 2 ** 32))(cards);

/**
 * A new game: column `n` gets `n + 1` cards with only the last face up, the rest is the stock.
 * @param drawCount Draw 1 or Draw 3.
 * @param shuffle How to order the deck.
 * @returns The dealt game.
 */
export function deal(drawCount: DrawCount, shuffle: Shuffler): KlondikeGame {
  const deck = shuffle(createDeck()).map((card) => ({ ...card, faceUp: false }));
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
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test`
Expected: the four `deck and deal` cases PASS, everything else still passes.

- [ ] **Step 6: Leave uncommitted.**

---

### Task 2: Drawing and recycling the stock

**Files:**
- Modify: `backoffice/src/solitaire/rules.ts`
- Test: `backoffice/src/solitaire/rules.test.ts`

- [ ] **Step 1: Add a test helper and the failing tests**

Append to `rules.test.ts`:

```ts
import { draw, pile } from './rules.js';
import type { KlondikeGame } from './rules.js';

/**
 * A card from shorthand: `'KS'`, `'10H'`, `'AD'`; a leading `-` means face down.
 * @param code The shorthand.
 * @returns The card.
 */
function card(code: string): Card {
  const faceUp = !code.startsWith('-');
  const body = faceUp ? code : code.slice(1);
  const suit = body.slice(-1) as Card['suit'];
  const r = body.slice(0, -1);
  const rank = r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : Number(r);
  return { id: `${rank}${suit}`, suit, rank, faceUp };
}

/**
 * A game built by hand. Unnamed piles are empty; the result does not need to hold 52 cards.
 * @param parts The piles to fill, by shorthand.
 * @returns The game.
 */
function game(parts: Partial<Record<'stock' | 'waste' | 'f0' | 'f1' | 'f2' | 'f3' | 't0' | 't1' | 't2' | 't3' | 't4' | 't5' | 't6', string[]>> & { drawCount?: 1 | 3; score?: number } = {}): KlondikeGame {
  const cards = (key: keyof typeof parts) => ((parts[key] as string[] | undefined) ?? []).map(card);
  return {
    stock: cards('stock'),
    waste: cards('waste'),
    foundations: [cards('f0'), cards('f1'), cards('f2'), cards('f3')],
    tableau: [cards('t0'), cards('t1'), cards('t2'), cards('t3'), cards('t4'), cards('t5'), cards('t6')],
    drawCount: parts.drawCount ?? 1,
    score: parts.score ?? 0,
    moves: 0,
    status: 'playing',
  };
}

/** Ids of a pile, bottom first. */
const ids = (g: KlondikeGame, id: Parameters<typeof pile>[1]) => pile(g, id).map((c) => c.id);

describe('solitaire rules: the stock', () => {
  it('turns the top card onto the waste in Draw 1', () => {
    const next = draw(game({ stock: ['-2S', '-3S', '-4S'] }));
    expect(ids(next, 'stock')).to.deep.equal(['2S', '3S']);
    expect(ids(next, 'waste')).to.deep.equal(['4S']);
    expect(next.waste[0].faceUp).to.equal(true);
    expect(next.moves).to.equal(1);
  });

  it('turns three in Draw 3, leaving the third from the top on top', () => {
    const next = draw(game({ drawCount: 3, stock: ['-2S', '-3S', '-4S', '-5S'] }));
    expect(ids(next, 'stock')).to.deep.equal(['2S']);
    expect(ids(next, 'waste'), 'top card last').to.deep.equal(['5S', '4S', '3S']);
  });

  it('turns what is left when fewer than three remain', () => {
    const next = draw(game({ drawCount: 3, stock: ['-2S', '-3S'] }));
    expect(ids(next, 'waste')).to.deep.equal(['3S', '2S']);
  });

  it('recycles the waste back into the stock, in the original order, face down', () => {
    const next = draw(game({ waste: ['2S', '3S', '4S'], score: 150 }));
    expect(ids(next, 'stock')).to.deep.equal(['4S', '3S', '2S']);
    expect(next.stock.every((c) => !c.faceUp)).to.equal(true);
    expect(ids(next, 'waste')).to.deep.equal([]);
  });

  it('charges 100 for a recycle in Draw 1, never going below zero, and nothing in Draw 3', () => {
    expect(draw(game({ waste: ['2S'], score: 150 })).score).to.equal(50);
    expect(draw(game({ waste: ['2S'], score: 40 })).score).to.equal(0);
    expect(draw(game({ drawCount: 3, waste: ['2S'], score: 40 })).score).to.equal(40);
  });

  it('does nothing when the stock and the waste are both empty', () => {
    const start = game();
    expect(draw(start)).to.equal(start);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL, `draw` and `pile` are not exported.

- [ ] **Step 3: Implement**

Add to `rules.ts` (and import `SCORE` from `./constants.js`):

```ts
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
 * @param game The game.
 * @param id The pile to replace.
 * @param cards Its new cards.
 * @returns A new game.
 */
function withPile(game: KlondikeGame, id: PileId, cards: ReadonlyArray<Card>): KlondikeGame {
  if (id === 'stock') return { ...game, stock: cards };
  if (id === 'waste') return { ...game, waste: cards };
  const index = Number(id.slice(1));
  if (id[0] === 'f') return { ...game, foundations: game.foundations.map((f, i) => (i === index ? cards : f)) };
  return { ...game, tableau: game.tableau.map((t, i) => (i === index ? cards : t)) };
}

/**
 * The game with points added, floored at zero, as Windows floors it.
 * @param game The game.
 * @param delta Points, possibly negative.
 * @returns A new game.
 */
function addScore(game: KlondikeGame, delta: number): KlondikeGame {
  return delta === 0 ? game : { ...game, score: Math.max(0, game.score + delta) };
}

/**
 * A click on the stock: turn one or three onto the waste, or recycle the waste when the stock is empty.
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
    return game.drawCount === 1 ? addScore(recycled, SCORE.recycleDrawOne) : recycled;
  }
  const count = Math.min(game.drawCount, game.stock.length);
  const taken = game.stock.slice(-count).reverse().map((c) => ({ ...c, faceUp: true }));
  return { ...game, stock: game.stock.slice(0, -count), waste: [...game.waste, ...taken], moves: game.moves + 1 };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 3: Moving cards and scoring moves

**Files:**
- Modify: `backoffice/src/solitaire/rules.ts`
- Test: `backoffice/src/solitaire/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `rules.test.ts`:

```ts
import { canDrop, move, movableRun } from './rules.js';

describe('solitaire rules: moves', () => {
  it('moves a card onto the next higher rank of the other colour', () => {
    const next = move(game({ t0: ['9S'], t1: ['8H'] }), 't1', 0, 't0');
    expect(next && ids(next, 't0')).to.deep.equal(['9S', '8H']);
  });

  it('refuses the same colour, a wrong rank, or a face-down target', () => {
    expect(move(game({ t0: ['9S'], t1: ['8C'] }), 't1', 0, 't0')).to.equal(undefined);
    expect(move(game({ t0: ['9S'], t1: ['7H'] }), 't1', 0, 't0')).to.equal(undefined);
    expect(move(game({ t0: ['-9S'], t1: ['8H'] }), 't1', 0, 't0')).to.equal(undefined);
  });

  it('only lets a king into an empty column', () => {
    expect(move(game({ t1: ['QH'] }), 't1', 0, 't0')).to.equal(undefined);
    expect(move(game({ t1: ['KH'] }), 't1', 0, 't0')).to.not.equal(undefined);
  });

  it('moves a whole run, and refuses a run that is not a sequence', () => {
    const next = move(game({ t0: ['10D'], t1: ['-2C', '9S', '8H', '7C'] }), 't1', 1, 't0');
    expect(next && ids(next, 't0')).to.deep.equal(['10D', '9S', '8H', '7C']);
    expect(movableRun(game({ t1: ['9S', '8S'] }), 't1', 0)).to.equal(undefined);
    expect(movableRun(game({ t1: ['-9S', '8H'] }), 't1', 0), 'a face-down card cannot be lifted').to.equal(undefined);
  });

  it('builds foundations up by suit from the ace, one card at a time', () => {
    expect(canDrop(game(), [card('AH')], 'f0')).to.equal(true);
    expect(canDrop(game(), [card('2H')], 'f0')).to.equal(false);
    expect(canDrop(game({ f0: ['AH'] }), [card('2H')], 'f0')).to.equal(true);
    expect(canDrop(game({ f0: ['AH'] }), [card('2D')], 'f0')).to.equal(false);
    expect(canDrop(game({ f0: ['AH'] }), [card('2H'), card('AS')], 'f0'), 'never a run').to.equal(false);
  });

  it('only lifts the top card of the waste or a foundation, and never from the stock', () => {
    const g = game({ stock: ['-KS'], waste: ['3S', '4S'], f0: ['AH', '2H'] });
    expect(movableRun(g, 'waste', 0)).to.equal(undefined);
    expect(movableRun(g, 'waste', 1)?.length).to.equal(1);
    expect(movableRun(g, 'f0', 0)).to.equal(undefined);
    expect(movableRun(g, 'stock', 0)).to.equal(undefined);
  });

  it('turns the card a move uncovers', () => {
    const next = move(game({ t0: ['9S'], t1: ['-2C', '8H'] }), 't1', 1, 't0');
    expect(next?.tableau[1][0].faceUp).to.equal(true);
  });

  it('scores each kind of move', () => {
    expect(move(game({ t0: ['9S'], waste: ['8H'] }), 'waste', 0, 't0')?.score, 'waste to column').to.equal(5);
    expect(move(game({ waste: ['AH'] }), 'waste', 0, 'f0')?.score, 'waste to foundation').to.equal(10);
    expect(move(game({ t0: ['AH'] }), 't0', 0, 'f0')?.score, 'column to foundation').to.equal(10);
    expect(move(game({ t0: ['-5C', 'AH'] }), 't0', 1, 'f0')?.score, 'plus turning a card').to.equal(15);
    expect(move(game({ t0: ['3S'], f0: ['AH', '2H'], score: 20 }), 'f0', 1, 't0')?.score, 'foundation back').to.equal(5);
    expect(move(game({ t0: ['9S'], t1: ['8H'] }), 't1', 0, 't0')?.score, 'column to column').to.equal(0);
  });

  it('counts moves and declares the win when all four foundations hold kings', () => {
    const full = (s: string) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((r) => r + s);
    const nearly = game({ f0: full('S'), f1: full('H'), f2: full('D'), f3: full('C').slice(0, 12), t0: ['KC'] });
    const next = move(nearly, 't0', 0, 'f3');
    expect(next?.status).to.equal('won');
    expect(next?.moves).to.equal(1);
  });

  it('refuses every move once the game is won', () => {
    expect(move({ ...game({ t0: ['9S'], t1: ['8H'] }), status: 'won' }, 't1', 0, 't0')).to.equal(undefined);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL, `move`, `canDrop`, `movableRun` not exported.

- [ ] **Step 3: Implement**

Add to `rules.ts`:

```ts
/**
 * Whether two cards stack in a column: other colour, one rank lower.
 * @param lower The card placed on top.
 * @param upper The card it goes on.
 * @returns True when legal.
 */
function stacks(lower: Card, upper: Card): boolean {
  return isRed(lower.suit) !== isRed(upper.suit) && lower.rank === upper.rank - 1;
}

/**
 * The cards a player may lift from a pile, starting at `index`.
 *
 * From the waste or a foundation only the top card; from a column any face-up card and everything
 * on it, provided that is a valid sequence; never from the stock.
 * @param game The game.
 * @param from The pile.
 * @param index Position of the lowest card to lift.
 * @returns The run, or `undefined` when it cannot be lifted.
 */
export function movableRun(game: KlondikeGame, from: PileId, index: number): ReadonlyArray<Card> | undefined {
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
export function canDrop(game: KlondikeGame, run: ReadonlyArray<Card>, to: PileId): boolean {
  if (to === 'stock' || to === 'waste' || run.length === 0) return false;
  const target = pile(game, to);
  const top = target[target.length - 1];
  const first = run[0];
  if (to[0] === 'f') {
    if (run.length !== 1) return false;
    return top ? top.suit === first.suit && first.rank === top.rank + 1 : first.rank === 1;
  }
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
export function move(game: KlondikeGame, from: PileId, index: number, to: PileId): KlondikeGame | undefined {
  if (game.status !== 'playing' || from === to) return undefined;
  const run = movableRun(game, from, index);
  if (!run || !canDrop(game, run, to)) return undefined;
  let next = withPile(withPile(game, from, pile(game, from).slice(0, index)), to, [...pile(game, to), ...run]);
  next = { ...next, moves: game.moves + 1 };
  let delta = 0;
  if (to[0] === 'f') delta += SCORE.toFoundation;
  else if (from === 'waste') delta += SCORE.wasteToTableau;
  else if (from[0] === 'f') delta += SCORE.foundationToTableau;
  if (from[0] === 't') {
    const left = pile(next, from);
    const top = left[left.length - 1];
    if (top && !top.faceUp) {
      next = withPile(next, from, [...left.slice(0, -1), { ...top, faceUp: true }]);
      delta += SCORE.turnOver;
    }
  }
  next = addScore(next, delta);
  return next.foundations.every((f) => f.length === 13) ? { ...next, status: 'won' } : next;
}
```

Note the foundation-back case: `+0` then `−15` from 20 is 5, which the test expects.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 4: Smart moves, auto-finish, time and validation

**Files:**
- Modify: `backoffice/src/solitaire/rules.ts`
- Test: `backoffice/src/solitaire/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { applyTime, canAutoFinish, foundationFor, isKlondikeGame, nextFinishingMove, timeBonus, withTimeBonus } from './rules.js';

describe('solitaire rules: smart moves and time', () => {
  it('finds the foundation a top card can go to', () => {
    expect(foundationFor(game({ t0: ['AH'] }), 't0')).to.equal('f0');
    expect(foundationFor(game({ f0: ['AS'], f1: ['AH'], t0: ['2H'] }), 't0')).to.equal('f1');
    expect(foundationFor(game({ t0: ['2H'] }), 't0')).to.equal(undefined);
    expect(foundationFor(game(), 't0')).to.equal(undefined);
  });

  it('offers auto-finish only when every card is face up and the stock and waste are empty', () => {
    expect(canAutoFinish(game({ t0: ['KS', 'QH'] }))).to.equal(true);
    expect(canAutoFinish(game({ t0: ['-KS', 'QH'] }))).to.equal(false);
    expect(canAutoFinish(game({ t0: ['KS'], stock: ['-2H'] }))).to.equal(false);
    expect(canAutoFinish(game({ t0: ['KS'], waste: ['2H'] }))).to.equal(false);
    expect(canAutoFinish(game()), 'nothing left to finish').to.equal(false);
  });

  it('finishes with the lowest card that can go home', () => {
    const g = game({ f0: ['AS'], f1: ['AH'], t0: ['3S', '2H'], t1: ['2S'] });
    expect(nextFinishingMove(g)).to.deep.equal({ from: 't0', to: 'f1' });
  });

  it('charges 2 points for every 10 seconds crossed, floored at zero', () => {
    const g = game({ score: 30 });
    expect(applyTime(g, 0, 9).score).to.equal(30);
    expect(applyTime(g, 9, 10).score).to.equal(28);
    expect(applyTime(g, 0, 35).score).to.equal(24);
    expect(applyTime(game({ score: 1 }), 0, 10).score).to.equal(0);
  });

  it('gives the win bonus of 700000 over the seconds from 30 seconds on', () => {
    expect(timeBonus(29)).to.equal(0);
    expect(timeBonus(30)).to.equal(23333);
    expect(timeBonus(180)).to.equal(3888);
    expect(withTimeBonus(game({ score: 100 }), 180).score).to.equal(3988);
  });

  it('accepts a dealt game and rejects anything else when reading storage', () => {
    expect(isKlondikeGame(deal(1, seededShuffle(1)))).to.equal(true);
    expect(isKlondikeGame(undefined)).to.equal(false);
    expect(isKlondikeGame({ ...deal(1, seededShuffle(1)), drawCount: 2 })).to.equal(false);
    expect(isKlondikeGame({ ...deal(1, seededShuffle(1)), stock: [] }), 'not 52 cards').to.equal(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL, the six functions are not exported.

- [ ] **Step 3: Implement**

Add to `rules.ts` (import `SOLITAIRE_FOUNDATIONS`, `TIME_PENALTY_EVERY_S`, `TIME_BONUS_MIN_S`, `TIME_BONUS_NUMERATOR`):

```ts
/**
 * The foundation a pile's top card can go to, for double-click.
 * @param game The game.
 * @param from The pile.
 * @returns The first foundation that accepts it, or `undefined`.
 */
export function foundationFor(game: KlondikeGame, from: PileId): PileId | undefined {
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
 * Whether the rest of the game is a formality: nothing left in the stock or waste, nothing face down.
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
export function nextFinishingMove(game: KlondikeGame): { from: PileId; to: PileId } | undefined {
  let best: { from: PileId; to: PileId; rank: number } | undefined;
  game.tableau.forEach((column, t) => {
    const top = column[column.length - 1];
    if (!top) return;
    const from: PileId = `t${t}`;
    const to = foundationFor(game, from);
    if (to && (!best || top.rank < best.rank)) best = { from, to, rank: top.rank };
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
export function applyTime(game: KlondikeGame, fromSeconds: number, toSeconds: number): KlondikeGame {
  if (game.status !== 'playing') return game;
  const steps = Math.floor(toSeconds / TIME_PENALTY_EVERY_S) - Math.floor(fromSeconds / TIME_PENALTY_EVERY_S);
  return steps > 0 ? addScore(game, steps * SCORE.timePenalty) : game;
}

/**
 * The win bonus.
 * @param seconds Seconds the game took.
 * @returns 700000 / seconds, rounded down, from 30 seconds on; otherwise 0.
 */
export function timeBonus(seconds: number): number {
  return seconds >= TIME_BONUS_MIN_S ? Math.floor(TIME_BONUS_NUMERATOR / seconds) : 0;
}

/**
 * The game with its win bonus added.
 * @param game A won game.
 * @param seconds Seconds it took.
 * @returns The game with the bonus in its score.
 */
export function withTimeBonus(game: KlondikeGame, seconds: number): KlondikeGame {
  return addScore(game, timeBonus(seconds));
}

/**
 * Whether a value read back from storage is a whole, sane game: 52 distinct cards across 13 piles,
 * a known draw count and status, and numbers where numbers belong. Anything else is discarded.
 * @param value The parsed value.
 * @returns True when it can be played.
 */
export function isKlondikeGame(value: unknown): value is KlondikeGame {
  if (!value || typeof value !== 'object') return false;
  const g = value as Partial<KlondikeGame>;
  if (g.drawCount !== 1 && g.drawCount !== 3) return false;
  if (g.status !== 'playing' && g.status !== 'won') return false;
  if (typeof g.score !== 'number' || typeof g.moves !== 'number') return false;
  if (!Array.isArray(g.stock) || !Array.isArray(g.waste) || !Array.isArray(g.foundations) || !Array.isArray(g.tableau)) return false;
  if (g.foundations.length !== SOLITAIRE_FOUNDATIONS || g.tableau.length !== SOLITAIRE_COLUMNS) return false;
  const all = [g.stock, g.waste, ...g.foundations, ...g.tableau].flat() as Card[];
  const valid = new Set(createDeck().map((c) => c.id));
  return all.length === 52 && new Set(all.map((c) => c?.id)).size === 52 && all.every((c) => valid.has(c.id) && typeof c.faceUp === 'boolean');
}
```

`Array.prototype.flat` is ES2019, which the ES2020 lib includes.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS. Then `npm run build` must also pass (first `tsc` run over the rules).

- [ ] **Step 5: Leave uncommitted.**

---

### Task 5: Layout

**Files:**
- Create: `backoffice/src/solitaire/layout.ts`
- Test: `backoffice/src/solitaire/layout.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backoffice/src/solitaire/layout.test.ts
import { expect } from '@open-wc/testing';
import { cardPositions, computeLayout, fanOffsets } from './layout.js';
import {
  CARD_MAX_WIDTH_PX,
  CARD_MIN_WIDTH_PX,
  CARD_RATIO,
  FAN_DOWN_RATIO,
  FAN_UP_MIN_RATIO,
  FAN_UP_RATIO,
  SOLITAIRE_CONTENT_SIZE,
  SOLITAIRE_MIN_CONTENT_SIZE,
} from './constants.js';
import { deal } from './rules.js';

describe('solitaire layout', () => {
  it('opens at the default card width in the default content box', () => {
    const layout = computeLayout(SOLITAIRE_CONTENT_SIZE.w, SOLITAIRE_CONTENT_SIZE.h);
    expect(Math.round(layout.cardW)).to.equal(100);
    expect(layout.cardH).to.be.closeTo(layout.cardW * CARD_RATIO, 0.001);
  });

  it('never goes below the minimum or above the maximum card width', () => {
    expect(computeLayout(200, 200).cardW).to.equal(CARD_MIN_WIDTH_PX);
    expect(computeLayout(4000, 3000).cardW).to.equal(CARD_MAX_WIDTH_PX);
    expect(computeLayout(SOLITAIRE_MIN_CONTENT_SIZE.w, SOLITAIRE_MIN_CONTENT_SIZE.h).cardW).to.be.closeTo(CARD_MIN_WIDTH_PX, 0.5);
  });

  it('is limited by the height when the window is wide and short', () => {
    const wide = computeLayout(2000, SOLITAIRE_CONTENT_SIZE.h);
    expect(wide.cardW).to.be.lessThan(CARD_MAX_WIDTH_PX);
  });

  it('centres the seven columns', () => {
    const layout = computeLayout(1200, 900);
    const first = layout.slot('t0').x;
    const last = layout.slot('t6').x + layout.cardW;
    expect(first).to.be.closeTo(1200 - last, 0.5);
  });

  it('fans face-down cards tighter than face-up ones', () => {
    const offsets = fanOffsets([{ faceUp: false }, { faceUp: false }, { faceUp: true }, { faceUp: true }], 140, 10000);
    expect(offsets).to.deep.equal([0, 140 * FAN_DOWN_RATIO, 140 * FAN_DOWN_RATIO * 2, 140 * FAN_DOWN_RATIO * 2 + 140 * FAN_UP_RATIO]);
  });

  it('compresses a long column to fit, but never below the minimum step', () => {
    const column = Array.from({ length: 13 }, () => ({ faceUp: true }));
    const tight = fanOffsets(column, 140, 400);
    expect(tight[12] + 140).to.be.at.most(400.001);
    const floor = fanOffsets(column, 140, 150);
    expect(floor[1]).to.be.closeTo(140 * FAN_UP_MIN_RATIO, 0.001);
  });

  it('places all 52 cards, each exactly once', () => {
    const layout = computeLayout(SOLITAIRE_CONTENT_SIZE.w, SOLITAIRE_CONTENT_SIZE.h);
    const positions = cardPositions(deal(1, (c) => [...c]), layout);
    expect(positions.size).to.equal(52);
    const ace = positions.get('1S')!;
    expect(ace.x).to.equal(layout.slot('t0').x);
    expect(ace.y).to.equal(layout.slot('t0').y);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL, `layout.js` missing.

- [ ] **Step 3: Implement**

```ts
// backoffice/src/solitaire/layout.ts
/**
 * Where every card sits, as pure maths over the element's size and the game, so it is tested
 * without rendering and the element only has to copy numbers into styles.
 */
import {
  CARD_MAX_WIDTH_PX, CARD_MIN_WIDTH_PX, CARD_RATIO, COLUMN_GAP_RATIO, FAN_DOWN_RATIO, FAN_UP_MIN_RATIO,
  FAN_UP_RATIO, ROW_GAP_RATIO, SOLITAIRE_COLUMNS, TABLEAU_MIN_CARDS, TABLE_PADDING_PX, TOOLBAR_HEIGHT_PX,
  WASTE_FAN_RATIO,
} from './constants.js';
import type { KlondikeGame, PileId } from './rules.js';

/** A position in px, relative to the element's top-left corner. */
export interface Point { readonly x: number; readonly y: number }
/** A card's position and stacking order. */
export interface CardPosition extends Point { readonly z: number }

/** The table's geometry at one size. */
export interface TableLayout {
  readonly width: number;
  readonly height: number;
  readonly cardW: number;
  readonly cardH: number;
  /** Where a pile's bottom card sits. */
  slot(id: PileId): Point;
}

/**
 * The geometry for an element of this size.
 * @param width Element width in px.
 * @param height Element height in px.
 * @returns The layout.
 */
export function computeLayout(width: number, height: number): TableLayout {
  const byWidth = (width - TABLE_PADDING_PX * 2) / (SOLITAIRE_COLUMNS + (SOLITAIRE_COLUMNS - 1) * COLUMN_GAP_RATIO);
  const byHeight =
    (height - TOOLBAR_HEIGHT_PX - TABLE_PADDING_PX * 2) / (CARD_RATIO * (1 + ROW_GAP_RATIO + TABLEAU_MIN_CARDS));
  const cardW = Math.min(CARD_MAX_WIDTH_PX, Math.max(CARD_MIN_WIDTH_PX, Math.min(byWidth, byHeight)));
  const cardH = cardW * CARD_RATIO;
  const gap = cardW * COLUMN_GAP_RATIO;
  const used = SOLITAIRE_COLUMNS * cardW + (SOLITAIRE_COLUMNS - 1) * gap;
  const left = (width - used) / 2;
  const top = TOOLBAR_HEIGHT_PX + TABLE_PADDING_PX;
  const column = (n: number) => left + n * (cardW + gap);
  const tableauY = top + cardH + cardH * ROW_GAP_RATIO;
  return {
    width,
    height,
    cardW,
    cardH,
    slot(id) {
      if (id === 'stock') return { x: column(0), y: top };
      if (id === 'waste') return { x: column(1), y: top };
      const n = Number(id.slice(1));
      return id[0] === 'f' ? { x: column(3 + n), y: top } : { x: column(n), y: tableauY };
    },
  };
}

/**
 * Vertical offsets of a column's cards from its slot.
 * @param cards The column, bottom first (only `faceUp` is read).
 * @param cardH Card height in px.
 * @param available Height from the column's slot to the bottom of the table, in px.
 * @returns One offset per card.
 */
export function fanOffsets(cards: ReadonlyArray<{ faceUp: boolean }>, cardH: number, available: number): number[] {
  const down = cardH * FAN_DOWN_RATIO;
  const downs = cards.filter((c) => !c.faceUp).length;
  const ups = cards.length - downs;
  let up = cardH * FAN_UP_RATIO;
  if (ups > 1) {
    const room = (available - cardH - downs * down) / (ups - 1);
    up = Math.max(cardH * FAN_UP_MIN_RATIO, Math.min(up, room));
  }
  const offsets: number[] = [];
  let y = 0;
  cards.forEach((card, i) => {
    offsets.push(y);
    const next = cards[i + 1];
    if (next) y += card.faceUp ? up : down;
  });
  return offsets;
}

/**
 * Every card's position: stock and foundations stacked, the waste fanned sideways in Draw 3, the
 * columns fanned down. `z` is the global paint order.
 * @param game The game.
 * @param layout The geometry.
 * @returns Positions keyed by card id.
 */
export function cardPositions(game: KlondikeGame, layout: TableLayout): Map<string, CardPosition> {
  const out = new Map<string, CardPosition>();
  let z = 0;
  const stack = (id: PileId, cards: KlondikeGame['stock']) => {
    const at = layout.slot(id);
    for (const card of cards) out.set(card.id, { x: at.x, y: at.y, z: z++ });
  };
  stack('stock', game.stock);
  const waste = layout.slot('waste');
  const fanned = game.drawCount === 3 ? 3 : 1;
  game.waste.forEach((card, i) => {
    const fromTop = game.waste.length - 1 - i;
    const step = fromTop < fanned ? fanned - 1 - fromTop : 0;
    out.set(card.id, { x: waste.x + step * layout.cardW * WASTE_FAN_RATIO, y: waste.y, z: z++ });
  });
  game.foundations.forEach((cards, f) => stack(`f${f}`, cards));
  game.tableau.forEach((cards, t) => {
    const at = layout.slot(`t${t}`);
    const offsets = fanOffsets(cards, layout.cardH, layout.height - TABLE_PADDING_PX - at.y);
    cards.forEach((card, i) => out.set(card.id, { x: at.x, y: at.y + offsets[i], z: z++ }));
  });
  return out;
}
```

Waste fan note: only the top one (Draw 1) or three (Draw 3) are offset; older waste cards sit
under the leftmost.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS. If `opens at the default card width` is off by one, the constants' `Math.ceil`
rounding is the cause: compute the expected value from `computeLayout` rather than changing the
constants.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 6: Settings and saved games

**Files:**
- Create: `backoffice/src/solitaire/settings.ts`, `backoffice/src/solitaire/saved-games.ts`
- Test: `backoffice/src/solitaire/settings.test.ts`, `backoffice/src/solitaire/saved-games.test.ts`

The alias constants live in `backs.ts` (Task 7), but settings needs the defaults now, so create a
minimal `backs.ts` holding just the two alias constants in this task, and let Task 7 extend it:

```ts
// backoffice/src/solitaire/backs.ts (first version)
/** Alias of the back that follows the theme. Final once shipped: stored settings name it. */
export const THEME_BACK_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Back.Theme';
/** Alias of the default face set. Final once shipped. */
export const CLASSIC_FACES_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Faces.Classic';
```

- [ ] **Step 1: A Storage double for both tests**

```ts
// backoffice/src/solitaire/memory-storage.test-helper.ts
/**
 * A `Storage` backed by a Map, so the tests never touch the real browser storage the other games'
 * tests also use. Not a `.test.ts` file, so the runner does not treat it as a suite.
 */
export class MemoryStorage implements Storage {
  #items = new Map<string, string>();
  get length(): number { return this.#items.size; }
  clear(): void { this.#items.clear(); }
  getItem(key: string): string | null { return this.#items.get(key) ?? null; }
  key(index: number): string | null { return [...this.#items.keys()][index] ?? null; }
  removeItem(key: string): void { this.#items.delete(key); }
  setItem(key: string, value: string): void { this.#items.set(key, value); }
}
```

- [ ] **Step 2: Write the failing settings tests**

```ts
// backoffice/src/solitaire/settings.test.ts
import { expect } from '@open-wc/testing';
import { DEFAULT_SETTINGS, SETTINGS_KEY, readSettings, writeSettings } from './settings.js';
import { MemoryStorage } from './memory-storage.test-helper.js';

describe('solitaire settings', () => {
  it('reads the defaults when nothing is stored', () => {
    expect(readSettings(() => new MemoryStorage())).to.deep.equal(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.drawCount).to.equal(1);
  });

  it('round-trips what was written', () => {
    const storage = new MemoryStorage();
    writeSettings({ drawCount: 3, back: 'x', faces: 'y' }, () => storage);
    expect(readSettings(() => storage)).to.deep.equal({ drawCount: 3, back: 'x', faces: 'y' });
  });

  it('repairs a bad value field by field', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ drawCount: 2, back: 7 }));
    expect(readSettings(() => storage)).to.deep.equal(DEFAULT_SETTINGS);
    storage.setItem(SETTINGS_KEY, '{not json');
    expect(readSettings(() => storage)).to.deep.equal(DEFAULT_SETTINGS);
  });

  it('survives storage that throws', () => {
    const blocked = () => { throw new Error('blocked'); };
    expect(readSettings(blocked)).to.deep.equal(DEFAULT_SETTINGS);
    writeSettings(DEFAULT_SETTINGS, blocked);
  });
});
```

- [ ] **Step 3: Run, fail, implement, pass**

Run: `npm test` → FAIL (`settings.js` missing). Then:

```ts
// backoffice/src/solitaire/settings.ts
/**
 * Solitaire's settings, kept per browser in `localStorage` like Snake's best score (design D6):
 * a preference, not data, so losing it to a cleared cache costs nothing.
 */
import { CLASSIC_FACES_ALIAS, THEME_BACK_ALIAS } from './backs.js';
import type { DrawCount } from './rules.js';

/** Storage key. Final once shipped. */
export const SETTINGS_KEY = 'umbradesktop-entertainment-solitaire-settings';

/** What the player chose. */
export interface SolitaireSettings {
  readonly drawCount: DrawCount;
  /** Alias of a `umbraDesktopSolitaireBack`. */
  readonly back: string;
  /** Alias of a `umbraDesktopSolitaireFaces`. */
  readonly faces: string;
}

/** A fresh browser's settings. */
export const DEFAULT_SETTINGS: SolitaireSettings = { drawCount: 1, back: THEME_BACK_ALIAS, faces: CLASSIC_FACES_ALIAS };

/** Reaches the storage; may throw where site data is blocked, so it is called inside a `try`. */
export type StorageAccess = () => Storage;

/**
 * The stored settings, each field repaired to its default when missing or malformed.
 * @param storage How to reach storage.
 * @returns The settings.
 */
export function readSettings(storage: StorageAccess = () => window.localStorage): SolitaireSettings {
  try {
    const raw = JSON.parse(storage().getItem(SETTINGS_KEY) ?? '{}') as Partial<Record<keyof SolitaireSettings, unknown>>;
    return {
      drawCount: raw.drawCount === 3 ? 3 : DEFAULT_SETTINGS.drawCount,
      back: typeof raw.back === 'string' ? raw.back : DEFAULT_SETTINGS.back,
      faces: typeof raw.faces === 'string' ? raw.faces : DEFAULT_SETTINGS.faces,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Store the settings, silently doing nothing when storage refuses.
 * @param settings What to store.
 * @param storage How to reach storage.
 */
export function writeSettings(settings: SolitaireSettings, storage: StorageAccess = () => window.localStorage): void {
  try {
    storage().setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A preference that does not stick is not worth an error; it still applies to this window.
  }
}
```

Note: `drawCount: 2` repairs to 1 because `raw.drawCount === 3` is false; that is the intended
"bad value reads as default".

Run: `npm test` → PASS.

- [ ] **Step 4: Write the failing saved-games tests**

```ts
// backoffice/src/solitaire/saved-games.test.ts
import { expect } from '@open-wc/testing';
import { SAVED_GAMES_KEY, SavedGameStore } from './saved-games.js';
import { MemoryStorage } from './memory-storage.test-helper.js';
import { deal, seededShuffle } from './rules.js';

describe('solitaire saved games', () => {
  const game = deal(1, seededShuffle(7));

  it('claims nothing when nothing is saved', () => {
    const store = new SavedGameStore(() => new MemoryStorage());
    expect(store.claim()).to.equal(undefined);
  });

  it('saves a window game and lets a new window claim it once', () => {
    const storage = new MemoryStorage();
    new SavedGameStore(() => storage).save('a', { game, elapsedSeconds: 12 });
    // A reload: a new page, so a new store, over the same session storage.
    const store = new SavedGameStore(() => storage);
    const claimed = store.claim();
    expect(claimed?.id).to.equal('a');
    expect(claimed?.saved.elapsedSeconds).to.equal(12);
    expect(claimed?.saved.game).to.deep.equal(game);
    expect(store.claim(), 'a second window does not get the same game').to.equal(undefined);
  });

  it('gives two windows their own games', () => {
    const storage = new MemoryStorage();
    const before = new SavedGameStore(() => storage);
    before.save('a', { game, elapsedSeconds: 1 });
    before.save('b', { game, elapsedSeconds: 2 });
    const after = new SavedGameStore(() => storage);
    const ids = [after.claim()?.id, after.claim()?.id].sort();
    expect(ids).to.deep.equal(['a', 'b']);
  });

  it('forgets a game that is removed, and releases its claim', () => {
    const storage = new MemoryStorage();
    const store = new SavedGameStore(() => storage);
    store.save('a', { game, elapsedSeconds: 1 });
    store.remove('a');
    expect(new SavedGameStore(() => storage).claim()).to.equal(undefined);
  });

  it('drops anything in storage that is not a playable game', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVED_GAMES_KEY, JSON.stringify({ a: { game: { nonsense: true }, elapsedSeconds: 1 } }));
    expect(new SavedGameStore(() => storage).claim()).to.equal(undefined);
    storage.setItem(SAVED_GAMES_KEY, 'not json');
    expect(new SavedGameStore(() => storage).claim()).to.equal(undefined);
  });

  it('survives storage that throws', () => {
    const store = new SavedGameStore(() => { throw new Error('blocked'); });
    store.save('a', { game, elapsedSeconds: 1 });
    expect(store.claim()).to.equal(undefined);
    store.remove('a');
  });
});
```

- [ ] **Step 5: Run, fail, implement, pass**

Run: `npm test` → FAIL. Then:

```ts
// backoffice/src/solitaire/saved-games.ts
/**
 * Unfinished games kept per tab in `sessionStorage` (design D10), so a refresh or a sign-out does not
 * cost the player their game. Each window saves under its own id. A window that opens claims one
 * saved game no other window on this page has claimed. Closing the window removes it; a page going
 * away does not, because the browser does not run `disconnectedCallback` then.
 */
import { isKlondikeGame } from './rules.js';
import type { KlondikeGame } from './rules.js';
import type { StorageAccess } from './settings.js';

/** Storage key. Final once shipped. */
export const SAVED_GAMES_KEY = 'umbradesktop-entertainment-solitaire-games';

/** One window's game. */
export interface SavedGame {
  readonly game: KlondikeGame;
  readonly elapsedSeconds: number;
}

/** A claimed game and the id its window keeps saving under. */
export interface ClaimedGame {
  readonly id: string;
  readonly saved: SavedGame;
}

/** The saved games of one page. One instance per page, shared by every Solitaire window on it. */
export class SavedGameStore {
  /** Ids a window on this page already owns. In memory on purpose: a reload starts it empty. */
  #claimed = new Set<string>();

  /**
   * @param storage How to reach storage; may throw, and every call is guarded.
   */
  constructor(private readonly storage: StorageAccess = () => window.sessionStorage) {}

  /**
   * Take one saved game no window on this page owns.
   * @returns It, or `undefined`.
   */
  claim(): ClaimedGame | undefined {
    const all = this.#read();
    const id = Object.keys(all).find((key) => !this.#claimed.has(key));
    if (id === undefined) return undefined;
    this.#claimed.add(id);
    return { id, saved: all[id] };
  }

  /**
   * Save a window's game, claiming the id for this page.
   * @param id The window's id.
   * @param saved Its game.
   */
  save(id: string, saved: SavedGame): void {
    this.#claimed.add(id);
    const all = this.#read();
    all[id] = saved;
    this.#write(all);
  }

  /**
   * Forget a window's game: it was closed, won or replaced by New game.
   * @param id The window's id.
   */
  remove(id: string): void {
    this.#claimed.delete(id);
    const all = this.#read();
    delete all[id];
    this.#write(all);
  }

  /** Every playable saved game; anything malformed is dropped. */
  #read(): Record<string, SavedGame> {
    try {
      const raw = JSON.parse(this.storage().getItem(SAVED_GAMES_KEY) ?? '{}') as Record<string, Partial<SavedGame>>;
      const out: Record<string, SavedGame> = {};
      for (const [id, entry] of Object.entries(raw ?? {})) {
        if (entry && isKlondikeGame(entry.game) && entry.game.status === 'playing' && typeof entry.elapsedSeconds === 'number') {
          out[id] = { game: entry.game, elapsedSeconds: entry.elapsedSeconds };
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Write them all back, or nothing when storage refuses. */
  #write(all: Record<string, SavedGame>): void {
    try {
      this.storage().setItem(SAVED_GAMES_KEY, JSON.stringify(all));
    } catch {
      // Nothing to tell the player: the game carries on, it just will not survive a reload.
    }
  }
}

/** The page's store, shared by every Solitaire window. */
export const savedGames = new SavedGameStore();
```

Run: `npm test` → PASS.

- [ ] **Step 6: Leave uncommitted.**

---

### Task 7: The two manifest types and the built-in backs

**Files:**
- Create: `backoffice/src/solitaire/extensions.ts`
- Modify: `backoffice/src/solitaire/backs.ts`
- Test: `backoffice/src/solitaire/extensions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backoffice/src/solitaire/extensions.test.ts
import { expect } from '@open-wc/testing';
import { backImageFor } from './extensions.js';
import { BACK_BASE_URL, backManifests, THEME_BACK_ALIAS } from './backs.js';

describe('solitaire extensions', () => {
  it('uses a plain image under every theme', () => {
    expect(backImageFor('/x.avif', 'win98')).to.equal('/x.avif');
    expect(backImageFor('/x.avif', undefined)).to.equal('/x.avif');
  });

  it('picks the theme image, and the fallback for a theme it does not know', () => {
    const image = { byTheme: { win98: '/98.svg' }, fallback: '/default.avif' };
    expect(backImageFor(image, 'win98')).to.equal('/98.svg');
    expect(backImageFor(image, 'a-sixth-theme')).to.equal('/default.avif');
    expect(backImageFor(image, undefined)).to.equal('/default.avif');
  });

  it('registers Match theme first, then one back per shipped theme', () => {
    expect(backManifests[0].alias).to.equal(THEME_BACK_ALIAS);
    expect(backManifests.length).to.equal(6);
    const theme = backManifests[0].meta.image;
    for (const id of ['umbraco', 'umbraco4', 'macos', 'win11', 'win98']) {
      expect(backImageFor(theme, id).startsWith(BACK_BASE_URL), id).to.equal(true);
    }
    const weights = backManifests.map((m) => m.weight ?? 0);
    expect([...weights].sort((a, b) => b - a)).to.deep.equal(weights);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL, `extensions.js` missing and `backManifests` not exported.

- [ ] **Step 3: Implement `extensions.ts`**

```ts
// backoffice/src/solitaire/extensions.ts
/**
 * The two manifest types through which any package adds card backs and face sets (design D11).
 * This package's own contract, declared and read here; the host knows nothing about them.
 */
import type { ManifestBase } from '@umbraco-cms/backoffice/extension-api';
import type { Suit } from './rules.js';

/** One card to draw. */
export interface SolitaireCardValue { readonly suit: Suit; readonly rank: number }

/** A face set: draws any card as a self-contained SVG document with viewBox `0 0 100 140`. */
export interface SolitaireFaceSet {
  /**
   * @param card The card.
   * @returns SVG markup. Ids inside it must be unique per card, since 52 share one shadow root.
   */
  render(card: SolitaireCardValue): string;
}

/** A back's image: one URL, or one per theme id with a fallback for ids it does not know. */
export type SolitaireBackImage = string | { readonly byTheme: Readonly<Record<string, string>>; readonly fallback: string };

/** A card back. */
export interface ManifestSolitaireBack extends ManifestBase {
  type: 'umbraDesktopSolitaireBack';
  meta: {
    /** Shown under the swatch in settings. A `#`-prefixed localisation token or a literal. */
    label: string;
    image: SolitaireBackImage;
  };
}

/** A face set. */
export interface ManifestSolitaireFaces extends ManifestBase {
  type: 'umbraDesktopSolitaireFaces';
  /** Loads the module whose default export is the face set. Lazy, so 52 SVGs stay out of the main chunk. */
  loader: () => Promise<{ default: SolitaireFaceSet }>;
  meta: { label: string };
}

declare global {
  /** Adds both types to Umbraco's manifest union, as `umbradesktop-app.d.ts` does for the host's. */
  interface UmbExtensionManifestMap {
    umbraDesktopSolitaireBack: ManifestSolitaireBack;
    umbraDesktopSolitaireFaces: ManifestSolitaireFaces;
  }
}

/**
 * The URL of a back under a theme.
 * @param image The back's image.
 * @param theme The active theme id, as stamped on the app element.
 * @returns The URL to draw.
 */
export function backImageFor(image: SolitaireBackImage, theme: string | undefined): string {
  if (typeof image === 'string') return image;
  return (theme !== undefined && image.byTheme[theme]) || image.fallback;
}
```

- [ ] **Step 4: Extend `backs.ts`**

```ts
// backoffice/src/solitaire/backs.ts (full version)
/**
 * The built-in card backs and face set, registered through the same manifest types a third party
 * uses, so that path is exercised by this package itself (design D11).
 */
import type { ManifestSolitaireBack, ManifestSolitaireFaces, SolitaireBackImage } from './extensions.js';

/** Alias of the back that follows the theme. Final once shipped: stored settings name it. */
export const THEME_BACK_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Back.Theme';
/** Alias of the default face set. Final once shipped. */
export const CLASSIC_FACES_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Faces.Classic';
/** Where `scripts/build-card-backs.mjs` writes, as served from the package's static assets. */
export const BACK_BASE_URL = '/App_Plugins/Umbraco.Community.UmbraDesktop.Entertainment/solitaire/backs/';

/** Each shipped theme's back file, cut from that theme's default wallpaper (design D8). */
const THEME_FILES = {
  umbraco: 'aurora-flow.avif',
  umbraco4: 'retro-swoosh.avif',
  macos: 'first-light.avif',
  win11: 'cobalt-beacon.avif',
  win98: 'win98.svg',
} as const;

/** Match theme's image: the active theme's back, the Umbraco one for a theme it does not know. */
export const THEME_BACK_IMAGE: SolitaireBackImage = {
  byTheme: Object.fromEntries(Object.entries(THEME_FILES).map(([id, file]) => [id, BACK_BASE_URL + file])),
  fallback: BACK_BASE_URL + THEME_FILES.umbraco,
};

/** The label token of each fixed back. */
const LABELS: Record<keyof typeof THEME_FILES, string> = {
  umbraco: '#umbraDesktopEntertainment_solitaireBackUmbraco',
  umbraco4: '#umbraDesktopEntertainment_solitaireBackUmbraco4',
  macos: '#umbraDesktopEntertainment_solitaireBackMacos',
  win11: '#umbraDesktopEntertainment_solitaireBackWin11',
  win98: '#umbraDesktopEntertainment_solitaireBackWin98',
};

/** Match theme first, then the five theme backs. Umbraco weights: higher sorts first. */
export const backManifests: ManifestSolitaireBack[] = [
  {
    type: 'umbraDesktopSolitaireBack',
    alias: THEME_BACK_ALIAS,
    name: 'Solitaire back: match theme',
    weight: 1000,
    meta: { label: '#umbraDesktopEntertainment_solitaireBackTheme', image: THEME_BACK_IMAGE },
  },
  ...(Object.keys(THEME_FILES) as Array<keyof typeof THEME_FILES>).map((id, i) => ({
    type: 'umbraDesktopSolitaireBack' as const,
    alias: `Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Back.${id}`,
    name: `Solitaire back: ${id}`,
    weight: 900 - i * 100,
    meta: { label: LABELS[id], image: BACK_BASE_URL + THEME_FILES[id] },
  })),
];

/** The default face set. */
export const facesManifests: ManifestSolitaireFaces[] = [
  {
    type: 'umbraDesktopSolitaireFaces',
    alias: CLASSIC_FACES_ALIAS,
    name: 'Solitaire faces: Classic',
    weight: 1000,
    loader: () => import('./faces/classic/classic.js'),
    meta: { label: '#umbraDesktopEntertainment_solitaireFacesClassic' },
  },
];
```

`faces/classic/classic.js` does not exist until Task 10, so `tsc` fails until then. To keep each
task's build green, create a stub now and replace it in Task 10:

```ts
// backoffice/src/solitaire/faces/classic/classic.ts (stub, replaced in Task 10)
import type { SolitaireFaceSet } from '../../extensions.js';
/** Placeholder until Task 10 draws the real faces. */
const classic: SolitaireFaceSet = { render: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"></svg>' };
export default classic;
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test` then `npm run build`
Expected: both PASS.

- [ ] **Step 6: Leave uncommitted.**

---

### Task 8: Card back images

**Files:**
- Create: `backoffice/scripts/build-card-backs.mjs`
- Create: `backoffice/public/solitaire/backs/win98.svg`
- Modify: `package.json` (devDependency `sharp`, build script)
- Modify: repository `.gitignore`

- [ ] **Step 1: Add sharp at the host's version**

Run: `npm install --save-dev sharp@^0.35.4`
Expected: `package.json` and `package-lock.json` gain `sharp`.

- [ ] **Step 2: Write the script**

```js
// backoffice/scripts/build-card-backs.mjs
/**
 * Cuts Solitaire's card backs from the host's wallpaper sources (design D8): a portrait crop of each
 * theme's default wallpaper, centred on its focal point, as AVIF in `public/solitaire/backs/`.
 *
 * Reads the host's committed PNGs in `../../Umbraco.Community.UmbraDesktop/backoffice/wallpapers-src/`
 * rather than its encoded AVIFs, which are gitignored build output. The crops here are gitignored
 * too and rebuilt by `npm run build`, which CI runs before `dotnet pack`, exactly as the host does.
 *
 * Idempotent by mtime, like `build-wallpapers.mjs`.
 */
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** Output size in px: the card's inner 90 x 130 area at about 2.3x the largest card (132px wide). */
const OUT_W = 300;
const OUT_H = 434;
/** AVIF quality; the host uses 55 for its full-size wallpapers. */
const QUALITY = 55;
/** How much of the wallpaper's height the crop takes. 130/150 matches the approved mock. */
const HEIGHT_FRACTION = 130 / 150;

/** Each back: its wallpaper and the focal point, as fractions of the image, the crop centres on. */
const BACKS = [
  { out: 'aurora-flow', source: 'aurora-flow', fx: 0.5, fy: 0.45 },
  { out: 'retro-swoosh', source: 'retro-swoosh', fx: 0.36, fy: 0.46 },
  { out: 'first-light', source: 'first-light', fx: 0.72, fy: 0.4 },
  { out: 'cobalt-beacon', source: 'cobalt-beacon', fx: 0.86, fy: 0.5 },
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backofficeDir = resolve(scriptDir, '..');
const sourceDir = resolve(backofficeDir, '../../Umbraco.Community.UmbraDesktop/backoffice/wallpapers-src');
const outputDir = join(backofficeDir, 'public', 'solitaire', 'backs');

await mkdir(outputDir, { recursive: true });
for (const back of BACKS) {
  const source = join(sourceDir, `${back.source}.png`);
  const target = join(outputDir, `${back.out}.avif`);
  if (!existsSync(source)) throw new Error(`Missing wallpaper source ${source}`);
  if (existsSync(target) && (await stat(target)).mtimeMs >= (await stat(source)).mtimeMs) continue;
  const { width, height } = await sharp(source).metadata();
  const cropH = Math.round(height * HEIGHT_FRACTION);
  const cropW = Math.round((cropH * OUT_W) / OUT_H);
  const left = Math.min(width - cropW, Math.max(0, Math.round(back.fx * width - cropW / 2)));
  const top = Math.min(height - cropH, Math.max(0, Math.round(back.fy * height - cropH / 2)));
  await sharp(source)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(OUT_W, OUT_H)
    .avif({ quality: QUALITY })
    .toFile(target);
  console.log(`card back ${back.out}: ${cropW}x${cropH} at ${left},${top}`);
}
```

- [ ] **Step 3: The Windows 98 back, drawn**

Create `backoffice/public/solitaire/backs/win98.svg` with the design's Windows 98 back (teal dither,
bevelled plate, navy logomark). Take the markup from `BACKS.win98` in the mock generator, wrapped
as a standalone document. The logomark path is Umbraco's
`umbraco_logomark_white.svg` (from the `Umbraco.Cms.StaticAssets` package,
`umbraco/assets/img/application/`), copied verbatim:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">
  <defs>
    <pattern id="d" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#008080"/>
      <rect width="2" height="2" fill="#006d6d"/>
      <rect x="2" y="2" width="2" height="2" fill="#006d6d"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="100" height="140" fill="url(#d)"/>
  <path d="M0,140 V0 H100" fill="none" stroke="#5fbfbf" stroke-width="2"/>
  <path d="M0,140 H100 V0" fill="none" stroke="#004040" stroke-width="2"/>
  <rect x="29" y="49" width="42" height="42" fill="#c0c0c0"/>
  <path d="M29,91 V49 H71" fill="none" stroke="#fff" stroke-width="1.6"/>
  <path d="M29,91 H71 V49" fill="none" stroke="#000" stroke-width="1.6"/>
  <path d="M30.6,89.4 H69.4 V50.6" fill="none" stroke="#808080" stroke-width="1.2"/>
  <path fill="#000080" transform="translate(36 56) scale(0.08864)" d="M0 157.74a157.95 157.95 0 11158 158.15A157.95 157.95 0 010 157.74zm154.74 54.09a155.41 155.41 0 01-36.5-3.29 27.92 27.92 0 01-19.94-16q-5.35-12.34-5.21-38.1a243 243 0 011.69-26.84q1.55-13 3.09-21.46l1.07-5.59a2 2 0 000-.49 3.2 3.2 0 00-2.65-3.17l-20.37-3.22h-.44a3.19 3.19 0 00-3.11 2.48c-.35 1.31-.56 2.27-1.17 5.38-1.16 6-2.24 11.85-3.43 20.38a264.17 264.17 0 00-2.3 27.94 145.24 145.24 0 000 19.57q.72 25.94 8.9 41.42t27.72 22.3q19.53 6.81 54.43 6.66h2.91q34.94.15 54.41-6.66t27.71-22.3q8.17-15.53 8.91-41.42a145.24 145.24 0 000-19.57 266.84 266.84 0 00-2.3-27.94c-1.2-8.44-2.27-14.26-3.44-20.38-.61-3.11-.81-4.07-1.16-5.38a3.21 3.21 0 00-3.12-2.48h-.52l-20.38 3.18a3.2 3.2 0 00-2.68 3.17 4 4 0 000 .49l1.08 5.59q1.55 8.48 3.12 21.46a245.68 245.68 0 011.65 26.84q.27 25.69-5.21 38.07a27.9 27.9 0 01-19.76 16.07 155.19 155.19 0 01-36.48 3.29z"/>
</svg>
```

(`0.08864` is `28 / 315.89`: the logomark's 315.89 viewBox scaled to 28 units, centred at 50,70.)
The path is copied verbatim from that file.

- [ ] **Step 4: Wire the build and ignore the output**

In `package.json`:

```json
"build": "cd backoffice && node scripts/build-card-backs.mjs && tsc && vite build",
"watch": "cd backoffice && node scripts/build-card-backs.mjs && tsc && vite build --watch",
```

Append to the repository's `.gitignore`, next to the wallpaper entry:

```
# Solitaire card backs. Build output: backoffice/scripts/build-card-backs.mjs cuts them from the
# host's committed wallpaper PNGs. win98.svg is drawn by hand and is committed.
**/backoffice/public/solitaire/backs/*.avif
```

- [ ] **Step 5: Run the build and look at the output**

Run: `npm run build`
Expected: four `card back ...` lines, four AVIFs in `backoffice/public/solitaire/backs/`, and the
same files under `wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Entertainment/solitaire/backs/`.
Open each AVIF in a browser and check the crop shows the part of the wallpaper the mock showed.

- [ ] **Step 6: Leave uncommitted.**

---

### Task 9: Court card art

**Files:**
- Create: `backoffice/art/fomin/*.svg` (12 files), `backoffice/art/fomin/SOURCES.md`
- Create: `backoffice/scripts/build-courts.mjs`
- Create: `backoffice/src/solitaire/faces/classic/courts.generated.ts`
- Modify: `package.json` (devDependency `svgo`, script `courts`)

Downloading files needs the repository owner's go-ahead: ask before Step 1, naming the files and
their source.

- [ ] **Step 1: Download the twelve courts and check each licence**

From <https://commons.wikimedia.org/wiki/Category:SVG_English_pattern_playing_cards>, the King,
Queen and Jack of each suit by Dmitry Fomin. For each file, open its Commons file page and confirm
the licence section says CC0 1.0 and the source says "Own work". Save as
`backoffice/art/fomin/<rank><suit>.svg` using this package's ids (`11S` jack of spades, `12H` queen
of hearts, `13D` king of diamonds, and so on).

Write `backoffice/art/fomin/SOURCES.md`: one line per file with the Commons page URL, "CC0 1.0,
own work, checked 2026-MM-DD". If any file is not CC0, stop and report; do not substitute.

- [ ] **Step 2: Find the picture area**

Fomin's cards are whole cards, with their own corner indices and frame. We draw our own corners, so
only the picture inside the frame is used. Open `13S.svg` in a browser, find the frame rectangle
that encloses the figure (all twelve share one template), and record its bounds in the source
file's coordinates as `x y width height`. Check the same box fits `11H.svg` and `12D.svg`.

- [ ] **Step 3: Add svgo and write the script**

Run: `npm install --save-dev svgo`

```js
// backoffice/scripts/build-courts.mjs
/**
 * Turns Dmitry Fomin's CC0 English pattern courts (backoffice/art/fomin) into the markup the classic
 * face set draws (design D8): optimised by svgo, every id prefixed per card so 52 cards can share a
 * shadow root, and every colour mapped onto the Umbraco palette by hue.
 *
 * Run by hand with `npm run courts` when the art changes; the output is committed, as the host's
 * wallpaper catalogue is, because TypeScript imports it.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

/** The picture area inside Fomin's frame, from Task 9 Step 2. */
const PICTURE_VIEWBOX = 'FILL IN FROM STEP 2';

/** The Umbraco palette the courts are recoloured into. Same values as `faces/classic/suits.ts`. */
const PALETTE = { red: '#c8283f', blue: '#3544b1', gold: '#e0ab45', ink: '#16204a' };

/**
 * A colour's replacement: greys and whites stay, dark goes to ink, and the three chromatic
 * families go to red, gold and blue by hue.
 * @param hex A `#rrggbb` or `#rgb` colour.
 * @returns The replacement.
 */
function recolour(hex) {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  if (s < 0.15) return l < 0.25 ? PALETTE.ink : hex;
  let h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
  h = (h * 60 + 360) % 360;
  if (h < 20 || h >= 330) return PALETTE.red;
  if (h < 70) return PALETTE.gold;
  if (h >= 190 && h < 260) return PALETTE.blue;
  return hex;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const artDir = resolve(scriptDir, '../art/fomin');
const outFile = resolve(scriptDir, '../src/solitaire/faces/classic/courts.generated.ts');

const entries = [];
for (const file of (await readdir(artDir)).filter((f) => f.endsWith('.svg')).sort()) {
  const id = file.replace('.svg', '');
  const source = await readFile(join(artDir, file), 'utf8');
  const { data } = optimize(source, {
    multipass: true,
    plugins: ['preset-default', { name: 'prefixIds', params: { prefix: `court${id}`, delim: '-' } }],
  });
  const recoloured = data.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (m) => recolour(m));
  // Keep the inner markup; the classic face set supplies its own <svg> wrapper and viewBox.
  const inner = recoloured.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  entries.push(`  '${id}': ${JSON.stringify(inner)},`);
}

await writeFile(
  outFile,
  `// Generated by scripts/build-courts.mjs from backoffice/art/fomin (CC0 1.0, Dmitry Fomin). Do not edit.\n` +
    `/** The picture area of every court, in the source files' coordinates. */\n` +
    `export const COURT_VIEWBOX = '${PICTURE_VIEWBOX}';\n` +
    `/** Each court's recoloured markup, keyed by card id. */\n` +
    `export const COURTS: Readonly<Record<string, string>> = {\n${entries.join('\n')}\n};\n`,
);
console.log(`courts: ${entries.length} written to ${outFile}`);
```

Replace `FILL IN FROM STEP 2` with the recorded box before running. Add to `package.json`
`"courts": "cd backoffice && node scripts/build-courts.mjs"`.

Named colours (`red`, `black`) and `rgb()` values are not matched by the regex. After the run,
search the output for `fill="[a-z]` and `rgb(`; if any exist, extend the replacement to cover them.

- [ ] **Step 4: Run it and look**

Run: `npm run courts`
Expected: `courts: 12 written`. The generated file exports 12 entries and `COURT_VIEWBOX`.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 10: The classic face set

**Files:**
- Create: `backoffice/src/solitaire/faces/classic/suits.ts`
- Replace: `backoffice/src/solitaire/faces/classic/classic.ts`
- Test: `backoffice/src/solitaire/faces/classic/classic.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backoffice/src/solitaire/faces/classic/classic.test.ts
import { expect } from '@open-wc/testing';
import classic from './classic.js';
import { createDeck } from '../../rules.js';

/** Parse one rendered card. */
function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, 'image/svg+xml');
}

describe('classic face set', () => {
  const rendered = createDeck().map((card) => ({ card, svg: classic.render(card) }));

  it('renders every card as a well-formed 100 x 140 SVG', () => {
    for (const { card, svg } of rendered) {
      const doc = parse(svg);
      expect(doc.querySelector('parsererror'), card.id).to.equal(null);
      expect(doc.documentElement.getAttribute('viewBox'), card.id).to.equal('0 0 100 140');
    }
  });

  it('draws as many pips as a number card is worth', () => {
    for (const { card, svg } of rendered.filter((r) => r.card.rank >= 2 && r.card.rank <= 10)) {
      expect(parse(svg).querySelectorAll('[data-pip]').length, card.id).to.equal(card.rank);
    }
  });

  it('draws the court art on jacks, queens and kings, and the logomark on the ace of spades', () => {
    for (const { card, svg } of rendered.filter((r) => r.card.rank >= 11)) {
      expect(parse(svg).querySelector('[data-court]'), card.id).to.not.equal(null);
    }
    expect(parse(rendered.find((r) => r.card.id === '1S')!.svg).querySelector('[data-logomark]')).to.not.equal(null);
  });

  it('keeps every id unique across the whole deck, since all 52 share a shadow root', () => {
    const ids = rendered.flatMap(({ svg }) => [...parse(svg).querySelectorAll('[id]')].map((el) => el.id));
    expect(new Set(ids).size).to.equal(ids.length);
  });
});
```

`expect(...).to.equal(null)` on a passing case is fine; the hang noted in the ground rules happens
only when such an assertion fails. If it fails here, change it to `to.equal(false)` over
`!!doc.querySelector(...)`.

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL, the stub renders nothing.

- [ ] **Step 3: Implement `suits.ts`**

```ts
// backoffice/src/solitaire/faces/classic/suits.ts
/**
 * The classic face set's drawing parts: suit shapes in a 20-unit box centred on 0,0, the two ink
 * colours, and Umbraco's logomark. The suit paths are this package's own, drawn for it.
 */
import type { Suit } from '../../rules.js';

/** Red suits' ink. */
export const RED = '#c8283f';
/** Black suits' ink: Umbraco's navy, not black, so the deck reads as Umbraco's. */
export const INK = '#16204a';
/** The card face. */
export const FACE = '#fffdf8';

/**
 * Umbraco's logomark, the `d` of `umbraco_logomark_white.svg` in the Umbraco.Cms.StaticAssets
 * package (viewBox 315.89 square). Copied verbatim.
 */
export const LOGOMARK = 'M0 157.74a157.95 157.95 0 11158 158.15A157.95 157.95 0 010 157.74zm154.74 54.09a155.41 155.41 0 01-36.5-3.29 27.92 27.92 0 01-19.94-16q-5.35-12.34-5.21-38.1a243 243 0 011.69-26.84q1.55-13 3.09-21.46l1.07-5.59a2 2 0 000-.49 3.2 3.2 0 00-2.65-3.17l-20.37-3.22h-.44a3.19 3.19 0 00-3.11 2.48c-.35 1.31-.56 2.27-1.17 5.38-1.16 6-2.24 11.85-3.43 20.38a264.17 264.17 0 00-2.3 27.94 145.24 145.24 0 000 19.57q.72 25.94 8.9 41.42t27.72 22.3q19.53 6.81 54.43 6.66h2.91q34.94.15 54.41-6.66t27.71-22.3q8.17-15.53 8.91-41.42a145.24 145.24 0 000-19.57 266.84 266.84 0 00-2.3-27.94c-1.2-8.44-2.27-14.26-3.44-20.38-.61-3.11-.81-4.07-1.16-5.38a3.21 3.21 0 00-3.12-2.48h-.52l-20.38 3.18a3.2 3.2 0 00-2.68 3.17 4 4 0 000 .49l1.08 5.59q1.55 8.48 3.12 21.46a245.68 245.68 0 011.65 26.84q.27 25.69-5.21 38.07a27.9 27.9 0 01-19.76 16.07 155.19 155.19 0 01-36.48 3.29z';

/** Path data for the three suits drawn as one path. Clubs are three circles and a stem, see {@link suitMarkup}. */
const PATHS: Partial<Record<Suit, string>> = {
  H: 'M0,8 C-4,4 -9,0.5 -9,-3.5 C-9,-6.8 -6.6,-9 -4.3,-9 C-2.3,-9 -0.8,-7.8 0,-6.2 C0.8,-7.8 2.3,-9 4.3,-9 C6.6,-9 9,-6.8 9,-3.5 C9,0.5 4,4 0,8Z',
  D: 'M0,-9.5 C1.8,-6 4.6,-2.6 7.5,0 C4.6,2.6 1.8,6 0,9.5 C-1.8,6 -4.6,2.6 -7.5,0 C-4.6,-2.6 -1.8,-6 0,-9.5Z',
  S: 'M0,-9 C-4,-5 -9,-1.5 -9,2.5 C-9,5.8 -6.6,7.6 -4.3,7.6 C-2.6,7.6 -1.2,6.8 -0.5,5.6 C-0.6,7.4 -1.4,8.6 -3,9.5 L3,9.5 C1.4,8.6 0.6,7.4 0.5,5.6 C1.2,6.8 2.6,7.6 4.3,7.6 C6.6,7.6 9,5.8 9,2.5 C9,-1.5 4,-5 0,-9Z',
};

/**
 * Whether a suit is drawn in red.
 * @param suit The suit.
 * @returns True for hearts and diamonds.
 */
export function inkFor(suit: Suit): string {
  return suit === 'H' || suit === 'D' ? RED : INK;
}

/**
 * One suit symbol.
 * @param suit The suit.
 * @param x Centre x.
 * @param y Centre y.
 * @param size Height in card units.
 * @param flip Upside down, for the lower half of a card.
 * @param attrs Extra attributes, e.g. `data-pip`.
 * @returns SVG markup.
 */
export function suitMarkup(suit: Suit, x: number, y: number, size: number, flip = false, attrs = ''): string {
  const t = `translate(${x} ${y}) scale(${size / 20})${flip ? ' rotate(180)' : ''}`;
  const fill = inkFor(suit);
  if (suit === 'C') {
    return `<g ${attrs} transform="${t}" fill="${fill}"><circle cx="0" cy="-4.6" r="4.3"/><circle cx="-4.7" cy="1.7" r="4.3"/><circle cx="4.7" cy="1.7" r="4.3"/><circle cx="0" cy="0.6" r="2.2"/><path d="M-0.9,1 C-0.9,5 -1.8,7.8 -3.4,9.5 L3.4,9.5 C1.8,7.8 0.9,5 0.9,1Z"/></g>`;
  }
  return `<path ${attrs} d="${PATHS[suit]}" fill="${fill}" transform="${t}"/>`;
}
```

- [ ] **Step 4: Implement `classic.ts`**

```ts
// backoffice/src/solitaire/faces/classic/classic.ts
/**
 * Classic: the default face set (design D8). Pips in the standard layouts, a serif rank in
 * two corners, the ace of spades carrying the logomark, and Fomin's CC0 courts recoloured.
 */
import type { SolitaireCardValue, SolitaireFaceSet } from '../../extensions.js';
import { COURTS, COURT_VIEWBOX } from './courts.generated.js';
import { FACE, INK, LOGOMARK, inkFor, suitMarkup } from './suits.js';

/** Pip centres for 2 to 10, in card units. Anything below the middle is drawn upside down. */
const PIPS: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  2: [[50, 30], [50, 110]],
  3: [[50, 30], [50, 70], [50, 110]],
  4: [[32, 30], [68, 30], [32, 110], [68, 110]],
  5: [[32, 30], [68, 30], [50, 70], [32, 110], [68, 110]],
  6: [[32, 30], [68, 30], [32, 70], [68, 70], [32, 110], [68, 110]],
  7: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [32, 110], [68, 110]],
  8: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [50, 90], [32, 110], [68, 110]],
  9: [[32, 30], [68, 30], [32, 56.7], [68, 56.7], [50, 70], [32, 83.3], [68, 83.3], [32, 110], [68, 110]],
  10: [[32, 30], [68, 30], [50, 43], [32, 56.7], [68, 56.7], [32, 83.3], [68, 83.3], [50, 97], [32, 110], [68, 110]],
};

/** What the corner index says. */
const RANK_LABEL: Readonly<Record<number, string>> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

/** Serif for the ranks; falls back to the platform's serif, never to a web font download. */
const RANK_FONT = "Georgia, 'Times New Roman', serif";

/**
 * The two corner indices.
 * @param card The card.
 * @returns SVG markup.
 */
function corners(card: SolitaireCardValue): string {
  const label = RANK_LABEL[card.rank] ?? String(card.rank);
  const size = label.length > 1 ? 14 : 15;
  const one =
    `<text x="10.5" y="19" font-family="${RANK_FONT}" font-weight="700" font-size="${size}" ` +
    `letter-spacing="${label.length > 1 ? -1.4 : 0}" text-anchor="middle" fill="${inkFor(card.suit)}">${label}</text>` +
    suitMarkup(card.suit, 10.5, 28, 9);
  return `${one}<g transform="rotate(180 50 70)">${one}</g>`;
}

/**
 * The middle of the card.
 * @param card The card.
 * @returns SVG markup.
 */
function body(card: SolitaireCardValue): string {
  if (card.rank === 1) {
    if (card.suit !== 'S') return suitMarkup(card.suit, 50, 70, 30);
    return (
      suitMarkup('S', 50, 68, 54) +
      `<circle cx="50" cy="63" r="9.5" fill="${FACE}"/>` +
      `<path data-logomark d="${LOGOMARK}" fill="${INK}" transform="translate(42 55) scale(${16 / 315.89})"/>`
    );
  }
  if (card.rank >= 11) {
    const id = `${card.rank}${card.suit}`;
    return (
      `<rect x="18" y="17" width="64" height="106" rx="3" fill="${FACE}" stroke="${inkFor(card.suit)}" stroke-width=".8"/>` +
      `<svg data-court x="18.5" y="17.5" width="63" height="105" viewBox="${COURT_VIEWBOX}" preserveAspectRatio="xMidYMid slice">${COURTS[id] ?? ''}</svg>`
    );
  }
  return PIPS[card.rank].map(([x, y]) => suitMarkup(card.suit, x, y, 15, y > 70, 'data-pip')).join('');
}

/** The face set. */
const classic: SolitaireFaceSet = {
  render(card) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">` +
      `<rect x=".5" y=".5" width="99" height="139" rx="7" fill="${FACE}" stroke="rgba(22,32,74,.14)"/>` +
      corners(card) +
      body(card) +
      `</svg>`
    );
  },
};

export default classic;
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test` then `npm run build`
Expected: PASS. If the unique-id case fails, the court markup has ids the prefixer missed: check the
generated file for `id="` values without the `court<id>-` prefix and fix the svgo config.

- [ ] **Step 6: Leave uncommitted.**

---

### Task 11: Motion and the cascade

**Files:**
- Create: `backoffice/src/solitaire/motion.ts`, `backoffice/src/solitaire/cascade.ts`
- Test: `backoffice/src/solitaire/motion.test.ts`, `backoffice/src/solitaire/cascade.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backoffice/src/solitaire/motion.test.ts
import { expect, fixture, html } from '@open-wc/testing';
import { playFlip, snapshot } from './motion.js';

describe('solitaire motion', () => {
  async function box(): Promise<HTMLElement> {
    const root = await fixture<HTMLElement>(html`<div style="position:relative;width:400px;height:400px">
      <div data-id="a" style="position:absolute;left:0;top:0;width:10px;height:10px"></div>
    </div>`);
    return root.querySelector<HTMLElement>('[data-id="a"]')!;
  }

  it('animates a card from where it was to where it is', async () => {
    const card = await box();
    const before = snapshot([card]);
    card.style.left = '100px';
    const animations = playFlip([card], before, { duration: 200, stagger: 0, reduced: false });
    expect(animations.length).to.equal(1);
    const first = (animations[0].effect as KeyframeEffect).getKeyframes()[0].transform;
    expect(first).to.equal('translate(-100px, 0px)');
  });

  it('does not animate a card that did not move', async () => {
    const card = await box();
    expect(playFlip([card], snapshot([card]), { duration: 200, stagger: 0, reduced: false }).length).to.equal(0);
  });

  it('does nothing with reduced motion', async () => {
    const card = await box();
    const before = snapshot([card]);
    card.style.left = '100px';
    expect(playFlip([card], before, { duration: 200, stagger: 0, reduced: true }).length).to.equal(0);
    expect(card.getAnimations().length).to.equal(0);
  });
});
```

```ts
// backoffice/src/solitaire/cascade.test.ts
import { expect } from '@open-wc/testing';
import { stepBouncer } from './cascade.js';

describe('solitaire cascade', () => {
  it('falls under gravity and moves sideways', () => {
    const next = stepBouncer({ x: 0, y: 0, vx: 3, vy: 0 }, 100, 1, 0.7);
    expect(next).to.deep.equal({ x: 3, y: 0, vx: 3, vy: 1 });
  });

  it('bounces off the floor, losing energy', () => {
    const next = stepBouncer({ x: 0, y: 99, vx: 3, vy: 10 }, 100, 1, 0.7);
    expect(next.y).to.equal(100);
    expect(next.vy).to.be.closeTo(-7, 0.001);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` → FAIL.

- [ ] **Step 3: Implement**

```ts
// backoffice/src/solitaire/motion.ts
/**
 * FLIP for cards (design D4): record where every card is, let the state change move them, then
 * animate each from its old place to its new one. One code path for dealing, snapping back, flying
 * home and auto-finish.
 */

/** Where each card was, by `data-id`. */
export type Snapshot = Map<string, { readonly x: number; readonly y: number }>;

/**
 * Record the on-screen position of each card.
 * @param cards Card elements carrying `data-id`.
 * @returns Their positions.
 */
export function snapshot(cards: Iterable<HTMLElement>): Snapshot {
  const out: Snapshot = new Map();
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    out.set(card.dataset.id ?? '', { x: rect.left, y: rect.top });
  }
  return out;
}

/** How to animate. */
export interface FlipOptions {
  readonly duration: number;
  /** Extra delay per moving card, in the order they are given. */
  readonly stagger: number;
  /** Reduced motion: move instantly. */
  readonly reduced: boolean;
}

/**
 * Animate every card that moved since the snapshot.
 * @param cards Card elements, already in their new places.
 * @param before The snapshot taken before the change.
 * @param options Timing.
 * @returns The animations started, for tests and for awaiting.
 */
export function playFlip(cards: Iterable<HTMLElement>, before: Snapshot, options: FlipOptions): Animation[] {
  if (options.reduced) return [];
  const started: Animation[] = [];
  for (const card of cards) {
    const from = before.get(card.dataset.id ?? '');
    if (!from) continue;
    const rect = card.getBoundingClientRect();
    const dx = from.x - rect.left;
    const dy = from.y - rect.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    started.push(
      card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], {
        duration: options.duration,
        delay: started.length * options.stagger,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      }),
    );
  }
  return started;
}
```

```ts
// backoffice/src/solitaire/cascade.ts
/**
 * The win cascade (design D4): cards leave the foundations one by one, bounce along the bottom of the
 * window and leave a trail. On a canvas, because the trail is hundreds of copies of a card.
 */

/** One moving card, in px and px per frame. */
export interface Bouncer { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number }

/**
 * One frame of a card's flight.
 * @param b The card now.
 * @param floor The lowest y its top edge may reach.
 * @param gravity Added to vy each frame.
 * @param damping Share of vertical speed kept after a bounce.
 * @returns The card one frame later.
 */
export function stepBouncer(b: Bouncer, floor: number, gravity: number, damping: number): Bouncer {
  let y = b.y + b.vy;
  let vy = b.vy + gravity;
  if (y > floor) {
    y = floor;
    vy = -b.vy * damping;
  }
  return { x: b.x + b.vx, y, vx: b.vx, vy };
}

/** A card the cascade launches: its image and where it starts. */
export interface CascadeCard { readonly image: CanvasImageSource; readonly x: number; readonly y: number }

/** Runs the cascade on a canvas until every card has left, or until stopped. */
export class WinCascade {
  #frame = 0;
  #stopped = false;
  #resolve: () => void = () => {};

  /**
   * @param canvas The canvas, already sized to the element in CSS px.
   * @param cards Cards in launch order.
   * @param size The card size in CSS px.
   * @param random Source of randomness; injected for tests.
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cards: ReadonlyArray<CascadeCard>,
    private readonly size: { readonly w: number; readonly h: number },
    private readonly random: () => number = Math.random,
  ) {}

  /**
   * Start. Sizes the backing store in device pixels so the cards stay sharp on high-DPI screens.
   * @returns Resolves when the last card has left or {@link stop} was called.
   */
  start(): Promise<void> {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    const ctx = this.canvas.getContext('2d');
    if (!ctx || this.cards.length === 0) return Promise.resolve();
    ctx.scale(dpr, dpr);
    const floor = height - this.size.h;
    let index = 0;
    let current: Bouncer | undefined;
    return new Promise((resolve) => {
      this.#resolve = resolve;
      const tick = () => {
        if (this.#stopped) return;
        if (!current) {
          if (index >= this.cards.length) return this.#finish();
          const card = this.cards[index];
          const speed = 2 + this.random() * 5;
          current = { x: card.x, y: card.y, vx: this.random() < 0.5 ? -speed : speed, vy: -this.random() * 8 };
        }
        current = stepBouncer(current, floor, 0.9, 0.72);
        ctx.drawImage(this.cards[index].image, current.x, current.y, this.size.w, this.size.h);
        if (current.x < -this.size.w || current.x > width) {
          current = undefined;
          index++;
        }
        this.#frame = requestAnimationFrame(tick);
      };
      this.#frame = requestAnimationFrame(tick);
    });
  }

  /** End it early: a click or a key. */
  stop(): void {
    this.#stopped = true;
    cancelAnimationFrame(this.#frame);
    this.#finish();
  }

  /** Resolve once. */
  #finish(): void {
    const resolve = this.#resolve;
    this.#resolve = () => {};
    resolve();
  }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS. If the keyframe string differs (`translate(-100px)` without the `0px`), assert on
`startsWith('translate(-100px')` rather than changing the code.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 12: The settings modal

**Files:**
- Create: `backoffice/src/solitaire/settings-modal.element.ts`
- Test: `backoffice/src/solitaire/settings-modal.element.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backoffice/src/solitaire/settings-modal.element.test.ts
import { expect, fixture, html, oneEvent } from '@open-wc/testing';
import './settings-modal.element.js';
import type { SolitaireSettingsModalElement } from './settings-modal.element.js';

describe('solitaire settings modal', () => {
  async function modal(): Promise<SolitaireSettingsModalElement> {
    return fixture<SolitaireSettingsModalElement>(html`<umbradesktop-solitaire-settings
      .drawCount=${1}
      .backs=${[{ alias: 'a', label: 'A', image: '/a.avif' }, { alias: 'b', label: 'B', image: '/b.avif' }]}
      .faces=${[{ alias: 'f', label: 'F', preview: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"></svg>' }]}
      .selectedBack=${'a'}
      .selectedFaces=${'f'}
    ></umbradesktop-solitaire-settings>`);
  }

  const q = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)!;

  it('is a dialog that says what it is', async () => {
    const el = await modal();
    expect(q(el, '[role="dialog"]').getAttribute('aria-modal')).to.equal('true');
  });

  it('marks the current choices', async () => {
    const el = await modal();
    expect(q(el, '[data-draw="1"]').getAttribute('aria-pressed')).to.equal('true');
    expect(q(el, '[data-back="a"]').getAttribute('aria-pressed')).to.equal('true');
    expect(q(el, '[data-back="b"]').getAttribute('aria-pressed')).to.equal('false');
  });

  it('reports each change as it is made', async () => {
    const el = await modal();
    setTimeout(() => q(el, '[data-draw="3"]').click());
    expect((await oneEvent(el, 'solitaire-settings-change')).detail).to.deep.equal({ drawCount: 3 });
    setTimeout(() => q(el, '[data-back="b"]').click());
    expect((await oneEvent(el, 'solitaire-settings-change')).detail).to.deep.equal({ back: 'b' });
  });

  it('closes on Done and on Escape', async () => {
    const el = await modal();
    setTimeout(() => q(el, '.done').click());
    await oneEvent(el, 'solitaire-settings-close');
    setTimeout(() => q(el, '[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })));
    await oneEvent(el, 'solitaire-settings-close');
  });

  it('puts focus inside when it opens', async () => {
    const el = await modal();
    expect(el.shadowRoot!.activeElement).to.not.equal(null);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` → FAIL.

- [ ] **Step 3: Implement**

```ts
// backoffice/src/solitaire/settings-modal.element.ts
/**
 * Solitaire's settings (design D6): draw mode, card back and card faces. Rendered inside the game's
 * own shadow root and laid over its table, never over the desktop, because it only concerns this
 * window. A native <dialog> is not used: `showModal()` puts it in the top layer over the whole page.
 * Changes are reported as they are made; the game applies and stores them.
 */
import { css, customElement, html, property, unsafeSVG } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { DrawCount } from './rules.js';

/** A back as the modal shows it. */
export interface BackChoice { readonly alias: string; readonly label: string; readonly image: string }
/** A face set as the modal shows it. */
export interface FacesChoice { readonly alias: string; readonly label: string; readonly preview: string }

/** Localisation area. */
const AREA = 'umbraDesktopEntertainment';

@customElement('umbradesktop-solitaire-settings')
export class SolitaireSettingsModalElement extends UmbLitElement {
  /** The draw mode the next game will use. */
  @property({ attribute: false }) drawCount: DrawCount = 1;
  /** Every registered back, resolved for the current theme. */
  @property({ attribute: false }) backs: ReadonlyArray<BackChoice> = [];
  /** Every registered face set. */
  @property({ attribute: false }) faces: ReadonlyArray<FacesChoice> = [];
  /** The chosen back's alias. */
  @property({ attribute: false }) selectedBack = '';
  /** The chosen face set's alias. */
  @property({ attribute: false }) selectedFaces = '';

  /** Focus the first control, so keyboard users land inside. */
  protected override firstUpdated(): void {
    this.shadowRoot?.querySelector<HTMLElement>('button')?.focus();
  }

  /**
   * Report one change.
   * @param detail The changed field.
   */
  #change(detail: Partial<{ drawCount: DrawCount; back: string; faces: string }>): void {
    this.dispatchEvent(new CustomEvent('solitaire-settings-change', { detail, bubbles: true, composed: true }));
  }

  /** Ask the game to close the modal. */
  #close(): void {
    this.dispatchEvent(new CustomEvent('solitaire-settings-close', { bubbles: true, composed: true }));
  }

  /** Escape closes, as in any dialog. */
  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.#close();
    }
  };

  /** A label that may be a `#` token. */
  #label(label: string): string {
    return this.localize.string(label);
  }

  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    return html`
      <div class="scrim" @click=${(e: Event) => e.target === e.currentTarget && this.#close()}>
        <div class="panel" role="dialog" aria-modal="true" aria-labelledby="title" @keydown=${this.#onKeydown}>
          <header>
            <h2 id="title">${t('solitaireSettingsTitle', 'Settings')}</h2>
            <button class="x" aria-label=${t('solitaireClose', 'Close')} @click=${() => this.#close()}>&times;</button>
          </header>
          <section>
            <h3>${t('solitaireGame', 'Game')}</h3>
            <div class="seg">
              ${([1, 3] as const).map(
                (n) => html`<button data-draw=${n} aria-pressed=${String(this.drawCount === n)}
                  @click=${() => { this.drawCount = n; this.#change({ drawCount: n }); }}>
                  ${n === 1 ? t('solitaireDrawOne', 'Draw one') : t('solitaireDrawThree', 'Draw three')}
                </button>`,
              )}
            </div>
            <p class="help">${t('solitaireDrawNextGame', 'A change here starts with your next game.')}</p>
          </section>
          <section>
            <h3>${t('solitaireCardBack', 'Card back')}</h3>
            <div class="choices">
              ${this.backs.map(
                (b) => html`<button class="choice" data-back=${b.alias} aria-pressed=${String(this.selectedBack === b.alias)}
                  @click=${() => { this.selectedBack = b.alias; this.#change({ back: b.alias }); }}>
                  <span class="thumb"><img src=${b.image} alt="" /></span><span>${this.#label(b.label)}</span>
                </button>`,
              )}
            </div>
          </section>
          <section>
            <h3>${t('solitaireCardFaces', 'Card faces')}</h3>
            <div class="choices">
              ${this.faces.map(
                (f) => html`<button class="choice" data-faces=${f.alias} aria-pressed=${String(this.selectedFaces === f.alias)}
                  @click=${() => { this.selectedFaces = f.alias; this.#change({ faces: f.alias }); }}>
                  <span class="thumb">${unsafeSVG(f.preview)}</span><span>${this.#label(f.label)}</span>
                </button>`,
              )}
            </div>
          </section>
          <footer><button class="done" @click=${() => this.#close()}>${t('solitaireDone', 'Done')}</button></footer>
        </div>
      </div>
    `;
  }

  static override styles = css`
    :host { position: absolute; inset: 0; z-index: 20; }
    .scrim { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgb(10 14 36 / 55%); backdrop-filter: blur(3px); }
    .panel { width: min(560px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font-family: var(--umbradesktop-app-font, inherit);
      border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: calc(var(--umbradesktop-app-radius, 3px) * 3);
      box-shadow: 0 30px 70px rgb(0 0 0 / 45%); }
    header, section, footer { padding: 12px 20px; }
    header { display: flex; justify-content: space-between; align-items: center; }
    h2 { margin: 0; font-size: 18px; }
    h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt)); }
    button { font: inherit; color: inherit; cursor: pointer;
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px); padding: 6px 14px; }
    button[aria-pressed='true'] { background: var(--umbradesktop-app-accent, var(--uui-color-selected));
      color: var(--umbradesktop-app-accent-text, var(--uui-color-surface)); }
    button:focus-visible { outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected)); outline-offset: 2px; }
    .seg { display: inline-flex; gap: 4px; }
    .help { margin: 8px 0 0; font-size: 13px; color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt)); }
    .choices { display: flex; flex-wrap: wrap; gap: 10px; }
    .choice { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 80px; padding: 6px; font-size: 12px; }
    .thumb { display: block; width: 56px; height: 78px; }
    .thumb img, .thumb svg { width: 100%; height: 100%; border-radius: 5px; display: block; object-fit: cover; }
    footer { display: flex; justify-content: flex-end;
      border-top: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt)); }
  `;
}

declare global {
  interface HTMLElementTagNameMap { 'umbradesktop-solitaire-settings': SolitaireSettingsModalElement }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 13: The game element: rendering

**Files:**
- Create: `backoffice/src/solitaire/solitaire.element.ts`
- Test: `backoffice/src/solitaire/solitaire.element.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backoffice/src/solitaire/solitaire.element.test.ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './solitaire.element.js';
import type { SolitaireElement } from './solitaire.element.js';
import { SavedGameStore } from './saved-games.js';
import { MemoryStorage } from './memory-storage.test-helper.js';
import { SOLITAIRE_CONTENT_SIZE } from './constants.js';
import type { KlondikeGame, Shuffler } from './rules.js';

/** The unshuffled deck: t0 is the ace of spades, t1 ends on 3S, t4 ends on 2H (see rules tests). */
export const identity: Shuffler = (cards) => [...cards];

/**
 * A mounted game at the default size, with its own storage so no case sees another's saves.
 * @param options Overrides.
 * @returns The element, once its cards are drawn.
 */
export async function solitaire(options: { game?: KlondikeGame; store?: SavedGameStore } = {}): Promise<SolitaireElement> {
  const store = options.store ?? new SavedGameStore(() => new MemoryStorage());
  const el = await fixture<SolitaireElement>(html`<umbradesktop-solitaire
    style="display:block;width:${SOLITAIRE_CONTENT_SIZE.w}px;height:${SOLITAIRE_CONTENT_SIZE.h}px"
    .shuffle=${identity}
    .startingGame=${options.game}
    .store=${store}
    .settingsStorage=${() => new MemoryStorage()}
    .reducedMotion=${() => true}
  ></umbradesktop-solitaire>`);
  await waitUntil(() => cards(el).length === 52 && el.shadowRoot!.querySelector('.card.up .front svg'), 'cards drawn');
  return el;
}

/** Every card element. */
export const cards = (el: SolitaireElement) => [...el.shadowRoot!.querySelectorAll<HTMLElement>('.card')];
/** One card by id. */
export const cardEl = (el: SolitaireElement, id: string) => el.shadowRoot!.querySelector<HTMLElement>(`.card[data-id="${id}"]`)!;
/** A toolbar readout. */
export const readout = (el: SolitaireElement, name: string) => (el.shadowRoot!.querySelector(`.${name} b`)?.textContent ?? '').trim();

describe('solitaire element: rendering', () => {
  it('draws 52 cards, 28 on the table and 24 in the stock', async () => {
    const el = await solitaire();
    expect(cards(el).length).to.equal(52);
    expect(cards(el).filter((c) => c.dataset.pile === 'stock').length).to.equal(24);
    expect(cards(el).filter((c) => c.classList.contains('up')).length, 'one face up per column').to.equal(7);
  });

  it('shows score, time and moves at zero', async () => {
    const el = await solitaire();
    expect(readout(el, 'score')).to.equal('0');
    expect(readout(el, 'time')).to.equal('0:00');
    expect(readout(el, 'moves')).to.equal('0');
  });

  it('puts New game on the left and the settings gear in the top-right corner', async () => {
    const el = await solitaire();
    const host = el.getBoundingClientRect();
    const gear = el.shadowRoot!.querySelector('.settings')!.getBoundingClientRect();
    const newGame = el.shadowRoot!.querySelector('.new-game')!.getBoundingClientRect();
    expect(host.right - gear.right).to.be.lessThan(40);
    expect(gear.top - host.top).to.be.lessThan(40);
    expect(newGame.left).to.be.lessThan(gear.left);
  });

  it('gives every card a name a screen reader can say', async () => {
    const el = await solitaire();
    expect(cardEl(el, '1S').getAttribute('aria-label')).to.equal('Ace of spades');
    expect(cardEl(el, '13C').getAttribute('aria-label'), 'face down in the stock').to.equal('Face-down card');
  });

  it('draws the chosen back from the theme', async () => {
    const el = await solitaire();
    el.setAttribute('data-umbradesktop-theme', 'win98');
    await el.updateComplete;
    const img = cardEl(el, '13C').querySelector<HTMLImageElement>('.back img')!;
    expect(img.getAttribute('src')!.endsWith('win98.svg')).to.equal(true);
  });

  it('scales the cards with the window', async () => {
    const el = await solitaire();
    const before = cardEl(el, '1S').getBoundingClientRect().width;
    el.style.width = `${SOLITAIRE_CONTENT_SIZE.w * 1.3}px`;
    el.style.height = `${SOLITAIRE_CONTENT_SIZE.h * 1.3}px`;
    await waitUntil(() => cardEl(el, '1S').getBoundingClientRect().width > before + 5, 'cards grew');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` → FAIL (element missing).

- [ ] **Step 3: Implement the element's rendering**

The element is long; write it as below and then expand the JSDoc to the house standard.

```ts
// backoffice/src/solitaire/solitaire.element.ts
/**
 * Solitaire, as a self-contained UmbraDesktop app (design D1-D12). Renders a `KlondikeGame` from
 * `rules.ts`; every state change goes through `#commit`, which runs the FLIP step in `motion.ts`.
 */
import { css, customElement, html, nothing, property, repeat, state, unsafeCSS, unsafeSVG } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { AUTO_FINISH_STEP_MS, DEAL_STAGGER_MS, DRAG_THRESHOLD_PX, FLIP_MS, MOVE_MS, STAGGER_MS, TOOLBAR_HEIGHT_PX } from './constants.js';
import { CLASSIC_FACES_ALIAS, THEME_BACK_ALIAS, THEME_BACK_IMAGE } from './backs.js';
import { backImageFor } from './extensions.js';
import type { ManifestSolitaireBack, ManifestSolitaireFaces, SolitaireFaceSet } from './extensions.js';
import { cardPositions, computeLayout } from './layout.js';
import type { TableLayout } from './layout.js';
import { playFlip, snapshot } from './motion.js';
import {
  applyTime, canAutoFinish, canDrop, deal, draw, foundationFor, move, movableRun, nextFinishingMove, pile,
  randomShuffle, withTimeBonus,
} from './rules.js';
import type { Card, KlondikeGame, PileId, Shuffler } from './rules.js';
import { savedGames } from './saved-games.js';
import type { SavedGameStore } from './saved-games.js';
import { readSettings, writeSettings } from './settings.js';
import type { SolitaireSettings, StorageAccess } from './settings.js';
import './settings-modal.element.js';

/** Localisation area. */
const AREA = 'umbraDesktopEntertainment';
/** Rank words for the aria labels, English fallback. */
const RANK_WORDS: Readonly<Record<number, string>> = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };
/** Suit words for the aria labels, English fallback. */
const SUIT_WORDS = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as const;

/** Every pile, for slots and hit testing. */
const PILES: ReadonlyArray<PileId> = ['stock', 'waste', 'f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6'];

@customElement('umbradesktop-solitaire')
export class SolitaireElement extends UmbLitElement {
  /** How a new game is shuffled. A seam for tests, as Minesweeper's placer is. */
  @property({ attribute: false }) shuffle: Shuffler = randomShuffle;
  /** A game to start from instead of dealing. For tests only. */
  @property({ attribute: false }) startingGame?: KlondikeGame;
  /** Where unfinished games are kept. The page's shared store unless a test gives its own. */
  @property({ attribute: false }) store: SavedGameStore = savedGames;
  /** Where settings are kept. */
  @property({ attribute: false }) settingsStorage: StorageAccess = () => window.localStorage;
  /** Whether to move instantly. Read at each move, never cached. */
  @property({ attribute: false }) reducedMotion: () => boolean = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** The active theme id, stamped by the desktop (docs/developer/desktop-apps.md §5). */
  @property({ attribute: 'data-umbradesktop-theme' }) theme?: string;

  @state() private _game?: KlondikeGame;
  @state() private _layout?: TableLayout;
  @state() private _elapsed = 0;
  @state() private _settings!: SolitaireSettings;
  @state() private _backs: ReadonlyArray<ManifestSolitaireBack> = [];
  @state() private _facesManifests: ReadonlyArray<ManifestSolitaireFaces> = [];
  @state() private _faces?: SolitaireFaceSet;
  @state() private _settingsOpen = false;
  @state() private _won = false;
  @state() private _dropTarget?: PileId;

  /** This window's id in the saved-game store. */
  #id = `w${Math.random().toString(36).slice(2)}`;
  /** Rendered SVG per card id for the current face set. */
  #faceCache = new Map<string, string>();
  #resize?: ResizeObserver;
  #timer?: number;

  override connectedCallback(): void {
    super.connectedCallback();
    this._settings = readSettings(this.settingsStorage);
    const claimed = this.startingGame ? undefined : this.store.claim();
    if (claimed) {
      this.#id = claimed.id;
      this._game = claimed.saved.game;
      this._elapsed = claimed.saved.elapsedSeconds;
    } else {
      this._game = this.startingGame ?? deal(this._settings.drawCount, this.shuffle);
    }
    if (this._game.moves > 0) this.#startTimer();
    this.observe(umbExtensionsRegistry.byType('umbraDesktopSolitaireBack'), (backs) => (this._backs = backs));
    this.observe(umbExtensionsRegistry.byType('umbraDesktopSolitaireFaces'), (faces) => {
      this._facesManifests = faces;
      void this.#loadFaces();
    });
    void this.#loadFaces();
    this.#resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) this._layout = computeLayout(width, height);
    });
    this.#resize.observe(this);
  }

  /** Closing the window: forget the saved game. A page unload never gets here (design D10). */
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize?.disconnect();
    this.#stopTimer();
    this.store.remove(this.#id);
  }

  /** Load the chosen face set, falling back to classic when its manifest is gone. */
  async #loadFaces(): Promise<void> {
    const manifest =
      this._facesManifests.find((m) => m.alias === this._settings.faces) ??
      this._facesManifests.find((m) => m.alias === CLASSIC_FACES_ALIAS);
    const module = manifest ? await manifest.loader() : await import('./faces/classic/classic.js');
    this.#faceCache.clear();
    this._faces = module.default;
  }

  /** The URL of the chosen back under the current theme. */
  #backUrl(): string {
    const manifest = this._backs.find((b) => b.alias === this._settings.back) ?? this._backs.find((b) => b.alias === THEME_BACK_ALIAS);
    return backImageFor(manifest?.meta.image ?? THEME_BACK_IMAGE, this.theme);
  }

  /** A card's front, cached. */
  #front(card: Card): string {
    let svg = this.#faceCache.get(card.id);
    if (svg === undefined && this._faces) {
      svg = this._faces.render(card);
      this.#faceCache.set(card.id, svg);
    }
    return svg ?? '';
  }

  /** A card's accessible name. */
  #cardName(card: Card): string {
    if (!card.faceUp) return this.localize.termOrDefault(`${AREA}_solitaireFaceDown`, 'Face-down card');
    const rank = this.localize.termOrDefault(`${AREA}_solitaireRank${card.rank}`, RANK_WORDS[card.rank] ?? String(card.rank));
    const suit = this.localize.termOrDefault(`${AREA}_solitaireSuit${card.suit}`, SUIT_WORDS[card.suit]);
    return this.localize.termOrDefault(`${AREA}_solitaireCardName`, `${rank} of ${suit}`, rank, suit);
  }

  /** Every card with the pile and index it is in. */
  #placed(): Array<{ card: Card; pile: PileId; index: number }> {
    const game = this._game!;
    return PILES.flatMap((id) => pile(game, id).map((card, index) => ({ card, pile: id, index })));
  }

  /** m:ss. */
  #clock(): string {
    return `${Math.floor(this._elapsed / 60)}:${String(this._elapsed % 60).padStart(2, '0')}`;
  }

  override render() {
    if (!this._game) return nothing;
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    const layout = this._layout;
    const positions = layout ? cardPositions(this._game, layout) : new Map();
    const back = this.#backUrl();
    const placed = this.#placed().sort((a, b) => a.card.id.localeCompare(b.card.id));
    return html`
      <div class="felt" style="--card-w:${layout?.cardW ?? 0}px;--card-h:${layout?.cardH ?? 0}px">
        <div class="toolbar">
          <button class="new-game" @click=${() => this.#newGame()}>${t('solitaireNewGame', 'New game')}</button>
          <div class="stats">
            <span class="score">${t('solitaireScore', 'Score')}<b>${this._game.score}</b></span>
            <span class="time">${t('solitaireTime', 'Time')}<b>${this.#clock()}</b></span>
            <span class="moves">${t('solitaireMoves', 'Moves')}<b>${this._game.moves}</b></span>
          </div>
          <button class="settings" aria-label=${t('solitaireSettings', 'Settings')} @click=${() => (this._settingsOpen = true)}>
            ${unsafeSVG(GEAR)}
          </button>
        </div>
        <div class="table" role="group" aria-label=${t('solitaireTable', 'Card table')}>
          ${layout
            ? PILES.map((id) => {
                const at = layout.slot(id);
                return html`<div class="slot ${this._dropTarget === id ? 'target' : ''}" data-slot=${id}
                  style="left:${at.x}px;top:${at.y}px" @click=${id === 'stock' ? () => this.#draw() : nothing}></div>`;
              })
            : nothing}
          ${repeat(
            placed,
            (p) => p.card.id,
            (p) => {
              const at = positions.get(p.card.id);
              return html`<div
                class="card ${p.card.faceUp ? 'up' : ''}"
                data-id=${p.card.id}
                data-pile=${p.pile}
                data-index=${p.index}
                aria-label=${this.#cardName(p.card)}
                role="img"
                style="left:${at?.x ?? 0}px;top:${at?.y ?? 0}px;z-index:${at?.z ?? 0}"
              >
                <div class="inner">
                  <div class="front">${p.card.faceUp || this.#faceCache.has(p.card.id) ? unsafeSVG(this.#front(p.card)) : nothing}</div>
                  <div class="back"><img src=${back} alt="" draggable="false" /></div>
                </div>
              </div>`;
            },
          )}
        </div>
      </div>
    `;
  }

  // Tasks 14-16 add: #draw, #newGame, #commit, drag, double-click, auto-finish, win, timer, settings.
  #draw(): void {}
  #newGame(): void {}
  #startTimer(): void {}
  #stopTimer(): void {}

  static override styles = css`
    :host { display: block; width: 100%; height: 100%; position: relative; overflow: hidden; user-select: none;
      font-family: var(--umbradesktop-app-font, inherit); --felt: radial-gradient(120% 90% at 50% 20%, #2c3d86 0%, #1b264f 55%, #0f1636 100%); }
    :host([data-umbradesktop-theme='umbraco4']) { --felt: radial-gradient(120% 90% at 50% 20%, #4f8a63 0%, #356447 55%, #20402c 100%); }
    :host([data-umbradesktop-theme='macos']) { --felt: radial-gradient(120% 90% at 50% 20%, #2f5e86 0%, #1e3d5c 55%, #122740 100%); }
    :host([data-umbradesktop-theme='win11']) { --felt: radial-gradient(120% 90% at 50% 20%, #13896a 0%, #0c5c48 55%, #073a2e 100%); }
    :host([data-umbradesktop-theme='win98']) { --felt: #008000; }
    .felt { position: absolute; inset: 0; background: var(--felt); }
    .felt::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 120px rgb(0 0 0 / 35%); }
    .toolbar { position: absolute; left: 0; right: 0; top: 0; height: ${unsafeCSS(TOOLBAR_HEIGHT_PX)}px; z-index: 2;
      display: flex; align-items: center; justify-content: space-between; padding: 0 12px; color: #eef0ff; }
    .toolbar button { font: inherit; color: inherit; cursor: pointer; border: 0; border-radius: 999px;
      padding: 6px 12px; background: rgb(255 255 255 / 10%); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 14%); }
    .toolbar button:hover { background: rgb(255 255 255 / 18%); }
    .toolbar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .settings { display: flex; padding: 6px 8px; }
    .settings svg { width: 17px; height: 17px; }
    .stats { display: flex; gap: 16px; font-size: 13px; font-variant-numeric: tabular-nums; }
    .stats b { margin-left: 6px; font-weight: 600; color: #fff; }
    .table { position: absolute; inset: 0; }
    .slot { position: absolute; width: var(--card-w); height: var(--card-h); border-radius: calc(var(--card-w) * .08);
      box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 16%); background: rgb(0 0 0 / 12%); }
    .slot.target, .card.target { box-shadow: 0 0 0 2px rgb(245 193 188 / 85%), 0 0 22px rgb(245 193 188 / 45%); }
    .card { position: absolute; width: var(--card-w); height: var(--card-h); perspective: 800px; touch-action: none;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 25%)) drop-shadow(0 3px 6px rgb(0 0 0 / 22%)); }
    .card.lifted { filter: drop-shadow(0 18px 18px rgb(0 0 0 / 40%)) drop-shadow(0 4px 6px rgb(0 0 0 / 25%)); z-index: 1000 !important; }
    .inner { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateY(180deg);
      transition: transform ${unsafeCSS(FLIP_MS)}ms cubic-bezier(.2,.8,.2,1); }
    .card.up .inner { transform: none; }
    .front, .back { position: absolute; inset: 0; backface-visibility: hidden; }
    .front svg { width: 100%; height: 100%; display: block; }
    .back { transform: rotateY(180deg); background: #fff; border-radius: calc(var(--card-w) * .07);
      padding: calc(var(--card-w) * .05); box-sizing: border-box; }
    .back img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: calc(var(--card-w) * .04); }
    @media (prefers-reduced-motion: reduce) { .inner { transition: none; } }
  `;
}

/** The settings gear, drawn to match the toolbar's text size. */
const GEAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.5-1c-1.6.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 0 0 1.1-2.5c-.9-1.6.8-3.3 2.4-2.4a1.7 1.7 0 0 0 2.5-1.1z"/><circle cx="12" cy="12" r="3"/></svg>';

declare global {
  interface HTMLElementTagNameMap { 'umbradesktop-solitaire': SolitaireElement }
}
```

Notes for this step:
- `repeat` keyed on the card id is what makes FLIP possible: a card's DOM node survives every move
  and every new game. Cards are rendered in id order and stacked by `z-index`, so moves never
  reorder the DOM.
- The front of a face-down card is only rendered once it has been face up (the cache check), so
  the 3D flip has a face to turn to without rendering 52 SVGs up front.
- Imports used only by Tasks 14-16 will fail `noUnusedLocals`; add them in the task that uses them
  rather than now if `tsc` complains.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test` then `npm run build`
Expected: PASS. The aria-label case depends on the dictionary not being loaded, so the English
fallbacks apply.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 14: The game element: the stock, dragging and double-click

**Files:**
- Modify: `backoffice/src/solitaire/solitaire.element.ts`
- Test: `backoffice/src/solitaire/solitaire.element.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `solitaire.element.test.ts`:

```ts
/** Pointer events on a card, in viewport coordinates. */
function pointer(target: Element, type: string, x: number, y: number): void {
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, composed: true, button: 0, isPrimary: true }));
}

/** Drag a card's centre onto another card's centre. */
async function drag(el: SolitaireElement, fromId: string, toId: string): Promise<void> {
  const from = cardEl(el, fromId);
  const a = from.getBoundingClientRect();
  const b = cardEl(el, toId).getBoundingClientRect();
  pointer(from, 'pointerdown', a.left + a.width / 2, a.top + 10);
  pointer(from, 'pointermove', a.left + a.width / 2 + 10, a.top + 20);
  pointer(from, 'pointermove', b.left + b.width / 2, b.top + b.height / 2);
  pointer(from, 'pointerup', b.left + b.width / 2, b.top + b.height / 2);
  await el.updateComplete;
}

describe('solitaire element: playing', () => {
  it('draws from the stock on click, and starts the clock', async () => {
    const el = await solitaire();
    el.shadowRoot!.querySelector<HTMLElement>('[data-slot="stock"]')!.click();
    await el.updateComplete;
    expect(cards(el).filter((c) => c.dataset.pile === 'waste').length).to.equal(1);
    expect(readout(el, 'moves')).to.equal('1');
  });

  it('draws when the top stock card itself is clicked', async () => {
    const el = await solitaire();
    cardEl(el, '13C').click();
    await el.updateComplete;
    expect(cardEl(el, '13C').dataset.pile).to.equal('waste');
  });

  it('moves a card by dragging it onto a legal target, and turns what it uncovered', async () => {
    const el = await solitaire();
    await drag(el, '2H', '3S');
    expect(cardEl(el, '2H').dataset.pile).to.equal('t1');
    expect(cardEl(el, '1H').classList.contains('up'), 'the ace of hearts under it turned over').to.equal(true);
    expect(readout(el, 'score')).to.equal('5');
  });

  it('sends an illegal drop back where it came from', async () => {
    const el = await solitaire();
    await drag(el, '3S', '6S');
    expect(cardEl(el, '3S').dataset.pile).to.equal('t1');
    expect(cardEl(el, '3S').style.transform).to.equal('');
  });

  it('sends a card home on double-click', async () => {
    const el = await solitaire();
    cardEl(el, '1S').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(cardEl(el, '1S').dataset.pile).to.equal('f0');
    expect(readout(el, 'score')).to.equal('10');
  });

  it('animates a move when motion is allowed', async () => {
    const el = await solitaire();
    el.reducedMotion = () => false;
    cardEl(el, '1S').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await el.updateComplete;
    await new Promise((r) => requestAnimationFrame(r));
    expect(cardEl(el, '1S').getAnimations().length).to.be.greaterThan(0);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` → FAIL (nothing responds).

- [ ] **Step 3: Implement**

Replace the four empty stubs and add the handlers. Wire `@pointerdown=${this.#onPointerDown}` and
`@dblclick=${this.#onDoubleClick}` and `@click=${this.#onCardClick}` on `.table`.

```ts
  /** A drag in progress. */
  #drag?: {
    pointerId: number;
    from: PileId;
    index: number;
    startX: number;
    startY: number;
    elements: HTMLElement[];
    active: boolean;
  };

  /** Every card element, for FLIP. */
  #cardElements(): HTMLElement[] {
    return [...(this.shadowRoot?.querySelectorAll<HTMLElement>('.card') ?? [])];
  }

  /**
   * The one way the game changes: snapshot, apply, animate, save, and check for the win.
   * @param next The new game.
   * @param stagger Delay between moving cards.
   */
  async #commit(next: KlondikeGame, stagger = STAGGER_MS): Promise<void> {
    const before = snapshot(this.#cardElements());
    const first = this._game?.moves === 0 && next.moves > 0;
    this._game = next;
    await this.updateComplete;
    playFlip(this.#cardElements(), before, { duration: MOVE_MS, stagger, reduced: this.reducedMotion() });
    if (first) this.#startTimer();
    if (next.status === 'won') return this.#win();
    this.store.save(this.#id, { game: next, elapsedSeconds: this._elapsed });
  }

  /** A click on the stock. */
  #draw(): void {
    if (this._game) void this.#commit(draw(this._game));
  }

  /** A click on a card: only the stock's cards respond, by drawing. */
  #onCardClick = (event: MouseEvent): void => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.card');
    if (card?.dataset.pile === 'stock') this.#draw();
  };

  /** Double-click: send the card home if it is the top of its pile and can go. */
  #onDoubleClick = (event: MouseEvent): void => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.card');
    if (!card || !this._game) return;
    const from = card.dataset.pile as PileId;
    if (Number(card.dataset.index) !== pile(this._game, from).length - 1) return;
    const to = foundationFor(this._game, from);
    const next = to && move(this._game, from, Number(card.dataset.index), to);
    if (next) void this.#commit(next);
  };

  /** Press on a face-up card: arm a drag of it and everything on it. */
  #onPointerDown = (event: PointerEvent): void => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.card.up');
    if (!card || !this._game || event.button !== 0) return;
    const from = card.dataset.pile as PileId;
    const index = Number(card.dataset.index);
    if (!movableRun(this._game, from, index)) return;
    const elements = this.#cardElements()
      .filter((c) => c.dataset.pile === from && Number(c.dataset.index) >= index)
      .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
    this.#drag = { pointerId: event.pointerId, from, index, startX: event.clientX, startY: event.clientY, elements, active: false };
    try {
      card.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers in tests have no capture; real ones always do.
    }
    card.addEventListener('pointermove', this.#onPointerMove);
    card.addEventListener('pointerup', this.#onPointerUp, { once: true });
    card.addEventListener('pointercancel', this.#onPointerUp, { once: true });
  };

  /** Move the lifted cards with the pointer and light the pile they would land on. */
  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.active = true;
    for (const el of drag.elements) {
      el.classList.add('lifted');
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(-2deg)`;
    }
    this._dropTarget = this.#targetUnder(drag.elements[0]);
  };

  /** Drop: move if legal, otherwise glide back. */
  #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    const card = event.currentTarget as HTMLElement;
    card.removeEventListener('pointermove', this.#onPointerMove);
    // Read the target while the drag is still set: #targetUnder uses it.
    const target = drag?.active ? this.#targetUnder(drag.elements[0]) : undefined;
    this.#drag = undefined;
    this._dropTarget = undefined;
    if (!drag || !this._game) return;
    const before = snapshot(this.#cardElements());
    for (const el of drag.elements) {
      el.classList.remove('lifted');
      el.style.transform = '';
    }
    const next = target && move(this._game, drag.from, drag.index, target);
    if (next) {
      void this.#commitFrom(before, next);
    } else if (drag.active) {
      playFlip(drag.elements, before, { duration: MOVE_MS, stagger: 0, reduced: this.reducedMotion() });
    }
  };

  /**
   * Commit from a snapshot taken while the cards were still under the pointer, so they glide from
   * where they were dropped rather than from where they started.
   */
  async #commitFrom(before: ReturnType<typeof snapshot>, next: KlondikeGame): Promise<void> {
    const first = this._game?.moves === 0;
    this._game = next;
    await this.updateComplete;
    playFlip(this.#cardElements(), before, { duration: MOVE_MS, stagger: 0, reduced: this.reducedMotion() });
    if (first) this.#startTimer();
    if (next.status === 'won') return this.#win();
    this.store.save(this.#id, { game: next, elapsedSeconds: this._elapsed });
  }

  /**
   * The legal pile under the dragged card's centre, if any. Columns reach to the bottom of the table
   * so a card can be dropped anywhere below one.
   */
  #targetUnder(card: HTMLElement): PileId | undefined {
    const layout = this._layout;
    const drag = this.#drag;
    if (!layout || !this._game) return undefined;
    const host = this.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const x = rect.left - host.left + rect.width / 2;
    const y = rect.top - host.top + rect.height / 2;
    const from = drag?.from ?? (card.dataset.pile as PileId);
    const index = drag?.index ?? Number(card.dataset.index);
    const run = movableRun(this._game, from, index);
    if (!run) return undefined;
    for (const id of PILES) {
      if (id === 'stock' || id === 'waste' || id === from) continue;
      const at = layout.slot(id);
      const bottom = id[0] === 't' ? layout.height : at.y + layout.cardH;
      if (x >= at.x && x <= at.x + layout.cardW && y >= at.y && y <= bottom && canDrop(this._game, run, id)) return id;
    }
    return undefined;
  }
```

Refactor `#commit` to take its snapshot and then call `#commitFrom(before, next, stagger)` (add a
`stagger` parameter to `#commitFrom`), so there is one commit path.

`#newGame`, `#startTimer`, `#stopTimer` come in Tasks 15 and 16; leave them as stubs until then.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS. If the drag test fails because the dragged card's centre misses the target column,
log the two rects: the test drops the card's grab point on the target's centre, so the card's own
centre lands slightly low, which the full-height column rect still covers.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 15: The game element: auto-finish, the win and the cascade

**Files:**
- Modify: `backoffice/src/solitaire/solitaire.element.ts`
- Test: `backoffice/src/solitaire/solitaire.element.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import type { Card } from './rules.js';

/** A game one card from winning: every foundation full but spades, the king of spades on t0. */
function nearlyWon(): KlondikeGame {
  const suit = (s: Card['suit'], upTo = 13) => Array.from({ length: upTo }, (_, i) => ({ id: `${i + 1}${s}`, suit: s, rank: i + 1, faceUp: true }));
  return {
    stock: [], waste: [], drawCount: 1, score: 100, moves: 50, status: 'playing',
    foundations: [suit('S', 12), suit('H'), suit('D'), suit('C')],
    tableau: [[{ id: '13S', suit: 'S', rank: 13, faceUp: true }], [], [], [], [], [], []],
  };
}

/** A game auto-finish can end: spades split between the foundation and three columns. */
function finishable(): KlondikeGame {
  const g = nearlyWon();
  const spades = g.foundations[0].slice(0, 10);
  return { ...g, foundations: [spades, g.foundations[1], g.foundations[2], g.foundations[3]],
    tableau: [[{ id: '13S', suit: 'S', rank: 13, faceUp: true }], [{ id: '12S', suit: 'S', rank: 12, faceUp: true }], [{ id: '11S', suit: 'S', rank: 11, faceUp: true }], [], [], [], []] };
}

describe('solitaire element: finishing', () => {
  it('offers Finish when the rest is a formality, and finishes the game', async () => {
    const el = await solitaire({ game: finishable() });
    const finish = el.shadowRoot!.querySelector<HTMLElement>('.auto-finish')!;
    expect(finish).to.not.equal(undefined);
    finish.click();
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    expect(cards(el).filter((c) => c.dataset.pile === 'f0').length).to.equal(13);
  });

  it('shows the win panel at once with reduced motion, with the score and a New game button', async () => {
    const el = await solitaire({ game: nearlyWon() });
    cardEl(el, '13S').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    expect(el.shadowRoot!.querySelector('canvas')).to.equal(null);
    expect(el.shadowRoot!.querySelector('.win .play-again')).to.not.equal(null);
  });

  it('runs the cascade when motion is allowed, and a click ends it', async () => {
    const el = await solitaire({ game: nearlyWon() });
    el.reducedMotion = () => false;
    cardEl(el, '13S').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await waitUntil(() => el.shadowRoot!.querySelector('canvas.cascade'), 'cascade');
    el.shadowRoot!.querySelector<HTMLElement>('canvas.cascade')!.click();
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'panel after the cascade');
  });

  it('forgets a won game', async () => {
    const store = new SavedGameStore(() => new MemoryStorage());
    const el = await solitaire({ game: nearlyWon(), store });
    cardEl(el, '13S').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    expect(store.claim()).to.equal(undefined);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` → FAIL.

- [ ] **Step 3: Implement**

Add state and methods; render the Finish button, the canvas and the panel.

```ts
  @state() private _cascading = false;
  #cascade?: WinCascade;

  /** Play the rest of the game out, lowest card first. */
  async #autoFinish(): Promise<void> {
    let step = this._game && nextFinishingMove(this._game);
    while (this._game && step) {
      const next = move(this._game, step.from, pile(this._game, step.from).length - 1, step.to);
      if (!next) break;
      await this.#commit(next, 0);
      if (!this.reducedMotion()) await new Promise((r) => setTimeout(r, AUTO_FINISH_STEP_MS));
      step = this._game.status === 'playing' ? nextFinishingMove(this._game) : undefined;
    }
  }

  /** The win: stop the clock, add the bonus, forget the save, celebrate. */
  async #win(): Promise<void> {
    this.#stopTimer();
    this._game = withTimeBonus(this._game!, this._elapsed);
    this.store.remove(this.#id);
    if (!this.reducedMotion()) {
      this._cascading = true;
      await this.updateComplete;
      const canvas = this.shadowRoot!.querySelector<HTMLCanvasElement>('canvas.cascade')!;
      this.#cascade = new WinCascade(canvas, await this.#cascadeCards(), { w: this._layout!.cardW, h: this._layout!.cardH });
      await this.#cascade.start();
      this._cascading = false;
    }
    this._won = true;
  }

  /** Each foundation's cards, king first, round-robin, as images at their foundation's place. */
  async #cascadeCards(): Promise<CascadeCard[]> {
    const layout = this._layout!;
    const out: CascadeCard[] = [];
    for (let rank = 13; rank >= 1; rank--) {
      for (let f = 0; f < 4; f++) {
        const card = this._game!.foundations[f][rank - 1];
        if (!card) continue;
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.#front(card));
        await image.decode().catch(() => undefined);
        const at = layout.slot(`f${f}`);
        out.push({ image, x: at.x, y: at.y });
      }
    }
    return out;
  }
```

In `render()`, after `.table`:

```ts
${canAutoFinish(this._game) && !this._won
  ? html`<button class="auto-finish" @click=${() => this.#autoFinish()}>${t('solitaireAutoFinish', 'Finish')}</button>`
  : nothing}
${this._cascading ? html`<canvas class="cascade" @click=${() => this.#cascade?.stop()}></canvas>` : nothing}
${this._won
  ? html`<div class="win" role="status">
      <h2>${t('solitaireWon', 'You won')}</h2>
      <p>${t('solitaireScore', 'Score')} <b>${this._game.score}</b> · ${t('solitaireTime', 'Time')} <b>${this.#clock()}</b></p>
      <button class="play-again" @click=${() => this.#newGame()}>${t('solitairePlayAgain', 'Play again')}</button>
    </div>`
  : nothing}
```

Add a `keydown` listener on the host while cascading that calls `this.#cascade?.stop()`, and CSS:
`.auto-finish` bottom-centre in the toolbar pill style; `canvas.cascade { position:absolute; inset:0;
width:100%; height:100%; z-index:10; cursor:pointer }`; `.win` a centred panel in app tokens like the
settings modal's `.panel`, with `z-index: 15`.

Import `WinCascade`, `CascadeCard` from `./cascade.js`, and `canAutoFinish`, `nextFinishingMove`,
`withTimeBonus`, `AUTO_FINISH_STEP_MS` as needed.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS. The cascade case needs `requestAnimationFrame`, which stalls in background tabs:
run the suite with the browser focused, as the ground rules say.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 16: The game element: timer, New game, saved games and settings

**Files:**
- Modify: `backoffice/src/solitaire/solitaire.element.ts`
- Test: `backoffice/src/solitaire/solitaire.element.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { deal as dealGame, seededShuffle as seeded } from './rules.js';

describe('solitaire element: keeping things', () => {
  it('saves after a move, and a new window on the same page claims that game', async () => {
    const storage = new MemoryStorage();
    const first = await solitaire({ store: new SavedGameStore(() => storage) });
    cardEl(first, '1S').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await first.updateComplete;
    // A reload: new page store over the same session storage. The old element is not disconnected.
    const second = await solitaire({ store: new SavedGameStore(() => storage) });
    expect(cardEl(second, '1S').dataset.pile).to.equal('f0');
    expect(readout(second, 'score')).to.equal('10');
  });

  it('forgets its game when the window closes', async () => {
    const storage = new MemoryStorage();
    const store = new SavedGameStore(() => storage);
    const el = await solitaire({ store });
    cardEl(el, '1S').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await el.updateComplete;
    el.remove();
    expect(new SavedGameStore(() => storage).claim()).to.equal(undefined);
  });

  it('deals a fresh game on New game and forgets the old save', async () => {
    const storage = new MemoryStorage();
    const el = await solitaire({ store: new SavedGameStore(() => storage) });
    cardEl(el, '1S').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await el.updateComplete;
    el.shadowRoot!.querySelector<HTMLElement>('.new-game')!.click();
    await el.updateComplete;
    expect(cardEl(el, '1S').dataset.pile).to.equal('t0');
    expect(readout(el, 'score')).to.equal('0');
    expect(new SavedGameStore(() => storage).claim()).to.equal(undefined);
  });

  it('opens settings from the gear, applies a back at once, and keeps the draw mode for the next game', async () => {
    const el = await solitaire();
    el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
    await el.updateComplete;
    const modal = el.shadowRoot!.querySelector('umbradesktop-solitaire-settings')!;
    modal.dispatchEvent(new CustomEvent('solitaire-settings-change', { detail: { drawCount: 3 }, bubbles: true, composed: true }));
    await el.updateComplete;
    el.shadowRoot!.querySelector<HTMLElement>('[data-slot="stock"]')!.click();
    await el.updateComplete;
    expect(cards(el).filter((c) => c.dataset.pile === 'waste').length, 'still Draw 1 this game').to.equal(1);
    modal.dispatchEvent(new CustomEvent('solitaire-settings-close', { bubbles: true, composed: true }));
    await el.updateComplete;
    el.shadowRoot!.querySelector<HTMLElement>('.new-game')!.click();
    await el.updateComplete;
    el.shadowRoot!.querySelector<HTMLElement>('[data-slot="stock"]')!.click();
    await el.updateComplete;
    expect(cards(el).filter((c) => c.dataset.pile === 'waste').length, 'Draw 3 from the next game').to.equal(3);
  });

  it('falls back to Match theme when the stored back no longer exists', async () => {
    const settings = new MemoryStorage();
    settings.setItem('umbradesktop-entertainment-solitaire-settings', JSON.stringify({ drawCount: 1, back: 'Gone.Back', faces: 'Gone.Faces' }));
    const el = await fixture<SolitaireElement>(html`<umbradesktop-solitaire
      style="display:block;width:${SOLITAIRE_CONTENT_SIZE.w}px;height:${SOLITAIRE_CONTENT_SIZE.h}px"
      .shuffle=${identity} .store=${new SavedGameStore(() => new MemoryStorage())}
      .settingsStorage=${() => settings} .reducedMotion=${() => true}></umbradesktop-solitaire>`);
    await waitUntil(() => el.shadowRoot!.querySelector('.card.up .front svg'), 'faces fell back to classic');
    expect(cardEl(el, '13C').querySelector('img')!.getAttribute('src')!.endsWith('aurora-flow.avif')).to.equal(true);
  });

  it('continues the clock from a saved game', async () => {
    const storage = new MemoryStorage();
    new SavedGameStore(() => storage).save('old', { game: { ...dealGame(1, seeded(3)), moves: 4 }, elapsedSeconds: 75 });
    const el = await solitaire({ store: new SavedGameStore(() => storage) });
    expect(readout(el, 'time')).to.equal('1:15');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` → FAIL.

- [ ] **Step 3: Implement**

```ts
  /** Start the clock, once, at the first move. */
  #startTimer(): void {
    if (this.#timer !== undefined) return;
    this.#timer = window.setInterval(() => {
      if (!this._game || this._game.status !== 'playing') return;
      this._game = applyTime(this._game, this._elapsed, this._elapsed + 1);
      this._elapsed++;
      this.store.save(this.#id, { game: this._game, elapsedSeconds: this._elapsed });
    }, 1000);
  }

  /** Stop the clock. */
  #stopTimer(): void {
    window.clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /** New game: forget the save, gather the cards into the stock, then deal from it. */
  async #newGame(): Promise<void> {
    this.#stopTimer();
    this.#cascade?.stop();
    this.store.remove(this.#id);
    this._won = false;
    this._elapsed = 0;
    const dealt = deal(this._settings.drawCount, this.shuffle);
    // Gather first, so the deal visibly comes from the stock.
    const all = [dealt.stock, ...dealt.tableau].flat().map((c) => ({ ...c, faceUp: false }));
    this._game = { ...dealt, stock: all, tableau: dealt.tableau.map(() => []) };
    await this.updateComplete;
    await this.#commit(dealt, DEAL_STAGGER_MS);
  }

  /** Apply a settings change and store it. The draw mode waits for the next deal. */
  #onSettingsChange = (event: CustomEvent<Partial<SolitaireSettings>>): void => {
    this._settings = { ...this._settings, ...event.detail };
    writeSettings(this._settings, this.settingsStorage);
    if (event.detail.faces) void this.#loadFaces();
  };
```

`#commit` must not save a game with `moves === 0` (a fresh deal is not worth keeping) and must not
start the timer for one: guard both on `next.moves > 0`.

In `render()`, inside `.felt`:

```ts
${this._settingsOpen
  ? html`<umbradesktop-solitaire-settings
      .drawCount=${this._settings.drawCount}
      .backs=${this._backs.map((b) => ({ alias: b.alias, label: b.meta.label, image: backImageFor(b.meta.image, this.theme) }))}
      .faces=${this._facesManifests.map((f) => ({ alias: f.alias, label: f.meta.label, preview: f.alias === this._settings.faces ? this.#front({ id: '13S', suit: 'S', rank: 13, faceUp: true }) : '' }))}
      .selectedBack=${this._settings.back}
      .selectedFaces=${this._settings.faces}
      @solitaire-settings-change=${this.#onSettingsChange}
      @solitaire-settings-close=${() => { this._settingsOpen = false; this.shadowRoot?.querySelector<HTMLElement>('.settings')?.focus(); }}
    ></umbradesktop-solitaire-settings>`
  : nothing}
```

Face-set previews: loading every set's module only to draw one preview card is wasteful; for sets
other than the current one, load the module when the modal opens and cache its king of spades.
Keep it simple: on open, `Promise.all` over `this._facesManifests` calling `loader()` and
`render({ suit: 'S', rank: 13 })`, stored in `@state() _previews`.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test` then `npm run build`
Expected: PASS.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 17: Manifests, localisation and the bundle test

**Files:**
- Modify: `backoffice/src/solitaire/constants.ts` (nothing new; imported)
- Modify: `backoffice/src/bundle.manifests.ts`, `backoffice/src/bundle.manifests.test.ts`
- Modify: `backoffice/src/localization/en.ts`, `backoffice/src/localization/nl.ts`

- [ ] **Step 1: Change the bundle tests first**

In `bundle.manifests.test.ts`:
- Rename the first case to cover three games and add
  `const solitaire = apps.find((m) => m.alias === 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire');`
  with `expect(solitaire).to.not.equal(undefined)`.
- In `puts every game in the games group, in a fixed order`, add
  `expect(snake?.weight ?? 0).to.be.greaterThan(solitaire?.weight ?? 0);`.
- Replace `opens every game in a window that cannot be resized or maximized` with two cases:

```ts
it('keeps Minesweeper and Snake at a fixed size', () => {
  for (const app of [minesweeper, snake]) {
    expect((app as { meta?: { resizable?: boolean } }).meta?.resizable, app?.alias).to.equal(false);
  }
});

/** A card table has no fixed pixel size: the cards scale with the window (design D5). */
it('lets Solitaire be resized, from its derived minimum', () => {
  const meta = (solitaire as { meta?: { resizable?: boolean; defaultSize?: unknown; minSize?: unknown } }).meta;
  expect(meta?.resizable).to.not.equal(false);
  expect(meta?.defaultSize).to.deep.equal(SOLITAIRE_CONTENT_SIZE);
  expect(meta?.minSize).to.deep.equal(SOLITAIRE_MIN_CONTENT_SIZE);
});

it('registers the built-in card backs and face set through their own manifest types', () => {
  expect(manifests.filter((m) => m.type === 'umbraDesktopSolitaireBack').length).to.equal(6);
  expect(manifests.filter((m) => m.type === 'umbraDesktopSolitaireFaces').length).to.equal(1);
});
```

Import `SOLITAIRE_CONTENT_SIZE`, `SOLITAIRE_MIN_CONTENT_SIZE` from `./solitaire/constants.js`.

- [ ] **Step 2: Run and watch it fail**

Run: `npm test` → FAIL.

- [ ] **Step 3: Register Solitaire**

In `bundle.manifests.ts`, import the sizes and `backManifests`, `facesManifests` from
`./solitaire/backs.js` (types only reach the main chunk; the face set is behind its loader), and add:

```ts
/**
 * Solitaire, registered as the other two games are. Resizable, unlike them: a card table has no
 * fixed pixel size and the cards scale with the window (design D5). Weight 800 keeps it after
 * Snake (900), the slot Snake's comment left for a later game.
 */
const solitaire: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire',
  name: 'Solitaire',
  element: () => import('./solitaire/solitaire.element.js'),
  weight: 800,
  meta: {
    label: '#umbraDesktopEntertainment_solitaire',
    icon: 'icon-playing-cards',
    group: 'games',
    defaultSize: SOLITAIRE_CONTENT_SIZE,
    minSize: SOLITAIRE_MIN_CONTENT_SIZE,
    allowMultiple: true,
    resizable: true,
  },
};

export const manifests: Array<UmbExtensionManifest> = [
  catalogue, minesweeper, snake, solitaire, ...backManifests, ...facesManifests, ...localizationManifests,
];
```

Check the icon exists: search Umbraco's icon registry in
`node_modules/@umbraco-cms/backoffice` for `icon-playing-cards` (or `icon-cards`). If none, use
`icon-game`, as Snake does.

The `declare global` in `extensions.ts` needs no import to take effect: `tsconfig` includes all of
`src`, so `tsc` sees it. `npm run build` confirms it; if `tsc` rejects the back manifests as
`ManifestBase`, that global augmentation is not being picked up, and a type-only
`import type {} from './solitaire/extensions.js';` in `bundle.manifests.ts` fixes it without adding
runtime code.

- [ ] **Step 4: The strings**

Append to `en.ts` inside `umbraDesktopEntertainment`:

```ts
    // Solitaire: the window title, then everything the game says.
    solitaire: 'Solitaire',
    solitaireNewGame: 'New game',
    solitaireSettings: 'Settings',
    solitaireScore: 'Score',
    solitaireTime: 'Time',
    solitaireMoves: 'Moves',
    solitaireTable: 'Card table',
    solitaireAutoFinish: 'Finish',
    solitaireWon: 'You won',
    solitairePlayAgain: 'Play again',
    solitaireSettingsTitle: 'Settings',
    solitaireGame: 'Game',
    solitaireDrawOne: 'Draw one',
    solitaireDrawThree: 'Draw three',
    solitaireDrawNextGame: 'A change here starts with your next game.',
    solitaireCardBack: 'Card back',
    solitaireCardFaces: 'Card faces',
    solitaireDone: 'Done',
    solitaireClose: 'Close',
    solitaireBackTheme: 'Match theme',
    solitaireBackUmbraco: 'Umbraco',
    solitaireBackUmbraco4: 'Umbraco 4',
    solitaireBackMacos: 'macOS',
    solitaireBackWin11: 'Windows 11',
    solitaireBackWin98: 'Windows 98',
    solitaireFacesClassic: 'Classic',
    // A card's name for screen readers: {0} is the rank, {1} the suit.
    solitaireCardName: '{0} of {1}',
    solitaireFaceDown: 'Face-down card',
    solitaireRank1: 'Ace',
    solitaireRank11: 'Jack',
    solitaireRank12: 'Queen',
    solitaireRank13: 'King',
    solitaireSuitS: 'spades',
    solitaireSuitH: 'hearts',
    solitaireSuitD: 'diamonds',
    solitaireSuitC: 'clubs',
```

And `nl.ts`, same keys:

```ts
    solitaire: 'Solitaire',
    solitaireNewGame: 'Nieuw spel',
    solitaireSettings: 'Instellingen',
    solitaireScore: 'Score',
    solitaireTime: 'Tijd',
    solitaireMoves: 'Zetten',
    solitaireTable: 'Speeltafel',
    solitaireAutoFinish: 'Afmaken',
    solitaireWon: 'Gewonnen',
    solitairePlayAgain: 'Nog een keer',
    solitaireSettingsTitle: 'Instellingen',
    solitaireGame: 'Spel',
    solitaireDrawOne: 'Eén kaart pakken',
    solitaireDrawThree: 'Drie kaarten pakken',
    solitaireDrawNextGame: 'Een wijziging hier geldt vanaf je volgende spel.',
    solitaireCardBack: 'Achterkant',
    solitaireCardFaces: 'Voorkant',
    solitaireDone: 'Klaar',
    solitaireClose: 'Sluiten',
    solitaireBackTheme: 'Volgt het thema',
    solitaireBackUmbraco: 'Umbraco',
    solitaireBackUmbraco4: 'Umbraco 4',
    solitaireBackMacos: 'macOS',
    solitaireBackWin11: 'Windows 11',
    solitaireBackWin98: 'Windows 98',
    solitaireFacesClassic: 'Klassiek',
    solitaireCardName: '{1}{0}',
    solitaireFaceDown: 'Dichte kaart',
    solitaireRank1: 'aas',
    solitaireRank11: 'boer',
    solitaireRank12: 'vrouw',
    solitaireRank13: 'heer',
    solitaireSuitS: 'schoppen',
    solitaireSuitH: 'harten',
    solitaireSuitD: 'ruiten',
    solitaireSuitC: 'klaveren',
```

(`{1}{0}` gives "hartenvrouw", "schoppenaas", "klaveren7": the Dutch compound. Have the owner check
the Dutch.)

- [ ] **Step 5: Run and watch it pass**

Run: `npm test` then `npm run build`
Expected: PASS. Check the built `wwwroot/.../umbradesktop-entertainment.js` main chunk does not
contain `COURTS` (the court art must stay in the face set's lazy chunk):

```bash
grep -c "COURT_VIEWBOX" backoffice/../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Entertainment/umbradesktop-entertainment.js
```

Expected: `0`.

- [ ] **Step 6: Leave uncommitted.**

---

### Task 18: In a real backoffice, under all five themes

**Files:** none new, unless a measurement forces a constant change (then the test for it first).

Follow `docs/developer/desktop-apps.md` §9's checklist and the repository's recipe for a worktree test
instance (a copy of the database per task, `npm run build` in both packages before `dotnet build`,
revert the TestInstance lock-file bump afterwards). A hidden Browser pane never renders the
backoffice; drive headless Chrome through the host's `puppeteer-core` as earlier features did.

- [ ] **Step 1:** Open Solitaire from the Games group. Under each theme id (`umbraco`, `umbraco4`,
  `macos`, `win11`, `win98`) screenshot the default window and measure the content box. It must be
  `SOLITAIRE_CONTENT_SIZE` under all five.
- [ ] **Step 2:** Resize to the minimum and to a maximized window; screenshot both. Cards must stay
  readable at the minimum and stop growing at `CARD_MAX_WIDTH_PX`.
- [ ] **Step 3:** Play a Draw 1 and a Draw 3 game by hand for a few minutes: drag runs, double-click,
  recycle, auto-finish, the cascade. Check a fast drag across another window keeps the card.
- [ ] **Step 4:** Refresh mid-game and check the game continues (D10). Then let the session expire,
  and separately sign out and in, and record in the design doc for each whether Umbraco reloaded
  the page or showed its login in place. If signing out removes the desktop from the page before
  navigating, `disconnectedCallback` runs and deletes the save: that would break D10 for sign-out,
  so report it to the owner rather than working around it silently.
- [ ] **Step 5:** Open settings under Windows 98 and one other theme; check it covers only the
  Solitaire window and is styled by the theme.
- [ ] **Step 6: The card back pass.** Show the owner the five backs on the table under their
  themes. He asked for a final tuning pass on them; adjust focal points in
  `build-card-backs.mjs` and the Windows 98 SVG as he directs.
- [ ] **Step 7:** Save one good screenshot (Umbraco theme, mid-game) to
  `src/Umbraco.Community.UmbraDesktop.Entertainment/docs/screenshots/entertainment-games-solitaire.png` at the size it should appear in the README.

---

### Task 19: Docs

**Files:**
- Modify: `README.md` (repository root)
- Modify: `src/Umbraco.Community.UmbraDesktop.Entertainment/README.md`
- Modify: the Entertainment marketplace file at the repository root,
  `umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`
- Create: `src/Umbraco.Community.UmbraDesktop.Entertainment/docs/developer/solitaire-decks.md`
- Modify: `docs/design/2026-09-30-solitaire-design.md`

- [ ] **Step 1: READMEs.** Search the root README for every place Minesweeper or Snake is named and
  add Solitaire in each (the Features list and the Entertainment section at least). Say what it
  has: Klondike, Draw 1 or 3, backs that follow the theme, settings. Add a credit line: "Court card
  artwork: Dmitry Fomin, English pattern playing cards, Wikimedia Commons, CC0 1.0." Markdown only,
  no raw HTML (the file is also the NuGet readme). Do the same in the Entertainment README's
  "What's in it".
- [ ] **Step 2: Marketplace.** Add `solitaire`, `card game` and `klondike` to `Tags`, and the
  screenshot to `Screenshots`. Do not touch `Description`.
- [ ] **Step 3: The guide.** `src/Umbraco.Community.UmbraDesktop.Entertainment/docs/developer/solitaire-decks.md`, for package authors: the two manifest types
  (copy the interfaces from `extensions.ts`), a complete example of registering a back with a
  per-theme image map, a complete example of a face set module (a `render` that returns SVG with
  viewBox `0 0 100 140`), and the three rules that bit during the build: ids unique per card,
  aliases final once shipped, and images served from the package's own `App_Plugins` folder. Link it
  from the Entertainment README's "Writing your own".
- [ ] **Step 4: Design doc.** Set **Status** to built, and add a "Notes from the build" section:
  anything the build taught that is not obvious from the code (the session-expiry finding from
  Task 18 Step 4 goes here).

---

### Task 20: Final verification

- [ ] **Step 1:** `npm test` and `npm run build` in the Entertainment package: both PASS.
- [ ] **Step 2:** `npm test` and `npm run build` in `src/Umbraco.Community.UmbraDesktop`: both PASS
  (nothing there should have changed; this proves it).
- [ ] **Step 3:** `git status`: list every changed and new file for the owner. Confirm the AVIF
  crops are ignored and `win98.svg`, the Fomin sources and `courts.generated.ts` are not.
- [ ] **Step 4:** Walk the definition of done in `CLAUDE.md` and say which items did not apply.
- [ ] **Step 5:** Stop. Do not commit. Report what changed and offer a commit as a question.
