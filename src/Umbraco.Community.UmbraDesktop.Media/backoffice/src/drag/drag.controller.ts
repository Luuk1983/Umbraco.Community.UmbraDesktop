import { onMac } from '../platform-keys.js';
import { itemAt } from '../selection/item-at.js';
import { renderedItems } from '../selection/rendered-items.js';
import { itemSelector, writeViewStyle } from '../manager/open-item.js';
import { split } from '../operations/rules.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../operations/media-api.js';
import type { UmbraDesktopOperationResult } from '../operations/engine.js';
import type { UmbraDesktopHostedCollection } from '../manager/folder-host.element.js';
import { decodeDrag, draggedKeys, encodeDrag, isCopyDrag, UMBRADESKTOP_MEDIA_DRAG_TYPE } from './drag-session.js';
import { dropLabel } from './label.js';
import type { UmbraDesktopDropPlan, UmbraDesktopLabelLine } from './label.js';
import { targetAt, treeKeys } from './targets.js';
import { clearTarget, lightTarget } from './light.js';
import type { UmbraDesktopDragWindow, UmbraDesktopDropTarget } from './targets.js';
import { buildDragImage, DRAG_IMAGE_SIZE } from './drag-image.js';
import { UmbraDesktopHoverExpand } from './hover-expand.js';

/**
 * Dragging media between manager windows (design §4, plan tasks 5.6 to 5.9): onto another window's
 * folder, a folder card, a tree folder or the recycle bin, Ctrl (Option on a Mac) to copy, out of the
 * recycle bin to restore.
 *
 * One controller for the desktop, started by the add-on's desktop context, listening at the document
 * in the capture phase: a drag starts in one window and ends in another, which no single window sees
 * whole. Drags it did not start (files from the OS, links from elsewhere) are left to core.
 */

/** A manager window, as the drag works with it. Each window registers one with the desktop context. */
export interface UmbraDesktopDragWindowHandle extends UmbraDesktopDragWindow {
  /** The folder host: core's collection, its views and selection. */
  folder(): (Element & { collection(): UmbraDesktopHostedCollection | undefined }) | undefined;
  /** The tree host. */
  tree(): Element | undefined;
  /**
   * Draw the window's folder area as a target, refused, or neither.
   * @param state The state.
   */
  setDrop(state: 'target' | 'refused' | undefined): void;
  /**
   * Draw the label under the pointer, or hide it.
   * @param label What it says and where, in viewport coordinates.
   */
  setLabel(label: { lines: UmbraDesktopLabelLine[]; refused: boolean; x: number; y: number } | undefined): void;
  /** Bring the window forward. */
  raise(): void;
  /**
   * Select items once the window shows them, and bring them into view.
   * @param keys Their keys.
   */
  selectWhenShown(keys: string[]): void;
  /**
   * Work into a folder started: show it in the window's tree (`tree/arrival.ts`).
   * @param destination The folder, null for the root.
   * @returns Call when it is done.
   */
  arriving?(destination: string | null): () => void;
  /**
   * Work into a folder is done: show what arrived in the window's tree.
   * @param destination The folder, null for the root.
   * @param folders The keys of the folders that arrived in it, which the tree shows.
   */
  landed?(destination: string | null, folders: string[]): void;
}

/** What the drag asks of the desktop context. */
export interface UmbraDesktopDragOperations {
  /** The server, for what the dragged items and the targets are. */
  api: UmbraDesktopMediaApi;
  /** Move items into a folder, null for the root. */
  move(items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null): Promise<UmbraDesktopOperationResult>;
  /** Copy items into a folder. */
  copyTo(items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null): Promise<UmbraDesktopOperationResult>;
  /** Move items to the recycle bin. */
  trash(items: ReadonlyArray<UmbraDesktopMediaRef>): Promise<UmbraDesktopOperationResult>;
  /** Restore items from the recycle bin into a folder. */
  restore(items: ReadonlyArray<UmbraDesktopMediaRef>, target: string | null): Promise<UmbraDesktopOperationResult>;
}

