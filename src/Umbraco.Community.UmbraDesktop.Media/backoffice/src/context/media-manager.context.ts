import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UmbContextToken as UmbraDesktopToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { UMB_ACTION_EVENT_CONTEXT } from '@umbraco-cms/backoffice/action';
import { UmbRequestReloadChildrenOfEntityEvent } from '@umbraco-cms/backoffice/entity-action';
import { afterPaste, pasteInto, pasteKind } from '../clipboard/clipboard.js';
import type { UmbraDesktopMediaClipboard } from '../clipboard/clipboard.js';
import { UmbraDesktopMediaServerApi } from '../operations/media-api.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../operations/media-api.js';
import { split } from '../operations/rules.js';
import type { UmbraDesktopRefusal } from '../operations/rules.js';
import { runOperation } from '../operations/engine.js';
import type { UmbraDesktopOperationResult, UmbraDesktopOperationStep } from '../operations/engine.js';
import { UmbraDesktopTransfersStore } from '../transfers/transfers-store.js';
import { UMBRADESKTOP_MEDIA_TRANSFERS_APP } from '../transfers/transfers-app.js';
import type { UmbraDesktopTransfer } from '../transfers/transfers-model.js';
import { titleOf } from '../transfers/transfers-model.js';
import type { UmbraDesktopUploadBatch } from '../upload/upload-watch.js';
import { UmbraDesktopUndoHistory } from '../undo/history.js';
import { stepFrom } from '../undo/inverse.js';
import type { UmbraDesktopUndoAction, UmbraDesktopUndoStep } from '../undo/inverse.js';
import { copySteps, moveSteps, renameStep, restoreSteps, trashSteps } from '../operations/steps.js';
import { UmbraDesktopMediaDragController } from '../drag/drag.controller.js';
import { fingerprint, toPng, writeImage } from '../clipboard/os-image.js';
import { watchBinChanges } from '../tree/bin-count.js';
import { UmbraDesktopMediaOsDropController } from '../upload/os-drop.controller.js';
import { uploadInto } from '../upload/upload.js';
import type { UmbraDesktopImageClipboard, UmbraDesktopImagePrint } from '../clipboard/os-image.js';
import type { UmbraDesktopDragWindowHandle } from '../drag/drag.controller.js';

/** What an operation does, for its notice and, later, the Transfers window and undo. */
export type UmbraDesktopMediaOperationKind = 'move' | 'copy' | 'trash' | 'restore' | 'rename';


/** How an operation is run. */
export interface UmbraDesktopRunOptions {
  /** Whether it goes into the undo history; an undo itself does not. Default: recorded. */
  record?: boolean;
}

/** As much of the desktop's window manager as the context uses. */
interface UmbraDesktopWindowManager extends UmbContextMinimal {
  /** Open an app, or bring its one window forward. */
  openApp(alias: string): boolean;
  /** The windows open. */
  getWindows(): ReadonlyArray<{ id: string; app: { alias: string } }>;
  /** Close a window. */
  close(id: string): void;
}

/** The desktop's window manager. */
const UMBRADESKTOP_WINDOW_MANAGER = new UmbraDesktopToken<UmbraDesktopWindowManager>('UmbraDesktopWindowManagerContext');

/** What the context uses beyond the server, so a test can hand in its own. */
export interface UmbraDesktopMediaContextDeps {
  /** The server. */
  api?: UmbraDesktopMediaApi;
  /**
   * Say what did not go.
   * @param message The text.
   * @param headline Its headline.
   */
  notify?: (message: string, headline: string) => void;
  /**
   * Tell every window on a folder to show its contents again.
   * @param unique The folder, null for the root.
   */
  reload?: (unique: string | null) => void;
  /** The OS clipboard a copied picture goes to; the browser's unless a test hands in its own. */
  osClipboard?: UmbraDesktopImageClipboard;
  /** Whether the page has the keyboard, frames inside it included; the document's own answer unless a test's. */
  pageFocused?: () => boolean;
}

/** The files the OS clipboard takes as a picture, by extension; anything else is not put there. */
const PICTURES = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

/**
 * The Media add-on's context on the desktop (plan task 4.5): the clipboard every manager window shares,
 * and the operations they start, which run here rather than in a window so they keep going when the
 * window that started them closes (design §7).
 *
 * A `umbraDesktopContext`, so the desktop creates it on open and destroys it on leave, as the Arcade's
 * is; constructed with `(host)` by the desktop, the second parameter is for tests.
 */
