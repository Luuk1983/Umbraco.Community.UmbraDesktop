/**
 * Type-ahead: letters typed in quick succession move the focus to the next name starting with them,
 * as in every OS file manager (design §3, plan phase 3).
 */

/** How long after the last letter the typed letters are forgotten. */
export const TYPEAHEAD_RESET_MS = 1000;

/** What has been typed so far, and when the last letter came. */
export interface UmbraDesktopTypeAheadState {
  /** The letters typed so far, lower case. */
  buffer: string;
  /** When the last one came, in ms. */
  at: number;
}

/**
 * Add a letter and find the item it leads to.
 *
 * The search starts at the item with the focus, so typing more letters narrows from where you are.
 * The same letter typed again moves on to the next name starting with it, so `b`, `b`, `b` walks
 * through the B's.
 * @param state What was typed before.
 * @param char The letter typed.
 * @param now When, in ms.
 * @param names The items' names, in the collection's order.
 * @param current The item with the focus.
 * @returns The new state, and the item to focus, if any.
 */
export function typeAhead(
  state: UmbraDesktopTypeAheadState,
  char: string,
  now: number,
  names: ReadonlyArray<{ unique: string; name: string }>,
  current: string | undefined,
): { state: UmbraDesktopTypeAheadState; match: string | undefined } {
  const letter = char.toLowerCase();
  const buffer = now - state.at > TYPEAHEAD_RESET_MS ? letter : state.buffer + letter;
  const next = { buffer, at: now };
  const start = Math.max(0, names.findIndex((item) => item.unique === current));
  const repeating = buffer.length > 1 && [...buffer].every((each) => each === letter);
  const prefix = repeating ? letter : buffer;
  // Repeating a letter starts after the current item; anything else includes it.
  const offset = repeating ? 1 : 0;
  for (let step = 0; step < names.length; step++) {
    const item = names[(start + offset + step) % names.length];
    if (item.name.toLowerCase().startsWith(prefix)) return { state: next, match: item.unique };
  }
  return { state: next, match: undefined };
}
