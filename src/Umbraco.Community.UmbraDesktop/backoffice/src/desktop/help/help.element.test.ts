import { expect, fixture, html, oneEvent, waitUntil } from '@open-wc/testing';
import { buildHelpProduct, type UmbraDesktopHelpProduct } from './help-product.js';
import type { UmbraDesktopHelpElement } from './help.element.js';
import './help.element.js';

const page = (id: string, title: string, sidebar: number, body = '', extra = '') =>
  `---\nid: ${id}\ntitle: ${title}\nsidebar_position: ${sidebar}\n${extra}---\n\n# ${title}\n\n${body}`;

const desktop = buildHelpProduct(
  '/App_Plugins/Desktop/docs',
  new Map(
    Object.entries({
      'product.json': '{"id":"umbradesktop","name":"UmbraDesktop"}',
      'user/README.md': page(
        'user-guide',
        'User guide',
        1,
        'Start with [snapping](windows/snapping.md#on-a-narrow-screen).\n',
        'description: How to use the desktop.\nimage: ../screenshots/hero.png\n',
      ),
      'user/windows/_category_.json': '{"label":"Windows","position":1}',
      'user/windows/README.md': page('windows', 'Windows', 1, '- [Snapping](snapping.md): drag a window to an edge.\n'),
      'user/windows/snapping.md': page(
        'snapping',
        'Snapping',
        1,
        'Drag a window to an edge.\n\n## On a narrow screen\n\nThe halves overlap.\n\n### Very narrow\n\nThey stack.\n\n## Keyboard\n\nNone yet.\n',
      ),
      'developer/theming.md': page('theming', 'Adding a theme', 1, 'Themes are folders.\n', 'description: Build a theme.\n'),
    }),
  ),
)!;
const addon = buildHelpProduct(
  '/App_Plugins/Addon/docs',
  new Map(Object.entries({ 'product.json': '{"id":"entertainment","name":"Entertainment"}', 'user/games.md': page('games', 'Games', 1, 'Play.\n') })),
)!;

/**
 * Mounts a Help element over the given products.
 * @param location The location it opens at.
 * @param products What the loader returns.
 * @returns The element, once it shows something.
 */
async function mount(location?: string, products: UmbraDesktopHelpProduct[] = [desktop, addon]): Promise<UmbraDesktopHelpElement> {
  const element = document.createElement('umbradesktop-help') as UmbraDesktopHelpElement;
  element.loadProducts = async () => products;
  if (location) element.location = location;
  await fixture(html`<div style="width: 1300px; height: 700px">${element}</div>`);
  await waitUntil(() => element.shadowRoot?.querySelector('article h1, .landing, .empty'), 'nothing shown');
  return element;
}

/** The element's shadow root. */
const root = (element: UmbraDesktopHelpElement) => element.shadowRoot!;

/** The shown page's title. */
const shownTitle = (element: UmbraDesktopHelpElement) => root(element).querySelector('article h1')?.textContent;

/** The visible sidebar entries' labels, in order. */
const tree = (element: UmbraDesktopHelpElement) =>
  [...root(element).querySelectorAll<HTMLElement>('nav .tree-label')].filter((label) => label.offsetParent !== null).map((label) => label.textContent!.trim());

/**
 * Clicks a sidebar entry by its label.
 * @param element The Help element.
 * @param label The entry's label.
 */
async function clickEntry(element: UmbraDesktopHelpElement, label: string): Promise<void> {
  const entry = [...root(element).querySelectorAll<HTMLButtonElement>('nav button.tree-entry')].find((b) => b.textContent!.trim() === label);
  if (!entry) throw new Error(`no sidebar entry ${label}`);
  entry.click();
  await element.updateComplete;
}

