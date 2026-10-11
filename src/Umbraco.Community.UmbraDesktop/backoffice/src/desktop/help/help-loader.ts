import { UmbraDesktopService } from '../../api/sdk.gen';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbraDesktopCatalogueReport } from '../types';
import { pickProducts, type UmbraDesktopDocsSource } from './docs-sources';
import { buildHelpProduct, type UmbraDesktopHelpProduct } from './help-product';

/**
 * How the loader reaches a docs folder. An interface so the loader can be tested against an
 * in-memory site; {@link serverDocsFetcher} is the real one.
 */
export interface UmbraDesktopDocsFetcher {
  /**
   * The files of a docs folder, relative to it.
   * @param path The folder's URL path.
   * @returns The files, or undefined when the folder cannot be listed.
   */
  list(path: string): Promise<string[] | undefined>;
  /**
   * One file's text.
   * @param url The file's URL path.
   * @returns Its content, or undefined when it cannot be read.
   */
  read(url: string): Promise<string | undefined>;
}

/**
 * The real fetcher: the listing through the desktop's endpoint, and the files as the static assets
 * they are. No request leaves the site (Help design D1, D4).
 * @param host The element that owns the requests, so they are cancelled with it.
 * @returns The fetcher.
 */
export function serverDocsFetcher(host: UmbControllerHost): UmbraDesktopDocsFetcher {
  return {
    async list(path) {
      // Quietly: a docs folder that cannot be listed is reported once in the console by the loader,
      // not raised as a notification on every open of the Help app.
      const { data } = await tryExecute(host, UmbraDesktopService.getDocsFiles({ query: { path } }), { disableNotifications: true });
      return data?.files;
    },
    async read(url) {
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        return response.ok ? await response.text() : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Loads every registered docs folder into a product: lists it, reads all of its pages and data
 * files, and builds the tree. All of it at once, because search covers the full text and a docs set
 * is small (UmbraDesktop's is about fifty files). Never throws; a folder that fails is left out and
 * reported, and the others still load.
 * @param sources The validated `umbraDesktopDocs` manifests.
 * @param fetcher How to reach the folders.
 * @returns The products, highest manifest weight first and then by name, and the reports.
 */
export async function loadHelpProducts(
  sources: ReadonlyArray<UmbraDesktopDocsSource>,
  fetcher: UmbraDesktopDocsFetcher,
): Promise<{ products: UmbraDesktopHelpProduct[]; reports: UmbraDesktopCatalogueReport[] }> {
  const reports: UmbraDesktopCatalogueReport[] = [];
  /**
   * Records one problem with a source.
   * @param source The source.
   * @param what A key unique within the source.
   * @param text What completes `Docs "<alias>": `.
   */
  const report = (source: UmbraDesktopDocsSource, what: string, text: string) =>
    reports.push({ key: `docs-load:${source.manifestAlias}:${what}`, message: `[UmbraDesktop] Docs "${source.manifestAlias}": ${text}` });

  const loaded = await Promise.all(
    sources.map(async (source) => {
      const files = await fetcher.list(source.path);
      if (!files) {
        report(source, 'list', `${source.path} could not be listed, so the Help app leaves it out.`);
        return undefined;
      }
      const contents = await Promise.all(
        files.map(async (file) => [file, await fetcher.read(`${source.path}/${file}`)] as const),
      );
      const product = buildHelpProduct(
        source.path,
        new Map(contents.filter((entry): entry is readonly [string, string] => entry[1] !== undefined)),
      );
      if (!product) {
        report(source, 'product', `${source.path}/product.json is missing or has no "id", so the Help app leaves it out.`);
        return undefined;
      }
      for (const problem of product.problems) report(source, problem, problem);
      return { source, productId: product.id, product };
    }),
  );

  const { kept, reports: conflicts } = pickProducts(loaded.filter((claim) => claim !== undefined));
  reports.push(...conflicts);
  const products = kept
    .sort(
      (a, b) =>
        b.source.manifestWeight - a.source.manifestWeight ||
        (a.product.name < b.product.name ? -1 : a.product.name > b.product.name ? 1 : 0),
    )
    .map((claim) => claim.product);
  return { products, reports };
}
