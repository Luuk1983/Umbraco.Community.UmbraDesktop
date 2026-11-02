import { expect, fixture, html, oneEvent, waitUntil } from '@open-wc/testing';
import type { UmbraDesktopAddOnsSource } from './add-ons-data.js';
import type { UmbraDesktopMarketplacePackage } from './marketplace.js';
import type { UmbraDesktopAddOnsElement } from './add-ons.element.js';
import { UMBRADESKTOP_BUILT_IN_ADD_ONS } from './built-in.js';
import { UMBRADESKTOP_OPEN_HELP_EVENT } from '../constants.js';
import en from '../localization/en.js';
import { umbLocalizationManager } from '@umbraco-cms/backoffice/localization-api';
import './add-ons.element.js';

// The real English strings, so a check can read what a person reads, numbers and all. A bare test
// page has no localization registered, and a term with arguments would come back as its key.
umbLocalizationManager.registerLocalization({
  $code: 'en',
  $dir: 'ltr',
  ...Object.fromEntries(Object.entries(en.umbraDesktop).map(([key, value]) => [`umbraDesktop_${key}`, value])),
} as never);

/**
 * A package from the Marketplace. Every check below compares strings and booleans rather than DOM
 * nodes, because a failing assertion over a Lit element hangs the runner instead of printing a diff.
 * @param packageId Its id.
 * @param overrides What a case changes.
 * @returns The package.
 */
const pkg = (packageId: string, overrides: Partial<UmbraDesktopMarketplacePackage> = {}): UmbraDesktopMarketplacePackage => ({
  packageId,
  title: packageId.split('.').pop(),
  authors: 'Someone',
  description: `About ${packageId}.`,
  iconSourceUrl: `https://icons.example/${packageId}.png`,
  iconDominantColor: '#6b3fa0',
  screenshots: [
    { sourceUrl: `https://shots.example/${packageId}/1.png`, caption: 'First.' },
    { sourceUrl: `https://shots.example/${packageId}/2.png`, caption: 'Second.' },
  ],
  readMeContent: '<p>Read me. <a href="https://github.com/x">Code</a></p><script>window.hacked = true</script>',
  umbracoMajorVersionsSupported: [17],
  versionDetails: [{ umbracoVersionNumber: '17.0.0', latestPackageVersionNumber: '17.4.0' }],
  licenseTypes: ['Free'],
  numberOfNuGetDownloads: 865,
  documentationUrl: 'https://docs.example/',
  issueTrackerUrl: 'https://issues.example/',
  ...overrides,
});

const ENT = 'Umbraco.Community.UmbraDesktop.Entertainment';
const ACC = 'Umbraco.Community.UmbraDesktop.Accessories';

/**
 * A source answering from fixed values, counting Marketplace calls.
 * @param values What each call returns.
 * @returns The source and its call count.
 */
function source(values: {
  marketplace?: UmbraDesktopMarketplacePackage[];
  installed?: Record<string, string>;
  guides?: Record<string, string>;
}) {
  const calls = { marketplace: 0 };
  const value: UmbraDesktopAddOnsSource = {
    marketplace: async () => {
      calls.marketplace++;
      return values.marketplace;
    },
    installed: async () => new Map(Object.entries(values.installed ?? {}).map(([id, version]) => [id.toLowerCase(), version])),
    siteVersion: async () => '17.6.0',
    guide: async (id) => values.guides?.[id],
  };
  return { value, calls };
}

/**
 * Mounts the app over a source and waits for the list.
 * @param from The source.
 * @returns The element.
 */
async function mount(from: UmbraDesktopAddOnsSource): Promise<UmbraDesktopAddOnsElement> {
  const element = document.createElement('umbradesktop-add-ons') as UmbraDesktopAddOnsElement;
  element.source = from;
  await fixture(html`<div style="width: 1000px; height: 700px">${element}</div>`);
  await waitUntil(() => element.shadowRoot?.querySelector('.list'), 'the list never showed');
  return element;
}

/** The shadow root. */
const root = (element: UmbraDesktopAddOnsElement) => element.shadowRoot!;

/** The titles of the cards in a section, in order. */
const titles = (element: UmbraDesktopAddOnsElement, section: 'ours' | 'community') =>
  [...root(element).querySelectorAll(`[data-section="${section}"] .card .title`)].map((title) => title.textContent!.trim());

/** A card by its package id. */
const card = (element: UmbraDesktopAddOnsElement, id: string) =>
  root(element).querySelector<HTMLElement>(`.card[data-add-on="${id}"]`)!;

