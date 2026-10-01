/**
 * Fails the build when a link in the documentation goes nowhere.
 *
 * Runs first in `npm run build`. Moving a docs page breaks every link into it silently, on GitHub,
 * in the Help app and on any future docs site alike, so the only reliable check is one nobody has
 * to remember to run.
 *
 * What it reads: the READMEs, CLAUDE.md and RELEASE.md, everything under the root `docs/`, and
 * every package's own `docs/`. Design docs and plans are checked for dead links too, since they
 * link into the guides, but only pages inside a product's `user/` or `developer/` folder are
 * published, and only those need front matter. A product is a folder holding a `product.json`. See
 * docs/developer/writing-documentation.md.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocs } from './markdown-docs.mjs';

/** The repository root: this file is at src/<package>/backoffice/scripts/docs/. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

/** Directories never worth descending into, however deep they appear. */
const SKIP = new Set(['node_modules', '.git', 'bin', 'obj', 'wwwroot']);

/** The folders inside a product that hold published pages. */
const PUBLISHED = ['user', 'developer'];

/**
 * Converts an OS path under the root to the repository-relative, forward-slash form links use.
 * @param {string} path Absolute path.
 * @returns {string} Repository-relative path.
 */
const toRepo = (path) => relative(root, path).split(sep).join('/');

/**
 * Every Markdown file below a directory.
 * @param {string} dir Absolute directory.
 * @returns {string[]} Absolute file paths.
 */
function markdownBelow(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : markdownBelow(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

/**
 * Whether a repository-relative path exists with exactly this spelling. Windows would find
 * `Docs/Theming.md` for `docs/theming.md`; GitHub, Linux CI and every web server would not, so a
 * case mismatch is as dead as a missing file.
 * @param {string} path Repository-relative path.
 * @returns {boolean} True if every segment exists as written.
 */
function existsExactly(path) {
  let current = root;
  for (const segment of path.split('/')) {
    if (!existsSync(current) || !statSync(current).isDirectory()) return false;
    if (!readdirSync(current).includes(segment)) return false;
    current = join(current, segment);
  }
  return true;
}

const packages = readdirSync(join(root, 'src'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(root, 'src', entry.name));

const paths = [
  ...['README.md', 'CLAUDE.md', 'RELEASE.md'].map((name) => join(root, name)).filter(existsSync),
  ...markdownBelow(join(root, 'docs')),
  ...packages.flatMap((dir) => [
    ...(existsSync(join(dir, 'README.md')) ? [join(dir, 'README.md')] : []),
    ...markdownBelow(join(dir, 'docs')),
  ]),
];

const products = [join(root, 'docs'), ...packages.map((dir) => join(dir, 'docs'))]
  .filter((dir) => existsSync(join(dir, 'product.json')))
  .map((dir) => ({ root: toRepo(dir), id: JSON.parse(readFileSync(join(dir, 'product.json'), 'utf8')).id }));

const files = new Map(paths.map((path) => [toRepo(path), readFileSync(path, 'utf8')]));

const problems = checkDocs({
  files,
  exists: existsExactly,
  productOf: (path) =>
    products.find((product) => PUBLISHED.some((folder) => path.startsWith(`${product.root}/${folder}/`)))?.id,
});

if (problems.length > 0) {
  for (const { file, line, message } of problems) console.error(`${file}:${line} ${message}`);
  console.error(`\nThe docs check found ${problems.length} problem(s) in ${files.size} Markdown files.`);
  process.exit(1);
}
console.log(`Docs check: ${files.size} Markdown files, ${products.length} products, no dead links.`);