export class UmbraDesktopMediaManagerContext extends UmbContextBase {
  /** The server. */
  #api: UmbraDesktopMediaApi;

  /** Says what did not go. */
  #notify: (message: string, headline: string) => void;

  /** Tells windows on a folder to reload. */
  #reload: (unique: string | null) => void;

  /** Where a copied picture goes. */
  #osClipboard?: UmbraDesktopImageClipboard;

  /** The fingerprint of the picture last put on the OS clipboard, while it is being made too. */
  #osPicture?: Promise<UmbraDesktopImagePrint | undefined>;

  /** Words for notices, in the backoffice's language. */
  #localize = new UmbLocalizationController(this);

  /** What is held. */
  #clipboard = new UmbObjectState<UmbraDesktopMediaClipboard | undefined>(undefined);

  /** What is held, for every manager window: Paste, the fade, the keys. */
  readonly clipboard = this.#clipboard.asObservable();

  /** The desktop's window manager, for the Transfers window. */
  #windowManager?: UmbraDesktopWindowManager;

  /** Every operation and upload, as the Transfers window shows them (plan phase 7). */
  #transfers = new UmbraDesktopTransfersStore({
    now: () => Date.now(),
    later: (run, ms) => void window.setTimeout(run, ms),
    open: () => void this.#windowManager?.openApp(UMBRADESKTOP_MEDIA_TRANSFERS_APP),
    isOpen: () => !!this.#transfersWindows().length,
    close: () => {
      for (const id of this.#transfersWindows()) this.#windowManager?.close(id);
    },
    notify: (transfer) => void this.#announce(transfer),
    nameOf: (unique) => this.#folderName(unique),
    reupload: (files, parent) => {
      let batch!: UmbraDesktopUploadBatch;
      void uploadInto(this, { files, folders: [] }, parent, (started) => (batch = started)).then(() => this.#reload(parent));
      return batch;
    },
  });

  /** Every operation and upload, for the Transfers window. */
  readonly transfers = this.#transfers.transfers;

  /** One undo history for every manager window (design §10). */
  #history = new UmbraDesktopUndoHistory();

  /** The manager windows open, which a drag can start in and land in. */
  #dragWindows: UmbraDesktopDragWindowHandle[] = [];

  /**
   * Dragging between the windows (plan phase 5). Here rather than in a window, because a drag starts in
   * one window and ends in another.
   */
  #drag: UmbraDesktopMediaDragController;

  /** Files from the OS dropped on the windows (plan phase 6), for the same reason. */
  #osDrop: UmbraDesktopMediaOsDropController;

