import { applyMergePatch, composeMergePatches } from './json-merge-patch.js';
import type { UmbraDesktopMergePatch } from './json-merge-patch.js';
import type { UmbraDesktopPackageSettingsStatus } from './package-settings-store.js';

/** What the server answers about a site setting: the stored string, and whether this user may change it. */
export interface UmbraDesktopSiteSettingsSnapshot {
  /** The stored JSON string, or null when nothing is stored. */
  value: string | null;
  /** Whether the signed-in user meets the key's change policy. */
  canChange: boolean;
}

/** That the server refused a change: the package's validators, or the store's own rules, said no. */
export interface UmbraDesktopSiteSettingsRefusal {
  /** Why, one sentence per problem, written for the person who made the change. */
  refused: readonly string[];
}

/** What the server answers to a change: the value as stored, or why it was refused. */
export type UmbraDesktopSiteSettingsAnswer = UmbraDesktopSiteSettingsSnapshot | UmbraDesktopSiteSettingsRefusal;

/**
 * Why the value on show may not be the one stored, or why the last change did not stick: the
 * per-user store's two reasons, and `'refused'` when the server said no to the last change. A
 * refused change is dropped and the stored value shown again, so unlike `'unsaved'` the value is
 * right; the status says only that a change did not stick, and {@link UmbraDesktopSitePackageSettingsStore.problems}
 * says why. It stays until the next change.
 */
export type UmbraDesktopSiteSettingsStatus = UmbraDesktopPackageSettingsStatus | 'refused';

/**
 * Where a site store reads and writes its one value. In the backoffice it is
 * `UmbraDesktopSiteSettingsServerDocument`, over the desktop's `package-settings/site` endpoints. An
 * interface so a test can hand the store a stand-in server.
 *
 * Each method answers undefined when the server could not be asked, or refused the user, and never
 * throws. A change the server refuses on its merits answers a {@link UmbraDesktopSiteSettingsRefusal}.
 */
export interface UmbraDesktopSiteSettingsDocument {
  /**
   * Read the value.
   * @returns The snapshot, or undefined.
   */
  read(): Promise<UmbraDesktopSiteSettingsSnapshot | undefined>;
  /**
   * Replace the value, whole.
   * @param value The new JSON string.
   * @returns The snapshot as stored, the refusal, or undefined.
   */
  replace(value: string): Promise<UmbraDesktopSiteSettingsAnswer | undefined>;
  /**
   * Merge a JSON Merge Patch into the value on the server.
   * @param patch The patch, as a JSON string.
   * @returns The merged snapshot as stored, everyone else's changes included, the refusal, or undefined.
   */
  patch(patch: string): Promise<UmbraDesktopSiteSettingsAnswer | undefined>;
}

/** A change waiting to be sent: the value whole, or a patch to merge on the server. */
type UmbraDesktopSiteSettingsWrite =
  | { readonly kind: 'replace'; readonly raw: string }
  | { readonly kind: 'patch'; readonly patch: UmbraDesktopMergePatch };

/**
 * Parse a stored string. Not JSON, or nothing stored, is `undefined`, as in the per-user store.
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
 * One package's settings for the whole site, kept on the server and held in the page.
 *
 * The per-user store's rules, where they still fit: undefined until read, a change applies at once
 * and is sent in the background one request at a time, a failure is kept in the page and reported
 * through {@link status}, a read that arrives after a change does not undo it, other tabs follow a
 * stored change. What a site setting adds:
 * - **Whether this user may change it**, from the server, in {@link canChange}. A change before the
 *   first read, or from someone who may not make it, is refused in the page and nothing is sent.
 * - **A patch** that the server merges into what everyone has stored, so two people changing
 *   different parts at once both keep their change. {@link set} still replaces whole, last one wins.
 * - **The server's answer wins** once nothing of this page's is waiting, since it carries other
 *   people's changes. While a change is waiting, the page keeps its own value, and the answer to
 *   that change settles it.
 * - **A failed change is sent again with the next one**, composed with it, rather than dropped: a
 *   patch says only what changed, so unlike a whole value, a later patch does not repeat it.
 * - **A refused change is dropped**, never sent again, since it would be refused again. The store
 *   reads the stored value back, sets `'refused'` and keeps the server's reasons in {@link problems}
 *   until the next change. Changes sent together in one request are refused together.
 *
 * There is no push from other people. {@link refresh} reads again on demand.
 */
