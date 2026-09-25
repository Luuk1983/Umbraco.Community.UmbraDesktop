import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './snake.element.js';
import { SNAKE_BOARD, SNAKE_CELL_SIZE_PX, SNAKE_CONTENT_SIZE, SNAKE_PADDING_PX } from './constants.js';
import { BEST_SCORE_KEY } from './snake.element.js';
import type { SnakeElement } from './snake.element.js';
import type { SnakeFoodPlacer } from './rules.js';

/** A placer that drops food exactly where a case says, then in the first free cell. */
function foodAt(...cells: number[]): SnakeFoodPlacer {
  const queue = [...cells];
  return (free) => queue.shift() ?? free[0];
}

/**
 * A mounted game.
 *
 * Every case runs with a very short tick so a test can watch the snake move without waiting for a
 * player's speed. Every case drives the game through key presses and the DOM, never the element's
 * fields: the rules have their own coverage and this is the player's view of them.
 * @param placer Optional food placement.
 * @param tick The tick length in ms, whatever the score.
 * @returns The mounted element, after its first render.
 */
async function game(placer?: SnakeFoodPlacer, tick = 10): Promise<SnakeElement> {
  return await fixture<SnakeElement>(
    html`<umbradesktop-snake .placer=${placer} .tickInterval=${() => tick}></umbradesktop-snake>`,
  );
}

/** Press a key on the playfield, the way a focused player would. */
async function press(element: SnakeElement, key: string): Promise<void> {
  field(element).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
  await element.updateComplete;
}

/** The focusable playfield. */
function field(element: SnakeElement): HTMLElement {
  return element.shadowRoot!.querySelector<HTMLElement>('.field')!;
}

/** Every cell, in board order. */
function cells(element: SnakeElement): HTMLElement[] {
  return [...(element.shadowRoot?.querySelectorAll<HTMLElement>('.cell') ?? [])];
}

/** One element's text, whitespace trimmed. */
function text(element: SnakeElement, selector: string): string {
  return (element.shadowRoot?.querySelector(selector)?.textContent ?? '').trim();
}

/** The game's status, as the playfield publishes it. */
function status(element: SnakeElement): string | undefined {
  return field(element).dataset.status;
}

