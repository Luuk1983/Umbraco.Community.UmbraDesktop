import { dirname, headings, isExternal, parseFrontMatter, resolvePath } from '../../../scripts/docs/markdown-docs.mjs';
import { isFiniteNumber, isNonEmptyString, isRecord } from '../manifest-values';

/** The two published parts of a docs folder, in the order the sidebar shows them. */
export const HELP_PARTS = ['user', 'developer'] as const;

/** One of {@link HELP_PARTS}. */
export type UmbraDesktopHelpPartId = (typeof HELP_PARTS)[number];

/** A heading on a page. */
export interface UmbraDesktopHelpHeading {
  /** 1 to 6. */
  level: number;
  /** The text it renders as. */
  text: string;
  /** Its anchor, which a target's heading names. */
  anchor: string;
  /** Its line in the page body, counted from 1, which search uses to find the section a match is in. */
  line: number;
}

/** One published page. */
export interface UmbraDesktopHelpPage {
  /** Its front matter `id`, which targets name. */
  id: string;
  /** Its front matter `title`, or its first heading. */
  title: string;
  /** Its front matter `description`, when it has one. */
  description?: string;
  /**
   * Its front matter `image`, relative to the docs folder, when it names one inside it. The Help
   * landing page shows a guide's front page's image on the guide's card.
   */
  image?: string;
  /** The part it is in. */
  part: UmbraDesktopHelpPartId;
  /** Its path relative to the docs folder, such as `user/windows/snapping.md`. */
  path: string;
  /** The folder it is in, relative to the docs folder, such as `user/windows`. */
  folder: string;
  /** Its `sidebar_position`, or infinity, so pages without one sort after those with one. */
  order: number;
  /** The Markdown after the front matter. */
  body: string;
  /** Its headings, in order. */
  headings: UmbraDesktopHelpHeading[];
}

/** A category folder inside a part. */
export interface UmbraDesktopHelpCategory {
  /** Its folder relative to the docs folder, such as `user/windows`. */
  folder: string;
  /** From `_category_.json`, else its front page's title, else the folder name. */
  label: string;
  /** From `_category_.json`, or infinity. */
  position: number;
  /** Its `README.md`, the overview the writing guide asks each category for. */
  index?: UmbraDesktopHelpPage;
  /** Its other pages, in sidebar order. */
  pages: UmbraDesktopHelpPage[];
}

/** The user guide or the developer guide of a product. */
export interface UmbraDesktopHelpPart {
  /** Which one. */
  part: UmbraDesktopHelpPartId;
  /** Its `README.md`. */
  index?: UmbraDesktopHelpPage;
  /** Where the guide opens: its `README.md`, else its first page, else its first category's. */
  frontPage?: UmbraDesktopHelpPage;
  /** Pages directly in the part's folder, in sidebar order. */
  pages: UmbraDesktopHelpPage[];
  /** Its categories, in sidebar order. */
  categories: UmbraDesktopHelpCategory[];
}

/** One product's docs, ready to show. */
export interface UmbraDesktopHelpProduct {
  /** From `product.json`. */
  id: string;
  /** From `product.json`, or the id. */
  name: string;
  /** The folder's URL path, which images and page files resolve against. */
  basePath: string;
  /** From `product.json`: the GitHub repository, for recognising links into this product. */
  repository?: string;
  /** From `product.json`: where the docs root sits in that repository. */
  docsRoot?: string;
  /** From `product.json`, written by the copy step: the commit the docs were built from. */
  ref?: string;
  /** The parts that have any pages, user guide first. */
  parts: UmbraDesktopHelpPart[];
  /** Where a target naming only the product lands. */
  frontPage?: UmbraDesktopHelpPage;
  /** Every page by id. */
  pageById: Map<string, UmbraDesktopHelpPage>;
  /** Every page by path relative to the docs folder. */
  pageByPath: Map<string, UmbraDesktopHelpPage>;
  /** Pages left out, and why, for the console. */
  problems: string[];
}

/**
 * Sorts pages by sidebar position, then title, compared ordinally.
 * @param a One page.
 * @param b Another.
 * @returns The comparison.
 */
function bySidebar(a: UmbraDesktopHelpPage, b: UmbraDesktopHelpPage): number {
  return a.order - b.order || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
}

/**
 * Reads a JSON file, or nothing.
 * @param text The file's content, if there was one.
 * @returns The object it holds, or undefined for anything else.
 */
