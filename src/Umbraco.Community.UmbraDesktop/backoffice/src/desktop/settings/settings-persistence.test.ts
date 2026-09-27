import { expect } from '@open-wc/testing';
import { UmbraDesktopSettingsPersistence } from './settings-persistence';
import type { UmbraDesktopSettingsCache } from './settings-cache';
import { UMBRADESKTOP_DEFAULT_SETTINGS, serialiseSettings } from './settings-store';
import type { UmbraDesktopSettings } from './types';
import { fakeStore } from '../migrations/fake-store.test-helper';
import type { UmbraDesktopFakeStore } from '../migrations/fake-store.test-helper';
import { UmbraDesktopStoredMigrationLedger } from '../migrations/ledger';
import { settingsToUserDataMigration } from '../migrations/0001-settings-to-user-data';
import type { UmbraDesktopMigration } from '../migrations/types';
import { UMBRADESKTOP_SETTINGS_IDENTIFIER } from '../user-data/constants';

/**
 * Reading and writing one user's settings, and the two questions the migration screen asks.
 *
 * Two rules run through all of it. **Reading falls back**: the account is the source of truth, and
 * when it has nothing to say — because it is unreachable *or* because it genuinely holds nothing —
 * this browser's copy is a better answer than the defaults. **Writing does not**: the cache is only
 * ever written from a value the account confirmed, which is what makes the two impossible to
 * diverge rather than merely unlikely to.
 *
 * Loading no longer runs migrations. They happen after the desktop is on screen, behind a screen of
 * their own, so that the way somebody entered the desktop stops mattering.
 */

/** A cache over one in-memory value. */
interface FakeCache extends UmbraDesktopSettingsCache {
  /** What it holds, or null for nothing. */
  value: string | null;
  /** How many times it was written. */
  readonly writes: number;
}

/**
 * A cache holding one value.
 * @param value What it starts with.
 * @returns The cache.
 */
function fakeCache(value: string | null = null): FakeCache {
  let writes = 0;

  const cache: FakeCache = {
    value,
    get writes() {
      return writes;
    },
    read: () => cache.value,
    write: (written) => {
      writes++;
      cache.value = written;
    },
  };

  return cache;
}

/**
 * Settings distinguishable from the defaults at a glance.
 * @param theme The theme id to set.
 * @returns Settings carrying that theme.
 */
function theirs(theme: string): UmbraDesktopSettings {
  return { ...UMBRADESKTOP_DEFAULT_SETTINGS, theme };
}

/**
 * A migration that does whatever the test says.
 * @param id The migration's id.
 * @param behaviour What it looks ahead to, and what running it does.
 * @returns The migration.
 */
function fakeMigration(
  id: string,
  behaviour: { pending?: boolean; run?: () => Promise<boolean> } = {},
): UmbraDesktopMigration {
  return {
    id,
    descriptionKey: `key.${id}`,
    pending: async () => behaviour.pending ?? true,
    run: behaviour.run ?? (async () => true),
  };
}

/**
 * Persistence wired the way the settings context wires it, with fakes underneath.
 * @param options What to start with, and which migrations it knows about.
 * @returns The persistence and the fakes behind it.
 */
function persistence(options: {
  account?: string;
  cached?: string;
  migrations?: readonly UmbraDesktopMigration[];
}): {
  subject: UmbraDesktopSettingsPersistence;
  store: UmbraDesktopFakeStore;
  cache: FakeCache;
} {
  const store = options.account
    ? fakeStore({ [UMBRADESKTOP_SETTINGS_IDENTIFIER]: options.account })
    : fakeStore();
  const cache = fakeCache(options.cached ?? null);

  const subject = new UmbraDesktopSettingsPersistence({
    store,
    cache,
    ledger: new UmbraDesktopStoredMigrationLedger(store),
    migrations: options.migrations ?? [],
  });

  return { subject, store, cache };
}

it('takes the settings from the account when it has some', async () => {
  const { subject } = persistence({ account: serialiseSettings(theirs('macos')) });

  const load = await subject.load();

  expect(load.settings.theme).to.equal('macos');
  expect(load.source).to.equal('server');
});

it('mirrors the account payload into the cache', async () => {
  const account = serialiseSettings(theirs('macos'));
  const { subject, cache } = persistence({ account, cached: serialiseSettings(theirs('win98')) });

  await subject.load();

  expect(cache.value).to.equal(account);
});

it('falls back to the cache when the account cannot be read', async () => {
  const { subject, store } = persistence({ cached: serialiseSettings(theirs('win98')) });
  store.failReads(true);

  const load = await subject.load();

  expect(load.settings.theme).to.equal('win98');
  expect(load.source).to.equal('cache');
});

it('falls back to the cache when the account holds nothing', async () => {
  // The account is empty and this browser has a desktop. Migration is about to move that payload up,
  // so painting it now is the same answer arrived at sooner — and if the migration then fails, the
  // user spends the session on their own desktop rather than on a default one.
  const { subject } = persistence({ cached: serialiseSettings(theirs('win98')) });

  const load = await subject.load();

  expect(load.settings.theme).to.equal('win98');
  expect(load.source).to.equal('cache');
});

