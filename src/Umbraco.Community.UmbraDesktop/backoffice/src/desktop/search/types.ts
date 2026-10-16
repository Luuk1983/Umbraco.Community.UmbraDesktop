/**
 * What every part of desktop search speaks: sources answer queries with pages of items, and the
 * engine folds them into one state a view draws. Kept free of Lit and Umbraco imports so the engine
 * and its tests depend on nothing but these shapes.
 */
import type { UmbraDesktopApp } from '../types';

/**
 * How a source is drawn: `full` as a section of its own (Documents, Media), `folded` as one count in
 * the "Also in" line (design D2).
 */
export type UmbraDesktopSearchProminence = 'full' | 'folded';

/** One page of a source's results, as core's providers page them. */
export interface UmbraDesktopSearchPaging {
  /** How many results to skip. */
  skip: number;
  /** How many results to return. */
  take: number;
}

/**
 * What opening a result does. `href` is optional because core's `UmbSearchResultItemModel.href`
 * is: a result without one is shown but cannot be opened, as in the native modal.
 */
export type UmbraDesktopSearchOpen =
  /** A backoffice entity, opened in a window of its own. */
  | { kind: 'entity'; entityType: string; unique: string; href?: string }
  /** A Help page, opened in Help at a `product/page#heading` target. */
  | { kind: 'help'; target: string };

/** One result, as any source returns it and any view draws it. */
export interface UmbraDesktopSearchItem {
  /** Unique across sources, for keyed rendering and tests. */
  key: string;
  /** The name to show. */
  name: string;
  /** The icon to show. */
  icon: string;
  /** A second line, such as where a document lives. */
  detail?: string;
  /** What opening it does. */
  open: UmbraDesktopSearchOpen;
}

/** One page of a source's results, with the total that tells a view whether more exist. */
export interface UmbraDesktopSearchPage {
  /** The results on this page. */
  items: UmbraDesktopSearchItem[];
  /** How many results the source has in all for the query. */
  total: number;
}

/** Anything that can be searched: a core `globalSearch` registration, or Help. */
export interface UmbraDesktopSearchSource {
  /** Identifies the source; the manifest alias for core's. */
  alias: string;
  /**
   * The heading to show. May be a `#`-prefixed localisation key, as manifest labels often are, so
   * a view passes it through `localize.string`.
   */
  label: string;
  /** Heavier sources come first, as in the native modal's tabs. */
  weight: number;
  /** Whether it is drawn as a section or folded into a count. */
  prominence: UmbraDesktopSearchProminence;
  /**
   * Search one page. Throws when the source fails, which leaves it out of the results.
   * @param query The trimmed query.
   * @param paging The page wanted.
   * @returns The page.
   */
  search(query: string, paging: UmbraDesktopSearchPaging): Promise<UmbraDesktopSearchPage>;
}

/** One source's answer to the current query. */
export interface UmbraDesktopSearchSection {
  /** The source. */
  source: UmbraDesktopSearchSource;
  /** The results shown; empty for a folded source, which shows only its count. */
  items: UmbraDesktopSearchItem[];
  /** How many it found in all. */
  total: number;
}

/** The drilled-down list: one source's results, a page at a time. */
export interface UmbraDesktopSearchDrill extends UmbraDesktopSearchSection {
  /** True while a page is loading, so a second request is not made. */
  loading: boolean;
}

/** Everything a search view draws. */
export interface UmbraDesktopSearchState {
  /** The trimmed query; empty when nothing is being searched. */
  query: string;
  /** The matching apps, best first. */
  apps: UmbraDesktopApp[];
  /** The full sections that found something, heaviest source first. */
  sections: UmbraDesktopSearchSection[];
  /** The folded sources that found something, with their totals. */
  folded: UmbraDesktopSearchSection[];
  /** True while the sources have not answered the current query. */
  pending: boolean;
  /** The source drilled into, if any. */
  drill?: UmbraDesktopSearchDrill;
}
