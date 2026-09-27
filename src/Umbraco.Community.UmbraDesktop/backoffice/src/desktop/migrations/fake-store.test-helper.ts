import type { UmbraDesktopMigrationStore } from './types';

/**
 * An in-memory {@link UmbraDesktopMigrationStore} for tests, with the two failure modes that matter.
 *
 * Named `.test-helper.ts` rather than `.test.ts` so the test runner's `src/**\/*.test.ts` glob does
 * not try to run it as a suite.
 *
 * The failures are separate switches because the code under test treats them very differently: a
 * read that fails means "we cannot see what is stored", which stops migrations and falls back to the
 * cache, while a write that fails after a successful read is an anomaly worth reporting. Collapsing
 * them into one flag would hide exactly the distinction these tests exist to pin.
 */
export interface UmbraDesktopFakeStore extends UmbraDesktopMigrationStore {
  /** Everything it holds, keyed by identifier. */
  readonly values: Map<string, string>;
  /** Make reads report a failure rather than an absence. */
  failReads(fail: boolean): void;
  /** Make writes fail. */
  failWrites(fail: boolean): void;
}

/**
 * A store holding values in memory.
 * @param seed What it starts with, keyed by identifier.
 * @returns The store.
 */
export function fakeStore(seed: Record<string, string> = {}): UmbraDesktopFakeStore {
  const values = new Map(Object.entries(seed));
  let readsFail = false;
  let writesFail = false;

  return {
    values,
    failReads: (fail) => (readsFail = fail),
    failWrites: (fail) => (writesFail = fail),

    async read(identifier) {
      if (readsFail) return undefined;
      return values.get(identifier) ?? null;
    },

    async write(identifier, value) {
      if (writesFail) return false;
      values.set(identifier, value);
      return true;
    },
  };
}
