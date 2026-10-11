import { expect } from '@open-wc/testing';
import { loadHelpProducts, type UmbraDesktopDocsFetcher } from './help-loader.js';

/**
 * A fetcher over an in-memory site.
 * @param site URL path to content, for every file.
 * @returns The fetcher, and the URLs it was asked for.
 */
function fakeSite(site: Record<string, string>): UmbraDesktopDocsFetcher & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async list(path) {
      const prefix = `${path}/`;
      const files = Object.keys(site).filter((url) => url.startsWith(prefix)).map((url) => url.slice(prefix.length));
      return files.length ? files : undefined;
    },
    async read(url) {
      reads.push(url);
      return site[url];
    },
  };
}

const page = (id: string) => `---\nid: ${id}\ntitle: ${id}\n---\n\n# ${id}\n`;
const source = (manifestAlias: string, path: string, manifestWeight = 0) => ({ manifestAlias, manifestWeight, path });

describe('loadHelpProducts', () => {
  it('loads each registered folder into a product', async () => {
    const site = fakeSite({
      '/App_Plugins/A/docs/product.json': '{"id":"a","name":"Alpha"}',
      '/App_Plugins/A/docs/user/README.md': page('user-guide'),
    });
    const { products, reports } = await loadHelpProducts([source('A.Docs', '/App_Plugins/A/docs')], site);
    expect(products.map((p) => p.id)).to.deep.equal(['a']);
    expect(products[0].pageById.has('user-guide')).to.equal(true);
    expect(reports).to.deep.equal([]);
  });

  it('orders products by manifest weight, then name, which is how a package puts its docs first', async () => {
    const site = fakeSite({
      '/App_Plugins/A/docs/product.json': '{"id":"a","name":"Zeta"}',
      '/App_Plugins/B/docs/product.json': '{"id":"b","name":"Alpha"}',
      '/App_Plugins/C/docs/product.json': '{"id":"c","name":"Beta"}',
    });
    const { products } = await loadHelpProducts(
      [source('A', '/App_Plugins/A/docs', 100), source('B', '/App_Plugins/B/docs'), source('C', '/App_Plugins/C/docs')],
      site,
    );
    expect(products.map((p) => p.name)).to.deep.equal(['Zeta', 'Alpha', 'Beta']);
  });

  it('reports a folder that cannot be listed or has no usable product.json, and loads the rest', async () => {
    const site = fakeSite({
      '/App_Plugins/Bad/docs/product.json': '{"name":"no id"}',
      '/App_Plugins/Good/docs/product.json': '{"id":"good"}',
    });
    const { products, reports } = await loadHelpProducts(
      [source('Missing', '/App_Plugins/Missing/docs'), source('Bad', '/App_Plugins/Bad/docs'), source('Good', '/App_Plugins/Good/docs')],
      site,
    );
    expect(products.map((p) => p.id)).to.deep.equal(['good']);
    expect(reports.map((r) => r.message)).to.deep.equal([
      '[UmbraDesktop] Docs "Missing": /App_Plugins/Missing/docs could not be listed, so the Help app leaves it out.',
      '[UmbraDesktop] Docs "Bad": /App_Plugins/Bad/docs/product.json is missing or has no "id", so the Help app leaves it out.',
    ]);
  });

  it('passes on the pages a product left out', async () => {
    const site = fakeSite({
      '/App_Plugins/A/docs/product.json': '{"id":"a"}',
      '/App_Plugins/A/docs/user/x.md': '# No id\n',
    });
    const { reports } = await loadHelpProducts([source('A', '/App_Plugins/A/docs')], site);
    expect(reports.map((r) => r.message)).to.deep.equal([
      '[UmbraDesktop] Docs "A": user/x.md has no id in its front matter, so it is left out of Help',
    ]);
  });

  it('keeps one product per id, the catalogue way', async () => {
    const site = fakeSite({
      '/App_Plugins/A/docs/product.json': '{"id":"same"}',
      '/App_Plugins/B/docs/product.json': '{"id":"same"}',
    });
    const { products, reports } = await loadHelpProducts([source('A', '/App_Plugins/A/docs'), source('B', '/App_Plugins/B/docs', 5)], site);
    expect(products.map((p) => p.basePath)).to.deep.equal(['/App_Plugins/B/docs']);
    expect(reports).to.have.length(1);
  });

  it('reads files under the folder, never an escaped path', async () => {
    const site = fakeSite({ '/App_Plugins/A/docs/product.json': '{"id":"a"}' });
    await loadHelpProducts([source('A', '/App_Plugins/A/docs')], site);
    expect(site.reads).to.deep.equal(['/App_Plugins/A/docs/product.json']);
  });
});
