import { expect } from '@open-wc/testing';
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { createArcadeApi } from './arcade-api.js';

type Method = 'get' | 'post' | 'put' | 'delete';

/** Make one client method answer for a describe block, and put it back after. */
function answers(method: Method, answer: () => Promise<unknown>): void {
  const client = umbHttpClient as unknown as Record<Method, unknown>;
  let original: unknown;
  before(() => {
    original = client[method];
    client[method] = answer;
  });
  after(() => (client[method] = original));
}

const board = { alias: 'default', label: 'Snake', better: 'higher', format: 'points' } as const;

describe('submit accepted', () => {
  answers('post', async () => ({ data: { isPersonalBest: true, previousBest: null, rank: 1, isPublic: false, askedAboutPublic: false, displayName: 'Ada', passed: { displayName: 'Grace', value: 500 } } }));
  it('reads an accepted score, with who it passed', async () => {
    const result = await createArcadeApi().submit('Pkg.Snake.Game', board, 600);
    expect(result).to.deep.equal({ status: 'accepted', isPersonalBest: true, previousBest: null, rank: 1, isPublic: false, askedAboutPublic: false, displayName: 'Ada', passed: { displayName: 'Grace', value: 500 } });
  });
});

describe('overview', () => {
  const overview = {
    colleagues: 3,
    boards: [{ game: 'Pkg.Snake.Game', board: 'default', players: 4, viewer: null, leader: { rank: 1, userKey: 'k1', displayName: 'Grace', value: 500, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer: false }, next: null }],
  };
  answers('get', async () => ({ data: overview }));
  it('reads the overview', async () => {
    expect(await createArcadeApi().getOverview()).to.deep.equal(overview);
  });
});

describe('submit conflict', () => {
  answers('post', async () => { throw { type: 'ArcadeBoardConflict', status: 409, title: 'x' }; });
  it('reads a thrown 409 as a conflict', async () => {
    expect(await createArcadeApi().submit('Pkg.Snake.Game', board, 300)).to.deep.equal({ status: 'conflict' });
  });
});

describe('submit rejected', () => {
  answers('post', async () => { throw { type: 'ArcadeScoreRejected', status: 400, title: 'x' }; });
  it('reads a thrown 400 as a rejection', async () => {
    expect(await createArcadeApi().submit('Pkg.Snake.Game', board, 0)).to.deep.equal({ status: 'rejected' });
  });
});

describe('unreachable', () => {
  answers('get', async () => { throw new TypeError('Failed to fetch'); });
  it('reads an unreachable server as nothing, never as an exception', async () => {
    expect(await createArcadeApi().getBest('Pkg.Snake.Game', 'default')).to.equal(undefined);
    expect(await createArcadeApi().getProfile()).to.equal(undefined);
  });
});

describe('beaten', () => {
  answers('post', async () => ({ data: [{ game: 'Pkg.Snake.Game', board: 'default', byDisplayName: 'Grace', value: 500, format: 'points' }] }));
  it('reads beaten events', async () => {
    expect(await createArcadeApi().takeBeaten()).to.have.length(1);
  });
});
