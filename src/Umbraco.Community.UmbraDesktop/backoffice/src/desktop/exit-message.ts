import { unsavedSentence } from './unsaved-message.js';
import type { UmbraDesktopTerm } from './unsaved-message.js';

export type { UmbraDesktopTerm };

/**
 * The body of the Exit dialog: the question it has always asked, preceded by the sentence naming
 * how much unsaved work is about to go with it.
 *
 * The sentence itself moved to `unsaved-message.ts` once the reload dialog needed the same one
 * about the same windows. What stays here is the order — warning first, question last, so the last
 * thing read is the thing being answered — and the reason Exit asks at all: it unmounts the whole
 * desktop with every open window in it, so it is the one route that can discard several windows'
 * work at once. Design §9.
 *
 * Pure, and taking its localizer as an argument, so the wording can be checked without a booted
 * backoffice.
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
  const warning = unsavedSentence(unsavedCount, conflictedCount, term);
  return warning ? `${warning} ${question}` : question;
}
