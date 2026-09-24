import { expect } from '@open-wc/testing';
import { editNote, mergeBoard, saved, fromServer } from './board.js';
import type { StickyNote } from './api.js';

/**
 * What the window shows when the server's board and the person's own edits meet.
 *
 * The rule the whole module exists for: **a refresh never overwrites text somebody is still
 * writing.** The board refreshes every fifteen seconds, which is often enough to land in the middle
 * of a sentence, and a note that reverted under someone's cursor would make the app unusable.
 */

/** A note as the server returns it. */
function note(key: string, text: string, version = 1, updatedBy = 'Ada'): StickyNote {
  return { key, text, colour: 'yellow', updatedBy, updatedAt: '2026-09-24T10:00:00Z', version };
}

it('shows the server’s board when nothing is being edited', () => {
  const merged = mergeBoard([], [note('a', 'one'), note('b', 'two')]);
  expect(merged.map((local) => local.text)).to.deep.equal(['one', 'two']);
  expect(merged.every((local) => !local.pending)).to.equal(true);
});

it('takes somebody else’s newer text for a note nobody here is editing', () => {
  const local = fromServer([note('a', 'old')]);
  const merged = mergeBoard(local, [note('a', 'new', 2, 'Grace')]);
  expect(merged[0].text).to.equal('new');
  expect(merged[0].updatedBy).to.equal('Grace');
});

it('keeps text still being written when a refresh brings the same version', () => {
  const local = editNote(fromServer([note('a', 'draft')]), 'a', { text: 'draft, still typing' });
  const merged = mergeBoard(local, [note('a', 'draft')]);
  expect(merged[0].text).to.equal('draft, still typing');
  expect(merged[0].pending).to.equal(true);
  expect(merged[0].conflict).to.equal(undefined);
});

/**
 * Someone else saved the note while this person was typing in it. Their text stays, and the other
 * version is kept beside it so the window can offer the choice.
 */
it('flags a conflict, without overwriting, when somebody else saved a note being edited here', () => {
  const local = editNote(fromServer([note('a', 'draft')]), 'a', { text: 'mine' });
  const merged = mergeBoard(local, [note('a', 'theirs', 2, 'Grace')]);
  expect(merged[0].text).to.equal('mine');
  expect(merged[0].conflict?.text).to.equal('theirs');
});

it('adds notes somebody else created, and drops notes somebody else deleted', () => {
  const local = fromServer([note('a', 'one'), note('b', 'two')]);
  const merged = mergeBoard(local, [note('b', 'two'), note('c', 'three')]);
  expect(merged.map((each) => each.key)).to.deep.equal(['b', 'c']);
});

/** A note deleted elsewhere while somebody here was writing in it is not silently thrown away. */
it('keeps a note deleted elsewhere while it has unsaved text here, marked as deleted', () => {
  const local = editNote(fromServer([note('a', 'one')]), 'a', { text: 'unsaved words' });
  const merged = mergeBoard(local, []);
  expect(merged).to.have.length(1);
  expect(merged[0].deletedElsewhere).to.equal(true);
  expect(merged[0].text).to.equal('unsaved words');
});

it('clears pending once the server confirms the text that was sent', () => {
  const local = editNote(fromServer([note('a', 'one')]), 'a', { text: 'two' });
  const after = saved(local, note('a', 'two', 2), 'two');
  expect(after[0].pending).to.equal(false);
  expect(after[0].version).to.equal(2);
});

/**
 * A save takes a round trip, and typing does not stop for it. What was typed after the save left
 * stays, still pending, against the version the save produced.
 */
it('stays pending when more was typed while the save was in flight', () => {
  let local = editNote(fromServer([note('a', 'one')]), 'a', { text: 'two' });
  local = editNote(local, 'a', { text: 'two and three' });
  const after = saved(local, note('a', 'two', 2), 'two');
  expect(after[0].text).to.equal('two and three');
  expect(after[0].pending).to.equal(true);
  expect(after[0].version).to.equal(2);
});
