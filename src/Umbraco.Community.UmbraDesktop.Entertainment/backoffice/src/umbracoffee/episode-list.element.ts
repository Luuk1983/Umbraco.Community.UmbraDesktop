import {
  UMBRACOFFEE_CHANNEL_URL,
  UMBRACOFFEE_EPISODE_PAGE_SIZE,
  UMBRACOFFEE_FIELD_HEIGHT,
  UMBRACOFFEE_PLAYER_ASPECT,
  UMBRACOFFEE_ROW_PADDING,
  UMBRACOFFEE_SIDE_TOP,
  UMBRACOFFEE_STACK_BREAKPOINT,
  UMBRACOFFEE_THUMB_WIDTH,
  UMBRACOFFEE_THUMBNAIL_URL,
} from './constants.js';
import { guestNamesFor, markMatches, matchEpisodes } from './episode-search.js';
import { umbraCoffeeTerm } from './localize.js';
import type { UmbraCoffeeEpisode } from './types.js';
import {
  css,
  customElement,
  html,
  live,
  nothing,
  property,
  state,
  unsafeCSS,
  type PropertyValues,
} from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** How many guests a row names before it says how many more there are. */
const GUESTS_SHOWN = 2;

/** The count line's line height, in px. */
const COUNT_LINE_PX = 16;

/**
 * The episode the window leads with while one is coming or on, which heads the list as its first
 * row: the way back to the countdown or the stream from an older episode.
 */
export interface UmbraCoffeeLeadRow {
  /** Whether it is coming or on. */
  kind: 'upcoming' | 'live';
  /** Its video id. */
  videoId: string;
  /** Its title. */
  title: string;
  /** When, already formatted: "30 Oct, 12:30" or "Started 12:31". */
  when: string;
  /** The day of the month, for the upcoming row's date block. */
  day?: string;
  /** The month, short, for the upcoming row's date block. */
  month?: string;
}

/** The small glyphs a row and the field draw, inline so they follow `currentColor` under every theme. */
const ICONS = {
  search: html`<svg class="mag" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"></circle><path d="M15 15l5 5"></path></svg>`,
  clear: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"></path></svg>`,
  playing: html`<svg class="solid" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="3" height="10" rx="1"></rect><rect x="10.5" y="5" width="3" height="15" rx="1"></rect><rect x="17" y="12" width="3" height="8" rx="1"></rect></svg>`,
  clock: html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 7.5V12l3 2"></path></svg>`,
} as const;

/**
 * The window's column (addendum 2026-10-01 (2), mock views A, C, F and G): a search field with
 * whatever the window slots in beside it (its gear, and its warning while offline), then the
 * episodes as rows with thumbnails, the one in the player marked, Show more and a link to the
 * channel.
 *
 * Only the rows scroll. The field's row stays at the top, so the search is always there to change,
 * and gains a shadow once rows have scrolled under it. The count of matches sits between the two,
 * only while something is typed; it is a polite live region that is always in the document, since a
 * live region added at the moment it has something to say is not reliably read out.
 *
 * One field finds titles, summaries and guest names (`episode-search.ts` has the rules); a row marks
 * where the search matched, and leads its guest line with the guest the search found. The search
 * works on the whole archive and the paging then applies to the matches: the archive is about 349
 * episodes, so the list draws {@link UMBRACOFFEE_EPISODE_PAGE_SIZE} rows and a Show more that adds as
 * many again, rather than 349 images at once. Thumbnails are built from the id, lazy, and swap to a
 * gradient when they fail, so a row never has a broken-image icon. There are no durations: only the
 * API has them for new episodes (design E7).
 *
 * While an episode is coming or on, the window passes it as {@link lead}, and it heads the list: the
 * way back to the countdown or the stream after picking an older episode. It is left out of a search,
 * which is a list of matches.
 *
 * Selecting a row is an event, `episode-selected` with the video id as `detail`, or `lead-selected`
 * for the first row, so the list knows nothing of the window's state.
 */
