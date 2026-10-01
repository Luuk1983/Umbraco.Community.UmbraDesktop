import { Marked } from '@umbraco-cms/backoffice/external/marked';
import { DOMPurify } from '@umbraco-cms/backoffice/external/dompurify';
import { githubSlug } from '../../../scripts/docs/markdown-docs.mjs';
import { helpImageUrl, resolveHelpLink, type UmbraDesktopHelpLinkOrigin } from './help-links';
import type { UmbraDesktopHelpProduct } from './help-product';
import { formatHelpTarget } from './help-target';
import { helpDeepLinkHref } from './help-deep-link';

/**
 * One Markdown parser for every page. GitHub-flavoured, since the docs are written for GitHub and
 * tables are the part of GFM they use most. A private instance rather than the shared `marked`
 * default, so nothing else in the backoffice that configures that one changes how Help renders.
 */
const parser = new Marked({ gfm: true });

/**
 * Tags a docs page has no business rendering. DOMPurify already removes scripts and handlers; these
 * go too because they could restyle the app around the page or submit something from inside it.
 */
const FORBID_TAGS = ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'];

/**
 * Renders one Help page: Markdown to HTML, sanitised, and then made to behave inside the app.
 *
 * - **Headings** get the anchors from the page's own heading list, which is the docs check's, so a
 *   link's `#anchor` lands where the check promised it would.
 * - **Links** are marked with what following them does (`data-help-kind`), decided by
 *   `resolveHelpLink`; the app's click handler acts on the mark. An in-app link keeps a real `href`,
 *   the deep link to the same page, so it stays a link to a keyboard, a screen reader and a middle
 *   click. A link that goes nowhere becomes plain text rather than a dead link.
 * - **Images** load from the product's own folder, lazily, and one that would load from outside it
 *   becomes its alt text.
 * - **Overviews**: on a guide's or a category's front page (its `README.md`), a list or table of
 *   pages, each with a sentence about it, becomes a column of blocks that open the page. The writing
 *   guide asks those pages for exactly that list, and as bullets it read as an afterthought.
 *
 * The Markdown is a package's content, not the user's, and the rules forbid raw HTML in it; the
 * sanitising is there for when a package breaks the rules anyway.
 * @param from The product and page to render.
 * @param products Every installed product, for links into another one.
 * @returns The rendered page, ready to insert.
 */
export function renderHelpPage(from: UmbraDesktopHelpLinkOrigin, products: ReadonlyArray<UmbraDesktopHelpProduct>): DocumentFragment {
  const html = parser.parse(from.page.body, { async: false }) as string;
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS,
    FORBID_ATTR: ['style', 'id', 'class'],
  }) as DocumentFragment;

  fragment.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading, index) => {
    heading.id = from.page.headings[index]?.anchor ?? githubSlug(heading.textContent ?? '');
  });

  fragment.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    const link = href ? resolveHelpLink(href, from, products) : { kind: 'none' as const };
    if (link.kind === 'none') {
      anchor.replaceWith(...anchor.childNodes);
      return;
    }
    anchor.dataset.helpKind = link.kind;
    if (link.kind === 'anchor' || link.kind === 'page') {
      // Umbraco's router takes over every same-origin link click at the window, through shadow
      // roots, and pushes the address itself: an in-app link without this navigated the whole
      // backoffice away from the desktop. The app's own click handler does the following instead.
      anchor.dataset.routerSlot = 'disabled';
    }
    if (link.kind === 'anchor') {
      anchor.dataset.helpHeading = link.heading;
      anchor.setAttribute('href', `#${link.heading}`);
    } else if (link.kind === 'page') {
      const target = formatHelpTarget(link);
      anchor.dataset.helpTarget = target;
      anchor.setAttribute('href', helpDeepLinkHref(target));
    } else {
      anchor.setAttribute('href', link.url);
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  });

  if (from.page.path.endsWith('/README.md')) {
    fragment.querySelectorAll('ul').forEach(listToOverview);
    fragment.querySelectorAll('table').forEach(tableToOverview);
  }

  fragment.querySelectorAll('img').forEach((image) => {
    const url = helpImageUrl(image.getAttribute('src') ?? '', from);
    if (!url) {
      image.replaceWith(document.createTextNode(image.alt));
      return;
    }
    image.setAttribute('src', url);
    image.loading = 'lazy';
  });

  return fragment;
}

/**
 * The page link an overview entry starts with: the first thing in it, apart from white space.
 * @param container A list item or a table cell.
 * @returns The link, or undefined when the entry does not start with a link to a page.
 */
function leadingPageLink(container: Element): HTMLAnchorElement | undefined {
  const first = [...container.childNodes].find((node) => node.nodeType !== Node.TEXT_NODE || node.textContent!.trim() !== '');
  return first instanceof HTMLAnchorElement && first.dataset.helpKind === 'page' ? first : undefined;
}

/**
 * Builds one overview block: the page link itself, made into a block holding the page's name and the
 * sentence about it.
 *
 * The block is a link, so a link inside the sentence would nest one link in another, which HTML does
 * not allow: those become their text. Everything else in the sentence, such as inline code, is kept.
 * @param link The entry's page link, which becomes the block.
 * @param text The nodes of the sentence about the page.
 * @returns The list item holding the block.
 */
function overviewItem(link: HTMLAnchorElement, text: Node[]): HTMLLIElement {
  const title = document.createElement('span');
  title.className = 'overview-title';
  title.append(...link.childNodes);

  const description = document.createElement('span');
  description.className = 'overview-text';
  description.append(...text);
  description.querySelectorAll('a').forEach((nested) => nested.replaceWith(...nested.childNodes));
  // The list form reads "[Page](page.md): what it is", so the sentence starts after the colon, and
  // as a line of its own it starts with a capital.
  const first = description.firstChild;
  if (first?.nodeType === Node.TEXT_NODE) {
    const trimmed = first.textContent!.replace(/^[\s:\u2013\u2014-]+/, '');
    first.textContent = trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
  }

  link.className = 'overview-item';
  link.append(title, description);
  const item = document.createElement('li');
  item.append(link);
  return item;
}

/**
 * Turns a list into overview blocks when every item starts with a page link.
 * @param list A list on an overview page.
 */
function listToOverview(list: HTMLUListElement): void {
  // A list with blank lines between its items wraps each item's text in a paragraph.
  const items = [...list.children].map((item) =>
    item.children.length === 1 && item.firstElementChild instanceof HTMLParagraphElement ? item.firstElementChild : item,
  );
  const links = items.map(leadingPageLink);
  if (items.length === 0 || links.some((link) => !link)) return;
  list.className = 'overview';
  list.replaceChildren(
    ...items.map((item, index) => {
      const link = links[index]!;
      link.remove();
      return overviewItem(link, [...item.childNodes]);
    }),
  );
}

/**
 * Turns a table into overview blocks when it is a list of pages in disguise: two columns, the first
 * holding nothing but a page link in every row. The column headings go, since a block says what both
 * columns said.
 * @param table A table on an overview page.
 */
function tableToOverview(table: HTMLTableElement): void {
  const rows = [...table.querySelectorAll('tbody tr')];
  const cells = rows.map((row) => [...row.children]);
  if (rows.length === 0 || cells.some((row) => row.length !== 2)) return;
  const links = cells.map(([name]) => leadingPageLink(name));
  if (links.some((link, index) => !link || cells[index][0].textContent!.trim() !== link.textContent!.trim())) return;
  const list = document.createElement('ul');
  list.className = 'overview';
  list.append(...cells.map(([, about], index) => overviewItem(links[index]!, [...about.childNodes])));
  table.replaceWith(list);
}
