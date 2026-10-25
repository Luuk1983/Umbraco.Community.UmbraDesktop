/**
 * Setting one manager window's collection view without touching the backoffice address.
 *
 * Core switches views by linking to a view path under the current address, and every hosted
 * collection follows the address, so in two windows switching one switches both (hosting spike,
 * workaround 2). The manager stops those links and sets the view on its own collection instead, two
 * ways, because core changed how it remembers the view in 18.2 (17.7 on the 17 line):
 *
 * - **18.2 onwards**, a collection context has an interaction memory, and its view manager shows the
 *   remembered view on the empty route and rebuilds its routes when the memory changes. Setting it
 *   switches the view in place, keeping the items, the selection and the scroll.
 * - **18.1**, the floor, has no memory, and core shows the first of the collection's layouts on the
 *   empty route. The manager rebuilds the collection with the chosen view first. This path can go
 *   once the floor is 18.2.
 *
 * Read in code (`core/collection/index.js` in 17.7.0's static assets, and the 18.1.0 and 18.2.1
 * packages), checked in a real backoffice.
 */

/** The key core's view manager keeps the current view under, `UmbCollectionCurrentView` from 18.2. */
export const UMBRADESKTOP_VIEW_MEMORY = 'UmbCollectionCurrentView';

/** As much of core's interaction memory manager as switching a view needs. */
export interface UmbraDesktopViewMemory {
  /**
   * Remember something for this collection.
   * @param memory The memory, keyed by `unique`.
   */
  setMemory(memory: { unique: string; value: unknown }): void;
}

/** A collection layout, as core's `UmbCollectionLayoutConfiguration` has it. */
export interface UmbraDesktopLayout {
  /** The collection view's alias. */
  collectionView: string;
  /** The name the view switcher shows. */
  name?: string;
  /** The icon the view switcher shows. */
  icon?: string;
}

/**
 * The memory that makes a collection show a view.
 * @param alias The collection view's alias.
 * @returns The memory to set.
 */
export function viewMemory(alias: string): { unique: string; value: { alias: string } } {
  return { unique: UMBRADESKTOP_VIEW_MEMORY, value: { alias } };
}

/**
 * The interaction memory of a collection context, where core has one.
 * @param context The collection context, typed loosely because the member only exists from 18.2.
 * @returns The memory, or undefined on 18.1.
 */
export function memoryOf(context: unknown): UmbraDesktopViewMemory | undefined {
  const memory = (context as { interactionMemory?: { setMemory?: unknown } } | undefined)?.interactionMemory;
  return typeof memory?.setMemory === 'function' ? (memory as UmbraDesktopViewMemory) : undefined;
}

/**
 * Whether core's collection element opens on a view handed to it as an interaction memory.
 *
 * Asked of the element rather than its context, because a window being built has no context yet: it
 * is the one the element is about to make. Core declares `interactionMemories` on the element from
 * 18.2; 18.1 has no such property, and shows the first layout.
 * @param collection Core's collection element, or one extending it.
 * @returns True where handing it the view is enough.
 */
export function remembersViews(collection: object): boolean {
  return 'interactionMemories' in collection;
}

/**
 * The layouts that make a collection open on a view, for a core with no interaction memory.
 *
 * Configured layouts keep their names and icons and stay the only views on offer, since a list view
 * that names its layouts also restricts the switcher to them. With none configured, every view on
 * offer becomes a layout, so the switcher still lists them all.
 * @param views The views on offer, in core's order.
 * @param layouts The collection's configured layouts, if any.
 * @param alias The view to open on.
 * @returns The layouts with that view first, or the configured ones unchanged when it is not on offer.
 */
export function layoutsLeading(
  views: ReadonlyArray<{ alias: string }>,
  layouts: ReadonlyArray<UmbraDesktopLayout> | undefined,
  alias: string,
): UmbraDesktopLayout[] {
  const all: UmbraDesktopLayout[] = layouts?.length ? layouts.map((each) => ({ ...each })) : views.map((view) => ({ collectionView: view.alias }));
  const chosen = all.find((each) => each.collectionView === alias);
  if (!chosen) return layouts ? layouts.map((each) => ({ ...each })) : all;
  return [chosen, ...all.filter((each) => each !== chosen)];
}
