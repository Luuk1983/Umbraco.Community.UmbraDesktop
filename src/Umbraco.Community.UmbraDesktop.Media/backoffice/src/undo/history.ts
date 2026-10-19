import type { UmbraDesktopMediaApi } from '../operations/media-api.js';
import { changedSince, undoOf } from './inverse.js';
import type { UmbraDesktopUndoAction, UmbraDesktopUndoStep } from './inverse.js';

/**
 * One undo history for the whole manager, across all its windows (design §10, plan task 8.2), as in
 * Explorer and the Finder: so Ctrl+Z in either window undoes a drag between them. Kept in the add-on's
 * desktop context. An undo is all of a step or none of it: every item is checked first, and if anyone
 * has changed one since, nothing is undone. The step leaves the history either way, as there is no
 * redo.
 */

/** How an undo went. */
export type UmbraDesktopUndoOutcome =
  /** There was nothing to undo. */
  | { kind: 'nothing' }
  /** The step was undone. */
  | { kind: 'undone'; step: UmbraDesktopUndoStep }
  /** Someone changed an item since; nothing was undone. */
  | { kind: 'changed'; step: UmbraDesktopUndoStep; name: string };

/** How many steps are kept; older ones fall off, as an OS file manager's do. */
const LIMIT = 50;

/** The undo history. */
export class UmbraDesktopUndoHistory {
  /** The steps, oldest first. */
  #steps: UmbraDesktopUndoStep[] = [];

  /** How many steps can be undone. */
  get size(): number {
    return this.#steps.length;
  }

  /**
   * Record a step.
   * @param step What an operation did, or undefined when it recorded nothing (nothing worked, or it is
   * not undone).
   */
  push(step: UmbraDesktopUndoStep | undefined): void {
    if (!step) return;
    this.#steps = [...this.#steps, step].slice(-LIMIT);
  }

  /**
   * Undo the last step.
   * @param api The server, to check nothing changed since.
   * @param run Runs one operation that undoes part of the step.
   * @returns How it went.
   */
  async undo(api: UmbraDesktopMediaApi, run: (action: UmbraDesktopUndoAction) => Promise<unknown>): Promise<UmbraDesktopUndoOutcome> {
    const step = this.#steps.pop();
    if (!step) return { kind: 'nothing' };
    const changed = await changedSince(step, api);
    if (changed !== undefined) return { kind: 'changed', step, name: changed };
    for (const action of undoOf(step)) await run(action);
    return { kind: 'undone', step };
  }
}
