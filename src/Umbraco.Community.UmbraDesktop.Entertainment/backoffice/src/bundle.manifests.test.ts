import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { MINESWEEPER_CONTENT_SIZE, MINESWEEPER_MIN_CONTENT_SIZE } from './minesweeper/constants.js';
import { SNAKE_CONTENT_SIZE, SNAKE_MIN_CONTENT_SIZE } from './snake/constants.js';
import { SOLITAIRE_CONTENT_SIZE, SOLITAIRE_MIN_CONTENT_SIZE } from './solitaire/constants.js';
import en from './localization/en.js';
import nl from './localization/nl.js';

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

/** Solitaire's manifest. */
const solitaire = apps.find((manifest) => manifest.alias === 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire');

it('registers Minesweeper, Snake and Solitaire as desktop apps, each with a lazy element loader', () => {
  expect(minesweeper, 'the package should register Minesweeper as a umbraDesktopApp').to.not.equal(undefined);
  expect(snake, 'the package should register Snake as a umbraDesktopApp').to.not.equal(undefined);
  expect(solitaire, 'the package should register Solitaire as a umbraDesktopApp').to.not.equal(undefined);
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
  expect(snake?.weight ?? 0).to.be.greaterThan(solitaire?.weight ?? 0);
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
 * Minesweeper and Snake keep their windows the size they open at, as Minesweeper did on every
 * Windows up to XP. Neither board reflows, so a bigger window was only ever a bigger empty margin
 * around it.
 */
it('keeps Minesweeper and Snake at a fixed size', () => {
  for (const app of [minesweeper, snake]) {
    expect((app as { meta?: { resizable?: boolean } }).meta?.resizable, app?.alias).to.equal(false);
  }
});

/** A card table has no fixed pixel size: the cards scale with the window (design D5). */
it('lets Solitaire be resized, from its derived minimum', () => {
  const meta = (solitaire as { meta?: { resizable?: boolean; defaultSize?: unknown; minSize?: unknown } }).meta;
  expect(meta?.resizable).to.not.equal(false);
  expect(meta?.defaultSize).to.deep.equal(SOLITAIRE_CONTENT_SIZE);
  expect(meta?.minSize).to.deep.equal(SOLITAIRE_MIN_CONTENT_SIZE);
});

it('registers the built-in card backs and face set through their own manifest types', () => {
  expect(manifests.filter((m) => m.type === 'umbraDesktopSolitaireBack').length).to.equal(5);
  expect(manifests.filter((m) => m.type === 'umbraDesktopSolitaireFaces').length).to.equal(1);
});

/** Every `umbraDesktopGame` this package registers, as the Arcade will read them. */
const games = manifests.filter((m) => m.type === 'umbraDesktopGame') as unknown as Array<{
  alias: string;
  meta: { app: string; leaderboards: Array<{ alias: string; better: string; format: string }> };
}>;

it('puts all three games on the Arcade, each linked to its app', () => {
  expect(games.map((g) => [g.alias, g.meta.app])).to.deep.equal([
    ['Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper.Game', 'Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper'],
    ['Umbraco.Community.UmbraDesktop.Entertainment.Snake.Game', 'Umbraco.Community.UmbraDesktop.Entertainment.Snake'],
    ['Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Game', 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire'],
  ]);
});

it('scores Minesweeper as a time, Snake and Solitaire as points', () => {
  expect(games.map((g) => g.meta.leaderboards.map((b) => `${b.alias}:${b.better}:${b.format}`))).to.deep.equal([
    ['easy:lower:time'],
    ['default:higher:points'],
    ['draw-1:higher:points', 'draw-3:higher:points'],
  ]);
});

/**
 * Solitaire says how it is won itself (settled point 8): the rule the Arcade would derive from its
 * boards, "Highest score wins", leaves out the time bonus that decides most games.
 */
it("gives Solitaire's boards their own rule line, from a key both dictionaries have", () => {
  const rules = games.map((g) => (g.meta as { rule?: string }).rule);
  expect(rules).to.deep.equal([undefined, undefined, '#umbraDesktopEntertainment_solitaireRule']);
  for (const dictionary of [en, nl]) {
    expect(typeof (dictionary.umbraDesktopEntertainment as Record<string, unknown>).solitaireRule, 'the key is there').to.equal('string');
  }
});

it('no longer defines the Games group, which the Arcade owns', () => {
  expect(manifests.filter((m) => m.type === 'umbraDesktopCatalogue')).to.deep.equal([]);
});
