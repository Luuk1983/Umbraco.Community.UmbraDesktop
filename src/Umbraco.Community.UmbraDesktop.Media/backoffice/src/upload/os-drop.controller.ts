import type { UmbFileDropzoneDroppedItems } from '@umbraco-cms/backoffice/dropzone';
import { itemAt } from '../selection/item-at.js';
import { renderedItems } from '../selection/rendered-items.js';
import { targetAt, treeKeys } from '../drag/targets.js';
import type { UmbraDesktopDropTarget } from '../drag/targets.js';
import { clearTarget, lightTarget } from '../drag/light.js';
import { UMBRADESKTOP_MEDIA_DRAG_TYPE } from '../drag/drag-session.js';
import type { UmbraDesktopDragWindowHandle } from '../drag/drag.controller.js';
import type { UmbraDesktopMediaApi } from '../operations/media-api.js';
import { takeDropped } from './folder-entries.js';
import { UmbraDesktopHoverExpand } from '../drag/hover-expand.js';

/**
 * Files and folders from the OS dropped on a manager window (design §6, plan task 6.7).
 *
 * Core's dropzone in the window takes a drop on the folder the window shows, and draws its own
 * placeholders; that stays core's. What this adds is what core's cannot: a label naming the folder the
 * files will land in, since the OS's own drag label cannot, and a drop onto a folder card or a tree
 * folder uploading into that folder. The recycle bin refuses.
 *
 * During an OS file drag core lays its dropzone's overlay over the whole window, tree included, so the
 * drop's own target is always the overlay (measured 2026-10-18). What is under the pointer is found by
 * hit-testing beneath it instead.
 */

/** What the controller asks of the desktop context. */
export interface UmbraDesktopOsDropOperations {
  /** The server, for which items are folders and what they are called. */
  api: UmbraDesktopMediaApi;
  /**
   * Upload into a folder, and show it.
   * @param items The files and folders.
   * @param parent The folder, null for the root.
   */
  upload(items: UmbFileDropzoneDroppedItems, parent: string | null): Promise<void>;
}

/**
 * How long after the last `dragover` the label is taken down: an OS drag that leaves the page sends no
 * `dragend` to it, and `dragleave` fires between every two elements.
 */
const LEAVE_MS = 300;

/** Core's media dropzone: its overlay is looked beneath, never at. */
const OVERLAY = 'UMB-DROPZONE-MEDIA';

/** The label's word for a refused target. */
const REFUSED_BIN = 'umbraDesktopMedia_uploadNotToBin';

/** The OS drop controller. */
export class UmbraDesktopMediaOsDropController {
  /** What it asks of the desktop context. */
  #ops: UmbraDesktopOsDropOperations;

  /** The manager windows open. */
  #windows: () => ReadonlyArray<UmbraDesktopDragWindowHandle>;

  /** Which items are folders, and their names, as far as read. */
  #refs = new Map<string, { name: string; isFolder: boolean }>();

  /** The keys being read now, so each is asked for once. */
  #reading = new Set<string>();

  /** The window and target the label was last drawn for. */
  #drawn?: { window: UmbraDesktopDragWindowHandle; signature: string };

  /** Takes the label down once the files have left; see {@link LEAVE_MS}. */
  #leaveTimer?: number;

  /** Opens closed tree folders the files rest on, as for a drag of items, to reach a folder deeper down. */
  #expand = new UmbraDesktopHoverExpand();

  /** Whether the controller is sending core its reset, which it must not take for a drop itself. */
  #resetting = false;

  /**
   * @param ops What it asks of the desktop context.
   * @param windows The manager windows open.
   */
  constructor(ops: UmbraDesktopOsDropOperations, windows: () => ReadonlyArray<UmbraDesktopDragWindowHandle>) {
    this.#ops = ops;
    this.#windows = windows;
  }