@customElement('umbracoffee-episode-list')
export class UmbraCoffeeEpisodeListElement extends UmbLitElement {
  /** The episodes, newest first. */
  @property({ attribute: false })
  episodes: UmbraCoffeeEpisode[] = [];

  /** The id of what the window shows (the episode in the player, or the upcoming one counting down), marked in the list. */
  @property({ attribute: 'current' })
  current?: string;

  /** Whether the player is playing, which the current row says ("Now playing", else "Paused"). */
  @property({ type: Boolean, attribute: false })
  playing = false;

  /** The episode coming or on, which heads the list; undefined while nothing is. */
  @property({ attribute: false })
  lead?: UmbraCoffeeLeadRow;

  /**
   * Writes an episode's published time for its row. The window passes its own, which follows the
   * desktop's clock settings; the list does not consume the desktop's context itself, so the window and
   * its list cannot disagree about which format is in force. Returns an empty string for a date it
   * cannot write.
   */
  @property({ attribute: false })
  formatDate: (iso: string) => string = () => '';

  /** How many rows are drawn: a page, plus another for each press of Show more. */
  @state()
  private _shown = UMBRACOFFEE_EPISODE_PAGE_SIZE;

  /** Ids whose thumbnail failed to load, which draw the gradient instead. A new set on each failure so the change is seen. */
  @state()
  private _failed: ReadonlySet<string> = new Set();

  /** What is typed in the search field, as typed. */
  @state()
  private _query = '';

  /** Whether rows have scrolled under the field's row, which then draws a shadow over them. */
  @state()
  private _scrolled = false;

  /** The episodes the search lets through, worked out once per update in {@link willUpdate}. */
  #matches: UmbraCoffeeEpisode[] = [];

