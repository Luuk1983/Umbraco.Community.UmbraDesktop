import { expect } from '@open-wc/testing';
import { ALLOWED_LICENCES, licenceProblems, noticeBanner, packageOf } from '../../scripts/licences.mjs';
import type { BundledPackage } from '../../scripts/licences.mjs';

/**
 * The build's licence check: every npm package that ends up in the built JavaScript must be
 * permissively licensed and named in THIRD-PARTY-NOTICES.md, and its notice is stamped on the
 * chunk that holds it. The owner's "make sure we adhere to the MIT license", design D10 and §9.
 */

/** A package as the build reads it, varied per case. */
const pkg = (name: string, version: string, license: string): BundledPackage => ({
  name,
  version,
  license,
  licenseText: `${license} licence text of ${name}`,
});

/** A notices file naming Fabric 7.4.0. */
const NOTICES = '# Third-party notices\n\n## Fabric.js\n\n- fabric@7.4.0\n';

it('allows the permissive licences and nothing else by name', () => {
  expect(ALLOWED_LICENCES).to.deep.equal(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']);
});

it('finds the package a bundled module belongs to', () => {
  expect(packageOf('/x/node_modules/fabric/dist/index.mjs')).to.deep.equal({ name: 'fabric', root: '/x/node_modules/fabric' });
  expect(packageOf('/x/node_modules/@cropper/element/dist/x.js')).to.deep.equal({
    name: '@cropper/element',
    root: '/x/node_modules/@cropper/element',
  });
  expect(packageOf('/x/node_modules/a/node_modules/b/i.js')?.name, 'the nearest node_modules').to.equal('b');
  expect(packageOf('C:\\x\\node_modules\\fabric\\dist\\index.mjs')?.name, 'Windows paths').to.equal('fabric');
  expect(packageOf('/x/src/a.ts')).to.equal(null);
  expect(packageOf('\0vite/preload-helper.js'), "Vite's own helper").to.equal(null);
});

it('passes an MIT package the notices name at its version', () => {
  expect(licenceProblems([pkg('fabric', '7.4.0', 'MIT')], NOTICES)).to.deep.equal([]);
});

it('fails a copyleft package, naming it', () => {
  const problems = licenceProblems([pkg('evil', '1.0.0', 'GPL-3.0')], NOTICES + '- evil@1.0.0\n');
  expect(problems).to.have.length(1);
  expect(problems[0]).to.contain('evil');
  expect(problems[0]).to.contain('GPL-3.0');
});

it('fails a package the notices do not name, or name at another version', () => {
  expect(licenceProblems([pkg('cropperjs', '2.3.1', 'MIT')], NOTICES)[0]).to.contain('cropperjs@2.3.1');
  expect(licenceProblems([pkg('fabric', '7.5.0', 'MIT')], NOTICES)[0]).to.contain('fabric@7.5.0');
});

it('reads an SPDX choice as allowed when one side is, and rejects no licence at all', () => {
  const notices = NOTICES + '- a@1.0.0\n- b@1.0.0\n- c@1.0.0\n- d@1.0.0\n';
  expect(licenceProblems([pkg('a', '1.0.0', '(MIT OR Apache-2.0)')], notices)).to.deep.equal([]);
  expect(licenceProblems([pkg('b', '1.0.0', 'MIT AND GPL-3.0')], notices)).to.have.length(1);
  expect(licenceProblems([pkg('c', '1.0.0', 'UNLICENSED')], notices)).to.have.length(1);
  expect(licenceProblems([pkg('d', '1.0.0', '')], notices)).to.have.length(1);
});

it('stamps every package with its name, version and full licence, sorted by name', () => {
  const banner = noticeBanner([pkg('fabric', '7.4.0', 'MIT'), pkg('@cropper/utils', '2.3.1', 'MIT')]);
  expect(banner.startsWith('/*!')).to.equal(true);
  expect(banner.indexOf('@cropper/utils@2.3.1')).to.be.lessThan(banner.indexOf('fabric@7.4.0'));
  expect(banner).to.contain('MIT licence text of fabric');
  expect(banner).to.contain('MIT licence text of @cropper/utils');
});

it('never lets a licence text end the comment early', () => {
  const banner = noticeBanner([{ ...pkg('x', '1.0.0', 'MIT'), licenseText: 'a */ b' }]);
  expect(banner.match(/\*\//g)).to.have.length(1);
});
