import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHostElement } from '@umbraco-cms/backoffice/controller-api';
import { hasPrimaryModifier, onMac } from '../platform-keys.js';
import type { UmbraDesktopHostedCollection } from '../manager/folder-host.element.js';
import { itemAt } from './item-at.js';
import { keyIntent } from './keys.js';
import { neighbour } from './neighbour.js';
import { rangeBetween } from './range.js';
import { boxBetween, intersecting } from './box.js';
import type { UmbraDesktopPoint } from './box.js';
import { typeAhead } from './typeahead.js';
import type { UmbraDesktopTypeAheadState } from './typeahead.js';
import { renderedItems } from './rendered-items.js';
import type { UmbraDesktopRenderedItem } from './rendered-items.js';
import type { UmbraDesktopMediaSelectionBoxElement } from './box.element.js';

/** Core's bulk Trash action for media, whose button in core's selection bar Delete presses. */
const CORE_BULK_TRASH = 'Umb.EntityBulkAction.Media.Trash';

/** How far a press must move before it is a box rather than a click. */
const BOX_THRESHOLD = 4;

/** Elements a press on starts no box: core's own controls and fields. */
const CONTROLS = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|UUI-BUTTON|UUI-CHECKBOX|UUI-INPUT|UUI-TOGGLE|UUI-SELECT|UUI-PAGINATION|UUI-TABLE-HEAD|UUI-TABLE-HEAD-CELL)$/;

/** What the controller needs of the manager window it works in. */
export interface UmbraDesktopSelectionWindow {
  /** The folder host core's collection is drawn in, once there is one. */
  folder(): (Element & { collection(): UmbraDesktopHostedCollection | undefined }) | undefined;
  /** The element the box is drawn in. */
  box(): UmbraDesktopMediaSelectionBoxElement | undefined;
  /**
   * Open an item, as a click on it would.
   * @param unique Its key.
   */
  open(unique: string): void;
  /**
   * Rename an item.
   * @param unique Its key.
   */
  rename(unique: string): void;
  /** Whether Delete may trash here: not in the recycle bin. */
  canTrash(): boolean;
  /**
   * Hold items for a paste.
   * @param mode Cut or copy.
   * @param uniques Their keys.
   */
  hold(mode: 'cut' | 'copy', uniques: string[]): void;
  /** Paste what is held into the window's folder. */
  paste(): void;
  /** The window's tree, whose keys are its own: the window reads them, never the view's selection. */
  tree?(): Element | undefined;
  /** Undo the last move, copy, rename or trash. */
  undo(): void;
  /**
   * Empty a cut, as Esc does once nothing is selected.
   * @returns True when there was a cut to empty.
   */
  emptyCut(): boolean;
}

/**
 * Selecting in a manager window, on top of core's collection (design §3, plan phase 3): Ctrl or
 * Cmd+click, Shift+click ranges, the arrow keys, Space, Enter, F2, Delete, type-ahead and the
 * selection box.
 *
 * Core keeps the selection; this only ever writes it through core's selection manager, never a copy.
 * Core turns the collection select-only once anything is selected, so a plain click selects then and
 * opens nothing, which is what decides the two meanings of Shift+click: with nothing selected it opens
 * the item as a window (design §8, handled by the manager's link rule), with a selection it extends
 * the range. The arrows move the focus and select nothing, so a click still opens afterwards.
 */
export class UmbraDesktopMediaSelectionController extends UmbControllerBase {
  /** The manager window element. */
  #element: UmbControllerHostElement;

  /** What the controller needs of its window. */
  #window: UmbraDesktopSelectionWindow;

  /** Whether this is a Mac, where Cmd is the modifier. */
  #mac = onMac();

  /** The item with the keyboard focus, which Space, Enter and F2 act on. */
  #cursor?: string;

  /** Where Shift ranges start: the item last clicked, toggled or moved to. */
  #anchor?: string;

  /** Whether anything was selected when the click under way began, read before core handled it. */
  #hadSelection = false;

  /** What has been typed ahead. */
  #typed: UmbraDesktopTypeAheadState = { buffer: '', at: 0 };

