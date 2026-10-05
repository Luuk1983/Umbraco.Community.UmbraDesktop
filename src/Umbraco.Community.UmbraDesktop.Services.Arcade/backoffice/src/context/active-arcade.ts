/**
 * The Arcade context on this page, for the one Arcade element that renders outside the desktop: the
 * beaten toast, which core puts in its toast container in the shell, where no desktop context can be
 * consumed. Same JavaScript realm, so a module-level reference is enough. The context sets it when it
 * is created and clears it when destroyed.
 */

/** What the toast needs of the Arcade. */
export interface ArcadeForToast {
  /** Show a board in the hub. @param game The game. @param board The board. @returns Whether the hub opened. */
  showBoard(game: string, board?: string): boolean;
}

/** The live Arcade context, or undefined while the desktop is closed. */
let active: ArcadeForToast | undefined;

/** True only while the Arcade itself is raising a toast. */
let raising = false;

/** Register the Arcade context. @param arcade The context. */
export function setActiveArcade(arcade: ArcadeForToast): void {
  active = arcade;
}

/** Unregister it, if it is still the one registered. @param arcade The context. */
export function clearActiveArcade(arcade: ArcadeForToast): void {
  if (active === arcade) active = undefined;
}

/** @returns The live Arcade context, if any. */
export function activeArcade(): ArcadeForToast | undefined {
  return active;
}

/**
 * Run something with the "the Arcade is raising this" flag set. Core builds a toast's element
 * synchronously inside `peek`, so an element constructed while this runs is the Arcade's own; one
 * constructed at any other time is the desktop raising it again because the player selected it.
 * @param run The work, which must be synchronous.
 * @returns What it returns.
 */
export function whileRaising<T>(run: () => T): T {
  raising = true;
  try {
    return run();
  } finally {
    raising = false;
  }
}

/** @returns Whether the Arcade is raising a toast right now. */
export function isRaising(): boolean {
  return raising;
}
