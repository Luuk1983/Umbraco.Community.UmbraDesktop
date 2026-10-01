import { classifyLines } from '../../../scripts/docs/markdown-docs.mjs';
import type { UmbraDesktopHelpHeading, UmbraDesktopHelpPage, UmbraDesktopHelpPartId, UmbraDesktopHelpProduct } from './help-product';

/** One search result. */
export interface UmbraDesktopHelpSearchResult {
  /** The page it is on. */
  page: UmbraDesktopHelpPage;
  /** The heading of the section the text match is in; absent when it matched the title or description. */
  heading?: UmbraDesktopHelpHeading;
  /** A line of plain text around the match, to show under the title. */
  snippet: string;
}

/**
 * How much a query word counts for, by where it matched. The title outranks everything else. A
 * query of several words found together as one phrase in the text counts for more than the same
 * words scattered over the page: `frame-ancestors` belongs to the page about framing, not to the
 * one that mentions a `.frame` class and, paragraphs later, its ancestors.
 */
const WEIGHTS = { title: 100, phrase: 50, heading: 20, description: 10, body: 1 };

/** How long a snippet may be before it is cut, in characters. */
const SNIPPET_LENGTH = 160;

/**
 * The words of a text, lowercased: runs of letters and digits in any script.
 * @param text Any text.
 * @returns Its words.
 */
const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Whether any word of a text starts with a query word. Prefix rather than whole-word matching, so a
 * search finds a page while the word is still being typed.
 * @param textWords The text's words.
 * @param query One query word.
 * @returns True on a match.
 */
const hits = (textWords: ReadonlyArray<string>, query: string) => textWords.some((word) => word.startsWith(query));

/**
 * A Markdown line as plain text: no heading marks, list markers, emphasis, code ticks or link syntax.
 * @param line One line of Markdown.
 * @returns The text a reader sees.
 */
function plain(line: string): string {
  return line
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.|>)\s+/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

/**
 * A snippet cut to length around a position.
 * @param text The plain line.
 * @returns The snippet, with an ellipsis where it was cut.
 */
const clip = (text: string) => (text.length <= SNIPPET_LENGTH ? text : `${text.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…`);

/**
 * Searches one product's pages: titles, descriptions, headings and full text. Every query word has
 * to appear somewhere on a page, as the start of a word, in any case. The pages are all in memory
 * already, which is why this needs no index (Help design D2).
 * @param product The product to search.
 * @param query What was typed.
 * @param options What to search and how much to return.
 * @param options.part Only this part: Help shows the user guide and the developer guide as separate
 *   guides, and searches the one being read. Both when absent.
 * @param options.limit The most results to return.
 * @returns The results, best first, then in sidebar order of title.
 */
export function searchHelp(
  product: UmbraDesktopHelpProduct,
  query: string,
  { part, limit = 30 }: { part?: UmbraDesktopHelpPartId; limit?: number } = {},
): UmbraDesktopHelpSearchResult[] {
  const queryWords = words(query);
  if (queryWords.length === 0) return [];

  const scored: Array<UmbraDesktopHelpSearchResult & { score: number }> = [];
  for (const page of product.pageById.values()) {
    if (part && page.part !== part) continue;
    const title = words(page.title);
    const description = words(page.description ?? '');
    const headingWords = words(page.headings.map((h) => h.text).join(' '));
    const lines = classifyLines(page.body).map((line) => (line.prose ? line.text : ''));
    const bodyWords = words(lines.join(' '));

    let score = 0;
    let everyWord = true;
    for (const word of queryWords) {
      const inTitle = hits(title, word);
      const inBody = hits(bodyWords, word);
      if (!inTitle && !inBody && !hits(description, word)) {
        everyWord = false;
        break;
      }
      if (inTitle) score += WEIGHTS.title;
      if (hits(headingWords, word)) score += WEIGHTS.heading;
      if (hits(description, word)) score += WEIGHTS.description;
      if (inBody) score += WEIGHTS.body;
    }
    if (!everyWord) continue;

    const phrase = queryWords.length > 1 ? queryWords.join(' ') : undefined;
    const inPhrase = (text: string) => phrase !== undefined && words(text).join(' ').includes(phrase);
    if (phrase && inPhrase(lines.join(' '))) score += WEIGHTS.phrase;

    // The line holding the whole phrase is the most telling place to point at; failing that, the
    // first body line holding a query word that is not in the title. When every word is in the
    // title, the page's own description says it best.
    const telling = queryWords.find((word) => !hits(title, word)) ?? queryWords[0] ?? '';
    const phraseLine = phrase ? lines.findIndex((line) => !/^\s*#/.test(line) && inPhrase(line)) : -1;
    const lineIndex = phraseLine !== -1 ? phraseLine : lines.findIndex((line) => !/^\s*#/.test(line) && hits(words(line), telling));
    const result: UmbraDesktopHelpSearchResult & { score: number } = {
      page,
      snippet: page.description ?? '',
      score,
    };
    if (lineIndex !== -1 && !hits(title, telling)) {
      result.snippet = clip(plain(lines[lineIndex] ?? ''));
      const heading = [...page.headings].reverse().find((h) => h.line <= lineIndex + 1 && h.level > 1);
      if (heading) result.heading = heading;
    }
    scored.push(result);
  }

  return scored
    .sort((a, b) => b.score - a.score || (a.page.title < b.page.title ? -1 : a.page.title > b.page.title ? 1 : 0))
    .slice(0, limit)
    .map(({ score: _score, ...result }) => result);
}
