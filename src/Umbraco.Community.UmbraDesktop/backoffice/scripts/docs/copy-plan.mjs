/**
 * Decides what of a docs root goes into the package for the Help app: `product.json`, the published
 * pages and category files, and only the images those pages use.
 *
 * Plain JS with one import, so the copy script can run it and the browser test runner can test it.
 * The copying itself, and the recompressing, is `copy-docs.mjs`.
 */

import { dirname, extractLinks, isExternal, resolvePath } from './markdown-docs.mjs';

/** The folders inside a docs root that are published, the same two the docs check treats so. */
const PUBLISHED = ['user/', 'developer/'];

/**
 * Plans the copy of one docs root.
 * @param {Map<string, string>} files Every Markdown and JSON file under the docs root: path
 *   relative to the root, forward slashes, to content.
 * @returns {{ files: string[], images: string[], problems: string[] }} The files and images to copy,
 *   relative to the root and sorted, and anything worth a warning.
 */
export function planDocsCopy(files) {
  const copy = [];
  const images = new Set();
  const problems = [];
  for (const [path, content] of files) {
    const published = PUBLISHED.some((folder) => path.startsWith(folder));
    if (path === 'product.json' || (published && (path.endsWith('.md') || path.endsWith('/_category_.json')))) {
      copy.push(path);
    }
    if (!published || !path.endsWith('.md')) continue;
    for (const link of extractLinks(content)) {
      if (!link.image || isExternal(link.target)) continue;
      const resolved = resolvePath(dirname(path), link.target.split('#')[0]);
      if (resolved.startsWith('..')) {
        problems.push(`${path} uses ${link.target}, which is outside the docs folder, so the Help app cannot show it`);
      } else {
        images.add(resolved);
      }
    }
  }
  return { files: copy.sort(), images: [...images].sort(), problems };
}
