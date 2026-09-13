import { expect } from '@open-wc/testing';
import { reloadDialogContent } from './reload-message.js';

/**
 * The body of the dialog offered after the backoffice language has been changed.
 *
 * The case worth protecting is the clean one: nothing is dirty, so a dialog that mentioned only
 * unsaved changes would say nothing at all, and the person about to lose nine arranged windows
 * would read it as a no-op. There is no window session restore, so every open window closes.
 */
const term = (key: string, ...args: unknown[]) => (args.length ? `${key}(${args.join(',')})` : key);

it('names the saved change and asks, with nothing open', () => {
  expect(reloadDialogContent(0, 0, 0, term)).to.equal('umbraDesktop_reloadSaved umbraDesktop_reloadQuestion');
});

it('says how many windows close, even when none of them are dirty', () => {
  expect(reloadDialogContent(9, 0, 0, term)).to.equal(
    'umbraDesktop_reloadSaved umbraDesktop_reloadCloses(9) umbraDesktop_reloadQuestion',
  );
});

it('uses the singular for one open window', () => {
  expect(reloadDialogContent(1, 0, 0, term)).to.equal(
    'umbraDesktop_reloadSaved umbraDesktop_reloadClosesOne umbraDesktop_reloadQuestion',
  );
});

it('adds the unsaved sentence when there is work to lose', () => {
  expect(reloadDialogContent(3, 1, 0, term)).to.equal(
    'umbraDesktop_reloadSaved umbraDesktop_reloadCloses(3) umbraDesktop_exitUnsavedOne umbraDesktop_reloadQuestion',
  );
});

it('carries the conflict wording through', () => {
  expect(reloadDialogContent(3, 2, 1, term)).to.equal(
    'umbraDesktop_reloadSaved umbraDesktop_reloadCloses(3) umbraDesktop_exitUnsaved(2) ' +
      'umbraDesktop_exitConflictedOne umbraDesktop_reloadQuestion',
  );
});

it('always ends on the question', () => {
  // The last thing read should be the thing being answered, as in the Exit dialog.
  for (const body of [
    reloadDialogContent(0, 0, 0, term),
    reloadDialogContent(1, 1, 1, term),
    reloadDialogContent(5, 3, 2, term),
  ]) {
    expect(body.endsWith('umbraDesktop_reloadQuestion')).to.equal(true);
  }
});
