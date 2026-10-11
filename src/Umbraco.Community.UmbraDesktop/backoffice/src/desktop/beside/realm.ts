/**
 * How the desktop page reaches the frame's own copy of a backoffice class (design §4.4).
 *
 * The bridge has to teach the owner frame's `UmbModalToken` about the desktop page's, and the frame's
 * class lives in the frame's module graph, which the desktop page cannot import from. Evaluating an
 * import inside the frame would work until a site sets a Content Security Policy. So every backoffice
 * page this package loads into, frames included, publishes its own classes on its own window from an
 * entry point (`realm.entrypoint.ts`), and the desktop reads the frame's off the frame's window.
 */

/** Where a page keeps what it published. A registered symbol, so both pages name the same key. */
const REALM_KEY = Symbol.for('umbraDesktop.realm');

/** What a page publishes about itself. */
export interface UmbraDesktopRealm {
  /** The page's own `UmbModalToken` class. */
  UmbModalToken: object;
}

/**
 * Publish a page's classes on its window.
 * @param target The page's window.
 * @param realm Its classes.
 */
export function publishRealm(target: object, realm: UmbraDesktopRealm): void {
  Object.defineProperty(target, REALM_KEY, { configurable: true, value: realm });
}

/**
 * Read what another page published.
 * @param target That page's window.
 * @returns Its classes, or undefined when it published nothing yet or cannot be read.
 */
export function realmOf(target: unknown): UmbraDesktopRealm | undefined {
  if (!target) return undefined;
  try {
    return (target as Record<symbol, UmbraDesktopRealm | undefined>)[REALM_KEY];
  } catch {
    // A frame that has navigated to another origin throws on any property read.
    return undefined;
  }
}
