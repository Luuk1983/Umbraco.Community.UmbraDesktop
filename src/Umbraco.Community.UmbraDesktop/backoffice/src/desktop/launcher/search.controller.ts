import type { UmbraDesktopApp } from '../types';
import { UmbraDesktopSearchEngine } from '../search/search-engine';
import type { UmbraDesktopSearchItem, UmbraDesktopSearchSection, UmbraDesktopSearchSource } from '../search/types';
import { sectionUrlFromHref } from '../windows/entity-window';
import { escapeClearsFilter } from './drawer.controller';
import { UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH } from './geometry';
import { css, html, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** What a search result does, which the launcher owns. */
export interface UmbraDesktopSearchActions {
  /**
   * Launch an app.
   * @param app The app.
   */
  launch(app: UmbraDesktopApp): void;
  /**
   * Open a search result.
   * @param item The result.
   */
  open(item: UmbraDesktopSearchItem): void;
  /**
   * Called when there come to be results to show, or stop being, which is when the launcher switches
   * body: when the first answer for typed text arrives, and when the field is emptied.
   * @param active True while there are results for some text to show.
   */
  changed(active: boolean): void;
}

/**
 * Whether a result can be opened: a Help result always, a content result only when its href lands
 * on a backoffice section. One with no href, or one pointing off the backoffice, is shown but
 * disabled, as the native modal shows a result with no href (design §4).
 * @param item The result.
 * @returns True when it can be opened.
 */
export function canOpen(item: UmbraDesktopSearchItem): boolean {
  return item.open.kind === 'help' || sectionUrlFromHref(item.open.href) !== undefined;
}

/**
 * The launcher's search (launcher search design §4): the field in the header row and the results
 * that replace the body while it has text.
 *
 * A controller rendering into the launcher's own shadow root, as the drawer does, so the theme's
 * launcher sheet reaches the results without any theme changing. Rows reuse the drawer's `.row`
 * and `.lh` look, which every theme already styles.
 */
export class UmbraDesktopSearchController {
  /** The launcher this renders into. */
  #host: UmbLitElement;
  /** What results do. */
  #actions: UmbraDesktopSearchActions;
  /** Turns the text into results; redraws the host on every change. */
  #engine: UmbraDesktopSearchEngine;
  /** The field's text, untrimmed, so the field shows exactly what was typed. */
  #value = '';
  /** Whether the host was last told there are results to show. */
  #showing = false;
  /** Loads the next page when Show more scrolls into view. */
  #observer?: IntersectionObserver;
  /** The Show more button being watched. */
  #watched?: Element;
  /**
   * How many rows had loaded when the button was last observed, or -1 while a page is loading. An
   * observer reports only changes, so a button still in view after a page loads (a short list in a
   * tall panel) would never ask again; observing anew after each page is what asks.
   */
  #watchedCount = -1;

  /**
   * @param host The launcher.
   * @param actions What results do.
   * @param debounceMs Reads the debounce override, for tests. A function rather than a number, read
   *   each time a search is scheduled, because the launcher's property it reads is set after the
   *   launcher's constructor has already built this controller.
   */
  constructor(host: UmbLitElement, actions: UmbraDesktopSearchActions, debounceMs: () => number | undefined = () => undefined) {
    this.#host = host;
    this.#actions = actions;
    this.#engine = new UmbraDesktopSearchEngine({
      nameOf: (app) => host.localize.string(app.name),
      onChange: (state) => this.#changed(state.query !== ''),
      /** @returns The current override, if any. */
      get debounceMs() {
        return debounceMs();
      },
    });
  }

  /** @returns True while one source's full list is shown. */
  get drilled(): boolean {
    return !!this.#engine.state.drill;
  }

  /**
   * @param apps Every app the user may open.
   */
  setApps(apps: ReadonlyArray<UmbraDesktopApp>): void {
    this.#engine.setApps(apps);
  }

  /**
   * @param sources The permitted sources.
   */
  setSources(sources: ReadonlyArray<UmbraDesktopSearchSource>): void {
    this.#engine.setSources(sources);
  }

  /**
   * The field's text changed.
   * @param value The new text.
   */
  input(value: string): void {
    this.#value = value;
    this.#engine.setQuery(value);
    this.#host.requestUpdate();
  }

  /** Empty the field. */
  clear(): void {
    this.input('');
  }

  /** Back from one source's list to the mixed results. */
  closeDrill(): void {
    this.#engine.closeDrill();
  }

  /** Put the caret in the field, once the host has rendered. */
  focusField(): void {
    void this.#host.updateComplete.then(() =>
      this.#host.shadowRoot?.querySelector<HTMLInputElement>('.search-input')?.focus({ preventScroll: true }),
    );
  }

  /**
   * Watch Show more, so reaching the end of a list loads the next page: by scrolling to it, or at
   * once when it is already in view. Not while a page is loading, since `more` would decline then
   * and the observer would not ask again. Call after each render.
   */
  afterRender(): void {
    const more = this.#host.shadowRoot?.querySelector('.search-results .more') ?? undefined;
    const drill = this.#engine.state.drill;
    const count = drill && !drill.loading ? drill.items.length : -1;
    if (more === this.#watched && count === this.#watchedCount) return;
    this.#observer?.disconnect();
    this.#watched = more;
    this.#watchedCount = count;
    if (!more || count < 0) return;
    this.#observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void this.#engine.more();
    });
    this.#observer.observe(more);
  }

  /**
   * Redraw, and tell the host when results start or stop being shown. Driven by the engine's state
   * rather than by the field, so the launcher keeps its own body while the first answer is on its
   * way and swaps to the results in one go when it arrives (design §11).
   * @param showing Whether there are results for some text.
   */
  #changed(showing: boolean): void {
    if (showing !== this.#showing) {
      this.#showing = showing;
      this.#actions.changed(showing);
    }
    this.#host.requestUpdate();
  }

  /** Stop: no late answer redraws a launcher that has closed. */
  dispose(): void {
    this.#engine.dispose();
    this.#observer?.disconnect();
  }

  /**
   * The field, which replaces the old search button in the header row. A `label` keeps the `.search`
   * class every theme styles as the pill, with the input inside it.
   * @returns The template.
   */
  renderField() {
    const placeholder = this.#host.localize.term('umbraDesktop_search');
    return html`
      <label class="search">
        <umb-icon name="icon-search"></umb-icon>
        <input
          class="search-input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          .value=${this.#value}
          placeholder=${placeholder}
          aria-label=${placeholder}
          @input=${(e: Event) => this.input((e.target as HTMLInputElement).value)}
          @keydown=${this.#onFieldKeydown} />
      </label>
    `;
  }

  /**
   * The body while searching: the mixed results, or one source's full list. One band per category,
   * stacked: every matching app, then each source, full ones first. Within a band the results flow
   * across a grid at the launcher's card width, best first along the top row, so a wide panel uses
   * its width instead of one long list down its left edge, and a Start menu's narrow panel keeps a
   * single column.
   * @returns The template.
   */
  render() {
    const state = this.#engine.state;
    if (state.drill) return this.#renderDrill(state.drill);
    const localize = this.#host.localize;
    const nothing = !state.pending && state.apps.length === 0 && state.sections.length === 0 && state.others.length === 0;
    let first = true;
    /** True for the first row only, which is what Enter in the field opens. */
    const isFirst = () => {
      const was = first;
      first = false;
      return was;
    };
    return html`
      <div class="body search-results ${state.pending ? 'pending' : ''}" @keydown=${this.#onResultsKeydown}>
        ${state.apps.length
          ? html`<section class="result-group" data-source="apps">
              <div class="lh result-head"><span>${localize.term('umbraDesktop_searchApps')}</span></div>
              <div class="result-grid">
                ${state.apps.map((app) =>
                  this.#row(`app:${app.alias}`, app.icon, localize.string(app.name), undefined, true, isFirst(), () => this.#actions.launch(app)),
                )}
              </div>
            </section>`
          : ''}
        ${[...state.sections, ...state.others].map((section) => this.#renderSection(section, isFirst))}
        ${nothing ? html`<p class="empty-note">${localize.term('umbraDesktop_searchNoResults')}</p>` : ''}
      </div>
    `;
  }

  /**
   * One source's section: its heading, Show all when it found more than it shows, and its rows.
   * @param section The source and its first results.
   * @param isFirst Says whether a row is the first drawn, which is the one Enter opens.
   * @returns The template.
   */
  #renderSection(section: UmbraDesktopSearchSection, isFirst: () => boolean) {
    const localize = this.#host.localize;
    return html`<section class="result-group" data-source=${section.source.alias}>
      <div class="lh result-head">
        <span>${localize.string(section.source.label)}</span>
        ${section.total > section.items.length
          ? html`<button class="show-all" @click=${() => void this.#engine.drill(section.source.alias)}>
              ${localize.term('umbraDesktop_searchShowAll', section.total)}
            </button>`
          : ''}
      </div>
      <div class="result-grid">${section.items.map((item) => this.#itemRow(item, isFirst()))}</div>
    </section>`;
  }

  /**
   * One source's full list, with Back and Show more.
   * @param drill The drilled-into source and what has loaded.
   * @returns The template.
   */
  #renderDrill(drill: UmbraDesktopSearchSection & { loading: boolean }) {
    const localize = this.#host.localize;
    return html`
      <div class="body search-results drill" @keydown=${this.#onResultsKeydown}>
        <div class="drill-head">
          <button class="ctl back" @click=${() => this.#back()}>
            <umb-icon name="icon-arrow-left"></umb-icon>
            <span>${localize.term('umbraDesktop_back')}</span>
          </button>
          <span class="lh">${localize.string(drill.source.label)} (${drill.total})</span>
        </div>
        <div class="result-grid">${drill.items.map((item, index) => this.#itemRow(item, index === 0))}</div>
        ${drill.items.length < drill.total
          ? html`<button class="more" ?disabled=${drill.loading} @click=${() => void this.#engine.more()}>
              ${localize.term('umbraDesktop_searchShowMore')}
            </button>`
          : ''}
      </div>
    `;
  }

  /** Back from the drilled-down list, with the caret back in the field. */
  #back(): void {
    this.closeDrill();
    this.focusField();
  }

  /**
   * A row for a source's result.
   * @param item The result.
   * @param first Whether it is the row Enter opens.
   * @returns The template.
   */
  #itemRow(item: UmbraDesktopSearchItem, first: boolean) {
    return this.#row(item.key, item.icon, item.name, item.detail, canOpen(item), first, () => this.#actions.open(item));
  }

  /**
   * One result row, in the drawer's row look.
   * @param key Identifies the row, for tests and keyboard focus.
   * @param icon Its icon.
   * @param name Its name.
   * @param detail A second line, such as a document's location.
   * @param enabled Whether it can be opened.
   * @param first Whether it is the row Enter opens, which is marked so the user can see that.
   * @param open What a click does.
   * @returns The template.
   */
  #row(key: string, icon: string, name: string, detail: string | undefined, enabled: boolean, first: boolean, open: () => void) {
    return html`
      <button class="row result ${first && enabled ? 'first' : ''}" data-key=${key} ?disabled=${!enabled} @click=${open}>
        <umb-icon name=${icon}></umb-icon>
        <span class="result-text">
          <span class="row-name">${name}</span>
          ${detail ? html`<span class="result-detail">${detail}</span>` : ''}
        </span>
      </button>
    `;
  }

  /**
   * The first result that can be opened, in the order drawn.
   * @returns What Enter in the field opens, or undefined.
   */
  #firstTarget(): (() => void) | undefined {
    const state = this.#engine.state;
    if (state.drill) {
      const item = state.drill.items.find(canOpen);
      return item ? () => this.#actions.open(item) : undefined;
    }
    const app = state.apps[0];
    if (app) return () => this.#actions.launch(app);
    const item = [...state.sections, ...state.others].flatMap((s) => s.items).find(canOpen);
    return item ? () => this.#actions.open(item) : undefined;
  }

  /**
   * Keys in the field. Escape goes back from a drilled-down list first, then clears the text, and
   * with the field empty lets the key through so the taskbar closes the launcher. Arrow down moves
   * into the results; Enter opens the first one.
   * @param e The key event.
   */
  #onFieldKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.drilled) {
      e.preventDefault();
      e.stopPropagation();
      this.closeDrill();
      return;
    }
    if (e.key === 'Escape') {
      escapeClearsFilter(e, () => this.clear());
      return;
    }
    if (e.key === 'ArrowDown') {
      // A result first, then any control: in a section's head Show all comes before its rows, and
      // Down then Enter should open the best match rather than drill into its source.
      const root = this.#host.shadowRoot;
      const first =
        root?.querySelector<HTMLElement>('.search-results .result:not(:disabled)') ??
        root?.querySelector<HTMLElement>('.search-results button:not(:disabled)');
      if (first) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.key === 'Enter') {
      const open = this.#firstTarget();
      if (open) {
        e.preventDefault();
        open();
      }
    }
  };

  /**
   * Arrow keys between results, in the order drawn; up from the first goes back to the field.
   * Enter and Space are a focused button's own.
   * @param e The key event.
   */
  #onResultsKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const root = this.#host.shadowRoot;
    if (!root) return;
    const buttons = [...root.querySelectorAll<HTMLElement>('.search-results button:not(:disabled)')];
    const index = buttons.indexOf(root.activeElement as HTMLElement);
    if (index < 0) return;
    e.preventDefault();
    const next = index + (e.key === 'ArrowDown' ? 1 : -1);
    if (next < 0) root.querySelector<HTMLInputElement>('.search-input')?.focus();
    else buttons[Math.min(next, buttons.length - 1)].focus();
  };
}

