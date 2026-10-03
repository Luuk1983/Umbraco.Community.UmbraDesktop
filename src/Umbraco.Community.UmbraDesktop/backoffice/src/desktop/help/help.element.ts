import { css, customElement, html, nothing, property, repeat, state, svg } from '@umbraco-cms/backoffice/external/lit';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { normaliseDocsManifests } from './docs-sources';
import { loadHelpProducts, serverDocsFetcher } from './help-loader';
import {
  helpGuides,
  resolveHelpTarget,
  UMBRADESKTOP_HELP_LANDING_LOCATION,
  type UmbraDesktopHelpGuide,
  type UmbraDesktopHelpPageView,
  type UmbraDesktopHelpView,
} from './help-navigation';
import type { UmbraDesktopHelpCategory, UmbraDesktopHelpPage, UmbraDesktopHelpProduct } from './help-product';
import { renderHelpPage } from './help-render';
import { searchHelp } from './help-search';
import { formatHelpTarget, parseHelpTarget, type UmbraDesktopHelpTarget } from './help-target';
import { UMBRADESKTOP_APP_LOCATION_EVENT } from '../constants';

/** Console lines already printed this visit, so reopening Help does not repeat them. */
const printed = new Set<string>();

/**
 * How far below the top of the scroll area a heading counts as the section being read, for "On this
 * page". About two lines, so a heading just scrolled to is current rather than the one above it.
 */
const READING_LINE = 48;

/**
 * Loads the products registered through `umbraDesktopDocs`, the only route there is (Help design
 * D3). Resolves on the registry's first answer: docs manifests arrive with their packages' bundles,
 * which are loaded before anyone can open the desktop, so there is no later answer worth waiting for.
 * @param host The Help element, which owns the initializer and the requests.
 * @returns The products, in picker order.
 */
async function loadFromRegistry(host: UmbLitElement): Promise<UmbraDesktopHelpProduct[]> {
  const manifests = await new Promise<unknown[]>((resolve) => {
    new UmbExtensionsManifestInitializer(
      host,
      umbExtensionsRegistry,
      'umbraDesktopDocs',
      null,
      (permitted) => resolve(permitted.map((controller) => controller.manifest)),
      'umbraDesktopHelpDocs',
    );
  });
  const { sources, reports } = normaliseDocsManifests(manifests, window.location.origin);
  const loaded = await loadHelpProducts(sources, serverDocsFetcher(host));
  for (const report of [...reports, ...loaded.reports]) {
    if (printed.has(report.key)) continue;
    printed.add(report.key);
    console.warn(report.message);
  }
  return loaded.products;
}

/** The arrow beside a category in the sidebar, pointing right; the stylesheet turns it down when open. */
const chevron = svg`<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The picture on a landing card whose guide names no image of its own: an open book. */
const book = svg`<svg viewBox="0 0 64 48" aria-hidden="true" focusable="false"><path d="M32 10c-6-4-15-5-24-4v32c9-1 18 0 24 4 6-4 15-5 24-4V6c-9-1-18 0-24 4Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 10v32" stroke="currentColor" stroke-width="2.5"/><path d="M14 16c4-.4 8 0 12 1.6M14 23c4-.4 8 0 12 1.6M14 30c4-.4 8 0 12 1.6M38 17.6c4-1.6 8-2 12-1.6M38 24.6c4-1.6 8-2 12-1.6M38 31.6c4-1.6 8-2 12-1.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/></svg>`;

/**
 * The Help app: the documentation of every installed package that brings some, for the version
 * installed, read from the site itself (Help design §4).
 *
 * It opens on a landing page with a card for every guide: each product's user guide, and its
 * developer guide as a guide of its own. A guide's page has the guide's sidebar on the left, folded
 * to its top level, a breadcrumb above the page, and the page's sections under "On this page" on the
 * right, in one column centred once the window is wider than it needs (design §4.2).
 *
 * Several can be open at once (D5), so everything a window shows lives on the window: its
 * `location` is a target string, set by whoever opened it and set again when the desktop reopens it
 * after a reload, and every move it makes is reported with {@link UMBRADESKTOP_APP_LOCATION_EVENT}
 * so the desktop can save it (D7) and find it again (D6).
 *
 * The page is rendered imperatively into its `<article>`, outside Lit's template: it is a sanitised
 * fragment built by `renderHelpPage`, and letting Lit own it would mean re-rendering the whole page
 * on every keystroke in the search box.
 */
@customElement('umbradesktop-help')
export class UmbraDesktopHelpElement extends UmbLitElement {
  /**
   * Where the window is: a target string (`product/page/heading`), or unset or
   * {@link UMBRADESKTOP_HELP_LANDING_LOCATION} for the landing page.
   */
  @property({ attribute: false })
  location?: string;

  /**
   * How the products are loaded. The registry and the server by default; a test replaces it before
   * the element connects, so the element can be tested without either.
   */
  loadProducts: (host: UmbLitElement) => Promise<UmbraDesktopHelpProduct[]> = loadFromRegistry;

