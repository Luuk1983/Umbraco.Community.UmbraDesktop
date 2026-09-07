import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { MINESWEEPER_CONTENT_SIZE, MINESWEEPER_MIN_CONTENT_SIZE } from './minesweeper/constants.js';

/**
 * What the manifest promises the desktop, asserted where it can be read without a desktop.
 *
 * Only the claims that were wrong once. The rest of §2 of the guide is checked by the host's own
 * derivation tests, and restating it here would be a second copy of the contract to keep in step.
 */

/** The one `umbraDesktopApp` this package registers. */
const minesweeper = manifests.find((manifest) => manifest.type === 'umbraDesktopApp');

it('registers exactly one desktop app, with a lazy element loader', () => {
  expect(minesweeper, 'the package should register Minesweeper as a umbraDesktopApp').to.not.equal(undefined);
  // `element`, never `js`: `js` is the field every other Umbraco extension type uses for this, it
  // type-checks here, and the desktop does not read it.
  expect(typeof (minesweeper as { element?: unknown }).element, 'declared through `element`, as a loader').to.equal(
    'function',
  );
});

/**
 * Multiple windows are allowed, which is a reversal.
 *
 * It shipped `allowMultiple: false` on the reasoning that two Minesweeper windows are a novelty
 * rather than a feature. That is an opinion about a game, and the desktop's answer everywhere else
 * is that a second window is the user's business: every curated app opens as many as you like, so
 * a game that silently refocuses the window you already had is the one app on the desktop behaving
 * differently, for no benefit anybody asked for. Two boards is also a perfectly reasonable thing
 * to want.
 */
it('lets a player open more than one game at a time', () => {
  expect(
    (minesweeper as { meta?: { allowMultiple?: boolean } }).meta?.allowMultiple,
    'every other app on this desktop opens as many windows as the user wants, and there is no ' +
      'shared state between two boards for a second window to disturb',
  ).to.not.equal(false);
});

/**
 * The sizes are the app's **content** box, so they are the numbers the app derives from its own
 * board and nothing else. Pinned to the constants rather than to literals: a manifest that quietly
 * grew a titlebar allowance again would pass a literal check written on the same day.
 */
it('asks for its content size, leaving the chrome to the host', () => {
  const meta = (minesweeper as { meta?: { defaultSize?: unknown; minSize?: unknown } }).meta;
  expect(meta?.defaultSize, 'the opening size is the content box the board needs').to.deep.equal(
    MINESWEEPER_CONTENT_SIZE,
  );
  expect(meta?.minSize, 'and the floor is the same box, because a 9x9 grid does not reflow').to.deep.equal(
    MINESWEEPER_MIN_CONTENT_SIZE,
  );
});
