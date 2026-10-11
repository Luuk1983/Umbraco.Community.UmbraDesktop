import { expect } from '@open-wc/testing';
import { isEpisode, isEpisodesFile, isNextEpisodeFile } from './types.js';

/**
 * The guards stand between two files fetched off GitHub and every decision the client makes, so each
 * case is a body the Action could plausibly write, or one a proxy, a newer format or a bug could.
 */

/** One episode shaped like the 2026-10-01 addendum's `episodes.json` version 2. */
const episode = {
  videoId: 'aRkc0fRxQjw',
  title: 'The September Shift',
  published: '2026-09-25T11:27:38Z',
  summary: 'Community news, a package spotlight and the Umbraco 17 release.',
  guests: [
    { name: 'Daniël Knippers', affiliation: 'Umbraco HQ' },
    { name: 'Sam Smith', affiliation: null },
  ],
  guestsUnnamed: false,
  uncertain: false,
};

/** A body shaped like the addendum's version 2 `episodes.json`. */
const episodesFile = {
  version: 2,
  generatedAt: '2026-09-30T09:00:00Z',
  episodes: [episode],
};

/** A body shaped like design §3.2's example. */
const nextFile = {
  version: 1,
  updatedAt: '2026-10-30T11:05:00Z',
  episode: {
    videoId: 'v1',
    title: 'October',
    state: 'upcoming',
    scheduledStart: '2026-10-30T11:30:00Z',
    actualStart: null,
  },
};

describe('isEpisodesFile', () => {
  it('accepts a version 2 file, an empty summary and an episode with no guests', () => {
    expect(isEpisodesFile(episodesFile)).to.equal(true);
    expect(isEpisodesFile({ ...episodesFile, episodes: [{ ...episode, summary: '', guests: [], guestsUnnamed: true }] })).to.equal(
      true,
    );
  });

  it('accepts an empty list', () => {
    expect(isEpisodesFile({ ...episodesFile, episodes: [] })).to.equal(true);
  });

  it('rejects version 1, which the data branch no longer carries, and any other version', () => {
    expect(isEpisodesFile({ ...episodesFile, version: 1 })).to.equal(false);
    expect(isEpisodesFile({ ...episodesFile, version: 3 })).to.equal(false);
    const v1 = { version: 1, generatedAt: '2026-09-30T09:00:00Z', episodes: [{ videoId: 'v', title: 't', published: 'p', description: 'd' }] };
    expect(isEpisodesFile(v1), 'a whole version 1 file, as the old Action wrote it').to.equal(false);
  });

  it('rejects a missing videoId, a non-object, a missing list and a generatedAt that is not text', () => {
    expect(isEpisodesFile({ ...episodesFile, episodes: [{ title: 'x', published: 'y' }] })).to.equal(false);
    expect(isEpisodesFile(null)).to.equal(false);
    expect(isEpisodesFile('episodes')).to.equal(false);
    expect(isEpisodesFile({ ...episodesFile, episodes: null })).to.equal(false);
    expect(isEpisodesFile({ ...episodesFile, generatedAt: 5 })).to.equal(false);
  });
});

describe('isEpisode', () => {
  it('rejects an episode missing any of the version 2 fields', () => {
    for (const field of ['summary', 'guests', 'guestsUnnamed', 'uncertain'] as const) {
      const { [field]: _gone, ...rest } = episode;
      void _gone;
      expect(isEpisode(rest), `without ${field}`).to.equal(false);
    }
  });

  it('rejects fields of the wrong kind', () => {
    expect(isEpisode({ ...episode, summary: null }), 'summary is text, empty when there is none').to.equal(false);
    expect(isEpisode({ ...episode, guests: 'Sam' })).to.equal(false);
    expect(isEpisode({ ...episode, guestsUnnamed: 'no' })).to.equal(false);
    expect(isEpisode({ ...episode, uncertain: 0 })).to.equal(false);
  });

  it('rejects a guest without a name, or with an affiliation that is neither text nor null', () => {
    expect(isEpisode({ ...episode, guests: [{ affiliation: null }] })).to.equal(false);
    expect(isEpisode({ ...episode, guests: [{ name: 4, affiliation: null }] })).to.equal(false);
    expect(isEpisode({ ...episode, guests: [{ name: 'Sam', affiliation: 4 }] })).to.equal(false);
    expect(isEpisode({ ...episode, guests: [{ name: 'Sam' }] }), 'affiliation is null when unknown, not absent').to.equal(false);
    expect(isEpisode({ ...episode, guests: [null] })).to.equal(false);
  });
});

describe('isNextEpisodeFile', () => {
  it('accepts the design example, a live one, and nothing coming up', () => {
    expect(isNextEpisodeFile(nextFile)).to.equal(true);
    expect(isNextEpisodeFile({ ...nextFile, episode: { ...nextFile.episode, state: 'live', actualStart: '2026-10-30T11:31:00Z' } })).to.equal(true);
    expect(isNextEpisodeFile({ ...nextFile, episode: null })).to.equal(true);
  });

  it('accepts an episode with its start fields left out', () => {
    const { scheduledStart: _s, actualStart: _a, ...bare } = nextFile.episode;
    void _s;
    void _a;
    expect(isNextEpisodeFile({ ...nextFile, episode: bare })).to.equal(true);
  });

  it('rejects a wrong version, a missing videoId, a state the client has no rule for, and a non-object', () => {
    expect(isNextEpisodeFile({ ...nextFile, version: 2 })).to.equal(false);
    const { videoId: _v, ...noId } = nextFile.episode;
    void _v;
    expect(isNextEpisodeFile({ ...nextFile, episode: noId })).to.equal(false);
    expect(isNextEpisodeFile({ ...nextFile, episode: { ...nextFile.episode, state: 'ended' } })).to.equal(false);
    expect(isNextEpisodeFile(undefined)).to.equal(false);
    expect(isNextEpisodeFile([])).to.equal(false);
  });

  it('rejects a missing episode key, a missing updatedAt and a start that is not text', () => {
    const { episode: _e, ...noEpisode } = nextFile;
    void _e;
    expect(isNextEpisodeFile(noEpisode)).to.equal(false);
    const { updatedAt: _u, ...noUpdated } = nextFile;
    void _u;
    expect(isNextEpisodeFile(noUpdated)).to.equal(false);
    expect(isNextEpisodeFile({ ...nextFile, episode: { ...nextFile.episode, scheduledStart: 1000 } })).to.equal(false);
  });
});