  /**
   * Whether a search is narrowing the list, which is when the count shows and an empty result is a
   * "nothing matches" rather than an empty archive.
   * @returns True while something is typed.
   */
  get #searching(): boolean {
    return this._query.trim() !== '';
  }

  /**
   * Rework the matches when the episodes or the search change, so a render for any other reason (a
   * thumbnail failing, Show more) costs no pass over the archive.
   * @param changed What changed since the last update.
   */
  override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (changed.has('episodes') || changed.has('_query')) this.#matches = matchEpisodes(this.episodes, this._query);
  }

  /**
   * Search for what was typed, from the first page again: the rows drawn before belong to a different list.
   * @param event The field's `input` event.
   */
  #search(event: Event): void {
    this._query = (event.target as HTMLInputElement).value;
    this._shown = UMBRACOFFEE_EPISODE_PAGE_SIZE;
  }

  /**
   * Clear the search and put focus in the field: the button that had it goes once the search is
   * empty, and focus must not fall to the page.
   */
  async #clear(): Promise<void> {
    this._query = '';
    this._shown = UMBRACOFFEE_EPISODE_PAGE_SIZE;
    await this.updateComplete;
    this.shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true });
  }

  /**
   * Remember a thumbnail failed, so the row draws the gradient in its place.
   * @param videoId The episode whose picture failed.
   */
  #fail(videoId: string): void {
    this._failed = new Set([...this._failed, videoId]);
  }

  /**
   * Note whether rows are under the field's row, for its shadow.
   * @param event The scroll area's `scroll` event.
   */
  #onScroll(event: Event): void {
    this._scrolled = (event.target as HTMLElement).scrollTop > 0;
  }

  /**
   * Tell the window which episode was chosen.
   * @param videoId The chosen episode.
   */
  #select(videoId: string): void {
    this.dispatchEvent(new CustomEvent<string>('episode-selected', { detail: videoId, bubbles: false, composed: false }));
  }

  /** Tell the window the first row was chosen: back to the countdown or the stream. */
  #selectLead(): void {
    this.dispatchEvent(new CustomEvent('lead-selected', { bubbles: false, composed: false }));
  }

  /**
   * A text with the search's matches marked.
   * @param text The text as written.
   * @returns The runs, matches in `<mark>`.
   */
  #marked(text: string) {
    if (!this.#searching) return text;
    return markMatches(text, this._query).map((part) => (part.mark ? html`<mark>${part.text}</mark>` : part.text));
  }

  /**
   * A thumbnail from YouTube by id, or the gradient once it has failed.
   * @param videoId The video.
   * @returns The thumbnail.
   */
  #thumb(videoId: string) {
    if (this._failed.has(videoId)) return html`<span class="thumb fallback"></span>`;
    return html`<span class="thumb"
      ><img
        src=${`${UMBRACOFFEE_THUMBNAIL_URL}${encodeURIComponent(videoId)}/mqdefault.jpg`}
        alt=""
        loading="lazy"
        decoding="async"
        @error=${() => this.#fail(videoId)}
    /></span>`;
  }

  /**
   * One episode's row.
   * @param episode The episode.
   * @returns The row.
   */
  #row(episode: UmbraCoffeeEpisode) {
    const current = episode.videoId === this.current;
    const names = guestNamesFor(episode, this.#searching ? this._query : '');
    const shown = names.slice(0, GUESTS_SHOWN);
    const more = names.length - shown.length;
    const term = (key: string, fallback: string) => umbraCoffeeTerm(this.localize, key, fallback);
    return html`<li>
      <button type="button" class="ep" aria-current=${current ? 'true' : nothing} @click=${() => this.#select(episode.videoId)}>
        ${this.#thumb(episode.videoId)}
        <span class="txt">
          <span class="ep-t">${this.#marked(episode.title)}</span>
          <span class="ep-d"
            >${current
              ? html`<b class="now"
                    >${ICONS.playing}${this.playing
                      ? term('umbraCoffeeNowPlaying', 'Now playing')
                      : term('umbraCoffeePaused', 'Paused')}</b
                  ><span class="dot">·</span>`
              : nothing}${this.formatDate(episode.published)}</span
          >
          ${shown.length > 0
            ? html`<span class="ep-g"
                >${shown.map((name, i) => html`${i > 0 ? ', ' : ''}${this.#marked(name)}`)}${more > 0 ? ` +${more}` : ''}</span
              >`
            : nothing}
        </span>
      </button>
    </li>`;
  }

  /**
   * The first row: the episode coming (its date as the picture) or on (its live thumbnail). The tag
   * and the time are two lines, the time where an episode row has its guests: on one line, "Live ·
   * Started Oct 30, 12:35 PM" did not fit a column at its usual width and lost the time to the clip.
   * @param lead The episode.
   * @returns The row.
   */
  #leadRow(lead: UmbraCoffeeLeadRow) {
    const current = lead.videoId === this.current;
    const upcoming = lead.kind === 'upcoming';
    const label = upcoming
      ? umbraCoffeeTerm(this.localize, 'umbraCoffeeUpcoming', 'Upcoming')
      : umbraCoffeeTerm(this.localize, 'umbraCoffeeLive', 'Live');
    return html`<li>
      <button type="button" class="ep lead" aria-current=${current ? 'true' : nothing} @click=${() => this.#selectLead()}>
        ${upcoming ? html`<span class="thumb soon"><span><b>${lead.day ?? ''}</b> ${lead.month ?? ''}</span></span>` : this.#thumb(lead.videoId)}
        <span class="txt">
          <span class="ep-t">${lead.title}</span>
          <span class="ep-d"
            ><b class=${upcoming ? 'now' : 'now is-live'}>${upcoming ? ICONS.clock : html`<i></i>`}${label}</b></span
          >
          ${lead.when ? html`<span class="ep-g">${lead.when}</span>` : nothing}
        </span>
      </button>
    </li>`;
  }

  /**
   * The field's row: the search field, its magnifier and its clear button, and the window's tools.
   * The label is visually hidden: the placeholder says what the field is to someone who sees it, and
   * the label says it to everyone else.
   * @returns The row.
   */
  #top() {
    const term = (key: string, fallback: string) => umbraCoffeeTerm(this.localize, key, fallback);
    return html`<div class=${this._scrolled ? 'top is-scrolled' : 'top'}>
      <div class="search">
        ${ICONS.search}
        <label class="vh" for="search">${term('umbraCoffeeSearchLabel', 'Search episodes')}</label>
        <input
          id="search"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder=${term('umbraCoffeeSearchPlaceholder', 'Title, topic or guest')}
          .value=${live(this._query)}
          @input=${(event: Event) => this.#search(event)}
        />
        ${this._query !== ''
          ? html`<button type="button" class="clear" aria-label=${term('umbraCoffeeClearSearch', 'Clear search')} @click=${() => this.#clear()}>
              ${ICONS.clear}
            </button>`
          : nothing}
      </div>
      <slot name="tools"></slot>
    </div>`;
  }

  /**
   * The count of matches, always in the document and empty (no height) while nothing is searched.
   * @returns The count's line.
   */
  #count() {
    const count = this.#matches.length;
    const text = !this.#searching
      ? ''
      : count === 1
        ? umbraCoffeeTerm(this.localize, 'umbraCoffeeMatchesOne', '1 episode')
        : umbraCoffeeTerm(this.localize, 'umbraCoffeeMatches', `${count} episodes`, count);
    return html`<p class=${this.#searching ? 'count on' : 'count'} role="status" aria-live="polite">${text}</p>`;
  }

  /**
   * The field's row, the count, then the rows (or the empty state when a search matches nothing),
   * Show more while there are more matches to show, and the channel link.
   * @returns The template.
   */
  override render() {
    const matches = this.#matches;
    const lead = this.#searching ? undefined : this.lead;
    const listed = lead ? matches.filter((episode) => episode.videoId !== lead.videoId) : matches;
    const shown = listed.slice(0, this._shown);
    return html`
      ${this.#top()} ${this.#count()}
      <div class="scroll" @scroll=${(event: Event) => this.#onScroll(event)}>
        ${this.#searching && matches.length === 0
          ? html`<div class="none">
              <p>${umbraCoffeeTerm(this.localize, 'umbraCoffeeNoMatches', 'No episodes match.')}</p>
              <button type="button" class="button" @click=${() => this.#clear()}>
                ${umbraCoffeeTerm(this.localize, 'umbraCoffeeClearFilters', 'Show all episodes')}
              </button>
            </div>`
          : nothing}
        ${lead || shown.length > 0
          ? html`<ul class="eps">
              ${lead ? this.#leadRow(lead) : nothing} ${shown.map((episode) => this.#row(episode))}
            </ul>`
          : nothing}
        ${listed.length > shown.length
          ? html`<button type="button" class="button more" @click=${() => (this._shown += UMBRACOFFEE_EPISODE_PAGE_SIZE)}>
              ${umbraCoffeeTerm(this.localize, 'umbraCoffeeShowMore', 'Show more')}
            </button>`
          : nothing}
        <a class="channel" href=${UMBRACOFFEE_CHANNEL_URL} target="_blank" rel="noopener"
          >${umbraCoffeeTerm(this.localize, 'umbraCoffeeAllEpisodes', 'All episodes on YouTube')}</a
        >
      </div>
    `;
  }

  /**
   * Tokens first, then one paint-only block per theme, as the mock draws the column under each. Every
   * colour, edge and radius is an app token with the published fallback; every size comes from
   * `constants.ts` and is the same under every theme, the field's and the buttons' height included,
   * which the tests measure. The current row takes the accent and its text colour, which is what a
   * selection is in the token contract; Umbraco paints it in the backoffice's own pink "current"
   * colour instead, as its content tree does.
   *
   * The field is outlined in the border token, a fixed hairline rather than the theme's edge width,
   * because two themes publish that as zero and a field with no outline on a flat column is not
   * findable as a field. The outline is a border on a fixed-height, border-box box, so it costs no
   * layout either way.
   *
   * The host is a column that holds exactly its box: the scroll area is the one flexible part and
   * has a zero minimum, so nothing overflows the host and only the rows scroll. Under the player (a
   * window narrower than the breakpoint, a query on the window's own width) the field's row is a
   * little tighter, as the mock's narrow view draws it.
   */
  static override styles = css`
    :host {
      --_hover: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
      --_cur-bg: var(--umbradesktop-app-accent, var(--uui-color-selected));
      --_cur-text: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
      --_now: inherit;
      --_live: #d42054;
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font-family: var(--umbradesktop-app-font, inherit);
      font-size: 14px;
      line-height: 20px;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* Clipped, not hidden: a 1px box with hidden overflow over a label's text can still be scrolled,
       which the window's one-scroll-area test found. */
    .vh {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: clip;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    svg {
      width: 1em;
      height: 1em;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    svg.solid {
      fill: currentColor;
      stroke: none;
    }

    .top {
      position: relative;
      z-index: 1;
      flex: none;
      display: flex;
      align-items: center;
      gap: 3px;
      padding: ${unsafeCSS(UMBRACOFFEE_SIDE_TOP.wide.top)}px 9px ${unsafeCSS(UMBRACOFFEE_SIDE_TOP.wide.bottom)}px 12px;
    }

    .top.is-scrolled {
      box-shadow:
        0 1px 0 var(--umbradesktop-app-edge-dark, var(--uui-color-border)),
        0 4px 8px -6px rgba(0, 0, 0, 0.18);
    }

    .search {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      height: ${unsafeCSS(UMBRACOFFEE_FIELD_HEIGHT)}px;
      margin-right: 3px;
      padding: 0 4px 0 10px;
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface));
      border: 1px solid var(--umbradesktop-app-border, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px);
      cursor: text;
    }

    .search:focus-within {
      outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      outline-offset: 0;
    }

    .search .mag {
      font-size: 16px;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    }

    input {
      flex: 1;
      min-width: 0;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      outline: none;
      background: transparent;
      font: inherit;
      color: inherit;
    }

    input::placeholder {
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
      opacity: 1;
    }

    input::-webkit-search-cancel-button {
      display: none;
    }

    .clear {
      display: grid;
      place-items: center;
      flex: none;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: var(--umbradesktop-app-radius, 3px);
      background: transparent;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
      font-size: 16px;
      cursor: pointer;
    }

    .clear:hover {
      background: var(--_hover);
    }

    ::slotted(*) {
      flex: none;
    }

    /* No height and no padding while nothing is searched, so it holds no line. */
    .count {
      flex: none;
      margin: 0;
      padding: 0 15px;
      overflow: clip; /* not a scroll container: see .ep-d in episode-list */
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 12px;
      line-height: ${unsafeCSS(COUNT_LINE_PX)}px;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    }

    .count.on {
      padding-bottom: 6px;
    }

    /* The one scroll area. */
    .scroll {
      flex: 1;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 0 6px 9px;
    }

    .none {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 24px 16px;
      text-align: center;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    }

    .none p {
      margin: 0;
    }

    .eps {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }

    .ep {
      display: grid;
      grid-template-columns: ${unsafeCSS(UMBRACOFFEE_THUMB_WIDTH)}px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      width: 100%;
      padding: ${unsafeCSS(UMBRACOFFEE_ROW_PADDING)}px;
      text-align: start;
      background: none;
      border: 0;
      border-radius: var(--umbradesktop-app-radius, 3px);
    }

    .ep:hover {
      background: var(--_hover);
    }

    .ep[aria-current='true'] {
      background: var(--_cur-bg);
      color: var(--_cur-text);
    }

    .thumb {
      position: relative;
      display: block;
      aspect-ratio: ${unsafeCSS(UMBRACOFFEE_PLAYER_ASPECT.w)} / ${unsafeCSS(UMBRACOFFEE_PLAYER_ASPECT.h)};
      overflow: hidden;
      border-radius: 3px;
      background: linear-gradient(135deg, #283a97, #1b264f);
    }

    .thumb img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .thumb.soon {
      display: grid;
      place-items: center;
      color: #f5c1bc;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .thumb.soon b {
      display: block;
      font-size: 24px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 0;
      color: #fff;
    }

    .txt {
      display: grid;
      min-width: 0;
    }

    .ep-t {
      font-size: 14px;
      font-weight: 700;
      line-height: 18px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* clip, not hidden: a box with overflow hidden is still a scroll container, so on Linux CI,
       whose fallback font is wider, the live row's tag and date overflowed by a few pixels and the
       line became a second scroller (2026-10-11). clip cuts the same way and keeps the ellipsis,
       and nothing, not even focus, can scroll it. */
    .ep-d,
    .ep-g {
      font-size: 12px;
      line-height: 16px;
      white-space: nowrap;
      overflow: clip;
      text-overflow: ellipsis;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    }

    .ep-d {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 3px;
    }

    .ep-g {
      margin-top: 1px;
    }

    .ep[aria-current='true'] .ep-d,
    .ep[aria-current='true'] .ep-g {
      color: inherit;
    }

    .dot {
      opacity: 0.7;
    }

    .now {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 700;
      color: var(--_now);
    }

    .now svg {
      font-size: 11px;
    }

    .now.is-live i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--_live);
    }

    mark {
      padding: 0 1px;
      border-radius: 2px;
      background: #fbe065;
      color: #1a1a1a;
    }

    /* A fixed height on a border-box button, like the field: the edge width is the theme's (0, 1 or
       2px across the five), and a button sized by its content grew by twice that under each one. */
    .button {
      height: ${unsafeCSS(UMBRACOFFEE_FIELD_HEIGHT)}px;
      padding: 0 12px;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px);
      box-shadow: inset var(--umbradesktop-app-edge-width, 1px) var(--umbradesktop-app-edge-width, 1px) 0
        var(--umbradesktop-app-edge-light, transparent);
    }

    .more {
      display: block;
      width: 100%;
      margin-top: 8px;
    }

    .channel {
      display: block;
      margin-top: 8px;
      padding: 12px;
      text-align: center;
      font-weight: 700;
      color: inherit;
      box-shadow: 0 -1px 0 0 var(--umbradesktop-app-edge-dark, var(--uui-color-border));
    }

    button:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      outline-offset: -2px;
    }

    @container umbracoffee (width < ${unsafeCSS(UMBRACOFFEE_STACK_BREAKPOINT)}px) {
      .top {
        padding-top: ${unsafeCSS(UMBRACOFFEE_SIDE_TOP.narrow.top)}px;
        padding-bottom: ${unsafeCSS(UMBRACOFFEE_SIDE_TOP.narrow.bottom)}px;
      }
    }

    /* ---- Theme refinements: paint only, never a size ---- */

    /* Umbraco: the backoffice's pink "current" with navy text, as in the content tree. */
    :host([data-umbradesktop-theme='umbraco']) {
      --_hover: var(--uui-color-surface-emphasis, #f3f3f5);
      --_cur-bg: var(--uui-color-current-emphasis, #f8d6d3);
      --_cur-text: var(--uui-color-current-contrast, #1b264f);
      --_now: var(--uui-color-current-contrast, #1b264f);
      --_live: var(--uui-color-danger, #d42054);
    }
    :host([data-umbradesktop-theme='umbraco']) .search {
      border-color: var(--uui-color-border, #d8d7d9);
    }
    :host([data-umbradesktop-theme='umbraco']) .search:focus-within {
      border-color: var(--uui-color-border-emphasis, #a1a1a1);
      outline-color: var(--uui-color-focus, #3879ff);
    }

    /* Umbraco 4: a bevelled strip over a white well, the v4 blue selection. */
    :host([data-umbradesktop-theme='umbraco4']) {
      --_cur-bg: #cfe3f5;
      --_cur-text: #2c2a26;
      --_now: #1f4e8c;
      --_live: #b23a2d;
    }
    :host([data-umbradesktop-theme='umbraco4']) .top {
      background: linear-gradient(180deg, #f7f6f2 0%, #ebe8e2 100%);
      box-shadow: 0 1px 0 #b4afa4;
    }
    :host([data-umbradesktop-theme='umbraco4']) .search {
      border-radius: 0;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
    }
    :host([data-umbradesktop-theme='umbraco4']) .ep[aria-current='true'] {
      box-shadow: inset 0 0 0 1px #7ba7d4;
    }
    :host([data-umbradesktop-theme='umbraco4']) .thumb {
      border-radius: 0;
      box-shadow: 0 0 0 1px #9d988e;
    }

    /* macOS: a borderless rounded field and the sidebar's blue selection. */
    :host([data-umbradesktop-theme='macos']) {
      --_live: #d70015;
    }
    :host([data-umbradesktop-theme='macos']) .search {
      border-color: transparent;
      border-radius: 7px;
      background: color-mix(in srgb, var(--umbradesktop-app-text, #1d1d1f) 6%, transparent);
    }
    :host([data-umbradesktop-theme='macos']) .ep {
      border-radius: 7px;
    }
    :host([data-umbradesktop-theme='macos']) .thumb {
      border-radius: 5px;
    }

    /* Windows 11: a quiet grey selection with the accent pill, and the field's underline. */
    :host([data-umbradesktop-theme='win11']) {
      --_cur-bg: color-mix(in srgb, var(--umbradesktop-app-text, #1a1a1a) 6%, transparent);
      --_cur-text: var(--umbradesktop-app-text, #1a1a1a);
      --_now: var(--umbradesktop-app-accent, #005fb8);
      --_live: #c42b1c;
    }
    :host([data-umbradesktop-theme='win11']) .search {
      border-color: color-mix(in srgb, var(--umbradesktop-app-text, #1a1a1a) 10%, transparent);
      border-bottom-color: var(--umbradesktop-app-border, #868686);
      border-radius: 4px;
    }
    :host([data-umbradesktop-theme='win11']) .search .mag {
      order: 2;
      color: var(--umbradesktop-app-text, #1a1a1a);
    }
    :host([data-umbradesktop-theme='win11']) .search .clear {
      order: 1;
    }
    :host([data-umbradesktop-theme='win11']) .ep {
      position: relative;
      border-radius: 4px;
    }
    :host([data-umbradesktop-theme='win11']) .ep[aria-current='true']::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 3px;
      height: 18px;
      margin-top: -9px;
      border-radius: 2px;
      background: var(--umbradesktop-app-accent, #0078d4);
    }
    :host([data-umbradesktop-theme='win11']) .thumb {
      border-radius: 4px;
    }

    /* Windows 98: a sunken white well for the rows, a sunken field, a navy selection with a dotted focus. */
    :host([data-umbradesktop-theme='win98']) {
      --_hover: transparent;
      --_live: #800000;
    }
    :host([data-umbradesktop-theme='win98']) .search {
      border-color: transparent;
      border-radius: 0;
      background: var(--umbradesktop-app-surface-sunken, #fff);
      box-shadow:
        inset -1px -1px #fff,
        inset 1px 1px #808080,
        inset -2px -2px #dfdfdf,
        inset 2px 2px #000;
    }
    :host([data-umbradesktop-theme='win98']) .search:focus-within {
      outline: none;
    }
    :host([data-umbradesktop-theme='win98']) .scroll {
      background: var(--umbradesktop-app-surface-sunken, #fff);
      box-shadow:
        inset -1px -1px #fff,
        inset 1px 1px #808080,
        inset -2px -2px #dfdfdf,
        inset 2px 2px #000;
    }
    :host([data-umbradesktop-theme='win98']) .scroll::-webkit-scrollbar {
      width: 16px;
      background: repeating-conic-gradient(#fff 0 25%, #c0c0c0 0 50%) 0 0 / 2px 2px;
    }
    :host([data-umbradesktop-theme='win98']) .scroll::-webkit-scrollbar-thumb {
      background: #c0c0c0;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .ep,
    :host([data-umbradesktop-theme='win98']) .thumb {
      border-radius: 0;
    }
    :host([data-umbradesktop-theme='win98']) .ep[aria-current='true'] {
      outline: 1px dotted #ffff80;
      outline-offset: -1px;
    }
    :host([data-umbradesktop-theme='win98']) .button {
      border-color: transparent;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbracoffee-episode-list': UmbraCoffeeEpisodeListElement;
  }
}