  /**
   * @param host The desktop element.
   * @param deps Stand-ins, for tests.
   */
  constructor(host: UmbControllerHost, deps: UmbraDesktopMediaContextDeps = {}) {
    super(host, UMBRADESKTOP_MEDIA_MANAGER_CONTEXT);
    this.#api = deps.api ?? new UmbraDesktopMediaServerApi(this);
    this.#notify = deps.notify ?? ((message, headline) => void this.#peek(message, headline));
    this.#reload = deps.reload ?? ((unique) => void this.#reloadFolder(unique));
    this.#osClipboard = deps.osClipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : undefined);
    this.#pageFocused = deps.pageFocused ?? (() => document.hasFocus());
    window.addEventListener('blur', this.#onBlur);
    document.addEventListener('visibilitychange', this.#onVisibility);
    // The recycle bin's row says how much is in it; this recounts it in every window after a change.
    this.consumeContext(UMB_ACTION_EVENT_CONTEXT, (events) => {
      this.#stopBinWatch?.();
      this.#stopBinWatch = events ? watchBinChanges(events) : undefined;
    });
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER, (manager) => (this.#windowManager = manager ?? undefined));
    this.#drag = new UmbraDesktopMediaDragController(
      {
        api: this.#api,
        move: (items, target) => this.move(items, target),
        copyTo: (items, target) => this.copyTo(items, target),
        trash: (items) => this.trash(items),
        restore: (items, target) => this.restore(items, target),
      },
      () => this.#dragWindows,
    );
    this.#drag.start();
    this.#osDrop = new UmbraDesktopMediaOsDropController(
      {
        api: this.#api,
        upload: async (items, parent) => {
          await uploadInto(this, items, parent, (batch) => this.followUpload(batch));
          this.#reload(parent);
        },
      },
      () => this.#dragWindows,
    );
    this.#osDrop.start();
  }

  override destroy(): void {
    this.#stopBinWatch?.();
    window.removeEventListener('blur', this.#onBlur);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#drag.stop();
    this.#osDrop.stop();
    this.#dragWindows = [];
    super.destroy();
  }

  /**
   * A manager window opened: drags can start in it and land in it.
   * @param handle The window, as the drag works with it.
   * @returns Call when the window closes.
   */
  registerDragWindow(handle: UmbraDesktopDragWindowHandle): () => void {
    this.#dragWindows = [...this.#dragWindows, handle];
    return () => {
      this.#dragWindows = this.#dragWindows.filter((each) => each !== handle);
    };
  }

  /** The manager windows open. */
  dragWindows(): ReadonlyArray<UmbraDesktopDragWindowHandle> {
    return this.#dragWindows;
  }

  /**
   * Show a batch of uploads in the Transfers window, as a manager window sees core's dropzone start one.
   * @param batch The batch.
   */
  followUpload(batch: UmbraDesktopUploadBatch): void {
    this.#transfers.followUpload(batch);
  }

  /**
   * Pause a transfer.
   * @param id The transfer.
   */
  pauseTransfer(id: string): void {
    this.#transfers.pause(id);
  }

  /**
   * Carry on with a paused transfer.
   * @param id The transfer.
   */
  resumeTransfer(id: string): void {
    this.#transfers.resume(id);
  }

  /**
   * Stop a transfer; what is done stays.
   * @param id The transfer.
   */
  cancelTransfer(id: string): void {
    this.#transfers.cancel(id);
  }

  /**
   * Run a transfer's failed items again.
   * @param id The transfer.
   * @param keys Just these items; every failed item when left out.
   */
  retryTransfer(id: string, keys?: ReadonlyArray<string>): Promise<void> {
    return this.#transfers.retry(id, keys);
  }

  /** Forget the finished transfers, as when the Transfers window closes. */
  clearFinishedTransfers(): void {
    this.#transfers.clearFinished();
  }

  /** The ids of the Transfers windows open: one at most. */
  #transfersWindows(): string[] {
    return (this.#windowManager?.getWindows() ?? []).filter((each) => each.app.alias === UMBRADESKTOP_MEDIA_TRANSFERS_APP).map((each) => each.id);
  }

  /**
   * A folder's name, for a transfer's title.
   * @param unique The folder, null for the root.
   * @returns The name, or Media's own key for the root.
   */
  async #folderName(unique: string | null): Promise<string> {
    if (!unique) return '#sections_media';
    return (await this.#api.item(unique)).data?.name ?? '';
  }

  /**
   * Say on the desktop that a transfer the window showed has finished and everything worked.
   * @param transfer The transfer.
   */
  async #announce(transfer: UmbraDesktopTransfer): Promise<void> {
    const title = titleOf(transfer);
    const words = title.args.map((arg) => (typeof arg === 'string' ? this.#localize.string(arg) : arg));
    try {
      const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
      notifications?.peek('positive', { data: { headline: this.#localize.term(title.key, ...words), message: '' } });
    } catch {
      // No notification context: the desktop is gone.
    }
  }

  /** The server, for actions that read before they act. */
  get api(): UmbraDesktopMediaApi {
    return this.#api;
  }

  /** What is held now. */
  getClipboard(): UmbraDesktopMediaClipboard | undefined {
    return this.#clipboard.getValue();
  }

  /**
   * Hold items for a paste: cut to move them, copy to copy them.
   * @param mode Cut or copy.
   * @param items The items.
   */
  hold(mode: 'cut' | 'copy', items: ReadonlyArray<UmbraDesktopMediaRef>): void {
    this.#clipboard.setValue(items.length ? { mode, items: [...items] } : undefined);
    this.#heldIn = this.#visit;
    const one = mode === 'copy' && items.length === 1 && !items[0].isFolder ? items[0] : undefined;
    const started = this.#started;
    this.#started = undefined;
    this.#osPicture = !one ? undefined : started?.unique === one.unique ? started.picture : this.#copyPicture(one.unique);
  }

  /**
   * Start putting an item's picture on the OS clipboard now, from the key that copies it, before the
   * item is read: the browser only takes a write that starts in the key's own moment (see
   * {@link #copyPicture}), and reading the item first is a trip to the server. The {@link hold} that
   * follows for the same item uses this write; an item with no picture leaves the OS clipboard as it
   * was.
   * @param unique The item's key.
   */
  startPicture(unique: string): void {
    this.#started = { unique, picture: this.#copyPicture(unique) };
  }

  /** The picture a key started, until the hold it was for. */
  #started?: { unique: string; picture: Promise<UmbraDesktopImagePrint | undefined> };

  /**
   * Whether what the manager holds was copied or cut after anything now on the OS clipboard: true
   * until the page is left, since another program can only write the OS clipboard while the person is
   * in it. A paste then pastes what is held, whatever picture the OS clipboard still has from before,
   * as when writing the copied picture there failed.
   * @returns True while something is held and the page has not been left since.
   */
  heldIsNewer(): boolean {
    return !!this.#clipboard.getValue() && this.#heldIn === this.#visit;
  }

  /** Stops recounting the recycle bin. */
  #stopBinWatch?: () => void;

  /** How many times the page has been left; see {@link heldIsNewer}. */
  #visit = 0;

  /** The visit the clipboard was last held in. */
  #heldIn = -1;

  /** Whether the page has the keyboard. */
  #pageFocused: () => boolean;

  /**
   * The window lost the keyboard: to another program, or to a frame inside the page (an item open
   * beside a window), which is not leaving. Which one is only known once the focus has landed.
   */
  #onBlur = (): void => {
    window.setTimeout(() => {
      if (!this.#pageFocused()) this.#visit++;
    }, 0);
  };

  /** The tab was hidden: the page was left. */
  #onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.#visit++;
  };

  /**
   * The fingerprint of the picture last put on the OS clipboard, so a paste can tell it coming back.
   * @returns It, or undefined when none was put there.
   */
  osPicture(): Promise<UmbraDesktopImagePrint | undefined> {
    return this.#osPicture ?? Promise.resolve(undefined);
  }

  /**
   * Put the picture of one copied image on the OS clipboard as well, so it pastes into an email or a
   * chat (design §5). Anything that is not a picture leaves the OS clipboard as it was, and so does a
   * failure: the OS clipboard is a bonus to the copy, which has already been held.
   * @param unique The image's key.
   * @returns The picture's fingerprint, or undefined when nothing was written.
   */
  #copyPicture(unique: string): Promise<UmbraDesktopImagePrint | undefined> {
    const clipboard = this.#osClipboard;
    if (!clipboard) return Promise.resolve(undefined);
    // The write starts now, in the key's own moment, with the picture still to come: the browser
    // refuses one that starts after the page lost the keyboard, which the item opening beside the
    // window can take while the picture is fetched. No picture, and the write fails as a whole.
    const png = this.#pictureOf(unique);
    png.catch(() => undefined);
    const written = writeImage(png, clipboard).then(
      () => true,
      () => false,
    );
    return (async () => ((await written) ? fingerprint(await png) : undefined))().catch(() => undefined);
  }

  /**
   * An item's picture as PNG.
   * @param unique The item's key.
   * @returns The picture; rejected when the item has none.
   */
  async #pictureOf(unique: string): Promise<Blob> {
    const detail = (await this.#api.detail(unique)).data;
    const src = detail?.values
      .map((value) => (value.value as { src?: unknown } | null | undefined)?.src)
      .find((each): each is string => typeof each === 'string' && PICTURES.test(each.split('?')[0]));
    if (!src) throw new Error('No picture');
    const file = (await this.#api.download(src)).data;
    if (!file) throw new Error('No picture');
    return toPng(file);
  }

  /** Hold nothing, as Esc does to a cut. */
  empty(): void {
    this.#clipboard.setValue(undefined);
  }

  /**
   * Paste what is held into a folder: a cut moves, and is used up; a copy copies, and stays held.
   * @param target The folder, null for the root.
   * @returns How it ended, or undefined when nothing was held.
   */
  async paste(target: string | null): Promise<UmbraDesktopOperationResult | undefined> {
    const clipboard = this.#clipboard.getValue();
    const kind = pasteKind(clipboard);
    if (!clipboard || !kind) return undefined;
    this.#clipboard.setValue(afterPaste(clipboard));
    const into = pasteInto(clipboard, target);
    return kind === 'move' ? this.move(clipboard.items, into) : this.copyTo(clipboard.items, into);
  }

  /**
   * Move items into a folder, leaving out what may not go there.
   * @param items The items.
   * @param target The folder, null for the root.
   * @returns How it ended.
   */
  async move(items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null, options: UmbraDesktopRunOptions = {}): Promise<UmbraDesktopOperationResult> {
    const { allowed, refused } = await this.#split(items, target, 'move');
    return this.#run('move', target, moveSteps(this.#api, allowed, target), refused, options);
  }

  /**
   * Copy items into a folder, leaving out what may not go there.
   * @param items The items.
   * @param target The folder, null for the root.
   * @returns How it ended.
   */
  async copyTo(items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null, options: UmbraDesktopRunOptions = {}): Promise<UmbraDesktopOperationResult> {
    const { allowed, refused } = await this.#split(items, target, 'copy');
    return this.#run('copy', target, copySteps(this.#api, allowed, target), refused, options);
  }

  /**
   * Move items to the recycle bin.
   * @param items The items.
   * @returns How it ended.
   */
  trash(items: ReadonlyArray<UmbraDesktopMediaRef>, options: UmbraDesktopRunOptions = {}): Promise<UmbraDesktopOperationResult> {
    return this.#run('trash', undefined, trashSteps(this.#api, items), [], options);
  }

  /**
   * Restore items from the recycle bin into a folder.
   * @param items The items.
   * @param target The folder, null for the root.
   * @returns How it ended.
   */
  async restore(items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null, options: UmbraDesktopRunOptions = {}): Promise<UmbraDesktopOperationResult> {
    const { allowed, refused } = await this.#split(items, target, 'copy');
    return this.#run('restore', target, restoreSteps(this.#api, allowed, target), refused, options);
  }

  /**
   * Give an item a new name.
   * @param item The item.
   * @param name The new name.
   * @returns How it ended.
   */
  rename(item: UmbraDesktopMediaRef, name: string, options: UmbraDesktopRunOptions = {}): Promise<UmbraDesktopOperationResult> {
    return this.#run('rename', item.parent, [renameStep(this.#api, item, name)], [], { ...options, name });
  }

  /**
   * Undo the last move, copy, rename or trash made in any manager window (design §10). Says nothing
   * when it works: the items are back, and the window on their folder comes forward with them
   * selected. When someone has changed an item since, nothing is undone and a notification says why.
   */
  async undo(): Promise<void> {
    const outcome = await this.#history.undo(this.#api, (action) => this.#undoAction(action));
    if (outcome.kind === 'changed') {
      const kind = outcome.step.kind[0].toUpperCase() + outcome.step.kind.slice(1);
      this.#notify(
        this.#localize.term(`umbraDesktopMedia_undoChanged${kind}`, outcome.name),
        this.#localize.term(`umbraDesktopMedia_undoCannot${kind}`),
      );
      return;
    }
    if (outcome.kind === 'undone') this.#showUndone(outcome.step);
  }

  /**
   * Run one operation that undoes part of a step, without recording it: there is no redo.
   * @param action The operation.
   * @returns How it ended.
   */
  #undoAction(action: UmbraDesktopUndoAction): Promise<UmbraDesktopOperationResult> {
    const quiet = { record: false };
    switch (action.kind) {
      case 'move':
        return this.move(action.items, action.target, quiet);
      case 'trash':
        return this.trash(action.items, quiet);
      case 'restore':
        return this.restore(action.items, action.target, quiet);
      case 'rename':
        return this.rename(action.item, action.name, quiet);
    }
  }

  /**
   * After an undo, bring the window showing the folder the items went back to forward, with them
   * selected; a copy's undo takes the copies away, so there is nothing to show.
   * @param step The step undone.
   */
  #showUndone(step: UmbraDesktopUndoStep): void {
    const back =
      step.kind === 'move'
        ? step.items.map((each) => each.item)
        : step.kind === 'trash'
          ? step.items
          : step.kind === 'rename'
            ? [step.item]
            : [];
    if (!back.length) return;
    const folder = back[0].parent;
    const keys = back.filter((each) => each.parent === folder).map((each) => each.unique);
    const window = this.#dragWindows.find((each) => {
      const place = each.place();
      return folder === null ? place.kind === 'root' : place.kind === 'folder' && place.unique === folder;
    });
    if (!window) return;
    window.raise();
    window.selectWhenShown(keys);
  }

