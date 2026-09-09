import { expect } from '@open-wc/testing';
import { classifyConflict } from './classify.js';

/**
 * The verdict a server event produces for a window that is holding unsaved changes. Design §5.3.
 *
 * The first case below is the one this whole feature turns on: a server event carries no user or
 * client identity, so a window's own save arrives indistinguishable from a colleague's, and a
 * false alarm on every save would teach people to ignore the real one inside a day.
 */

/** A content model with one value, so a case can state only what it is about. */
function doc(title: string, over: Record<string, unknown> = {}) {
  return {
    unique: 'a1',
    values: [{ alias: 'title', culture: null, segment: null, value: title, editorAlias: 'Umbraco.TextBox' }],
    variants: [{ culture: null, segment: null, name: 'Home', updateDate: '2026-01-01', state: 'Draft' }],
    ...over,
  };
}

it('suppresses a window own write, even when the server stamps it', () => {
  const base = doc('Welcome');
  const mine = doc('Welcome to Acme');
  // What comes back from the server is what we sent, plus the fields the server owns.
  const theirs = doc('Welcome to Acme', {
    variants: [{ culture: null, segment: null, name: 'Home', updateDate: '2026-09-08T10:00:00Z', state: 'Published' }],
  });
  expect(classifyConflict({ base, mine, theirs })).to.equal('own-write');
});

it('does nothing when all three versions already agree', () => {
  // The only state in which the order of the checks changes the answer, and therefore the test
  // that pins it. A settled save and a duplicate event both land here: `own-write` is checked
  // before `refresh`, so this answers "nothing to do" rather than reloading a window that is
  // already showing exactly what the server holds.
  const settled = doc('Welcome to Acme');
  expect(classifyConflict({ base: settled, mine: settled, theirs: settled })).to.equal('own-write');
});

it('does nothing when the server still holds what we last saved', () => {
  const base = doc('Welcome');
  expect(classifyConflict({ base, mine: doc('Welcome to Acme'), theirs: doc('Welcome') })).to.equal('no-change');
});

it('refreshes when this window has nothing of its own', () => {
  // Reachable even though a clean window skips the fetch: the editor can save while the fetch is
  // in flight, and then the window that was dirty when we asked is clean when the answer lands.
  const base = doc('Welcome');
  expect(classifyConflict({ base, mine: doc('Welcome'), theirs: doc('Welcome to Acme') })).to.equal('refresh');
});

it('reports a conflict when the server differs from both sides', () => {
  expect(
    classifyConflict({ base: doc('Welcome'), mine: doc('Welcome to ACME'), theirs: doc('Welcome to Acme Ltd') }),
  ).to.equal('conflict');
});

it('reports a conflict for a change in another culture', () => {
  // Design §6: saving one culture sends stale values for the others, so this is a real conflict
  // and not the harmless case the earlier design assumed.
  const base = {
    unique: 'a1',
    values: [
      { alias: 'title', culture: 'en-US', segment: null, value: 'Welcome', editorAlias: 'Umbraco.TextBox' },
      { alias: 'title', culture: 'de-DE', segment: null, value: 'Willkommen', editorAlias: 'Umbraco.TextBox' },
    ],
    variants: [],
  };
  const mine = structuredClone(base);
  mine.values[0].value = 'Welcome to Acme';
  const theirs = structuredClone(base);
  theirs.values[1].value = 'Willkommen bei Acme Ltd';
  expect(classifyConflict({ base, mine, theirs })).to.equal('conflict');
});

it('does nothing when a side has not loaded', () => {
  expect(classifyConflict({ base: undefined, mine: doc('a'), theirs: doc('b') })).to.equal('no-change');
  expect(classifyConflict({ base: doc('a'), mine: undefined, theirs: doc('b') })).to.equal('no-change');
  expect(classifyConflict({ base: doc('a'), mine: doc('b'), theirs: undefined })).to.equal('no-change');
});
