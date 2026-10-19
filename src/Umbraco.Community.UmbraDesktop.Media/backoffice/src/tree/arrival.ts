import type { UmbraDesktopMediaPlace } from '../manager/location.js';
import { writeViewStyle } from '../manager/open-item.js';
import { placeOf, samePlace } from './current-folder.js';

/**
 * A paste or drop into a folder, shown in the tree (owner's test, 2026-10-18: the arrow came late and
 * the folder did not open to show the copy). The folder shows uui's own loading bar, the one core shows
 * while a folder loads, from the moment the work starts; when it is done the folder opens, as core
 * opens one, and what arrived in it is lit for a moment in the selection colour.
 *
 * Not a ghost row for what is coming: core draws the tree's rows, and a row of ours among them would
 * fight core's redraws. Core redraws the folder after the work (its reload event), so opening it and
 * finding the arrivals waits for core to draw them.
 */

/** How long what arrived stays lit. */
export const ARRIVAL_FLASH_MS = 1600;

/** How long to wait for core to redraw the folder and its new contents before giving up. */
const ARRIVAL_WAIT_MS = 5000;

/** How often to look while waiting. */
const ARRIVAL_LOOK_MS = 100;

/** The id of the rule that lights what arrived, in each shadow root the tree draws in. */
const ARRIVED_STYLE = 'umbradesktop-media-arrived';

/**
 * The folders from the top down to one, read off each folder's parent.
 * @param last The last folder, or null for none.
 * @param parents Each folder's parent, null at the top, in any order.
 * @returns The keys, from the top down, ending with `last`.
 */
export function ancestorChain(last: string | null, parents: ReadonlyMap<string, string | null>): string[] {
  const chain: string[] = [];
  for (let at = last; at !== null && at !== undefined && !chain.includes(at); at = parents.get(at) ?? null) chain.unshift(at);
  return chain;
}

/** A menu item of core's tree, as far as this reads and writes it. */
type UmbraDesktopMenuItem = HTMLElement & { loading?: boolean; hasChildren?: boolean; showChildren?: boolean };

/** Shows paste and drops into folders in one window's tree. */
export class UmbraDesktopTreeArrival {
  /** The tree host. */
  #root: Element;

  /** The pending end of the light. */
  #flash?: number;

  /** @param root The tree host, whose shadow root the trees are drawn in. */
  constructor(root: Element) {
    this.#root = root;
  }

  /**
   * Work into a folder started: show it loading.
   * @param target The folder.
   * @returns Call when the work is done.
   */
  start(target: UmbraDesktopMediaPlace): () => void {
    const item = this.#find(target);
    if (item) item.loading = true;
    return () => {
      if (item) item.loading = false;
    };
  }

  /**
   * Work into a folder is done: open it, once core shows something in it, and light what arrived.
   * @param target The folder.
   * @param arrived The keys of the folders that arrived, which the tree shows.
   * @returns Done once they are lit, or once waiting gave up.
   */
  async land(target: UmbraDesktopMediaPlace, arrived: ReadonlyArray<string>): Promise<void> {
    if (!arrived.length) return;
    const folder = await this.#waitFor(() => {
      const item = this.#find(target);
      return item && (item.hasChildren || item.showChildren) ? item : undefined;
    });
    if (!folder) return;
    if (!folder.showChildren) this.#open(folder);
    const shown = await this.#waitFor(() => (arrived.some((unique) => this.#find({ kind: 'folder', unique })) ? true : undefined));
    if (!shown) return;
    const colour = 'var(--umbradesktop-app-accent, var(--uui-color-selected, #3544b1))';
    const rule = arrived
      .map((unique) => `uui-menu-item[href$="/edit/${unique}"] { outline: 2px solid ${colour}; outline-offset: -2px; border-radius: var(--uui-border-radius, 3px); }`)
      .join('\n');
    window.clearTimeout(this.#flash);
    writeViewStyle(this.#root, ARRIVED_STYLE, rule, 'uui-menu-item');
    this.#flash = window.setTimeout(() => writeViewStyle(this.#root, ARRIVED_STYLE, '', 'uui-menu-item'), ARRIVAL_FLASH_MS);
  }

  /**
   * Open the tree down to a folder, as the Media section's tree opens to the folder on screen: the
   * Media root, then each folder above it in turn, each once core draws it. Nothing is closed, so
   * what the person opened stays open.
   * @param folders The folders to open, from the top down (see {@link ancestorChain}).
   * @returns Done once all are open, or once waiting gave up.
   */
  async openTo(folders: ReadonlyArray<string>): Promise<void> {
    // Core draws the root a moment after the window opens: wait for it, or for the first folder in a
    // tree drawn without one.
    const root = await this.#waitFor(
      () => this.#find({ kind: 'root' }) ?? (folders.length && this.#find({ kind: 'folder', unique: folders[0] }) ? null : undefined),
    );
    if (root && root.hasChildren && !root.showChildren) this.#open(root);
    for (const unique of folders) {
      const folder = await this.#waitFor(() => {
        const item = this.#find({ kind: 'folder', unique });
        return item && (item.hasChildren || item.showChildren) ? item : undefined;
      });
      if (!folder) return;
      if (!folder.showChildren) this.#open(folder);
    }
  }

  /**
   * Open a tree item through its caret, which is what a person clicks, so core loads and opens it as
   * it always does.
   * @param item The item.
   */
  #open(item: UmbraDesktopMenuItem): void {
    item.shadowRoot?.querySelector<HTMLElement>('#caret-button')?.click();
  }

  /**
   * Look until a test answers, or the wait runs out.
   * @param test What to look for.
   * @returns Its answer, or undefined.
   */
  async #waitFor<T>(test: () => T | undefined): Promise<T | undefined> {
    for (let waited = 0; waited <= ARRIVAL_WAIT_MS; waited += ARRIVAL_LOOK_MS) {
      const found = test();
      if (found !== undefined) return found;
      await new Promise((resolve) => setTimeout(resolve, ARRIVAL_LOOK_MS));
    }
    return undefined;
  }

  /**
   * A place's menu item in the tree, through every shadow root.
   * @param place The place.
   * @returns The item, or undefined when the tree does not show it.
   */
  #find(place: UmbraDesktopMediaPlace): UmbraDesktopMenuItem | undefined {
    const queue: ShadowRoot[] = this.#root.shadowRoot ? [this.#root.shadowRoot] : [];
    while (queue.length) {
      for (const element of queue.shift()!.querySelectorAll('*')) {
        if (element.tagName === 'UUI-MENU-ITEM') {
          const here = placeOf(element.getAttribute('href') ?? '');
          if (here && samePlace(here, place)) return element as UmbraDesktopMenuItem;
        }
        if (element.shadowRoot) queue.push(element.shadowRoot);
      }
    }
    return undefined;
  }
}
