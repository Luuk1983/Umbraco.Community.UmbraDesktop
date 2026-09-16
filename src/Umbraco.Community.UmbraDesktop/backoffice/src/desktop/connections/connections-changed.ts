/**
 * Says when the set of configured connections has changed, so anything gated on having one can
 * reconsider.
 *
 * This exists because of a bug, and the bug is worth recording. The launcher's Status app is gated on
 * a condition that asks the server once, when it is constructed. The reasoning was that you add your
 * first connection in a settings screen and come back to the desktop afterwards, so the answer would
 * be re-asked by then. That is simply not what happens: the settings panel closes back onto the same
 * desktop, with the same extension registry and the same condition instance, and the app stayed
 * missing until the whole window was reloaded.
 *
 * A module-level signal rather than a context: a context has to be found on an element tree, and the
 * two parties here are a settings panel and an extension condition that has no place in that tree.
 * There is exactly one desktop per document, so module scope is the right scope.
 *
 * Deliberately carries no payload. A listener that wants to know what changed should go and ask,
 * because the answer it needs is whatever the server says now, not whatever was true when the signal
 * was sent.
 */

/** Everything currently listening. A Set, so unsubscribing is exact and double-adding is harmless. */
const listeners = new Set<() => void>();

/**
 * Listens for changes to the set of configured connections.
 * @param listener Called after any change. Takes no arguments on purpose; go and ask.
 * @returns A function that stops listening. Call it when the listener's owner is destroyed.
 */
export function observeConnectionsChanged(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Says that a connection has been added, changed or removed.
 *
 * Every listener is told even if an earlier one throws. One app mishandling the signal is its own
 * problem, and letting it stop the rest would turn a bug in one place into a bug everywhere.
 */
export function notifyConnectionsChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      // Reported rather than swallowed: this is a package author's bug and nothing else will ever
      // surface it, since nobody is awaiting these.
      // eslint-disable-next-line no-console
      console.error('[UmbraDesktop] a connections-changed listener threw', error);
    }
  }
}
