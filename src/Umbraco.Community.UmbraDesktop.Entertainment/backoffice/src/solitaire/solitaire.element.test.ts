import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { backManifests, facesManifests } from './backs.js';
import type { ManifestSolitaireFaces } from './extensions.js';
import { SETTINGS_KEY } from './settings.js';
import { deal as dealGame, draw as drawCard, seededShuffle as seeded } from './rules.js';
import type { Card } from './rules.js';
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
 *
 * Waits for a face-up front to be drawn as well as for the 52 cards, because the face set is
 * loaded with a dynamic import: the cards exist a moment before their faces do.
 * @param options Overrides.
 * @returns The element, once its cards are drawn.
 */
export async function solitaire(
  options: {
    game?: KlondikeGame;
    store?: SavedGameStore;
    settings?: MemoryStorage;
    clockIntervalMs?: number;
    reducedMotion?: boolean;
  } = {},
): Promise<SolitaireElement> {
  const store = options.store ?? new SavedGameStore(() => new MemoryStorage());
  const settings = options.settings ?? new MemoryStorage();
  const el = await fixture<SolitaireElement>(html`<umbradesktop-solitaire
    style="display:block;width:${SOLITAIRE_CONTENT_SIZE.w}px;height:${SOLITAIRE_CONTENT_SIZE.h}px"
    .shuffle=${identity}
    .startingGame=${options.game}
    .store=${store}
    .settingsStorage=${() => settings}
    .clockIntervalMs=${options.clockIntervalMs ?? 1000}
    .reducedMotion=${() => options.reducedMotion ?? true}
  ></umbradesktop-solitaire>`);
  await waitUntil(
    () => cards(el).length === 52 && el.shadowRoot!.querySelector('.card.up .front svg') !== null,
    'cards drawn',
  );
  return el;
}

/** Every card element. */
export const cards = (el: SolitaireElement) => [...el.shadowRoot!.querySelectorAll<HTMLElement>('.card')];
/** One card by id. */
export const cardEl = (el: SolitaireElement, id: string) =>
  el.shadowRoot!.querySelector<HTMLElement>(`.card[data-id="${id}"]`)!;
/** A toolbar readout. */
export const readout = (el: SolitaireElement, name: string) =>
  (el.shadowRoot!.querySelector(`.${name} b`)?.textContent ?? '').trim();

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

  it('lays the cards out on the first render, without waiting for a resize observer', async () => {
    // Not the `solitaire` helper: that waits for faces, by which time an observer has long fired.
    // `fixture` resolves as soon as the first render is done, before any frame can be delivered.
    const el = await fixture<SolitaireElement>(html`<umbradesktop-solitaire
      style="display:block;width:${SOLITAIRE_CONTENT_SIZE.w}px;height:${SOLITAIRE_CONTENT_SIZE.h}px"
      .shuffle=${identity}
      .store=${new SavedGameStore(() => new MemoryStorage())}
      .settingsStorage=${() => new MemoryStorage()}
    ></umbradesktop-solitaire>`);
    expect(cardEl(el, '1S').getBoundingClientRect().width, 'cards have a size at once').to.be.greaterThan(40);
  });

  it('scales the cards with the window', async () => {
    const el = await solitaire();
    const before = cardEl(el, '1S').getBoundingClientRect().width;
    el.style.width = `${SOLITAIRE_CONTENT_SIZE.w * 1.3}px`;
    el.style.height = `${SOLITAIRE_CONTENT_SIZE.h * 1.3}px`;
    // A resize observer does the same in a real window; background test tabs never deliver its
    // callback, so the test asks for the measurement it would have triggered.
    el.relayout();
    await el.updateComplete;
    expect(cardEl(el, '1S').getBoundingClientRect().width).to.be.greaterThan(before + 5);
  });
});

/**
 * Dispatch a pointer event on a card, in viewport coordinates.
 * @param target The element the event starts on.
 * @param type The event type.
 * @param x Viewport x.
 * @param y Viewport y.
 */
function pointer(target: Element, type: string, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x, clientY: y, pointerId: 1, bubbles: true, composed: true, button: 0, isPrimary: true,
    }),
  );
}

/**
 * Drag a card's grab point onto another card's centre, stopping once on the way so the press
 * crosses the drag threshold.
 * @param el The game.
 * @param fromId The card to lift.
 * @param toId The card whose centre it is dropped on.
 */
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

/** Double-click a card. */
const doubleClick = (el: SolitaireElement, id: string) =>
  cardEl(el, id).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));

