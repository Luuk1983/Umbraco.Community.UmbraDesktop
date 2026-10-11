/**
 * Every number Sticky Notes needs in more than one place. Separate from the element so the manifest
 * can read the content size without pulling the app into the bundle's main chunk.
 *
 * The shared board's limits on text and on the number of notes are deliberately **not** read from
 * here: they are the server's (`StickyNoteStore.cs`), sent with the board, so the shared board never
 * holds a copy of a number another language owns. A person's own notes have no server of this
 * package's behind them, so their caps are here, as the same two numbers
 * ({@link STICKY_NOTES_PERSONAL_MAX_NOTES}, {@link STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH}).
 */

/**
 * How often an open board asks the server for changes to the shared notes, in ms: fifteen seconds,
 * as agreed for this board. Often enough that a note somebody just wrote turns up while the reader
 * is still looking, and rare enough that a desktop with the window left open all day costs the
 * server nothing to speak of. It also refreshes whenever the window is focused, which is when a
 * reader is looking, and it does not poll at all while nobody can see the board.
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
 * The paper a person's own notes are drawn on: yellow, as Windows' Sticky Notes were. This app's
 * domain colour, like Paint's palette, so a note is yellow under every theme. Text on it is always
 * {@link STICKY_NOTES_INK}.
 *
 * The kind of note decides its paper, and nothing else does. There used to be five colours to
 * choose from; the choice went, so that yellow and blue can mean "mine" and "everyone's".
 */
export const STICKY_NOTES_PAPER = '#fff7b1';

/**
 * The paper shared notes are drawn on: a pale blue, as far from {@link STICKY_NOTES_PAPER} as a
 * sticky note gets, so a note everyone can see never passes for one of the reader's own. Drawn for
 * every shared note whatever colour the server holds for it.
 */
export const STICKY_NOTES_SHARED_PAPER = '#cde6f7';

/**
 * The colour name shared notes are sent to the server with: the server's name for
 * {@link STICKY_NOTES_SHARED_PAPER}, from its allowed list in `StickyNoteStore.cs`. The server
 * turns a name it does not know into its default, yellow, so this must be one it lists.
 */
export const STICKY_NOTES_SHARED_COLOUR = 'blue';

/**
 * The most notes of their own a person keeps: the shared board's number (`StickyNoteStore.MaxNotes`),
 * so a note does not change what it may hold by changing kind, and one person's list stays a small
 * row in `umbracoUserData`.
 */
export const STICKY_NOTES_PERSONAL_MAX_NOTES = 100;

/** The most text a note of one's own keeps: the shared board's number (`StickyNoteStore.MaxTextLength`). */
export const STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH = 2000;

/**
 * The `umbracoUserData` identifier of the one document holding a person's own notes, within the
 * package's group. Final: renaming it would lose every user's notes.
 */
export const STICKY_NOTES_USER_DATA_IDENTIFIER = 'StickyNotes';

/**
 * Movement, in px, that turns a press on a note's handle into a drag: the launcher's number
 * (`UMBRADESKTOP_DRAG_THRESHOLD_PX` in the host), so a drag starts the same way in both places.
 */
export const STICKY_NOTES_DRAG_THRESHOLD_PX = 4;

/**
 * How far, in px, the drag ghost sits below and right of a mouse or pen pointer: the launcher's
 * number, and beside the pointer for its reason, so the landing bar being aimed at stays in sight.
 */
export const STICKY_NOTES_DRAG_GHOST_OFFSET_PX = 12;

/** How far, in px, the ghost's bottom edge sits above a touch point, so the finger does not hide it. */
export const STICKY_NOTES_DRAG_GHOST_TOUCH_LIFT_PX = 40;

/** The drag ghost's size, in px: a note in miniature, about as big as a launcher tile's icon and label. */
export const STICKY_NOTES_DRAG_GHOST_SIZE = { w: 64, h: 48 } as const;

/** Distance, in px, from the board's top or bottom edge at which a drag scrolls it. The launcher's. */
export const STICKY_NOTES_DRAG_SCROLL_BAND_PX = 40;

/** How far, in px, the board scrolls per animation frame while a drag is in that band. The launcher's. */
export const STICKY_NOTES_DRAG_SCROLL_STEP_PX = 12;

/** The width of the landing bar a drag shows between two notes, in px. The launcher's. */
export const STICKY_NOTES_DROP_BAR_PX = 2;

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
