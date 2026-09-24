import type { StickyNote } from './api.js';

/**
 * The window's copy of the shared board, and the rules for folding the server's copy into it.
 *
 * Pure functions over plain values, so the one rule that matters can be tested exhaustively: **a
 * refresh never overwrites text somebody is still writing.** The board refreshes every fifteen
 * seconds, and a note that reverted under the cursor mid-sentence would make the app unusable.
 */

/** A note as the window holds it: the server's note, plus what this window has done to it. */
export interface LocalNote extends StickyNote {
  /** Whether this window has text or a colour the server does not have yet. */
  pending: boolean;
  /**
   * Somebody else's newer version, when they saved this note while this window had unsaved changes
   * to it. The window's own text stays on screen; this is what "use theirs" would switch to.
   */
  conflict?: StickyNote;
  /** Somebody else deleted this note while this window had unsaved text in it. */
  deletedElsewhere?: boolean;
}

/**
 * The window's copy of a board fresh from the server.
 * @param notes The server's notes.
 * @returns Local notes with nothing pending.
 */
export function fromServer(notes: StickyNote[]): LocalNote[] {
  return notes.map((note) => ({ ...note, pending: false }));
}

/**
 * Fold a refresh into the window's copy.
 *
 * - A note nobody here is editing takes the server's version.
 * - A note being edited here keeps its text. If the server's version has moved on, somebody else
 *   saved it meanwhile, and their version is kept beside it as a conflict.
 * - A note the server no longer has is dropped, unless it has unsaved text here, in which case it
 *   stays, marked, so nobody's words vanish without a choice.
 * - A note the server has and the window does not is added.
 *
 * The server's order wins, with notes deleted elsewhere kept in place at the end.
 * @param local The window's copy.
 * @param server The server's board.
 * @returns The merged board.
 */
export function mergeBoard(local: LocalNote[], server: StickyNote[]): LocalNote[] {
  const byKey = new Map(local.map((note) => [note.key, note]));
  const merged: LocalNote[] = server.map((remote) => {
    const mine = byKey.get(remote.key);
    if (!mine || !mine.pending) return { ...remote, pending: false };
    if (remote.version > mine.version) return { ...mine, conflict: remote };
    return mine;
  });
  const onServer = new Set(server.map((remote) => remote.key));
  for (const mine of local) {
    if (!onServer.has(mine.key) && mine.pending) merged.push({ ...mine, deletedElsewhere: true });
  }
  return merged;
}

/**
 * Apply an edit made in this window.
 * @param local The window's copy.
 * @param key The note edited.
 * @param change The new text or colour.
 * @returns The board, with that note pending.
 */
export function editNote(local: LocalNote[], key: string, change: Partial<Pick<StickyNote, 'text' | 'colour'>>): LocalNote[] {
  return local.map((note) => (note.key === key ? { ...note, ...change, pending: true } : note));
}

/**
 * The server accepted a save.
 *
 * The note takes the server's version and author. It stays pending if its text changed while the
 * save was in flight, since what was typed after the save left has still not been saved; it then
 * waits on the version this save produced, so the next save is not refused as stale.
 * @param local The window's copy.
 * @param confirmed The note as the server saved it.
 * @param sentText The text the save carried.
 * @returns The board after the save.
 */
export function saved(local: LocalNote[], confirmed: StickyNote, sentText: string): LocalNote[] {
  return local.map((note) => {
    if (note.key !== confirmed.key) return note;
    const typedSince = note.text !== sentText;
    return {
      ...confirmed,
      text: typedSince ? note.text : confirmed.text,
      colour: typedSince ? note.colour : confirmed.colour,
      pending: typedSince,
    };
  });
}
