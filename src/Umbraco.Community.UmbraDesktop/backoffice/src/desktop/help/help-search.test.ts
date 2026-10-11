import { expect } from '@open-wc/testing';
import { buildHelpProduct } from './help-product.js';
import { searchHelp } from './help-search.js';

const product = buildHelpProduct(
  '/x',
  new Map(
    Object.entries({
      'product.json': '{"id":"p"}',
      'user/snapping.md': '---\nid: snapping\ntitle: Snapping\ndescription: Give a window half the desktop.\n---\n\n# Snapping\n\nDrag a window into an edge.\n\n## On a narrow screen\n\nThe two halves **overlap** in the middle.\n',
      'user/themes.md': '---\nid: themes\ntitle: Themes\n---\n\n# Themes\n\nFive themes ship, and each can bring a wallpaper.\n',
      'user/wallpaper.md': '---\nid: wallpaper\ntitle: Wallpaper\n---\n\n# Wallpaper\n\nPick an image. Snapping is elsewhere.\n',
    }),
  ),
)!;

describe('searchHelp', () => {
  it('finds nothing for an empty query', () => {
    expect(searchHelp(product, '   ')).to.deep.equal([]);
  });

  it('ranks a title match above a match in the text', () => {
    expect(searchHelp(product, 'snapping').map((r) => r.page.id)).to.deep.equal(['snapping', 'wallpaper']);
  });

  it('needs every word, in any order and any case', () => {
    expect(searchHelp(product, 'HALVES overlap').map((r) => r.page.id)).to.deep.equal(['snapping']);
    expect(searchHelp(product, 'overlap wallpaper')).to.deep.equal([]);
  });

  it('points a text match at the heading of the section it is in, with a plain-text snippet', () => {
    const [result] = searchHelp(product, 'overlap');
    expect(result.heading?.anchor).to.equal('on-a-narrow-screen');
    expect(result.snippet).to.equal('The two halves overlap in the middle.');
  });

  it('finds words in the description', () => {
    expect(searchHelp(product, 'half the desktop').map((r) => r.page.id)).to.deep.equal(['snapping']);
  });

  it('ranks a page holding the words as one phrase above one where they are scattered', () => {
    const scattered = buildHelpProduct(
      '/y',
      new Map(
        Object.entries({
          'product.json': '{"id":"q"}',
          'user/a.md': '---\nid: a\ntitle: Aaa\n---\n\n# Aaa\n\nThe frame class, and its ancestors.\n\nMore frame text.\n',
          'user/b.md': '---\nid: b\ntitle: Bbb\n---\n\n# Bbb\n\nAllow it in frame-ancestors.\n',
        }),
      ),
    )!;
    expect(searchHelp(scattered, 'frame-ancestors').map((r) => r.page.id)).to.deep.equal(['b', 'a']);
  });

  it('matches the start of a word, so a partial word as it is typed still finds the page', () => {
    expect(searchHelp(product, 'wallp').map((r) => r.page.id)).to.deep.equal(['wallpaper', 'themes']);
  });

  it('searches one part only when asked, since the user and developer guides are separate guides', () => {
    const both = buildHelpProduct(
      '/z',
      new Map(
        Object.entries({
          'product.json': '{"id":"r"}',
          'user/themes.md': '---\nid: themes\ntitle: Themes\n---\n\n# Themes\n\nPick a theme.\n',
          'developer/theming.md': '---\nid: theming\ntitle: Adding a theme\n---\n\n# Adding a theme\n\nA theme is a folder.\n',
        }),
      ),
    )!;
    expect(searchHelp(both, 'theme').map((r) => r.page.id)).to.have.members(['themes', 'theming']);
    expect(searchHelp(both, 'theme', { part: 'developer' }).map((r) => r.page.id)).to.deep.equal(['theming']);
  });
});
