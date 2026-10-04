/** Why the value on show may not be the one in the user's account. */
export type UmbraDesktopPackageSettingsStatus =
  /** The account could not be asked, so what shows is whatever the package falls back to. */
  | 'unread'
  /** The last change could not be stored. It holds in this page, and is saved with the next change. */
  | 'unsaved';

/**
 * Where a store reads and writes its one row. In the backoffice it is `UmbraDesktopUserDataDocument`,
 * bound to the package's own user-data group and the `Settings` identifier. An interface so a test
 * can hand the store a stand-in, because the real one needs a signed-in user, which only a booted
 * backoffice has.
 *
 * The store never has two writes of its own in flight (see `#flush`), so a document need not queue
 * them.
 */
export interface UmbraDesktopPackageSettingsDocument {
  /**
   * Read the stored string.
   * @returns The string, null when nothing is stored, undefined when the account could not be read.
   */
  read(): Promise<string | null | undefined>;
  /**
   * Store the string.
   * @param value The string to store.
   * @returns False when it could not be stored.
   */
  write(value: string): Promise<boolean>;
}

/**
 * Parse a stored string. Not JSON, or nothing stored, is `undefined`: the package checks what it
 * reads anyway, because the value may have been written by an older version of itself.
 * @param raw The stored string, or null.
 * @returns The value, or undefined.
 */
