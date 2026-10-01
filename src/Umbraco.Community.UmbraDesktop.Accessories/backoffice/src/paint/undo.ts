import { PAINT_UNDO_BUDGET_BYTES, PAINT_UNDO_DEPTH } from './constants.js';

/** One undo step: a whole copy of the picture, and when it was taken, across every window. */
interface UndoStep {
  /** The picture as it was before a stroke. */
  image: ImageData;
  /** Its place in the order every window's steps were taken in, so the oldest anywhere can be found. */
  sequence: number;
}

/**
 * The memory Undo may use, shared by every Paint window in the page.
 *
 * Paint can be open in several windows, and every undo step is a whole copy of a picture, four bytes
 * a pixel. A budget per window would let five windows on large photographs hold five budgets; one
 * pool holds the page to one. When a stroke takes the pool over budget, the oldest step of any
 * window goes first, since the stroke furthest back is the one least likely to be undone, and the
 * step just taken never goes, so the window being drawn in can always take its last stroke back.
 */
export class UndoPool {
  /** Every window's history that holds, or has held since it was last released, a step. */
  #histories = new Set<UndoHistory>();

  /** The next step's sequence number. */
  #sequence = 0;

  /** @param budget The bytes every window's steps may use together. */
  constructor(readonly budget: number = PAINT_UNDO_BUDGET_BYTES) {}

  /** The bytes every window's steps use now. */
  get used(): number {
    let used = 0;
    for (const history of this.#histories) used += history.bytes;
    return used;
  }

  /**
   * A new window's history, drawing on this pool.
   * @param onChange Told the history's new depth when another window's stroke took steps from it,
   *   so its Undo button can follow. A window's own pushes and pops it already knows about.
   * @returns The history.
   */
  history(onChange?: (depth: number) => void): UndoHistory {
    return new UndoHistory(this, onChange);
  }

  /**
   * Take a history into the pool, when it gains a step. For {@link UndoHistory} alone.
   * @param history The history.
   * @returns The sequence number of the step it is taking.
   */
  enter(history: UndoHistory): number {
    this.#histories.add(history);
    return this.#sequence++;
  }

  /**
   * Let go of a history, when its window closes. For {@link UndoHistory} alone.
   * @param history The history.
   */
  leave(history: UndoHistory): void {
    this.#histories.delete(history);
  }

  /**
   * Drop the oldest steps anywhere until the pool is within budget, sparing the step just taken.
   * For {@link UndoHistory} alone, after a push.
   * @param newest The history that just took a step.
   */
  trim(newest: UndoHistory): void {
    let used = this.used;
    while (used > this.budget) {
      let oldest: UndoHistory | undefined;
      for (const history of this.#histories) {
        // The window just drawn in keeps its newest step, whatever it costs.
        if (history === newest && history.length <= 1) continue;
        const sequence = history.oldestSequence;
        if (sequence !== undefined && (!oldest || sequence < oldest.oldestSequence!)) oldest = history;
      }
      if (!oldest) return;
      used -= oldest.dropOldest();
      if (oldest !== newest) oldest.onChange?.(oldest.length);
    }
  }
}

/**
 * One Paint window's undo steps, newest last, capped at {@link PAINT_UNDO_DEPTH} and drawing on a
 * shared {@link UndoPool} for memory.
 */
export class UndoHistory {
  /** The steps, oldest first. */
  #steps: UndoStep[] = [];

  /**
   * @param pool The pool this history draws on.
   * @param onChange See {@link UndoPool.history}.
   */
  constructor(
    private readonly pool: UndoPool,
    readonly onChange?: (depth: number) => void,
  ) {}

  /** How many strokes can be taken back. */
  get length(): number {
    return this.#steps.length;
  }

  /** The bytes this history's steps use. */
  get bytes(): number {
    let bytes = 0;
    for (const step of this.#steps) bytes += step.image.data.byteLength;
    return bytes;
  }

  /** The oldest step's sequence number, or undefined when there are none. For the pool. */
  get oldestSequence(): number | undefined {
    return this.#steps[0]?.sequence;
  }

  /**
   * Keep a copy of the picture from before a stroke. Takes the history back into the pool if it had
   * been released, so a window that is moved in the page, and so disconnected and connected again,
   * goes on working.
   * @param image The copy. Kept as it is, so the caller hands over a copy of its own.
   */
  push(image: ImageData): void {
    this.#steps.push({ image, sequence: this.pool.enter(this) });
    if (this.#steps.length > PAINT_UNDO_DEPTH) this.#steps.shift();
    this.pool.trim(this);
  }

  /**
   * Take the newest step back.
   * @returns The picture from before the last stroke, or undefined when there is none.
   */
  pop(): ImageData | undefined {
    return this.#steps.pop()?.image;
  }

  /** Forget every step, as a new or newly opened picture does. */
  clear(): void {
    this.#steps = [];
  }

  /** Forget every step and leave the pool, when the window closes, so the others can use its share. */
  release(): void {
    this.clear();
    this.pool.leave(this);
  }

  /**
   * Drop the oldest step. For the pool, when it is over budget.
   * @returns The bytes given back.
   */
  dropOldest(): number {
    return this.#steps.shift()?.image.data.byteLength ?? 0;
  }
}

/** The pool every Paint window in the page draws on. */
export const paintUndoPool = new UndoPool();
