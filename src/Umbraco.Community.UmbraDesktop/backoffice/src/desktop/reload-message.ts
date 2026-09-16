import { unsavedSentence } from './unsaved-message.js';
import type { UmbraDesktopTerm } from './unsaved-message.js';

/**
 * The body of the reload dialog, shown once the backoffice language has been changed.
 *
 * Three things in this order: the change is already saved, this is what reloading costs, and the
 * question. Saved first because it is the sentence that makes declining safe — the language applies
 * at the user's next load either way, so "Later" is a real answer rather than a cancelled action.
 *
 * The cost sentence names **every** open window, not only the unsaved ones. Nothing on this desktop
 * persists open windows, so a reload closes nine clean ones as surely as one dirty one, along with
 * where they were and what was snapped. A dialog that mentioned only unsaved changes would read as
 * a no-op to exactly the person about to lose their arrangement.
 * @param openCount How many windows are open.
 * @param unsavedCount How many of them are holding unsaved changes.
 * @param conflictedCount How many of those have also been changed by somebody else.
 * @param term The localizer, e.g. `this.localize.term` bound to the calling element.
 * @returns The dialog body.
 */
export function reloadDialogContent(
  openCount: number,
  unsavedCount: number,
  conflictedCount: number,
  term: UmbraDesktopTerm,
): string {
  const parts = [term('umbraDesktop_reloadSaved')];
  if (openCount === 1) parts.push(term('umbraDesktop_reloadClosesOne'));
  else if (openCount > 1) parts.push(term('umbraDesktop_reloadCloses', openCount));
  const unsaved = unsavedSentence(unsavedCount, conflictedCount, term);
  if (unsaved) parts.push(unsaved);
  parts.push(term('umbraDesktop_reloadQuestion'));
  return parts.join(' ');
}
