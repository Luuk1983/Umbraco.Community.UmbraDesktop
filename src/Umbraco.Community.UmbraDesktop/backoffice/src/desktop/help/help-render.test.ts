import { expect } from '@open-wc/testing';
import { buildHelpProduct } from './help-product.js';
import { renderHelpPage } from './help-render.js';

const body = [
  '# Snapping',
  '',
  'See [the other page](other.md#part), [this part](#on-a-narrow-screen), [NuGet](https://www.nuget.org/x) and [bad](javascript:alert(1)).',
  '',
  '![A window snapped left](../../screenshots/snap.png)',
  '',
  '## On a narrow screen',
  '',
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '<script>window.__pwned = true</script>',
  '<img src="x" onerror="window.__pwned = true">',
  '',
  '## On a narrow screen',
].join('\n');

const product = buildHelpProduct(
  '/App_Plugins/X/docs',
  new Map(
    Object.entries({
      'product.json': '{"id":"p"}',
      'user/windows/snapping.md': `---\nid: snapping\ntitle: Snapping\n---\n\n${body}\n`,
      'user/windows/other.md': '---\nid: other\ntitle: Other\n---\n\n# Other\n\n## Part\n',
    }),
  ),
)!;

/**
 * Renders the test page into a detached container.
 * @returns The container.
 */
function render(): HTMLElement {
  const container = document.createElement('div');
  container.append(renderHelpPage({ product, page: product.pageById.get('snapping')! }, [product]));
  return container;
}

describe('renderHelpPage', () => {
  it('gives each heading the anchor the docs check knows, repeats included', () => {
    const ids = [...render().querySelectorAll('h1, h2')].map((h) => h.id);
    expect(ids).to.deep.equal(['snapping', 'on-a-narrow-screen', 'on-a-narrow-screen-1']);
  });

  it('marks each link with what following it does', () => {
    const links = [...render().querySelectorAll('a')];
    expect(links.map((a) => [a.textContent, a.dataset.helpKind, a.dataset.helpTarget ?? a.dataset.helpHeading ?? a.getAttribute('href')])).to.deep.equal([
      ['the other page', 'page', 'p/other/part'],
      ['this part', 'anchor', 'on-a-narrow-screen'],
      ['NuGet', 'external', 'https://www.nuget.org/x'],
    ]);
  });

  it('keeps in-app links out of the backoffice router, which would otherwise navigate the whole backoffice', () => {
    const links = [...render().querySelectorAll<HTMLAnchorElement>('a[data-help-kind="page"], a[data-help-kind="anchor"]')];
    expect(links).to.have.length(2);
    expect(links.every((a) => a.dataset.routerSlot === 'disabled')).to.equal(true);
  });

  it('gives an in-app link the deep link to its page, so a middle click opens it in a new tab', () => {
    const link = render().querySelector<HTMLAnchorElement>('a[data-help-kind="page"]')!;
    expect(new URL(link.href).pathname).to.match(/\/section\/umbradesktop$/);
    expect(new URL(link.href).searchParams.get('help')).to.equal('p/other/part');
  });

  it('opens an external link in a new tab without handing it this window', () => {
    const external = render().querySelector<HTMLAnchorElement>('a[data-help-kind="external"]')!;
    expect(external.target).to.equal('_blank');
    expect(external.rel).to.equal('noopener noreferrer');
  });

  it('turns a link that goes nowhere into plain text', () => {
    const container = render();
    expect(container.textContent).to.contain('bad');
    expect([...container.querySelectorAll('a')].some((a) => a.textContent === 'bad')).to.equal(false);
  });

  it('loads images from the product folder, lazily, with their alt text', () => {
    const image = render().querySelector('img')!;
    expect(image.getAttribute('src')).to.equal('/App_Plugins/X/docs/screenshots/snap.png');
    expect(image.alt).to.equal('A window snapped left');
    expect(image.loading).to.equal('lazy');
  });

  it('renders GitHub tables', () => {
    expect(render().querySelectorAll('table td').length).to.equal(2);
  });

  describe('on an overview page', () => {
    const overview = buildHelpProduct(
      '/App_Plugins/X/docs',
      new Map(
        Object.entries({
          'product.json': '{"id":"p"}',
          'user/README.md': [
            '---\nid: user-guide\ntitle: User guide\n---\n\n# User guide\n\nIntro with [a link](windows/README.md).\n',
            '| Section | What it covers |\n| --- | --- |\n| [Windows](windows/README.md) | Moving and `snapping` windows. |\n',
          ].join('\n'),
          'user/windows/README.md': [
            '---\nid: windows\ntitle: Windows\n---\n\n# Windows\n',
            '- [Snapping](snapping.md): drag a window to an edge, see [this](snapping.md#part).',
            '- [Moving](moving.md): move a window.\n',
            'Elsewhere:\n',
            '- Not a link first, [Snapping](snapping.md).\n',
          ].join('\n'),
          'user/windows/snapping.md': '---\nid: snapping\ntitle: Snapping\n---\n\n# Snapping\n\n- [Moving](moving.md): stays a list here.\n\n## Part\n',
          'user/windows/moving.md': '---\nid: moving\ntitle: Moving\n---\n\n# Moving\n',
        }),
      ),
    )!;

    /**
     * Renders one page of the overview product.
     * @param id The page id.
     * @returns The container.
     */
    const renderPage = (id: string) => {
      const container = document.createElement('div');
      container.append(renderHelpPage({ product: overview, page: overview.pageById.get(id)! }, [overview]));
      return container;
    };

    /**
     * The overview blocks on a page, as title and text.
     * @param container The rendered page.
     * @returns One pair per block.
     */
    const blocks = (container: HTMLElement) =>
      [...container.querySelectorAll<HTMLAnchorElement>('.overview a.overview-item')].map((a) => [
        a.dataset.helpTarget,
        a.querySelector('.overview-title')!.textContent,
        a.querySelector('.overview-text')!.textContent,
      ]);

    it('turns a list of pages, each with a description, into blocks that open the page', () => {
      expect(blocks(renderPage('windows'))).to.deep.equal([
        ['p/snapping', 'Snapping', 'Drag a window to an edge, see this.'],
        ['p/moving', 'Moving', 'Move a window.'],
      ]);
    });

    it('leaves a list alone when an item does not start with a page link', () => {
      expect(renderPage('windows').querySelectorAll('ul:not(.overview)').length).to.equal(1);
    });

    it('turns a table of sections into the same blocks, keeping inline code in the text', () => {
      const container = renderPage('user-guide');
      expect(container.querySelector('table')).to.equal(null);
      expect(blocks(container)).to.deep.equal([['p/windows', 'Windows', 'Moving and snapping windows.']]);
      expect(container.querySelector('.overview-text code')?.textContent).to.equal('snapping');
    });

    it('never nests a link inside a block, which is a link itself', () => {
      expect(renderPage('windows').querySelectorAll('a.overview-item a').length).to.equal(0);
    });

    it('leaves the lists on an ordinary page as lists', () => {
      expect(renderPage('snapping').querySelector('.overview')).to.equal(null);
    });
  });

  it('removes scripts and event handlers, which the Markdown must never be able to run', () => {
    const container = render();
    expect(container.querySelector('script')).to.equal(null);
    expect(container.innerHTML).to.not.contain('onerror');
    expect((window as unknown as { __pwned?: boolean }).__pwned).to.equal(undefined);
  });
});
