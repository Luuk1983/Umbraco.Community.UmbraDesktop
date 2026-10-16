import { expect } from '@open-wc/testing';
import './episode-list.element.js';
import en from '../localization/en.js';
import {
  UMBRACOFFEE_CHANNEL_URL,
  UMBRACOFFEE_EPISODE_PAGE_SIZE,
  UMBRACOFFEE_FIELD_HEIGHT,
  UMBRACOFFEE_ROW_HEIGHT,
  UMBRACOFFEE_SIDE_TOP_HEIGHT,
  UMBRACOFFEE_THUMBNAIL_URL,
} from './constants.js';
import { EPISODES, episodeOf, removeBoxes, sizedBox } from './test-support.js';
import type { UmbraCoffeeEpisodeListElement, UmbraCoffeeLeadRow } from './episode-list.element.js';
import type { UmbraCoffeeEpisode, UmbraCoffeeGuest } from './types.js';

/** The strings the list falls back to, which are the English dictionary's. */
const STRINGS = en.umbraDesktopEntertainment;

afterEach(removeBoxes);

/**
 * Some episodes, newest first, with ids and titles that show which is which.
 * @param count How many.
 * @param guestsOf The guests of the episode at an index; none unless given.
 * @returns The episodes.
 */
function many(count: number, guestsOf: (i: number) => UmbraCoffeeGuest[] = () => []): UmbraCoffeeEpisode[] {
  return Array.from({ length: count }, (_, i) =>
    episodeOf({
      videoId: `e${i}`,
      title: `Episode ${i}`,
      published: new Date(Date.UTC(2026, 8, 25) - i * 86_400_000).toISOString(),
      guests: guestsOf(i),
    }),
  );
}

/**
 * A guest with no affiliation.
 * @param name The name.
 * @returns The guest.
 */
const guest = (name: string): UmbraCoffeeGuest => ({ name, affiliation: null });

/** The upcoming episode the window hands the list as its first row. */
const UPCOMING: UmbraCoffeeLeadRow = { kind: 'upcoming', videoId: 'next1', title: 'Spooky Season 2026', when: '30 Oct, 12:30', day: '30', month: 'Oct' };

/**
 * Mount the list.
 * @param episodes The episodes to draw.
 * @param over Other properties to set.
 * @param size The box, in px.
 * @returns The element after its first render.
 */
async function mount(episodes: UmbraCoffeeEpisode[], over: Partial<UmbraCoffeeEpisodeListElement> = {}, size = { w: 320, h: 500 }) {
  const element = document.createElement('umbracoffee-episode-list');
  element.episodes = episodes;
  Object.assign(element, over);
  sizedBox(size).appendChild(element);
  await element.updateComplete;
  return element;
}

/**
 * The rows, in order, the lead row included.
 * @param element The list.
 * @returns The row buttons.
 */
