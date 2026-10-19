import { linkIntent } from '../manager/link-rule.js';
import type { UmbraDesktopMediaPlace } from '../manager/location.js';

/**
 * The window's folder, marked in its tree (design §17, owner's test 2026-10-18: "it's unclear what
 * folder is selected in the tree").
 *
 * Core marks a tree item active when the browser's address is on its page, which in a desktop window
 * it never is. So the window marks its own folder, with uui's own `active` attribute on the item, which
 * draws it as the Media section draws its open folder, in every theme. Core's tree item binds
 * `active` to its address check, which stays false here, and Lit only writes a binding whose value
 * changed, so the mark stays. Core draws items as their parents open and reloads them after changes,
 * so every shadow root the tree draws in is watched, and a new item is marked as it appears. The same
 * walk lets presses on each item's name and icon through to its link (see `PRESS_STYLE`).
 */

/** The element core's tree draws each item as. */
const MENU_ITEM = 'UUI-MENU-ITEM';

/**
 * The style that lets a press on a tree folder's name or icon through to uui's link beneath them.
 * Core slots both into the link, and Chrome starts no drag from slotted content in a menu item, which
 * is `user-select: none`: a press on the name stayed a click, so a tree folder could only be dragged
 * by its row's empty part (owner's test, 2026-10-19; measured, and making the name draggable fixed the
 * name but not the icon's SVG). Through to the link, the press drags it as a press beside them does,
 * and clicks and drop targets read the link as before.
 */
const PRESS_STYLE = { id: 'umbradesktop-media-tree-press', css: `${MENU_ITEM.toLowerCase()} > #label, ${MENU_ITEM.toLowerCase()} > #icon-container { pointer-events: none; }` };

/**
 * The place a tree item's link goes to.
 * @param href The link.
 * @returns A folder, the Media root or the recycle bin; undefined for any other link.
 */
export function placeOf(href: string): UmbraDesktopMediaPlace | undefined {
  const intent = linkIntent(href, []);
  if (intent.kind === 'place') return intent.place;
  if (intent.kind === 'item') return { kind: 'folder', unique: intent.unique };
  return undefined;
}

/**
 * Whether two places are the same.
 * @param a One.
 * @param b The other.
 * @returns True when they are.
 */
export function samePlace(a: UmbraDesktopMediaPlace, b: UmbraDesktopMediaPlace): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'folder' || a.unique.toLowerCase() === (b as { unique: string }).unique.toLowerCase();
}

/**
 * The tree folder a key or click is on: the first tree item on its path.
 * @param path The event's composed path, innermost first.
 * @returns The folder, the Media root or the recycle bin; undefined off the tree's items.
 */
export function treePlaceAt(path: ReadonlyArray<EventTarget>): UmbraDesktopMediaPlace | undefined {
  for (const node of path) {
    if (node instanceof Element && node.tagName === MENU_ITEM) return placeOf(node.getAttribute('href') ?? '');
  }
  return undefined;
}

/** Marks a window's folder in its tree, and keeps it marked as core redraws the tree. */
export class UmbraDesktopTreeCurrent {
  /** The tree host. */
  #root: Element;

  /** The place the window shows, once told. */
  #place?: UmbraDesktopMediaPlace;

  /** Watches each shadow root the tree draws in for items appearing. */
  #observer = new MutationObserver(() => this.#schedule());

  /** The shadow roots already watched. */
  #watched = new WeakSet<ShadowRoot>();

  /** The pending mark, one per frame however many changes come. */
  #frame?: number;

  /** @param root The tree host, whose shadow root the trees are drawn in. */
  constructor(root: Element) {
    this.#root = root;
  }

  /**
   * The window shows a place now: mark it.
   * @param place The place.
   */
  show(place: UmbraDesktopMediaPlace): void {
    this.#place = place;
    this.#schedule();
  }

  /** Stop watching. The marks stay, with the tree they are in. */
  stop(): void {
    this.#observer.disconnect();
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
  }

  /** Mark in the next frame, once core has drawn what it is drawing. */
  #schedule(): void {
    if (this.#frame !== undefined) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = undefined;
      this.#mark();
    });
  }

  /** Walk the tree: mark the window's place, unmark everything else, and watch every shadow root. */
  #mark(): void {
    const place = this.#place;
    const queue: ShadowRoot[] = this.#root.shadowRoot ? [this.#root.shadowRoot] : [];
    while (queue.length) {
      const shadow = queue.shift()!;
      if (!this.#watched.has(shadow)) {
        this.#watched.add(shadow);
        this.#observer.observe(shadow, { childList: true, subtree: true });
      }
      if (!shadow.getElementById(PRESS_STYLE.id) && shadow.querySelector(`${MENU_ITEM.toLowerCase()} > #label, ${MENU_ITEM.toLowerCase()} > #icon-container`)) {
        const style = document.createElement('style');
        style.id = PRESS_STYLE.id;
        style.textContent = PRESS_STYLE.css;
        shadow.appendChild(style);
      }
      for (const element of shadow.querySelectorAll('*')) {
        if (element.tagName === MENU_ITEM) {
          const here = placeOf(element.getAttribute('href') ?? '');
          const current = !!place && !!here && samePlace(here, place);
          if (element.hasAttribute('active') !== current) element.toggleAttribute('active', current);
        }
        if (element.shadowRoot) queue.push(element.shadowRoot);
      }
    }
  }
}
