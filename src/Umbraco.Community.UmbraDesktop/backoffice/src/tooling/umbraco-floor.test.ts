import { expect } from '@open-wc/testing';
import { missingImports, moduleExports, namedImports, rangeFloor, umbracoFloorOf } from '../../scripts/umbraco-floor.mjs';

describe('the Umbraco floor check', () => {
  describe('namedImports', () => {
    it('lists each name a bundle imports from the backoffice, by its exported name', () => {
      const source = `import{a as clearImagingCache,b}from"@umbraco-cms/backoffice/imaging";import { html as h, css } from '@umbraco-cms/backoffice/external/lit';`;
      expect(namedImports(source)).to.deep.equal([
        { module: '@umbraco-cms/backoffice/imaging', name: 'a' },
        { module: '@umbraco-cms/backoffice/imaging', name: 'b' },
        { module: '@umbraco-cms/backoffice/external/lit', name: 'html' },
        { module: '@umbraco-cms/backoffice/external/lit', name: 'css' },
      ]);
    });

    it('ignores imports from anywhere else, and imports that name nothing', () => {
      expect(namedImports(`import { x } from "./chunk.js"; import * as all from "@umbraco-cms/backoffice/lit-element"; import "@umbraco-cms/backoffice/router";`)).to.deep.equal([]);
    });
  });

  describe('moduleExports', () => {
    it('reads the names a minified module exports, under their exported names', () => {
      const { names } = moduleExports(`const q=1;export{q as UMB_THEME_LIGHT_ALIAS,r as clearImagingCache,s};export const UMB_X=1;export function umbY(){}export class UmbZ{}`);
      expect([...names].sort()).to.deep.equal(['UMB_THEME_LIGHT_ALIAS', 'UMB_X', 'UmbZ', 'clearImagingCache', 's', 'umbY'].sort());
    });

    it('collects the modules it re-exports everything from, and the names it re-exports from one', () => {
      const { names, starFrom } = moduleExports(`export * from "./a.js";export*from'../b/index.js';export { c as d } from "./c.js";`);
      expect(starFrom).to.deep.equal(['./a.js', '../b/index.js']);
      expect([...names]).to.deep.equal(['d']);
    });
  });

  describe('rangeFloor', () => {
    it('is the lower bound of a NuGet range', () => {
      expect(rangeFloor('[17.4.0, 17.99999999.0]')).to.equal('17.4.0');
      expect(rangeFloor('[18.0.0,18.99999999.0]')).to.equal('18.0.0');
    });

    it('is the version itself when the dependency is a plain minimum', () => {
      expect(rangeFloor('17.4.0')).to.equal('17.4.0');
    });

    it('is nothing for a range with no lower bound', () => {
      expect(rangeFloor('(, 18.0.0)')).to.equal(undefined);
    });
  });

  describe('umbracoFloorOf', () => {
    const dependency = (id: string, version: string) => `<dependency id="${id}" version="${version}" exclude="Build,Analyzers" />`;

    it('reads the floor from the backoffice dependency, which is what the bundles import from', () => {
      const nuspec = dependency('Umbraco.Cms.Core', '[17.3.0, 17.99999999.0]') + dependency('Umbraco.Cms.StaticAssets', '[17.4.0, 17.99999999.0]');
      expect(umbracoFloorOf(nuspec)).to.equal('17.4.0');
    });

    it('falls back to Umbraco.Cms.Core in a package that does not declare the backoffice', () => {
      expect(umbracoFloorOf(dependency('Umbraco.Cms.Core', '[18.0.0, 18.99999999.0]'))).to.equal('18.0.0');
    });

    it('is nothing for a package that depends on neither', () => {
      expect(umbracoFloorOf(dependency('Umbraco.Cms.Coreish', '[1.0.0, 2.0.0]'))).to.equal(undefined);
    });
  });

  describe('missingImports', () => {
    const exportsOf = (module: string) =>
      ({ '@umbraco-cms/backoffice/imaging': new Set(['getImagingUrl']) })[module as '@umbraco-cms/backoffice/imaging'];

    it('reports a name the module does not export, which stops the importing bundle linking', () => {
      // Found on a fresh Umbraco 17.0.0: clearImagingCache arrived in 17.4, so the desktop never loaded.
      const missing = missingImports([{ module: '@umbraco-cms/backoffice/imaging', name: 'clearImagingCache' }], exportsOf);
      expect(missing).to.deep.equal([{ module: '@umbraco-cms/backoffice/imaging', name: 'clearImagingCache' }]);
    });

    it('reports a module that release does not have at all, once', () => {
      const missing = missingImports(
        [
          { module: '@umbraco-cms/backoffice/preview', name: 'a' },
          { module: '@umbraco-cms/backoffice/preview', name: 'b' },
        ],
        exportsOf,
      );
      expect(missing).to.deep.equal([{ module: '@umbraco-cms/backoffice/preview' }]);
    });

    it('reports nothing when every name is there, each name once however many bundles import it', () => {
      const wanted = [
        { module: '@umbraco-cms/backoffice/imaging', name: 'getImagingUrl' },
        { module: '@umbraco-cms/backoffice/imaging', name: 'getImagingUrl' },
      ];
      expect(missingImports(wanted, exportsOf)).to.deep.equal([]);
    });
  });
});
