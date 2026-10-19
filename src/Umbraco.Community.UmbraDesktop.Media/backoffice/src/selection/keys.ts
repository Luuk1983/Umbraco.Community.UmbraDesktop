import { hasPrimaryModifier } from '../platform-keys.js';
import type { UmbraDesktopMoveDirection } from './neighbour.js';

/**
 * What a key means in a manager window (design §3): the keys every OS file manager has, on top of
 * core's collection. Pure, so the platform is a parameter.
 */

/** What a key asks for. */
export type UmbraDesktopKeyIntent =
  /** Enter: open the item with the focus. */
  | { kind: 'open' }
  /** Space: select or deselect it. */
  | { kind: 'toggle' }
  /** F2: rename it. */
  | { kind: 'rename' }
  /** Delete, or Cmd+Backspace on a Mac: trash the selection. */
  | { kind: 'trash' }
  /** The arrows, Home and End: move the focus, extending the selection with Shift. */
  | { kind: 'move'; direction: UmbraDesktopMoveDirection; extend: boolean }
  /** Ctrl+A, or Cmd+A on a Mac: select everything shown. */
  | { kind: 'select-all' }
  /** Esc: clear the selection, or, with nothing selected, empty a cut. */
  | { kind: 'clear' }
  /** Ctrl+X, or Cmd+X on a Mac: cut the selection. */
  | { kind: 'cut' }
  /** Ctrl+C, or Cmd+C on a Mac: copy the selection. */
  | { kind: 'copy' }
  /** Ctrl+V, or Cmd+V on a Mac: paste into the window's folder. */
  | { kind: 'paste' }
  /** Ctrl+Z, or Cmd+Z on a Mac: undo the last move, copy, rename or trash, in any window (design §10). */
  | { kind: 'undo' }
  /** A printable letter: type ahead. */
  | { kind: 'type'; char: string };

/** The arrow keys and Home and End, and where they move. */
const MOVES: Readonly<Record<string, UmbraDesktopMoveDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'first',
  End: 'last',
};

/** The clipboard keys, with the platform's modifier (design §5). */
const CLIPBOARD_KEYS: Readonly<Record<string, 'cut' | 'copy' | 'paste'>> = { x: 'cut', c: 'copy', v: 'paste' };

/** Elements a key typed into belongs to, not to the window: fields, and core's own inputs. */
const FIELDS = /^(TEXTAREA|SELECT|UUI-INPUT|UUI-TEXTAREA|UUI-COMBOBOX|UUI-SELECT)$/;

/**
 * The inputs people type into. A checkbox, radio or button is an `<input>` too, and core's cards draw
 * their selection checkbox as one, so a key pressed after ticking a card would otherwise be the
 * checkbox's, and Ctrl+C did nothing (owner's test, 2026-10-18).
 */
const TYPED_INPUTS = /^(text|search|email|url|tel|password|number|date|datetime-local|month|time|week)$/;

/**
 * Whether a key was typed, or a paste made, into a field.
 * @param path The event's composed path.
 * @returns True when something on it takes text.
 */
export function inField(path: ReadonlyArray<EventTarget>): boolean {
  return path.some(
    (node) =>
      node instanceof HTMLElement &&
      (FIELDS.test(node.tagName) || node.isContentEditable || (node instanceof HTMLInputElement && TYPED_INPUTS.test(node.type))),
  );
}

/**
 * What a key means.
 * @param event The key event.
 * @param mac Whether this is a Mac.
 * @param path The event's composed path; read from the event when not given.
 * @returns The intent, or undefined for a key the window leaves alone.
 */
export function keyIntent(
  event: KeyboardEvent,
  mac: boolean,
  path: ReadonlyArray<EventTarget> = event.composedPath(),
): UmbraDesktopKeyIntent | undefined {
  if (inField(path)) return undefined;
  const primary = hasPrimaryModifier(event, mac);
  const anyModifier = event.ctrlKey || event.metaKey || event.altKey;
  if (event.key === 'Backspace') return mac && event.metaKey ? { kind: 'trash' } : undefined;
  if (primary && !event.altKey && !event.shiftKey) {
    const clipboard = CLIPBOARD_KEYS[event.key.toLowerCase()];
    if (clipboard) return { kind: clipboard };
    if (event.key.toLowerCase() === 'a') return { kind: 'select-all' };
    if (event.key.toLowerCase() === 'z') return { kind: 'undo' };
  }
  if (anyModifier) return undefined;
  if (event.key in MOVES) return { kind: 'move', direction: MOVES[event.key], extend: event.shiftKey };
  switch (event.key) {
    case 'Enter':
      return { kind: 'open' };
    case ' ':
      return { kind: 'toggle' };
    case 'F2':
      return { kind: 'rename' };
    case 'Delete':
      return { kind: 'trash' };
    case 'Escape':
      return { kind: 'clear' };
  }
  if (event.key.length === 1 && event.key.trim()) return { kind: 'type', char: event.key };
  return undefined;
}