  /** Every installed product, or undefined while loading. */
  @state()
  private _products?: UmbraDesktopHelpProduct[];

  /** What the window shows. */
  @state()
  private _view?: UmbraDesktopHelpView;

  /** What is typed in the search box. */
  @state()
  private _query = '';

  /** Whether the sidebar is shown over the page, in a window too narrow to show both. */
  @state()
  private _contentsOpen = false;

  /**
   * The categories unfolded in the sidebar, by folder. The category of every page shown is added,
   * so the sidebar always shows where the reader is; the arrows add and remove the rest.
   */
  @state()
  private _expanded = new Set<string>();

  /** The section being read, for "On this page": a heading anchor. */
  @state()
  private _reading?: string;

  /** The location the view was last shown for, so a location set to what is already shown is ignored. */
  #shownLocation?: string;

  /** Which page the article holds, so it is only rebuilt when the page changes. */
  #renderedPage?: UmbraDesktopHelpPage;

  /** The heading to scroll to once the article is rendered. */
  #pendingScroll?: string | 'top';

  /** The frame a scroll update is waiting for, so a burst of scroll events costs one measurement. */
  #readingFrame = 0;

  /** Loads the products and shows the location. */
  override connectedCallback(): void {
    super.connectedCallback();
    if (this._products) return;
    void this.loadProducts(this).then((products) => {
      this._products = products;
      this.#show(parseHelpTarget(this.location), true);
    });
  }

