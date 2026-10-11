import { expect } from '@open-wc/testing';
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { createStickyNotesApi } from './api.js';

/**
 * The client against the backoffice's HTTP client **as it behaves in a running backoffice**, which
 * is not how its types read: every error status arrives as a thrown problem details object, not as
 * an `{ error }` result. Found by running Sticky Notes against a real Umbraco, where a 409 threw
 * `{ status: 409, title: "Conflict" }` and the conflict dialog never appeared.
 *
 * Each case stands in for one call by replacing that method on the shared client, and puts it back.
 */

type Method = 'get' | 'post' | 'put' | 'delete';

/**
 * Make one client method throw `thrown`, as the backoffice's interceptors do, for one case.
 * @param method The method.
 * @param thrown What it throws.
 */
function throwsFrom(method: Method, thrown: unknown): void {
  const client = umbHttpClient as unknown as Record<Method, unknown>;
  let original: unknown;
  // In hooks rather than straight away: a describe's body runs when the file loads, so a stub
  // installed there would be overwritten by the next describe's before any test ran.
  before(() => {
    original = client[method];
    client[method] = async () => {
      throw thrown;
    };
  });
  after(() => (client[method] = original));
}

const current = { key: 'k', text: 'theirs', colour: 'yellow', updatedBy: 'Grace', updatedAt: '2026-09-24T10:00:00Z', version: 2 };

describe('conflict', () => {
  throwsFrom('put', { type: 'StickyNoteConflict', title: 'Somebody else changed this note', status: 409, note: current });
  it('reads a thrown 409 as a conflict, with the other person’s note', async () => {
    expect(await createStickyNotesApi().update('k', 'mine', 'yellow', 1)).to.deep.equal({ status: 'conflict', note: current });
  });
});

describe('not found', () => {
  throwsFrom('put', { type: 'NotFound', title: 'Not Found', status: 404 });
  it('reads a thrown 404 as a note deleted elsewhere', async () => {
    expect(await createStickyNotesApi().update('k', 'mine', 'yellow', 1)).to.deep.equal({ status: 'notFound' });
  });
});

describe('server error', () => {
  throwsFrom('put', { type: 'ServerError', title: 'Boom', status: 500 });
  it('reads anything else as a failure to retry, never as an exception', async () => {
    expect(await createStickyNotesApi().update('k', 'mine', 'yellow', 1)).to.deep.equal({ status: 'failed' });
  });
});

describe('unreachable', () => {
  throwsFrom('get', new TypeError('Failed to fetch'));
  it('reads a board that cannot be loaded as undefined', async () => {
    expect(await createStickyNotesApi().list()).to.equal(undefined);
  });
});

describe('delete of a note already gone', () => {
  throwsFrom('delete', { type: 'NotFound', title: 'Not Found', status: 404 });
  it('counts it as deleted', async () => {
    expect(await createStickyNotesApi().remove('k')).to.equal(true);
  });
});

describe('move of a note already gone', () => {
  throwsFrom('put', { type: 'NotFound', title: 'Not Found', status: 404 });
  it('reports that nothing was moved', async () => {
    expect(await createStickyNotesApi().move('k', undefined)).to.equal(false);
  });
});
