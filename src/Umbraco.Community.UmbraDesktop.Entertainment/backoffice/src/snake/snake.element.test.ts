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

describe('the Arcade', () => {
  beforeEach(() => window.localStorage.removeItem(BEST_SCORE_KEY));
  afterEach(() => window.localStorage.removeItem(BEST_SCORE_KEY));

  it('submits the score once when the game ends', async () => {
    const probe = await game(foodAt(0), 1000);
    const ahead = cells(probe).findIndex((cell) => cell.dataset.part === 'head') + 1;
    probe.remove();
    const submitted: Array<[string, number]> = [];
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(ahead, 0)}
      .tickInterval=${() => 10}
      .scores=${{
        submit: async (b: string, v: number) => {
          submitted.push([b, v]);
          return undefined;
        },
        best: async () => undefined,
        standing: async () => undefined,
      }}
    ></umbradesktop-snake>`);
    await press(element, 'ArrowRight');
    await waitUntil(() => status(element) === 'over', 'the snake should reach the wall', { timeout: 3000 });
    await element.updateComplete;
    expect(submitted).to.deep.equal([['default', 10]]);
  });

  it('shows the Arcade best when it is higher than the browser one', async () => {
    window.localStorage.setItem(BEST_SCORE_KEY, '50');
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{
        submit: async () => undefined,
        best: async () => undefined,
        standing: async () => ({ best: 300, rank: 2, rankText: '2nd' }),
      }}
    ></umbradesktop-snake>`);
    await waitUntil(() => text(element, '.best') === '300', 'the Arcade best should be shown');
  });
});

/**
 * The Arcade's two pieces in Snake (design P5, the mock's section 5): the Best chip turns into the
 * Arcade best with its rank and opens the leaderboard panel, and game over shows the result card.
 *
 * In this package's tests the Arcade's tags are unknown elements, so these cases check that Snake
 * placed them with the right attribute and listens to them, not what they draw: the pieces' own
 * tests do that, and a real desktop checks the two together.
 */
