import { expect } from '@open-wc/testing';
import { mergePersonal, parsePersonal, serializePersonal } from './personal.js';
import type { PersonalNote } from './personal.js';
import { STICKY_NOTES_PERSONAL_MAX_NOTES, STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH } from './constants.js';

/**
 * A person's own notes, as the one `umbracoUserData` document that holds them.
 *
 * The document is read back from a store anyone with database access could have edited, and from
 * versions of this package that do not exist yet, so reading it is forgiving: whatever cannot be a
 * note is left out rather than taking the whole list down with it.
 */

/** A note of one's own. */
const note = (key: string, text: string): PersonalNote => ({ key, text, updatedAt: '2026-09-30T10:00:00Z' });

it('reads nothing stored as no notes', () => {
  expect(parsePersonal(null)).to.deep.equal([]);
});

it('reads back what it wrote, in the same order', () => {
  const notes = [note('b', 'second'), note('a', 'first')];
  expect(parsePersonal(serializePersonal(notes))).to.deep.equal(notes);
});

it('reads a document that is not JSON, or not its shape, as no notes rather than failing', () => {
  expect(parsePersonal('not json')).to.deep.equal([]);
  expect(parsePersonal('{"notes": 3}')).to.deep.equal([]);
  expect(parsePersonal('[1, 2]')).to.deep.equal([]);
});

it('leaves out entries that are not notes, and keeps the rest', () => {
  const value = JSON.stringify({ notes: [note('a', 'kept'), { key: 7 }, null, { key: 'b' }] });
  expect(parsePersonal(value)).to.deep.equal([note('a', 'kept')]);
});

/** The same caps the shared board has, so a note does not change what it may hold by changing kind. */
it('holds to the caps: text cut to its length, and the list to its size', () => {
  const long = 'x'.repeat(STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH + 10);
  const many = Array.from({ length: STICKY_NOTES_PERSONAL_MAX_NOTES + 5 }, (_, i) => note(`k${i}`, i === 0 ? long : ''));
  const read = parsePersonal(serializePersonal(many));
  expect(read).to.have.length(STICKY_NOTES_PERSONAL_MAX_NOTES);
  expect(read[0].text).to.have.length(STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH);
});

/**
 * Two tabs, or two browsers, of the same person each hold the whole list and write it whole. Without
 * a merge, a tab that loaded before a note was added elsewhere deletes that note with its next save,
 * which is what a live test found: a note written in Firefox wiped two written in Chrome. The rule is
 * a three-way merge against what this tab last read or stored, its base.
 */
describe('merging my notes with what another tab stored meanwhile', () => {
  const edited = (n: PersonalNote, text: string): PersonalNote => ({ ...n, text, updatedAt: '2026-09-30T11:00:00Z' });

  it('keeps a note another tab added since this one loaded', () => {
    const a = note('a', 'here');
    const b = note('b', 'elsewhere');
    expect(mergePersonal([a], [a, note('c', 'new here')], [a, b]).map((n) => n.key)).to.deep.equal(['a', 'c', 'b']);
  });

  it('drops a note this tab deleted, even though the store still has it', () => {
    const a = note('a', 'one');
    const b = note('b', 'two');
    expect(mergePersonal([a, b], [a], [a, b]).map((n) => n.key)).to.deep.equal(['a']);
  });

  it('takes another tab’s edit of a note this tab did not touch', () => {
    const a = note('a', 'old');
    expect(mergePersonal([a], [a], [edited(a, 'theirs')])[0].text).to.equal('theirs');
  });

  it('keeps this tab’s edit of a note it changed', () => {
    const a = note('a', 'old');
    expect(mergePersonal([a], [edited(a, 'mine')], [edited(a, 'theirs')])[0].text).to.equal('mine');
  });

  it('lets another tab’s delete stand for a note this tab did not touch, and not for one it edited', () => {
    const a = note('a', 'one');
    const b = note('b', 'two');
    expect(mergePersonal([a, b], [a, b], [a]).map((n) => n.key)).to.deep.equal(['a']);
    expect(mergePersonal([a, b], [a, edited(b, 'still writing')], [a]).map((n) => n.key)).to.deep.equal(['a', 'b']);
  });
});
