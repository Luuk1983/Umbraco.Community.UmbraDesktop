import { expect } from '@open-wc/testing';
import { buildHelpProduct } from './help-product.js';
import { helpGuides, resolveHelpTarget, type UmbraDesktopHelpPageView } from './help-navigation.js';

const page = (id: string) => `---\nid: ${id}\ntitle: ${id}\n---\n\n# ${id}\n\n## Part two\n`;

const desktop = buildHelpProduct(
  '/a',
  new Map(Object.entries({ 'product.json': '{"id":"umbradesktop","name":"UmbraDesktop"}', 'user/README.md': page('user-guide'), 'user/windows/_category_.json': '{"label":"Windows"}', 'user/windows/snapping.md': page('snapping') })),
)!;
const addon = buildHelpProduct(
  '/b',
  new Map(Object.entries({ 'product.json': '{"id":"entertainment","name":"Entertainment"}', 'user/games.md': page('games') })),
)!;
const empty = buildHelpProduct('/c', new Map(Object.entries({ 'product.json': '{"id":"empty"}' })))!;

/**
 * Resolves a target that has to land on a page, and fails the test when it lands anywhere else.
 * @param target Where to go.
 * @param products The installed products.
 * @returns The page view.
 */
function pageView(target: Parameters<typeof resolveHelpTarget>[1], products = [desktop, addon]): UmbraDesktopHelpPageView {
  const view = resolveHelpTarget(products, target);
  if (view?.kind !== 'page') throw new Error(`expected a page, got ${view?.kind}`);
  return view;
}

describe('resolveHelpTarget', () => {
  it('opens the landing page when there is no target', () => {
    expect(resolveHelpTarget([desktop, addon], undefined)).to.deep.equal({ kind: 'landing' });
  });

  it('opens a page at a heading, with the part and category it is in', () => {
    const view = pageView({ product: 'umbradesktop', page: 'snapping', heading: 'part-two' });
    expect([view.page.id, view.heading, view.part.part, view.category?.label]).to.deep.equal(['snapping', 'part-two', 'user', 'Windows']);
  });

  it('gives a page outside any category no category', () => {
    expect(pageView({ product: 'umbradesktop', page: 'user-guide' }).category).to.equal(undefined);
  });

  it('opens a product alone at its front page', () => {
    expect(pageView({ product: 'entertainment' }).page.id).to.equal('games');
  });

  it('opens an unknown heading at the top of the page, without a notice', () => {
    const view = pageView({ product: 'umbradesktop', page: 'snapping', heading: 'gone' }, [desktop]);
    expect([view.page.id, view.heading, view.notice]).to.deep.equal(['snapping', undefined, undefined]);
  });

  it('opens the product front page for an unknown page, and says the page is not in this version', () => {
    const view = pageView({ product: 'umbradesktop', page: 'from-the-future' }, [desktop]);
    expect(view.page.id).to.equal('user-guide');
    expect(view.notice).to.deep.equal({ kind: 'page-missing', name: 'UmbraDesktop' });
  });

  it('opens the landing page for an unknown product, and says its help is not installed', () => {
    expect(resolveHelpTarget([desktop, addon], { product: 'forms', page: 'x' })).to.deep.equal({
      kind: 'landing',
      notice: { kind: 'product-missing', name: 'forms' },
    });
  });

  it('opens the landing page for a product with no pages at all', () => {
    expect(resolveHelpTarget([empty, addon], { product: 'empty' })!.kind).to.equal('landing');
  });

  it('has nothing to show when no product has a page', () => {
    expect(resolveHelpTarget([], undefined)).to.equal(undefined);
    expect(resolveHelpTarget([empty], { product: 'empty' })).to.equal(undefined);
  });
});

describe('helpGuides', () => {
  it('lists every user guide first and the developer guides after them, as the picker shows them', () => {
    const withDeveloper = buildHelpProduct(
      '/a',
      new Map(
        Object.entries({
          'product.json': '{"id":"umbradesktop","name":"UmbraDesktop"}',
          'user/README.md': page('user-guide'),
          'developer/README.md': page('developer-guide'),
        }),
      ),
    )!;
    expect(helpGuides([withDeveloper, empty, addon]).map((g) => `${g.product.id}/${g.part.part}/${g.part.frontPage!.id}`)).to.deep.equal([
      'umbradesktop/user/user-guide',
      'entertainment/user/games',
      'umbradesktop/developer/developer-guide',
    ]);
  });
});
