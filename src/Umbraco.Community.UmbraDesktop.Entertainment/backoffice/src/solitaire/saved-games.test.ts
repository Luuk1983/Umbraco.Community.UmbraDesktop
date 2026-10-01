import { expect } from '@open-wc/testing';
import { SAVED_GAMES_KEY, SavedGameStore } from './saved-games.js';
import { MemoryStorage } from './memory-storage.test-helper.js';
import { deal, seededShuffle } from './rules.js';

describe('solitaire saved games', () => {
  const game = deal(1, seededShuffle(7));

  it('claims nothing when nothing is saved', () => {
    const store = new SavedGameStore(() => new MemoryStorage());
    expect(store.claim()).to.equal(undefined);
  });

  it('saves a window game and lets a new window claim it once', () => {
    const storage = new MemoryStorage();
    new SavedGameStore(() => storage).save('a', { game, elapsedSeconds: 12 });
    // A reload: a new page, so a new store, over the same session storage.
    const store = new SavedGameStore(() => storage);
    const claimed = store.claim();
    expect(claimed?.id).to.equal('a');
    expect(claimed?.saved.elapsedSeconds).to.equal(12);
    expect(claimed?.saved.game).to.deep.equal(game);
    expect(store.claim(), 'a second window does not get the same game').to.equal(undefined);
  });

  it('gives two windows their own games', () => {
    const storage = new MemoryStorage();
    const before = new SavedGameStore(() => storage);
    before.save('a', { game, elapsedSeconds: 1 });
    before.save('b', { game, elapsedSeconds: 2 });
    const after = new SavedGameStore(() => storage);
    const ids = [after.claim()?.id, after.claim()?.id].sort();
    expect(ids).to.deep.equal(['a', 'b']);
  });

  it('forgets a game that is removed, and releases its claim', () => {
    const storage = new MemoryStorage();
    const store = new SavedGameStore(() => storage);
    store.save('a', { game, elapsedSeconds: 1 });
    store.remove('a');
    // After remove, 'a' is gone from storage AND the claim is released, so a new save from another
    // store can write 'a' back and this store can claim it.
    const store2 = new SavedGameStore(() => storage);
    store2.save('a', { game, elapsedSeconds: 2 });
    const claimed = store.claim();
    expect(claimed?.id).to.equal('a');
    expect(claimed?.saved.elapsedSeconds).to.equal(2);
  });

  it('drops anything in storage that is not a playable game', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVED_GAMES_KEY, JSON.stringify({ a: { game: { nonsense: true }, elapsedSeconds: 1 } }));
    expect(new SavedGameStore(() => storage).claim()).to.equal(undefined);
    storage.setItem(SAVED_GAMES_KEY, 'not json');
    expect(new SavedGameStore(() => storage).claim()).to.equal(undefined);
  });

  it('survives storage that throws', () => {
    const store = new SavedGameStore(() => {
      throw new Error('blocked');
    });
    store.save('a', { game, elapsedSeconds: 1 });
    expect(store.claim()).to.equal(undefined);
    store.remove('a');
  });
});