/** The id of the style the dragged items are faded with, in core's views. */
const DRAGGING_STYLE = 'umbradesktop-media-dragging';

/** A folder, as a target: its name, the types it allows and the folders it is inside. */
interface UmbraDesktopTargetInfo {
  name: string;
  allowed?: ReadonlySet<string>;
  ancestors: string[];
}

/** What letting go would do now. */
interface UmbraDesktopDropNow extends UmbraDesktopDropPlan {
  /** Where. */
  target: string;
  /** The folder's key, null for the root; undefined for the bin. */
  unique?: string | null;
  /** The items that would go. */
  items: UmbraDesktopMediaRef[];
}

/** The drag controller. */
export class UmbraDesktopMediaDragController {
  /** What the drag asks of the desktop context. */
  #ops: UmbraDesktopDragOperations;

  /** The manager windows open. */
  #windows: () => ReadonlyArray<UmbraDesktopDragWindowHandle>;

  /** Whether this is a Mac, where Option copies. */
  #mac: boolean;

  /** The drag under way, when it is ours. */
  #session?: { keys: string[]; fromBin: boolean; copy: boolean };

  /** What the server said each item is, as far as known. */
  #refs = new Map<string, UmbraDesktopMediaRef>();

  /** The items being read now, so each is asked for once. */
  #reading = new Map<string, Promise<void>>();

  /** What each target folder is, by key ('' for the root), or a promise while it is being read. */
  #targets = new Map<string, UmbraDesktopTargetInfo | Promise<void>>();

  /** What the last `dragover` drew, so a move of the pointer redraws only the label. */
  #drawn?: { signature: string; target?: UmbraDesktopDropTarget<UmbraDesktopDragWindowHandle> };

  /** Opens tree folders a drag rests on. */
  #expand = new UmbraDesktopHoverExpand();

  /** The row or card made draggable for the press under way; see {@link #onPointerDown}. */
  #row?: Element;

  /**
   * @param ops What the drag asks of the desktop context.
   * @param windows The manager windows open.
   * @param mac Whether this is a Mac; read from the platform unless a test says.
   */
  constructor(ops: UmbraDesktopDragOperations, windows: () => ReadonlyArray<UmbraDesktopDragWindowHandle>, mac = onMac()) {
    this.#ops = ops;
    this.#windows = windows;
    this.#mac = mac;
  }

