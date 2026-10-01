/**
 * Rewrites a README's relative links into absolute GitHub links pinned to one commit, for the copy
 * that goes into a NuGet package.
 *
 * The README in the repository links relatively, which is right on GitHub: it follows whichever
 * branch or tag is being read. The packed copy cannot. NuGet does not resolve relative links at
 * all, and the Umbraco Marketplace shows the packed README, so both need absolute ones. Pinning
 * them to the commit that was packed, rather than to `main`, means an older version's package page
 * keeps showing that version's screenshots and docs.
 *
 * Plain JS so the pack script can run it and the browser test runner can test it.
 */

import { classifyLines, isExternal, resolvePath, splitInlineCode } from './markdown-docs.mjs';

/** An image's target: the part inside `![alt](...)`. */
const IMAGE = /(!\[[^\]]*\]\(\s*)([^)\s]+)((?:\s+"[^"]*")?\s*\))/g;

/** Any link's target: the part inside `](...)`. Runs after images, so it only sees links. */
const TARGET = /(\]\(\s*)([^)\s]+)((?:\s+"[^"]*")?\s*\))/g;

/**
 * Pins every relative link and image in a README to one commit of the repository.
 * @param {string} markdown The README as it is in the repository.
 * @param {object} options Where the README lives and what to pin to.
 * @param {string} options.repo `owner/name` on GitHub.
 * @param {string} options.ref The commit (or tag) to pin to.
 * @param {string} [options.readmeDir] The README's directory, repository-relative, when it is not
 *   at the root. The add-on's README is in its project folder.
 * @returns {string} The README with absolute links. Same-page anchors, external links and
 *   anything in code are left as they are.
 */
export function pinReadmeLinks(markdown, { repo, ref, readmeDir = '' }) {
  /**
   * The absolute URL for one relative target.
   * @param {string} target The link target as written.
   * @param {boolean} image Whether it is an image, which needs the raw file rather than GitHub's
   *   page about it.
   * @returns {string} The URL to write instead.
   */
  const pin = (target, image) => {
    if (isExternal(target) || target.startsWith('#')) return target;
    const hash = target.indexOf('#');
    const pathPart = hash === -1 ? target : target.slice(0, hash);
    const anchor = hash === -1 ? '' : target.slice(hash);
    const path = resolvePath(readmeDir, pathPart);
    if (image) return `https://raw.githubusercontent.com/${repo}/${ref}/${path}${anchor}`;
    const kind = pathPart.endsWith('/') ? 'tree' : 'blob';
    return `https://github.com/${repo}/${kind}/${ref}/${path}${anchor}`;
  };

  const lines = classifyLines(markdown).map(({ text, prose }) => {
    if (!prose) return text;
    return splitInlineCode(text)
      .map((segment, i) => {
        if (i % 2 === 1) return segment;
        return segment
          .replace(IMAGE, (_, open, target, close) => `${open}${pin(target, true)}${close}`)
          .replace(TARGET, (_, open, target, close) => `${open}${pin(target, false)}${close}`);
      })
      .join('');
  });
  return lines.join('\n');
}
