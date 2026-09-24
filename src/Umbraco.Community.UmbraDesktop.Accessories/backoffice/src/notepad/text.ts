/**
 * Notepad's arithmetic on text, as pure functions, so the status bar and the file name can be
 * checked without a textarea.
 */

/** Where a caret sits, counted from one the way a status bar shows it. */
export interface CaretPosition {
  /** The line, from 1. */
  line: number;
  /** The column, from 1: the character the caret is in front of. */
  column: number;
}

/**
 * The line and column of a caret offset.
 *
 * Counted in UTF-16 code units, which is what `selectionStart` is, so a character outside the Basic
 * Multilingual Plane counts as two columns. The Windows Notepad does the same, and matching the
 * offset the browser reports is worth more than a column count no other tool agrees with.
 * @param text The document.
 * @param offset The caret, as `selectionStart`. Clamped to the document.
 * @returns The caret's line and column.
 */
export function caretPosition(text: string, offset: number): CaretPosition {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const lastBreak = before.lastIndexOf('\n');
  let line = 1;
  for (const character of before) if (character === '\n') line++;
  return { line, column: before.length - lastBreak };
}

/**
 * The name a document is saved under.
 *
 * An opened file keeps its own name, so saving it back is a round trip and not a copy called
 * "Untitled". A name with no extension gets `.txt`, because a file with none opens in nothing on half
 * the machines it lands on; a name with an extension of its own keeps it, since a `.md` or a
 * `.webmanifest` edited here is still that kind of file.
 * @param name The file's own name, if it was opened from one.
 * @param untitled The localised word for a document that has never had a name.
 * @returns A file name.
 */
export function textFileName(name: string | undefined, untitled: string): string {
  const base = name?.trim() || untitled;
  return /\.[^./\\]+$/.test(base) ? base : `${base}.txt`;
}
