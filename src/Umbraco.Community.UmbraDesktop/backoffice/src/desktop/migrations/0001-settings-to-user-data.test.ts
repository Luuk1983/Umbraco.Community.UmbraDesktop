import { expect } from '@open-wc/testing';
import { settingsToUserDataMigration } from './0001-settings-to-user-data';
import { fakeStore } from './fake-store.test-helper';
import type { UmbraDesktopFakeStore } from './fake-store.test-helper';
import { UMBRADESKTOP_SETTINGS_IDENTIFIER } from '../user-data/constants';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../settings/settings-store';

/**
 * The failure matrix from the design doc §7, for the one migration that exists.
 *
 * This is the code most likely to be got wrong and least likely to be noticed, because every way it
 * fails looks like a user who simply never had settings. So each row of the matrix is a test, and
 * the one that matters most is the pair at the bottom: it must never write over settings the server
 * already holds, and it must never claim to have done work it did not do.
 */

/**
 * What the account holds for settings, or undefined when nothing does.
 * @param store The store to read.
 * @returns The stored payload.
 */
function stored(store: UmbraDesktopFakeStore): string | undefined {
  return store.values.get(UMBRADESKTOP_SETTINGS_IDENTIFIER);
}

/** A settings payload a user might plausibly have in `localStorage`. */
const STORED = JSON.stringify({
  v: 1,
  wallpaper: { kind: 'media', unique: 'abc-123' },
  theme: 'win98',
  pinned: ['content'],
  bootIntoDesktop: true,
  reopenWindows: 'persistent',
  taskbarFeatures: { clock: false },
  wallpaperFollowsTheme: false,
  locale: { source: 'browser', hourCycle: 'h23' },
});

it('writes the browser payload to the account when the account has none', async () => {
  const store = fakeStore();
  const migration = settingsToUserDataMigration({ store, readLegacy: () => STORED });

  expect(await migration.run()).to.equal(true);
  expect(JSON.parse(stored(store)!)).to.deep.equal(JSON.parse(STORED));
});

it('does nothing when the account already has settings', async () => {
  const store = fakeStore({ [UMBRADESKTOP_SETTINGS_IDENTIFIER]: '{"v":1,"theme":"macos"}' });
  const migration = settingsToUserDataMigration({ store, readLegacy: () => STORED });

  expect(await migration.run()).to.equal(false);
  expect(stored(store)).to.equal('{"v":1,"theme":"macos"}');
});

it('does nothing when the browser has no payload', async () => {
  const store = fakeStore();
  const migration = settingsToUserDataMigration({ store, readLegacy: () => null });

  expect(await migration.run()).to.equal(false);
  expect(stored(store)).to.equal(undefined);
});

it('treats an empty browser payload as no payload', async () => {
  // An empty string parses to the defaults, so treating it as a payload would put a default desktop
  // on the account and then record the migration as done, which is worse than leaving it pending.
  const store = fakeStore();
  const migration = settingsToUserDataMigration({ store, readLegacy: () => '' });

  expect(await migration.run()).to.equal(false);
  expect(stored(store)).to.equal(undefined);
});

it('reports nothing done when the account could not be read', async () => {
  // Not a throw: the ledger is read from the same request, so reaching this at all means something
  // transient. Next load tries again, and nothing has been lost in the meantime.
  const store = fakeStore();
  store.failReads(true);
  const migration = settingsToUserDataMigration({ store, readLegacy: () => STORED });

  expect(await migration.run()).to.equal(false);
});

it('leaves a payload it cannot read exactly where it is', async () => {
  // It used to store the defaults and record itself done. That is destructive: the account's copy
  // is then mirrored back over the browser's, so the original is gone.
  const store = fakeStore();
  const migration = settingsToUserDataMigration({ store, readLegacy: () => 'not json at all' });

  expect(await migration.run()).to.equal(false);
  expect(stored(store)).to.equal(undefined);
});