  /**
   * Put what may go into a folder apart from what may not, reading the folder's allowed types and
   * where it is.
   * @param items The items.
   * @param target The folder, null for the root.
   * @param mode Moving or copying.
   * @returns The split.
   */
  async #split(items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null, mode: 'move' | 'copy') {
    const ancestors: string[] = [];
    let type: string | null = null;
    if (target) {
      const folder = await this.#api.item(target);
      type = folder.data?.mediaType ?? null;
      for (let parent = folder.data?.parent ?? null, guard = 0; parent && guard < 100; guard++) {
        ancestors.push(parent);
        parent = (await this.#api.item(parent)).data?.parent ?? null;
      }
    }
    const allowed = await this.#api.allowedTypes(type, target);
    return split(items, { unique: target, ancestors }, allowed.data ? new Set(allowed.data) : undefined, mode);
  }

  /**
   * Run steps, reload the windows on every folder a step changed as it goes, and say what did not go.
   * @param kind What the operation does.
   * @param target The folder it goes into, null for the root, undefined for the recycle bin.
   * @param steps Its steps.
   * @param refused What was left out before it started, with the reason.
   * @param options Whether to record it for undo, and a rename's new name.
   * @returns How it ended, with the left-out items among the failures.
   */
  async #run(
    kind: UmbraDesktopMediaOperationKind,
    target: string | null | undefined,
    steps: UmbraDesktopOperationStep[],
    refused: Array<{ item: UmbraDesktopMediaRef; reason: UmbraDesktopRefusal }>,
    options: UmbraDesktopRunOptions & { name?: string } = {},
  ): Promise<UmbraDesktopOperationResult> {
    const id = this.#transfers.newId();
    const handle = runOperation(
      steps,
      () => this.#transfers.refresh(id),
      (step) => {
        for (const unique of new Set(step.affects)) this.#reload(unique);
      },
    );
    this.#transfers.followOperation(id, kind, target, handle);
    const result = await handle.done;
    if (options.record !== false) this.#history.push(stepFrom(kind, target, result, { name: options.name }));
    // Already there is no failure: a move into the folder an item is in has nothing to do.
    const leftOut = refused.filter((each) => each.reason !== 'there').map((each) => ({ item: each.item, reason: this.#refusal(each.reason) }));
    const failed = [...leftOut, ...result.failed];
    // A transfer the Transfers window showed lists its own failures, with Umbraco's reasons.
    if (failed.length && !this.#transfers.wasShown(id)) {
      this.#notify(
        failed.map((each) => `${each.item.name}: ${each.reason}`).join('\n'),
        this.#localize.term('umbraDesktopMedia_notDoneHeadline', failed.length, failed.length + result.succeeded.length),
      );
    }
    return { ...result, failed };
  }

  /**
   * A refusal in words.
   * @param reason Why.
   * @returns The text.
   */
  #refusal(reason: UmbraDesktopRefusal): string {
    return this.#localize.term(reason === 'type' ? 'umbraDesktopMedia_refusedType' : 'umbraDesktopMedia_refusedSelf');
  }

  /**
   * Raise a warning on the desktop.
   * @param message The text.
   * @param headline Its headline.
   */
  async #peek(message: string, headline: string): Promise<void> {
    try {
      const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
      notifications?.peek('warning', { data: { headline, message } });
    } catch {
      // No notification context: the desktop is gone.
    }
  }

  /**
   * Tell every collection and tree showing a folder to load it again, through core's own event, as
   * core's Move to does.
   * @param unique The folder, null for the root.
   */
  async #reloadFolder(unique: string | null): Promise<void> {
    try {
      const events = await this.getContext(UMB_ACTION_EVENT_CONTEXT);
      events?.dispatchEvent(new UmbRequestReloadChildrenOfEntityEvent({ entityType: unique ? 'media' : 'media-root', unique }));
    } catch {
      // No event context: nothing is showing it.
    }
  }
}

/** The Media add-on's desktop context, for its windows and actions. */
export const UMBRADESKTOP_MEDIA_MANAGER_CONTEXT = new UmbContextToken<UmbraDesktopMediaManagerContext>('UmbraDesktopMediaManagerContext');

export { UmbraDesktopMediaManagerContext as api };