export class UmbraDesktopSitePackageSettingsStore {
  /** The stored string on show. Null when there is none. */
  #raw: string | null = null;

  /** {@link #raw} parsed. */
  #value: unknown = undefined;

  /** See {@link status}. */
  #status?: UmbraDesktopSiteSettingsStatus;

  /** See {@link problems}. */
  #problems: readonly string[] = [];

  /** See {@link canChange}. */
  #canChange = false;

  /** Who is told about a change. */
  #listeners = new Set<(value: unknown) => void>();

  /** Whether the value has been read once. */
  #loaded = false;

  /** The read in progress, joined by a second {@link load} or {@link refresh}. */
  #reading?: Promise<void>;

  /** Bumped by every change made here or heard from another tab, so a read that started before one does not undo it. */
  #changes = 0;

  /** The change waiting to be sent, every change since the last request composed into one. */
  #pending?: UmbraDesktopSiteSettingsWrite;

  /** The write loop in progress, if any. */
  #writing?: Promise<void>;

  /** The channel to other tabs, where the browser has one. */
  #channel?: BroadcastChannel;

  /** The channel's name, which doubles as the store's name in what is logged. */
  #channelName?: string;

  /**
   * @param document Where the value is stored.
   * @param channelName The cross-tab channel's name. Omit for no channel, as a test of one tab does.
   */
  constructor(
    private readonly document: UmbraDesktopSiteSettingsDocument,
    channelName?: string,
  ) {
    this.#channelName = channelName;
    if (channelName && typeof BroadcastChannel !== 'undefined') {
      this.#channel = new BroadcastChannel(channelName);
      this.#channel.onmessage = (event: MessageEvent) => this.#onBroadcast(event.data);
    }
  }

  /** The value now. Undefined until it has been read, and when nothing is stored. */
  get value(): unknown {
    return this.#value;
  }

  /**
   * Why the value may differ from what is stored, when it may. Undefined when all is well.
   * @returns The reason, or undefined.
   */
  get status(): UmbraDesktopSiteSettingsStatus | undefined {
    return this.#status;
  }

  /**
   * Why the server refused the last change, while {@link status} is `'refused'`. Empty otherwise.
   * @returns The reasons, as the package's validators wrote them.
   */
  get problems(): readonly string[] {
    return this.#problems;
  }

  /** Whether the value has been read, so a package can tell "nothing stored" from "not yet asked". */
  get loaded(): boolean {
    return this.#loaded;
  }

  /**
   * Whether the signed-in user may change the value. False until it has been read, so a package
   * shows its controls disabled until it knows.
   */
  get canChange(): boolean {
    return this.#canChange;
  }

  /**
   * Read the value, once. A second call joins the read in progress, one after a successful read does
   * nothing, and one after a failed read tries again.
   * @returns When the read has answered.
   */
  load(): Promise<void> {
    return this.#loaded ? Promise.resolve() : this.refresh();
  }

  /**
   * Read the value again, to see what other people have changed since. Joins a read in progress.
   * @returns When the read has answered.
   */
  refresh(): Promise<void> {
    this.#reading ??= this.#read().finally(() => (this.#reading = undefined));
    return this.#reading;
  }

