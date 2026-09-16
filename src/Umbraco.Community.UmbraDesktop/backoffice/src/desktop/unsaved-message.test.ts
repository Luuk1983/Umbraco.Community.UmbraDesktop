import { expect } from '@open-wc/testing';
import { unsavedSentence } from './unsaved-message.js';

/**
 * The sentence two dialogs share. Its branches exist because a count reads as a counting error in
 * the wrong one, which is the sort of thing only a test notices before a user does.
 */
const term = (key: string, ...args: unknown[]) => (args.length ? `${key}(${args.join(',')})` : key);

it('says nothing when nothing is unsaved', () => {
  // Empty rather than a sentence about zero, so a caller can join it into a longer body blind.
  expect(unsavedSentence(0, 0, term)).to.equal('');
});

it('uses the singular for one', () => {
  expect(unsavedSentence(1, 0, term)).to.equal('umbraDesktop_exitUnsavedOne');
});

it('counts the plural', () => {
  expect(unsavedSentence(3, 0, term)).to.equal('umbraDesktop_exitUnsaved(3)');
});

it('gives a sole unsaved window its own conflict wording', () => {
  // "One of them" needs more than one to be one of.
  expect(unsavedSentence(1, 1, term)).to.equal('umbraDesktop_exitUnsavedOne umbraDesktop_exitConflictedSole');
});

it('names one conflict among several', () => {
  expect(unsavedSentence(3, 1, term)).to.equal('umbraDesktop_exitUnsaved(3) umbraDesktop_exitConflictedOne');
});

it('counts several conflicts', () => {
  expect(unsavedSentence(3, 2, term)).to.equal('umbraDesktop_exitUnsaved(3) umbraDesktop_exitConflictedMany(2)');
});

it('says nothing about conflicts when nothing is unsaved', () => {
  // A conflicted window with no unsaved work is the safe case: closing it keeps the other person's
  // version. There is nothing to warn about, so the count is not mentioned.
  expect(unsavedSentence(0, 2, term)).to.equal('');
});
