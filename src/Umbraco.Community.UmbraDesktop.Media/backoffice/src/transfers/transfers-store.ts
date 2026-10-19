import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbraDesktopOperationHandle } from '../operations/engine.js';
import type { UmbraDesktopUploadBatch, UmbraDesktopUploadItem } from '../upload/upload-watch.js';
import { OPEN_AFTER_MS, closesItself, opensNow } from './transfers-model.js';
import type { UmbraDesktopTransfer, UmbraDesktopTransferKind, UmbraDesktopTransferRow } from './transfers-model.js';

/**
 * The transfers the desktop keeps for its Transfers window (design §7, plan task 7.4): every operation
 * the manager runs and every batch of uploads in a manager window, each as one transfer with a row per
 * item. It opens the window for a transfer still running after two seconds, and once everything has
 * finished and worked it closes the window and says what went where. Kept in the add-on's desktop
 * context, so transfers outlive the window that started them.
 */

/** What the store asks of the desktop. */
export interface UmbraDesktopTransfersDeps {
  /** The time now, in milliseconds. */
  now(): number;
  /**
   * Run something later.
   * @param run What to run.
   * @param ms When.
   */
  later(run: () => void, ms: number): void;
  /** Open the Transfers window, or bring it forward. */
  open(): void;
  /** Whether the Transfers window is open. */
  isOpen(): boolean;
  /** Close the Transfers window. */
  close(): void;
  /**
   * Say that a transfer the window showed has finished and everything in it worked.
   * @param transfer The transfer.
   */
  notify(transfer: UmbraDesktopTransfer): void;
  /**
   * A folder's name.
   * @param unique The folder, null for the root.
   */
  nameOf(unique: string | null): Promise<string>;
  /**
   * Upload files again, for Retry failed.
   * @param files The files.
   * @param parent The folder they go into.
   * @returns The new batch.
   */
  reupload?(files: File[], parent: string | null): UmbraDesktopUploadBatch;
}

/** What the store keeps for one transfer, beside what it shows. */
interface UmbraDesktopTransferEntry {
  /** What the window shows. */
  transfer: UmbraDesktopTransfer;
  /** An operation's handle. */
  handle?: UmbraDesktopOperationHandle;
  /** An upload's batches: the first, then one per retry. */
  batches?: UmbraDesktopUploadBatch[];
  /** Upload items a retry has replaced. */
  replaced?: Set<string>;
  /** Whether the window was open while it ran, so its end is announced. */
  shown: boolean;
}

/** Core's upload statuses that mean an item did not go. */
const UPLOAD_FAILED = new Set(['notAllowed', 'error']);

/** The transfers store. */
export class UmbraDesktopTransfersStore {
  /** What the store asks of the desktop. */
  #deps: UmbraDesktopTransfersDeps;

  /** The transfers, by id, in the order they started. */
  #entries = new Map<string, UmbraDesktopTransferEntry>();

  /** What the window shows, as it changes. */
  #state = new UmbArrayState<UmbraDesktopTransfer>([], (each) => each.id);

  /** The transfers, for the Transfers window. */
  readonly transfers = this.#state.asObservable();

  /** Counts ids. */
  #sequence = 0;

  /**
   * @param deps What the store asks of the desktop.
   */
  constructor(deps: UmbraDesktopTransfersDeps) {
    this.#deps = deps;
  }

  /** A new transfer id, so an operation's progress can name its transfer before it is followed. */
  newId(): string {
    return `transfer-${++this.#sequence}`;
  }

