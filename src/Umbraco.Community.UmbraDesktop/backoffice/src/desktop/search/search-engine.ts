import type { UmbraDesktopApp } from '../types';
import { rankApps } from './rank-apps';
import type { UmbraDesktopSearchSection, UmbraDesktopSearchSource, UmbraDesktopSearchState } from './types';

/** How long to wait after the last keystroke before asking the server, as the native modal does. */
export const UMBRADESKTOP_SEARCH_DEBOUNCE_MS = 300;

/**
 * How many results to ask each source for. Enough to fill a few rows of a section whose results sit
 * side by side: 12 for Documents and Media, which are what people mostly search for, and 6 for the
 * rest. Every source returns its total beside its items, which is what Show all counts. A
 * drilled-down list loads a page at a time. Still small: every source is asked on each search, and
 * core's own default of 100 is what design D4 avoids. The same for every theme; a narrow Start menu
 * scrolls, as its launcher does. Apps are not here: they are matched locally, and all are shown.
 */
export const UMBRADESKTOP_SEARCH_TAKE = { full: 12, compact: 6, page: 20 } as const;

/** Nothing typed. */
export const UMBRADESKTOP_SEARCH_EMPTY_STATE: UmbraDesktopSearchState = { query: '', apps: [], sections: [], others: [], pending: false };

/** What the engine needs from its host. */
export interface UmbraDesktopSearchEngineOptions {
  /**
   * An app's translated name, which is what apps are matched on.
   * @param app The app.
   */
  nameOf(app: UmbraDesktopApp): string;
  /**
   * Called with every new state.
   * @param state The state.
   */
  onChange(state: UmbraDesktopSearchState): void;
  /** Overrides {@link UMBRADESKTOP_SEARCH_DEBOUNCE_MS}, for tests. */
  debounceMs?: number;
}

/**
 * Turns what was typed into what a search view draws: matching apps on every keystroke, each
 * source's first results once typing pauses, in full and compact sections, plus one source's full
 * list while drilled into.
 *
 * Apps do not wait for the sources (design §12). They are matched in memory, and holding them back
 * until the server answered made finding an app, the commonest search, wait for a round trip it
 * never needed. The previous sources' results are dropped as the text changes rather than kept
 * until the next answer, so a document found for the old text never sits beside apps for the new
 * one; `pending` says their answer is on its way.
 *
 * It knows nothing of the launcher, which is what lets a taskbar button or a Search app reuse it
 * (design §8). Every query is numbered, and any answer for a number that is no longer current is
 * dropped, so a slow source can never paint results for text that has since changed, and nothing at
 * all is reported after `dispose`.
 */
export class UmbraDesktopSearchEngine {
  /** Every app the user may open. */
  #apps: ReadonlyArray<UmbraDesktopApp> = [];
  /** The sources, heaviest first. */
  #sources: ReadonlyArray<UmbraDesktopSearchSource> = [];
  /** The current query's number; an answer carrying any other is stale. */
  #generation = 0;
  /** The pending debounce. */
  #timer?: ReturnType<typeof setTimeout>;
  /** The latest state. */
  #state = UMBRADESKTOP_SEARCH_EMPTY_STATE;
  /** The latest text asked for, trimmed, which is what a change of text is compared with. */
  #query = '';
  /** The host's callbacks. */
  #options: UmbraDesktopSearchEngineOptions;
  /** True once disposed. */
  #disposed = false;

  /**
   * @param options What the engine needs from its host.
   */
  constructor(options: UmbraDesktopSearchEngineOptions) {
    this.#options = options;
  }

  /** @returns The latest state. */
  get state(): UmbraDesktopSearchState {
    return this.#state;
  }

