import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './snake.element.js';
import { SNAKE_BOARD, SNAKE_CELL_SIZE_PX, SNAKE_CONTENT_SIZE, SNAKE_PADDING_PX } from './constants.js';
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

  it('does not cover the snake with the start message', async () => {
    // The snake starts in the middle row, and a banner centred on the board hid it completely, so
    // the player could not see which way it was facing before pressing a key.
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

  it('steers with WASD as well as the arrows', async () => {
    const element = await game(foodAt(0));
    await press(element, 'w');
    expect(status(element)).to.equal('playing');
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
