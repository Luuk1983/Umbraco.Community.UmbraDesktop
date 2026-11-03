import { DOMPurify } from '@umbraco-cms/backoffice/external/dompurify';
import { httpsUrl } from './marketplace';

/**
 * Tags a README has no business rendering inside the backoffice. DOMPurify already removes scripts
 * and handlers; these go too because they could restyle the app around the README or submit
 * something from inside it. The same list Help uses for docs pages, for the same reasons.
 */
const FORBID_TAGS = ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'];

/**
 * Renders an add-on's README for the details page.
 *
 * The README is HTML the Marketplace rendered from another party's Markdown, so it is treated the way
 * Help treats a docs page that broke the rules: sanitised by core's DOMPurify, and then made to
 * behave inside the app.
 *
 * - **Links** to a web page open in a new tab, and carry `data-router-slot="disabled"`: Umbraco's
 *   router takes every same-origin link click at the window, through shadow roots, and a README link
 *   it took would navigate the backoffice away from the desktop. Anything else, an anchor into the
 *   README's own headings or a path relative to its repository, has nowhere to go from here and
 *   becomes its text.
 * - **Images** are kept when they are https, and load lazily. Anything else becomes its alt text,
 *   since a relative path would load from this site.
 * - **Style, class and id** go, so nothing in the README can reach the app's own CSS.
 * @param html The README as the Marketplace returns it.
 * @returns The rendered README, ready to insert.
 */
export function renderReadme(html: string): DocumentFragment {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS,
    FORBID_ATTR: ['style', 'id', 'class'],
  }) as DocumentFragment;

  fragment.querySelectorAll('a').forEach((anchor) => {
    const href = httpsUrl(anchor.getAttribute('href'));
    if (!href) {
      anchor.replaceWith(...anchor.childNodes);
      return;
    }
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.dataset.routerSlot = 'disabled';
  });

  fragment.querySelectorAll('img').forEach((image) => {
    if (!httpsUrl(image.getAttribute('src'))) {
      image.replaceWith(document.createTextNode(image.alt));
      return;
    }
    image.loading = 'lazy';
  });

  return fragment;
}
