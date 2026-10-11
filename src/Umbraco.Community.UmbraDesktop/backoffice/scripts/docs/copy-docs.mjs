/**
 * Copies UmbraDesktop's published docs into `public/docs/`, where the build serves them at
 * `/App_Plugins/Umbraco.Community.UmbraDesktop/docs/` for the Help app.
 *
 * What is copied is decided by `copy-plan.mjs`: `product.json`, the pages and category files under
 * `user/` and `developer/`, and only the images those pages use. The design docs and plans stay out.
 *
 * Two things happen on the way that an add-on need not copy:
 *
 * - **`product.json` gets a `ref`**, the commit being built. The Help app pins links to unpublished
 *   files (a design doc, a source file) to it, so they open on GitHub at the version installed.
 * - **Images are recompressed** as palette PNGs, keeping their names so the Markdown needs no
 *   change. A screenshot of UI has few colours, so this takes the user guide's images from about
 *   4 MB to well under half that. A result that comes out larger than the original is not used.
 *
 * `public/docs/` is gitignored, like `public/wallpapers/`: the docs in the repository are the source
 * of truth and this is derived from them on every build. The folder is emptied first, so a page
 * removed from the docs is removed from the package too.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { planDocsCopy } from './copy-plan.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backofficeDir = join(scriptDir, '..', '..');
const repoRoot = join(backofficeDir, '..', '..', '..');
const docsRoot = join(repoRoot, 'docs');
const outputDir = join(backofficeDir, 'public', 'docs');

/**
 * Every Markdown and JSON file below a folder.
 * @param {string} dir Absolute folder.
 * @returns {Promise<string[]>} Absolute file paths.
 */
async function textFilesBelow(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return textFilesBelow(path);
      return /\.(md|json)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

/**
 * The commit being built, or undefined outside a git checkout, in which case the Help app falls
 * back to linking unpublished files at `main`.
 * @returns {string | undefined} The full commit hash.
 */
function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Writes an image as a palette PNG, unless that would be larger than the original.
 * @param {string} from Absolute source path.
 * @param {string} to Absolute destination path.
 * @returns {Promise<{ before: number, after: number }>} The sizes, for the summary line.
 */
async function recompress(from, to) {
  const before = (await stat(from)).size;
  if (!from.toLowerCase().endsWith('.png')) {
    await copyFile(from, to);
    return { before, after: before };
  }
  const buffer = await sharp(from).png({ palette: true, quality: 80, effort: 10, compressionLevel: 9 }).toBuffer();
  if (buffer.length < before) {
    await writeFile(to, buffer);
    return { before, after: buffer.length };
  }
  await copyFile(from, to);
  return { before, after: before };
}

const paths = await textFilesBelow(docsRoot);
const files = new Map(
  await Promise.all(paths.map(async (path) => [relative(docsRoot, path).split(sep).join('/'), await readFile(path, 'utf8')])),
);
const plan = planDocsCopy(files);
for (const problem of plan.problems) console.warn(`Docs copy: ${problem}`);

await rm(outputDir, { recursive: true, force: true });
for (const file of plan.files) {
  const to = join(outputDir, file);
  await mkdir(dirname(to), { recursive: true });
  if (file === 'product.json') {
    const product = JSON.parse(files.get(file));
    const ref = currentCommit();
    await writeFile(to, `${JSON.stringify(ref ? { ...product, ref } : product, null, 2)}\n`);
  } else {
    await writeFile(to, files.get(file));
  }
}

let before = 0;
let after = 0;
for (const image of plan.images) {
  const from = join(docsRoot, image);
  if (!existsSync(from)) continue; // The docs check reports a missing image; nothing to copy here.
  const to = join(outputDir, image);
  await mkdir(dirname(to), { recursive: true });
  const sizes = await recompress(from, to);
  before += sizes.before;
  after += sizes.after;
}

const mb = (bytes) => (bytes / 1048576).toFixed(1);
console.log(
  `Docs copy: ${plan.files.length} files and ${plan.images.length} images into public/docs (images ${mb(before)} MB -> ${mb(after)} MB).`,
);
