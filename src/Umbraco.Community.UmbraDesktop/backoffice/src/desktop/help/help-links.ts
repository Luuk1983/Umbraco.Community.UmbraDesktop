import { isExternal, resolvePath } from '../../../scripts/docs/markdown-docs.mjs';
import type { UmbraDesktopHelpPage, UmbraDesktopHelpProduct } from './help-product';

/** What following a link in a Help page does (Help design §4.4). */
export type UmbraDesktopHelpLink =
  /** Scroll to a heading on the same page. */
  | { kind: 'anchor'; heading: string }
  /** Show a page, in this product or another installed one, in this window. */
  | { kind: 'page'; product: string; page: string; heading?: string }
  /** Open outside the desktop, in a new tab. */
  | { kind: 'external'; url: string }
  /** Nothing: the link cannot go anywhere, so it renders as plain text. */
  | { kind: 'none' };

/** Where a link is followed from. */
export interface UmbraDesktopHelpLinkOrigin {
  /** The product the page belongs to. */
  product: UmbraDesktopHelpProduct;
  /** The page the link is on. */
  page: UmbraDesktopHelpPage;
}

/** The schemes a link may open. Anything else, `javascript:` and `data:` above all, goes nowhere. */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * Escapes a string for use inside a regular expression.
 * @param text The literal text.
 * @returns The escaped text.
 */
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits a link target into its path and its heading.
 * @param target The link target.
 * @returns The path, and the decoded heading when there is one.
 */
function splitHash(target: string): { path: string; heading?: string } {
  const hash = target.indexOf('#');
  if (hash === -1) return { path: target };
  const heading = decodeURIComponent(target.slice(hash + 1));
  return heading ? { path: target.slice(0, hash), heading } : { path: target.slice(0, hash) };
}

/**
 * The page a docs-relative path names in a product: the file itself, or the `README.md` of a
 * folder, which is how a link to a category reaches its overview.
 * @param product The product.
 * @param path The path relative to its docs folder.
 * @returns The page, if there is one.
 */
function pageAt(product: UmbraDesktopHelpProduct, path: string): UmbraDesktopHelpPage | undefined {
  return product.pageByPath.get(path) ?? product.pageByPath.get(`${path.replace(/\/$/, '')}/README.md`);
}

/**
 * A page link, with the heading only when there is one.
 * @param product The product's id.
 * @param page The page.
 * @param heading The heading, if any.
 * @returns The link.
 */
function pageLink(product: string, page: UmbraDesktopHelpPage, heading: string | undefined): UmbraDesktopHelpLink {
  return heading ? { kind: 'page', product, page: page.id, heading } : { kind: 'page', product, page: page.id };
}

/**
 * Decides what a link in a Help page does, in the order the design gives:
 *
 * 1. `#anchor`: scroll within the page.
 * 2. A relative link to a published page: that page, in this window.
 * 3. A GitHub link into an installed product's docs, matched on its `repository` and `docsRoot`
 *    whatever branch or tag it names: that page in that product. This is how an add-on, which must
 *    link to the desktop's docs by URL, still gets an in-app link.
 * 4. A relative link to a file that is not published: that file on GitHub at the commit the docs
 *    were built from, or nothing when the product names no repository.
 * 5. Anything else with a safe scheme: a new tab.
 * @param href The link's target as written in the Markdown.
 * @param from The product and page the link is on.
 * @param products Every installed product.
 * @returns What to do.
 */
export function resolveHelpLink(
  href: string,
  from: UmbraDesktopHelpLinkOrigin,
  products: ReadonlyArray<UmbraDesktopHelpProduct>,
): UmbraDesktopHelpLink {
  if (href.startsWith('#')) {
    const heading = decodeURIComponent(href.slice(1));
    return heading ? { kind: 'anchor', heading } : { kind: 'none' };
  }

  if (isExternal(href)) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return { kind: 'none' };
    }
    if (!SAFE_SCHEMES.has(url.protocol)) return { kind: 'none' };
    const { path, heading } = splitHash(href);
    for (const product of products) {
      if (!product.repository || !product.docsRoot) continue;
      const match = new RegExp(
        `^${escapeRegExp(product.repository)}/(?:blob|tree)/[^/]+/${escapeRegExp(product.docsRoot)}/(.*)$`,
      ).exec(path);
      const page = match ? pageAt(product, decodeURIComponent(match[1])) : undefined;
      if (page) return pageLink(product.id, page, heading);
    }
    return { kind: 'external', url: href };
  }

  const { path, heading } = splitHash(href);
  const resolved = resolvePath(from.page.folder, decodeURIComponent(path));
  const page = resolved.startsWith('..') ? undefined : pageAt(from.product, resolved);
  if (page) return pageLink(from.product.id, page, heading);

  const { repository, docsRoot } = from.product;
  if (!repository) return { kind: 'none' };
  const repoPath = resolvePath(docsRoot ? `${docsRoot}/${from.page.folder}` : from.page.folder, decodeURIComponent(path));
  const kind = path.endsWith('/') || !/\.[^/]+$/.test(repoPath) ? 'tree' : 'blob';
  const hash = heading ? `#${heading}` : '';
  return { kind: 'external', url: `${repository}/${kind}/${from.product.ref ?? 'main'}/${repoPath}${hash}` };
}

/**
 * Where an image in a Help page loads from: resolved against the page, under the product's own
 * folder, because that is where the copy step put it.
 * @param src The image's source as written in the Markdown.
 * @param from The product and page it is on.
 * @returns The URL to load, or undefined for one that would climb out of the folder or use an unsafe
 *   scheme.
 */
export function helpImageUrl(src: string, from: UmbraDesktopHelpLinkOrigin): string | undefined {
  if (isExternal(src)) {
    try {
      return SAFE_SCHEMES.has(new URL(src).protocol) ? src : undefined;
    } catch {
      return undefined;
    }
  }
  const resolved = resolvePath(from.page.folder, decodeURIComponent(src.split('#')[0]));
  return resolved.startsWith('..') ? undefined : `${from.product.basePath}/${resolved}`;
}
