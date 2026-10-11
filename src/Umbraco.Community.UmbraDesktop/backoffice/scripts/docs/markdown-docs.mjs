/**
 * The Markdown knowledge the docs check and the README packer share: which lines are code, what a
 * heading's anchor is, where the links are, and what a page's front matter says.
 *
 * Plain JS with no imports, so the node scripts beside it can run it directly and the browser test
 * runner can test it. It is deliberately not a Markdown parser. The docs keep to a small subset of
 * GitHub-flavoured Markdown (see docs/developer/writing-documentation.md), and this reads exactly
 * that subset, the same way GitHub and Docusaurus do.
 */

/**
 * Normalises Windows line endings, since a checkout with autocrlf hands these files over with
 * `\r\n` and every regex below is written for `\n`.
 * @param {string} text Markdown source.
 * @returns {string} The same text with `\n` line endings.
 */
function normalise(text) {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Splits a document into lines and marks the ones that are prose rather than code or front
 * matter. Links and headings only count on prose lines: a `#` in a bash block is a comment and a
 * `[x](y)` in a Markdown sample is an example.
 * @param {string} text Markdown source.
 * @returns {{ text: string, prose: boolean }[]} Every line, in order, so an index plus one is its
 *   line number.
 */
export function classifyLines(text) {
  const lines = normalise(text).split('\n');
  const result = [];
  let inFrontMatter = lines[0] === '---';
  let fence = null;
  lines.forEach((line, index) => {
    if (inFrontMatter) {
      result.push({ text: line, prose: false });
      if (index > 0 && line === '---') inFrontMatter = false;
      return;
    }
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      result.push({ text: line, prose: false });
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return;
    }
    if (marker) {
      fence = marker[1];
      result.push({ text: line, prose: false });
      return;
    }
    result.push({ text: line, prose: true });
  });
  return result;
}

/**
 * Splits a prose line on its inline code spans, so callers can transform only the parts outside
 * them. Even indexes are prose, odd indexes are code spans with their backticks.
 * @param {string} line One prose line.
 * @returns {string[]} Alternating prose and code segments.
 */