describe('snake element: the Arcade pieces', () => {
  beforeEach(() => window.localStorage.removeItem(BEST_SCORE_KEY));
  afterEach(() => window.localStorage.removeItem(BEST_SCORE_KEY));

  /** The player's Arcade standing in most cases here: first, so the chip reads "480 · 1st". */
  const standing = { best: 480, rank: 1, rankText: '1st' };
  /** The gold Best chip, or null while the chip is the plain browser-best display. */
  const chip = (element: SnakeElement) => element.shadowRoot!.querySelector<HTMLElement>('[data-action="leaderboard"]');
  /** The leaderboard panel Snake places once the Arcade is there. */
  const panel = (element: SnakeElement) => element.shadowRoot!.querySelector('umbradesktop-arcade-leaderboard')!;

  /**
   * The cell in front of a new game's head, where food makes the first move a meal, so a game ends
   * at the wall with points to submit.
   * @returns The cell's index.
   */
  async function ahead(): Promise<number> {
    const probe = await game(foodAt(0), 1000);
    const cell = cells(probe).findIndex((each) => each.dataset.part === 'head') + 1;
    probe.remove();
    return cell;
  }

  /**
   * Wait for something Snake renders after the Arcade has answered, then hand it back.
   *
   * `waitUntil` from `@open-wc/testing` resolves with nothing, so the query runs again afterwards.
   * @param element The game.
   * @param selector What to find in its shadow root.
   * @param message What failed to appear, if it does not.
   * @returns The element found.
   */
  async function found(element: SnakeElement, selector: string, message: string): Promise<HTMLElement> {
    await waitUntil(() => element.shadowRoot!.querySelector(selector) !== null, message);
    return element.shadowRoot!.querySelector<HTMLElement>(selector)!;
  }

  it('shows the Arcade best with its rank on the Best chip, which opens the panel', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'the chip becomes a button');
    expect(chip(element)!.textContent).to.contain('480').and.contain('1st');
    // The crown and the gold say "best", so the word is not drawn; a screen reader still hears it.
    expect(chip(element)!.textContent, 'no visible word').not.to.contain('Best');
    expect(chip(element)!.getAttribute('aria-label')).to.equal('Best 480, 1st');
    expect(chip(element)!.tagName).to.equal('BUTTON');
    expect(panel(element).getAttribute('board')).to.equal('default');
    expect(panel(element).hasAttribute('open'), 'closed first').to.equal(false);
    chip(element)!.click();
    await element.updateComplete;
    expect(panel(element).hasAttribute('open')).to.equal(true);
  });

  it('pauses a running game while the panel is open, and carries on when it closes', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(0)} .tickInterval=${() => 1000}
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    await press(element, 'ArrowRight');
    expect(status(element)).to.equal('playing');
    chip(element)!.click();
    await element.updateComplete;
    expect(panel(element).hasAttribute('open'), 'open').to.equal(true);
    expect(status(element)).to.equal('paused');
    // The real panel takes focus to its close button when it opens; stand in for that, so the case
    // proves the playfield gets the keyboard back rather than that it never lost it.
    chip(element)!.focus();
    panel(element).removeAttribute('open');
    panel(element).dispatchEvent(new CustomEvent('close'));
    await element.updateComplete;
    expect(status(element)).to.equal('playing');
    expect(element.shadowRoot!.activeElement === field(element), 'the playfield has the keyboard back').to.equal(true);
    // Mirrored back from the panel, so the chip opens it again rather than setting what Lit thinks is already set.
    chip(element)!.click();
    await element.updateComplete;
    expect(panel(element).hasAttribute('open'), 'opens again').to.equal(true);
  });

  it('keeps focus on the playfield when the chip is pressed, so the press does not pause it first', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    const pressed = new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true });
    chip(element)!.dispatchEvent(pressed);
    expect(pressed.defaultPrevented, 'the mousedown that would move focus is cancelled').to.equal(true);
  });

  it('leaves a game paused by the player paused when the panel closes', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(0)} .tickInterval=${() => 1000}
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    await press(element, 'ArrowRight');
    await press(element, ' ');
    chip(element)!.click();
    await element.updateComplete;
    panel(element).dispatchEvent(new CustomEvent('close'));
    await element.updateComplete;
    expect(status(element)).to.equal('paused');
  });

  it('shows the result card at game over, and a new best updates the chip', async () => {
    const probe = await game(foodAt(0), 1000);
    const ahead = cells(probe).findIndex((cell) => cell.dataset.part === 'head') + 1;
    probe.remove();
    const options: unknown[] = [];
    const accepted = { status: 'accepted' as const, isPersonalBest: true, rank: 1, rankText: '1st', value: 520 };
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(ahead, 0)} .tickInterval=${() => 10}
      .scores=${{
        submit: async (_board: string, _value: number, o: unknown) => {
          options.push(o);
          return accepted;
        },
        best: async () => undefined,
        standing: async () => standing,
      }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    await press(element, 'ArrowRight');
    await waitUntil(() => status(element) === 'over', 'the snake should reach the wall', { timeout: 3000 });
    const card = await found(element, 'umbradesktop-arcade-result', 'card');
    expect(card.parentElement!.classList.contains('board'), 'over the whole game, header included, not the well').to.equal(true);
    // The card fills its nearest positioned ancestor, so that is the box it covers. The Arcade's
    // element is not loaded here, so this asks the layout rather than measuring the card.
    expect((card as HTMLElement).offsetParent === element.shadowRoot!.querySelector('.board'), 'the card\'s box is the whole game, not the well').to.equal(true);
    expect(card.getAttribute('outcome')).to.equal('over');
    expect((card as unknown as { result: unknown }).result === accepted, 'it was handed the result').to.equal(true);
    expect(options).to.deep.equal([{ showsResult: true }]);
    expect(text(element, '.message'), 'the card says it, so the banner does not').to.equal('');
    await waitUntil(() => text(element, '.best') === '520', 'chip shows the new best');
  });

  it('shows the Arcade best only, even when this browser holds a higher one, since the rank is the Arcade best\'s', async () => {
    window.localStorage.setItem(BEST_SCORE_KEY, '900');
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{ submit: async () => undefined, standing: async () => ({ best: 300, rank: 2, rankText: '2nd' }) }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    expect(text(element, '.best')).to.equal('300');
    expect(chip(element)!.getAttribute('aria-label')).to.equal('Best 300, 2nd');
  });

  it('puts the best before this game on the chip when a game that was not a best ends with the standing unknown', async () => {
    const notBest = { status: 'accepted' as const, isPersonalBest: false, previousBest: 700, rank: 4, rankText: '4th', value: 10 };
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(await ahead(), 0)} .tickInterval=${() => 10}
      .scores=${{ submit: async () => notBest, standing: async () => undefined }}></umbradesktop-snake>`);
    await press(element, 'ArrowRight');
    await waitUntil(() => status(element) === 'over', 'the snake should reach the wall', { timeout: 3000 });
    await found(element, '[data-action="leaderboard"]', 'chip once the Arcade answered');
    expect(text(element, '.best')).to.equal('700');
    expect(chip(element)!.getAttribute('aria-label')).to.equal('Best 700, 4th');
  });

  it('drops a slow answer for a game that has already been dealt over', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const late = { status: 'accepted' as const, isPersonalBest: true, previousBest: 480, rank: 1, rankText: '1st', value: 990 };
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(await ahead(), 0)} .tickInterval=${() => 10}
      .scores=${{ submit: () => new Promise((resolve) => (answer = resolve)), standing: async () => standing }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    await press(element, 'ArrowRight');
    await waitUntil(() => status(element) === 'over', 'the snake should reach the wall', { timeout: 3000 });
    element.shadowRoot!.querySelector<HTMLButtonElement>('.new-game')!.click();
    await element.updateComplete;
    answer(late);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('umbradesktop-arcade-result') === null, 'no card on the new game').to.equal(true);
    expect(text(element, '.best'), 'the chip is not moved by the old game').to.equal('480');
  });

  it('ignores game keys on the playfield while the panel is open', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(0)} .tickInterval=${() => 1000}
      .scores=${{ submit: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    await press(element, 'ArrowUp');
    chip(element)!.click();
    await element.updateComplete;
    expect(status(element)).to.equal('paused');
    // A click on the scrim's edge, or a script, can still put focus on the field under the panel.
    field(element).focus();
    await press(element, 'ArrowRight');
    expect(status(element), 'an arrow does not start it behind the panel').to.equal('paused');
    await press(element, ' ');
    expect(status(element), 'nor does space').to.equal('paused');
  });

  it('carries on after the panel closes when it was opened from the keyboard, though Tab to the chip paused the game', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(0)} .tickInterval=${() => 1000}
      .scores=${{ submit: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    await press(element, 'ArrowUp');
    expect(status(element)).to.equal('playing');
    // Tab moves focus to the chip, and the playfield's focusout pauses the game before Enter is pressed.
    // Dispatched rather than caused by focus(): a test tab in the background gets no focus events.
    field(element).dispatchEvent(new FocusEvent('focusout', { relatedTarget: chip(element) }));
    await element.updateComplete;
    expect(status(element), 'paused by the focus moving').to.equal('paused');
    // Enter on a button is a click.
    chip(element)!.click();
    await element.updateComplete;
    expect(panel(element).hasAttribute('open'), 'open').to.equal(true);
    panel(element).removeAttribute('open');
    panel(element).dispatchEvent(new CustomEvent('close'));
    await element.updateComplete;
    expect(status(element), 'carries on, as it does from the mouse').to.equal('playing');
  });

  it('keeps the browser best on a plain chip without the Arcade', async () => {
    window.localStorage.setItem(BEST_SCORE_KEY, '70');
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => undefined }}></umbradesktop-snake>`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chip(element) === null, 'no button').to.equal(true);
    expect(element.shadowRoot!.querySelector('umbradesktop-arcade-leaderboard') === null, 'no panel').to.equal(true);
    expect(text(element, '.best')).to.equal('70');
    expect(text(element, '.status .display:last-child .label'), 'the plain display keeps its word').to.equal('Best');
  });

  /**
   * The header never widens the board, whatever the font and however long the chip's text.
   *
   * The board's width is the well's, and the manifest declares exactly that, so a header wider than
   * the well would make the window clip the board. The gold chip at its widest realistic content, a
   * five-digit best and a two-digit rank in English and Dutch, measured 14px too wide in the test
   * browser's own font and 56px too wide in Verdana (the Umbraco 4 theme's font). So the chip gives
   * way instead: its text ellipsizes, the crown stays whole, and the board stays the declared width.
   */
  for (const font of ['Verdana', 'Segoe UI', 'Times New Roman']) {
    for (const rankText of ['12th', '12e']) {
      it(`keeps the board the declared width with a long chip in ${font} 15px (${rankText})`, async () => {
        const wide = { best: 12480, rank: 12, rankText };
        const element = await fixture<SnakeElement>(html`<umbradesktop-snake
          style="--umbradesktop-app-font: '${font}'; font-size: 15px"
          .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => wide }}></umbradesktop-snake>`);
        await found(element, '[data-action="leaderboard"]', 'chip');
        const board = element.shadowRoot!.querySelector<HTMLElement>('.board')!.getBoundingClientRect();
        expect(board.width, 'the board is the declared content width').to.equal(SNAKE_CONTENT_SIZE.w - 2 * SNAKE_PADDING_PX);
        for (const part of element.shadowRoot!.querySelector('.status')!.children) {
          expect(part.getBoundingClientRect().right <= board.right + 0.5, `${part.className} stays inside the board`).to.equal(true);
        }
        const crown = chip(element)!.querySelector('.crown')!.getBoundingClientRect();
        expect(crown.width, 'the crown never shrinks').to.equal(14);
        const words = chip(element)!.querySelector<HTMLElement>('.text')!;
        const fits = words.scrollWidth <= words.clientWidth;
        expect(fits || getComputedStyle(words).textOverflow === 'ellipsis', 'the text fits or is ellipsized').to.equal(true);
      });
    }
  }

  /**
   * The ellipsis is a safety net for the unlikely five-digit best, not the everyday look. Under
   * Umbraco 4 (Verdana 14px in the real desktop) an ordinary "480 · 1st" needed 66.5px and got 58.1,
   * so the chip read "480 · …": the rank, the chip's point, was gone. That is removing, not restyling.
   */
  it('shows an ordinary best and rank whole under Umbraco 4\'s Verdana', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      data-umbradesktop-theme="umbraco4"
      style="--umbradesktop-app-font: Verdana, Geneva, Tahoma, 'DejaVu Sans', sans-serif; font-size: 14px"
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => ({ best: 480, rank: 1, rankText: '1st' }) }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    const words = chip(element)!.querySelector<HTMLElement>('.text')!;
    expect(words.textContent!.replace(/\s+/g, ' ').trim()).to.equal('480 · 1st');
    expect(words.scrollWidth <= words.clientWidth, `not ellipsized (${words.scrollWidth} in ${words.clientWidth})`).to.equal(true);
    const board = element.shadowRoot!.querySelector<HTMLElement>('.board')!.getBoundingClientRect();
    expect(chip(element)!.getBoundingClientRect().right <= board.right + 0.5, 'still inside the board').to.equal(true);
  });

  it('still bevels the chip under Windows 98, as it does the other displays', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await found(element, '[data-action="leaderboard"]', 'chip');
    element.setAttribute('data-umbradesktop-theme', 'win98');
    await element.updateComplete;
    expect(getComputedStyle(chip(element)!).boxShadow).to.contain('inset');
  });
});