describe('snake element', () => {
  it('renders a full board with the snake and one piece of food on it', async () => {
    const element = await game(foodAt(0));
    expect(cells(element).length).to.equal(SNAKE_BOARD.width * SNAKE_BOARD.height);
    expect(cells(element).filter((cell) => cell.dataset.part === 'head').length).to.equal(1);
    expect(cells(element).filter((cell) => cell.dataset.part === 'body').length).to.equal(
      SNAKE_BOARD.initialLength - 1,
    );
    expect(cells(element)[0].dataset.part, 'the food, where the placer put it').to.equal('food');
  });

  it('starts with a score of zero and waits for a key', async () => {
    const element = await game(foodAt(0));
    expect(text(element, '.score')).to.equal('0');
    expect(status(element)).to.equal('ready');
    expect(text(element, '.message'), 'tells the player how to begin').to.not.equal('');
  });

  /** The message sits dead centre on the playing field, whatever size the window is. */
  it('centres the message on the playing field', async () => {
    const element = await game(foodAt(0));
    const message = element.shadowRoot!.querySelector<HTMLElement>('.message')!.getBoundingClientRect();
    const board = field(element).getBoundingClientRect();
    const centre = (box: DOMRect) => [box.left + box.width / 2, box.top + box.height / 2];
    const [mx, my] = centre(message);
    const [bx, by] = centre(board);
    expect(Math.abs(mx - bx), 'across').to.be.at.most(0.5);
    expect(Math.abs(my - by), 'down').to.be.at.most(0.5);
  });

  /** Random food can land under the start message; the window moves it before anyone sees. */
  it('moves food dealt under the start message to where it can be seen', async () => {
    const middle = Math.floor(SNAKE_BOARD.height / 2) * SNAKE_BOARD.width + Math.floor(SNAKE_BOARD.width / 2);
    const element = await game(foodAt(middle, 0));
    await element.updateComplete;
    const message = element.shadowRoot!.querySelector<HTMLElement>('.message')!.getBoundingClientRect();
    const food = cells(element).find((cell) => cell.dataset.part === 'food')!;
    const box = food.getBoundingClientRect();
    expect(cells(element).indexOf(food), 'moved to the next place the placer offers').to.equal(0);
    expect(box.bottom > message.top && box.top < message.bottom).to.equal(false);
  });

  it('does not cover the snake with the start message', async () => {
    // A banner centred on the board once hid the snake completely, because the snake started in
    // the middle row, so the player could not see which way it was facing before pressing a key.
    // The snake now starts a quarter of the way down, clear of it.
    const element = await game(foodAt(0));
    const message = element.shadowRoot!.querySelector<HTMLElement>('.message')!.getBoundingClientRect();
    for (const cell of cells(element).filter((each) => each.dataset.part)) {
      const box = cell.getBoundingClientRect();
      const overlaps = box.bottom > message.top && box.top < message.bottom;
      expect(overlaps, `the ${cell.dataset.part} should be visible above or below the message`).to.equal(false);
    }
  });

  it('starts moving on an arrow key', async () => {
    const element = await game(foodAt(0));
    const head = cells(element).findIndex((cell) => cell.dataset.part === 'head');
    await press(element, 'ArrowUp');
    expect(status(element)).to.equal('playing');
    // Straight up: same column, a lower index. How many rows it has gone by the time this polls
    // depends on the machine, so the case does not count them.
    await waitUntil(() => {
      const now = cells(element).findIndex((cell) => cell.dataset.part === 'head');
      return now >= 0 && now < head && (head - now) % SNAKE_BOARD.width === 0;
    }, 'the head should move up');
  });

  /**
   * Every key steers the way it says, the four arrows and W, A, S and D alike, checked by where the
   * head actually goes rather than only that the game started.
   *
   * Left needs a turn first. The snake starts facing right, and a reversal is ignored so that a
   * mistimed key cannot kill it, so Left or A on a fresh game rightly does nothing. Those two cases
   * press Up first and then the key, and check the snake went up and then left; the other six are
   * pressed on their own.
   */
  describe('steering', () => {
    /** Where a cell is on the board. */
    const at = (index: number) => ({ x: index % SNAKE_BOARD.width, y: Math.floor(index / SNAKE_BOARD.width) });

    /** Where the head is now. */
    const head = (element: SnakeElement) => at(cells(element).findIndex((cell) => cell.dataset.part === 'head'));

    const cases: Array<{ keys: string[]; way: string; went: (from: { x: number; y: number }, to: { x: number; y: number }) => boolean }> = [
      { keys: ['ArrowUp'], way: 'up', went: (from, to) => to.x === from.x && to.y < from.y },
      { keys: ['w'], way: 'up', went: (from, to) => to.x === from.x && to.y < from.y },
      { keys: ['ArrowDown'], way: 'down', went: (from, to) => to.x === from.x && to.y > from.y },
      { keys: ['s'], way: 'down', went: (from, to) => to.x === from.x && to.y > from.y },
      { keys: ['ArrowRight'], way: 'right', went: (from, to) => to.y === from.y && to.x > from.x },
      { keys: ['d'], way: 'right', went: (from, to) => to.y === from.y && to.x > from.x },
      { keys: ['ArrowUp', 'ArrowLeft'], way: 'up, then left', went: (from, to) => to.y < from.y && to.x < from.x },
      { keys: ['ArrowUp', 'a'], way: 'up, then left', went: (from, to) => to.y < from.y && to.x < from.x },
    ];

    for (const { keys, way, went } of cases) {
      it(`${keys.join(' then ')} steers ${way}`, async () => {
        const element = await game(foodAt(0), 40);
        const start = head(element);
        for (const key of keys) await press(element, key);
        await waitUntil(() => went(start, head(element)), `the head should go ${way}`);
      });
    }
  });

  it('scores when the snake eats', async () => {
    const start = cells(await game(foodAt(0))).findIndex((cell) => cell.dataset.part === 'head');
    // Food directly in front of the head, facing right.
    const element = await game(foodAt(start + 1, 0));
    await press(element, 'ArrowRight');
    await waitUntil(() => text(element, '.score') !== '0', 'the score should go up');
    expect(Number(text(element, '.score'))).to.be.greaterThan(0);
  });

  it('pauses and resumes on the space bar', async () => {
    const element = await game(foodAt(0), 1000);
    await press(element, 'ArrowUp');
    await press(element, ' ');
    expect(status(element)).to.equal('paused');
    await press(element, ' ');
    expect(status(element)).to.equal('playing');
  });

  it('pauses when the playfield loses focus, so a minimised game does not die unseen', async () => {
    const element = await game(foodAt(0), 1000);
    await press(element, 'ArrowUp');
    field(element).dispatchEvent(new FocusEvent('focusout'));
    await element.updateComplete;
    expect(status(element)).to.equal('paused');
  });

  it('ends the game at the wall and says so', async () => {
    const element = await game(foodAt(0));
    await press(element, 'ArrowRight');
    await waitUntil(() => status(element) === 'over', 'the snake should reach the wall', { timeout: 3000 });
    expect(text(element, '.message')).to.not.equal('');
  });

  it('deals a fresh game from the New game button', async () => {
    const element = await game(foodAt(0), 1000);
    await press(element, 'ArrowUp');
    element.shadowRoot!.querySelector<HTMLButtonElement>('.new-game')!.click();
    await element.updateComplete;
    expect(status(element)).to.equal('ready');
    expect(text(element, '.score')).to.equal('0');
  });

  it('stops ticking when removed, so a closed window leaves nothing running', async () => {
    const element = await game(foodAt(0));
    await press(element, 'ArrowUp');
    element.remove();
    const snapshot = cells(element).map((cell) => cell.dataset.part ?? '').join();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cells(element).map((cell) => cell.dataset.part ?? '').join()).to.equal(snapshot);
  });

  it('fits exactly the content box the manifest declares', async () => {
    const element = await game(foodAt(0));
    const board = element.shadowRoot!.querySelector<HTMLElement>('.board')!.getBoundingClientRect();
    expect(board.width + SNAKE_PADDING_PX * 2, 'width').to.equal(SNAKE_CONTENT_SIZE.w);
    expect(board.height + SNAKE_PADDING_PX * 2, 'height').to.equal(SNAKE_CONTENT_SIZE.h);
    expect(cells(element)[0].getBoundingClientRect().width).to.equal(SNAKE_CELL_SIZE_PX);
  });
});