  /** Listen at the document. */
  start(): void {
    document.addEventListener('pointerdown', this.#onPointerDown, true);
    document.addEventListener('pointerup', this.#onPointerUp, true);
    document.addEventListener('dragstart', this.#onDragStart, true);
    document.addEventListener('dragover', this.#onDragOver, true);
    document.addEventListener('drop', this.#onDrop, true);
    document.addEventListener('dragend', this.#onDragEnd, true);
  }

  /** Stop listening, and clear anything a drag left drawn. */
  stop(): void {
    document.removeEventListener('pointerdown', this.#onPointerDown, true);
    document.removeEventListener('pointerup', this.#onPointerUp, true);
    document.removeEventListener('dragstart', this.#onDragStart, true);
    document.removeEventListener('dragover', this.#onDragOver, true);
    document.removeEventListener('drop', this.#onDrop, true);
    document.removeEventListener('dragend', this.#onDragEnd, true);
    this.#end();
  }

  /**
   * A press on an item the browser would not drag by itself: make it draggable for this press. Only
   * links drag on their own, and core draws two items without one: a table row anywhere but its name
   * (hosting spike, "Dragging between windows"), and a card once anything is selected, when core takes
   * the card's link away for select-only clicks, so a selection could not be dragged at all (owner's
   * test, 2026-10-19). A tree folder is dragged by uui's link, which a press on its name or icon now
   * reaches (`tree/current-folder.ts`).
   * @param event The press.
   */
  #onPointerDown = (event: PointerEvent): void => {
    const path = event.composedPath();
    const window = this.#windows().find((each) => path.includes(each.element));
    if (!window) return;
    for (const node of path) {
      if (node === window.element) return;
      if (node instanceof HTMLAnchorElement) return;
      if (!(node instanceof Element)) continue;
      const row = node.tagName === 'UUI-TABLE-ROW' && !!node.getAttribute('data-sortable-id');
      const card = node.tagName === 'UMB-ENTITY-COLLECTION-ITEM-CARD' && !!itemAt([node]);
      if (row || card) {
        node.setAttribute('draggable', 'true');
        this.#row = node;
        return;
      }
    }
  };

  /** The press ended without a drag: the row goes back to how core drew it. */
  #onPointerUp = (): void => {
    if (!this.#session) this.#releaseRow();
  };

  /** Make a row core's own again. */
  #releaseRow(): void {
    this.#row?.removeAttribute('draggable');
    this.#row = undefined;
  }

  /**
   * A drag starts. Ours when it starts on an item in a manager window: it carries the selection when
   * the item is selected, the item alone otherwise.
   * @param event The drag's start.
   */
  #onDragStart = (event: DragEvent): void => {
    const path = event.composedPath();
    const window = this.#windows().find((each) => path.includes(each.element));
    if (!window) return;
    const item = itemAt(path, window.element);
    if (!item) return;
    // Core's selection keeps keys of items that have since gone (moved out by a drop, say), so only
    // what the window still draws is carried.
    const folder = window.folder();
    const shown = new Set(folder ? renderedItems(folder).map((each) => each.unique) : []);
    const selection = (folder?.collection()?.selection.getSelection() ?? []).filter((each): each is string => !!each && shown.has(each));
    const keys = draggedKeys(item.unique, selection);
    const fromBin = window.place().kind === 'bin';
    // The browser has already put the item's link on the drag, since core's cards are links, and
    // Chrome offers a link dragged to the edge of its window as a split view. Ours carries keys only.
    event.dataTransfer?.clearData();
    event.dataTransfer?.setData(UMBRADESKTOP_MEDIA_DRAG_TYPE, encodeDrag({ keys, fromBin }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
    this.#setDragImage(event, path, keys.length);
    // What the last drag read is out of date once it dropped: items moved, folders filled.
    this.#refs.clear();
    this.#targets.clear();
    this.#reading.clear();
    this.#session = { keys, fromBin, copy: false };
    this.#fade(true);
    void this.#learn(keys);
  };

  /**
   * Hand the browser our picture of the drag.
   * @param event The drag's start.
   * @param path Its composed path.
   * @param count How many items.
   */
  #setDragImage(event: DragEvent, path: ReadonlyArray<EventTarget>, count: number): void {
    if (!event.dataTransfer?.setDragImage) return;
    const card = path.find((node) => node instanceof Element && (node.tagName === 'UMB-ENTITY-COLLECTION-ITEM-CARD' || node.tagName === 'UUI-TABLE-ROW')) as Element | undefined;
    const thumbnail = card ? deepImage(card) : undefined;
    const image = buildDragImage(count, thumbnail);
    try {
      event.dataTransfer.setDragImage(image, DRAG_IMAGE_SIZE / 2, DRAG_IMAGE_SIZE / 2);
    } finally {
      window.setTimeout(() => image.remove());
    }
  }

  /**
   * Read what the dragged items are, and every card and tree item the drag might land on, in one
   * request per window, so the drag knows which are folders.
   * @param keys The dragged items.
   */
  async #learn(keys: string[]): Promise<void> {
    const wanted = new Set(keys);
    for (const window of this.#windows()) {
      const folder = window.folder();
      if (folder) for (const item of renderedItems(folder)) wanted.add(item.unique);
      const tree = window.tree();
      if (tree) for (const key of treeKeys(tree)) wanted.add(key);
    }
    await this.#learnKeys([...wanted]);
  }

  /**
   * Read what items are, once each: a key already read, or being read, is not asked for again.
   * @param keys The items.
   */
  async #learnKeys(keys: ReadonlyArray<string>): Promise<void> {
    const unknown = keys.filter((key) => !this.#refs.has(key) && !this.#reading.has(key));
    const pending = keys.map((key) => this.#reading.get(key)).filter((each): each is Promise<void> => !!each);
    if (unknown.length) {
      const reading = this.#ops.api.items(unknown).then(({ data }) => {
        for (const ref of data ?? []) this.#refs.set(ref.unique, ref);
        for (const key of unknown) this.#reading.delete(key);
      });
      for (const key of unknown) this.#reading.set(key, reading);
      pending.push(reading);
    }
    await Promise.all(pending);
  }

  /**
   * The items under the pointer the drag has not read yet: a tree folder that opened during the drag,
   * say. Until it is read, a drop there cannot tell whether it is a folder.
   * @param path The event's composed path.
   * @returns Their keys.
   */
  #unknownIn(path: ReadonlyArray<EventTarget>): string[] {
    const window = this.#windows().find((each) => path.includes(each.element));
    if (!window) return [];
    const keys: string[] = [];
    for (const node of path) {
      if (node === window.element) break;
      if (!(node instanceof Element)) continue;
      const key = itemAt([node])?.unique;
      if (key && !this.#refs.has(key)) keys.push(key);
    }
    return keys;
  }

  /**
   * The pointer moves during a drag: find the one target under it, say what letting go would do, and
   * accept the drop where something would go. Our drag is kept from core's own dropzone, which takes
   * drops of files.
   * @param event The move.
   */
  #onDragOver = (event: DragEvent): void => {
    const session = this.#session;
    if (!session) return;
    event.stopPropagation();
    const copy = isCopyDrag(event, this.#mac);
    if (copy !== session.copy) {
      session.copy = copy;
      this.#fade(!copy);
    }
    const path = event.composedPath();
    const unknown = this.#unknownIn(path);
    if (unknown.length) void this.#learnKeys(unknown);
    const target = targetAt(path, this.#windows(), (unique) => this.#refs.get(unique)?.isFolder);
    const now = this.#plan(target);
    this.#draw(target, now, event);
    this.#expand.over(target?.kind === 'folder' && target.via === 'tree' ? target.element : undefined);
    if (!now || now.going === 0) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = now.kind === 'copy' ? 'copy' : 'move';
  };

  /**
   * Let go: do what the label said, bring the window forward, and select what arrived.
   * @param event The drop.
   */
  #onDrop = (event: DragEvent): void => {
    const session = this.#session;
    if (!session) return;
    const payload = decodeDrag(event.dataTransfer?.getData(UMBRADESKTOP_MEDIA_DRAG_TYPE) ?? '');
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    session.copy = isCopyDrag(event, this.#mac);
    // Read while the event is being sent: the browser empties the path once it has been.
    const path = event.composedPath();
    this.#end();
    void this.#dropAt(path, session);
  };

  /**
   * Work out where a drop landed and carry it out. An item under the pointer the drag has not read
   * yet is read first: taken as no folder, a drop on a tree folder that opened during the drag would
   * land in the Media root around it, which a real check did.
   * @param path The drop's composed path.
   * @param session The drag.
   */
  async #dropAt(path: ReadonlyArray<EventTarget>, session: { keys: string[]; fromBin: boolean; copy: boolean }): Promise<void> {
    const unknown = [...this.#unknownIn(path), ...session.keys.filter((key) => !this.#refs.has(key))];
    if (unknown.length) await this.#learnKeys(unknown);
    const target = targetAt(path, this.#windows(), (unique) => this.#refs.get(unique)?.isFolder);
    const now = this.#plan(target, session);
    if (!target || !now || !now.going) return;
    await this.#carryOut(target, now);
  }

  /**
   * Do it.
   * @param target Where.
   * @param now What.
   */
  async #carryOut(target: UmbraDesktopDropTarget<UmbraDesktopDragWindowHandle>, now: UmbraDesktopDropNow): Promise<void> {
    const destination = now.unique ?? null;
    const intoFolder = now.kind !== 'trash';
    const done = intoFolder ? target.window.arriving?.(destination) : undefined;
    let result;
    try {
      result =
        now.kind === 'trash'
          ? await this.#ops.trash(now.items)
          : now.kind === 'restore'
            ? await this.#ops.restore(now.items, destination)
            : now.kind === 'copy'
              ? await this.#ops.copyTo(now.items, destination)
              : await this.#ops.move(now.items, destination);
    } finally {
      done?.();
    }
    if (intoFolder) {
      const folders = result.succeeded
        .filter((each) => each.item.isFolder)
        .map((each) => (now.kind === 'copy' ? each.created?.[0] : each.item.unique))
        .filter((each): each is string => !!each);
      target.window.landed?.(destination, folders);
    }
    target.window.raise();
    if (target.kind !== 'window') return;
    const arrived = result.succeeded.flatMap((each) => (now.kind === 'copy' ? (each.created ?? []) : [each.item.unique]));
    if (arrived.length) target.window.selectWhenShown(arrived);
  }

  /** The drag ended, dropped or not: clear everything it drew. */
  #onDragEnd = (): void => {
    this.#end();
  };

  /** Forget the drag and clear what it drew. */
  #end(): void {
    this.#session = undefined;
    this.#expand.cancel();
    this.#releaseRow();
    this.#draw(undefined, undefined);
    this.#fade(false);
  }

  /**
   * What letting go over a target would do now.
   * @param target The target under the pointer.
   * @param session The drag; the one under way unless a drop already ended it.
   * @returns The plan, or undefined when it is no target: none, the bin for items out of the bin, or a
   * move into the folder the items are already in.
   */
  #plan(
    target: UmbraDesktopDropTarget<UmbraDesktopDragWindowHandle> | undefined,
    session = this.#session,
  ): UmbraDesktopDropNow | undefined {
    if (!session || !target) return undefined;
    const items = session.keys.map((key) => this.#refs.get(key)).filter((each): each is UmbraDesktopMediaRef => !!each);
    const known = items.length === session.keys.length;
    if (target.kind === 'bin') {
      if (session.fromBin) return undefined;
      return { kind: 'trash', target: '', total: session.keys.length, going: session.keys.length, items };
    }
    const unique = target.unique;
    const kind = session.fromBin ? 'restore' : session.copy ? 'copy' : 'move';
    const info = this.#info(unique);
    const name = info?.name ?? (unique ? this.#refs.get(unique)?.name ?? '' : '#sections_media');
    if (!known || !info) return { kind, target: name, unique, total: session.keys.length, going: session.keys.length, items };
    const { allowed, refused } = split(items, { unique, ancestors: info.ancestors }, info.allowed, kind === 'move' ? 'move' : 'copy');
    const there = refused.filter((each) => each.reason === 'there').length;
    if (kind === 'move' && there === items.length) return undefined;
    const blocked = refused.find((each) => each.reason !== 'there');
    return {
      kind,
      target: name,
      unique,
      total: items.length - there,
      going: allowed.length,
      items: allowed,
      notGoing: blocked
        ? { name: blocked.item.name, reason: blocked.reason === 'type' ? '#umbraDesktopMedia_refusedType' : '#umbraDesktopMedia_refusedSelf' }
        : undefined,
    };
  }

  /**
   * What a target folder is, read once and kept: its name, what it allows and where it is.
   * @param unique The folder, null for the root.
   * @returns What it is, or undefined while it is being read.
   */
  #info(unique: string | null): UmbraDesktopTargetInfo | undefined {
    const key = unique ?? '';
    const known = this.#targets.get(key);
    if (known && !(known instanceof Promise)) return known;
    if (!known) this.#targets.set(key, this.#read(unique));
    return undefined;
  }

  /**
   * Read a target folder from the server.
   * @param unique The folder, null for the root.
   */
  async #read(unique: string | null): Promise<void> {
    const api = this.#ops.api;
    let name = '#sections_media';
    let type: string | null = null;
    const ancestors: string[] = [];
    if (unique) {
      const folder = (await api.item(unique)).data;
      name = folder?.name ?? '';
      type = folder?.mediaType ?? null;
      for (let parent = folder?.parent ?? null, guard = 0; parent && guard < 100; guard++) {
        ancestors.push(parent);
        parent = (await api.item(parent)).data?.parent ?? null;
      }
    }
    const allowed = await api.allowedTypes(type, unique);
    this.#targets.set(unique ?? '', { name, ancestors, allowed: allowed.data ? new Set(allowed.data) : undefined });
  }

  /**
   * Draw the drag: the target lit or outlined, red when refused, and the label under the pointer.
   * Redraws the target only when it changed; the label follows the pointer every time.
   * @param target The target, or undefined to clear.
   * @param now What letting go would do.
   * @param event Where the pointer is.
   */
  #draw(target: UmbraDesktopDropTarget<UmbraDesktopDragWindowHandle> | undefined, now: UmbraDesktopDropNow | undefined, event?: DragEvent): void {
    const label = now ? dropLabel(now, this.#mac) : undefined;
    const signature = target && now ? `${target.kind}|${'unique' in target ? target.unique : ''}|${label?.refused}|${JSON.stringify(label?.lines)}|${windowIndex(this.#windows(), target.window)}` : '';
    if (this.#drawn?.signature !== signature) {
      this.#clearDrawn();
      if (target && now && label) lightTarget(target, label.refused);
      this.#drawn = signature ? { signature, target } : undefined;
    }
    const over = target && now && label ? target.window : undefined;
    for (const window of this.#windows()) {
      if (window !== over) window.setLabel(undefined);
    }
    if (over && label && event) over.setLabel({ ...label, x: event.clientX, y: event.clientY });
  }

  /** Take down what the last target drew. */
  #clearDrawn(): void {
    const target = this.#drawn?.target;
    if (target) clearTarget(target.window);
  }

  /**
   * Fade the dragged items in every window while they are being moved, as their place is about to
   * empty; a copy leaves them as they are (design §4).
   * @param on Whether to fade.
   */
  #fade(on: boolean): void {
    const keys = on && this.#session && !this.#session.copy ? this.#session.keys : [];
    const css = keys.length ? `${keys.map(itemSelector).join(',\n')} { opacity: 0.5; }` : '';
    for (const window of this.#windows()) {
      const folder = window.folder();
      if (folder) writeViewStyle(folder, DRAGGING_STYLE, css);
    }
  }
}

/**
 * Where a window is in the list, for a signature that tells two windows apart.
 * @param windows The windows.
 * @param window One of them.
 * @returns Its index.
 */
function windowIndex(windows: ReadonlyArray<UmbraDesktopDragWindowHandle>, window: UmbraDesktopDragWindowHandle): number {
  return windows.findIndex((each) => each === window);
}

/**
 * The first picture inside an element, through shadow roots: a card's thumbnail.
 * @param root The card or row.
 * @returns Its address, or undefined.
 */
function deepImage(root: Element): string | undefined {
  const queue: ParentNode[] = [root.shadowRoot ?? root, root];
  while (queue.length) {
    const node = queue.shift()!;
    const image = node.querySelector('img');
    if (image?.currentSrc || image?.src) return image.currentSrc || image.src;
    for (const element of node.querySelectorAll('*')) if (element.shadowRoot) queue.push(element.shadowRoot);
  }
  return undefined;
}