describe('umbradesktop-help', () => {
  describe('the landing page', () => {
    it('opens on a card for every user guide, with its description', async () => {
      const element = await mount();
      const cards = [...root(element).querySelectorAll('.landing .card')];
      expect(cards.map((c) => c.querySelector('.card-title')!.textContent!.trim())).to.deep.equal(['UmbraDesktop', 'Entertainment']);
      expect(cards[0].querySelector('.card-text')!.textContent!.trim()).to.equal('How to use the desktop.');
    });

    it('lists the developer guides below the cards, quieter than them, without pictures', async () => {
      const element = await mount();
      const links = [...root(element).querySelectorAll('.landing .developers button')];
      expect(links.map((l) => l.querySelector('.developer-title')!.textContent!.trim())).to.deep.equal(['UmbraDesktop for developers']);
      expect(links[0].querySelector('.developer-text')!.textContent!.trim()).to.equal('Build a theme.');
      expect(root(element).querySelector('.landing .developers img, .landing .developers .card-fallback')).to.equal(null);
    });

    it('shows a guide\'s image, and a generic picture for a guide without one', async () => {
      const element = await mount();
      const cards = [...root(element).querySelectorAll('.landing .card')];
      expect(cards[0].querySelector('img')!.getAttribute('src')).to.equal('/App_Plugins/Desktop/docs/screenshots/hero.png');
      expect(cards[1].querySelector('img')).to.equal(null);
      expect(cards[1].querySelector('.card-fallback')).to.not.equal(null);
    });

    it('opens a developer guide\'s front page from the list, and reports the new location', async () => {
      const element = await mount();
      const card = root(element).querySelector<HTMLButtonElement>('.landing .developers button')!;
      setTimeout(() => card.click());
      const event = await oneEvent(element, 'umbradesktop-app-location');
      expect((event as CustomEvent).detail).to.deep.equal({ location: 'umbradesktop/theming' });
      await element.updateComplete;
      expect(shownTitle(element)).to.equal('Adding a theme');
    });

    it('is where the breadcrumb\'s first step goes back to', async () => {
      const element = await mount('umbradesktop/snapping');
      const home = root(element).querySelector<HTMLButtonElement>('.breadcrumb button')!;
      setTimeout(() => home.click());
      const event = await oneEvent(element, 'umbradesktop-app-location');
      expect((event as CustomEvent).detail).to.deep.equal({ location: '/' });
      await element.updateComplete;
      expect(root(element).querySelector('.landing')).to.not.equal(null);
    });

    it('says when the documentation it was asked for is not installed', async () => {
      const element = await mount('forms/settings');
      expect(root(element).querySelector('.landing')).to.not.equal(null);
      expect(root(element).querySelector('.notice')).to.not.equal(null);
    });
  });

  describe('a page', () => {
    it('opens at the page its location names', async () => {
      const element = await mount('umbradesktop/snapping/on-a-narrow-screen');
      expect(shownTitle(element)).to.equal('Snapping');
    });

    it('lists the guides in the picker, the developer guides last and under a heading of their own', async () => {
      const element = await mount('umbradesktop/snapping');
      const picker = root(element).querySelector<HTMLSelectElement>('select')!;
      expect([...picker.options].map((o) => o.textContent!.trim())).to.deep.equal(['UmbraDesktop', 'Entertainment', 'UmbraDesktop for developers']);
      expect(picker.options[2].parentElement!.tagName).to.equal('OPTGROUP');
      expect(picker.selectedIndex).to.equal(0);
    });

    it('switches guide with the picker, and shows only that guide in the sidebar', async () => {
      const element = await mount('umbradesktop/snapping');
      const picker = root(element).querySelector<HTMLSelectElement>('select')!;
      picker.selectedIndex = 2;
      picker.dispatchEvent(new Event('change'));
      await element.updateComplete;
      expect(shownTitle(element)).to.equal('Adding a theme');
      expect(tree(element)).to.deep.equal(['Adding a theme']);
    });

    it('shows only the top level of the sidebar, and the category of the page that is open', async () => {
      const element = await mount('umbradesktop/user-guide');
      expect(tree(element)).to.deep.equal(['User guide', 'Windows']);
      element.location = 'umbradesktop/snapping';
      await waitUntil(() => shownTitle(element) === 'Snapping');
      expect(tree(element)).to.deep.equal(['User guide', 'Windows', 'Snapping']);
    });

    it('opens a category\'s overview and expands it when the category is selected', async () => {
      const element = await mount('umbradesktop/user-guide');
      await clickEntry(element, 'Windows');
      expect(shownTitle(element)).to.equal('Windows');
      expect(tree(element)).to.deep.equal(['User guide', 'Windows', 'Snapping']);
    });

    it('folds a category away with its arrow, without leaving the page', async () => {
      const element = await mount('umbradesktop/snapping');
      root(element).querySelector<HTMLButtonElement>('nav .tree-toggle')!.click();
      await element.updateComplete;
      expect(tree(element)).to.deep.equal(['User guide', 'Windows']);
      expect(shownTitle(element)).to.equal('Snapping');
    });

    it('marks the open page in the sidebar', async () => {
      const element = await mount('umbradesktop/snapping');
      expect(root(element).querySelector('nav [aria-current="page"]')?.textContent?.trim()).to.equal('Snapping');
    });

    it('shows the way to the page in a breadcrumb, each step but the last a way back', async () => {
      const element = await mount('umbradesktop/snapping');
      const steps = [...root(element).querySelectorAll('.breadcrumb li')].map((li) => li.textContent!.trim());
      expect(steps).to.deep.equal(['Help', 'UmbraDesktop', 'Windows', 'Snapping']);
      expect(root(element).querySelectorAll('.breadcrumb button').length).to.equal(3);
      root(element).querySelectorAll<HTMLButtonElement>('.breadcrumb button')[2].click();
      await element.updateComplete;
      expect(shownTitle(element)).to.equal('Windows');
    });

    it('lists the page\'s sections under On this page, and goes to one', async () => {
      const element = await mount('umbradesktop/snapping');
      const entries = [...root(element).querySelectorAll<HTMLButtonElement>('.toc button')];
      expect(entries.map((b) => b.textContent!.trim())).to.deep.equal(['On a narrow screen', 'Very narrow', 'Keyboard']);
      setTimeout(() => entries[2].click());
      const event = await oneEvent(element, 'umbradesktop-app-location');
      expect((event as CustomEvent).detail).to.deep.equal({ location: 'umbradesktop/snapping/keyboard' });
    });

    it('leaves out On this page for a page without sections', async () => {
      const element = await mount('umbradesktop/theming');
      expect(root(element).querySelector('.toc')).to.equal(null);
    });

    it('follows an in-page link to another page, and reports its new location', async () => {
      const element = await mount('umbradesktop/user-guide');
      const link = root(element).querySelector<HTMLAnchorElement>('article a[data-help-kind="page"]')!;
      setTimeout(() => link.click());
      const event = await oneEvent(element, 'umbradesktop-app-location');
      expect((event as CustomEvent).detail).to.deep.equal({ location: 'umbradesktop/snapping/on-a-narrow-screen' });
      await element.updateComplete;
      expect(shownTitle(element)).to.equal('Snapping');
    });

    it('opens a page from an overview block', async () => {
      const element = await mount('umbradesktop/windows');
      root(element).querySelector<HTMLAnchorElement>('article a.overview-item')!.click();
      await element.updateComplete;
      expect(shownTitle(element)).to.equal('Snapping');
    });

    it('searches the current guide only, and opens a result at its heading', async () => {
      const element = await mount('umbradesktop/user-guide');
      const search = root(element).querySelector<HTMLInputElement>('input[type="search"]')!;
      search.value = 'theme';
      search.dispatchEvent(new Event('input'));
      await element.updateComplete;
      expect(root(element).querySelectorAll('.results button').length).to.equal(0);
      search.value = 'overlap';
      search.dispatchEvent(new Event('input'));
      await element.updateComplete;
      const results = [...root(element).querySelectorAll<HTMLButtonElement>('.results button')];
      expect(results.map((r) => r.querySelector('.result-title')!.textContent!.trim())).to.deep.equal(['Snapping']);
      setTimeout(() => results[0].click());
      const event = await oneEvent(element, 'umbradesktop-app-location');
      expect((event as CustomEvent).detail).to.deep.equal({ location: 'umbradesktop/snapping/on-a-narrow-screen' });
    });

    it('says when the page it was asked for is not in this version', async () => {
      const element = await mount('umbradesktop/from-the-future');
      expect(shownTitle(element)).to.equal('User guide');
      expect(root(element).querySelector('.notice')).to.not.equal(null);
    });

    it('moves to a new location set from outside, as a reopened or reused window is', async () => {
      const element = await mount();
      element.location = 'entertainment/games';
      await waitUntil(() => shownTitle(element) === 'Games');
    });
  });

  it('says so when no documentation is installed', async () => {
    const element = await mount(undefined, []);
    expect(root(element).querySelector('.empty')).to.not.equal(null);
  });

  it('sets its small headings the way Umbraco does: as written, bold, and not spaced out', async () => {
    const landing = await mount();
    const article = await mount('umbradesktop/snapping');
    const headings = [
      root(landing).querySelector('.developers h2')!,
      root(article).querySelector('.field-label')!,
      root(article).querySelector('.toc h2')!,
    ];
    for (const heading of headings) {
      const style = getComputedStyle(heading);
      expect([heading.textContent, style.textTransform, style.letterSpacing, style.fontWeight]).to.deep.equal([heading.textContent, 'none', 'normal', '700']);
    }
  });
});