  /** The transfers now. */
  list(): UmbraDesktopTransfer[] {
    return [...this.#entries.values()].map((entry) => entry.transfer);
  }

  /**
   * Whether the window showed a transfer while it ran, which is when its end is the window's to say.
   * @param id The transfer.
   * @returns True when shown.
   */
  wasShown(id: string): boolean {
    return !!this.#entries.get(id)?.shown;
  }

  /**
   * Follow an operation.
   * @param id Its id, from {@link newId}.
   * @param kind What it does.
   * @param target The folder it goes into, null for the root, undefined for the recycle bin.
   * @param handle The running operation.
   */
  followOperation(id: string, kind: UmbraDesktopTransferKind, target: string | null | undefined, handle: UmbraDesktopOperationHandle): void {
    this.#start({ transfer: this.#blank(id, kind, target, true), handle, shown: false });
  }

  /**
   * Follow a batch of uploads.
   * @param batch The batch.
   * @returns Its id.
   */
  followUpload(batch: UmbraDesktopUploadBatch): string {
    const id = this.newId();
    const entry: UmbraDesktopTransferEntry = { transfer: this.#blank(id, 'upload', batch.parent, false), batches: [], replaced: new Set(), shown: false };
    this.#start(entry);
    this.#addBatch(entry, batch);
    return id;
  }

  /**
   * Read a transfer again, after its operation or upload changed.
   * @param id The transfer.
   */
  refresh(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    const before = entry.transfer.state;
    const transfer = (entry.transfer = { ...entry.transfer, ...(entry.handle ? this.#fromOperation(entry.handle) : this.#fromUploads(entry)) });
    const done = this.#doneUnits(transfer);
    const last = transfer.samples[transfer.samples.length - 1];
    if (!last || last.done !== done) transfer.samples = [...transfer.samples, { at: this.#deps.now(), done }].slice(-60);
    if (this.#deps.isOpen() && (transfer.state === 'running' || transfer.state === 'paused')) entry.shown = true;
    if (!entry.shown && transfer.state !== 'running' && transfer.state !== 'paused') {
      // Quick, and over before the window opened for it: core's placeholders showed it, and a failure
      // is the desktop notification's to say. Kept, it would turn up in the window the next time it
      // opened, and a failure in it would keep the window from ever closing itself.
      this.#entries.delete(id);
      this.#publish();
      return;
    }
    this.#publish();
    if (before !== transfer.state && transfer.state !== 'running' && transfer.state !== 'paused') this.#onFinished();
  }

  /**
   * Pause a transfer: finish what is in flight, start nothing more.
   * @param id The transfer.
   */
  pause(id: string): void {
    this.#entries.get(id)?.handle?.pause();
    this.refresh(id);
  }

  /**
   * Carry on after a pause.
   * @param id The transfer.
   */
  resume(id: string): void {
    this.#entries.get(id)?.handle?.resume();
  }

  /**
   * Stop a transfer; what is done stays.
   * @param id The transfer.
   */
  cancel(id: string): void {
    const entry = this.#entries.get(id);
    entry?.handle?.cancel();
    for (const batch of entry?.batches ?? []) batch.cancel();
  }

  /**
   * Run the failed items of a transfer again.
   * @param id The transfer.
   * @param keys Just these items, as a row's own Retry asks; every failed item when left out.
   */
  async retry(id: string, keys?: ReadonlyArray<string>): Promise<void> {
    const entry = this.#entries.get(id);
    if (!entry) return;
    const asked = keys ? new Set(keys) : undefined;
    if (entry.handle) {
      const again = entry.handle.retry(entry.handle.rows().filter((row) => !asked || asked.has(row.item.unique)).map((row) => row.item));
      this.refresh(id);
      await again;
      return;
    }
    const reupload = this.#deps.reupload;
    if (!reupload) return;
    const failed = this.#uploadItems(entry).filter((item) => UPLOAD_FAILED.has(item.status) && item.temporaryFile && (!asked || asked.has(item.unique)));
    const byParent = new Map<string | null, UmbraDesktopUploadItem[]>();
    for (const item of failed) byParent.set(item.parentUnique, [...(byParent.get(item.parentUnique) ?? []), item]);
    for (const [parent, items] of byParent) {
      for (const item of items) entry.replaced!.add(item.unique);
      this.#addBatch(entry, reupload(items.map((item) => item.temporaryFile!.file), parent));
    }
    this.refresh(id);
    await Promise.all(entry.batches!.map((batch) => batch.done));
  }

  /** Forget the transfers that have finished, as when the window closes. */
  clearFinished(): void {
    for (const [id, entry] of [...this.#entries]) {
      if (entry.transfer.state !== 'running' && entry.transfer.state !== 'paused') this.#entries.delete(id);
    }
    this.#publish();
  }

  /**
   * A transfer before anything is known of it.
   * @param id Its id.
   * @param kind What it does.
   * @param target Where it goes.
   * @param canPause Whether it can be paused.
   * @returns The transfer.
   */
  #blank(id: string, kind: UmbraDesktopTransferKind, target: string | null | undefined, canPause: boolean): UmbraDesktopTransfer {
    return { id, kind, target, startedAt: this.#deps.now(), state: 'running', canPause, rows: [], samples: [] };
  }

  /**
   * Start following a transfer: read where it goes, and look again in two seconds.
   * @param entry The transfer.
   */
  #start(entry: UmbraDesktopTransferEntry): void {
    const id = entry.transfer.id;
    this.#entries.set(id, entry);
    if (this.#deps.isOpen()) entry.shown = true;
    this.refresh(id);
    const target = entry.transfer.target;
    if (target !== undefined) {
      void this.#deps.nameOf(target).then((name) => {
        const current = this.#entries.get(id);
        if (!current) return;
        current.transfer = { ...current.transfer, targetName: name };
        this.#publish();
      });
    }
    this.#deps.later(() => {
      const current = this.#entries.get(id);
      if (!current || !opensNow(current.transfer, this.#deps.now())) return;
      current.shown = true;
      this.#deps.open();
    }, OPEN_AFTER_MS);
  }

  /**
   * Add a batch of uploads to a transfer and follow it.
   * @param entry The transfer.
   * @param batch The batch.
   */
  #addBatch(entry: UmbraDesktopTransferEntry, batch: UmbraDesktopUploadBatch): void {
    entry.batches!.push(batch);
    batch.onChange(() => this.refresh(entry.transfer.id));
    void batch.done.then(() => this.refresh(entry.transfer.id));
  }

  /**
   * What an operation shows.
   * @param handle The operation.
   * @returns Its state and rows.
   */
  #fromOperation(handle: UmbraDesktopOperationHandle): Pick<UmbraDesktopTransfer, 'state' | 'rows'> {
    return {
      state: handle.progress().state,
      rows: handle.rows().map((row) => ({ key: row.item.unique, name: row.item.name, status: row.status, reason: row.reason })),
    };
  }

  /**
   * The upload items of a transfer that still count: a retry replaces the failures it uploads again.
   * @param entry The transfer.
   * @returns The items.
   */
  #uploadItems(entry: UmbraDesktopTransferEntry): UmbraDesktopUploadItem[] {
    return entry.batches!.flatMap((batch) => batch.items()).filter((item) => !entry.replaced!.has(item.unique));
  }

  /**
   * What a batch of uploads shows: a row per file and folder, each with the folders it goes into
   * when those are part of the upload.
   * @param entry The transfer.
   * @returns Its state, rows and where it goes.
   */
  #fromUploads(entry: UmbraDesktopTransferEntry): Pick<UmbraDesktopTransfer, 'state' | 'rows' | 'target'> {
    const items = this.#uploadItems(entry);
    const folders = new Map(items.filter((item) => item.folder).map((item) => [item.unique, item]));
    const pathOf = (item: UmbraDesktopUploadItem): string | undefined => {
      const names: string[] = [];
      for (let parent = folders.get(item.parentUnique ?? ''), guard = 0; parent && guard < 50; guard++) {
        names.unshift(parent.folder!.name);
        parent = folders.get(parent.parentUnique ?? '');
      }
      return names.length ? names.join(' / ') : undefined;
    };
    const rows: UmbraDesktopTransferRow[] = items.map((item) => ({
      key: item.unique,
      name: item.temporaryFile?.file.name ?? item.folder?.name ?? '',
      path: pathOf(item),
      status:
        item.status === 'waiting'
          ? item.progress > 0
            ? 'running'
            : 'waiting'
          : item.status === 'complete'
            ? 'done'
            : item.status === 'cancelled'
              ? 'cancelled'
              : 'failed',
      progress: item.progress / 100,
      reason: UPLOAD_FAILED.has(item.status) ? item.statusMessage || undefined : undefined,
      bytes: item.temporaryFile?.file.size,
      folder: !!item.folder,
    }));
    const waiting = items.some((item) => item.status === 'waiting');
    const state = !items.length || waiting ? 'running' : items.some((item) => item.status === 'cancelled') ? 'cancelled' : 'finished';
    return { state, rows, target: entry.transfer.target ?? entry.batches![0]?.parent ?? null };
  }

  /**
   * How much of a transfer is done, in its own unit: bytes for an upload whose sizes are known, items
   * otherwise. What the time left is worked out from.
   * @param transfer The transfer.
   * @returns The amount.
   */
  #doneUnits(transfer: UmbraDesktopTransfer): number {
    const rows = transfer.rows.filter((row) => !row.folder);
    if (transfer.kind === 'upload' && rows.some((row) => row.bytes)) {
      return rows.reduce((sum, row) => sum + (row.status === 'done' ? (row.bytes ?? 0) : row.status === 'running' ? (row.bytes ?? 0) * (row.progress ?? 0) : 0), 0);
    }
    return rows.filter((row) => row.status === 'done' || row.status === 'failed').length;
  }

  /**
   * A transfer finished: when every transfer has and everything worked, close the window and say what
   * went where, for each the window showed.
   */
  #onFinished(): void {
    const list = this.list();
    if (!closesItself(list) || !this.#deps.isOpen()) return;
    const shown = [...this.#entries.values()].filter((entry) => entry.shown).map((entry) => entry.transfer);
    this.#deps.close();
    for (const transfer of shown) this.#deps.notify(transfer);
    this.#entries.clear();
    this.#publish();
  }

  /** Tell the window. */
  #publish(): void {
    this.#state.setValue(this.list());
  }
}
