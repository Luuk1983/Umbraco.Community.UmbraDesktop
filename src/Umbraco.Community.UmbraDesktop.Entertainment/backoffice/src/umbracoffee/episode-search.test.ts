import { expect } from '@open-wc/testing';
import { foldForSearch, guestNamesFor, markMatches, matchEpisodes } from './episode-search.js';
import { episodeOf } from './test-support.js';
import type { UmbraCoffeeEpisode } from './types.js';

/**
 * The search works over the whole archive in memory, so these cases are about what matches, what a
 * row marks as the match, and which guests a row leads with, without an element in the way.
 */

/** A small archive, newest first, with an accented name, a guest on two episodes and one with none. */
const ARCHIVE: UmbraCoffeeEpisode[] = [
  episodeOf({
    videoId: 'a',
    title: 'The September Shift',
    published: '2026-09-25T11:27:38Z',
    summary: 'Umbraco 17 lands, and a look at the new block editor.',
    guests: [
      { name: 'Daniël Knippers', affiliation: 'Umbraco HQ' },
      { name: 'Sam Smith', affiliation: null },
    ],
  }),
  episodeOf({
    videoId: 'b',
    title: 'Back To School',
    published: '2026-08-28T23:27:49Z',
    summary: 'Package spotlight: uSync.',
    guests: [{ name: 'Sam Smith', affiliation: 'Jumoo' }],
  }),
  episodeOf({ videoId: 'c', title: 'Summer Vibes Only', published: '2026-07-31T23:27:41Z' }),
  episodeOf({
    videoId: 'd',
    title: 'Christmas Special',
    published: '2025-12-19T11:30:00Z',
    guests: [{ name: 'Anna Berg', affiliation: null }],
  }),
];

/**
 * The ids of what matched, in order.
 * @param episodes The matches.
 * @returns Their ids.
 */
const ids = (episodes: UmbraCoffeeEpisode[]) => episodes.map((e) => e.videoId);

/**
 * A marked text written back as a string, the marks in brackets, so a case reads as the row does.
 * @param text The text.
 * @param query The search.
 * @returns The text with `[` and `]` round each match.
 */
const marked = (text: string, query: string) =>
  markMatches(text, query)
    .map((part) => (part.mark ? `[${part.text}]` : part.text))
    .join('');

describe('foldForSearch', () => {
  it('lowercases and drops accents, so typing without them still finds a name with them', () => {
    expect(foldForSearch('Daniël')).to.equal('daniel');
    expect(foldForSearch('CRÈME Brûlée')).to.equal('creme brulee');
  });
});

describe('matchEpisodes', () => {
  it('gives the whole archive, in order, for an empty or blank search', () => {
    expect(ids(matchEpisodes(ARCHIVE, ''))).to.deep.equal(['a', 'b', 'c', 'd']);
    expect(ids(matchEpisodes(ARCHIVE, '   '))).to.deep.equal(['a', 'b', 'c', 'd']);
  });

  it('finds words in the title, the summary and the guest names', () => {
    expect(ids(matchEpisodes(ARCHIVE, 'school')), 'title').to.deep.equal(['b']);
    expect(ids(matchEpisodes(ARCHIVE, 'uSync')), 'summary').to.deep.equal(['b']);
    expect(ids(matchEpisodes(ARCHIVE, 'anna')), 'guest').to.deep.equal(['d']);
    expect(ids(matchEpisodes(ARCHIVE, 'smith')), 'a guest on two episodes').to.deep.equal(['a', 'b']);
  });

  it('ignores case and accents in both directions', () => {
    expect(ids(matchEpisodes(ARCHIVE, 'daniel'))).to.deep.equal(['a']);
    expect(ids(matchEpisodes(ARCHIVE, 'DANIËL'))).to.deep.equal(['a']);
  });

  it('needs every word, wherever each one is', () => {
    expect(ids(matchEpisodes(ARCHIVE, 'sam spotlight'))).to.deep.equal(['b']);
    expect(ids(matchEpisodes(ARCHIVE, 'sam christmas'))).to.deep.equal([]);
  });

  it('does not search the affiliation, which is not a name', () => {
    expect(ids(matchEpisodes(ARCHIVE, 'jumoo'))).to.deep.equal([]);
  });
});

describe('markMatches', () => {
  it('marks each place a word of the search appears, keeping the text as written', () => {
    expect(marked('Matt Brailsford, Umbraco HQ', 'brailsford')).to.equal('Matt [Brailsford], Umbraco HQ');
    expect(marked('umbraCoffee #270 - Vendr Joins Umbraco HQ', 'umbraco')).to.equal('[umbraCo]ffee #270 - Vendr Joins [Umbraco] HQ');
  });

  it('marks every word of a search of several, and a word found twice twice', () => {
    expect(marked('Back To School', 'to back')).to.equal('[Back] [To] School');
    expect(marked('so so', 'so')).to.equal('[so] [so]');
  });

  it('marks an accented name typed without its accent, over the letters as written', () => {
    expect(marked('Daniël Knippers', 'daniel')).to.equal('[Daniël] Knippers');
    expect(marked('Daniel Knippers', 'DANIËL')).to.equal('[Daniel] Knippers');
  });

  it('marks nothing for an empty search or a word that is not there', () => {
    expect(markMatches('Back To School', '')).to.deep.equal([{ text: 'Back To School', mark: false }]);
    expect(marked('Back To School', 'zzz')).to.equal('Back To School');
  });

  it('joins overlapping matches into one mark', () => {
    expect(marked('Spooky Season', 'spo spook')).to.equal('[Spook]y Season');
  });
});

describe('guestNamesFor', () => {
  it('gives the names in the order the episode lists them, blanks left out', () => {
    const episode = episodeOf({
      videoId: 'x',
      title: 'x',
      published: '2026-01-01T00:00:00Z',
      guests: [
        { name: 'Lucy Smith', affiliation: null },
        { name: '  ', affiliation: null },
        { name: 'Matt Brailsford', affiliation: null },
      ],
    });
    expect(guestNamesFor(episode, '')).to.deep.equal(['Lucy Smith', 'Matt Brailsford']);
  });

  it('leads with the guests the search found, so a row shows why it matched', () => {
    const episode = episodeOf({
      videoId: 'x',
      title: 'x',
      published: '2026-01-01T00:00:00Z',
      guests: [
        { name: 'Lucy Smith', affiliation: null },
        { name: 'Georgina Bidwell', affiliation: null },
        { name: 'Matt Brailsford', affiliation: null },
      ],
    });
    expect(guestNamesFor(episode, 'brailsford')).to.deep.equal(['Matt Brailsford', 'Lucy Smith', 'Georgina Bidwell']);
  });
});