  /**
   * Replace the value, whole, everywhere at once, and store it in the background.
   * @param next The new value: anything `JSON.stringify` can keep.
   * @returns False, and nothing changed, when this user may not change it or it has not been read.
   */
  set(next: unknown): boolean {
    if (!this.#mayChange()) return false;
    const raw = JSON.stringify(next) ?? 'null';
    this.#clearRefusal();
    this.#changes++;
    this.#apply(raw);
    this.#queue({ kind: 'replace', raw });
    return true;
  }

  /**
   * Change part of the value: merged here at once, and merged on the server into what everyone has
   * stored. A member set to null is removed; an array is replaced whole.
   * @param changes A JSON Merge Patch: an object of the members to change.
   * @returns False, and nothing changed, when this user may not change it, it has not been read, or
   *   the patch is not an object.
   */
  patch(changes: UmbraDesktopMergePatch): boolean {
    if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
      console.warn(`[UmbraDesktop] Site settings store ${this.#name} was given a patch that is not an object, so nothing changed.`);
      return false;
    }
    if (!this.#mayChange()) return false;
    this.#clearRefusal();
    this.#changes++;
    this.#apply(JSON.stringify(applyMergePatch(this.#value, changes)));
    this.#queue({ kind: 'patch', patch: structuredClone(changes) });
    return true;
  }

  /**
   * Be told when the value changes, including by another tab or the server's answer, and when the
   * status or the permission does.
   * @param listener Called with the value.
   * @returns A function that stops the calls.
   */
  subscribe(listener: (value: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * When every change made so far has been sent, or has failed to be.
   * @returns A promise that settles then.
   */
  async saved(): Promise<void> {
    while (this.#writing) await this.#writing;
  }

  /** Stop hearing other tabs. */
  close(): void {
    this.#channel?.close();
    this.#channel = undefined;
  }

  /** The store's name as logged. */
  get #name(): string {
    return `"${this.#channelName ?? 'without a channel'}"`;
  }

  /**
   * Whether a change may be made now, saying why in the console when not.
   * @returns True when it may.
   */
  #mayChange(): boolean {
    if (this.#canChange) return true;
    console.warn(
      this.#loaded
        ? `[UmbraDesktop] Site settings store ${this.#name} may not be changed by this user, so nothing changed.`
        : `[UmbraDesktop] Site settings store ${this.#name} has not been read yet, so nothing changed.`,
    );
    return false;
  }

  /**
   * Read, and take the answer unless a change was made meanwhile or is waiting to be sent.
   *
   * A failed first read sets `'unread'`. A failed refresh after that changes nothing: the value on
   * show was read, and is only older than it might be.
   */
  async #read(): Promise<void> {
    const changesAtStart = this.#changes;
    const snapshot = await this.document.read();
    if (!snapshot) {
      if (!this.#loaded) this.#setStatus('unread');
      return;
    }
    const news = !this.#loaded || this.#status === 'unread' || snapshot.canChange !== this.#canChange;
    this.#loaded = true;
    this.#canChange = snapshot.canChange;
    if (this.#status === 'unread') this.#status = undefined;
    if (this.#changes !== changesAtStart || this.#pending || this.#writing) {
      if (news) this.#notify();
      return;
    }
    this.#apply(snapshot.value, news);
  }

  /**
   * Add a change to what is waiting, and start sending if nothing is.
   * @param write The change.
   */
  #queue(write: UmbraDesktopSiteSettingsWrite): void {
    this.#pending = this.#combine(this.#pending, write);
    this.#writing ??= this.#flush().finally(() => (this.#writing = undefined));
  }

  /**
   * One change that does what two do in order.
   *
   * A replace after anything is that replace. A patch after a replace is the replace with the patch
   * applied. Two patches compose into one, and where they cannot, the value on show, which already
   * has both in it, goes whole.
   * @param earlier The change already waiting, if any.
   * @param later The newer change.
   * @returns The combined change.
   */
  #combine(
    earlier: UmbraDesktopSiteSettingsWrite | undefined,
    later: UmbraDesktopSiteSettingsWrite,
  ): UmbraDesktopSiteSettingsWrite {
    if (!earlier || later.kind === 'replace') return later;
    if (earlier.kind === 'replace') {
      return { kind: 'replace', raw: JSON.stringify(applyMergePatch(parse(earlier.raw), later.patch)) };
    }
    const composed = composeMergePatches(earlier.patch, later.patch);
    return composed ? { kind: 'patch', patch: composed } : { kind: 'replace', raw: this.#raw ?? 'null' };
  }

  /**
   * Send what is waiting until nothing is. A failure puts the change back in front of anything newer
   * and stops, so the next change sends both. A refusal drops the change, and the value on show is
   * then put right: by the answer to a change still waiting, or else by reading it back.
   */
  async #flush(): Promise<void> {
    while (this.#pending) {
      const next = this.#pending;
      this.#pending = undefined;
      const answer =
        next.kind === 'replace'
          ? await this.document.replace(next.raw)
          : await this.document.patch(JSON.stringify(next.patch));
      if (!answer) {
        this.#pending = this.#pending ? this.#combine(next, this.#pending) : next;
        this.#setStatus('unsaved');
        return;
      }
      if ('refused' in answer) {
        this.#refuse(answer.refused);
        if (!this.#pending) await this.#readBack();
        continue;
      }
      // A newer change is waiting; its answer settles the value.
      if (this.#pending) continue;
      this.#canChange = answer.canChange;
      if (answer.value !== null) this.#channel?.postMessage(answer.value);
      // Only a failure is put right by a stored change. A refusal stays until the next change, so a
      // package has time to show why.
      if (this.#status === 'unsaved') this.#setStatus(undefined);
      this.#apply(answer.value);
    }
  }

  /**
   * Read the stored value back after a refusal, so the refused change no longer shows. Not
   * {@link refresh}, which leaves the value alone while the write loop, this one, is running.
   */
  async #readBack(): Promise<void> {
    const snapshot = await this.document.read();
    // A change made while it was out is newer than what it read; that change's answer settles it.
    if (!snapshot || this.#pending) return;
    this.#canChange = snapshot.canChange;
    this.#apply(snapshot.value);
  }

  /**
   * Say that the server refused the last change, and why.
   * @param problems The server's reasons.
   */
  #refuse(problems: readonly string[]): void {
    this.#problems = [...problems];
    this.#status = 'refused';
    this.#notify();
  }

  /** A new change is being made: an earlier refusal is old news. */
  #clearRefusal(): void {
    if (this.#status !== 'refused') return;
    this.#problems = [];
    this.#setStatus(undefined);
  }

  /**
   * Another tab stored a change: follow it, unless this tab has a change of its own waiting or out,
   * whose answer will carry it anyway.
   * @param data The message, the stored string.
   */
  #onBroadcast(data: unknown): void {
    if (typeof data !== 'string' || this.#pending || this.#writing) return;
    this.#changes++;
    this.#apply(data);
  }

  /**
   * Change the status, and tell the listeners.
   * @param status The new status.
   */
  #setStatus(status: UmbraDesktopSiteSettingsStatus | undefined): void {
    if (status === this.#status) return;
    this.#status = status;
    this.#notify();
  }

  /**
   * Take a new stored string and tell the listeners, if anything changed.
   * @param raw The stored string, or null.
   * @param always Tell them even when the string is the same, because something else changed with it.
   */
  #apply(raw: string | null, always = false): void {
    if (!always && raw === this.#raw) return;
    this.#raw = raw;
    this.#value = parse(raw);
    this.#notify();
  }

  /** Tell every listener the value, each on its own, so one that throws stops nobody else. */
  #notify(): void {
    for (const listener of this.#listeners) {
      try {
        listener(this.#value);
      } catch (error) {
        console.error(`[UmbraDesktop] A settings subscriber threw (site store ${this.#name}).`, error);
      }
    }
  }
}
