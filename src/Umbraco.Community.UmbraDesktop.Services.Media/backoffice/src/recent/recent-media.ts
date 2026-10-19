/**
 * The media files a person opened or saved lately through the media service, by any app, for the
 * file menu's Open: the file you were working on a minute ago is one tap away instead of a walk
 * through the media picker. Issue #136, design §5.
 *
 * Kept in the browser's `localStorage`, one list per backoffice user, because it is a convenience of
 * this browser and nothing the server needs: a list that is lost (another browser, cleared site
 * data) costs one trip through the picker. Every access is wrapped, so storage that is missing,
 * blocked or full lists nothing rather than breaking an open.
 */

/** One file in the list. Plain data, published on the developer page. */
export interface RecentMediaEntry {
  /** The media item's key, which opens it again. */
  unique: string;
  /** Its name, as last opened or saved. */
  name: string;
  /** Its file extension, without the dot, which an app's filter reads. */
  extension: string;
  /** The folder it is in, or null for the root (or when no open has said yet). */
  folder: string | null;
  /** The folder's name, for the tile. */
  folderName?: string;
  /** When it was last opened or saved, in milliseconds since the epoch. */
  at: number;
}

/** How many files the list keeps. Twelve fills Open's grid without scrolling at its size. */
export const RECENT_LIMIT = 12;

/** The storage key prefix, before the user's key. */
const KEY_PREFIX = 'umbradesktop-media-recent:';

/**
 * The storage key for one user's list, so two people sharing a browser each see their own files.
 * @param userUnique The backoffice user's key.
 * @returns The key.
 */
export function recentKeyFor(userUnique: string): string {
  return `${KEY_PREFIX}${userUnique}`;
}

/** The part of `Storage` the list uses, so a test hands it a map. */
export type RecentStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** How to record. */
export interface RecordOptions {
  /**
   * Keep the folder an earlier entry for the same item knew. For a save over an item, whose request
   * names no folder (an overwrite stays where it is), so the null it carries means "not said", not
   * "the root".
   */
  keepFolder?: boolean;
}

/**
 * Whether a stored value is an entry, read defensively since storage is anyone's to write.
 * @param value What was stored.
 * @returns True for an entry with every required field.
 */
function isEntry(value: unknown): value is RecentMediaEntry {
  const entry = value as Partial<RecentMediaEntry> | null;
  return (
    !!entry &&
    typeof entry === 'object' &&
    typeof entry.unique === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.extension === 'string' &&
    (entry.folder === null || typeof entry.folder === 'string') &&
    typeof entry.at === 'number'
  );
}

/** One user's list, read from and written to storage on every call so two windows never disagree. */
export class RecentMediaList {
  /** Where the list lives, or null when the browser has no storage to give. */
  readonly #storage: RecentStorage | null;
  /** This user's key in it. */
  readonly #key: string;
  /** How many entries to keep. */
  readonly #limit: number;

  /**
   * @param storage Where the list lives, or null for none.
   * @param key This user's key, from {@link recentKeyFor}.
   * @param limit How many entries to keep.
   */
  constructor(storage: RecentStorage | null, key: string, limit: number = RECENT_LIMIT) {
    this.#storage = storage;
    this.#key = key;
    this.#limit = limit;
  }

  /**
   * The list, newest first.
   * @param accept The extensions to list, without dots; every entry when omitted. Case is ignored.
   * @returns The entries.
   */
  list(accept?: readonly string[]): RecentMediaEntry[] {
    const all = this.#read();
    if (!accept) return all;
    const wanted = new Set(accept.map((extension) => extension.toLowerCase()));
    return all.filter((entry) => wanted.has(entry.extension.toLowerCase()));
  }

  /**
   * Put a file at the top of the list, replacing any entry for the same item.
   * @param entry The file.
   * @param now When, for a test; the clock otherwise.
   * @param options How to merge with an earlier entry.
   */
  record(entry: Omit<RecentMediaEntry, 'at'>, now: number = Date.now(), options: RecordOptions = {}): void {
    const all = this.#read();
    const earlier = all.find((candidate) => candidate.unique === entry.unique);
    const folder =
      options.keepFolder && earlier ? { folder: earlier.folder, folderName: earlier.folderName } : entry;
    const next: RecentMediaEntry = {
      unique: entry.unique,
      name: entry.name,
      extension: entry.extension,
      folder: folder.folder,
      ...(folder.folderName !== undefined ? { folderName: folder.folderName } : {}),
      at: now,
    };
    this.#write([next, ...all.filter((candidate) => candidate.unique !== entry.unique)].slice(0, this.#limit));
  }

  /**
   * Take an item off the list: one that was deleted, trashed or can no longer be seen.
   * @param unique The item.
   */
  forget(unique: string): void {
    const all = this.#read();
    const next = all.filter((entry) => entry.unique !== unique);
    if (next.length !== all.length) this.#write(next);
  }

  /** @returns The stored list, or an empty one for anything unreadable. */
  #read(): RecentMediaEntry[] {
    try {
      const raw = this.#storage?.getItem(this.#key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      return [];
    }
  }

  /** @param entries The list to store; a storage that refuses keeps what it had. */
  #write(entries: RecentMediaEntry[]): void {
    try {
      this.#storage?.setItem(this.#key, JSON.stringify(entries));
    } catch {
      // Full or blocked: the list is a convenience, and an open or a save must not fail over it.
    }
  }
}

/**
 * The browser's `localStorage`, or null where reading it throws (a sandboxed frame, blocked site
 * data).
 * @returns The storage, or null.
 */
export function browserStorage(): RecentStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
