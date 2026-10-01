import type { UmbraDesktopCatalogueReport } from '../types';
import { isFiniteNumber, isNonEmptyString, isRecord } from '../manifest-values';

/** The only folder docs may be served from, the same rule the listing endpoint enforces. */
const DOCS_ROOT = '/App_Plugins/';

/** One registered docs folder, after validation. */
export interface UmbraDesktopDocsSource {
  /** The manifest alias, which every report about it names. */
  manifestAlias: string;
  /** The manifest's root weight, higher first, 0 when unset; decides between two claims on one product. */
  manifestWeight: number;
  /** The folder's same-origin path, without a trailing slash. */
  path: string;
}

/**
 * The same-origin path of a docs folder, when it is one the Help app may read: under
 * `/App_Plugins/` on this origin.
 *
 * `URL` resolves the path first, so what is checked is what will be fetched: `/App_Plugins/../css`
 * is judged as `/css` and refused. The server applies the same rule again, because the manifest is
 * whatever a package wrote.
 * @param path The manifest's `meta.path`.
 * @param origin This page's origin, passed in so the rule is testable.
 * @returns The path without a trailing slash, or undefined when it is refused.
 */
export function docsFolderPath(path: string, origin: string): string | undefined {
  if (path === '') return undefined;
  let parsed: URL;
  try {
    parsed = new URL(path, origin);
  } catch {
    return undefined;
  }
  if (parsed.origin !== origin) return undefined;
  const pathname = parsed.pathname.replace(/\/+$/, '');
  if (!pathname.startsWith(DOCS_ROOT) || pathname.length <= DOCS_ROOT.length) return undefined;
  return pathname;
}

/**
 * Validates the `umbraDesktopDocs` manifests Umbraco has permitted. **Never throws**: the input is a
 * package's JSON, and one throw would leave the Help app without any docs at all.
 * @param manifests The permitted manifests, typed as unknown on purpose.
 * @param origin This page's origin.
 * @returns The usable sources, in input order, and a report for each one dropped.
 */
export function normaliseDocsManifests(
  manifests: ReadonlyArray<unknown>,
  origin: string,
): { sources: UmbraDesktopDocsSource[]; reports: UmbraDesktopCatalogueReport[] } {
  const sources: UmbraDesktopDocsSource[] = [];
  const reports: UmbraDesktopCatalogueReport[] = [];
  for (const manifest of manifests) {
    if (!isRecord(manifest)) continue;
    const manifestAlias = String(manifest.alias);
    /**
     * Records one problem with this manifest.
     * @param what A key unique within the manifest.
     * @param text What completes `Docs "<alias>"`.
     */
    const report = (what: string, text: string) =>
      reports.push({ key: `docs:${manifestAlias}:${what}`, message: `[UmbraDesktop] Docs "${manifestAlias}"${text}` });
    const meta = manifest.meta;
    if (!isRecord(meta)) {
      report('meta', ' has no "meta" object, so the Help app cannot find its docs.');
      continue;
    }
    if (!isNonEmptyString(meta.path)) {
      report('path', ' has no "meta.path", so the Help app cannot find its docs.');
      continue;
    }
    const path = docsFolderPath(meta.path, origin);
    if (!path) {
      report('path', `: "meta.path" must be a folder under ${DOCS_ROOT} on this site, and "${meta.path}" is not.`);
      continue;
    }
    sources.push({ manifestAlias, manifestWeight: isFiniteNumber(manifest.weight) ? manifest.weight : 0, path });
  }
  return { sources, reports };
}

/** A source whose `product.json` has been read, paired with the product id it declares. */
export interface UmbraDesktopClaimedProduct {
  /** The registered folder. */
  source: UmbraDesktopDocsSource;
  /** The `id` from its `product.json`. */
  productId: string;
}

/**
 * Keeps one source per product id. Two packages can claim the same product, a fork of an add-on
 * installed beside the original for instance, and a target names a product, so only one may answer.
 * The precedence is the catalogues' own: higher manifest weight, then the lower alias, compared
 * ordinally so the result does not depend on a locale.
 * @param claims Every source with its product id, in registration order.
 * @param T The claim's type, so whatever the caller attached rides along.
 * @returns The winners, in the order their product first appeared, and a report per loser.
 */
export function pickProducts<T extends UmbraDesktopClaimedProduct>(
  claims: ReadonlyArray<T>,
): { kept: T[]; reports: UmbraDesktopCatalogueReport[] } {
  const byProduct = new Map<string, T[]>();
  for (const claim of claims) {
    const list = byProduct.get(claim.productId);
    if (list) list.push(claim);
    else byProduct.set(claim.productId, [claim]);
  }
  const kept: T[] = [];
  const reports: UmbraDesktopCatalogueReport[] = [];
  for (const [productId, list] of byProduct) {
    const ranked = [...list].sort(
      (a, b) =>
        b.source.manifestWeight - a.source.manifestWeight ||
        (a.source.manifestAlias < b.source.manifestAlias ? -1 : a.source.manifestAlias > b.source.manifestAlias ? 1 : 0),
    );
    const [winner, ...losers] = ranked;
    kept.push(winner);
    for (const loser of losers) {
      reports.push({
        key: `docs-product:${productId}:${loser.source.manifestAlias}`,
        message: `[UmbraDesktop] Docs "${loser.source.manifestAlias}" and "${winner.source.manifestAlias}" both describe product "${productId}"; "${winner.source.manifestAlias}" is shown.`,
      });
    }
  }
  return { kept, reports };
}