function parse(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * One package's settings for the signed-in user, kept in their account and held in the page.
 *
 * The store knows nothing of the shape of the value: it keeps JSON, and the package that owns the
 * value validates what it reads. One per package per page, so every element of the package reads one
 * value and one write reaches them all at once. The rules:
 * - the value is `undefined` until the stored one has loaded, so nothing starts on the strength of a
 *   setting nobody has read yet; it stays `undefined` when nothing, or something unreadable, is stored;
 * - a change applies in the page at once and is stored in the background, one write at a time,
 *   ending on the latest;
 * - a failed write keeps the change in the page and says so through {@link status}, rather than
 *   losing it quietly; the next change stores the whole value again;
 * - a stored value that arrives after a change was made is older than it, and is not applied;
 * - a stored change is announced to other tabs on the store's channel, when it has one.
 *
 * Values are compared and announced as the JSON string that is stored, so a change that leaves the
 * stored string as it was tells nobody.
 */
export class UmbraDesktopPackageSettingsStore {
  /** The stored string on show: what was read, what was changed to, or what another tab stored. Null when there is none. */
  #raw: string | null = null;

  /** {@link #raw} parsed, kept so every read of {@link value} is not a parse. */
  #value: unknown = undefined;

  /** See {@link status}. */
  #status?: UmbraDesktopPackageSettingsStatus;

  /** Who is told about a change. */
  #listeners = new Set<(value: unknown) => void>();

  /** Whether the stored value has been read. Reading again after that would only undo changes. */
  #loaded = false;

  /** The read in progress, so a second {@link load} joins it rather than asking twice. */
  #loading?: Promise<void>;

  /**
   * Bumped by every change made here or heard from another tab. A read compares it before and
   * after, so a value that was stored before the change does not overwrite it.
   */
  #changes = 0;

  /** The newest change not yet written, if any, as a string. Only the newest is written: it is the whole value. */
  #pending?: string;

  /** The write loop in progress, if any. */
  #writing?: Promise<void>;

  /** The channel to other tabs, where the browser has one. */
  #channel?: BroadcastChannel;

  /** The channel's name, which doubles as the store's name in what is logged. */
  #channelName?: string;

  /**
   * @param document Where the value is stored.
   * @param channelName The cross-tab channel's name. Omit for no channel: a store without one is a
   *   store of one tab, which is what a test wants unless it is testing two. The backoffice passes a
   *   name made from the package's own user-data group, so nothing else on the origin talks on it
   *   by accident; tabs in other browsers pick the change up the next time they load.
   */
  constructor(
    private readonly document: UmbraDesktopPackageSettingsDocument,
    channelName?: string,
  ) {
    this.#channelName = channelName;
    if (channelName && typeof BroadcastChannel !== 'undefined') {
      this.#channel = new BroadcastChannel(channelName);
      this.#channel.onmessage = (event: MessageEvent) => this.#onBroadcast(event.data);
    }
  }

  /** The value now. Undefined until the stored one has loaded, and when none is stored. */
  get value(): unknown {
    return this.#value;
  }

  /**
   * Why the value may differ from what is stored, when it may. Undefined when all is well.
   * @returns The reason, or undefined.
   */
  get status(): UmbraDesktopPackageSettingsStatus | undefined {
    return this.#status;
  }

  /** Whether the stored value has been read, so a package can tell "nothing stored" from "not yet asked". */
  get loaded(): boolean {
    return this.#loaded;
  }

  /**
   * Read the stored value, once. Safe to call from every element that needs it: a second call joins
   * the read in progress, and one after a successful read does nothing. One after a failed read
   * tries again, so opening the package's settings is also a retry.
   * @returns When the read has answered.
   */
  load(): Promise<void> {
    if (this.#loaded) return Promise.resolve();
    this.#loading ??= this.#read().finally(() => (this.#loading = undefined));
    return this.#loading;
  }

  /**
   * Change the value, everywhere at once, and store it in the background.
   * @param next The new value: anything `JSON.stringify` can keep. Something it cannot, such as
   *   `undefined`, is kept as `null`.
   */
  set(next: unknown): void {
    const raw = JSON.stringify(next) ?? 'null';
    this.#changes++;
    this.#apply(raw);
    this.#pending = raw;
    this.#writing ??= this.#flush().finally(() => (this.#writing = undefined));
  }

  /**
   * Be told when the value changes, including by another tab, and when the status does.
   * @param listener Called with the value.
   * @returns A function that stops the calls.
   */
  subscribe(listener: (value: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * When every change made so far has been written, or has failed to be.
   * @returns A promise that settles then.
   */
  async saved(): Promise<void> {
    while (this.#writing) await this.#writing;
  }

  /** Stop hearing other tabs. For tests and for the package unloading; the page's store is otherwise never closed. */
  close(): void {
    this.#channel?.close();
    this.#channel = undefined;
  }

  /**
   * Read the stored value, and take it unless something newer arrived meanwhile.
   *
   * The listeners hear a finished read exactly once, even when nothing is stored and the value does
   * not change: `loaded` turning true, or `'unread'` clearing, is news to a box waiting on either.
   */
  async #read(): Promise<void> {
    const changesAtStart = this.#changes;
    const raw = await this.document.read();
    if (raw === undefined) {
      this.#setStatus('unread');
      return;
    }
    const news = !this.#loaded || this.#status === 'unread';
    this.#loaded = true;
    if (this.#status === 'unread') this.#status = undefined;
    if (this.#changes !== changesAtStart) {
      if (news) this.#notify();
      return;
    }
    this.#apply(raw, news);
  }

  /** Write the newest change until none is left, then say how the last write went. */
  async #flush(): Promise<void> {
    while (this.#pending !== undefined) {
      const next = this.#pending;
      this.#pending = undefined;
      const stored = await this.document.write(next);
      // A newer change is already waiting; its write decides the status.
      if (this.#pending !== undefined) continue;
      if (stored) this.#channel?.postMessage(next);
      this.#setStatus(stored ? undefined : 'unsaved');
    }
  }

  /**
   * Another tab stored a change: follow it. It was stored, so a failure of this tab's own is
   * superseded by it, and it is newer than any read still in progress.
   * @param data The message, the stored string.
   */
  #onBroadcast(data: unknown): void {
    if (typeof data !== 'string') return;
    this.#changes++;
    this.#pending = undefined;
    if (this.#status === 'unsaved') this.#status = undefined;
    this.#apply(data, true);
  }

  /**
   * Change the status, and tell the listeners so a window can show it.
   * @param status The new status.
   */
  #setStatus(status: UmbraDesktopPackageSettingsStatus | undefined): void {
    if (status === this.#status) return;
    this.#status = status;
    this.#notify();
  }

  /**
   * Take a new stored string and tell the listeners, if anything changed.
   * @param raw The stored string, or null when nothing is stored.
   * @param always Tell the listeners even when the string is the same, because something else
   *   about the store changed with it.
   */
  #apply(raw: string | null, always = false): void {
    if (!always && raw === this.#raw) return;
    this.#raw = raw;
    this.#value = parse(raw);
    this.#notify();
  }

  /**
   * Tell every listener the value as it stands.
   *
   * Listeners are other packages' code, so each is called on its own: one that throws is reported
   * and skipped, and neither keeps the rest from hearing nor rejects the write loop that called
   * this, which would end it and make {@link saved} throw.
   */
  #notify(): void {
    for (const listener of this.#listeners) {
      try {
        listener(this.#value);
      } catch (error) {
        console.error(
          `[UmbraDesktop] A settings subscriber threw (store ${this.#channelName ?? 'without a channel'}).`,
          error,
        );
      }
    }
  }
}
