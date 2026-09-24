import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';

/**
 * The Sticky Notes API, as the window sees it.
 *
 * The server half is `StickyNotes/StickyNotesController.cs` in this package, and the shapes below
 * are its response models, written out by hand. There are four calls, and a generated client would
 * be a build step and a second copy of the backoffice's HTTP client for them. Called through the
 * backoffice's own `umbHttpClient`, which the backoffice has already wired to its authentication,
 * so the calls carry the logged-in user without this package configuring anything.
 */

/** One note, as the server returns it. */
export interface StickyNote {
  /** The note's identity. */
  key: string;
  /** What it says. */
  text: string;
  /** Its paper colour, by name. */
  colour: string;
  /** Who last wrote it. */
  updatedBy: string;
  /** When, as an ISO string. */
  updatedAt: string;
  /** The version to send back with an edit. */
  version: number;
}

/** The whole board, with the limits the window has to respect. */
export interface StickyNoteBoard {
  /** Every note, in the order they were added. */
  notes: StickyNote[];
  /** The most text a note keeps. The server's number, never a copy. */
  maxTextLength: number;
  /** The most notes the board holds. */
  maxNotes: number;
  /** The colours on offer, the first being the default. */
  colours: string[];
}

/** How an edit went. */
export type StickyNoteUpdateResult =
  | { status: 'saved'; note: StickyNote }
  | {
      status: 'conflict';
      /** The note as somebody else left it. */
      note: StickyNote;
    }
  | { status: 'notFound' }
  | { status: 'failed' };

/** The four things the window asks of the server. An interface so tests can answer them. */
export interface StickyNotesApi {
  /** The board, or undefined if it could not be read. */
  list(): Promise<StickyNoteBoard | undefined>;
  /**
   * Add a note.
   * @param text What it says.
   * @param colour Its colour.
   */
  create(text: string, colour: string): Promise<StickyNote | undefined>;
  /**
   * Edit a note, naming the version the edit was made against.
   * @param key The note.
   * @param text What it now says.
   * @param colour Its colour.
   * @param version The version the edit was made against.
   */
  update(key: string, text: string, colour: string, version: number): Promise<StickyNoteUpdateResult>;
  /**
   * Delete a note. True when it is gone, including when somebody else deleted it first.
   * @param key The note.
   */
  remove(key: string): Promise<boolean>;
}

/** Where the controller is routed. */
const URL = '/umbraco/management/api/v1/umbradesktop/accessories/sticky-notes';

/** Tells `umbHttpClient` to send the backoffice's bearer token, as its own documentation asks. */
const SECURITY = [{ type: 'http', scheme: 'bearer' }] as const;

/**
 * The status an error carries, whichever shape it arrived in.
 * @param error What the call threw or returned as its error.
 * @returns The HTTP status, if there is one.
 */
function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Run one call, turning a thrown error into a returned one.
 *
 * **The backoffice's HTTP client throws on every error status in a running backoffice**, whatever its
 * types say about an `{ error }` result: its response interceptors turn the response into a problem
 * details object and the call rejects with it. Found by running this against a real Umbraco, where a
 * 409 threw and the conflict dialog never appeared. So every call goes through here, and the rest of
 * this file reads one shape.
 * @param call The request.
 * @returns The data, or the error.
 */
async function attempt<T>(call: () => Promise<{ data?: unknown; error?: unknown }>): Promise<{ data?: T; error?: unknown }> {
  try {
    const { data, error } = await call();
    return error ? { error } : { data: data as T };
  } catch (error) {
    return { error: error ?? { status: undefined } };
  }
}

/**
 * The real API, over the backoffice's HTTP client.
 *
 * Every failure is an answer rather than an exception, because the window's job on a failure is to
 * keep the person's text and say so, and a 409 in particular is not an error at all: it is the
 * server saying somebody else edited the note first. It arrives as problem details with their note
 * in its `note` extension (`StickyNotesController.ConflictNoteExtension`), because the backoffice
 * replaces any error body that is not problem details before this code sees it.
 * @returns The API.
 */
export function createStickyNotesApi(): StickyNotesApi {
  const json = { 'Content-Type': 'application/json' };
  return {
    async list() {
      const { data } = await attempt<StickyNoteBoard>(() => umbHttpClient.get({ url: URL, security: [...SECURITY] }));
      return data;
    },
    async create(text, colour) {
      const { data } = await attempt<StickyNote>(() =>
        umbHttpClient.post({ url: URL, security: [...SECURITY], body: { text, colour }, headers: json }),
      );
      return data;
    },
    async update(key, text, colour, version) {
      const { data, error } = await attempt<StickyNote>(() =>
        umbHttpClient.put({ url: `${URL}/${key}`, security: [...SECURITY], body: { text, colour, version }, headers: json }),
      );
      if (data) return { status: 'saved', note: data };
      const note = (error as { note?: StickyNote } | undefined)?.note;
      if (statusOf(error) === 409 && note) return { status: 'conflict', note };
      if (statusOf(error) === 404) return { status: 'notFound' };
      return { status: 'failed' };
    },
    async remove(key) {
      const { error } = await attempt(() => umbHttpClient.delete({ url: `${URL}/${key}`, security: [...SECURITY] }));
      return !error || statusOf(error) === 404;
    },
  };
}
