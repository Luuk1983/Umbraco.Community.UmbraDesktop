import { expect } from '@open-wc/testing';
import { renderReadme } from './readme.js';

/**
 * The README is the one thing on the details page another party writes as HTML, so every rule here
 * is about what that HTML may do once it is inside the backoffice.
 * @param html The README as the Marketplace returns it.
 * @returns A container holding the rendered fragment, to query.
 */
const render = (html: string) => {
  const container = document.createElement('div');
  container.append(renderReadme(html));
  return container;
};

describe('renderReadme', () => {
  it('keeps the text and its structure', () => {
    const out = render('<h2>Games</h2><p>Play <strong>three</strong> games.</p><ul><li>Snake</li></ul>');
    expect(out.querySelector('h2')!.textContent).to.equal('Games');
    expect(out.querySelector('strong')!.textContent).to.equal('three');
    expect(out.querySelectorAll('li').length).to.equal(1);
  });

  it('removes scripts, handlers, styles and forms', () => {
    const out = render(
      '<p onclick="alert(1)" style="color:red" class="x" id="y">Hi</p><script>alert(1)</script><style>p{}</style><form><input></form><iframe src="https://x"></iframe>',
    );
    expect(out.querySelector('script, style, form, input, iframe')).to.equal(null);
    const p = out.querySelector('p')!;
    expect(p.getAttribute('onclick')).to.equal(null);
    expect(p.getAttribute('style')).to.equal(null);
    expect(p.getAttribute('class')).to.equal(null);
    expect(p.getAttribute('id')).to.equal(null);
  });

  it('opens a link in a new tab, out of reach of the backoffice router', () => {
    const a = render('<p><a href="https://github.com/x">Code</a></p>').querySelector('a')!;
    expect(a.getAttribute('href')).to.equal('https://github.com/x');
    expect(a.getAttribute('target')).to.equal('_blank');
    expect(a.getAttribute('rel')).to.equal('noopener noreferrer');
    expect(a.dataset.routerSlot).to.equal('disabled');
  });

  it('turns a link that does not go to a web page into its text', () => {
    const out = render('<p><a href="javascript:alert(1)">bad</a> <a href="#install">anchor</a> <a href="docs/x.md">relative</a></p>');
    expect(out.querySelectorAll('a').length).to.equal(0);
    expect(out.textContent).to.equal('bad anchor relative');
  });

  it('keeps an https image, lazily, and turns any other into its alt text', () => {
    const out = render('<p><img src="https://img.shields.io/x" alt="badge"><img src="http://x/y.png" alt="plain"><img src="/local.png" alt="local"></p>');
    const images = [...out.querySelectorAll('img')];
    expect(images.map((image) => image.getAttribute('src'))).to.deep.equal(['https://img.shields.io/x']);
    expect(images[0].getAttribute('loading')).to.equal('lazy');
    expect(out.textContent).to.equal('plainlocal');
  });

  it('renders nothing for an empty README', () => {
    expect(render('').childNodes.length).to.equal(0);
  });
});