  /** Listen at the document, ahead of core's dropzone. */
  start(): void {
    document.addEventListener('dragover', this.#onDragOver, true);
    document.addEventListener('drop', this.#onDrop, true);
  }

  /** Stop listening, and take down anything drawn. */
  stop(): void {
    document.removeEventListener('dragover', this.#onDragOver, true);
    document.removeEventListener('drop', this.#onDrop, true);
    this.#clear();
  }

  /**
   * Files from the OS over the page: find the target under the pointer and say where they would go.
   * The drop is accepted here only on a target of ours; over the window's own folder area core's
   * dropzone accepts it.
   * @param event The move.
   */
  #onDragOver = (event: DragEvent): void => {
    if (!isOsFileDrag(event)) return;
    const path = pathAt(event.clientX, event.clientY);
    this.#learn(path);
    const target = targetAt(path, this.#windows(), (unique) => this.#refs.get(unique)?.isFolder);
    this.#draw(target, event);
    this.#expand.over(target?.kind === 'folder' && target.via === 'tree' ? target.element : undefined);
    window.clearTimeout(this.#leaveTimer);
    this.#leaveTimer = window.setTimeout(() => this.#clear(), LEAVE_MS);
    if (target && target.kind !== 'window') event.preventDefault();
  };

  /**
   * Files from the OS let go: on a folder card or tree folder they upload there, on the recycle bin
   * nothing happens, and on the window's folder area core's dropzone takes them.
   * @param event The drop.
   */
  #onDrop = (event: DragEvent): void => {
    if (this.#resetting || !isOsFileDrag(event)) return;
    const path = pathAt(event.clientX, event.clientY);
    const target = targetAt(path, this.#windows(), (unique) => this.#refs.get(unique)?.isFolder);
    this.#clear();
    if (!target || target.kind === 'window') return;
    // Ours: core's overlay must not upload into the folder the window shows as well, and the browser
    // must not open the file in place of the backoffice, which it does with a drop nobody takes.
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#resetCore();
    if (target.kind === 'bin' || !event.dataTransfer) return;
    // Read now: the browser empties the drop's data once the event has been sent.
    const read = takeDropped(event.dataTransfer);
    const parent = target.unique;
    void read().then((items) => this.#ops.upload(items, parent));
  };

  /**
   * Tell core's dropzones the drag is over, as the drop they did not get would have: each counts the
   * drag in and out at the document, and would otherwise keep its overlay up for the next drag.
   */
  #resetCore(): void {
    this.#resetting = true;
    try {
      document.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
    } finally {
      this.#resetting = false;
    }
  }

  /**
   * Read which items under the pointer and in the windows are folders, and what the folders the
   * windows show are called, once each.
   * @param path What is under the pointer.
   */
  #learn(path: ReadonlyArray<EventTarget>): void {
    const wanted = new Set<string>();
    for (const node of path) {
      const key = node instanceof Element ? itemAt([node])?.unique : undefined;
      if (key) wanted.add(key);
    }
    for (const window of this.#windows()) {
      const place = window.place();
      if (place.kind === 'folder') wanted.add(place.unique);
      const folder = window.folder();
      if (folder) for (const item of renderedItems(folder)) wanted.add(item.unique);
      const tree = window.tree();
      if (tree) for (const key of treeKeys(tree)) wanted.add(key);
    }
    const unknown = [...wanted].filter((key) => !this.#refs.has(key) && !this.#reading.has(key));
    if (!unknown.length) return;
    for (const key of unknown) this.#reading.add(key);
    void this.#ops.api.items(unknown).then(({ data }) => {
      for (const ref of data ?? []) this.#refs.set(ref.unique, { name: ref.name, isFolder: ref.isFolder });
      for (const key of unknown) this.#reading.delete(key);
    });
  }

  /**
   * Draw the label in the window under the pointer, and light a folder card or tree folder.
   * @param target The target, or undefined outside every manager window.
   * @param event Where the pointer is.
   */
  #draw(target: UmbraDesktopDropTarget<UmbraDesktopDragWindowHandle> | undefined, event: DragEvent): void {
    if (!target) {
      this.#clear();
      return;
    }
    const refused = target.kind === 'bin';
    const name = this.#name(target);
    const lines = refused ? [{ key: REFUSED_BIN, args: [] }] : name === undefined ? [] : [{ key: 'umbraDesktopMedia_uploadTo', args: [name] }];
    const signature = `${target.kind}|${'unique' in target ? target.unique : ''}|${'via' in target ? target.via : ''}|${lines.length}`;
    if (this.#drawn?.window !== target.window || this.#drawn.signature !== signature) {
      this.#clear();
      // The window's own folder area is drawn by core's overlay; only a target of ours is lit.
      if (target.kind !== 'window') lightTarget(target, refused);
      this.#drawn = { window: target.window, signature };
    }
    if (lines.length) target.window.setLabel({ lines, refused, x: event.clientX, y: event.clientY });
  }

  /**
   * What a target folder is called.
   * @param target The target.
   * @returns Its name, Media's own key for the root, or undefined while it is being read.
   */
  #name(target: UmbraDesktopDropTarget<UmbraDesktopDragWindowHandle>): string | undefined {
    if (target.kind === 'bin') return '';
    if (target.unique === null) return '#sections_media';
    return this.#refs.get(target.unique)?.name;
  }

  /** Take down the label and whatever is lit. */
  #clear(): void {
    window.clearTimeout(this.#leaveTimer);
    this.#leaveTimer = undefined;
    const drawn = this.#drawn;
    if (drawn) this.#expand.cancel();
    this.#drawn = undefined;
    if (!drawn) return;
    drawn.window.setLabel(undefined);
    clearTarget(drawn.window);
  }
}

/**
 * Whether a drag carries files from the OS, rather than the manager's own items (which may carry a
 * file too, as a dragged picture does).
 * @param event The drag event.
 * @returns True for files from the OS.
 */
function isOsFileDrag(event: DragEvent): boolean {
  const types = [...(event.dataTransfer?.types ?? [])].map((type) => type.toLowerCase());
  return types.includes('files') && !types.includes(UMBRADESKTOP_MEDIA_DRAG_TYPE);
}

/**
 * What is under a point, innermost first, as a composed path would list it, looking beneath core's
 * dropzone overlay. Each tree of the page is asked for its topmost element at the point and the search
 * goes into that element's shadow root; where a shadow root, or any below it, has nothing at the point
 * but core's overlay, the overlay is what put its host on top, and the next element down is tried.
 * @param x The point, in viewport coordinates.
 * @param y The point.
 * @returns The path.
 */
export function pathAt(x: number, y: number): EventTarget[] {
  const hit = deepestAt(document, x, y).element;
  const path: EventTarget[] = [];
  for (let node: Node | null = hit ?? null; node; ) {
    path.push(node);
    node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
  }
  return path;
}

/**
 * The deepest element at a point in one tree and the shadow roots below it.
 * @param root The tree.
 * @param x The point.
 * @param y The point.
 * @returns The element, and whether the tree held nothing at the point but core's overlay.
 */
function deepestAt(root: Document | ShadowRoot, x: number, y: number): { element?: Element; overlayOnly: boolean } {
  let sawOverlay = false;
  for (const element of root.elementsFromPoint(x, y)) {
    if (element.getRootNode() !== root) continue;
    if (element.tagName === OVERLAY) {
      sawOverlay = true;
      continue;
    }
    if (!element.shadowRoot) return { element, overlayOnly: false };
    const inner = deepestAt(element.shadowRoot, x, y);
    if (inner.element) return inner;
    if (!inner.overlayOnly) return { element, overlayOnly: false };
    // Only core's overlay, however deep: this element is on top here because of it.
    sawOverlay = true;
  }
  return { overlayOnly: sawOverlay };
}
