import { expect } from '@open-wc/testing';
import { backofficeThemeName, backofficeThemes } from './backoffice-themes';

/**
 * The backoffice's own themes are extensions, so what this module turns into a picker is whatever
 * the registry happens to hold — three on a stock site, more on one that ships its own, fewer on one
 * that removed a shipped theme. Everything here is about surviving that: an order that does not
 * depend on who registered first, and a name lookup that has an answer for an alias nothing
 * registers.
 */

/** The three core ships, with the weights core gives them. */
const core = [
  { alias: 'umb-light-theme', name: 'Light', weight: 300 },
  { alias: 'umb-dark-theme', name: 'Dark (Experimental)', weight: 200 },
  { alias: 'umb-high-contrast-theme', name: 'High contrast (Experimental)', weight: 100 },
];

it('orders the themes by weight, heaviest first', () => {
  // The registry's own `byType` observable does not sort — it filters and nothing else — so a site
  // registering its own theme before core's would otherwise put it above Light for no reason the
  // user can see. Weight is what the manifests use to say where a theme belongs.
  const shuffled = [core[2], core[0], core[1]];

  expect(backofficeThemes(shuffled).map((theme) => theme.alias)).to.deep.equal([
    'umb-light-theme',
    'umb-dark-theme',
    'umb-high-contrast-theme',
  ]);
});

it('puts a theme with no weight last, and keeps registration order among equals', () => {
  // Weight is optional on a manifest, and a package that leaves it off is not asking to outrank
  // Light. Two themes that say the same thing about themselves keep the order they arrived in,
  // which is the only order left that is not arbitrary.
  const extra = { alias: 'acme-first', name: 'Acme First' };
  const also = { alias: 'acme-second', name: 'Acme Second' };

  expect(backofficeThemes([extra, ...core, also]).map((theme) => theme.alias)).to.deep.equal([
    'umb-light-theme',
    'umb-dark-theme',
    'umb-high-contrast-theme',
    'acme-first',
    'acme-second',
  ]);
});

it('carries only what a picker row needs', () => {
  expect(backofficeThemes([core[0]])).to.deep.equal([{ alias: 'umb-light-theme', name: 'Light' }]);
});

it('has an empty list for a backoffice with no themes registered', () => {
  // Not reachable on a stock site, and the picker still has to render rather than throw: the
  // registry is empty for a frame on boot, and an isolated test page never fills it at all.
  expect(backofficeThemes([])).to.deep.equal([]);
});

it('names the theme in use', () => {
  expect(backofficeThemeName(backofficeThemes(core), 'umb-dark-theme')).to.equal('Dark (Experimental)');
});

it('names nothing for an alias no longer registered', () => {
  // `localStorage` outlives the extension that wrote it: a site can drop a theme package with its
  // alias still stored. The row shows no name rather than a stale one, which is the truth — core
  // has already fallen back to no stylesheet at all.
  expect(backofficeThemeName(backofficeThemes(core), 'acme-gone')).to.equal(undefined);
  expect(backofficeThemeName([], 'umb-light-theme')).to.equal(undefined);
});
