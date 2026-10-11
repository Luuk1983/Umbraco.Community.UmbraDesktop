import type { UserDataDocument } from '../shared/user-data.js';
import { STICKY_NOTES_PERSONAL_MAX_NOTES, STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH } from './constants.js';

/**
 * A person's own notes: the half of Sticky Notes nobody else sees.
 *
 * Kept as one JSON document in Umbraco's per-user store (`umbracoUserData`, through
 * `shared/user-data.ts`), so they follow the person to any browser they sign in on and need no
 * server code of this package's. The whole list is one row, written whole: the order is the array's
 * order, and there is no version to compare, so between two tabs of the same person the last write
 * wins. That is the per-user store's own contract, the desktop's settings live by it too, and a
 * person is rarely editing their own notes in two places at once. Nobody else can ever write this
 * row, which is what lets it do without the shared board's conflict handling altogether.
 */

/** One note of one's own, as the document stores it. */
export interface PersonalNote {
  /** The note's identity, which the board keys its card and its drag by. */
  key: string;
  /** What it says. */
  text: string;
  /** When it was last written, as an ISO string, for the line under it. */
  updatedAt: string;
}

/**
 * Where the document is kept: the two calls of {@link UserDataDocument} the board uses, as a type,
 * so a test can stand in for the per-user store without a signed-in backoffice.
 */
export type PersonalNotesStore = Pick<UserDataDocument, 'read' | 'write'>;

/**
 * Whether a value read back is a note. Checked field by field, because the row is anyone's to edit
 * in the database and may come from a later version of this package.
 * @param value One entry of the stored list.
 * @returns True when it has a note's fields.
 */
function isNote(value: unknown): value is PersonalNote {
  const note = value as Partial<PersonalNote> | null;
  return (
    typeof note === 'object' &&
    note !== null &&
    typeof note.key === 'string' &&
    typeof note.text === 'string' &&
    typeof note.updatedAt === 'string'
  );
}

/**
 * Cut a list to the caps: the first {@link STICKY_NOTES_PERSONAL_MAX_NOTES} notes, each to
 * {@link STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH} characters. Applied both ways, so a document edited
 * outside this app cannot grow past what the app itself would ever write.
 * @param notes The notes.
 * @returns The notes within the caps, each a copy with only a note's fields.
 */
function capped(notes: PersonalNote[]): PersonalNote[] {
  return notes.slice(0, STICKY_NOTES_PERSONAL_MAX_NOTES).map(({ key, text, updatedAt }) => ({
    key,
    text: text.slice(0, STICKY_NOTES_PERSONAL_MAX_TEXT_LENGTH),
    updatedAt,
  }));
}

/**
 * Read the stored document.
 *
 * Forgiving on purpose: a document that is not JSON, or not this shape, reads as no notes, and an
 * entry that is not a note is left out while the rest are kept. Refusing would leave the person with
 * a board that can never be written again.
 * @param value The stored value; null when nothing is stored yet.
 * @returns The notes, in the person's order.
 */
export function parsePersonal(value: string | null): PersonalNote[] {
  if (value === null) return [];
  let document: unknown;
  try {
    document = JSON.parse(value);
  } catch {
    return [];
  }
  const notes = (document as { notes?: unknown } | null)?.notes;
  return Array.isArray(notes) ? capped(notes.filter(isNote)) : [];
}

/**
 * The document to store for a list of notes. An object with a `notes` list rather than the bare
 * list, so a later version can add to it without a second row.
 * @param notes The notes, in the person's order.
 * @returns The JSON to store.
 */
export function serializePersonal(notes: PersonalNote[]): string {
  return JSON.stringify({ notes: capped(notes) });
}

/**
 * Combine this window's notes with what is stored now, against what this window last read or
 * stored (its base), so that a save from one tab never deletes a note another tab added.
 *
 * Each person holds their whole list in every tab and a write replaces the stored document, so a
 * plain write from a tab that loaded before a note was added elsewhere would delete that note. A
 * live test found exactly that. The rules, note by note:
 * - in this window: kept, with the stored text instead only when this window has not changed it
 *   since its base, so another tab's edit of an untouched note wins and this window's own edit wins;
 * - stored but not in this window: added elsewhere if it is not in the base, so it is kept, at the
 *   end; deleted here if it is, so it stays deleted;
 * - in this window and the base but no longer stored: deleted elsewhere, which stands unless this
 *   window has edited it since, in which case the edit keeps it.
 * @param base The notes this window last read or stored.
 * @param mine The notes in this window now.
 * @param stored The notes stored now.
 * @returns The notes to store and show.
 */
export function mergePersonal(base: PersonalNote[], mine: PersonalNote[], stored: PersonalNote[]): PersonalNote[] {
  const inBase = new Map(base.map((note) => [note.key, note]));
  const inStore = new Map(stored.map((note) => [note.key, note]));
  const unchanged = (note: PersonalNote) => {
    const before = inBase.get(note.key);
    return before !== undefined && before.text === note.text;
  };
  const kept = mine.flatMap((note) => {
    const now = inStore.get(note.key);
    if (now) return [unchanged(note) ? now : note];
    return inBase.has(note.key) && unchanged(note) ? [] : [note];
  });
  const mineKeys = new Set(mine.map((note) => note.key));
  const addedElsewhere = stored.filter((note) => !mineKeys.has(note.key) && !inBase.has(note.key));
  return capped([...kept, ...addedElsewhere]);
}
