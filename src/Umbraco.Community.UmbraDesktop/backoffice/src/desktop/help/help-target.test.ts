import { expect } from '@open-wc/testing';
import { formatHelpTarget, parseHelpTarget } from './help-target.js';

describe('parseHelpTarget', () => {
  it('reads a product, a page and a heading', () => {
    expect(parseHelpTarget('umbradesktop/overwrite-protection/headless-sites')).to.deep.equal({
      product: 'umbradesktop',
      page: 'overwrite-protection',
      heading: 'headless-sites',
    });
  });

  it('reads a product and a page without a heading', () => {
    expect(parseHelpTarget('umbradesktop/live-preview')).to.deep.equal({ product: 'umbradesktop', page: 'live-preview' });
  });

  it('reads a product alone, which means its front page', () => {
    expect(parseHelpTarget('entertainment')).to.deep.equal({ product: 'entertainment' });
  });

  it('forgives a trailing slash and surrounding space, as a pasted link carries', () => {
    expect(parseHelpTarget(' umbradesktop/live-preview/ ')).to.deep.equal({ product: 'umbradesktop', page: 'live-preview' });
  });

  it('lowercases, since ids and anchors are lowercase and a hand-typed link may not be', () => {
    expect(parseHelpTarget('UmbraDesktop/Live-Preview')).to.deep.equal({ product: 'umbradesktop', page: 'live-preview' });
  });

  it('keeps underscores and non-English letters in a heading, which the anchor rules keep too', () => {
    expect(parseHelpTarget('umbradesktop/theming/the_token-für-themes')).to.deep.equal({
      product: 'umbradesktop',
      page: 'theming',
      heading: 'the_token-für-themes',
    });
  });

  it('refuses anything that is not a target', () => {
    for (const value of ['', '/', '//x', 'a/b/c/d', 'um brella', 'a/../b', 'a/b#c', 42, null, undefined, {}]) {
      expect(parseHelpTarget(value), String(value)).to.equal(undefined);
    }
  });
});

describe('formatHelpTarget', () => {
  it('writes the parts it has, in order', () => {
    expect(formatHelpTarget({ product: 'umbradesktop', page: 'live-preview', heading: 'headless-sites' })).to.equal(
      'umbradesktop/live-preview/headless-sites',
    );
    expect(formatHelpTarget({ product: 'umbradesktop', page: 'live-preview' })).to.equal('umbradesktop/live-preview');
    expect(formatHelpTarget({ product: 'umbradesktop' })).to.equal('umbradesktop');
  });

  it('drops a heading without a page, which has nowhere to go', () => {
    expect(formatHelpTarget({ product: 'umbradesktop', heading: 'x' })).to.equal('umbradesktop');
  });

  it('round-trips with parseHelpTarget', () => {
    const value = 'entertainment/games/snake';
    expect(formatHelpTarget(parseHelpTarget(value)!)).to.equal(value);
  });
});
