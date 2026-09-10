import { expect } from '@open-wc/testing';
import { matchByLabel } from './name-match';

/**
 * The rules two tools depend on, so they live here rather than being asserted twice through the
 * tools that use them.
 */

/** Names shaped like the real catalogue's, including a genuinely ambiguous pair. */
const CANDIDATES = [
  { item: 'media', label: 'Media library' },
  { item: 'media-types', label: 'Media Types' },
  { item: 'logs', label: 'Log Viewer' },
  { item: 'jobs', label: 'Background Jobs' },
];

it('finds an exact name', () => {
  expect(matchByLabel(CANDIDATES, 'Log Viewer').map((m) => m.item)).to.deep.equal(['logs']);
});

it('ignores case, because nobody agrees on it', () => {
  expect(matchByLabel(CANDIDATES, 'log viewer').map((m) => m.item)).to.deep.equal(['logs']);
});

it('ignores surrounding space', () => {
  expect(matchByLabel(CANDIDATES, '  Log Viewer ').map((m) => m.item)).to.deep.equal(['logs']);
});

it('accepts a fragment when only one thing contains it', () => {
  expect(matchByLabel(CANDIDATES, 'background').map((m) => m.item)).to.deep.equal(['jobs']);
});

it('returns several when a fragment is genuinely ambiguous', () => {
  // The caller refuses on this rather than picking, which is the whole reason this returns a list.
  expect(matchByLabel(CANDIDATES, 'media').map((m) => m.item)).to.have.members([
    'media',
    'media-types',
  ]);
});

it('prefers an exact match over the fragment it also is', () => {
  // The case that decides the rule order. "Media Types" contains "media types" and so does nothing
  // else here, but if containment ran first on a set where an exact name is also a substring of a
  // longer one, the exact name would be reported as ambiguous with it.
  const candidates = [
    { item: 'a', label: 'Media' },
    { item: 'b', label: 'Media library' },
  ];
  expect(matchByLabel(candidates, 'Media').map((m) => m.item)).to.deep.equal(['a']);
});

it('finds nothing for a name that is not there', () => {
  expect(matchByLabel(CANDIDATES, 'Photoshop')).to.deep.equal([]);
});

it('finds nothing for an empty name, rather than everything', () => {
  // Containment against '' matches every candidate, which would make a missing argument read as
  // "all of them" — dangerous for the tool that closes things.
  expect(matchByLabel(CANDIDATES, '')).to.deep.equal([]);
  expect(matchByLabel(CANDIDATES, '   ')).to.deep.equal([]);
});