function readJson(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds one product's docs from the files of its folder, the way the Help app shows them: the
 * user guide and developer guide, their categories and pages in the order the front matter and
 * category files give, and an index of every page by id and path.
 *
 * The rules are the writing guide's, and the parsing is the docs check's own
 * (`scripts/docs/markdown-docs.mjs`), so a page the check passes is a page this finds, with the same
 * anchors. It never throws: a page it cannot use is left out and reported.
 * @param basePath The folder's URL path.
 * @param files Every file the listing returned, path relative to the folder to content.
 * @returns The product, or undefined when its `product.json` is missing or has no id.
 */
export function buildHelpProduct(basePath: string, files: ReadonlyMap<string, string>): UmbraDesktopHelpProduct | undefined {
  const json = readJson(files.get('product.json'));
  if (!json || !isNonEmptyString(json.id)) return undefined;

  const problems: string[] = [];
  const pageById = new Map<string, UmbraDesktopHelpPage>();
  const pageByPath = new Map<string, UmbraDesktopHelpPage>();

  for (const [path, content] of files) {
    if (!path.endsWith('.md') || !HELP_PARTS.some((part) => path.startsWith(`${part}/`))) continue;
    const { data, body } = parseFrontMatter(content);
    if (!data.id) {
      problems.push(`${path} has no id in its front matter, so it is left out of Help`);
      continue;
    }
    const owner = pageById.get(data.id);
    if (owner) {
      problems.push(`${path} uses the id ${data.id}, which ${owner.path} already uses, so it is left out of Help`);
      continue;
    }
    const pageHeadings = headings(body);
    const order = Number(data.sidebar_position);
    const page: UmbraDesktopHelpPage = {
      id: data.id,
      part: path.slice(0, path.indexOf('/')) as UmbraDesktopHelpPartId,
      title: data.title || pageHeadings[0]?.text || path.slice(path.lastIndexOf('/') + 1, -3),
      path,
      folder: path.slice(0, path.lastIndexOf('/')),
      order: data.sidebar_position !== undefined && Number.isFinite(order) ? order : Infinity,
      body,
      headings: pageHeadings,
    };
    if (data.description) page.description = data.description;
    if (data.image && !isExternal(data.image)) {
      const image = resolvePath(dirname(path), data.image);
      if (!image.startsWith('..')) page.image = image;
    }
    pageById.set(page.id, page);
    pageByPath.set(path, page);
  }

  const parts: UmbraDesktopHelpPart[] = [];
  for (const partId of HELP_PARTS) {
    const part: UmbraDesktopHelpPart = { part: partId, pages: [], categories: [] };
    const categories = new Map<string, UmbraDesktopHelpCategory>();
    for (const page of pageByPath.values()) {
      const segments = page.path.split('/');
      if (segments[0] !== partId) continue;
      const isIndex = segments[segments.length - 1] === 'README.md';
      if (segments.length === 2) {
        if (isIndex) part.index = page;
        else part.pages.push(page);
        continue;
      }
      const folder = `${partId}/${segments[1]}`;
      let category = categories.get(folder);
      if (!category) {
        const meta = readJson(files.get(`${folder}/_category_.json`));
        category = {
          folder,
          label: isNonEmptyString(meta?.label) ? meta.label : '',
          position: isFiniteNumber(meta?.position) ? meta.position : Infinity,
          pages: [],
        };
        categories.set(folder, category);
      }
      if (isIndex && segments.length === 3) category.index = page;
      else category.pages.push(page);
    }
    for (const category of categories.values()) {
      if (!category.label) category.label = category.index?.title ?? category.folder.slice(category.folder.indexOf('/') + 1);
      category.pages.sort(bySidebar);
    }
    part.pages.sort(bySidebar);
    part.categories = [...categories.values()].sort(
      (a, b) => a.position - b.position || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
    );
    part.frontPage = part.index ?? part.pages[0] ?? part.categories[0]?.index ?? part.categories[0]?.pages[0];
    if (part.frontPage) parts.push(part);
  }

  const product: UmbraDesktopHelpProduct = {
    id: json.id,
    name: isNonEmptyString(json.name) ? json.name : json.id,
    basePath,
    parts,
    frontPage: parts[0]?.frontPage,
    pageById,
    pageByPath,
    problems,
  };
  if (isNonEmptyString(json.repository)) product.repository = json.repository.replace(/\/+$/, '');
  if (isNonEmptyString(json.docsRoot)) product.docsRoot = json.docsRoot.replace(/^\/+|\/+$/g, '');
  if (isNonEmptyString(json.ref)) product.ref = json.ref;
  return product;
}
