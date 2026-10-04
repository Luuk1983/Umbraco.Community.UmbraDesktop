import { taskFromUploads } from './progress.js';
import type { UmbraDesktopTask, UmbraDesktopUploadItem } from './progress.js';

/**
 * Watches a window's frame for media uploads, so a window busy uploading says so on its own chrome
 * with no change to the media section. Issue #108, design §1.
 *
 * **What it reads.** A media dropzone (`umb-dropzone-media`) exposes `progressItems()`, the upload
 * manager's own list of every file and folder in a drop with a status and a percent. That is what
 * core's media grid subscribes to for its upload tiles, and it is the most complete thing there is:
 * it counts the files inside a dropped folder, which the grid's placeholders never did.
 *
 * The design first read the media collection context's `placeholders`, which is reachable the way
 * the dirty watcher reaches a workspace. That worked on 17.6 and is dead on 17.7 and 18.2: the
 * collection element stopped subscribing to its context, so nothing ever writes a placeholder and
 * the list stays empty through a whole upload. Found by uploading into a real backoffice, which is
 * the only place it could have been found.
 *
 * **How it finds one.** A dropzone is not a context provider, and its own events neither bubble nor
 * cross a shadow root, so neither of the techniques in `frame-context.ts` reaches it. What does
 * reach the frame's document is every `umb:context-request` it sends as it connects — it consumes
 * the notification context, the temporary file config store and the media store — because a request
 * is bubbling and composed. Listening in the **capture** phase is what makes that reliable: a
 * provider stops the request once it answers, but capture runs on the document before any of that.
 * Any element that requests a context and has `progressItems()` is a dropzone.
 *
 * **How it lets go of one.** A dropzone has no going-away event either. Navigating inside a window
 * always connects new elements, and every one of them asks for contexts, so each request is also
 * the moment to drop any tracked dropzone that is no longer in the document.
 */

/** Only what this module needs of an Umbraco observable. */
interface Subscribable<T> {
  subscribe(next: (value: T) => void): { unsubscribe: () => void };
}

/** An element that uploads through core's dropzone manager. */
interface UploadDropzone extends Element {
  /** The manager's list of every item it has handled, as an observable. */
  progressItems: () => Subscribable<ReadonlyArray<UmbraDesktopUploadItem>>;
}

/** The event every Umbraco context consumer sends, bubbling and composed. */
const CONTEXT_REQUEST_EVENT = 'umb:context-request';

/**
 * Whether something that asked for a context is a dropzone this module can read.
 *
 * By shape, never `instanceof Element`. The dropzone lives in the window's frame, which is another
 * realm with its own `Element`, so an `instanceof` against this one is false for every real
 * dropzone. That shipped once: it passed every test in this realm and found nothing in a backoffice.
 * @param candidate The request's original target.
 * @returns True for a node with `progressItems()`.
 */
function isUploadDropzone(candidate: EventTarget | undefined): candidate is UploadDropzone {
  const node = candidate as Partial<UploadDropzone> | undefined;
  return typeof node?.progressItems === 'function' && typeof node.isConnected === 'boolean';
}

/** One tracked dropzone. */
interface TrackedDropzone {
  /** Its current task, if it has one to show. */
  task?: UmbraDesktopTask;
  /** Where the batch in progress starts in the manager's list. */
  batchStart: number;
  /** Whether anything was waiting at the last report, i.e. whether a batch is under way. */
  busy: boolean;
  /** How long the list was the last time nothing was waiting, or -1 before that has been seen. */
  idleLength: number;
  /** Drops the subscription. */
  release: () => void;
}

/**
 * Watch a frame's document for media uploads, reporting the tasks they amount to each time that
 * changes. Called only on change, never on start, so a window that opens on a quiet media section
 * reports nothing at all; an empty list after a report is how it says the work is over.
 * @param doc The frame's document.
 * @param onChange Called with the frame's upload tasks each time they change.
 * @returns A function that stops watching and drops every subscription.
 */
export function watchFrameUploads(
  doc: Document,
  onChange: (tasks: ReadonlyArray<UmbraDesktopTask>) => void,
): () => void {
  const tracked = new Map<UploadDropzone, TrackedDropzone>();
  /** Gives each dropzone its own task id, so two in one frame stay two tasks. */
  let sequence = 0;
  /** The last report, as a comparable string, seeded with "nothing" so start stays silent. */
  let reported = '[]';

  const publish = () => {
    const tasks = [...tracked.values()].flatMap((entry) => (entry.task ? [entry.task] : []));
    const signature = JSON.stringify(tasks);
    if (signature === reported) return;
    reported = signature;
    onChange(tasks);
  };

  const track = (dropzone: UploadDropzone) => {
    const id = `media-upload-${(sequence += 1)}`;
    const entry: TrackedDropzone = { batchStart: 0, busy: false, idleLength: -1, release: () => {} };
    // In the map before subscribing, because the observable answers straight away and `publish`
    // has to find the entry to count it. The dirty watcher learned this first.
    tracked.set(dropzone, entry);
    const subscription = dropzone.progressItems().subscribe((items) => {
      const list = items ?? [];
      const busy = list.some((item) => item.status === 'waiting');
      // The manager keeps every item it has handled since the page loaded and appends each new drop,
      // so a batch starts where the list stood when the last one ended. That is what makes a second
      // drop read "0 of 2" rather than "3 of 5", and what lets a failure stand until the next drop
      // rather than for the rest of the page's life. Design D3.
      // A dropzone first seen mid-upload has no idle moment to start from, so it counts everything.
      if (busy && !entry.busy) entry.batchStart = Math.max(0, entry.idleLength);
      entry.busy = busy;
      if (!busy) entry.idleLength = list.length;
      const task = taskFromUploads(list.slice(entry.batchStart));
      entry.task = task ? { ...task, id } : undefined;
      publish();
    });
    entry.release = () => subscription.unsubscribe();
  };

  const forget = (dropzone: UploadDropzone) => {
    tracked.get(dropzone)?.release();
    tracked.delete(dropzone);
  };

  const onRequest = (event: Event) => {
    let changed = false;
    for (const dropzone of [...tracked.keys()]) {
      if (dropzone.isConnected) continue;
      forget(dropzone);
      changed = true;
    }
    const source = event.composedPath()[0];
    if (isUploadDropzone(source) && !tracked.has(source)) track(source);
    else if (changed) publish();
  };

  doc.addEventListener(CONTEXT_REQUEST_EVENT, onRequest, { capture: true });
  return () => {
    doc.removeEventListener(CONTEXT_REQUEST_EVENT, onRequest, { capture: true });
    for (const dropzone of [...tracked.keys()]) forget(dropzone);
  };
}
