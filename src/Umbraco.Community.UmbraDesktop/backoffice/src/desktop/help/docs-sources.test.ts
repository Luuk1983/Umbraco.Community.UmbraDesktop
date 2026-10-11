import { expect } from '@open-wc/testing';
import { docsFolderPath, normaliseDocsManifests, pickProducts } from './docs-sources.js';

const origin = 'https://example.test';

describe('docsFolderPath', () => {
  it('accepts a folder under /App_Plugins/ and drops a trailing slash', () => {
    expect(docsFolderPath('/App_Plugins/My.Package/docs/', origin)).to.equal('/App_Plugins/My.Package/docs');
  });

  it('accepts an absolute URL on this origin', () => {
    expect(docsFolderPath('https://example.test/App_Plugins/X/docs', origin)).to.equal('/App_Plugins/X/docs');
  });

  it('refuses another origin, another folder, and a path that climbs out once resolved', () => {
    for (const path of ['https://evil.test/App_Plugins/X/docs', '/css', '/App_Plugins/', '/App_Plugins/../css', 'javascript:alert(1)', '']) {
      expect(docsFolderPath(path, origin), path).to.equal(undefined);
    }
  });
});

describe('normaliseDocsManifests', () => {
  it('turns each usable manifest into a source', () => {
    const { sources, reports } = normaliseDocsManifests(
      [{ alias: 'My.Docs', weight: 5, meta: { path: '/App_Plugins/My/docs' } }],
      origin,
    );
    expect(sources).to.deep.equal([{ manifestAlias: 'My.Docs', manifestWeight: 5, path: '/App_Plugins/My/docs' }]);
    expect(reports).to.deep.equal([]);
  });

  it('drops and reports a manifest without a usable path, and never throws', () => {
    const { sources, reports } = normaliseDocsManifests(
      [
        { alias: 'No.Meta' },
        { alias: 'No.Path', meta: {} },
        { alias: 'Bad.Path', meta: { path: '/css' } },
        'not a manifest',
        null,
      ],
      origin,
    );
    expect(sources).to.deep.equal([]);
    expect(reports.map((r) => r.message)).to.deep.equal([
      '[UmbraDesktop] Docs "No.Meta" has no "meta" object, so the Help app cannot find its docs.',
      '[UmbraDesktop] Docs "No.Path" has no "meta.path", so the Help app cannot find its docs.',
      '[UmbraDesktop] Docs "Bad.Path": "meta.path" must be a folder under /App_Plugins/ on this site, and "/css" is not.',
    ]);
    expect(new Set(reports.map((r) => r.key)).size).to.equal(3);
  });

  it('treats a missing or odd weight as 0', () => {
    const { sources } = normaliseDocsManifests([{ alias: 'A', weight: 'high', meta: { path: '/App_Plugins/A/docs' } }], origin);
    expect(sources[0].manifestWeight).to.equal(0);
  });
});

describe('pickProducts', () => {
  const source = (manifestAlias: string, manifestWeight = 0) => ({ manifestAlias, manifestWeight, path: `/App_Plugins/${manifestAlias}/docs` });

  it('keeps one source per product id', () => {
    const { kept, reports } = pickProducts([
      { source: source('A'), productId: 'umbradesktop' },
      { source: source('B'), productId: 'entertainment' },
    ]);
    expect(kept.map((k) => k.source.manifestAlias)).to.deep.equal(['A', 'B']);
    expect(reports).to.deep.equal([]);
  });

  it('lets the higher manifest weight win a shared product id, then the lower alias, and reports the loser', () => {
    const { kept, reports } = pickProducts([
      { source: source('Z.Docs', 10), productId: 'x' },
      { source: source('B.Docs', 20), productId: 'x' },
      { source: source('A.Docs', 20), productId: 'x' },
    ]);
    expect(kept.map((k) => k.source.manifestAlias)).to.deep.equal(['A.Docs']);
    expect(reports.map((r) => r.message)).to.deep.equal([
      '[UmbraDesktop] Docs "B.Docs" and "A.Docs" both describe product "x"; "A.Docs" is shown.',
      '[UmbraDesktop] Docs "Z.Docs" and "A.Docs" both describe product "x"; "A.Docs" is shown.',
    ]);
  });
});
