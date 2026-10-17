/**
 * The undo history: whole states in a list with a cursor, and a mark on the one that was saved.
 *
 * **Saving does not end it** (design §4.2): as in every desktop editor, undo steps back past a save,
 * and the document is dirty whenever the cursor is anywhere but the saved state. The saved state is
 * kept by its place in the list, so a new change made after undoing past the save is a new branch,
 * and stays dirty even at the same depth: the item on the server is the state that was dropped.
 *
 * Whole states, not commands, because an editor state is small (`state.ts` keeps the picture out of
 * it), and a state is then the one thing undo, redo, the focal-point rule and the renderer all read.
 * @typeParam T The state.
 */
export class History<T> {
  /** Every state, oldest first. */
  #states: T[];

  /** Where the cursor is. */
  #index = 0;

  /** Which state was saved, or -1 once that state has been dropped by a new branch. */
  #savedIndex = 0;

  /** The state the item holds now, kept even after its place in the list is dropped. */
  #saved: T;

  /** @param initial The state as opened. */
  constructor(initial: T) {
    this.#states = [initial];
    this.#saved = initial;
  }

  /** The state now. */
  get current(): T {
    return this.#states[this.#index];
  }

  /** The state last saved, or the state opened before any save: what the item holds now. */
  get saved(): T {
    return this.#saved;
  }

  /** Whether there is a step to undo. */
  get canUndo(): boolean {
    return this.#index > 0;
  }

  /** Whether there is a step to redo. */
  get canRedo(): boolean {
    return this.#index < this.#states.length - 1;
  }

  /** Whether the state now is not the one saved. */
  get dirty(): boolean {
    return this.#index !== this.#savedIndex;
  }

  /**
   * Make a change: the new state is one step after the cursor, and any redo branch is dropped.
   * @param next The new state.
   */
  push(next: T): void {
    this.#states = [...this.#states.slice(0, this.#index + 1), next];
    if (this.#savedIndex > this.#index) this.#savedIndex = -1;
    this.#index = this.#states.length - 1;
  }

  /**
   * Show a state in place of the current one, without a step: a drag's preview.
   * @param state The state to show.
   */
  replaceCurrent(state: T): void {
    this.#states = [...this.#states.slice(0, this.#index), state, ...this.#states.slice(this.#index + 1)];
  }

  /** Step back. */
  undo(): void {
    if (this.canUndo) this.#index -= 1;
  }

  /** Step forward. */
  redo(): void {
    if (this.canRedo) this.#index += 1;
  }

  /** The state now is what the item holds. */
  markSaved(): void {
    this.#savedIndex = this.#index;
    this.#saved = this.current;
  }

  /**
   * Start over on another file: one state, clean.
   * @param initial The new file's state as opened.
   */
  reset(initial: T): void {
    this.#states = [initial];
    this.#index = 0;
    this.#savedIndex = 0;
    this.#saved = initial;
  }
}

/**
 * One gesture as one step: a slider drag, a mark dragged across the picture. It previews as many
 * states as the pointer makes, each shown in place of the last, and adds exactly one step when it
 * ends, so undo goes back to before the drag rather than one pixel of it.
 * @typeParam T The state.
 */
export class Gesture<T> {
  /** The history the gesture ends in. */
  readonly #history: History<T>;

  /** The state before the gesture began. */
  readonly #before: T;

  /** The last state previewed, or undefined for none yet. */
  #latest?: T;

  /** @param history The history the gesture ends in. */
  constructor(history: History<T>) {
    this.#history = history;
    this.#before = history.current;
  }

  /**
   * Show a state while the gesture goes on.
   * @param next The state.
   */
  preview(next: T): void {
    this.#latest = next;
    this.#history.replaceCurrent(next);
  }

  /** End the gesture: one step to its last state, or none if it previewed nothing. */
  commit(): void {
    if (this.#latest === undefined) return;
    this.#history.replaceCurrent(this.#before);
    this.#history.push(this.#latest);
    this.#latest = undefined;
  }

  /** Throw the gesture away: the state before it is back, and there is no step. */
  cancel(): void {
    this.#history.replaceCurrent(this.#before);
    this.#latest = undefined;
  }
}