describe('solitaire element: playing', () => {
  it('draws from the stock on click', async () => {
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

  it('lifts the cards while dragging and lights the pile they would land on', async () => {
    const el = await solitaire();
    const from = cardEl(el, '2H');
    const a = from.getBoundingClientRect();
    const b = cardEl(el, '3S').getBoundingClientRect();
    pointer(from, 'pointerdown', a.left + a.width / 2, a.top + 10);
    pointer(from, 'pointermove', b.left + b.width / 2, b.top + b.height / 2);
    await el.updateComplete;
    expect(from.classList.contains('lifted'), 'lifted').to.equal(true);
    expect(el.shadowRoot!.querySelector('[data-slot="t1"]')!.classList.contains('target'), 'target lit').to.equal(true);
    pointer(from, 'pointerup', b.left + b.width / 2, b.top + b.height / 2);
    await el.updateComplete;
    expect(from.classList.contains('lifted'), 'put down again').to.equal(false);
    expect(el.shadowRoot!.querySelector('.target') === null, 'no target left lit').to.equal(true);
  });

  it('does not start a drag from a press that barely moves', async () => {
    const el = await solitaire();
    const from = cardEl(el, '2H');
    const a = from.getBoundingClientRect();
    pointer(from, 'pointerdown', a.left + 20, a.top + 10);
    pointer(from, 'pointermove', a.left + 21, a.top + 11);
    expect(from.classList.contains('lifted')).to.equal(false);
    pointer(from, 'pointerup', a.left + 21, a.top + 11);
    await el.updateComplete;
    expect(readout(el, 'moves')).to.equal('0');
  });

  it('sends an illegal drop back where it came from', async () => {
    const el = await solitaire();
    await drag(el, '3S', '6S');
    expect(cardEl(el, '3S').dataset.pile).to.equal('t1');
    expect(cardEl(el, '3S').style.transform).to.equal('');
    expect(readout(el, 'moves')).to.equal('0');
  });

  it('sends a card home on double-click', async () => {
    const el = await solitaire();
    doubleClick(el, '1S');
    await el.updateComplete;
    expect(cardEl(el, '1S').dataset.pile).to.equal('f0');
    expect(readout(el, 'score')).to.equal('10');
  });

  it('ignores a double-click on a card that cannot go home', async () => {
    const el = await solitaire();
    doubleClick(el, '3S');
    await el.updateComplete;
    expect(cardEl(el, '3S').dataset.pile).to.equal('t1');
    expect(readout(el, 'moves')).to.equal('0');
  });

  it('saves the game after a move, but not a fresh deal', async () => {
    const storage = new MemoryStorage();
    const store = new SavedGameStore(() => storage);
    const el = await solitaire({ store });
    expect(new SavedGameStore(() => storage).claim() === undefined, 'nothing saved yet').to.equal(true);
    doubleClick(el, '1S');
    await waitUntil(() => new SavedGameStore(() => storage).claim() !== undefined, 'saved after a move');
  });

  it('animates a move when motion is allowed', async () => {
    const el = await solitaire();
    el.reducedMotion = () => false;
    doubleClick(el, '1S');
    await waitUntil(() => cardEl(el, '1S').getAnimations().length > 0, 'the card flies');
  });
});

/**
 * A game one card from winning: every foundation full but spades, the king of spades on t0.
 * @returns The game.
 */
function nearlyWon(): KlondikeGame {
  const suit = (s: Card['suit'], upTo = 13): Card[] =>
    Array.from({ length: upTo }, (_, i) => ({ id: `${i + 1}${s}`, suit: s, rank: i + 1, faceUp: true }));
  return {
    stock: [], waste: [], drawCount: 1, score: 100, moves: 50, status: 'playing',
    foundations: [suit('S', 12), suit('H'), suit('D'), suit('C')],
    tableau: [[{ id: '13S', suit: 'S', rank: 13, faceUp: true }], [], [], [], [], [], []],
  };
}

/**
 * A game auto-finish can end: spades split between the foundation and three columns.
 * @returns The game.
 */
function finishable(): KlondikeGame {
  const g = nearlyWon();
  const spade = (rank: number): Card => ({ id: `${rank}S`, suit: 'S', rank, faceUp: true });
  return {
    ...g,
    foundations: [g.foundations[0].slice(0, 10), g.foundations[1], g.foundations[2], g.foundations[3]],
    tableau: [[spade(13)], [spade(12)], [spade(11)], [], [], [], []],
  };
}

/** Timer-based frames for the cascade, since background tabs never deliver real ones. */
const timerFrames = {
  schedule: (callback: () => void): number => window.setTimeout(callback, 0),
  cancel: (handle: number): void => window.clearTimeout(handle),
};

/**
 * Whether any pixel of a canvas has been drawn on.
 * @param canvas The canvas.
 * @returns True when something is not transparent.
 */
function drawnOn(canvas: HTMLCanvasElement): boolean {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
  return false;
}

/**
 * Let an element win with the cascade running on timer frames.
 * @param el The game.
 */
function allowCascade(el: SolitaireElement): void {
  el.reducedMotion = () => false;
  el.cascadeSchedule = timerFrames.schedule;
  el.cascadeCancel = timerFrames.cancel;
}

describe('solitaire element: finishing', () => {
  it('offers Finish when the rest is a formality, and finishes the game', async () => {
    const el = await solitaire({ game: finishable() });
    const finish = el.shadowRoot!.querySelector<HTMLElement>('.auto-finish');
    expect(finish !== null, 'the Finish button is offered').to.equal(true);
    finish!.click();
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    expect(cards(el).filter((c) => c.dataset.pile === 'f0').length).to.equal(13);
  });

  it('does not offer Finish while a card is still face down or in the stock', async () => {
    const el = await solitaire();
    expect(el.shadowRoot!.querySelector('.auto-finish') === null).to.equal(true);
  });

  it('shows the win panel at once with reduced motion, with the score and a Play again button', async () => {
    const el = await solitaire({ game: nearlyWon() });
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    expect(el.shadowRoot!.querySelector('canvas') === null, 'no cascade').to.equal(true);
    expect(el.shadowRoot!.querySelector('.win .play-again') !== null, 'Play again').to.equal(true);
    // 100, plus 10 for the last card, plus the time bonus (none under 30 seconds).
    expect(el.shadowRoot!.querySelector('.win b')!.textContent).to.equal('110');
  });

  it('runs the cascade when motion is allowed, draws it, and a click ends it', async () => {
    const el = await solitaire({ game: nearlyWon() });
    allowCascade(el);
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('canvas.cascade'), 'cascade');
    const canvas = el.shadowRoot!.querySelector<HTMLCanvasElement>('canvas.cascade')!;
    await waitUntil(() => drawnOn(canvas), 'the cascade draws cards');
    expect(el.shadowRoot!.querySelector('.win') === null, 'no panel while it runs').to.equal(true);
    canvas.click();
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'panel after the cascade');
    expect(el.shadowRoot!.querySelector('canvas.cascade') === null, 'canvas gone').to.equal(true);
  });

  it('ends the cascade on a key press', async () => {
    const el = await solitaire({ game: nearlyWon() });
    allowCascade(el);
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('canvas.cascade'), 'cascade');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'panel after a key');
  });

  it('does not raise the win panel over a new game dealt during the cascade', async () => {
    const el = await solitaire({ game: nearlyWon() });
    allowCascade(el);
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('canvas.cascade'), 'cascade');
    el.shadowRoot!.querySelector<HTMLElement>('.new-game')!.click();
    await waitUntil(() => cardEl(el, '1S').dataset.pile === 't0', 'fresh deal');
    await new Promise((r) => setTimeout(r, 50));
    expect(el.shadowRoot!.querySelector('.win') === null, 'no panel').to.equal(true);
    expect(el.shadowRoot!.querySelector('canvas.cascade') === null, 'no canvas').to.equal(true);
  });

  it('forgets a won game, including the save an earlier move made', async () => {
    const storage = new MemoryStorage();
    const el = await solitaire({ game: finishable(), store: new SavedGameStore(() => storage) });
    doubleClick(el, '11S');
    await waitUntil(() => new SavedGameStore(() => storage).claim() !== undefined, 'the move was saved');
    doubleClick(el, '12S');
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    expect(new SavedGameStore(() => storage).claim() === undefined, 'nothing left saved').to.equal(true);
  });

  it('starts another game from Play again', async () => {
    const el = await solitaire({ game: nearlyWon() });
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    el.shadowRoot!.querySelector<HTMLElement>('.play-again')!.click();
    await waitUntil(() => el.shadowRoot!.querySelector('.win') === null && cardEl(el, '1S').dataset.pile === 't0');
    expect(readout(el, 'score')).to.equal('0');
  });
});

