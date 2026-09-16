/**
 * Whatever a localizer needs to look like here. Umbraco's `this.localize.term` matches it; a test
 * can pass a plain function instead.
 */
export type UmbraDesktopTerm = (key: string, ...args: unknown[]) => string;

/**
 * The sentence naming how much unsaved work an action is about to take with it, and a second one
 * when some of that work would also discard somebody else's.
 *
 * Lifted out of `exit-message.ts` when a second dialog needed the same sentence: changing the
 * backoffice language costs a reload, and a reload throws away exactly what Exit does. The ladder
 * is the part worth having once — three of its branches exist because a count reads as a counting
 * error in the wrong one.
 *
 * The second sentence is not a nicety. Everywhere else on this desktop closing is what loses work;
 * for a window that has also changed on the server, closing is the *safe* act and discarding is
 * what keeps the other person's version. Somebody deciding needs to know which of the two they are
 * in, and the count is the shortest way to say it. Design §9.
 *
 * Empty when nothing is unsaved, so a caller can join it into a longer body without checking.
 * @param unsavedCount How many open windows are holding unsaved changes.
 * @param conflictedCount How many of those have also been changed by somebody else.
 * @param term The localizer, e.g. `this.localize.term` bound to the calling element.
 * @returns The sentence, or an empty string.
 */
export function unsavedSentence(unsavedCount: number, conflictedCount: number, term: UmbraDesktopTerm): string {
  if (unsavedCount < 1) return '';
  const warning =
    unsavedCount === 1 ? term('umbraDesktop_exitUnsavedOne') : term('umbraDesktop_exitUnsaved', unsavedCount);
  if (conflictedCount < 1) return warning;
  // "One of them" needs more than one to be one of, so a single unsaved window gets its own wording
  // rather than a sentence that reads as a counting error.
  const conflict =
    unsavedCount === 1
      ? term('umbraDesktop_exitConflictedSole')
      : conflictedCount === 1
        ? term('umbraDesktop_exitConflictedOne')
        : term('umbraDesktop_exitConflictedMany', conflictedCount);
  return `${warning} ${conflict}`;
}