  /**
   * Replace the apps, re-matching the current query against them.
   * @param apps Every app the user may open.
   */
  setApps(apps: ReadonlyArray<UmbraDesktopApp>): void {
    this.#apps = apps;
    if (this.#state.query) this.#emit({ ...this.#state, apps: this.#matchApps(this.#state.query) });
  }

  /**
   * Replace the sources, asking the new ones about the current query. Sources arrive after the
   * launcher opens, because their apis are created asynchronously.
   * @param sources The permitted sources.
   */
  setSources(sources: ReadonlyArray<UmbraDesktopSearchSource>): void {
    this.#sources = [...sources].sort((a, b) => b.weight - a.weight);
    if (!this.#query) return;
    this.#search(this.#query);
  }

  /**
   * Search for new text. Blank text is no search at all, and text that differs only by spaces at
   * its ends is the search already shown: typing the space before a second word would otherwise
   * empty the sources' results and ask for the same ones again.
   * @param query What was typed.
   */
  setQuery(query: string): void {
    const trimmed = query.trim();
    if (trimmed === this.#query) return;
    this.#query = trimmed;
    if (!trimmed) {
      this.#generation++;
      clearTimeout(this.#timer);
      this.#emit(UMBRADESKTOP_SEARCH_EMPTY_STATE);
      return;
    }
    this.#search(trimmed);
  }

  /**
   * Show one source's full list, from its first page.
   * @param alias The source's alias.
   */
  async drill(alias: string): Promise<void> {
    const source = this.#sources.find((s) => s.alias === alias);
    if (!source || !this.#state.query) return;
    const known = [...this.#state.sections, ...this.#state.others].find((s) => s.source === source);
    this.#emit({ ...this.#state, drill: { source, items: [], total: known?.total ?? 0, loading: true } });
    await this.#loadPage(source, this.#generation, 0);
  }

  /** Load the drilled-down list's next page; nothing when it is loading or complete. */
  async more(): Promise<void> {
    const drill = this.#state.drill;
    if (!drill || drill.loading || drill.items.length >= drill.total) return;
    this.#emit({ ...this.#state, drill: { ...drill, loading: true } });
    await this.#loadPage(drill.source, this.#generation, drill.items.length);
  }

  /** Back from the drilled-down list to the mixed results, the text kept. */
  closeDrill(): void {
    if (this.#state.drill) this.#emit({ ...this.#state, drill: undefined });
  }

  /** Stop: no timer fires and no late answer is reported. */
  dispose(): void {
    this.#disposed = true;
    this.#generation++;
    clearTimeout(this.#timer);
  }

  /**
   * The apps for a query, all of them. Uncapped because a user has at most a few dozen apps, all
   * already in memory, and an app that matches but is cut off is one they cannot find any other way.
   * @param query The trimmed query.
   * @returns The matching apps, best first.
   */
  #matchApps(query: string): UmbraDesktopApp[] {
    return rankApps(this.#apps, this.#options.nameOf, query);
  }

  /**
   * Start a search: the apps for the text at once, the sources' results emptied and pending, and the
   * sources asked once typing has paused. Any answer still on its way for earlier text is dropped.
   * @param query The trimmed query.
   */
  #search(query: string): void {
    this.#generation++;
    this.#emit({ query, apps: this.#matchApps(query), sections: [], others: [], pending: true });
    this.#schedule(query);
  }

  /**
   * Ask the sources once typing has paused.
   * @param query The trimmed query.
   */
  #schedule(query: string): void {
    clearTimeout(this.#timer);
    const generation = this.#generation;
    this.#timer = setTimeout(() => void this.#run(query, generation), this.#options.debounceMs ?? UMBRADESKTOP_SEARCH_DEBOUNCE_MS);
  }

  /**
   * Ask every source at once, each for its own take, and show their answers together, below the
   * apps already shown. A source that throws or reports an error is left out; the rest still show
   * (design §6).
   * @param query The trimmed query.
   * @param generation The query's number.
   */
  async #run(query: string, generation: number): Promise<void> {
    const answers = await Promise.all(
      this.#sources.map(async (source): Promise<UmbraDesktopSearchSection | undefined> => {
        const take = source.prominence === 'full' ? UMBRADESKTOP_SEARCH_TAKE.full : UMBRADESKTOP_SEARCH_TAKE.compact;
        try {
          const page = await source.search(query, { skip: 0, take });
          return { source, items: page.items, total: page.total };
        } catch {
          return undefined;
        }
      }),
    );
    if (generation !== this.#generation) return;
    const found = answers.filter((a): a is UmbraDesktopSearchSection => !!a && a.total > 0);
    this.#emit({
      ...this.#state,
      sections: found.filter((a) => a.source.prominence === 'full'),
      others: found.filter((a) => a.source.prominence === 'compact'),
      pending: false,
    });
  }

  /**
   * Append one page to the drilled-down list. A failed page ends the list where it is, rather than
   * leaving it loading forever.
   * @param source The drilled-into source.
   * @param generation The query's number when the page was asked for.
   * @param skip How many items are already shown.
   */
  async #loadPage(source: UmbraDesktopSearchSource, generation: number, skip: number): Promise<void> {
    let page;
    try {
      page = await source.search(this.#state.query, { skip, take: UMBRADESKTOP_SEARCH_TAKE.page });
    } catch {
      page = undefined;
    }
    const drill = this.#state.drill;
    if (generation !== this.#generation || drill?.source !== source) return;
    this.#emit({
      ...this.#state,
      drill: page
        ? { source, items: [...drill.items, ...page.items], total: page.total, loading: false }
        : { ...drill, total: drill.items.length, loading: false },
    });
  }

  /**
   * Store and report a state, unless disposed.
   * @param state The new state.
   */
  #emit(state: UmbraDesktopSearchState): void {
    if (this.#disposed) return;
    this.#state = state;
    this.#options.onChange(state);
  }
}
