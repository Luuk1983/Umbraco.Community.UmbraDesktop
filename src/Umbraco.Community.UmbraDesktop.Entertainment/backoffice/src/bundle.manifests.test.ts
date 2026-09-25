import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { MINESWEEPER_CONTENT_SIZE, MINESWEEPER_MIN_CONTENT_SIZE } from './minesweeper/constants.js';
import { SNAKE_CONTENT_SIZE, SNAKE_MIN_CONTENT_SIZE } from './snake/constants.js';

/**
 * What the manifest promises the desktop, asserted where it can be read without a desktop.
 *
 * Only the claims that were wrong once. The rest of §2 of the guide is checked by the host's own
 * derivation tests, and restating it here would be a second copy of the contract to keep in step.
 */

/** Every `umbraDesktopApp` this package registers. */
const apps = manifests.filter((manifest) => manifest.type === 'umbraDesktopApp');

/** Minesweeper's manifest. */
const minesweeper = apps.find((manifest) => manifest.alias === 'Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper');

/** Snake's manifest. */
const snake = apps.find((manifest) => manifest.alias === 'Umbraco.Community.UmbraDesktop.Entertainment.Snake');

it('registers Minesweeper and Snake as desktop apps, each with a lazy element loader', () => {
  expect(minesweeper, 'the package should register Minesweeper as a umbraDesktopApp').to.not.equal(undefined);
  expect(snake, 'the package should register Snake as a umbraDesktopApp').to.not.equal(undefined);
  for (const app of apps) {
    // `element`, never `js`: `js` is the field every other Umbraco extension type uses for this, it
    // type-checks here, and the desktop does not read it.
    expect(typeof (app as { element?: unknown }).element, `${app.alias} declared through \`element\`, as a loader`).to.equal(
      'function',
    );
  }
});

it('puts every game in the games group, in a fixed order', () => {
  for (const app of apps) {
    expect((app as { meta?: { group?: string } }).meta?.group, app.alias).to.equal('games');
  }
  // Umbraco's weight sorts higher first, so Minesweeper leads.
  expect(minesweeper?.weight ?? 0).to.be.greaterThan(snake?.weight ?? 0);
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
  for (const app of apps) {
    expect(
      (app as { meta?: { allowMultiple?: boolean } }).meta?.allowMultiple,
      'every other app on this desktop opens as many windows as the user wants, and there is no ' +
        'shared state between two boards for a second window to disturb',
    ).to.not.equal(false);
  }
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

/** Snake's sizes, pinned to its constants for the same reason as Minesweeper's. */
it("asks for Snake's content size, leaving the chrome to the host", () => {
  const meta = (snake as { meta?: { defaultSize?: unknown; minSize?: unknown } }).meta;
  expect(meta?.defaultSize).to.deep.equal(SNAKE_CONTENT_SIZE);
  expect(meta?.minSize).to.deep.equal(SNAKE_MIN_CONTENT_SIZE);
});

/**
 * Both games keep their windows the size they open at, as Minesweeper did on every Windows up to
 * XP. Neither board reflows, so a bigger window was only ever a bigger empty margin around it.
 */
it('opens every game in a window that cannot be resized or maximized', () => {
  for (const app of apps) {
    expect((app as { meta?: { resizable?: boolean } }).meta?.resizable, app.alias).to.equal(false);
  }
});
