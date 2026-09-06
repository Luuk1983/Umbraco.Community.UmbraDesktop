import { expect } from '@open-wc/testing';
import { normaliseRegisteredApps } from './registered-apps';
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

it('carries sizes, weight and allowMultiple through', () => {
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
  expect(app.weight).to.equal(20);
  expect(app.defaultSize).to.deep.equal({ w: 360, h: 460 });
  expect(app.minSize).to.deep.equal({ w: 320, h: 400 });
  expect(app.allowMultiple).to.be.false;
});

it('drops a manifest with no element loader rather than opening an empty window', () => {
  const apps = normaliseRegisteredApps([
    manifest({ element: undefined as unknown as ManifestUmbraDesktopApp['element'] }),
  ]);
  expect(apps).to.deep.equal([]);
});