/** The search's CSS, included in the launcher's `static styles`, after the drawer's. */
export const searchStyles = css`
  .search {
    cursor: text;
  }
  .search:focus-within {
    border-color: var(--umbradesktop-launcher-border-emphasis, var(--uui-color-border-emphasis, var(--uui-color-border)));
  }
  .search-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .search-input::placeholder {
    color: inherit;
    opacity: 0.7;
  }
  .search-input::-webkit-search-cancel-button {
    display: none;
  }
  .search-results {
    display: flex;
    flex-direction: column;
    gap: var(--uui-size-space-4);
  }
  /* A list, whatever a theme does to the launcher's body: macOS centres the body's children for
     its group cards, which shrank each section to its own width and centred it apart from the
     others. Two classes, so this outranks a theme's own .body rule. */
  .body.search-results {
    align-items: stretch;
  }
  .result-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--uui-size-space-3);
  }
  .show-all,
  .more {
    padding: var(--uui-size-space-1) var(--uui-size-space-2);
    border: none;
    border-radius: var(--uui-border-radius, 3px);
    background: transparent;
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    font-size: var(--uui-type-small-size);
    cursor: pointer;
  }
  .show-all:hover,
  .more:hover {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
  }
  /* The result Enter opens. A ring rather than the hover fill: a theme pairs its hover fill with a
     text colour under :hover only, so the fill alone was Windows 98's navy bar behind dark text. */
  .row.first:not(:hover) {
    box-shadow: inset 0 0 0 1px var(--umbradesktop-launcher-border-emphasis, var(--uui-color-border-emphasis, var(--uui-color-border)));
  }
  .more {
    align-self: flex-start;
  }
  .result-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .result-detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85em;
    opacity: 0.7;
  }
  .row:disabled {
    cursor: default;
    opacity: 0.6;
  }
  /* A category's results, as many columns as fit at the width of the launcher's own group cards, so
     they line up with the groups they replace, filled a row at a time so the best come first along
     the top. A wide panel puts them side by side, and a Start menu's narrow one, Windows 98 or
     Umbraco 4, keeps one column as its launcher does. The categories themselves stay stacked. */
  .result-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(${unsafeCSS(UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH)}px, 100%), 1fr));
    column-gap: var(--uui-size-space-5);
  }
  /* A row keeps to its column: a long name or location is cut with an ellipsis rather than widening
     the column past its neighbours. */
  .result-grid > .result {
    min-width: 0;
  }
  .result .row-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .drill-head {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-3);
  }
`;
