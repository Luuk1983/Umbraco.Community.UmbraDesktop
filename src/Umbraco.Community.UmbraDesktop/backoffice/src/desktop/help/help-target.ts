/**
 * Where Help should open: a product, one of its pages, and a heading on that page.
 *
 * One string form, `product/page/heading`, is used by every way in: the Help context, the
 * `umbradesktop-open-help` event and the `?help=` deep link, and it is also a Help window's saved
 * location. Page ids come from the docs' front matter and do not change when a file moves, so a
 * target outlives restructuring the docs.
 */
export interface UmbraDesktopHelpTarget {
  /** The product's id, from its `product.json`. */
  product: string;
  /** A page's `id` from its front matter. Absent means the product's front page. */
  page?: string;
  /** A heading's anchor on that page. Absent means the top of the page. */
  heading?: string;
}

/**
 * A product or page id: what the writing guide allows, lowercase and hyphenated. Underscores and
 * digits are let through because nothing would be gained by refusing them.
 */
const ID = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * A heading anchor: what `githubSlug` can produce, which keeps letters of any script, digits,
 * underscores and hyphens.
 */
const ANCHOR = /^[\p{L}\p{M}\p{N}_-]+$/u;

/**
 * Reads a target string. Lenient where a person typing or pasting a link would be (case, a
 * trailing slash, surrounding space) and strict about everything else, since whatever this accepts
 * ends up in a window and in a URL.
 * @param value Anything; only a well-formed string yields a target.
 * @returns The target, or undefined when the value is not one.
 */
export function parseHelpTarget(value: unknown): UmbraDesktopHelpTarget | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value.trim().toLowerCase().replace(/\/$/, '').split('/');
  if (parts.length > 3) return undefined;
  const [product, page, heading] = parts;
  if (!ID.test(product)) return undefined;
  if (page !== undefined && !ID.test(page)) return undefined;
  if (heading !== undefined && !ANCHOR.test(heading)) return undefined;
  const target: UmbraDesktopHelpTarget = { product };
  if (page !== undefined) target.page = page;
  if (heading !== undefined) target.heading = heading;
  return target;
}

/**
 * Writes a target string, the inverse of {@link parseHelpTarget}.
 * @param target The target.
 * @returns `product`, `product/page` or `product/page/heading`. A heading without a page is dropped,
 *   since a heading only means something on a page.
 */
export function formatHelpTarget(target: UmbraDesktopHelpTarget): string {
  if (!target.page) return target.product;
  return target.heading ? `${target.product}/${target.page}/${target.heading}` : `${target.product}/${target.page}`;
}
