/**
 * Notepad's arithmetic on text, as a pure function, so the status bar can be checked without a
 * textarea. (What a saved file is called is shared with Paint, in `shared/media-files.ts`.)
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