  /** Drops a pending scroll measurement. */
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.#readingFrame);
  }

  /**
   * Follows a location set from outside: the desktop reusing this window for a target, or restoring
   * it after a reload.
   * @param changed The changed properties.
   */
  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('location') && this._products && this.location !== this.#shownLocation) {
      this.#show(parseHelpTarget(this.location), false);
    }
  }

  /**
   * Shows a target, and reports where the window ended up.
   * @param target Where to go; undefined for the landing page.
   * @param report Whether to report the location. Not when the location came from outside, since
   *   the desktop already knows it.
   */
  #show(target: UmbraDesktopHelpTarget | undefined, report: boolean): void {
    const view = resolveHelpTarget(this._products ?? [], target);
    this._view = view;
    this._contentsOpen = false;
    if (!view) return;
    this.#pendingScroll = view.kind === 'page' ? (view.heading ?? 'top') : 'top';
    this._reading = view.kind === 'page' ? view.heading : undefined;
    if (view.kind === 'page' && view.category && !this._expanded.has(view.category.folder)) {
      this._expanded = new Set(this._expanded).add(view.category.folder);
    }
    const location =
      view.kind === 'page'
        ? formatHelpTarget({ product: view.product.id, page: view.page.id, heading: view.heading })
        : UMBRADESKTOP_HELP_LANDING_LOCATION;
    // A window opened from the launcher has no location, and its landing page is not worth reporting
    // until it moves somewhere else.
    const unchanged = this.location === undefined && location === UMBRADESKTOP_HELP_LANDING_LOCATION;
    this.#shownLocation = unchanged ? undefined : location;
    if (!unchanged) this.location = location;
    if (report && !unchanged) {
      this.dispatchEvent(new CustomEvent(UMBRADESKTOP_APP_LOCATION_EVENT, { detail: { location }, bubbles: true, composed: true }));
    }
  }

  /**
   * Goes somewhere in response to the reader: a link, the sidebar, a search result.
   * @param target Where to go; undefined for the landing page.
   */
  #go(target: UmbraDesktopHelpTarget | undefined): void {
    this._query = '';
    this.#show(target, true);
  }

  /**
   * Opens a guide at its front page.
   * @param guide The guide.
   */
  #openGuide(guide: UmbraDesktopHelpGuide): void {
    this.#go({ product: guide.product.id, page: guide.part.frontPage!.id });
  }

  /**
   * Puts the page into the article when it changed, then scrolls to where the target points.
   * @param changed The changed properties.
   */
  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const view = this._view;
    const scroller = this.shadowRoot?.querySelector<HTMLElement>('.scroller');
    const article = this.shadowRoot?.querySelector('article');
    if (view?.kind === 'page' && article && this.#renderedPage !== view.page) {
      article.replaceChildren(renderHelpPage(view, this._products ?? []));
      this.#renderedPage = view.page;
    } else if (view?.kind !== 'page') {
      this.#renderedPage = undefined;
    }
    const scroll = this.#pendingScroll;
    this.#pendingScroll = undefined;
    if (!scroller || !scroll) return;
    if (scroll === 'top') scroller.scrollTop = 0;
    else this.shadowRoot!.getElementById(scroll)?.scrollIntoView({ block: 'start' });
  }

  /**
   * Keeps "On this page" on the section being read: the last section whose heading has passed the
   * reading line. Measured once per frame however many scroll events arrive.
   */
  #onScroll = (): void => {
    cancelAnimationFrame(this.#readingFrame);
    this.#readingFrame = requestAnimationFrame(() => {
      const scroller = this.shadowRoot?.querySelector<HTMLElement>('.scroller');
      const view = this._view;
      if (!scroller || view?.kind !== 'page') return;
      const line = scroller.getBoundingClientRect().top + READING_LINE;
      const headings = this.#tocHeadings(view.page);
      let reading: string | undefined;
      for (const heading of headings) {
        const element = this.shadowRoot!.getElementById(heading.anchor);
        if (element && element.getBoundingClientRect().top <= line) reading = heading.anchor;
      }
      // At the very bottom the last sections may never reach the line, so the last one is current.
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) reading = headings[headings.length - 1]?.anchor ?? reading;
      this._reading = reading;
    });
  };

  /**
   * The headings "On this page" lists: the page's sections and their subsections. Not the title,
   * which is the page itself.
   * @param page The page.
   * @returns The headings, in order.
   */
  #tocHeadings(page: UmbraDesktopHelpPage) {
    return page.headings.filter((heading) => heading.level === 2 || heading.level === 3);
  }

  /**
   * Follows a link in the page. Only a plain click is taken over: a click with a modifier, or a
   * middle click, keeps the browser's own behaviour, which for an in-app link is the deep link in a
   * new tab.
   * @param event The click.
   */
  #onArticleClick = (event: MouseEvent): void => {
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-help-kind]');
    const view = this._view;
    if (!anchor || view?.kind !== 'page') return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const kind = anchor.dataset.helpKind;
    if (kind === 'page') {
      event.preventDefault();
      const target = parseHelpTarget(anchor.dataset.helpTarget);
      if (target) this.#go(target);
    } else if (kind === 'anchor') {
      event.preventDefault();
      this.#go({ product: view.product.id, page: view.page.id, heading: anchor.dataset.helpHeading });
    }
  };

  /**
   * Switches guide with the picker.
   * @param event The select's change.
   */
  #onGuideChange = (event: Event): void => {
    const guide = helpGuides(this._products ?? [])[(event.target as HTMLSelectElement).selectedIndex];
    if (guide) this.#openGuide(guide);
  };

  /**
   * Follows the search box.
   * @param event The input event.
   */
  #onSearch = (event: Event): void => {
    this._query = (event.target as HTMLInputElement).value;
  };

  /**
   * Folds a category in the sidebar open or closed.
   * @param category The category.
   */
  #toggle(category: UmbraDesktopHelpCategory): void {
    const expanded = new Set(this._expanded);
    if (!expanded.delete(category.folder)) expanded.add(category.folder);
    this._expanded = expanded;
  }

  /**
   * What a guide is called, in the picker and on its card: the product's name for its user guide,
   * and "for developers" after it for its developer guide.
   * @param guide The guide.
   * @returns Its name.
   */
  #guideLabel(guide: UmbraDesktopHelpGuide): string {
    const name = guide.product.name;
    return guide.part.part === 'user' ? name : this.localize.termOrDefault('umbraDesktop_helpGuideDeveloper', `${name} for developers`, name);
  }

  /**
   * A sidebar entry for one page.
   * @param view The page shown.
   * @param page The page the entry opens.
   * @param label Its label, when it is not the page's title.
   * @returns The entry.
   */
  #pageEntry(view: UmbraDesktopHelpPageView, page: UmbraDesktopHelpPage, label = page.title) {
    return html`<li>
      <div class="tree-row">
        <button
          type="button"
          class="tree-entry"
          aria-current=${view.page === page ? 'page' : nothing}
          @click=${() => this.#go({ product: view.product.id, page: page.id })}
        ><span class="tree-label">${label}</span></button>
      </div>
    </li>`;
  }

  /**
   * A sidebar entry for a category: selecting it opens its overview and unfolds it; its arrow only
   * folds and unfolds. A category without an overview has nothing to open, so selecting it folds.
   * @param view The page shown.
   * @param category The category.
   * @returns The entry, and its pages when unfolded.
   */
  #categoryEntry(view: UmbraDesktopHelpPageView, category: UmbraDesktopHelpCategory) {
    const open = this._expanded.has(category.folder);
    const index = category.index;
    const onSelect = () => {
      if (!index) return this.#toggle(category);
      if (!open) this.#toggle(category);
      this.#go({ product: view.product.id, page: index.id });
    };
    return html`<li class="category" ?data-open=${open}>
      <div class="tree-row">
        <button type="button" class="tree-entry" aria-current=${index && view.page === index ? 'page' : nothing} @click=${onSelect}>
          <span class="tree-label">${category.label}</span>
        </button>
        <button
          type="button"
          class="tree-toggle"
          aria-expanded=${open ? 'true' : 'false'}
          aria-label=${this.localize.termOrDefault('umbraDesktop_helpCategoryPages', `Pages in ${category.label}`, category.label)}
          @click=${() => this.#toggle(category)}
        >${chevron}</button>
      </div>
      ${open ? html`<ul>${repeat(category.pages, (page) => page.id, (page) => this.#pageEntry(view, page))}</ul>` : nothing}
    </li>`;
  }

  /**
   * The sidebar's tree for the guide being read, folded to its top level apart from the branch the
   * page is on.
   * @param view The page shown.
   * @returns The tree.
   */
  #renderTree(view: UmbraDesktopHelpPageView) {
    const part = view.part;
    return html`<ul class="tree">
      ${part.index ? this.#pageEntry(view, part.index) : nothing}
      ${repeat(part.pages, (page) => page.id, (page) => this.#pageEntry(view, page))}
      ${repeat(part.categories, (category) => category.folder, (category) => this.#categoryEntry(view, category))}
    </ul>`;
  }

  /**
   * The search results for the current query, from the guide being read.
   * @param view The page shown.
   * @returns The list, or a line saying nothing matched.
   */
  #renderResults(view: UmbraDesktopHelpPageView) {
    const product = view.product;
    const results = searchHelp(product, this._query, { part: view.part.part });
    if (results.length === 0) {
      const name = this.#guideLabel(view);
      return html`<p class="muted search-nothing">${this.localize.termOrDefault('umbraDesktop_helpSearchNothing', `Nothing in ${name} matches that.`, name)}</p>`;
    }
    return html`<ul class="results">
      ${repeat(
        results,
        (result) => `${result.page.id}#${result.heading?.anchor ?? ''}`,
        (result) => html`<li>
          <button type="button" @click=${() => this.#go({ product: product.id, page: result.page.id, heading: result.heading?.anchor })}>
            <span class="result-title">${result.page.title}</span>
            ${result.heading ? html`<span class="result-heading">${result.heading.text}</span>` : nothing}
            ${result.snippet ? html`<span class="result-snippet">${result.snippet}</span>` : nothing}
          </button>
        </li>`,
      )}
    </ul>`;
  }

  /**
   * The notice above a page that is not exactly what was asked for.
   * @param view The view.
   * @returns The notice, or nothing.
   */
  #renderNotice(view: UmbraDesktopHelpView) {
    if (!view.notice) return nothing;
    const text =
      view.notice.kind === 'page-missing'
        ? this.localize.termOrDefault(
            'umbraDesktop_helpPageMissing',
            `That page is not in this version of the ${view.notice.name} documentation, so this is its front page instead.`,
            view.notice.name,
          )
        : this.localize.termOrDefault(
            'umbraDesktop_helpProductMissing',
            `The documentation for "${view.notice.name}" is not installed on this site. This is all the documentation that is.`,
            view.notice.name,
          );
    return html`<p class="notice" role="status">${text}</p>`;
  }

  /**
   * The landing page: a card for every user guide, with its front page's picture and description,
   * and the developer guides below them as a plain list. Most people opening Help want to know how to
   * do something; the developer guides are there for whoever looks for them, not competing for the
   * first glance.
   * @param guides Every guide.
   * @returns The page.
   */
  #renderLanding(guides: UmbraDesktopHelpGuide[]) {
    const view = this._view!;
    const developers = guides.filter((guide) => guide.part.part !== 'user');
    return html`<div class="landing">
      <h1>${this.localize.termOrDefault('umbraDesktop_appHelp', 'Help')}</h1>
      <p class="lede">
        ${this.localize.termOrDefault(
          'umbraDesktop_helpLandingIntro',
          'The documentation of everything installed on this site that brings its own, for the version installed.',
        )}
      </p>
      ${this.#renderNotice(view)}
      <ul class="cards">
        ${repeat(
          guides.filter((guide) => guide.part.part === 'user'),
          (guide) => `${guide.product.id}/${guide.part.part}`,
          (guide) => {
            const front = guide.part.frontPage!;
            return html`<li>
              <button type="button" class="card" @click=${() => this.#openGuide(guide)}>
                <span class="card-media">
                  ${front.image
                    ? html`<img src="${guide.product.basePath}/${front.image}" alt="" loading="lazy" />`
                    : html`<span class="card-fallback">${book}</span>`}
                </span>
                <span class="card-body">
                  <span class="card-title">${this.#guideLabel(guide)}</span>
                  ${front.description ? html`<span class="card-text">${front.description}</span>` : nothing}
                </span>
              </button>
            </li>`;
          },
        )}
      </ul>
      ${developers.length > 0
        ? html`<section class="developers">
            <h2>${this.localize.termOrDefault('umbraDesktop_helpForDevelopers', 'For developers')}</h2>
            <ul>
              ${repeat(
                developers,
                (guide) => guide.product.id,
                (guide) => html`<li>
                  <button type="button" @click=${() => this.#openGuide(guide)}>
                    <span class="developer-title">${this.#guideLabel(guide)}</span>
                    ${guide.part.frontPage!.description
                      ? html`<span class="developer-text">${guide.part.frontPage!.description}</span>`
                      : nothing}
                  </button>
                </li>`,
              )}
            </ul>
          </section>`
        : nothing}
    </div>`;
  }

  /**
   * The breadcrumb: Help, the guide, the category, then the page. A step that would repeat the page,
   * such as the guide on its own front page, is left out.
   * @param view The page shown.
   * @returns The breadcrumb.
   */
  #renderBreadcrumb(view: UmbraDesktopHelpPageView) {
    const steps: Array<{ label: string; go: () => void }> = [
      { label: this.localize.termOrDefault('umbraDesktop_appHelp', 'Help'), go: () => this.#go(undefined) },
    ];
    const front = view.part.frontPage!;
    if (front !== view.page) steps.push({ label: this.#guideLabel(view), go: () => this.#go({ product: view.product.id, page: front.id }) });
    const index = view.category?.index;
    if (view.category && index !== view.page) {
      const category = view.category;
      steps.push({
        label: category.label,
        go: () => (index ? this.#go({ product: view.product.id, page: index.id }) : this.#toggle(category)),
      });
    }
    return html`<nav class="breadcrumb" aria-label=${this.localize.termOrDefault('umbraDesktop_helpBreadcrumb', 'Breadcrumb')}>
      <ol>
        ${steps.map((step) => html`<li><button type="button" @click=${step.go}>${step.label}</button></li>`)}
        <li><span aria-current="page">${view.page.title}</span></li>
      </ol>
    </nav>`;
  }

  /**
   * "On this page": the page's sections, the one being read marked.
   * @param view The page shown.
   * @returns The list, or nothing for a page without sections.
   */
  #renderToc(view: UmbraDesktopHelpPageView) {
    const headings = this.#tocHeadings(view.page);
    if (headings.length === 0) return nothing;
    const reading = this._reading ?? headings[0].anchor;
    return html`<aside class="toc">
      <h2>${this.localize.termOrDefault('umbraDesktop_helpOnThisPage', 'On this page')}</h2>
      <ul>
        ${repeat(
          headings,
          (heading) => heading.anchor,
          (heading) => html`<li data-level=${heading.level}>
            <button
              type="button"
              aria-current=${heading.anchor === reading ? 'location' : nothing}
              @click=${() => this.#go({ product: view.product.id, page: view.page.id, heading: heading.anchor })}
            >${heading.text}</button>
          </li>`,
        )}
      </ul>
    </aside>`;
  }

  /**
   * The picker's options: the user guides, then the developer guides under a heading of their own.
   * The options stay in {@link helpGuides} order, so an option's index is its guide's.
   * @param guides Every guide.
   * @param current The index of the guide being read.
   * @returns The options.
   */
  #renderOptions(guides: UmbraDesktopHelpGuide[], current: number) {
    const option = (guide: UmbraDesktopHelpGuide) =>
      html`<option ?selected=${guides.indexOf(guide) === current}>${this.#guideLabel(guide)}</option>`;
    const users = guides.filter((guide) => guide.part.part === 'user');
    const developers = guides.filter((guide) => guide.part.part !== 'user');
    return html`${users.map(option)}
    ${developers.length > 0
      ? html`<optgroup label=${this.localize.termOrDefault('umbraDesktop_helpForDevelopers', 'For developers')}>${developers.map(option)}</optgroup>`
      : nothing}`;
  }

  /**
   * A guide's page: sidebar, breadcrumb and article, and "On this page".
   * @param view The page shown.
   * @param guides Every guide, for the picker.
   * @returns The page.
   */
  #renderPage(view: UmbraDesktopHelpPageView, guides: UmbraDesktopHelpGuide[]) {
    const current = guides.findIndex((guide) => guide.product === view.product && guide.part === view.part);
    return html`<div class="layout" ?data-contents-open=${this._contentsOpen}>
      <aside class="sidebar">
        <label class="field">
          <span class="field-label">${this.localize.termOrDefault('umbraDesktop_helpProduct', 'Documentation')}</span>
          <select ?disabled=${guides.length < 2} @change=${this.#onGuideChange}>
            ${this.#renderOptions(guides, current)}
          </select>
        </label>
        <input
          type="search"
          .value=${this._query}
          placeholder=${this.localize.termOrDefault('umbraDesktop_helpSearchPlaceholder', 'Search the documentation')}
          aria-label=${this.localize.termOrDefault('umbraDesktop_helpSearch', 'Search')}
          @input=${this.#onSearch}
        />
        <nav aria-label=${this.localize.termOrDefault('umbraDesktop_helpContents', 'Contents')}>
          ${this._query.trim() ? this.#renderResults(view) : this.#renderTree(view)}
        </nav>
      </aside>
      <main>
        <button
          type="button"
          class="contents-toggle"
          aria-expanded=${this._contentsOpen ? 'true' : 'false'}
          @click=${() => (this._contentsOpen = !this._contentsOpen)}
        >
          ${this.localize.termOrDefault('umbraDesktop_helpContents', 'Contents')}
        </button>
        ${this.#renderBreadcrumb(view)} ${this.#renderNotice(view)}
        <article @click=${this.#onArticleClick}></article>
      </main>
      ${this.#renderToc(view)}
    </div>`;
  }

  /** @inheritdoc */
  override render() {
    if (!this._products) {
      return html`<p class="empty muted" role="status">${this.localize.termOrDefault('umbraDesktop_helpLoading', 'Loading the documentation')}</p>`;
    }
    const view = this._view;
    if (!view) {
      return html`<p class="empty muted">${this.localize.termOrDefault('umbraDesktop_helpNone', 'No documentation is installed on this site.')}</p>`;
    }
    const guides = helpGuides(this._products);
    return html`<div class="scroller" @scroll=${this.#onScroll}>
      ${view.kind === 'landing' ? this.#renderLanding(guides) : this.#renderPage(view, guides)}
    </div>`;
  }

  static override styles = [
    css`
      /* Every colour and shape comes from the app tokens, each with the fallback the contract
         publishes, so the page reads as part of whichever theme the desktop wears (design §4.3). */
      :host {
        --help-surface: var(--umbradesktop-app-surface, var(--uui-color-surface));
        --help-raised: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
        --help-sunken: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
        --help-border: var(--umbradesktop-app-border, var(--uui-color-text-alt));
        --help-rule: var(--umbradesktop-app-edge-dark, var(--uui-color-border));
        --help-text: var(--umbradesktop-app-text, var(--uui-color-text));
        --help-muted: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
        --help-accent: var(--umbradesktop-app-accent, var(--uui-color-selected));
        --help-accent-text: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
        --help-radius: var(--umbradesktop-app-radius, 3px);
        --help-edge: var(--umbradesktop-app-edge-width, 1px);
        /* Derived rather than new tokens: a tint of the accent for the current entry and for hover, so
           a theme with a loud accent colour does not get loud solid bars down its sidebar. */
        --help-tint: color-mix(in srgb, var(--help-accent) 12%, transparent);
        --help-hover: color-mix(in srgb, var(--help-text) 6%, transparent);
        --help-scrollbar: color-mix(in srgb, var(--help-text) 30%, transparent);

        /* The column widths, and the widest the whole thing grows before it centres. */
        --help-sidebar-width: 280px;
        --help-toc-width: 224px;
        --help-measure: 760px;
        --help-max-width: 1400px;

        display: block;
        height: 100%;
        /* Size, not only inline size: the sticky sidebars are as tall as the window, in cqh. */
        container-type: size;
        color: var(--help-text);
        background: var(--help-surface);
        font-family: var(--umbradesktop-app-font, inherit);
        font-size: 15px;
        line-height: 1.6;
      }

      /* Scrollbars appear while the pointer is over what they scroll, as on docs.umbraco.com. */
      .scroller,
      .sidebar,
      .toc {
        scrollbar-width: thin;
        scrollbar-color: transparent transparent;
      }

      .scroller:hover,
      .sidebar:hover,
      .toc:hover {
        scrollbar-color: var(--help-scrollbar) transparent;
      }

      .scroller {
        height: 100%;
        overflow: auto;
      }

      button {
        color: inherit;
        font: inherit;
        cursor: pointer;
      }

      button:focus-visible,
      select:focus-visible,
      input:focus-visible {
        outline: 2px solid var(--help-accent);
        outline-offset: -2px;
      }

      .muted {
        color: var(--help-muted);
      }

      .empty {
        margin: 0;
        padding: 32px;
      }

      .notice {
        margin: 0 0 24px;
        padding: 10px 14px;
        background: var(--help-tint);
        border-left: 3px solid var(--help-accent);
        border-radius: var(--help-radius);
      }

      /* -- The landing page ------------------------------------------------------------------ */

      .landing {
        max-width: var(--help-max-width);
        margin: 0 auto;
        padding: 48px 40px 64px;
        box-sizing: border-box;
      }

      .landing h1 {
        margin: 0 0 8px;
        font-size: 2em;
        line-height: 1.2;
      }

      .lede {
        max-width: var(--help-measure);
        margin: 0 0 32px;
        color: var(--help-muted);
        font-size: 1.1em;
      }

      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 24px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .card {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        padding: 0;
        overflow: hidden;
        text-align: left;
        background: var(--help-surface);
        border: var(--help-edge) solid var(--help-rule);
        border-radius: calc(var(--help-radius) * 2);
        transition: border-color 120ms, box-shadow 120ms;
      }

      .card:hover {
        border-color: var(--help-accent);
        box-shadow: 0 4px 16px color-mix(in srgb, var(--help-text) 10%, transparent);
      }

      .card-media {
        display: block;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--help-sunken);
        border-bottom: var(--help-edge) solid var(--help-rule);
      }

      .card-media img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top left;
      }

      .card-fallback {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--help-accent);
        background: var(--help-tint);
      }

      .card-fallback svg {
        width: 72px;
        height: auto;
      }

      .card-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 16px 20px 20px;
      }

      .card-title {
        font-size: 1.15em;
        font-weight: 700;
      }

      .card-text {
        color: var(--help-muted);
      }

      .developers {
        max-width: var(--help-measure);
        margin-top: 48px;
      }

      /* Set the way a uui-box headline is: bold, at the size of the text around it, and in the case
         it was written in. Umbraco has no small spaced-out capitals anywhere, so a heading set like
         that reads as borrowed from another product. */
      .developers h2 {
        margin: 0 0 8px;
        color: var(--help-muted);
        font-size: 1em;
        font-weight: 700;
      }

      .developers ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .developers button {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        padding: 8px 12px;
        margin-left: -12px;
        text-align: left;
        background: none;
        border: 0;
        border-radius: var(--help-radius);
      }

      .developers button:hover {
        background: var(--help-hover);
      }

      .developer-title {
        color: var(--help-accent);
        font-weight: 700;
      }

      .developer-text {
        color: var(--help-muted);
        font-size: 0.9em;
      }

      /* -- A guide's page -------------------------------------------------------------------- */

      .layout {
        display: grid;
        grid-template-columns: var(--help-sidebar-width) minmax(0, 1fr) var(--help-toc-width);
        max-width: var(--help-max-width);
        margin: 0 auto;
      }

      .sidebar,
      .toc {
        position: sticky;
        top: 0;
        /* A grid item stretched to the row's height has nowhere to stick. */
        align-self: start;
        box-sizing: border-box;
        max-height: 100cqh;
        overflow: auto;
      }

      .sidebar {
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100cqh;
        padding: 32px 16px 32px 24px;
        border-right: var(--help-edge) solid var(--help-rule);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      /* Set as '.developers h2' is, for the same reason. */
      .field-label {
        color: var(--help-muted);
        font-weight: 700;
      }

      select,
      input[type='search'] {
        width: 100%;
        box-sizing: border-box;
        padding: 7px 10px;
        color: var(--help-text);
        background: var(--help-surface);
        border: var(--help-edge) solid var(--help-border);
        border-radius: var(--help-radius);
        font: inherit;
      }

      nav ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .tree {
        margin-top: 8px;
      }

      .tree ul {
        margin: 2px 0 6px 12px;
        padding-left: 8px;
        border-left: var(--help-edge) solid var(--help-rule);
      }

      .tree-row {
        display: flex;
        align-items: stretch;
        border-radius: var(--help-radius);
      }

      .tree-row:hover {
        background: var(--help-hover);
      }

      .tree-entry {
        flex: 1;
        min-width: 0;
        padding: 6px 10px;
        background: none;
        border: 0;
        border-radius: var(--help-radius);
        text-align: left;
      }

      .tree-entry[aria-current='page'] {
        color: var(--help-accent);
        background: var(--help-tint);
        font-weight: 700;
      }

      .tree-toggle {
        display: grid;
        place-items: center;
        flex: none;
        width: 28px;
        padding: 0;
        color: var(--help-muted);
        background: none;
        border: 0;
        border-radius: var(--help-radius);
      }

      .tree-toggle svg {
        width: 14px;
        height: 14px;
        transition: transform 120ms;
      }

      .tree-toggle[aria-expanded='true'] svg {
        transform: rotate(90deg);
      }

      .results button {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        margin-bottom: 4px;
        padding: 8px 10px;
        text-align: left;
        background: none;
        border: 0;
        border-radius: var(--help-radius);
      }

      .results button:hover {
        background: var(--help-hover);
      }

      .result-title {
        font-weight: 700;
      }

      .result-heading,
      .result-snippet,
      .search-nothing {
        color: var(--help-muted);
        font-size: 0.875em;
      }

      .search-nothing {
        padding: 0 10px;
      }

      main {
        min-width: 0;
        padding: 32px 48px 80px;
      }

      .contents-toggle {
        display: none;
      }

      .breadcrumb ol {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        margin: 0 0 16px;
        padding: 0;
        color: var(--help-muted);
        font-size: 0.875em;
        list-style: none;
      }

      .breadcrumb li + li::before {
        content: '/';
        margin: 0 8px;
        opacity: 0.6;
      }

      .breadcrumb button {
        padding: 0;
        color: inherit;
        background: none;
        border: 0;
      }

      .breadcrumb button:hover {
        color: var(--help-accent);
        text-decoration: underline;
      }

      .toc {
        padding: 40px 24px 32px 8px;
        font-size: 0.875em;
      }

      /* Set as '.developers h2' is, at the size of the entries under it. */
      .toc h2 {
        margin: 0 0 10px;
        color: var(--help-muted);
        font-size: 1em;
        font-weight: 700;
      }

      .toc ul {
        margin: 0;
        padding: 0;
        list-style: none;
        border-left: var(--help-edge) solid var(--help-rule);
      }

      .toc button {
        display: block;
        width: 100%;
        margin-left: -1px;
        padding: 4px 0 4px 12px;
        color: var(--help-muted);
        text-align: left;
        background: none;
        border: 0;
        border-left: 2px solid transparent;
      }

      .toc li[data-level='3'] button {
        padding-left: 24px;
      }

      .toc button:hover {
        color: var(--help-text);
      }

      .toc button[aria-current='location'] {
        color: var(--help-accent);
        border-left-color: var(--help-accent);
        font-weight: 700;
      }

      /* -- The rendered Markdown ------------------------------------------------------------- */

      article {
        max-width: var(--help-measure);
      }

      article > :first-child {
        margin-top: 0;
      }

      article h1,
      article h2,
      article h3,
      article h4 {
        line-height: 1.3;
        scroll-margin-top: 16px;
      }

      article h1 {
        margin: 0 0 16px;
        font-size: 2em;
      }

      article h2 {
        margin: 40px 0 12px;
        font-size: 1.45em;
      }

      article h3 {
        margin: 28px 0 8px;
        font-size: 1.15em;
      }

      article h4 {
        margin: 20px 0 6px;
        font-size: 1em;
      }

      article p,
      article ul,
      article ol,
      article table,
      article pre,
      article blockquote {
        margin: 0 0 16px;
      }

      article ul,
      article ol {
        padding-left: 24px;
      }

      article li + li {
        margin-top: 4px;
      }

      article a {
        color: var(--help-accent);
        text-underline-offset: 2px;
      }

      article img {
        display: block;
        max-width: 100%;
        height: auto;
        margin: 24px 0;
        border: var(--help-edge) solid var(--help-rule);
        border-radius: calc(var(--help-radius) * 2);
      }

      article code {
        padding: 2px 5px;
        background: var(--help-sunken);
        border-radius: var(--help-radius);
        font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
        font-size: 0.875em;
      }

      article pre {
        padding: 14px 16px;
        overflow: auto;
        line-height: 1.5;
        background: var(--help-sunken);
        border: var(--help-edge) solid var(--help-rule);
        border-radius: calc(var(--help-radius) * 2);
      }

      article pre code {
        padding: 0;
        background: none;
      }

      article table {
        display: block;
        max-width: 100%;
        overflow-x: auto;
        border-collapse: collapse;
        font-size: 0.95em;
      }

      article th,
      article td {
        padding: 8px 12px;
        text-align: left;
        vertical-align: top;
        border-bottom: var(--help-edge) solid var(--help-rule);
      }

      article th {
        border-bottom-width: calc(var(--help-edge) * 2);
      }

      article blockquote {
        padding: 4px 16px;
        color: var(--help-muted);
        border-left: 3px solid var(--help-rule);
      }

      /* An overview page's list of pages: a column of blocks, each the whole width and all of it
         clickable. Deliberately not cards, which are the landing page's. */
      article ul.overview {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
        list-style: none;
        border-top: var(--help-edge) solid var(--help-rule);
      }

      article ul.overview li {
        margin: 0;
        border-bottom: var(--help-edge) solid var(--help-rule);
      }

      article a.overview-item {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-areas: 'title arrow' 'text arrow';
        column-gap: 16px;
        row-gap: 2px;
        padding: 14px 12px;
        color: inherit;
        text-decoration: none;
        border-radius: var(--help-radius);
      }

      article a.overview-item::after {
        content: '\\203A';
        grid-area: arrow;
        align-self: center;
        color: var(--help-muted);
        font-size: 1.5em;
        line-height: 1;
        transition: transform 120ms;
      }

      article a.overview-item:hover {
        background: var(--help-hover);
      }

      article a.overview-item:hover::after {
        color: var(--help-accent);
        transform: translateX(3px);
      }

      .overview-title {
        grid-area: title;
        color: var(--help-accent);
        font-size: 1.1em;
        font-weight: 700;
      }

      .overview-text {
        grid-area: text;
        color: var(--help-muted);
      }

      /* -- Narrower windows ------------------------------------------------------------------ */

      /* No room for "On this page": the page keeps the width. */
      @container (max-width: 1080px) {
        .layout {
          grid-template-columns: var(--help-sidebar-width) minmax(0, 1fr);
        }

        .toc {
          display: none;
        }
      }

      @container (max-width: 860px) {
        :host {
          --help-sidebar-width: 240px;
        }

        main {
          padding: 24px 28px 64px;
        }
      }

      /* Too narrow for both: the page gets the width, and a Contents button shows the sidebar over
         it. A half-snapped window on a laptop lands here. */
      @container (max-width: 640px) {
        .layout {
          grid-template-columns: minmax(0, 1fr);
        }

        .sidebar {
          display: none;
          border-right: 0;
        }

        .layout[data-contents-open] .sidebar {
          display: flex;
        }

        .layout[data-contents-open] main {
          display: none;
        }

        main,
        .landing {
          padding: 20px 20px 48px;
        }

        .contents-toggle {
          display: block;
          margin-bottom: 16px;
          padding: 5px 12px;
          color: var(--help-text);
          background: var(--help-raised);
          border: var(--help-edge) solid var(--help-border);
          border-radius: var(--help-radius);
        }
      }
    `,
  ];
}

export default UmbraDesktopHelpElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-help': UmbraDesktopHelpElement;
  }
}