  /** The selection box under way, from the press until the pointer is let go. */
  #drag?: {
    pointerId: number;
    start: UmbraDesktopPoint;
    base: string[];
    items: UmbraDesktopRenderedItem[];
    moved: boolean;
    /** Whether Ctrl, Cmd or Shift was held at the press, which keeps the selection if it was a click. */
    keep: boolean;
  };

  /**
   * @param host The manager window element.
   * @param window What the controller needs of it.
   */
  constructor(host: UmbControllerHostElement, window: UmbraDesktopSelectionWindow) {
    super(host);
    this.#element = host;
    this.#window = window;
  }

  override hostConnected(): void {
    super.hostConnected();
    this.#element.addEventListener('click', this.#onClickCapture, true);
    this.#element.addEventListener('click', this.#onClick);
    this.#element.addEventListener('keydown', this.#onEnterCapture, true);
    this.#element.addEventListener('keydown', this.#onKeyDown);
    this.#element.addEventListener('pointerdown', this.#onPointerDown);
    this.#element.addEventListener('pointermove', this.#onPointerMove);
    this.#element.addEventListener('pointerup', this.#onPointerUp);
    this.#element.addEventListener('pointercancel', this.#onPointerUp);
  }

  override hostDisconnected(): void {
    super.hostDisconnected();
    this.#element.removeEventListener('click', this.#onClickCapture, true);
    this.#element.removeEventListener('click', this.#onClick);
    this.#element.removeEventListener('keydown', this.#onEnterCapture, true);
    this.#element.removeEventListener('keydown', this.#onKeyDown);
    this.#element.removeEventListener('pointerdown', this.#onPointerDown);
    this.#element.removeEventListener('pointermove', this.#onPointerMove);
    this.#element.removeEventListener('pointerup', this.#onPointerUp);
    this.#element.removeEventListener('pointercancel', this.#onPointerUp);
    this.#endDrag();
  }

  /** Core's collection in the window now. */
  #collection(): UmbraDesktopHostedCollection | undefined {
    return this.#window.folder()?.collection();
  }

  /** The keys selected now. */
  #selection(): string[] {
    return (this.#collection()?.selection.getSelection() ?? []).filter((each): each is string => !!each);
  }

  /** Every item's key, in the order core shows them. */
  #order(): string[] {
    const items = this.#collection()?.items() ?? [];
    if (items.length) return items.map((item) => item.unique);
    const folder = this.#window.folder();
    return folder ? renderedItems(folder).map((item) => item.unique) : [];
  }

  /**
   * Replace the selection, when it changes.
   * @param keys The keys to select.
   */
  #select(keys: string[]): void {
    const collection = this.#collection();
    if (!collection) return;
    const now = this.#selection();
    if (now.length === keys.length && now.every((each, i) => each === keys[i])) return;
    collection.selection.setSelection(keys);
  }

  /** Read, before core acts on a click, whether the collection was select-only. */
  #onClickCapture = (): void => {
    this.#hadSelection = this.#selection().length > 0;
  };

  /**
   * A click on an item: Ctrl or Cmd adds it while nothing is selected, Shift extends the range while
   * something is; a plain click only remembers where a range would start.
   * @param event The click.
   */
  #onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0) return;
    // Only core's collection selects. Core's tree items carry their item too, but a folder selected
    // from the tree is selected nowhere anyone can see; the manager reads a click there as a link.
    const path = event.composedPath();
    const folder = this.#window.folder();
    if (!folder || !path.includes(folder)) return;
    const item = itemAt(path, this.#element);
    if (!item) return;
    const primary = hasPrimaryModifier(event, this.#mac);
    if (primary && !this.#hadSelection) {
      event.preventDefault();
      event.stopPropagation();
      this.#collection()?.selection.select(item.unique);
      this.#anchor = this.#cursor = item.unique;
      return;
    }
    if (event.shiftKey && this.#hadSelection) {
      event.preventDefault();
      event.stopPropagation();
      const range = rangeBetween(this.#order(), this.#anchor, item.unique);
      this.#select([...new Set([...this.#selection(), ...range])]);
      this.#cursor = item.unique;
      return;
    }
    if (!event.shiftKey) this.#anchor = this.#cursor = item.unique;
  };

  /**
   * Enter opens the item it is pressed on, before core's card sees it: uui's selectable card takes
   * Enter, like Space, to toggle its selection, and cancels the key, where design §3 has Enter open.
   * Space is left to the card, which already does what the design asks of it. Only for a key pressed on
   * an item or on the window itself, so Enter on core's buttons and fields does what it always does.
   * @param event The key, in the capture phase.
   */
  #onEnterCapture = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    if (keyIntent(event, this.#mac)?.kind !== 'open') return;
    const path = event.composedPath();
    const item = itemAt(path, this.#element);
    if (!item && path[0] !== this.#element) return;
    const target = item?.unique ?? this.#cursor;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    this.#anchor = this.#cursor = target;
    this.#window.open(target);
  };

  /**
   * A key in the window.
   * @param event The key.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    // A key in the tree is about a tree folder, not what the view has selected: Delete there must not
    // trash the view's selection. The window handles the clipboard keys there itself.
    const tree = this.#window.tree?.();
    if (tree && event.composedPath().includes(tree)) return;
    if (this.#drag && event.key === 'Escape') {
      event.preventDefault();
      this.#select(this.#drag.base);
      this.#endDrag();
      return;
    }
    const intent = keyIntent(event, this.#mac);
    if (!intent) return;
    const collection = this.#collection();
    if (!collection) return;
    switch (intent.kind) {
      case 'move': {
        const folder = this.#window.folder();
        const items = folder ? renderedItems(folder) : [];
        const next = neighbour(items, this.#cursor, intent.direction);
        if (!next) return;
        event.preventDefault();
        const from = this.#cursor ?? next;
        if (intent.extend) {
          this.#anchor ??= from;
          this.#select(rangeBetween(this.#order(), this.#anchor, next));
        } else {
          this.#anchor = next;
        }
        this.#focus(next, items);
        return;
      }
      case 'toggle': {
        if (!this.#cursor) return;
        event.preventDefault();
        if (this.#selection().includes(this.#cursor)) collection.selection.deselect(this.#cursor);
        else collection.selection.select(this.#cursor);
        this.#anchor = this.#cursor;
        return;
      }
      case 'open':
        if (!this.#cursor) return;
        event.preventDefault();
        this.#window.open(this.#cursor);
        return;
      case 'rename': {
        const selected = this.#selection();
        const target = this.#cursor ?? (selected.length === 1 ? selected[0] : undefined);
        if (!target) return;
        event.preventDefault();
        this.#window.rename(target);
        return;
      }
      case 'trash':
        if (!this.#window.canTrash()) return;
        if (!this.#selection().length) {
          if (!this.#cursor) return;
          this.#select([this.#cursor]);
        }
        event.preventDefault();
        void this.#pressTrash();
        return;
      case 'select-all':
        event.preventDefault();
        this.#select(this.#order());
        return;
      case 'clear':
        if (this.#selection().length) {
          event.preventDefault();
          collection.selection.clearSelection();
        } else if (this.#window.emptyCut()) {
          event.preventDefault();
        }
        return;
      case 'cut':
      case 'copy': {
        const selected = this.#selection();
        const items = selected.length ? selected : this.#cursor ? [this.#cursor] : [];
        if (!items.length) return;
        event.preventDefault();
        this.#window.hold(intent.kind, items);
        return;
      }
      case 'undo':
        event.preventDefault();
        this.#window.undo();
        return;
      case 'paste':
        // Not cancelled: the browser then sends a paste event, the only way to read the OS clipboard,
        // and the window decides there what the paste brings.
        this.#window.paste();
        return;
      case 'type': {
        const result = typeAhead(this.#typed, intent.char, Date.now(), collection.items(), this.#cursor);
        this.#typed = result.state;
        if (result.match) this.#focus(result.match);
        return;
      }
    }
  };

  /**
   * Move the keyboard focus to an item, and bring it into view.
   * @param unique The item.
   * @param items The items drawn, when already read.
   */
  #focus(unique: string, items?: UmbraDesktopRenderedItem[]): void {
    this.#cursor = unique;
    const folder = this.#window.folder();
    const element = (items ?? (folder ? renderedItems(folder) : [])).find((item) => item.unique === unique)?.element;
    if (!element) return;
    element.focus();
    // Core's card is not focusable itself; the link or button inside it is.
    if (!element.matches(':focus, :focus-within')) deepFirst(element, 'a[href], button, [tabindex]')?.focus();
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * Put the keyboard focus back on the item that had it, as after the page beside the window took it.
   * @returns True when there was an item to focus.
   */
  refocus(): boolean {
    if (!this.#cursor) return false;
    this.#focus(this.#cursor);
    return true;
  }

  /**
   * Press core's own Trash in its selection bar, once core has drawn it for the selection, so the
   * trash is core's: its question, its relation check, its reload.
   */
  async #pressTrash(): Promise<void> {
    for (let tries = 0; tries < 20; tries++) {
      const folder = this.#window.folder();
      const action = folder ? findDeep(folder, (el) => (el as { manifest?: { alias?: string } }).manifest?.alias === CORE_BULK_TRASH) : undefined;
      const button = action ? deepFirst(action, 'button') : undefined;
      if (button) {
        button.click();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  /**
   * A press: on empty space among core's cards it may become a selection box.
   * @param event The press.
   */
  #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.#drag) return;
    const path = event.composedPath();
    if (itemAt(path, this.#element)) return;
    if (!onEmptySpace(path, this.#element)) return;
    // A press on a scrollbar is inside its element's box but outside its client area.
    const target = path[0];
    if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      const across = event.clientX - rect.left - target.clientLeft;
      const down = event.clientY - rect.top - target.clientTop;
      if (across > target.clientWidth || down > target.clientHeight) return;
    }
    const folder = this.#window.folder();
    if (!folder) return;
    this.#drag = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      base: hasPrimaryModifier(event, this.#mac) ? this.#selection() : [],
      items: renderedItems(folder),
      moved: false,
      keep: hasPrimaryModifier(event, this.#mac) || event.shiftKey,
    };
    // A drag across the window would select its text as well, core's upload list beneath the cards
    // most of all (owner's test, 2026-10-18): none while the box is drawn, and none left from before.
    this.#element.style.userSelect = 'none';
    getSelection()?.removeAllRanges();
  };

  /**
   * The pointer moves: once past the threshold, draw the box and select what it covers.
   * @param event The move.
   */
  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!drag.moved) {
      if (Math.max(Math.abs(point.x - drag.start.x), Math.abs(point.y - drag.start.y)) < BOX_THRESHOLD) return;
      drag.moved = true;
      try {
        this.#element.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic or already-ended pointer cannot be captured; the box still follows it.
      }
    }
    event.preventDefault();
    const box = boxBetween(drag.start, point);
    const covered = intersecting(box, drag.items.map((item) => ({ unique: item.unique, rect: item.rect })));
    this.#select([...new Set([...drag.base, ...covered])]);
    const frame = this.#element.getBoundingClientRect();
    const element = this.#window.box();
    if (element) {
      element.box = { left: box.left - frame.left, top: box.top - frame.top, width: box.right - box.left, height: box.bottom - box.top };
    }
  };

  /**
   * The pointer is let go: the box goes, and what it selected stays selected.
   * @param event The release.
   */
  #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.#endDrag();
    // A click on empty space, not a box: it clears the selection, as in every file manager (owner's
    // test, 2026-10-19), unless Ctrl, Cmd or Shift was held, which there means "keep what I have".
    if (!drag.moved && !drag.keep) this.#select([]);
  };

  /** End a box drag, whatever ended it. */
  #endDrag(): void {
    const drag = this.#drag;
    this.#drag = undefined;
    this.#element.style.userSelect = '';
    const element = this.#window.box();
    if (element) element.box = undefined;
    if (drag?.moved) {
      try {
        this.#element.releasePointerCapture(drag.pointerId);
      } catch {
        // Not captured, or already released.
      }
    }
  }
}

/**
 * Whether a press is on empty space in core's collection: inside a view, or in the area core's layout
 * gives the view (its body layout's `#main`, which fills the window below the toolbar however few
 * cards the view draws), and on none of core's controls on the way there.
 * @param path The press's composed path, innermost first.
 * @param boundary The manager window, where the search stops.
 * @returns True on empty space.
 */
function onEmptySpace(path: ReadonlyArray<EventTarget>, boundary: EventTarget): boolean {
  for (const node of path) {
    if (node === boundary) return false;
    if (!(node instanceof HTMLElement)) continue;
    if (/-COLLECTION-VIEW$/.test(node.tagName)) return true;
    if (CONTROLS.test(node.tagName)) return false;
    if (node.id === 'main' && (node.getRootNode() as ShadowRoot).host?.tagName === 'UMB-BODY-LAYOUT') return true;
  }
  return false;
}

/**
 * The first element under an element, through shadow roots, that a test accepts.
 * @param root Where to start.
 * @param test What to look for.
 * @returns The element, or undefined.
 */
function findDeep(root: Element, test: (element: Element) => boolean): Element | undefined {
  const queue: Array<ParentNode> = [root.shadowRoot ?? root];
  while (queue.length) {
    const node = queue.shift()!;
    for (const element of node.querySelectorAll('*')) {
      if (test(element)) return element;
      if (element.shadowRoot) queue.push(element.shadowRoot);
    }
  }
  return undefined;
}

/**
 * The first element matching a selector under an element, through shadow roots.
 * @param root Where to start.
 * @param selector What to match.
 * @returns The element, or undefined.
 */
function deepFirst(root: Element, selector: string): HTMLElement | undefined {
  return findDeep(root, (element) => element.matches(selector)) as HTMLElement | undefined;
}