it('leaves a payload from a later build alone', async () => {
  // The case that makes the rule worth having. `v: 2` is not corruption, it is somebody who has run
  // a newer build — and copying it would replace their real settings with defaults, on their
  // account, permanently, with nothing having failed anywhere.
  const store = fakeStore();
  const later = JSON.stringify({ v: 2, theme: 'something-newer' });
  const migration = settingsToUserDataMigration({ store, readLegacy: () => later });

  expect(await migration.pending()).to.equal(false);
  expect(await migration.run()).to.equal(false);
  expect(stored(store)).to.equal(undefined);
});

it('still migrates a readable payload that is missing fields', async () => {
  // Unreadable is about the envelope, not the contents. A v1 payload with half its fields absent is
  // perfectly migratable: each field falls back on its own, which is what parseSettings is for.
  const store = fakeStore();
  const migration = settingsToUserDataMigration({
    store,
    readLegacy: () => JSON.stringify({ v: 1, theme: 'win98' }),
  });

  expect(await migration.run()).to.equal(true);
  expect(JSON.parse(stored(store)!).theme).to.equal('win98');
  expect(JSON.parse(stored(store)!).wallpaper).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper);
});

it('drops a field it cannot read and keeps the rest', async () => {
  const store = fakeStore();
  const migration = settingsToUserDataMigration({
    store,
    readLegacy: () => JSON.stringify({ v: 1, theme: 'win98', wallpaper: 'not a reference' }),
  });

  await migration.run();

  const migrated = JSON.parse(stored(store)!);
  expect(migrated.theme).to.equal('win98');
  expect(migrated.wallpaper).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper);
});

it('throws when the account refuses the write', async () => {
  // A read that worked followed by a write that did not is an anomaly rather than an unreachable
  // server, and it is the one case where the user's settings are genuinely at risk of being left
  // behind. It is reported rather than swallowed.
  const store = fakeStore();
  store.failWrites(true);
  const migration = settingsToUserDataMigration({ store, readLegacy: () => STORED });

  let threw = false;
  try {
    await migration.run();
  } catch {
    threw = true;
  }

  expect(threw).to.equal(true);
});

it('looks ahead to work it has', async () => {
  const migration = settingsToUserDataMigration({ store: fakeStore(), readLegacy: () => STORED });

  expect(await migration.pending()).to.equal(true);
});

it('looks ahead to nothing when the account already has settings', async () => {
  const store = fakeStore({ [UMBRADESKTOP_SETTINGS_IDENTIFIER]: '{"v":1,"theme":"macos"}' });
  const migration = settingsToUserDataMigration({ store, readLegacy: () => STORED });

  expect(await migration.pending()).to.equal(false);
});

it('looks ahead to nothing when the browser has no payload', async () => {
  const migration = settingsToUserDataMigration({ store: fakeStore(), readLegacy: () => null });

  expect(await migration.pending()).to.equal(false);
});

it('looks ahead to nothing when the account cannot be read', async () => {
  const store = fakeStore();
  store.failReads(true);
  const migration = settingsToUserDataMigration({ store, readLegacy: () => STORED });

  expect(await migration.pending()).to.equal(false);
});

it('writes nothing while looking ahead', async () => {
  // It decides whether a screen appears, so it runs on every load where the migration is unapplied.
  const store = fakeStore();
  const migration = settingsToUserDataMigration({ store, readLegacy: () => STORED });

  await migration.pending();

  expect(stored(store)).to.equal(undefined);
});

it('names itself by a stable id and a localization key', async () => {
  // The id is what the ledger records, so changing it re-runs this migration for everybody. The key
  // is resolved by the caller, never by the runner.
  const migration = settingsToUserDataMigration({ store: fakeStore(), readLegacy: () => null });

  expect(migration.id).to.equal('0001-settings-to-user-data');
  expect(migration.descriptionKey).to.equal('umbraDesktop_migrationSettingsToAccount');
});
