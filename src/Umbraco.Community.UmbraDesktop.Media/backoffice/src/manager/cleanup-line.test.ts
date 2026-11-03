import { expect } from '@open-wc/testing';
import { cleanupLineOf } from './cleanup-line.js';
import type { HealthFolderCleanupAnswer } from '../health/health.client.js';

const FOLDER = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const NOW = new Date('2026-11-03T15:00:00Z');

/**
 * The server's answer for a check that finished some hours before {@link NOW}.
 * @param hoursAgo How long ago it finished.
 * @returns The answer.
 */
const answer = (hoursAgo = 2): HealthFolderCleanupAnswer => ({
  checkId: 7,
  checkedUtc: new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString(),
  folders: [
    { key: null, unused: 30, oversized: 4 },
    { key: FOLDER, unused: 2, oversized: 1 },
  ],
});

describe('the Media Manager’s cleanup line (design §16.20)', () => {
  it('says what a folder holds, in it and below, from a check under a day old', () => {
    const line = cleanupLineOf(answer(), { kind: 'folder', unique: FOLDER }, NOW);
    expect(line).to.deep.include({ unused: 2, oversized: 1, library: false, checkId: 7 });
    expect(line?.checkedAt.toISOString()).to.equal(answer().checkedUtc);
  });

  it('speaks for the library at the root', () => {
    expect(cleanupLineOf(answer(), { kind: 'root' }, NOW)).to.deep.include({ unused: 30, oversized: 4, library: true });
  });

  it('says nothing without a check, about a check over a day old, in the recycle bin, or for a folder with nothing', () => {
    expect(cleanupLineOf(undefined, { kind: 'root' }, NOW)).to.equal(undefined);
    expect(cleanupLineOf({ checkId: null, checkedUtc: null, folders: [] }, { kind: 'root' }, NOW)).to.equal(undefined);
    expect(cleanupLineOf(answer(25), { kind: 'folder', unique: FOLDER }, NOW)).to.equal(undefined);
    expect(cleanupLineOf(answer(), { kind: 'bin' }, NOW)).to.equal(undefined);
    expect(cleanupLineOf(answer(), { kind: 'folder', unique: '11111111-2222-3333-4444-555555555555' }, NOW)).to.equal(undefined);
  });

  it('stays away once dismissed for that check, and comes back for a newer one', () => {
    const place = { kind: 'folder' as const, unique: FOLDER };
    expect(cleanupLineOf(answer(), place, NOW, 7)).to.equal(undefined);
    expect(cleanupLineOf(answer(), place, NOW, 6)).not.to.equal(undefined);
  });
});