describe('solitaire element: keeping things', () => {
  it('saves after a move, and a new window on the same page claims that game', async () => {
    const storage = new MemoryStorage();
    const first = await solitaire({ store: new SavedGameStore(() => storage) });
    doubleClick(first, '1S');
    await waitUntil(() => cardEl(first, '1S').dataset.pile === 'f0');
    await first.updateComplete;
    // A reload: a new page store over the same session storage. The old element is not disconnected.
    const second = await solitaire({ store: new SavedGameStore(() => storage) });
    expect(cardEl(second, '1S').dataset.pile).to.equal('f0');
    expect(readout(second, 'score')).to.equal('10');
  });

  it('forgets its game when the window closes', async () => {
    const storage = new MemoryStorage();
    const el = await solitaire({ store: new SavedGameStore(() => storage) });
    doubleClick(el, '1S');
    await waitUntil(() => new SavedGameStore(() => storage).claim() !== undefined, 'saved');
    el.remove();
    expect(new SavedGameStore(() => storage).claim() === undefined).to.equal(true);
  });

  it('deals a fresh game on New game, forgets the old save and resets the clock', async () => {
    const storage = new MemoryStorage();
    const el = await solitaire({ store: new SavedGameStore(() => storage) });
    doubleClick(el, '1S');
    await waitUntil(() => cardEl(el, '1S').dataset.pile === 'f0');
    el.shadowRoot!.querySelector<HTMLElement>('.new-game')!.click();
    await waitUntil(() => cardEl(el, '1S').dataset.pile === 't0', 'dealt again');
    expect(readout(el, 'score')).to.equal('0');
    expect(readout(el, 'time')).to.equal('0:00');
    expect(new SavedGameStore(() => storage).claim() === undefined, 'no save of a fresh deal').to.equal(true);
  });

  it('continues the clock from a saved game', async () => {
    const storage = new MemoryStorage();
    new SavedGameStore(() => storage).save('old', {
      game: { ...dealGame(1, seeded(3)), moves: 4 },
      elapsedSeconds: 75,
    });
    const el = await solitaire({ store: new SavedGameStore(() => storage) });
    expect(readout(el, 'time')).to.equal('1:15');
  });

  it('ticks from the first move, charging the time penalty, and saves each tick', async () => {
    const storage = new MemoryStorage();
    const el = await solitaire({ store: new SavedGameStore(() => storage) });
    el.clockIntervalMs = 5;
    await new Promise((r) => setTimeout(r, 60));
    expect(readout(el, 'time'), 'the clock waits for the first move').to.equal('0:00');
    doubleClick(el, '1S');
    await waitUntil(() => readout(el, 'score') === '8', 'ten seconds cost two points');
    expect(readout(el, 'time')).to.not.equal('0:00');
    const saved = new SavedGameStore(() => storage).claim()!;
    expect(saved.saved.elapsedSeconds, 'each tick is saved').to.be.greaterThan(9);
  });

  it('stops the clock at the win', async () => {
    // The game has moves already, so its clock starts when the window opens: the interval must be
    // short from the start for the test to see the clock running before the win.
    const el = await solitaire({ game: nearlyWon(), clockIntervalMs: 5 });
    await waitUntil(() => readout(el, 'time') !== '0:00', 'the clock runs');
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    const at = readout(el, 'time');
    await new Promise((r) => setTimeout(r, 60));
    expect(readout(el, 'time')).to.equal(at);
  });

  it('stops the clock, and saves nothing more, when the window closes', async () => {
    const storage = new MemoryStorage();
    const el = await solitaire({ store: new SavedGameStore(() => storage) });
    el.clockIntervalMs = 5;
    doubleClick(el, '1S');
    await waitUntil(() => readout(el, 'time') !== '0:00', 'ticking');
    el.remove();
    await new Promise((r) => setTimeout(r, 60));
    expect(new SavedGameStore(() => storage).claim() === undefined, 'a tick saved after close').to.equal(true);
  });
});

