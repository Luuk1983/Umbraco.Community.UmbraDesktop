import { expect } from '@open-wc/testing';
import {
  applyTime,
  canAutoFinish,
  canDrop,
  createDeck,
  deal,
  draw,
  foundationFor,
  isKlondikeGame,
  move,
  movableRun,
  nextFinishingMove,
  pile,
  seededShuffle,
  timeBonus,
  withTimeBonus,
} from './rules.js';
import type { Card, KlondikeGame } from './rules.js';

/** The unshuffled deck, so every case can name exactly where each card lands. */
const identity = (cards: readonly Card[]): Card[] => [...cards];

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
function game(
  parts: Partial<
    Record<'stock' | 'waste' | 'f0' | 'f1' | 'f2' | 'f3' | 't0' | 't1' | 't2' | 't3' | 't4' | 't5' | 't6', string[]>
  > & { drawCount?: 1 | 3; score?: number } = {},
): KlondikeGame {
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

describe('solitaire rules: deck and deal', () => {
  it('makes 52 distinct face-down cards', () => {
    const deck = createDeck();
    expect(deck.length).to.equal(52);
    expect(new Set(deck.map((c) => c.id)).size).to.equal(52);
    expect(deck.every((c) => !c.faceUp)).to.equal(true);
    expect(deck[0]).to.deep.equal({ id: '1S', suit: 'S', rank: 1, faceUp: false });
  });

  it('deals 1 to 7 cards into the columns with only the last one face up', () => {
    const g = deal(1, identity);
    expect(g.tableau.map((column) => column.length)).to.deep.equal([1, 2, 3, 4, 5, 6, 7]);
    for (const column of g.tableau) {
      expect(column.map((c) => c.faceUp)).to.deep.equal(column.map((_, i) => i === column.length - 1));
    }
    // Unshuffled: column 0 is the ace of spades, column 4 ends on the two of hearts.
    expect(g.tableau[0][0].id).to.equal('1S');
    expect(g.tableau[4][4].id).to.equal('2H');
  });

  it('puts the other 24 in the stock, face down, and starts at zero', () => {
    const g = deal(3, identity);
    expect(g.stock.length).to.equal(24);
    expect(g.stock.every((c: Card) => !c.faceUp)).to.equal(true);
    expect(g.waste).to.deep.equal([]);
    expect(g.foundations.map((f) => f.length)).to.deep.equal([0, 0, 0, 0]);
    expect(g).to.include({ drawCount: 3, score: 0, moves: 0, status: 'playing' });
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
    expect(
      move(game({ t0: ['3S'], f0: ['AH', '2H'], score: 20 }), 'f0', 1, 't0')?.score,
      'foundation back',
    ).to.equal(5);
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

  /**
   * An ace onto an empty foundation is otherwise legal, and every arrival scores +10, so without
   * this rule one ace shuttled between two empty foundations scores without limit.
   */
  it('refuses moves between foundations, so an ace cannot be farmed for points', () => {
    expect(move(game({ f0: ['AH'] }), 'f0', 0, 'f1')).to.equal(undefined);
  });

  it('in Draw 3, second draw puts the new cards on top of existing waste', () => {
    const after1 = draw(game({ drawCount: 3, stock: ['-1S', '-2S', '-3S', '-4S', '-5S'] }));
    expect(ids(after1, 'waste'), 'first 3 drawn').to.deep.equal(['5S', '4S', '3S']);
    const after2 = draw(after1);
    expect(
      ids(after2, 'waste'),
      'remaining 2 drawn on top',
    ).to.deep.equal(['5S', '4S', '3S', '2S', '1S']);
  });

  it('in Draw 3, recycle restores waste order (reversed again)', () => {
    const g = game({
      drawCount: 3,
      stock: [],
      waste: ['3S', '2S', '1S'],
    });
    const recycled = draw(g);
    expect(ids(recycled, 'stock')).to.deep.equal(['1S', '2S', '3S']);
  });

  it('refuses a card or a run on a face-down top card', () => {
    expect(canDrop(game({ t0: ['-9S'] }), [card('8H')], 't0')).to.equal(false);
    expect(canDrop(game({ t0: ['-9S'] }), [card('8H'), card('7C')], 't0')).to.equal(false);
  });
});

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

  it('rejects untrusted data: null in a pile', () => {
    const g = deal(1, seededShuffle(1));
    const corrupted = {
      ...g,
      tableau: [
        [null as unknown as Card],
        ...g.tableau.slice(1),
      ],
    };
    expect(isKlondikeGame(corrupted)).to.equal(false);
  });

  it('rejects a card whose suit disagrees with its id', () => {
    const g = deal(1, seededShuffle(1));
    const bad = {
      ...g,
      stock: [
        {
          id: '1S',
          suit: 'H' as const,
          rank: 1,
          faceUp: false,
        },
        ...g.stock.slice(1),
      ],
    };
    expect(isKlondikeGame(bad)).to.equal(false);
  });
});
