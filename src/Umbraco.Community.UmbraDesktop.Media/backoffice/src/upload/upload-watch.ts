/**
 * Uploads in a manager window, followed for the Transfers window (plan task 7.3).
 *
 * Every upload goes through core: into the folder a window shows through core's dropzone in that
 * window, and into a folder card or tree folder through core's upload manager (`upload.ts`). Core's
 * dropzone sends no event out of itself, so it is found the way the host's upload watcher finds one
 * in a frame (`progress/upload-watcher.ts` in the host, `window-progress.md` §3): by the context
 * request it sends as it connects, which bubbles and is composed, heard in the capture phase. Its
 * `progressItems()` is its manager's list of every item since the page loaded, so a batch starts where
 * the list stood when it was last idle.
 */

/** An upload item, as core's upload manager lists it. Only what is read here. */
export interface UmbraDesktopUploadItem {
  /** Its key. */
  unique: string;
  /** The folder it goes into, null for the root. */
  parentUnique: string | null;
  /** Core's status: `waiting`, `complete`, `notAllowed`, `error` or `cancelled`. */
  status: string;
  /** Core's reason, when it did not go. */
  statusMessage?: string;
  /** How far its file has gone up, in percent. */
  progress: number;
  /** A file. */
  temporaryFile?: { file: File };
  /** A folder. */
  folder?: { name: string };
}

/** Only what this module needs of an Umbraco observable. */
interface Subscribable<T> {
  subscribe(next: (value: T) => void): { unsubscribe: () => void };
}

/** What a batch is followed through: a dropzone's manager, or one of our own. */
export interface UmbraDesktopUploadSource {
  /** The manager's list. */
  progressItems: Subscribable<ReadonlyArray<UmbraDesktopUploadItem>>;
  /**
   * Stop items that have not gone up.
   * @param items The items.
   */
  remove(items: UmbraDesktopUploadItem[]): void;
}

/** One batch of uploads, as the Transfers window shows it. */
export interface UmbraDesktopUploadBatch {
  /** The folder it goes into, null for the root, read off its first item. */
  parent: string | null;
  /** Its items now. */
  items(): UmbraDesktopUploadItem[];
  /**
   * Be told whenever its items change.
   * @param listener Called on every change.
   * @returns Stops telling.
   */
  onChange(listener: () => void): () => void;
  /** Stop what has not gone up; what has stays. Core has no pause for uploads. */
  cancel(): void;
  /** Settles once nothing in it is waiting any more. */
  done: Promise<void>;
}

/** Core's status for an item still to go up. */
const WAITING = 'waiting';

/** The event every Umbraco context consumer sends, bubbling and composed. */
const CONTEXT_REQUEST = 'umb:context-request';

/**
 * Follow one batch: the items a manager's list gains from a starting point until none is waiting.
 * @param source The manager.
 * @param parent The folder, when known before the first item arrives.
 * @param start Where the batch starts in the manager's list.
 * @returns The batch.
 */
export function uploadBatch(source: UmbraDesktopUploadSource, parent: string | null = null, start = 0): UmbraDesktopUploadBatch {
  let items: UmbraDesktopUploadItem[] = [];
  const listeners = new Set<() => void>();
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  let finished = false;
  const batch: UmbraDesktopUploadBatch = {
    parent,
    items: () => items.map((each) => ({ ...each })),
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cancel: () => source.remove(items.filter((each) => each.status === WAITING)),
    done,
  };
  const subscription = source.progressItems.subscribe((list) => {
    if (finished) return;
    items = (list ?? []).slice(start);
    if (items.length && batch.parent === null && parent === null) batch.parent = items[0].parentUnique;
    for (const listener of listeners) listener();
    if (items.length && !items.some((each) => each.status === WAITING)) {
      finished = true;
      queueMicrotask(() => subscription.unsubscribe());
      finish();
    }
  });
  return batch;
}

/**
 * Watch a manager window for core's dropzones, and report each batch of uploads as it starts.
 * @param root The manager window's element.
 * @param onBatch Told once per batch, as it starts.
 * @returns Stops watching.
 */
export function watchUploads(root: EventTarget, onBatch: (batch: UmbraDesktopUploadBatch) => void): () => void {
  const tracked = new Map<Element, () => void>();
  const track = (dropzone: Element & { progressItems: () => Subscribable<ReadonlyArray<UmbraDesktopUploadItem>> }) => {
    let busy = false;
    let idleLength = -1;
    const manager = (dropzone as unknown as { _manager?: { remove?: (items: UmbraDesktopUploadItem[]) => void } })._manager;
    const source: UmbraDesktopUploadSource = {
      progressItems: dropzone.progressItems(),
      // Core's dropzone keeps its manager on a protected field; its own Cancel buttons call it.
      remove: (items) => manager?.remove?.(items),
    };
    tracked.set(dropzone, () => undefined);
    const subscription = source.progressItems.subscribe((list) => {
      const waiting = (list ?? []).some((each) => each.status === WAITING);
      // A batch starts where the list stood the last time nothing was waiting; a dropzone first seen
      // mid-upload has no such moment, so its batch is the whole list.
      if (waiting && !busy) onBatch(uploadBatch(source, null, Math.max(0, idleLength)));
      busy = waiting;
      if (!waiting) idleLength = (list ?? []).length;
    });
    tracked.set(dropzone, () => subscription.unsubscribe());
  };
  const onRequest = (event: Event) => {
    for (const [dropzone, release] of [...tracked]) {
      if (dropzone.isConnected) continue;
      release();
      tracked.delete(dropzone);
    }
    const source = event.composedPath()[0] as (Element & { progressItems?: unknown }) | undefined;
    if (source && typeof source.progressItems === 'function' && !tracked.has(source)) {
      track(source as Element & { progressItems: () => Subscribable<ReadonlyArray<UmbraDesktopUploadItem>> });
    }
  };
  root.addEventListener(CONTEXT_REQUEST, onRequest, { capture: true });
  return () => {
    root.removeEventListener(CONTEXT_REQUEST, onRequest, { capture: true });
    for (const release of tracked.values()) release();
    tracked.clear();
  };
}
