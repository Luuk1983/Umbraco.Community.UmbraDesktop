import { expect } from '@open-wc/testing';
import { normaliseRegisteredApps } from './registered-apps';
import { deriveApps } from './derive-apps';
import { groupApps } from './group-apps';
import type { ManifestUmbraDesktopApp } from './app.extension';

const loader = async () => ({});

function manifest(over: Partial<ManifestUmbraDesktopApp> = {}): ManifestUmbraDesktopApp {
  return {
    type: 'umbraDesktopApp',
    alias: 'Pkg.Minesweeper',
    element: loader,
    meta: { label: '#pkg_minesweeper' },
    ...over,
  } as ManifestUmbraDesktopApp;
}

/**
 * The loader must come through **by reference**, which is why the last assertion below is an
 * identity check and must stay one rather than relaxing to "is a function".
 *
 * `umbradesktop-app-host` remounts when its `load` property changes, and it compares by function
 * identity. Derivation re-runs on every registry emission, so wrapping the manifest's loader in a
 * fresh closure here would hand the host a new function each time and remount every open app: a
 * game would lose its board because an unrelated package finished registering. Passing the
 * manifest's own function through keeps identity stable for as long as the manifest is registered.
 */
it('carries alias, label, icon and the element loader through', () => {
  const [app] = normaliseRegisteredApps([
    manifest({ meta: { label: '#pkg_minesweeper', icon: 'icon-bomb', group: 'games' } }),
  ]);
  expect(app.alias).to.equal('Pkg.Minesweeper');
  expect(app.name).to.equal('#pkg_minesweeper');
  expect(app.icon).to.equal('icon-bomb');
  expect(app.group).to.equal('games');
  expect(app.element, 'must be the manifest loader itself, not a wrapper').to.equal(loader);
});

it('defaults a missing icon to icon-box, the same fallback the catalogue uses', () => {
  const [app] = normaliseRegisteredApps([manifest()]);
  expect(app.icon).to.equal('icon-box');
});

it('falls back to the manifest name, then the alias, when meta has no label', () => {
  const [named] = normaliseRegisteredApps([
    manifest({ name: 'Minesweeper', meta: { label: undefined as unknown as string } }),
  ]);
  expect(named.name).to.equal('Minesweeper');
  const [bare] = normaliseRegisteredApps([
    manifest({ name: undefined, meta: { label: undefined as unknown as string } }),
  ]);
  expect(bare.name).to.equal('Pkg.Minesweeper');
});

it('carries sizes and allowMultiple through, and inverts the weight', () => {
  const [app] = normaliseRegisteredApps([
    manifest({
      weight: 20,
      meta: {
        label: 'x',
        defaultSize: { w: 360, h: 460 },
        minSize: { w: 320, h: 400 },
        allowMultiple: false,
      },
    }),
  ]);
  // Negated, not copied: see the ordering case below for why, and `registered-apps.ts` for the
  // full reasoning. A test that expected 20 here would be pinning the bug.
  expect(app.weight).to.equal(-20);
  expect(app.defaultSize).to.deep.equal({ w: 360, h: 460 });
  expect(app.minSize).to.deep.equal({ w: 320, h: 400 });
  expect(app.allowMultiple).to.be.false;
});

/** No weight at all must stay absent rather than becoming `-0`, so the launcher's own default wins. */
it('leaves an unset weight unset', () => {
  const [app] = normaliseRegisteredApps([manifest()]);
  expect(app.weight).to.be.undefined;
});

/**
 * The whole reason the weight is negated, asserted end to end because that is the only level the
 * claim can be made at: normalise, derive, group, and read the launcher's order.
 *
 * A package author writes `weight: 1000` to mean "put me first", because that is what root `weight`
 * means everywhere else in Umbraco: the registry sorts manifests with
 * `(b.weight || 0) - (a.weight || 0)`, higher first. The desktop's internal scale runs the other
 * way (`group-apps.ts` sorts ascending, matching the curated catalogue's own numbers), so carrying
 * the manifest's number across unchanged put that author last in their group with nothing to warn
 * them. Honouring Umbraco's meaning is the only choice that is not a trap, so the inversion happens
 * once, here, at the boundary between the two scales.
 */
it('puts the higher manifest weight first in the launcher, as Umbraco means it', () => {
  const registered = normaliseRegisteredApps([
    manifest({ alias: 'Pkg.Second', weight: 10, meta: { label: 'second', group: 'games' } }),
    manifest({ alias: 'Pkg.First', weight: 1000, meta: { label: 'first', group: 'games' } }),
  ]);
  const [games] = groupApps(deriveApps([], [], [], registered), [{ alias: 'games', label: '#games' }]);
  expect(games.apps.map((a) => a.alias)).to.deep.equal(['Pkg.First', 'Pkg.Second']);
});

it('drops a manifest with no element loader rather than opening an empty window', () => {
  const apps = normaliseRegisteredApps([
    manifest({ element: undefined as unknown as ManifestUmbraDesktopApp['element'] }),
  ]);
  expect(apps).to.deep.equal([]);
});

/**
 * A **module path string** is a first-class form of `element`, and the only one a static
 * `umbraco-package.json` can express: a JSON file cannot hold a function. It used to be dropped
 * here by a `typeof manifest.element !== 'function'` guard, which silently excluded precisely the
 * packages this feature exists for, so the string has to survive normalisation untouched for
 * Umbraco's resolver to import later.
 */
it('keeps a manifest whose element is a module path string', () => {
  const [app] = normaliseRegisteredApps([manifest({ element: '/App_Plugins/pkg/game.js' })]);
  expect(app, 'a path is a legal element, not a missing one').to.not.be.undefined;
  expect(app.element).to.equal('/App_Plugins/pkg/game.js');
});

/**
 * A **class constructor** is legal too, and used to be the worse of the two failures: it passed the
 * `typeof === 'function'` guard, so the app reached the launcher typed as a loader and the host then
 * *called* it, turning `TypeError: Class constructor cannot be invoked without 'new'` into a tile
 * that permanently said the app could not be loaded. Nothing here has to tell the forms apart any
 * more; it passes the value on and `loadManifestElement` decides.
 */
it('keeps a manifest whose element is a class constructor', () => {
  class GameElement extends HTMLElement {}
  const [app] = normaliseRegisteredApps([manifest({ element: GameElement })]);
  expect(app.element).to.equal(GameElement);
});

/**
 * The guard rejects only what genuinely cannot yield an element. An empty string is that: it is a
 * path to nothing, and `import('')` fails at a point where the only surface left is a broken tile.
 */
it('drops a manifest whose element is an empty string', () => {
  expect(normaliseRegisteredApps([manifest({ element: '' })])).to.deep.equal([]);
});
