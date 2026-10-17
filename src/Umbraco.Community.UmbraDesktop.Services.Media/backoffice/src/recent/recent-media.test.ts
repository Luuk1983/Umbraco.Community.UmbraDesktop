import { expect } from '@open-wc/testing';
import { RECENT_LIMIT, RecentMediaList, recentKeyFor } from './recent-media.js';

/**
 * The media files a person opened or saved lately, through any app, kept in the browser per
 * backoffice user. The File page's Open lists them, so the file you were just working on is one tap
 * away. Issue #136.
 */

/** Storage backed by a map, which a test can read back and break. */
class FakeStorage {
  /** What is stored. */
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** An entry to record, varied by key. */
const entry = (unique: string, extension = 'jpg', folder: string | null = 'f1') => ({
  unique,
  name: `Name ${unique}`,
  extension,
  folder,
  folderName: folder ? `Folder ${folder}` : undefined,
});

const KEY = recentKeyFor('user-1');

it('keys the list by user', () => {
  expect(KEY).to.equal('umbradesktop-media-recent:user-1');
});

it('lists newest first, and moves an item recorded again to the top with its new facts', () => {
  const list = new RecentMediaList(new FakeStorage(), KEY);
  list.record(entry('a'), 1);
  list.record(entry('b'), 2);
  list.record({ ...entry('a', 'webp', 'f2'), name: 'Renamed' }, 3);
  const listed = list.list();
  expect(listed.map((e) => e.unique)).to.deep.equal(['a', 'b']);
  expect(listed[0]).to.deep.equal({
    unique: 'a',
    name: 'Renamed',
    extension: 'webp',
    folder: 'f2',
    folderName: 'Folder f2',
    at: 3,
  });
});

it(`keeps at most ${RECENT_LIMIT}, dropping the oldest`, () => {
  const list = new RecentMediaList(new FakeStorage(), KEY);
  for (let i = 0; i < RECENT_LIMIT + 3; i++) list.record(entry(`k${i}`), i);
  const listed = list.list();
  expect(listed).to.have.length(RECENT_LIMIT);
  expect(listed[0].unique).to.equal(`k${RECENT_LIMIT + 2}`);
  expect(listed.some((e) => e.unique === 'k0')).to.equal(false);
});

it('lists only the extensions asked for, ignoring case, and all without a filter', () => {
  const list = new RecentMediaList(new FakeStorage(), KEY);
  list.record(entry('a', 'JPG'), 1);
  list.record(entry('b', 'txt'), 2);
  list.record(entry('c', 'png'), 3);
  expect(list.list(['jpg', 'png']).map((e) => e.unique)).to.deep.equal(['c', 'a']);
  expect(list.list()).to.have.length(3);
});

it('keeps the folder an earlier entry knew when a save over the item knows none', () => {
  const list = new RecentMediaList(new FakeStorage(), KEY);
  list.record(entry('a', 'jpg', 'f1'), 1);
  list.record({ unique: 'a', name: 'Name a', extension: 'jpg', folder: null }, 2, { keepFolder: true });
  expect(list.list()[0].folder).to.equal('f1');
  expect(list.list()[0].folderName).to.equal('Folder f1');
});

it('forgets an item', () => {
  const list = new RecentMediaList(new FakeStorage(), KEY);
  list.record(entry('a'), 1);
  list.record(entry('b'), 2);
  list.forget('a');
  expect(list.list().map((e) => e.unique)).to.deep.equal(['b']);
});

it('keeps one list per user', () => {
  const storage = new FakeStorage();
  new RecentMediaList(storage, recentKeyFor('u1')).record(entry('a'), 1);
  new RecentMediaList(storage, recentKeyFor('u2')).record(entry('b'), 1);
  expect(new RecentMediaList(storage, recentKeyFor('u1')).list().map((e) => e.unique)).to.deep.equal(['a']);
  expect(new RecentMediaList(storage, recentKeyFor('u2')).list().map((e) => e.unique)).to.deep.equal(['b']);
});

it('lists nothing and never throws when storage is missing or refuses', () => {
  const nothing = new RecentMediaList(null, KEY);
  nothing.record(entry('a'), 1);
  expect(nothing.list()).to.deep.equal([]);

  const refusing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  const list = new RecentMediaList(refusing, KEY);
  list.record(entry('a'), 1);
  list.forget('a');
  expect(list.list()).to.deep.equal([]);
});

it('lists nothing from corrupt storage, and drops entries that are not entries', () => {
  const storage = new FakeStorage();
  storage.setItem(KEY, '{not json');
  expect(new RecentMediaList(storage, KEY).list()).to.deep.equal([]);
  storage.setItem(KEY, JSON.stringify([{ unique: 'a' }, 'x', null, { ...entry('b'), at: 1 }]));
  expect(new RecentMediaList(storage, KEY).list().map((e) => e.unique)).to.deep.equal(['b']);
});
