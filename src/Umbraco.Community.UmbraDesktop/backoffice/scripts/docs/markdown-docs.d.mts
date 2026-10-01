/** Types for `markdown-docs.mjs`, which is plain JS so the node scripts can import it. */

/** Marks each line as prose, or as code or front matter where links and headings do not count. */
export declare function classifyLines(text: string): { text: string; prose: boolean }[];

/** Splits a line on its inline code spans: even indexes prose, odd indexes code. */
export declare function splitInlineCode(line: string): string[];

/** The anchor GitHub and Docusaurus give a heading. */
export declare function githubSlug(text: string): string;

/** Every heading in a document: level, rendered text, anchor and line. */
export declare function headings(text: string): { level: number; text: string; anchor: string; line: number }[];

/** Every anchor a document's headings produce. */
export declare function headingAnchors(text: string): Set<string>;

/** Every link and image target in a document, with its line number. */
export declare function extractLinks(text: string): { target: string; line: number; image: boolean }[];

/** A page's flat front matter and the text after it. */
export declare function parseFrontMatter(text: string): { data: Record<string, string>; body: string };

/** Whether a link target is a URL with a scheme rather than a repository path. */
export declare function isExternal(target: string): boolean;

/** Resolves a relative path against a repository-relative directory. */
export declare function resolvePath(dir: string, path: string): string;

/** The directory part of a repository-relative path. */
export declare function dirname(file: string): string;

/** Checks Markdown files for dead links, dead anchors and unaddressable pages. */
export declare function checkDocs(input: {
  files: Map<string, string>;
  exists: (path: string) => boolean;
  productOf: (path: string) => string | undefined;
}): { file: string; line: number; message: string }[];
