/**
 * Whatever a localizer needs to look like for {@link exitDialogContent}. Umbraco's
 * `this.localize.term` matches it; a test can pass a plain function instead.
 */
export type UmbraDesktopTerm = (key: string, ...args: unknown[]) => string;

/**
 * The body of the Exit dialog: the question it has always asked, plus a sentence naming how much
 * unsaved work is about to go with it.
 *
 * Exit is the one route out that can discard several windows at once, and it gets **one** dialog
 * rather than a discard prompt stacked on top of its own — two dialogs for one decision is worse
 * than a longer sentence. That is also why the count lives here rather than in a separate modal.
 *
 * Pure, and taking its localizer as an argument, so the singular/plural choice and the "say nothing
 * when there is nothing" case can be checked without a booted backoffice.
 * @param unsavedCount How many open windows are holding unsaved changes.
 * @param term The localizer, e.g. `this.localize.term` bound to the calling element.
 * @returns The dialog body.
 */
export function exitDialogContent(unsavedCount: number, term: UmbraDesktopTerm): string {
  const question = term('umbraDesktop_exitQuestion');
  if (unsavedCount < 1) return question;
  const warning =
    unsavedCount === 1
      ? term('umbraDesktop_exitUnsavedOne')
      : term('umbraDesktop_exitUnsaved', unsavedCount);
  return `${warning} ${question}`;
}