it('leaves the cache alone when it fell back to it', async () => {
  const { subject, cache } = persistence({ cached: serialiseSettings(theirs('win98')) });

  await subject.load();

  expect(cache.writes).to.equal(0);
});

it('gives the defaults when neither the account nor the cache has anything', async () => {
  const load = await persistence({}).subject.load();

  expect(load.settings).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
  expect(load.source).to.equal('defaults');
});

it('writes nothing to the account for a user who has never set anything', async () => {
  // Load-bearing, and it looks like an omission. Seeding the account with defaults here would make
  // it non-empty, and an account that is not empty is one migration 0001 will never run against — so
  // a user whose real desktop lives in another browser would have it stranded there, by a write
  // that was only trying to be tidy.
  const { subject, store, cache } = persistence({});

  await subject.load();

  expect(store.values.size).to.equal(0);
  expect(cache.writes).to.equal(0);
});

it('has nothing to migrate for a user who has never set anything', async () => {
  const store = fakeStore();
  const subject = new UmbraDesktopSettingsPersistence({
    store,
    cache: fakeCache(null),
    ledger: new UmbraDesktopStoredMigrationLedger(store),
    // Given the real migration, and a browser with nothing in it. No screen should appear.
    migrations: [settingsToUserDataMigration({ store, readLegacy: () => null })],
  });

  expect(await subject.pending()).to.eql([]);
});

it('does not run migrations while loading', async () => {
  // They belong after the desktop is painted, behind their own screen. A load that quietly ran them
  // would put the work back inside the boot, where nobody can see it.
  const ran: string[] = [];
  const { subject } = persistence({
    cached: serialiseSettings(theirs('win98')),
    migrations: [
      fakeMigration('a', {
        run: async () => {
          ran.push('a');
          return true;
        },
      }),
    ],
  });

  await subject.load();

  expect(ran).to.eql([]);
});

it('reports a migration that has work to do', async () => {
  const { subject } = persistence({
    cached: serialiseSettings(theirs('win98')),
    migrations: [fakeMigration('a', { pending: true })],
  });

  expect((await subject.pending()).map((migration) => migration.id)).to.eql(['a']);
});

it('reports nothing pending when no migration has work', async () => {
  const { subject } = persistence({ migrations: [fakeMigration('a', { pending: false })] });

  expect(await subject.pending()).to.eql([]);
});

it('runs the migrations and reports what they did', async () => {
  const { subject } = persistence({ migrations: [fakeMigration('a'), fakeMigration('b')] });

  const report = await subject.migrate();

  expect(report.applied).to.eql(['a', 'b']);
});

it('announces each migration as it starts', async () => {
  const announced: string[] = [];
  const { subject } = persistence({ migrations: [fakeMigration('a'), fakeMigration('b')] });

  await subject.migrate((migration) => announced.push(migration.descriptionKey));

  expect(announced).to.eql(['key.a', 'key.b']);
});

it('loads the migrated payload once the migration has run', async () => {
  // The whole feature in one test: a user with a desktop in this browser and nothing on their
  // account. Real migration, real ledger, fakes only for the two stores.
  const cached = serialiseSettings(theirs('win98'));
  const store = fakeStore();
  const cache = fakeCache(cached);
  const subject = new UmbraDesktopSettingsPersistence({
    store,
    cache,
    ledger: new UmbraDesktopStoredMigrationLedger(store),
    migrations: [settingsToUserDataMigration({ store, readLegacy: () => cache.read() })],
  });

  expect((await subject.pending()).map((migration) => migration.id)).to.eql(['0001-settings-to-user-data']);
  const report = await subject.migrate();
  const load = await subject.load();

  expect(report.applied).to.eql(['0001-settings-to-user-data']);
  expect(store.values.get(UMBRADESKTOP_SETTINGS_IDENTIFIER)).to.equal(cached);
  expect(load.settings.theme).to.equal('win98');
  expect(load.source).to.equal('server');
});

it('reports nothing pending when the ledger cannot be read', async () => {
  const { subject, store } = persistence({ migrations: [fakeMigration('a', { pending: true })] });
  store.failReads(true);

  expect(await subject.pending()).to.eql([]);
});

it('saves to the account and mirrors to the cache', async () => {
  const { subject, store, cache } = persistence({});

  expect(await subject.save(theirs('macos'))).to.equal(true);
  expect(store.values.get(UMBRADESKTOP_SETTINGS_IDENTIFIER)).to.equal(serialiseSettings(theirs('macos')));
  expect(cache.value).to.equal(serialiseSettings(theirs('macos')));
});

it('leaves the cache alone when the account refuses the save', async () => {
  const { subject, store, cache } = persistence({ cached: serialiseSettings(theirs('win98')) });
  store.failWrites(true);

  expect(await subject.save(theirs('macos'))).to.equal(false);
  expect(cache.value).to.equal(serialiseSettings(theirs('win98')));
});