export function splitInlineCode(line) {
  return line.split(/(`+[^`]*?`+)/);
}

/**
 * The anchor GitHub gives a heading, which Docusaurus also uses (both run github-slugger), so a
 * link written for one works on the other.
 * @param {string} text The heading's rendered text.
 * @returns {string} The anchor, without the leading `#`.
 */
export function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/**
 * Reduces a heading's Markdown to the text it renders as, which is what the slug is made from.
 * @param {string} heading Heading source after the `#` marks.
 * @returns {string} The rendered text.
 */
function renderedHeadingText(heading) {
  return heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .replace(/\*/g, '')
    .trim();
}

/**
 * Every heading in a document, in order: its level, the text it renders as, and the anchor GitHub
 * gives it, with the `-1`, `-2` suffixes for repeats. The Help app builds its page outline and its
 * heading ids from this, so they are the anchors the docs check has already verified.
 * @param {string} text Markdown source.
 * @returns {{ level: number, text: string, anchor: string, line: number }[]} The headings.
 */
export function headings(text) {
  const found = [];
  const seen = new Map();
  classifyLines(text).forEach((line, index) => {
    if (!line.prose) return;
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line.text);
    if (!match) return;
    const rendered = renderedHeadingText(match[2]);
    const base = githubSlug(rendered);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    found.push({ level: match[1].length, text: rendered, anchor: count === 0 ? base : `${base}-${count}`, line: index + 1 });
  });
  return found;
}

/**
 * Every anchor a document's headings produce, in order.
 * @param {string} text Markdown source.
 * @returns {Set<string>} The anchors, without `#`.
 */
export function headingAnchors(text) {
  return new Set(headings(text).map((heading) => heading.anchor));
}

/** An image: `![alt](target "title")`. The title is optional and never part of the target. */
const IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

/** The target half of any link or image: `](target "title")`. */
const TARGET = /\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

/** The front matter `image` line: the picture the Help landing page shows for a guide. */
const FRONT_MATTER_IMAGE = /^image:\s*(["']?)([^"'\s]+)\1\s*$/;

/**
 * Every link and image target in a document, with its line number. Images on a line come before
 * links on it, which puts a badge's image before the link wrapped round it.
 *
 * The front matter's `image` counts as an image too, so the check catches a dead one and the copy
 * for Help takes it along. No other front matter value is a link.
 * @param {string} text Markdown source.
 * @returns {{ target: string, line: number, image: boolean }[]} The targets, in document order.
 */
export function extractLinks(text) {
  const links = [];
  const lines = classifyLines(text);
  if (lines[0]?.text === '---') {
    for (let index = 1; index < lines.length && lines[index].text !== '---'; index++) {
      const image = FRONT_MATTER_IMAGE.exec(lines[index].text);
      if (image) links.push({ target: image[2], line: index + 1, image: true });
    }
  }
  lines.forEach((line, index) => {
    if (!line.prose) return;
    const prose = splitInlineCode(line.text)
      .map((segment, i) => (i % 2 === 0 ? segment : ' '.repeat(segment.length)))
      .join('');
    const images = [...prose.matchAll(IMAGE)];
    for (const match of images) links.push({ target: match[1], line: index + 1, image: true });
    // Blank the images out so the generic pattern below finds only the links around them.
    const withoutImages = prose.replace(IMAGE, (m) => ' '.repeat(m.length));
    for (const match of withoutImages.matchAll(TARGET)) {
      links.push({ target: match[1], line: index + 1, image: false });
    }
  });
  return links;
}

/**
 * Reads a page's front matter. Only flat `key: value` pairs, which is all a docs page carries:
 * the fields Docusaurus reads (`id`, `title`, `description`, `sidebar_position`, `image`).
 * @param {string} text Markdown source.
 * @returns {{ data: Record<string, string>, body: string }} The values, as strings, and the text
 *   after the closing `---`.
 */
export function parseFrontMatter(text) {
  const source = normalise(text);
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    data[pair[1]] = pair[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return { data, body: source.slice(match[0].length) };
}

/**
 * Whether a target is a URL with a scheme (`https:`, `mailto:`) rather than a path in the
 * repository.
 * @param {string} target Link target.
 * @returns {boolean} True for a URL.
 */
export function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

/**
 * Resolves a relative path against a directory, POSIX style, the way a browser resolves a link.
 * @param {string} dir Directory of the linking file, repository-relative, `''` for the root.
 * @param {string} path The relative path from the link.
 * @returns {string} The repository-relative path, or one starting `..` if it climbs out.
 */
export function resolvePath(dir, path) {
  const parts = [];
  for (const part of `${dir}/${path}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

/**
 * The directory part of a repository-relative file path.
 * @param {string} file A file path.
 * @returns {string} Its directory, `''` at the root.
 */
export function dirname(file) {
  const slash = file.lastIndexOf('/');
  return slash === -1 ? '' : file.slice(0, slash);
}

/**
 * An absolute URL to a file in this repository, as opposed to one of its issues. Such a link on a
 * published page always shows `main`, whatever version the reader installed, which is exactly
 * what a relative link and the pack-time pinning exist to avoid.
 */
const OWN_FILE_URL =
  /^https:\/\/(?:raw\.githubusercontent\.com\/Luuk1983\/Umbraco\.Community\.UmbraDesktop\/[^/]+\/|github\.com\/Luuk1983\/Umbraco\.Community\.UmbraDesktop\/(?:blob|tree|raw)\/[^/]+\/)([^#?]*)/i;

/**
 * Checks a set of Markdown files for links that go nowhere and pages that cannot be addressed.
 *
 * Everything outside is passed in, so the function is pure: the node script supplies the real
 * repository, the tests supply a fake one.
 * @param {object} input What to check.
 * @param {Map<string, string>} input.files Repository-relative path to content, for every
 *   Markdown file to check. A link into one of these also has its anchor checked.
 * @param {(path: string) => boolean} input.exists Whether a file or directory exists.
 * @param {(path: string) => string | undefined} input.productOf The product a published page
 *   belongs to, or undefined for a file that is not published (a design doc, a README).
 * @returns {{ file: string, line: number, message: string }[]} Every problem found, in file
 *   order.
 */
export function checkDocs({ files, exists, productOf }) {
  const problems = [];
  const anchorCache = new Map();
  const idOwners = new Map();

  /**
   * Anchors of a file, parsed once however many links point into it.
   * @param {string} path A key of `files`.
   * @returns {Set<string>} Its anchors.
   */
  const anchorsOf = (path) => {
    if (!anchorCache.has(path)) anchorCache.set(path, headingAnchors(files.get(path)));
    return anchorCache.get(path);
  };

  for (const [file, content] of files) {
    const product = productOf(file);
    const pinned = product !== undefined || /(^|\/)README\.md$/.test(file);

    if (product !== undefined) {
      const { data } = parseFrontMatter(content);
      if (!data.id) problems.push({ file, line: 1, message: 'has no id in its front matter' });
      if (!data.title) problems.push({ file, line: 1, message: 'has no title in its front matter' });
      if (data.id) {
        const key = `${product}\n${data.id}`;
        const owner = idOwners.get(key);
        if (owner) {
          problems.push({ file, line: 1, message: `uses the id ${data.id}, which ${owner} already uses` });
        } else {
          idOwners.set(key, file);
        }
      }
    }

    for (const { target, line } of extractLinks(content)) {
      if (isExternal(target)) {
        const own = OWN_FILE_URL.exec(target);
        // A page links to its own product relatively, so the link follows the version being read.
        // Another product is a separate package with its own versions and, for an add-on, its own
        // repository, so an absolute link is the only kind that works there. A README is always
        // relative, because packing pins it. A target that is no product's published page, such as
        // a screenshot, counts as the page's own: only a page of another product is exempt.
        const targetProduct = own === null ? undefined : productOf(own[1]);
        const otherProduct = product !== undefined && targetProduct !== undefined && targetProduct !== product;
        if (pinned && own !== null && !otherProduct) {
          problems.push({
            file,
            line,
            message: 'links to this repository by absolute URL; use a relative path so it follows the version',
          });
        }
        continue;
      }
      const hash = target.indexOf('#');
      const pathPart = hash === -1 ? target : target.slice(0, hash);
      const anchor = hash === -1 ? undefined : target.slice(hash + 1);
      let resolved = file;
      if (pathPart !== '') {
        resolved = resolvePath(dirname(file), decodeURIComponent(pathPart));
        if (resolved.startsWith('..') || !exists(resolved)) {
          problems.push({ file, line, message: `links to ${resolved}, which does not exist` });
          continue;
        }
      }
      if (anchor !== undefined && anchor !== '' && files.has(resolved) && !anchorsOf(resolved).has(anchor)) {
        problems.push({ file, line, message: `links to #${anchor} in ${resolved}, which has no such heading` });
      }
    }
  }
  return problems;
}
