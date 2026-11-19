import { expect } from '@open-wc/testing';
import { markClientReady, whenClientReady } from './client-ready.js';

/**
 * Whether a promise has settled yet, without waiting for it to.
 * @param promise The promise to look at.
 * @returns True when it has already resolved.
 */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => (done = true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
}

describe('waiting for the API client to be configured', () => {
  it('holds a caller until the entry point says the client is configured, then lets every caller go', async () => {
    const early = whenClientReady();
    expect(await settled(early)).to.equal(false);

    markClientReady();

    expect(await settled(early)).to.equal(true);
    expect(await settled(whenClientReady())).to.equal(true);
  });

  it('takes a second mark without complaint, since every window frame runs the entry point again', () => {
    expect(() => markClientReady()).not.to.throw();
  });
});
