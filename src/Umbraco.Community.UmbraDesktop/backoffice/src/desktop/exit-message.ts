/**
 * Whatever a localizer needs to look like for {@link exitDialogContent}. Umbraco's
 * `this.localize.term` matches it; a test can pass a plain function instead.
 */
export type UmbraDesktopTerm = (key: string, ...args: unknown[]) => string;

/**
 * The body of the Exit dialog: the question it has always asked, plus a sentence naming how much
 * unsaved work is about to go with it, plus a second sentence when some of that work is also about
 * to lose somebody else's.
 *
 * The second sentence is not a nicety. Everywhere else on this desktop closing is what loses work,
 * so the Exit dialog is written to discourage it; for a window that has also changed on the server,
 * closing is the *safe* act and discarding is what keeps the other person's version. An editor
 * deciding whether to exit needs to know which of the two situations they are in, and the count is
 * the shortest way to say it. Design §9.
 *
 * Pure, and taking its localizer as an argument, so the singular and plural choices and the "say
 * nothing when there is nothing" cases can be checked without a booted backoffice.
 * @param unsavedCount How many open windows are holding unsaved changes.
 * @param conflictedCount How many of those have also been changed by somebody else.
 * @param term The localizer, e.g. `this.localize.term` bound to the calling element.
 * @returns The dialog body.
 */
export function exitDialogContent(
  unsavedCount: number,
  conflictedCount: number,
  term: UmbraDesktopTerm,
): string {
  const question = term('umbraDesktop_exitQuestion');
  if (unsavedCount < 1) return question;
  const warning =
    unsavedCount === 1
      ? term('umbraDesktop_exitUnsavedOne')
      : term('umbraDesktop_exitUnsaved', unsavedCount);
  if (conflictedCount < 1) return `${warning} ${question}`;
  // "One of them" needs more than one to be one of, so a single unsaved window gets its own
  // wording rather than a sentence that reads as a counting error.
  const conflict =
    unsavedCount === 1
      ? term('umbraDesktop_exitConflictedSole')
      : conflictedCount === 1
        ? term('umbraDesktop_exitConflictedOne')
        : term('umbraDesktop_exitConflictedMany', conflictedCount);
  return `${warning} ${conflict} ${question}`;
}
