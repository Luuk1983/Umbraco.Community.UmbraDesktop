import { sameEditableContent } from './value-compare.js';

/**
 * What a server event means for one window, decided from three snapshots rather than from anything
 * the event says about itself.
 *
 * The event payload is `{ eventSource, eventType, key, clientTimestamp }` and carries no user or
 * client identity, so a window's own save is indistinguishable from a colleague's by inspection.
 * Recognising the ways a window can write does not work either: `saveAndPublish`, `schedule` and
 * `unpublish` bypass `requestSubmit()` entirely and dispatch no `UmbEntityUpdatedEvent`, so a
 * window watching its own submit path would alarm itself on every publish. See design §5.2.
 *
 * So the question is asked of the data instead. It answers for every write path there is, including
 * the same person saving from another browser tab, because it never tries to enumerate them.
 */

/** What one server event turned out to mean for one window. */
export type UmbraDesktopConflictVerdict =
  /** This window wrote it, whichever path it used. Do nothing. */
  | 'own-write'
  /** Nothing changed relative to what this window last saved. A duplicate or stale event. */
  | 'no-change'
  /** This window holds nothing of its own, so take the server's version in place. */
  | 'refresh'
  /** The server holds something neither side has. The editor has to decide. */
  | 'conflict';

/** The three versions a verdict is decided from. */
export interface UmbraDesktopConflictInput {
  /** What this window last saved: `persistedData`. */
  base: unknown;
  /** What the editor is holding: `data`. */
  mine: unknown;
  /** What the server holds now, from `loadWithoutPersist()`. */
  theirs: unknown;
}

/**
 * Decide what a server event means for one window.
 *
 * The order of the checks is load-bearing. `own-write` is asked first because when a save is
 * landing all three of these are true at once and only that answer is safe: the server matches what
 * the editor is holding, and a moment later `persistedData` will match it too. Asking `refresh`
 * first would reload a window over the top of a save that is still settling.
 * @param input The three versions; see {@link UmbraDesktopConflictInput}.
 * @returns The verdict.
 */
export function classifyConflict({ base, mine, theirs }: UmbraDesktopConflictInput): UmbraDesktopConflictVerdict {
  // A side that has not arrived makes every comparison unknowable, and "do nothing" is the only
  // safe answer to a question we cannot ask. A workspace mid-load reaches here with `undefined`.
  //
  // `null` is folded in rather than left to fall through. It would not be harmful today, because
  // `sameEditableContent` answers false for a null side and the worst outcome is a needless reload
  // of a window that has nothing unsaved, but establishing that takes a paragraph of reasoning
  // about a function in another file. Saying it here costs one operator.
  if (base == null || mine == null || theirs == null) return 'no-change';
  if (sameEditableContent(theirs, mine)) return 'own-write';
  if (sameEditableContent(theirs, base)) return 'no-change';
  if (sameEditableContent(mine, base)) return 'refresh';
  return 'conflict';
}