describe('solitaire element: settings', () => {
  /** Shorthand for the modal, once open. */
  const modalOf = (el: SolitaireElement) => el.shadowRoot!.querySelector('umbradesktop-solitaire-settings')!;

  /** A face set whose module cannot be loaded, as one from an uninstalled package would be. */
  const broken: ManifestSolitaireFaces = {
    type: 'umbraDesktopSolitaireFaces',
    alias: 'Test.Faces.Broken',
    name: 'Broken faces',
    loader: () => Promise.reject(new Error('chunk is gone')),
    meta: { label: 'Broken' },
  };

  afterEach(() => {
    for (const m of [...backManifests, ...facesManifests, broken]) umbExtensionsRegistry.unregister(m.alias);
  });

  it('opens from the gear, applies a draw mode to the next game only, and stores it', async () => {
    const settings = new MemoryStorage();
    const el = await solitaire({ settings });
    el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
    await el.updateComplete;
    modalOf(el).dispatchEvent(
      new CustomEvent('solitaire-settings-change', { detail: { drawCount: 3 }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(JSON.parse(settings.getItem(SETTINGS_KEY)!).drawCount, 'stored').to.equal(3);
    el.shadowRoot!.querySelector<HTMLElement>('[data-slot="stock"]')!.click();
    await el.updateComplete;
    expect(cards(el).filter((c) => c.dataset.pile === 'waste').length, 'still Draw 1 this game').to.equal(1);
    modalOf(el).dispatchEvent(new CustomEvent('solitaire-settings-close', { bubbles: true, composed: true }));
    await el.updateComplete;
    el.shadowRoot!.querySelector<HTMLElement>('.new-game')!.click();
    await waitUntil(() => cardEl(el, '1S').dataset.pile === 't0' && readout(el, 'moves') === '0');
    el.shadowRoot!.querySelector<HTMLElement>('[data-slot="stock"]')!.click();
    await el.updateComplete;
    expect(cards(el).filter((c) => c.dataset.pile === 'waste').length, 'Draw 3 from the next game').to.equal(3);
  });

  it('closes the modal and puts focus back on the gear', async () => {
    const el = await solitaire();
    el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
    await el.updateComplete;
    expect(modalOf(el) !== null, 'open').to.equal(true);
    modalOf(el).dispatchEvent(new CustomEvent('solitaire-settings-close', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('umbradesktop-solitaire-settings') === null, 'closed').to.equal(true);
    expect(el.shadowRoot!.activeElement?.classList.contains('settings') === true, 'gear has focus').to.equal(true);
  });

  it('lists every registered back and applies a chosen one to the cards at once', async () => {
    umbExtensionsRegistry.registerMany(backManifests);
    const el = await solitaire();
    el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
    await waitUntil(() => modalOf(el)?.shadowRoot?.querySelectorAll('[data-back]').length === backManifests.length);
    const chosen = backManifests.find((m) => m.alias.endsWith('.Codegarden'))!;
    modalOf(el).shadowRoot!.querySelector<HTMLElement>(`[data-back="${chosen.alias}"]`)!.click();
    await waitUntil(
      () => cardEl(el, '13C').querySelector('.back img')!.getAttribute('src')!.endsWith('codegarden.avif'),
      'back applied',
    );
  });

  it('shows every face set with a preview, and survives one whose module will not load', async () => {
    umbExtensionsRegistry.registerMany([...facesManifests, broken]);
    const el = await solitaire();
    el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
    await waitUntil(() => modalOf(el)?.shadowRoot?.querySelectorAll('[data-faces]').length === 2, 'both listed');
    const thumb = (alias: string) => modalOf(el).shadowRoot!.querySelector(`[data-faces="${alias}"] .thumb`)!;
    await waitUntil(() => thumb(facesManifests[0].alias).querySelector('svg') !== null, 'classic previewed');
    expect(thumb(broken.alias).querySelector('svg') === null, 'the broken one has no preview').to.equal(true);
  });

  it('falls back to Match theme and classic when the stored back and faces no longer exist', async () => {
    umbExtensionsRegistry.registerMany([...backManifests, ...facesManifests]);
    const settings = new MemoryStorage();
    settings.setItem(SETTINGS_KEY, JSON.stringify({ drawCount: 1, back: 'Gone.Back', faces: 'Gone.Faces' }));
    const el = await solitaire({ settings });
    expect(cardEl(el, '13C').querySelector('img')!.getAttribute('src')!.endsWith('aurora-flow.avif')).to.equal(true);
    expect(cardEl(el, '1S').querySelector('.front svg') !== null, 'classic faces drawn').to.equal(true);
  });

  it('falls back to Match theme quietly when the stored back is one of the removed per-theme backs', async () => {
    umbExtensionsRegistry.registerMany(backManifests);
    const settings = new MemoryStorage();
    const removed = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Back.macos';
    settings.setItem(SETTINGS_KEY, JSON.stringify({ drawCount: 1, back: removed, faces: 'x' }));
    const el = await solitaire({ settings });
    expect(cardEl(el, '13C').querySelector('img')!.getAttribute('src')!.endsWith('aurora-flow.avif')).to.equal(true);
    el.setAttribute('data-umbradesktop-theme', 'macos');
    await el.updateComplete;
    expect(cardEl(el, '13C').querySelector('img')!.getAttribute('src')!.endsWith('first-light.avif')).to.equal(true);
    for (const m of backManifests) umbExtensionsRegistry.unregister(m.alias);
  });
});

describe('solitaire element: felt layering', () => {
  /** The element a click at the centre of `target` would hit, as the browser decides it. */
  const hitAtCentre = (el: SolitaireElement, target: Element) => {
    const r = target.getBoundingClientRect();
    return el.shadowRoot!.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  };

  it('paints the noise beneath the table, so the felt grain never lies over a card', async () => {
    const el = await solitaire();
    const noise = getComputedStyle(el.shadowRoot!.querySelector('.felt')!, '::before').zIndex;
    expect(noise, 'noise takes its place by DOM order, before the table').to.equal('auto');
    expect(Number(getComputedStyle(el.shadowRoot!.querySelector('.table')!).zIndex), 'table is a layer of its own').to.be.at.least(1);
  });

  it('keeps every click on the cards: a hit over a card finds the card, never a layer', async () => {
    const el = await solitaire();
    for (const card of [cardEl(el, '1S'), cardEl(el, '13C')]) {
      expect(hitAtCentre(el, card)?.closest('.card')).to.equal(card);
    }
  });
});

/** A game with the stock dealt out to the waste, so the stock is empty and a click recycles. */
function stockDealtOut(): KlondikeGame {
  let game = dealGame(1, identity);
  while (game.stock.length > 0) game = drawCard(game);
  return game;
}

describe('solitaire element: review fixes', () => {
  const modalOf = (el: SolitaireElement) => el.shadowRoot!.querySelector('umbradesktop-solitaire-settings')!;

  it('keeps the settings modal above every card, for painting and for clicks', async () => {
    const el = await solitaire();
    el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
    await waitUntil(() => modalOf(el)?.shadowRoot?.querySelector('.done'), 'modal open');
    const modal = modalOf(el);
    const panel = modal.shadowRoot!.querySelector('.panel')!.getBoundingClientRect();
    const beneath = cards(el).filter((c) => {
      const r = c.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return x > panel.left && x < panel.right && y > panel.top && y < panel.bottom;
    });
    expect(beneath.length, 'some cards lie under the panel, or this proves nothing').to.be.greaterThan(5);
    for (const card of beneath) {
      const r = card.getBoundingClientRect();
      const hit = el.shadowRoot!.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      expect(hit === modal, `${card.dataset.id} took a click meant for the modal`).to.equal(true);
    }
    const done = modal.shadowRoot!.querySelector('.done')!;
    const d = done.getBoundingClientRect();
    const atDone = modal.shadowRoot!.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2);
    expect(atDone === done, 'Done').to.equal(true);
  });

  it('keeps the win panel above the cards', async () => {
    const el = await solitaire({ game: nearlyWon() });
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    const button = el.shadowRoot!.querySelector('.play-again')!;
    const r = button.getBoundingClientRect();
    expect(el.shadowRoot!.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === button).to.equal(true);
  });

  it('raises a card above the resting ones while it flies, and puts it down afterwards', async () => {
    const el = await solitaire();
    el.reducedMotion = () => false;
    doubleClick(el, '1S');
    await waitUntil(() => cardEl(el, '1S').getAnimations().length > 0, 'the card flies');
    const card = cardEl(el, '1S');
    expect(card.classList.contains('flying'), 'raised in flight').to.equal(true);
    const z = (c: HTMLElement) => Number(getComputedStyle(c).zIndex);
    const resting = Math.max(...cards(el).filter((c) => c !== card).map(z));
    expect(z(card), 'above every resting card').to.be.greaterThan(resting);
    // Real animations do not advance in a background tab, so the test ends them itself.
    card.getAnimations().forEach((a) => a.finish());
    await waitUntil(() => !card.classList.contains('flying'), 'put down after the flight');
  });

  it('keeps a rejected drop above its neighbours while it glides back', async () => {
    const el = await solitaire();
    el.reducedMotion = () => false;
    await drag(el, '3S', '6S');
    const card = cardEl(el, '3S');
    await waitUntil(() => card.getAnimations().length > 0, 'glides back');
    expect(card.classList.contains('flying'), 'raised while gliding').to.equal(true);
    card.getAnimations().forEach((a) => a.finish());
    await waitUntil(() => !card.classList.contains('flying'), 'settled');
  });

  it('lights every legal landing spot faintly while dragging, and the one under the cards strongly', async () => {
    const el = await solitaire();
    const from = cardEl(el, '2H');
    const a = from.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    pointer(from, 'pointerdown', a.left + a.width / 2, a.top + 10);
    pointer(from, 'pointermove', host.left + 4, host.top + 4);
    await el.updateComplete;
    const slot = (id: string) => el.shadowRoot!.querySelector(`[data-slot="${id}"]`)!;
    expect(slot('t1').classList.contains('legal'), 'the only black three').to.equal(true);
    expect(slot('t1').classList.contains('target'), 'not under the cards yet').to.equal(false);
    expect(cardEl(el, '3S').classList.contains('legal'), 'its top card is lit too').to.equal(true);
    expect(slot('t0').classList.contains('legal'), 't0 is no place for a two of hearts').to.equal(false);
    const b = cardEl(el, '3S').getBoundingClientRect();
    pointer(from, 'pointermove', b.left + b.width / 2, b.top + b.height / 2);
    await el.updateComplete;
    expect(slot('t1').classList.contains('target'), 'strong when under the cards').to.equal(true);
    expect(slot('t1').classList.contains('legal'), 'and still legal').to.equal(true);
    expect(cardEl(el, '3S').classList.contains('target'), 'the column top glows too').to.equal(true);
    pointer(from, 'pointerup', host.left + 4, host.top + 4);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.legal') === null, 'nothing stays lit').to.equal(true);
  });

  it('wears the toolbar and the win panel as Windows 98 under that theme', async () => {
    const el = await solitaire({ game: nearlyWon() });
    el.setAttribute('data-umbradesktop-theme', 'win98');
    await el.updateComplete;
    const button = getComputedStyle(el.shadowRoot!.querySelector('.new-game')!);
    expect(button.backgroundColor).to.equal('rgb(192, 192, 192)');
    expect(button.borderTopLeftRadius, 'square corners').to.equal('0px');
    expect(button.boxShadow, 'a bevel').to.contain('rgb(255, 255, 255)');
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    const panel = getComputedStyle(el.shadowRoot!.querySelector('.win')!);
    expect(panel.backgroundColor).to.equal('rgb(192, 192, 192)');
    expect(panel.borderTopLeftRadius).to.equal('0px');
  });

  it('keeps the toolbar translucent under the other themes', async () => {
    const el = await solitaire();
    const button = getComputedStyle(el.shadowRoot!.querySelector('.new-game')!);
    expect(button.backgroundColor).to.contain('rgba');
  });

  it('marks the back and faces actually in use as selected when the stored ones are gone', async () => {
    umbExtensionsRegistry.registerMany([...backManifests, ...facesManifests]);
    try {
      const settings = new MemoryStorage();
      settings.setItem(SETTINGS_KEY, JSON.stringify({ drawCount: 1, back: 'Gone.Back', faces: 'Gone.Faces' }));
      const el = await solitaire({ settings });
      el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
      await waitUntil(() => modalOf(el)?.shadowRoot?.querySelector('[data-back]'), 'modal open');
      const pressed = (sel: string) => modalOf(el).shadowRoot!.querySelector(sel)!.getAttribute('aria-pressed');
      expect(pressed(`[data-back="${backManifests[0].alias}"]`), 'Match theme').to.equal('true');
      expect(pressed(`[data-faces="${facesManifests[0].alias}"]`), 'classic').to.equal('true');
    } finally {
      for (const m of [...backManifests, ...facesManifests]) umbExtensionsRegistry.unregister(m.alias);
    }
  });

  it('falls back to classic when the chosen face set cannot be loaded, instead of blanking the cards', async () => {
    const broken: ManifestSolitaireFaces = {
      type: 'umbraDesktopSolitaireFaces',
      alias: 'Test.Faces.Broken2',
      name: 'Broken faces',
      loader: () => Promise.reject(new Error('chunk is gone')),
      meta: { label: 'Broken' },
    };
    umbExtensionsRegistry.register(broken);
    try {
      const settings = new MemoryStorage();
      settings.setItem(SETTINGS_KEY, JSON.stringify({ drawCount: 1, back: 'x', faces: broken.alias }));
      const el = await solitaire({ settings });
      expect(cardEl(el, '1S').querySelector('.front svg') !== null, 'classic drawn instead').to.equal(true);
    } finally {
      umbExtensionsRegistry.unregister(broken.alias);
    }
  });

  it('snaps a drag back when the pointer is cancelled, and is ready for the next one', async () => {
    const el = await solitaire();
    const from = cardEl(el, '2H');
    const a = from.getBoundingClientRect();
    pointer(from, 'pointerdown', a.left + 20, a.top + 10);
    pointer(from, 'pointermove', a.left + 60, a.top + 60);
    expect(from.classList.contains('lifted')).to.equal(true);
    pointer(from, 'pointercancel', a.left + 60, a.top + 60);
    await el.updateComplete;
    expect(from.classList.contains('lifted'), 'put down').to.equal(false);
    expect(from.style.transform).to.equal('');
    expect(readout(el, 'moves'), 'a cancel never moves anything').to.equal('0');
    await drag(el, '2H', '3S');
    expect(cardEl(el, '2H').dataset.pile, 'the next drag works').to.equal('t1');
  });

  it('snaps a drag back when pointer capture is lost, instead of leaving the cards stuck', async () => {
    const el = await solitaire();
    const from = cardEl(el, '2H');
    const a = from.getBoundingClientRect();
    pointer(from, 'pointerdown', a.left + 20, a.top + 10);
    pointer(from, 'pointermove', a.left + 60, a.top + 60);
    pointer(from, 'lostpointercapture', a.left + 60, a.top + 60);
    await el.updateComplete;
    expect(from.classList.contains('lifted'), 'put down').to.equal(false);
    expect(from.style.transform).to.equal('');
    await drag(el, '2H', '3S');
    expect(cardEl(el, '2H').dataset.pile, 'the next drag works').to.equal('t1');
  });

  it('recycles the waste when the empty stock slot is clicked', async () => {
    const el = await solitaire({ game: stockDealtOut() });
    expect(cards(el).filter((c) => c.dataset.pile === 'stock').length, 'stock is empty').to.equal(0);
    const moves = Number(readout(el, 'moves'));
    el.shadowRoot!.querySelector<HTMLElement>('[data-slot="stock"]')!.click();
    await el.updateComplete;
    expect(cards(el).filter((c) => c.dataset.pile === 'stock').length).to.equal(24);
    expect(cards(el).filter((c) => c.dataset.pile === 'waste').length).to.equal(0);
    expect(Number(readout(el, 'moves'))).to.equal(moves + 1);
  });

  it('puts the New game button in focus when the window opens', async () => {
    const el = await solitaire();
    expect(el.shadowRoot!.activeElement?.classList.contains('new-game') === true).to.equal(true);
  });

  it('lets New game cancel an auto-finish under way', async () => {
    const el = await solitaire({ game: finishable() });
    el.reducedMotion = () => false;
    el.shadowRoot!.querySelector<HTMLElement>('.auto-finish')!.click();
    await waitUntil(() => cardEl(el, '11S').dataset.pile === 'f0', 'first card home');
    el.shadowRoot!.querySelector<HTMLElement>('.new-game')!.click();
    await waitUntil(() => cardEl(el, '1S').dataset.pile === 't0', 'fresh deal');
    await new Promise((r) => setTimeout(r, 400));
    expect(readout(el, 'moves'), 'the old auto-finish played nothing into the new game').to.equal('0');
    expect(el.shadowRoot!.querySelector('.win') === null, 'no win panel').to.equal(true);
  });

  it('ignores the cards while auto-finish plays', async () => {
    const el = await solitaire({ game: finishable() });
    el.reducedMotion = () => false;
    el.shadowRoot!.querySelector<HTMLElement>('.auto-finish')!.click();
    await el.updateComplete;
    const king = cardEl(el, '13S');
    const a = king.getBoundingClientRect();
    pointer(king, 'pointerdown', a.left + 20, a.top + 10);
    pointer(king, 'pointermove', a.left + 80, a.top + 80);
    expect(king.classList.contains('lifted'), 'cannot be picked up mid-finish').to.equal(false);
    expect(el.shadowRoot!.querySelector('.auto-finish') === null, 'and Finish is not offered twice').to.equal(true);
  });

  it('leaves no save behind when the window closes during an auto-finish', async () => {
    const storage = new MemoryStorage();
    const el = await solitaire({ game: finishable(), store: new SavedGameStore(() => storage) });
    el.reducedMotion = () => false;
    el.shadowRoot!.querySelector<HTMLElement>('.auto-finish')!.click();
    // Polled fast: the next card goes home 110ms later, and the window must close in between.
    await waitUntil(() => cardEl(el, '11S').dataset.pile === 'f0', 'first card home', { interval: 2 });
    expect(cardEl(el, '12S').dataset.pile, 'still playing').to.equal('t1');
    el.remove();
    // Watched throughout, not checked at the end: the last card's win clears the save by itself, so
    // a move saved after the close would be gone again before an end check could see it.
    let savedAfterClose = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 10));
      if (new SavedGameStore(() => storage).claim() !== undefined) savedAfterClose = true;
    }
    expect(savedAfterClose, 'a move saved after close').to.equal(false);
  });

  it('ends the cascade cleanly when it is clicked while the card images are still decoding', async () => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = () => new Promise<void>((resolve) => setTimeout(resolve, 300));
    try {
      const el = await solitaire({ game: nearlyWon() });
      let frames = 0;
      el.reducedMotion = () => false;
      el.cascadeSchedule = (cb) => {
        frames++;
        return window.setTimeout(cb, 0);
      };
      el.cascadeCancel = (h) => window.clearTimeout(h);
      doubleClick(el, '13S');
      await waitUntil(() => el.shadowRoot!.querySelector('canvas.cascade'), 'cascade canvas');
      el.shadowRoot!.querySelector<HTMLElement>('canvas.cascade')!.click();
      await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'panel');
      await new Promise((r) => setTimeout(r, 100));
      expect(frames, 'the cascade never started').to.equal(0);
    } finally {
      HTMLImageElement.prototype.decode = decode;
    }
  });

  it('merges a settings change into what is stored, so a stale window cannot wipe another one', async () => {
    const settings = new MemoryStorage();
    const first = await solitaire({ settings });
    const second = await solitaire({ settings });
    const change = (el: SolitaireElement, detail: object) => {
      el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
      return el.updateComplete.then(() =>
        modalOf(el).dispatchEvent(
          new CustomEvent('solitaire-settings-change', { detail, bubbles: true, composed: true }),
        ));
    };
    await change(second, { back: 'Some.Back' });
    await change(first, { drawCount: 3 });
    const stored = JSON.parse(settings.getItem(SETTINGS_KEY)!);
    expect(stored.back, 'the other window change survived').to.equal('Some.Back');
    expect(stored.drawCount).to.equal(3);
  });

  it('reloads the faces when another window stored a different face set, on the next settings change', async () => {
    const alt: ManifestSolitaireFaces = {
      type: 'umbraDesktopSolitaireFaces',
      alias: 'Test.Faces.Alt',
      name: 'Alt faces',
      loader: () =>
        Promise.resolve({
          default: { render: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" data-alt=""></svg>' },
        }),
      meta: { label: 'Alt' },
    };
    umbExtensionsRegistry.registerMany([...facesManifests, alt]);
    try {
      const settings = new MemoryStorage();
      const first = await solitaire({ settings });
      const second = await solitaire({ settings });
      const change = async (el: SolitaireElement, detail: object) => {
        el.shadowRoot!.querySelector<HTMLElement>('.settings')!.click();
        await el.updateComplete;
        modalOf(el).dispatchEvent(
          new CustomEvent('solitaire-settings-change', { detail, bubbles: true, composed: true }),
        );
      };
      await change(second, { faces: alt.alias });
      expect(cardEl(first, '1S').querySelector('[data-alt]') === null, 'first has not heard yet').to.equal(true);
      await change(first, { drawCount: 3 });
      await waitUntil(() => cardEl(first, '1S').querySelector('[data-alt]') !== null, 'first now draws the alt faces');
    } finally {
      for (const m of [...facesManifests, alt]) umbExtensionsRegistry.unregister(m.alias);
    }
  });
});