/**
 * Opens an add-on's details by clicking its card's description, which is not the title and not the
 * Details link: the whole card opens it.
 * @param element The app.
 * @param id The package id.
 */
async function openDetails(element: UmbraDesktopAddOnsElement, id: string) {
  card(element, id).querySelector<HTMLElement>('.description')!.click();
  await waitUntil(() => root(element).querySelector('.details-page'), 'the details never showed');
  await element.updateComplete;
}

/** The side panel's state and its install line, if it has one. */
const panel = (element: UmbraDesktopAddOnsElement) => {
  const state = root(element).querySelector<HTMLElement>('.state');
  return {
    state: state?.dataset.state ?? null,
    line: state?.querySelector('.command code')?.textContent?.trim() ?? null,
    copies: (state?.querySelector('.command uui-button-copy-text') as (HTMLElement & { text?: string }) | null)?.text ?? null,
    text: state?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  };
};

describe('umbradesktop-add-ons', () => {
  describe('the list', () => {
    it('shows ours first, then the community’s', async () => {
      const element = await mount(source({ marketplace: [pkg('Someone.Kanban'), pkg(ACC), pkg(ENT)] }).value);
      expect(titles(element, 'ours')).to.deep.equal(['Entertainment', 'Accessories']);
      expect(titles(element, 'community')).to.deep.equal(['Kanban']);
      const sections = [...root(element).querySelectorAll('[data-section]')].map((s) => (s as HTMLElement).dataset.section);
      expect(sections).to.deep.equal(['ours', 'community']);
    });

    it('covers a card with its first screenshot, from the top', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT)] }).value);
      const cover = card(element, ENT).querySelector('.cover img');
      expect(cover?.getAttribute('src')).to.equal(`https://shots.example/${ENT}/1.png`);
      expect(getComputedStyle(cover!).objectPosition.startsWith('50% 0%') || getComputedStyle(cover!).objectPosition.includes('top')).to.equal(true);
    });

    it('covers a card without screenshots with its icon on its dominant colour', async () => {
      const element = await mount(source({ marketplace: [pkg('Someone.Kanban', { screenshots: [] })] }).value);
      const cover = card(element, 'Someone.Kanban').querySelector<HTMLElement>('.cover')!;
      expect(cover.classList.contains('fallback')).to.equal(true);
      expect(getComputedStyle(cover).backgroundColor).to.equal('rgb(107, 63, 160)');
      expect(cover.querySelector('img')?.getAttribute('src')).to.equal('https://icons.example/Someone.Kanban.png');
    });

    it('says on every card that it opens, and whether it is installed', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT), pkg(ACC)], installed: { [ACC]: '17.4.0' } }).value);
      expect(card(element, ENT).querySelector('.details-link')?.textContent?.trim()).to.match(/Details|addOnsDetails/);
      expect(card(element, ENT).querySelector('uui-tag')?.dataset.installed).to.equal('false');
      expect(card(element, ACC).querySelector('uui-tag')?.dataset.installed).to.equal('true');
    });

    it('puts the invitation in the community’s place when it has none', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT)] }).value);
      const community = root(element).querySelector('[data-section="community"]')!;
      expect(!!community.querySelector('.invitation')).to.equal(true);
      expect(root(element).querySelectorAll('.invitation').length).to.equal(1);
    });

    it('puts the invitation at the bottom when there are community add-ons', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT), pkg('Someone.Kanban')] }).value);
      const community = root(element).querySelector('[data-section="community"]')!;
      expect(!!community.querySelector('.invitation')).to.equal(false);
      const list = root(element).querySelector('.list')!;
      const last = [...list.children].filter((child) => child.classList.contains('invitation') || child.matches('[data-section]'));
      expect(last[last.length - 1].classList.contains('invitation')).to.equal(true);
    });

    it('names where the list came from in a footer that stays in view while the list scrolls', async () => {
      const many = Array.from({ length: 12 }, (_, i) => pkg(`Someone.Addon${String(i).padStart(2, '0')}`));
      const element = await mount(source({ marketplace: many }).value);
      element.style.height = '300px';
      const footer = root(element).querySelector<HTMLElement>('footer')!;
      expect(footer.textContent).to.include('Showing add-ons for Umbraco 17');
      expect(!!root(element).querySelector('.scroller footer'), 'not inside what scrolls').to.equal(false);
      const scroller = root(element).querySelector<HTMLElement>('.scroller')!;
      scroller.scrollTop = 10000;
      const host = element.getBoundingClientRect();
      const foot = footer.getBoundingClientRect();
      expect(Math.round(foot.bottom)).to.equal(Math.round(host.bottom));
    });

    it('says offline in the footer that the list is the built-in one', async () => {
      const element = await mount(source({ marketplace: undefined }).value);
      expect(root(element).querySelector('footer')!.textContent).to.include('built into the desktop');
    });

    it('heads each section with an icon and how many add-ons it holds', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT), pkg(ACC), pkg('Someone.Kanban')] }).value);
      const heading = (section: string) => root(element).querySelector(`[data-section="${section}"] h2`)!;
      // Never Umbraco's own mark: the app is a community package's, and the logo would read as official.
      expect(heading('ours').querySelector('uui-icon')?.getAttribute('name')).to.equal('icon-desktop');
      expect(root(element).querySelector('uui-icon[name="icon-umbraco"]')).to.equal(null);
      expect(heading('ours').querySelector('.count')?.textContent?.trim()).to.equal('2');
      expect(heading('community').querySelector('.count')?.textContent?.trim()).to.equal('1');
    });

    it('asks the Marketplace once, and not again when reopened in the same element', async () => {
      const { value, calls } = source({ marketplace: [pkg(ENT)] });
      const element = await mount(value);
      await openDetails(element, ENT);
      (root(element).querySelector('.back') as HTMLElement).click();
      await waitUntil(() => root(element).querySelector('.list'));
      expect(calls.marketplace).to.equal(1);
    });
  });

  describe('the details page', () => {
    it('shows the screenshots with their captions, the facts and the three links', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT)] }).value);
      await openDetails(element, ENT);
      const page = root(element).querySelector('.details-page')!;
      expect(page.querySelector('h1')?.textContent?.trim()).to.equal('Entertainment');
      expect([...page.querySelectorAll('figure img')].map((img) => img.getAttribute('src'))).to.deep.equal([
        `https://shots.example/${ENT}/1.png`,
        `https://shots.example/${ENT}/2.png`,
      ]);
      expect([...page.querySelectorAll('figcaption')].map((c) => c.textContent!.trim())).to.deep.equal(['First.', 'Second.']);
      const facts = page.querySelector('.facts')!.textContent!.replace(/\s+/g, ' ');
      expect(facts).to.include('17.4.0');
      expect(facts).to.include('Free');
      expect(facts).to.include('865');
      const links = [...page.querySelectorAll<HTMLAnchorElement>('.links a')];
      expect(links.map((a) => a.getAttribute('href'))).to.deep.equal([
        `https://marketplace.umbraco.com/package/${ENT.toLowerCase()}`,
        'https://docs.example/',
        'https://issues.example/',
      ]);
      expect(links.every((a) => a.target === '_blank' && a.dataset.routerSlot === 'disabled')).to.equal(true);
    });

    it('renders the README sanitised, with its links out of the router’s reach', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT)] }).value);
      await openDetails(element, ENT);
      const readme = root(element).querySelector('.readme')!;
      expect(readme.textContent).to.include('Read me.');
      expect(readme.querySelector('script')).to.equal(null);
      expect((window as unknown as { hacked?: boolean }).hacked).to.equal(undefined);
      const link = readme.querySelector('a')!;
      expect(link.target).to.equal('_blank');
      expect(link.dataset.routerSlot).to.equal('disabled');
    });

    it('goes back to the list', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT)] }).value);
      await openDetails(element, ENT);
      (root(element).querySelector('.back') as HTMLElement).click();
      await waitUntil(() => root(element).querySelector('.list'), 'never came back');
      expect(root(element).querySelector('.details-page')).to.equal(null);
    });

    it('opens the details at the top, and goes back to where the list was scrolled', async () => {
      const many = Array.from({ length: 12 }, (_, i) => pkg(`Someone.Addon${String(i).padStart(2, '0')}`));
      const element = await mount(source({ marketplace: many }).value);
      element.style.height = '300px';
      const scroller = root(element).querySelector<HTMLElement>('.scroller')!;
      scroller.scrollTop = 400;
      const scrolled = scroller.scrollTop;
      expect(scrolled).to.be.greaterThan(0);
      await openDetails(element, 'Someone.Addon11');
      await element.updateComplete;
      expect(root(element).querySelector<HTMLElement>('.scroller')!.scrollTop).to.equal(0);
      (root(element).querySelector('.back') as HTMLElement).click();
      await waitUntil(() => root(element).querySelector('.list'), 'never came back');
      await element.updateComplete;
      expect(root(element).querySelector<HTMLElement>('.scroller')!.scrollTop).to.equal(scrolled);
    });
  });

  describe('the side panel', () => {
    it('gives the install line pinned to the newest version for this major when it is not installed', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT)] }).value);
      await openDetails(element, ENT);
      expect(panel(element).state).to.equal('not-installed');
      expect(panel(element).line).to.equal(`dotnet add package ${ENT} --version 17.4.0`);
      expect(panel(element).copies, 'Copy copies exactly the line shown').to.equal(panel(element).line);
    });

    it('shows the whole install line, wrapped, so the version at its end is never scrolled out of sight', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT)] }).value);
      element.style.width = '420px';
      await openDetails(element, ENT);
      const code = root(element).querySelector<HTMLElement>('.command code')!;
      expect(code.scrollWidth <= code.clientWidth, 'no horizontal overflow').to.equal(true);
    });

    it('gives the install line for the newer version when an update is available', async () => {
      const element = await mount(source({ marketplace: [pkg(ENT)], installed: { [ENT]: '17.3.0' } }).value);
      await openDetails(element, ENT);
      expect(panel(element).state).to.equal('update');
      expect(panel(element).line).to.equal(`dotnet add package ${ENT} --version 17.4.0`);
      expect(panel(element).text).to.include('17.3.0');
      expect(panel(element).text, 'its apps are already in the launcher').not.to.include('appear in your launcher');
    });

    it('says it is installed and offers its guide in Help', async () => {
      const element = await mount(source({ marketplace: [pkg(ACC)], installed: { [ACC]: '17.4.0' }, guides: { [ACC]: 'accessories' } }).value);
      await openDetails(element, ACC);
      expect(panel(element).state).to.equal('installed');
      expect(panel(element).line).to.equal(null);
      expect(panel(element).text).to.include('17.4.0');
      await waitUntil(() => root(element).querySelector('.guide'), 'no guide button');
      const asked = oneEvent(element, UMBRADESKTOP_OPEN_HELP_EVENT);
      (root(element).querySelector('.guide') as HTMLElement).click();
      expect(((await asked) as CustomEvent).detail).to.deep.equal({ target: 'accessories' });
    });

    it('offers no guide when no installed docs name the package', async () => {
      const element = await mount(source({ marketplace: [pkg('Someone.Kanban')], installed: { 'Someone.Kanban': '17.4.0' } }).value);
      await openDetails(element, 'Someone.Kanban');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(root(element).querySelector('.guide')).to.equal(null);
    });
  });

  describe('offline', () => {
    it('shows our own add-ons from the built-in list, with icon covers, and says why the community is empty', async () => {
      const element = await mount(source({ marketplace: undefined, installed: { 'Umbraco.Community.UmbraDesktop': '17.4.0' } }).value);
      expect(titles(element, 'ours')).to.deep.equal(UMBRADESKTOP_BUILT_IN_ADD_ONS.map((a) => a.title));
      expect([...root(element).querySelectorAll('[data-section="ours"] .cover')].every((c) => c.classList.contains('fallback'))).to.equal(true);
      const community = root(element).querySelector('[data-section="community"]')!;
      expect(!!community.querySelector('.offline')).to.equal(true);
      expect(community.querySelectorAll('.card').length).to.equal(0);
    });

    it('still gives a pinned install line for ours', async () => {
      const element = await mount(source({ marketplace: undefined, installed: { 'Umbraco.Community.UmbraDesktop': '17.4.0' } }).value);
      await openDetails(element, ENT);
      expect(panel(element).line).to.equal(`dotnet add package ${ENT} --version 17.4.0`);
    });

    it('claims no newest version for an installed add-on, since only the Marketplace knows it', async () => {
      const installed = { 'Umbraco.Community.UmbraDesktop': '17.4.0', [ENT]: '17.4.0' };
      const element = await mount(source({ marketplace: undefined, installed }).value);
      await openDetails(element, ENT);
      expect(panel(element).state).to.equal('installed');
      expect(panel(element).text).not.to.include('newest');
    });

    it('tries again when asked, and shows the Marketplace once it answers', async () => {
      let online = false;
      const from: UmbraDesktopAddOnsSource = {
        marketplace: async () => (online ? [pkg(ENT), pkg('Someone.Kanban')] : undefined),
        installed: async () => new Map(),
        siteVersion: async () => '17.6.0',
        guide: async () => undefined,
      };
      const element = await mount(from);
      online = true;
      (root(element).querySelector('.offline .retry') as HTMLElement).click();
      await waitUntil(() => titles(element, 'community').length === 1, 'never came online');
      expect(root(element).querySelector('.offline')).to.equal(null);
    });
  });
});