const rows = (element: UmbraCoffeeEpisodeListElement) => [...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.ep') ?? [])];

/**
 * The search field.
 * @param element The list.
 * @returns The input.
 */
const searchField = (element: UmbraCoffeeEpisodeListElement) => element.shadowRoot!.querySelector<HTMLInputElement>('input[type="search"]')!;

/**
 * The live region with the count of matches.
 * @param element The list.
 * @returns The region.
 */
const status = (element: UmbraCoffeeEpisodeListElement) => element.shadowRoot!.querySelector<HTMLElement>('[role="status"]')!;

/**
 * Whether a node is there, as a boolean so a failing case cannot hang the runner.
 * @param element The list.
 * @param selector What to look for.
 * @returns True when it is.
 */
const has = (element: UmbraCoffeeEpisodeListElement, selector: string) => element.shadowRoot!.querySelector(selector) !== null;

/**
 * Type into the search field the way a person does: the value, then an `input` event.
 * @param element The list.
 * @param text What to type.
 */
async function search(element: UmbraCoffeeEpisodeListElement, text: string): Promise<void> {
  searchField(element).value = text;
  searchField(element).dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await element.updateComplete;
}

/**
 * The titles drawn, in order.
 * @param element The list.
 * @returns The titles.
 */
const titles = (element: UmbraCoffeeEpisodeListElement) => rows(element).map((r) => r.querySelector('.ep-t')?.textContent?.trim());

/**
 * A row's text, whitespace collapsed.
 * @param row The row.
 * @param selector The part of it.
 * @returns The text.
 */
const textIn = (row: Element | undefined, selector: string) => row?.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

describe('the episode list element', () => {
  it('draws a row per episode with its title and date, and no duration', async () => {
    const element = await mount(EPISODES, { formatDate: (iso) => `on ${iso.slice(0, 10)}` });
    expect(titles(element)).to.deep.equal(EPISODES.map((e) => e.title));
    expect(rows(element).map((r) => textIn(r, '.ep-d'))).to.deep.equal(EPISODES.map((e) => `on ${e.published.slice(0, 10)}`));
    expect(has(element, '.dur'), 'durations are not in the data (E7)').to.equal(false);
  });

  it('draws a lazy thumbnail built from the id', async () => {
    const element = await mount(EPISODES);
    const image = rows(element)[0]?.querySelector('img');
    expect(image?.getAttribute('src')).to.equal(`${UMBRACOFFEE_THUMBNAIL_URL}v0/mqdefault.jpg`);
    expect(image?.getAttribute('loading')).to.equal('lazy');
    expect(image?.getAttribute('alt'), 'the title beside it says it, so the picture is decoration').to.equal('');
  });

  it('swaps a thumbnail that fails for a gradient, keeping the row', async () => {
    const element = await mount(EPISODES);
    rows(element)[1]?.querySelector('img')?.dispatchEvent(new Event('error'));
    await element.updateComplete;
    expect(rows(element).length).to.equal(EPISODES.length);
    expect(rows(element)[1]?.querySelector('img') === null, 'the broken image is gone').to.equal(true);
    expect(rows(element)[1]?.querySelector('.thumb.fallback') === null, 'and a fallback is drawn').to.equal(false);
    expect(rows(element)[0]?.querySelector('img') === null, 'the others keep theirs').to.equal(false);
  });

  it('draws each row at the height constants.ts says, so the window can sum one', async () => {
    const element = await mount([episodeOf({ ...EPISODES[0]!, guests: [guest('Sam Smith')] }), ...EPISODES.slice(1)]);
    for (const row of rows(element)) expect(row.getBoundingClientRect().height).to.be.closeTo(UMBRACOFFEE_ROW_HEIGHT, 0.5);
  });

  it('draws thirty rows and adds thirty more on Show more, so 349 episodes are not 349 images', async () => {
    const element = await mount(many(100));
    expect(rows(element).length).to.equal(UMBRACOFFEE_EPISODE_PAGE_SIZE);
    const more = element.shadowRoot?.querySelector<HTMLButtonElement>('.more');
    expect(more?.textContent?.trim()).to.equal(STRINGS.umbraCoffeeShowMore);
    more?.click();
    await element.updateComplete;
    expect(rows(element).length).to.equal(UMBRACOFFEE_EPISODE_PAGE_SIZE * 2);
  });

  it('takes Show more away once every episode is drawn, and has none for a short list', async () => {
    const element = await mount(many(UMBRACOFFEE_EPISODE_PAGE_SIZE + 5));
    element.shadowRoot?.querySelector<HTMLButtonElement>('.more')?.click();
    await element.updateComplete;
    expect(rows(element).length).to.equal(UMBRACOFFEE_EPISODE_PAGE_SIZE + 5);
    expect(has(element, '.more')).to.equal(false);
    const short = await mount(EPISODES);
    expect(has(short, '.more')).to.equal(false);
  });

  it('marks the row in the player, saying Now playing while it plays and Paused when it does not', async () => {
    const element = await mount(EPISODES, { current: 'v2', playing: true });
    expect(rows(element).map((r) => r.getAttribute('aria-current'))).to.deep.equal([null, 'true', null]);
    expect(textIn(rows(element)[1], '.now')).to.equal(STRINGS.umbraCoffeeNowPlaying);
    element.playing = false;
    await element.updateComplete;
    expect(textIn(rows(element)[1], '.now')).to.equal(STRINGS.umbraCoffeePaused);
    expect(rows(element)[0]?.querySelector('.now') === null, 'only the current row says it').to.equal(true);
  });

  it('puts up to two guests under the date, with how many more there are', async () => {
    const element = await mount([
      episodeOf({ ...EPISODES[0]!, guests: [guest('Lucy Smith'), guest('Matt Brailsford'), guest('Georgina Bidwell')] }),
      episodeOf({ ...EPISODES[1]!, guests: [guest('Warren Buckley')] }),
      EPISODES[2]!,
    ]);
    expect(textIn(rows(element)[0], '.ep-g')).to.equal('Lucy Smith, Matt Brailsford +1');
    expect(textIn(rows(element)[1], '.ep-g')).to.equal('Warren Buckley');
    expect(rows(element)[2]?.querySelector('.ep-g') === null, 'nothing drawn for an episode with no guests').to.equal(true);
  });

  it('raises episode-selected with the id when a row is clicked', async () => {
    const element = await mount(EPISODES);
    const heard: string[] = [];
    element.addEventListener('episode-selected', (event) => heard.push((event as CustomEvent<string>).detail));
    rows(element)[2]?.click();
    expect(heard).to.deep.equal(['v3']);
  });

  it('links the channel for everything older, in a new tab', async () => {
    const element = await mount(EPISODES);
    const link = element.shadowRoot?.querySelector('a.channel');
    expect(link?.getAttribute('href')).to.equal(UMBRACOFFEE_CHANNEL_URL);
    expect(link?.getAttribute('target')).to.equal('_blank');
    expect(link?.getAttribute('rel')).to.equal('noopener');
    expect(link?.textContent).to.contain(STRINGS.umbraCoffeeAllEpisodes);
  });

  it('draws the link and no rows for an empty list', async () => {
    const element = await mount([]);
    expect(rows(element).length).to.equal(0);
    expect(has(element, 'a.channel')).to.equal(true);
  });
});

describe('the first row while an episode is coming or on', () => {
  it('heads the list with the upcoming episode, its date as the picture, marked as what the window shows', async () => {
    const element = await mount(EPISODES, { lead: UPCOMING, current: UPCOMING.videoId });
    expect(titles(element)).to.deep.equal(['Spooky Season 2026', ...EPISODES.map((e) => e.title)]);
    const first = rows(element)[0]!;
    expect(textIn(first, '.thumb.soon')).to.equal('30 Oct');
    expect(textIn(first, '.ep-d')).to.equal(`${STRINGS.umbraCoffeeUpcoming}·30 Oct, 12:30`);
    expect(first.getAttribute('aria-current')).to.equal('true');
  });

  it('heads it with the live stream, saying Live', async () => {
    const lead: UmbraCoffeeLeadRow = { kind: 'live', videoId: 'v9', title: 'October', when: 'Started 12:31' };
    const element = await mount(EPISODES, { lead });
    expect(textIn(rows(element)[0], '.ep-d')).to.equal(`${STRINGS.umbraCoffeeLive}·Started 12:31`);
    expect(rows(element)[0]?.querySelector('img')?.getAttribute('src')).to.equal(`${UMBRACOFFEE_THUMBNAIL_URL}v9/mqdefault.jpg`);
  });

  it('asks the window to go back to it with lead-selected', async () => {
    const element = await mount(EPISODES, { lead: UPCOMING });
    let heard = 0;
    element.addEventListener('lead-selected', () => heard++);
    rows(element)[0]?.click();
    expect(heard).to.equal(1);
  });

  it('lists a live episode the archive already has once, as the first row', async () => {
    const lead: UmbraCoffeeLeadRow = { kind: 'live', videoId: 'v0', title: 'September', when: '' };
    const element = await mount(EPISODES, { lead });
    expect(titles(element)).to.deep.equal(EPISODES.map((e) => e.title));
  });

  it('leaves it out of a search, which is a list of matches', async () => {
    const element = await mount(EPISODES, { lead: UPCOMING });
    await search(element, 'september');
    expect(titles(element)).to.deep.equal(['September']);
  });
});

describe('searching the episodes', () => {
  it('labels the search field and gives it the mock’s placeholder', async () => {
    const element = await mount(EPISODES);
    expect(searchField(element).labels?.[0]?.textContent?.trim()).to.equal(STRINGS.umbraCoffeeSearchLabel);
    expect(searchField(element).placeholder).to.equal(STRINGS.umbraCoffeeSearchPlaceholder);
  });

  it('has no guest filter: one field finds guests too', async () => {
    const element = await mount([episodeOf({ ...EPISODES[0]!, guests: [guest('Sam Smith')] }), ...EPISODES.slice(1)]);
    expect(has(element, 'select')).to.equal(false);
    await search(element, 'sam');
    expect(titles(element)).to.deep.equal(['September']);
  });

  it('searches the whole archive, not only the rows drawn, and says how many matched', async () => {
    const element = await mount(many(100));
    await search(element, 'episode 75');
    expect(titles(element)).to.deep.equal(['Episode 75']);
    expect(status(element).textContent?.trim()).to.equal(STRINGS.umbraCoffeeMatchesOne);
    await search(element, 'episode 7');
    expect(status(element).textContent?.trim()).to.equal(STRINGS.umbraCoffeeMatches.replace('%0%', '19'));
  });

  it('puts the count in a polite live region that draws no line while nothing is searched', async () => {
    const element = await mount(EPISODES);
    expect(status(element).getAttribute('aria-live')).to.equal('polite');
    expect(status(element).textContent?.trim()).to.equal('');
    expect(status(element).getBoundingClientRect().height).to.equal(0);
    const firstRow = rows(element)[0]!.getBoundingClientRect().top;
    await search(element, 'e');
    expect(status(element).getBoundingClientRect().height).to.be.greaterThan(0);
    await search(element, '');
    expect(rows(element)[0]!.getBoundingClientRect().top).to.equal(firstRow);
  });

  it('marks the match in the title and in the guests, leading with the guest it found', async () => {
    const element = await mount([
      episodeOf({ ...EPISODES[0]!, title: 'Brailsford Live', guests: [guest('Lucy Smith'), guest('Georgina Bidwell'), guest('Matt Brailsford')] }),
      ...EPISODES.slice(1),
    ]);
    await search(element, 'brailsford');
    const row = rows(element)[0]!;
    expect([...row.querySelectorAll('.ep-t mark')].map((m) => m.textContent)).to.deep.equal(['Brailsford']);
    expect(textIn(row, '.ep-g')).to.equal('Matt Brailsford, Lucy Smith +1');
    expect([...row.querySelectorAll('.ep-g mark')].map((m) => m.textContent)).to.deep.equal(['Brailsford']);
  });

  it('marks nothing while nothing is searched', async () => {
    const element = await mount(EPISODES);
    expect(has(element, 'mark')).to.equal(false);
  });

  it('finds a guest typed without the accent their name has', async () => {
    const element = await mount([episodeOf({ ...EPISODES[0]!, guests: [guest('Daniël Knippers')] }), ...EPISODES.slice(1)]);
    await search(element, 'DANIEL');
    expect(titles(element)).to.deep.equal(['September']);
  });

  it('still draws thirty at a time when a search matches more, with Show more over the matches', async () => {
    const element = await mount(many(100, (i) => (i % 10 < 7 ? [guest('Sam Smith')] : [])));
    await search(element, 'sam');
    expect(rows(element).length).to.equal(UMBRACOFFEE_EPISODE_PAGE_SIZE);
    expect(status(element).textContent?.trim()).to.equal(STRINGS.umbraCoffeeMatches.replace('%0%', '70'));
    const more = () => element.shadowRoot?.querySelector<HTMLButtonElement>('.more');
    more()?.click();
    await element.updateComplete;
    more()?.click();
    await element.updateComplete;
    expect(rows(element).length).to.equal(70);
    expect(more() === null, 'no Show more once every match is drawn').to.equal(true);
  });

  it('starts a new search at the first page again', async () => {
    const element = await mount(many(100));
    element.shadowRoot?.querySelector<HTMLButtonElement>('.more')?.click();
    await element.updateComplete;
    expect(rows(element).length).to.equal(UMBRACOFFEE_EPISODE_PAGE_SIZE * 2);
    await search(element, 'episode');
    expect(rows(element).length).to.equal(UMBRACOFFEE_EPISODE_PAGE_SIZE);
  });

  it('offers a clear button only while something is typed, which empties the field', async () => {
    const element = await mount(EPISODES);
    expect(has(element, '.search .clear')).to.equal(false);
    await search(element, 'aug');
    const clear = element.shadowRoot!.querySelector<HTMLButtonElement>('.search .clear')!;
    expect(clear.getAttribute('aria-label')).to.equal(STRINGS.umbraCoffeeClearSearch);
    clear.click();
    await element.updateComplete;
    expect(searchField(element).value).to.equal('');
    expect(titles(element)).to.deep.equal(EPISODES.map((e) => e.title));
    expect(has(element, '.search .clear')).to.equal(false);
  });

  it('says so when nothing matches, and clears the search from there', async () => {
    const element = await mount(EPISODES);
    await search(element, 'zzz');
    expect(rows(element).length).to.equal(0);
    expect(element.shadowRoot?.querySelector('.none')?.textContent).to.contain(STRINGS.umbraCoffeeNoMatches);
    expect(status(element).textContent?.trim()).to.equal(STRINGS.umbraCoffeeMatches.replace('%0%', '0'));
    const clear = element.shadowRoot!.querySelector<HTMLButtonElement>('.none button')!;
    expect(clear.textContent?.trim()).to.equal(STRINGS.umbraCoffeeClearFilters);
    clear.click();
    await element.updateComplete;
    expect(titles(element)).to.deep.equal(EPISODES.map((e) => e.title));
    expect(searchField(element).value).to.equal('');
    expect(status(element).textContent?.trim()).to.equal('');
    expect(has(element, '.none')).to.equal(false);
  });
});

describe('the list’s top row and its one scroll area', () => {
  it('puts what the window slots in as tools beside the search field, on its right', async () => {
    const element = document.createElement('umbracoffee-episode-list');
    element.episodes = EPISODES;
    const gear = document.createElement('button');
    gear.slot = 'tools';
    gear.textContent = 'G';
    gear.style.width = '33px';
    gear.style.height = '33px';
    element.append(gear);
    sizedBox({ w: 320, h: 500 }).appendChild(element);
    await element.updateComplete;
    const field = element.shadowRoot!.querySelector('.search')!.getBoundingClientRect();
    const tool = gear.getBoundingClientRect();
    expect(tool.left).to.be.at.least(field.right);
    expect(tool.top + tool.height / 2).to.be.closeTo(field.top + field.height / 2, 0.5);
  });

  it('makes the search field and the top row the heights constants.ts says', async () => {
    const element = await mount(EPISODES);
    expect(element.shadowRoot!.querySelector('.search')!.getBoundingClientRect().height).to.be.closeTo(UMBRACOFFEE_FIELD_HEIGHT, 0.5);
    expect(element.shadowRoot!.querySelector('.top')!.getBoundingClientRect().height).to.be.closeTo(UMBRACOFFEE_SIDE_TOP_HEIGHT, 0.5);
  });

  it('scrolls the rows and nothing else: the top row stays, and the host itself never scrolls', async () => {
    const element = await mount(many(UMBRACOFFEE_EPISODE_PAGE_SIZE), {}, { w: 320, h: 300 });
    const scroller = element.shadowRoot!.querySelector<HTMLElement>('.scroll')!;
    expect(getComputedStyle(scroller).overflowY).to.equal('auto');
    expect(scroller.scrollHeight).to.be.greaterThan(scroller.clientHeight);
    expect(element.scrollHeight, 'the host holds exactly its box').to.be.at.most(element.clientHeight);
    const top = element.shadowRoot!.querySelector('.top')!.getBoundingClientRect().top;
    scroller.scrollTop = 200;
    scroller.dispatchEvent(new Event('scroll'));
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('.top')!.getBoundingClientRect().top).to.equal(top);
    expect(element.shadowRoot!.querySelector('.top')!.classList.contains('is-scrolled'), 'and shows it is over the rows').to.equal(true);
  });

  it('keeps its controls at the one height under every theme and edge width', async () => {
    for (const theme of [undefined, 'umbraco', 'umbraco4', 'macos', 'win11', 'win98']) {
      for (const edge of ['0px', '1px', '2px']) {
        const label = `edge ${edge} under ${theme ?? 'no theme'}`;
        const element = await mount(many(UMBRACOFFEE_EPISODE_PAGE_SIZE + 1));
        element.style.setProperty('--umbradesktop-app-edge-width', edge);
        if (theme) element.setAttribute('data-umbradesktop-theme', theme);
        await element.updateComplete;
        const field = element.shadowRoot!.querySelector('.search')!;
        expect(field.getBoundingClientRect().height, `search, ${label}`).to.be.closeTo(UMBRACOFFEE_FIELD_HEIGHT, 0.5);
        const more = element.shadowRoot!.querySelector<HTMLButtonElement>('.more')!;
        expect(more.getBoundingClientRect().height, `Show more, ${label}`).to.be.closeTo(UMBRACOFFEE_FIELD_HEIGHT, 0.5);
        await search(element, 'zzz');
        const clear = element.shadowRoot!.querySelector<HTMLButtonElement>('.none button')!;
        expect(clear.getBoundingClientRect().height, `Show all episodes, ${label}`).to.be.closeTo(UMBRACOFFEE_FIELD_HEIGHT, 0.5);
        removeBoxes();
      }
    }
  });

  it('changes no row size between themes', async () => {
    const element = await mount([episodeOf({ ...EPISODES[0]!, guests: [guest('Sam Smith')] }), ...EPISODES.slice(1)], { current: 'v0', lead: UPCOMING });
    const sizes = () => rows(element).map((r) => `${r.getBoundingClientRect().width}x${r.getBoundingClientRect().height}`);
    const plain = sizes();
    for (const theme of ['umbraco', 'umbraco4', 'macos', 'win11', 'win98']) {
      element.setAttribute('data-umbradesktop-theme', theme);
      await element.updateComplete;
      expect(sizes(), theme).to.deep.equal(plain);
    }
  });
});