/**
 * The best score is kept in this browser, and more than one window can be writing it: two Snake
 * windows, or Snake in another tab. Each window used to compare against the best it read when it
 * opened, so one that opened earlier could overwrite a higher best with a lower one. It now reads
 * the stored best right before writing, and writes only a score that beats it.
 */
describe('the best score', () => {
  beforeEach(() => window.localStorage.removeItem(BEST_SCORE_KEY));
  afterEach(() => window.localStorage.removeItem(BEST_SCORE_KEY));

  /** The cell in front of a new game's head, where food makes the first move a meal. */
  async function ahead(): Promise<number> {
    const probe = await game(foodAt(0), 1000);
    const head = cells(probe).findIndex((cell) => cell.dataset.part === 'head');
    probe.remove();
    return head + 1;
  }

  /** Start a game and wait until it has scored `points`. */
  async function scoreOf(element: SnakeElement, points: number): Promise<void> {
    await press(element, 'ArrowRight');
    await waitUntil(() => Number(text(element, '.score')) >= points, `the score should reach ${points}`);
  }

  const stored = () => window.localStorage.getItem(BEST_SCORE_KEY);

  it('records a score that beats the stored best', async () => {
    const first = await ahead();
    const element = await game(foodAt(first, 0));
    await scoreOf(element, 10);
    expect(stored()).to.equal('10');
    expect(text(element, '.best')).to.equal('10');
  });

  it('keeps a higher best saved by another window while this one was open', async () => {
    const first = await ahead();
    const element = await game(foodAt(first, 0));
    // Saved elsewhere after this window read the best, which was nothing then.
    window.localStorage.setItem(BEST_SCORE_KEY, '500');
    await scoreOf(element, 10);
    expect(stored(), 'the higher best is not overwritten').to.equal('500');
    expect(text(element, '.best'), 'and this window shows it').to.equal('500');
  });

  it('never lets an earlier window write a lower best over a later one, with two open', async () => {
    const first = await ahead();
    const earlier = await game(foodAt(first, 0));
    const later = await game(foodAt(first, first + 1, 0));
    await scoreOf(later, 20);
    expect(stored()).to.equal('20');
    await scoreOf(earlier, 10);
    expect(stored(), 'the earlier window scored less and must not win').to.equal('20');
  });
});
