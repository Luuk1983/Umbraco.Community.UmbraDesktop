import type { UmbraDesktopHelpCategory, UmbraDesktopHelpPage, UmbraDesktopHelpPart, UmbraDesktopHelpProduct } from './help-product';
import type { UmbraDesktopHelpTarget } from './help-target';

/**
 * The location a Help window reports while it shows the landing page. Not a target string, so
 * `parseHelpTarget` reads it as no target, which is the landing page; it exists because the desktop
 * only saves a location that is set, and a window that went back to the landing page has to replace
 * the page it was on.
 */
export const UMBRADESKTOP_HELP_LANDING_LOCATION = '/';

/** Why a Help window is not showing exactly what it was asked for. */
export type UmbraDesktopHelpNotice =
  /** The product is installed, and the page is not in its docs: a link from a newer version, or a typo. */
  | { kind: 'page-missing'; name: string }
  /** No installed product has this id: its package is not installed here. */
  | { kind: 'product-missing'; name: string };

/**
 * A guide: one part of one product, which Help shows as documentation of its own. The landing page
 * has a card for each, and the picker an entry, so the developer guide is not buried under the user
 * guide's sidebar.
 */
export interface UmbraDesktopHelpGuide {
  /** The product. */
  product: UmbraDesktopHelpProduct;
  /** Its user guide or developer guide. */
  part: UmbraDesktopHelpPart;
}

/** The landing page: a card for every guide. */
export interface UmbraDesktopHelpLandingView {
  /** Which view. */
  kind: 'landing';
  /** Set when a target could not be followed at all. */
  notice?: UmbraDesktopHelpNotice;
}

/** One page of one guide. */
export interface UmbraDesktopHelpPageView {
  /** Which view. */
  kind: 'page';
  /** The product. */
  product: UmbraDesktopHelpProduct;
  /** The part the page is in, which is the guide the sidebar shows. */
  part: UmbraDesktopHelpPart;
  /** The category the page is in, if any, for the breadcrumb and the sidebar's open branch. */
  category?: UmbraDesktopHelpCategory;
  /** The page. */
  page: UmbraDesktopHelpPage;
  /** The heading to scroll to, only when the page has it. */
  heading?: string;
  /** Set when the target could not be followed exactly. */
  notice?: UmbraDesktopHelpNotice;
}

/** What a Help window shows. */
export type UmbraDesktopHelpView = UmbraDesktopHelpLandingView | UmbraDesktopHelpPageView;

/**
 * Every guide there is, in picker order: every product's user guide, in product order, then every
 * developer guide. Most people opening Help want to know how to do something, so the developer
 * guides come after all of those rather than between them.
 * @param products The installed products, in picker order.
 * @returns The guides.
 */
export function helpGuides(products: ReadonlyArray<UmbraDesktopHelpProduct>): UmbraDesktopHelpGuide[] {
  const guides = products.flatMap((product) => product.parts.map((part) => ({ product, part })));
  return [...guides.filter((guide) => guide.part.part === 'user'), ...guides.filter((guide) => guide.part.part !== 'user')];
}

/**
 * The view of one page, with the part and category it sits in.
 * @param product The product.
 * @param page The page.
 * @param extra The heading and notice, when there are any.
 * @returns The view.
 */
function pageView(
  product: UmbraDesktopHelpProduct,
  page: UmbraDesktopHelpPage,
  extra: Pick<UmbraDesktopHelpPageView, 'heading' | 'notice'> = {},
): UmbraDesktopHelpPageView {
  // Every page is in a part the product kept: a part is kept whenever it has a page.
  const part = product.parts.find((candidate) => candidate.part === page.part)!;
  const category = part.categories.find((candidate) => candidate.index === page || candidate.pages.includes(page));
  return { kind: 'page', product, part, ...(category && { category }), page, ...extra };
}

/**
 * Decides what a Help window shows for a target (Help design §6.3). It never shows nothing when
 * something is installed: a target that does not resolve opens the nearest thing that does, with a
 * notice saying so, since links will come from newer versions' docs and from typos.
 * @param products The installed products, in picker order.
 * @param target Where the window was asked to go; undefined for the landing page.
 * @returns The view, or undefined when no installed product has a page.
 */
export function resolveHelpTarget(
  products: ReadonlyArray<UmbraDesktopHelpProduct>,
  target: UmbraDesktopHelpTarget | undefined,
): UmbraDesktopHelpView | undefined {
  if (!products.some((product) => product.frontPage)) return undefined;
  if (!target) return { kind: 'landing' };

  const product = products.find((candidate) => candidate.id === target.product);
  if (!product?.frontPage) {
    return product ? { kind: 'landing' } : { kind: 'landing', notice: { kind: 'product-missing', name: target.product } };
  }
  if (!target.page) return pageView(product, product.frontPage);

  const page = product.pageById.get(target.page);
  if (!page) return pageView(product, product.frontPage, { notice: { kind: 'page-missing', name: product.name } });

  return target.heading && page.headings.some((heading) => heading.anchor === target.heading)
    ? pageView(product, page, { heading: target.heading })
    : pageView(product, page);
}
