import { nextTrayOrder, trayFlexOrder } from './tray-order.js';
import type { UmbraDesktopTrayItem } from './tray-items.js';
import type { ManifestUmbraDesktopTrayItem } from '../../tray.extension.js';
import { isFeatureEnabled } from '../features/enabled.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { createExtensionElement } from '@umbraco-cms/backoffice/extension-api';

/** The only attribute the watcher cares about: an item's own report of whether it has anything to show. */
const WATCHED: MutationObserverInit = { attributes: true, attributeFilter: ['hidden'] };

/**
 * Turns the tray context's items into elements in the taskbar's tray: one element per switched-on
 * item, created once and kept, ordered by when each became visible (umbraCoffee design D14).
 *
 * Elements are kept rather than rebuilt on every render because an item holds state (the umbraCoffee
 * cup polls and remembers what it has reminded), and they are reordered with CSS `order` rather than
 * moved, because moving a node disconnects it. "Visible" is the element's own `hidden` attribute,
 * watched the way the app host watches `data-umbradesktop-dirty`.
 *
 * Elements load in parallel and each joins the tray as soon as it exists, so one slow package bundle
 * does not hold back every other item, and a load in flight is shared by every sync that asks for the
 * same item rather than started again: the taskbar syncs once when the items arrive and again when
 * the user's settings do, and those two routinely land while the first bundle is still downloading.
 *
 * An item whose element already exists keeps it when its manifest is replaced under the same alias
 * without ever leaving the list: an unregister and register inside one animation frame, which the
 * initializer coalesces, or `appendCondition`, which swaps in a copy. The element is only remade when
 * the item goes away and comes back. An accepted edge, since restarting a running item for a
 * manifest that still describes the same thing would be the worse surprise.
 */
export class UmbraDesktopTrayItemsController extends UmbControllerBase {
  /** The element for each switched-on item that has finished loading, by alias. */
  #elements = new Map<string, HTMLElement>();

  /** A `hidden` watcher per element, by alias. */
  #watchers = new Map<string, MutationObserver>();

  /**
   * Loads in flight, by alias, each with the manifest it started from, so a second sync for the same
   * manifest waits on the first load instead of repeating it, and a sync for a replacement manifest
   * under that alias starts its own.
   */
  #loading = new Map<string, { manifest: ManifestUmbraDesktopTrayItem; load: Promise<void> }>();

  /**
   * The items the latest sync wants drawn: alias to the manifest it wants drawn for it. A load that
   * finishes checks this rather than the arguments it started with, so an item switched off (or
   * unregistered) mid-load is not drawn, and neither is one whose manifest was replaced meanwhile.
   */
  #wanted = new Map<string, ManifestUmbraDesktopTrayItem>();

  /**
   * Every item's alias in the order the latest sync listed them. What {@link entries} and the
   * "simultaneous arrivals keep registry order" rule of `nextTrayOrder` are read in, since elements
   * finish loading in whatever order the network decides.
   *
   * Called registry order, but strictly it is the order the extension initializer hands its
   * permitted manifests over in, which is not promised to match registration. That is harmless: the
   * order only decides DOM position, which the flex order overrides, and ties between items that
   * appear in the same instant. And the initializer's order for items it already had does not
   * change between emissions, so the relative order of kept elements never changes and `repeat`
   * never has to move one.
   */
  #registryOrder: string[] = [];

  /** Aliases in order of appearance, oldest (nearest the clock) first. */
  #order: string[] = [];

  /**
   * Manifests whose element could not be made, so each is reported once and not retried on every
   * sync. In practice that means until the page reloads. Keyed by the manifest object rather than
   * the alias only so that a different manifest under the same alias (one unregistered and
   * registered again, say) is not refused for the old one's failure.
   */
  #failed = new WeakSet<ManifestUmbraDesktopTrayItem>();

  /** The host, asked to re-render when the set of elements changes. */
  #host: UmbControllerHost & { requestUpdate(): void };

  /** @param host The taskbar, which draws {@link entries} in its tray. */
  constructor(host: UmbControllerHost & { requestUpdate(): void }) {
    super(host);
    this.#host = host;
  }

