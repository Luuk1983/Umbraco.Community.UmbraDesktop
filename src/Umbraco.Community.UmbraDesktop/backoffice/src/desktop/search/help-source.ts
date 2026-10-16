import { searchHelp } from '../help/help-search';
import { formatHelpTarget } from '../help/help-target';
import type { UmbraDesktopHelpProduct } from '../help/help-product';
import type { UmbraDesktopSearchSource } from './types';

/** The Help source's alias. */
export const UMBRADESKTOP_HELP_SEARCH_ALIAS = 'umbraDesktop.search.help';

/**
 * Help's docs search as a folded source (design D5), over every product's user guide: the
 * developer guide is not what someone searching from the launcher is after. The docs load on the
 * first search rather than when the desktop opens, and only once; a failed load stays failed for
 * the session, which leaves Help out of "Also in" rather than retrying on every keystroke.
 * @param load Loads the installed products' docs.
 * @returns The source.
 */
export function helpSearchSource(load: () => Promise<ReadonlyArray<UmbraDesktopHelpProduct>>): UmbraDesktopSearchSource {
  let products: Promise<ReadonlyArray<UmbraDesktopHelpProduct>> | undefined;
  return {
    alias: UMBRADESKTOP_HELP_SEARCH_ALIAS,
    label: '#umbraDesktop_searchHelp',
    // After every core source, whatever weight a package gives its own.
    weight: Number.MIN_SAFE_INTEGER,
    prominence: 'folded',
    async search(query, { skip, take }) {
      products ??= load();
      const found = (await products).flatMap((product) =>
        searchHelp(product, query, { part: 'user', limit: Number.MAX_SAFE_INTEGER }).map((result) => ({ product, result })),
      );
      return {
        total: found.length,
        items: found.slice(skip, skip + take).map(({ product, result }) => {
          const target = formatHelpTarget({ product: product.id, page: result.page.id, heading: result.heading?.anchor });
          return {
            key: `help:${target}`,
            name: result.heading ? `${result.page.title} › ${result.heading.text}` : result.page.title,
            icon: 'icon-help-alt',
            detail: result.snippet,
            open: { kind: 'help', target },
          };
        }),
      };
    },
  };
}
