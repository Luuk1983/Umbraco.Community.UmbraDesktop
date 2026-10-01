import { expect } from '@open-wc/testing';
import { buildHelpProduct } from './help-product.js';
import { helpImageUrl, resolveHelpLink } from './help-links.js';

const page = (id: string) => `---\nid: ${id}\ntitle: ${id}\n---\n\n# ${id}\n\n## Part two\n`;

const desktop = buildHelpProduct(
  '/App_Plugins/Desktop/docs',
  new Map(
    Object.entries({
      'product.json': JSON.stringify({ id: 'umbradesktop', repository: 'https://github.com/o/r', docsRoot: 'docs', ref: 'abc123' }),
      'user/README.md': page('user-guide'),
      'user/windows/README.md': page('windows'),
      'user/windows/snapping.md': page('snapping'),
      'user/settings/reopening-windows.md': page('reopening-windows'),
      'developer/theming.md': page('theming'),
    }),
  ),
)!;

const addon = buildHelpProduct(
  '/App_Plugins/Addon/docs',
  new Map(
    Object.entries({
      'product.json': JSON.stringify({ id: 'entertainment', repository: 'https://github.com/o/r', docsRoot: 'src/Addon/docs' }),
      'user/games.md': page('games'),
    }),
  ),
)!;

const noRepo = buildHelpProduct(
  '/App_Plugins/Plain/docs',
  new Map(Object.entries({ 'product.json': JSON.stringify({ id: 'plain' }), 'user/a.md': page('a') })),
)!;

const products = [desktop, addon, noRepo];
const from = { product: desktop, page: desktop.pageById.get('snapping')! };

describe('resolveHelpLink', () => {
  it('1. scrolls within the page for an anchor', () => {
    expect(resolveHelpLink('#part-two', from, products)).to.deep.equal({ kind: 'anchor', heading: 'part-two' });
  });

  it('2. opens a published page for a relative link, with its heading', () => {
    expect(resolveHelpLink('../settings/reopening-windows.md#part-two', from, products)).to.deep.equal({
      kind: 'page',
      product: 'umbradesktop',
      page: 'reopening-windows',
      heading: 'part-two',
    });
    expect(resolveHelpLink('../../developer/theming.md', from, products)).to.deep.equal({
      kind: 'page',
      product: 'umbradesktop',
      page: 'theming',
    });
  });

  it('2. opens a category front page for a link to its folder or its README', () => {
    expect(resolveHelpLink('README.md', from, products)).to.deep.equal({ kind: 'page', product: 'umbradesktop', page: 'windows' });
    expect(resolveHelpLink('../windows/', from, products)).to.deep.equal({ kind: 'page', product: 'umbradesktop', page: 'windows' });
  });

  it('3. opens another installed product for a GitHub link into its docs, whatever branch or tag it names', () => {
    const fromAddon = { product: addon, page: addon.pageById.get('games')! };
    expect(
      resolveHelpLink('https://github.com/o/r/blob/main/docs/user/settings/reopening-windows.md', fromAddon, products),
    ).to.deep.equal({ kind: 'page', product: 'umbradesktop', page: 'reopening-windows' });
    expect(resolveHelpLink('https://github.com/o/r/blob/v17.3.0/docs/developer/theming.md#part-two', fromAddon, products)).to.deep.equal({
      kind: 'page',
      product: 'umbradesktop',
      page: 'theming',
      heading: 'part-two',
    });
  });

  it('3. leaves a GitHub link to a page that is not published as a link to GitHub', () => {
    const url = 'https://github.com/o/r/blob/main/docs/design/x.md';
    expect(resolveHelpLink(url, from, products)).to.deep.equal({ kind: 'external', url });
  });

  it('4. opens an unpublished file on GitHub at the commit the docs were built from', () => {
    expect(resolveHelpLink('../../design/2026-09-30-help-app-design.md', from, products)).to.deep.equal({
      kind: 'external',
      url: 'https://github.com/o/r/blob/abc123/docs/design/2026-09-30-help-app-design.md',
    });
    expect(resolveHelpLink('../../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts', from, products)).to.deep.equal({
      kind: 'external',
      url: 'https://github.com/o/r/blob/abc123/src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts',
    });
  });

  it('4. falls back to main without a ref, and to nothing without a repository', () => {
    const fromAddon = { product: addon, page: addon.pageById.get('games')! };
    expect(resolveHelpLink('../README-src.md', fromAddon, products)).to.deep.equal({
      kind: 'external',
      url: 'https://github.com/o/r/blob/main/src/Addon/docs/README-src.md',
    });
    const fromPlain = { product: noRepo, page: noRepo.pageById.get('a')! };
    expect(resolveHelpLink('../design/x.md', fromPlain, products)).to.deep.equal({ kind: 'none' });
  });

  it('5. opens anything else in a new tab', () => {
    expect(resolveHelpLink('https://www.nuget.org/packages/X', from, products)).to.deep.equal({
      kind: 'external',
      url: 'https://www.nuget.org/packages/X',
    });
    expect(resolveHelpLink('mailto:a@b.test', from, products)).to.deep.equal({ kind: 'external', url: 'mailto:a@b.test' });
  });

  it('refuses a scheme that could run code', () => {
    expect(resolveHelpLink('javascript:alert(1)', from, products)).to.deep.equal({ kind: 'none' });
    expect(resolveHelpLink('data:text/html,x', from, products)).to.deep.equal({ kind: 'none' });
  });
});

describe('helpImageUrl', () => {
  it('resolves an image against the page, under the product folder', () => {
    expect(helpImageUrl('../../screenshots/snap.png', from)).to.equal('/App_Plugins/Desktop/docs/screenshots/snap.png');
  });

  it('keeps an absolute image as it is, and refuses one that climbs out of the folder', () => {
    expect(helpImageUrl('https://img.shields.io/x', from)).to.equal('https://img.shields.io/x');
    expect(helpImageUrl('../../../x.png', from)).to.equal(undefined);
  });
});