  /**
   * The elements to put in the tray, each with its alias, in registry order; their flex order does
   * the visual ordering.
   *
   * The alias is here for the renderer's sake, not the reader's: it must be drawn keyed by it (Lit's
   * `repeat`). A plain array is matched to the page by position, so an element that shifts position
   * (one listed before it finishing its load later, or one between switched off) is taken out and put
   * back, which disconnects it and restarts the item this controller exists to keep running.
   */
  public get entries(): Array<{ alias: string; element: HTMLElement }> {
    return this.#registryOrder.flatMap((alias) => {
      const element = this.#elements.get(alias);
      return element ? [{ alias, element }] : [];
    });
  }

  /**
   * Bring the elements in line with the items and the user's switches. Never rejects: an item whose
   * element cannot be made is reported and left out, and the rest are drawn.
   * @param items The tray context's items, in registry order.
   * @param stored The user's stored taskbar choices.
   * @returns Once every wanted item's element has loaded or failed; the taskbar need not wait.
   */
  public async sync(
    items: ReadonlyArray<UmbraDesktopTrayItem>,
    stored: Readonly<Record<string, boolean>>,
  ): Promise<void> {
    const wanted = items.filter((item) =>
      isFeatureEnabled(stored, { id: item.alias, defaultEnabled: item.defaultEnabled }),
    );
    this.#wanted = new Map(wanted.map((item) => [item.alias, item.manifest]));
    this.#registryOrder = items.map((item) => item.alias);
    let removed = false;
    for (const alias of [...this.#elements.keys()]) {
      if (this.#wanted.has(alias)) continue;
      this.#forget(alias);
      removed = true;
    }
    if (removed) {
      this.#reorder();
      this.#host.requestUpdate();
    }
    await Promise.all(
      wanted
        .filter((item) => !this.#elements.has(item.alias) && !this.#failed.has(item.manifest))
        .map((item) => this.#load(item)),
    );
  }

  /**
   * Make an item's element and, if it is still wanted when it arrives, put it in the tray.
   * @param item The item to load.
   * @returns The load, shared with any sync already waiting on the same item.
   */
  #load(item: UmbraDesktopTrayItem): Promise<void> {
    const pending = this.#loading.get(item.alias);
    if (pending?.manifest === item.manifest) return pending.load;
    const load = this.#create(item.manifest).then((element) => {
      // Only clear the slot if it is still ours: a replacement manifest may have taken it meanwhile.
      if (this.#loading.get(item.alias)?.load === load) this.#loading.delete(item.alias);
      if (!element || this.#wanted.get(item.alias) !== item.manifest || this.#elements.has(item.alias)) return;
      this.#elements.set(item.alias, element);
      const watcher = new MutationObserver(() => this.#reorder());
      watcher.observe(element, WATCHED);
      this.#watchers.set(item.alias, watcher);
      this.#reorder();
      this.#host.requestUpdate();
    });
    this.#loading.set(item.alias, { manifest: item.manifest, load });
    return load;
  }

  /**
   * `createExtensionElement`, made safe to await in a loop over other people's manifests.
   *
   * A package's bundle can 404, throw while it evaluates, or export nothing usable, and none of that
   * may cost the tray its other items or leave `sync` rejecting into the taskbar's render. A failure
   * is logged once here and the manifest remembered, so a sync on every settings change does not
   * repeat the load or the log. Umbraco logs its own error for a module that exports no element and
   * returns nothing; that is remembered too, without a second line.
   * @param manifest The item's manifest.
   * @returns The element, or undefined when there is none to draw.
   */
  async #create(manifest: ManifestUmbraDesktopTrayItem): Promise<HTMLElement | undefined> {
    try {
      const element = await createExtensionElement(manifest);
      if (!element) this.#failed.add(manifest);
      return element;
    } catch (error) {
      this.#failed.add(manifest);
      console.error(`[UmbraDesktop] The tray item "${manifest.alias}" could not be drawn: its element failed to load.`, error);
      return undefined;
    }
  }

  /** Recompute the order from who is visible now, and write it onto the elements. */
  #reorder() {
    const visible = this.#registryOrder.filter((alias) => {
      const element = this.#elements.get(alias);
      return element !== undefined && !element.hidden;
    });
    this.#order = nextTrayOrder(this.#order, visible);
    for (const [alias, element] of this.#elements) {
      // Only an alias in the order has a flex order; a hidden item gets none rather than a stale one,
      // since `.tray > [hidden]` hides it anyway and a leftover number would only confuse a reader.
      element.style.order = this.#order.includes(alias) ? String(trayFlexOrder(this.#order, alias)) : '';
    }
  }

  /**
   * Drop an item's element and watcher. The element leaves the page on the host's next render; a
   * fresh one is made if the item is switched back on, as a program started again gets a new icon.
   * @param alias The item.
   */
  #forget(alias: string) {
    this.#watchers.get(alias)?.disconnect();
    this.#watchers.delete(alias);
    this.#elements.delete(alias);
  }

  /**
   * Watch every kept element again. `hostDisconnected` stops the watchers, and the elements are kept
   * across it, so without this a taskbar its own host moves or reinserts would stop following
   * `hidden`. Not a return to the desktop: leaving the Desktop section destroys the whole desktop,
   * this controller with it, and coming back builds a new one with new elements. Reordered too,
   * since an item may have hidden while nobody watched.
   */
  override hostConnected() {
    super.hostConnected();
    for (const [alias, watcher] of this.#watchers) {
      const element = this.#elements.get(alias);
      if (element) watcher.observe(element, WATCHED);
    }
    this.#reorder();
  }

  /** Stop watching while the taskbar is off the page; {@link hostConnected} resumes. */
  override hostDisconnected() {
    super.hostDisconnected();
    for (const watcher of this.#watchers.values()) watcher.disconnect();
  }

  /** Stop watching for good, and see that no load still in flight draws anything. */
  override destroy() {
    for (const watcher of this.#watchers.values()) watcher.disconnect();
    this.#watchers.clear();
    this.#elements.clear();
    this.#wanted.clear();
    super.destroy();
  }
}
