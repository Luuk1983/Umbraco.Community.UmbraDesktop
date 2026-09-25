/**
 * Every number Sticky Notes needs in more than one place. Separate from the element so the manifest
 * can read the content size without pulling the app into the bundle's main chunk.
 *
 * The limits on text and on the number of notes are deliberately **not** here: they are the
 * server's (`StickyNoteStore.cs`), sent with the board, so the window never holds a copy of a
 * number another language owns.
 */

/**
 * How often an open board asks the server for changes, in ms: fifteen seconds, as agreed for this
 * board. Often enough that a note somebody just wrote turns up while the reader is still looking,
 * and rare enough that a desktop with the window left open all day costs the server nothing to
 * speak of. It also refreshes whenever the window is focused, which is when a reader is looking.
 */
export const STICKY_NOTES_POLL_INTERVAL_MS = 15_000;

/**
 * How long after the last keystroke a note is saved, in ms. Long enough not to send every letter,
 * short enough that somebody else's refresh fifteen seconds later nearly always sees the sentence.
 */
export const STICKY_NOTES_SAVE_DELAY_MS = 800;

/**
 * A focus-driven refresh is skipped if the last one was more recent than this, in ms, so clicking
 * between notes does not fire a request per click.
 */
export const STICKY_NOTES_FOCUS_REFRESH_GAP_MS = 3_000;

/** One note's smallest width in the board's grid, in px. Notes reflow into as many columns as fit. */
export const STICKY_NOTES_NOTE_MIN_WIDTH_PX = 180;

/** One note's height, in px: a header of colours, a few lines of text, and who wrote it. */
export const STICKY_NOTES_NOTE_HEIGHT_PX = 170;

/**
 * The least room a note's text keeps, in px: about four lines. When a conflict or a deletion panel
 * appears under the text the note grows instead of the text shrinking, since that is exactly when
 * the reader needs to read it.
 */
export const STICKY_NOTES_TEXT_MIN_HEIGHT_PX = 76;

/** The app's own padding and the gap between notes, in px. */
export const STICKY_NOTES_PADDING_PX = 10;

/** Height of the toolbar, in px. */
export const STICKY_NOTES_TOOLBAR_HEIGHT_PX = 32;

/**
 * The paper every note is drawn on: yellow, as Windows' Sticky Notes were. This app's domain colour,
 * like Paint's palette, so a note is yellow under every theme. Text on it is always
 * {@link STICKY_NOTES_INK}.
 *
 * There used to be five colours to choose from. The choice went, and every note is drawn on this
 * paper whatever colour the server holds for it; the server's colour field is left as it is.
 */
export const STICKY_NOTES_PAPER = '#fff7b1';

/** The colour name new notes are created with, which is the server's name for {@link STICKY_NOTES_PAPER}. */
export const STICKY_NOTES_COLOUR = 'yellow';

/**
 * One ruled line of a note, in px: the text's line height and the spacing of the lines drawn behind
 * it, one number so the writing sits on the lines.
 */
export const STICKY_NOTES_LINE_PX = 20;

/** Space above the first line of text, in px, which the ruling is shifted by to stay under the text. */
export const STICKY_NOTES_TEXT_TOP_PX = 4;

/**
 * The ink on every paper. Fixed, because the papers are, and at least 12:1 against the darkest of
 * them.
 */
export const STICKY_NOTES_INK = '#1f1f1f';

/**
 * The content box Sticky Notes opens at: a toolbar and two columns by two rows of notes, padded.
 * The board scrolls, so this is a starting size and not a capacity.
 */
export const STICKY_NOTES_CONTENT_SIZE = {
  w: STICKY_NOTES_NOTE_MIN_WIDTH_PX * 2 + STICKY_NOTES_PADDING_PX * 3,
  h: STICKY_NOTES_TOOLBAR_HEIGHT_PX + STICKY_NOTES_NOTE_HEIGHT_PX * 2 + STICKY_NOTES_PADDING_PX * 4,
} as const;

/** The smallest content box: one column, one note, the toolbar. */
export const STICKY_NOTES_MIN_CONTENT_SIZE = {
  w: STICKY_NOTES_NOTE_MIN_WIDTH_PX + STICKY_NOTES_PADDING_PX * 2,
  h: STICKY_NOTES_TOOLBAR_HEIGHT_PX + STICKY_NOTES_NOTE_HEIGHT_PX + STICKY_NOTES_PADDING_PX * 3,
} as const;
