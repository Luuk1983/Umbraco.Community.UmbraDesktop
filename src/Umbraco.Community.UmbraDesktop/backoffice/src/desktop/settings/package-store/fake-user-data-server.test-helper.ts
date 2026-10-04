import type { UmbraDesktopUserDataClient, UmbraDesktopUserDataRow } from '../../user-data/types.js';

/**
 * An in-memory stand-in for Umbraco's `user-data` endpoints, for the tests of a package's settings
 * row: one server that several tabs' documents can share, which is how a second row gets made.
 *
 * Named `.test-helper.ts` rather than `.test.ts` so the test runner's `src/**\/*.test.ts` glob does
 * not try to run it as a suite.
 *
 * Like the real table it enforces nothing on group and identifier: a create with a new key always
 * succeeds, so a test can see a duplicate the moment code makes one.
 */
export interface UmbraDesktopFakeUserDataServer {
  /** The client every document under test is handed. */
  readonly client: UmbraDesktopUserDataClient;
  /** Every row it holds, of every group, in the order they were made. */
  rows: UmbraDesktopUserDataRow[];
  /** Every request, as `operation:argument`, so a test can say what was never asked. */
  readonly calls: string[];
  /** Whether every request fails, as it does when the server cannot be reached. */
  failing: boolean;
  /** Whether every request throws instead, breaking the port's promise to report rather than throw. */
  throwing: boolean;
}

/**
 * A server holding rows in memory.
 * @param rows The rows it starts with. Copied, so the caller's array is never changed under it.
 * @returns The server.
 */
export function fakeUserDataServer(rows: UmbraDesktopUserDataRow[] = []): UmbraDesktopFakeUserDataServer {
  const server: UmbraDesktopFakeUserDataServer = {
    rows: rows.map((row) => ({ ...row })),
    calls: [],
    failing: false,
    throwing: false,
    client: {
      async readGroup(group) {
        answer(`read:${group}`);
        return server.failing ? undefined : server.rows.filter((row) => row.group === group).map((row) => ({ ...row }));
      },
      async create(row) {
        answer(`create:${row.key}`);
        if (server.failing) return false;
        server.rows.push({ ...row });
        return true;
      },
      async update(row) {
        answer(`update:${row.key}`);
        if (server.failing) return false;
        const index = server.rows.findIndex((existing) => existing.key === row.key);
        if (index < 0) return false;
        server.rows[index] = { ...row };
        return true;
      },
      async remove(key) {
        answer(`remove:${key}`);
        if (server.failing) return false;
        server.rows = server.rows.filter((row) => row.key !== key);
        return true;
      },
    },
  };

  /**
   * Record a request, and throw for it when the server is set to.
   * @param call The request, as `operation:argument`.
   */
  function answer(call: string): void {
    server.calls.push(call);
    if (server.throwing) throw new Error(`fake user-data server threw on ${call}`);
  }

  return server;
}
