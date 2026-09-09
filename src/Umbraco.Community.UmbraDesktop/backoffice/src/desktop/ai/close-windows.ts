import type { DeskView, UmbraDesktopLocalise } from './desk-snapshot';
import type { UmbraDesktopWindow } from '../types';
import { matchByLabel } from './name-match';

/**
 * Decides which windows the agent's "tidy up my desk" tool should close. Pure: the api applies it.
 *
 * Closing was deliberately left out of the first version of these tools, and then the first thing
 * anyone asked for after seeing the others work was "close all windows except yourself". That is
 * better evidence than the guess it overturns.
 *
 * Two rules are absolute, and between them they are why this needs no confirmation dialog:
 *
 * A window holding **unsaved changes is never closed**, only reported. The desktop's own guard would
 * have asked first, but a modal appearing in answer to a chat message is a strange thing to arrive
 * out of nowhere, and one the agent cannot answer on the user's behalf either. Skipping is honest,
 * loses nothing, and leaves the decision where it belongs.
 *
 * The **chat's own window is never closed**, however it is named. Ending the conversation from
 * inside the call that asked for it is not something a user can have meant.
 */

/** What the close tool decided to do. */
export type CloseWindowsPlan = {
  /** `unavailable` off the desktop, `close` otherwise — including when the set is empty. */
  kind: 'unavailable' | 'close';
  /** The windows to close. Empty is an ordinary outcome, not a failure. */
  windowIds: string[];
  /** What to tell the model, covering what closed, what was skipped and what was not found. */
  message: string;
};

/**
 * Join a list of names for a sentence.
 * @param names The names.
 * @returns Them, comma-separated, with "and" before the last.
 */
function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Work out which windows to close.
 * @param desk The desktop hosting the chat, or undefined when the chat is not on one.
 * @param args Whatever the model passed. Unvalidated: it is model output.
 * @param localise Resolves a window's app name, which is usually a token.
 * @param selfWindowId The window the chat itself is in, when that could be worked out.
 * @returns What to do.
 */
export function planCloseWindows(
  desk: DeskView | undefined,
  args: Record<string, unknown>,
  localise: UmbraDesktopLocalise,
  selfWindowId: string | undefined,
): CloseWindowsPlan {
  if (!desk) {
    return {
      kind: 'unavailable',
      windowIds: [],
      message:
        'Not available here: this backoffice is not running inside UmbraDesktop, so there are no windows to close. Answer the user without offering to close anything.',
    };
  }

  const labelled = desk
    .getWindows()
    .filter((win) => win.id !== selfWindowId)
    .map((win) => ({ item: win, label: localise(win.app.name) }));

  const wanted = Array.isArray(args.apps)
    ? args.apps.filter((name): name is string => typeof name === 'string' && name.trim() !== '')
    : undefined;

  let targets: UmbraDesktopWindow[];
  const unmatched: string[] = [];
  if (wanted === undefined) {
    // No list means the whole desk, which is the commonest request by far.
    targets = labelled.map((entry) => entry.item);
  } else {
    const found = new Map<string, UmbraDesktopWindow>();
    for (const name of wanted) {
      const matches = matchByLabel(labelled, name);
      if (matches.length === 0) {
        unmatched.push(name);
        continue;
      }
      // Every match, not just a lone one. Unlike opening, "close the media windows" wanting both of
      // two is a sensible reading, and closing them is reversible in a way that opening the wrong
      // document is not.
      for (const match of matches) found.set(match.item.id, match.item);
    }
    targets = [...found.values()];
  }

  const closing = targets.filter((win) => !win.dirty);
  const skipped = targets.filter((win) => win.dirty);

  const sentences: string[] = [];
  if (closing.length > 0) {
    sentences.push(
      `Closed ${closing.length === 1 ? 'the window' : `${closing.length} windows`}: ${list(
        closing.map((win) => localise(win.app.name)),
      )}.`,
    );
  }
  if (skipped.length > 0) {
    sentences.push(
      `Left ${list(skipped.map((win) => localise(win.app.name)))} open, because ${
        skipped.length === 1 ? 'it has' : 'they have'
      } unsaved changes. Tell the user to save or discard there first; this tool will not close over unsaved work.`,
    );
  }
  if (unmatched.length > 0) {
    sentences.push(`No open window matched ${list(unmatched.map((name) => `"${name}"`))}.`);
  }
  if (sentences.length === 0) {
    // Nothing to say about windows means the desk was already clear, apart from this chat. Naming
    // the chat matters: without it "nothing to close" reads as the tool having failed.
    sentences.push(
      'There was nothing to close. This chat window is the only one open, and it is never closed.',
    );
  }

  return { kind: 'close', windowIds: closing.map((win) => win.id), message: sentences.join(' ') };
}
