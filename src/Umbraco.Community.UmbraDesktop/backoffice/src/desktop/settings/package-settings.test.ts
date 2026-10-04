import { expect } from '@open-wc/testing';
import { normalisePackageSettings } from './package-settings.js';

/**
 * Package settings arrive as third-party JSON, from a static `umbraco-package.json` that nothing
 * type-checks or a bundle built against a stale copy of the types. Everything here is about what
 * survives, how it is grouped, and that nothing throws.
 */

const loader = async () => ({});

/** A valid manifest, with anything the case wants changed. */
const manifest = (over: Record<string, unknown> = {}) => ({
  type: 'umbraDesktopPackageSettings',
  alias: 'Pkg.Box',
  name: 'Box',
  element: loader,
  meta: { package: 'My Package', label: 'General' },
  ...over,
});

it('groups manifests with the same package into one package with a box each', () => {
  const { packages } = normalisePackageSettings([
    manifest({ alias: 'A' }),
    manifest({ alias: 'B', meta: { package: 'My Package', label: 'Other' } }),
  ]);
  expect(packages.map((p) => [p.name, p.boxes.map((b) => b.alias)])).to.deep.equal([['My Package', ['A', 'B']]]);
});

it('sorts packages by name', () => {
  const { packages } = normalisePackageSettings([
    manifest({ alias: 'Z', meta: { package: 'Zebra tools', label: 'x' } }),
    manifest({ alias: 'A', meta: { package: 'apple tools', label: 'x' } }),
  ]);
  expect(packages.map((p) => p.name)).to.deep.equal(['apple tools', 'Zebra tools']);
});

it('orders boxes by weight, higher first, then by alias', () => {
  const { packages } = normalisePackageSettings([
    manifest({ alias: 'Low', weight: 1 }),
    manifest({ alias: 'High', weight: 100 }),
    manifest({ alias: 'B-unset' }),
    manifest({ alias: 'A-unset' }),
  ]);
  expect(packages[0].boxes.map((b) => b.alias)).to.deep.equal(['High', 'Low', 'A-unset', 'B-unset']);
});

it('trims the package name, so a stray space does not make a second row', () => {
  const { packages } = normalisePackageSettings([
    manifest({ alias: 'A', meta: { package: 'My Package ', label: 'x' } }),
    manifest({ alias: 'B', meta: { package: 'My Package', label: 'y' } }),
  ]);
  expect(packages.map((p) => p.name)).to.deep.equal(['My Package']);
});

for (const [why, over, reason] of [
  ['no meta', { meta: undefined }, 'no "meta"'],
  ['meta that is not an object', { meta: 'nope' }, 'no "meta"'],
  ['no package', { meta: { label: 'x' } }, '"meta.package"'],
  ['an empty package', { meta: { package: '  ', label: 'x' } }, '"meta.package"'],
  ['no label', { meta: { package: 'P' } }, '"meta.label"'],
  ['no element', { element: undefined }, '"element"'],
  ['the desktop’s own name', { meta: { package: ' umbradesktop ', label: 'x' } }, 'UmbraDesktop'],
] as const) {
  it(`drops a manifest with ${why}, and names it in the report`, () => {
    const { packages, reports } = normalisePackageSettings([manifest(over)]);
    expect(packages).to.deep.equal([]);
    expect(reports.map((r) => r.message).join('\n')).to.contain('"Pkg.Box"').and.to.contain(reason);
  });
}

it('says to rename "js" when a manifest has no element but has a js', () => {
  const { reports } = normalisePackageSettings([manifest({ element: undefined, js: loader })]);
  expect(reports[0].message).to.contain('"js"').and.to.contain('"element"');
});

it('reports a weight that is not a number, and treats it as unset', () => {
  const { packages, reports } = normalisePackageSettings([manifest({ weight: '10' })]);
  expect(packages[0].boxes[0].weight).to.equal(0);
  expect(reports[0].message).to.contain('"weight"');
});

it('never throws, whatever it is handed', () => {
  expect(() => normalisePackageSettings([null, 42, 'x', [], { alias: 1 }, manifest()])).to.not.throw();
});

it('gives each report a stable key, so it prints once', () => {
  const first = normalisePackageSettings([manifest({ meta: undefined })]).reports;
  const second = normalisePackageSettings([manifest({ meta: undefined })]).reports;
  expect(first.map((r) => r.key)).to.deep.equal(second.map((r) => r.key));
});
