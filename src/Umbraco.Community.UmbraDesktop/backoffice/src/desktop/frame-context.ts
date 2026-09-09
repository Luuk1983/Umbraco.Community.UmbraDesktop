/**
 * The one way this package reaches a context living inside a window's frame.
 *
 * Extracted from `dirty-watcher.ts`, which was the first thing to need it and is still the reason
 * it is shaped the way it is. **A context request travels up the tree**, so a probe element parked
 * at the frame's document root is an ancestor of every workspace and its request rises away from
 * them, never to them — which breaks exactly the case that matters most, a window hosting a whole
 * section whose workspace mounts far below the frame root. What *does* reach the document is
 * `umb:context-provide`, which every provider fires on connect with `bubbles` and `composed` set.
 * So this listens for that, takes the provider's own element off the event's composed path, and
 * asks *it* directly.
 *
 * It fires again on every navigation inside the window, which is what lets both consumers — the
 * dirty watcher and the path watcher — follow a frame from one document to the next with no extra
 * machinery.
 *
 * Shared rather than copied, because the alternative is two modules that both know Umbraco's event
 * names and both have to be found when core renames one.
 */

/** Umbraco's context-api event names. Not exported by the package, and stable across v14+. */
const CONTEXT_REQUEST_EVENT = 'umb:context-request';
const CONTEXT_PROVIDE_EVENT = 'umb:context-provide';

/**
 * The shape `UmbContextProvider` reads off a request event.
 *
 * It never checks the event's class, which is what lets a plain `Event` carrying these four fields
 * stand in for core's own event class without having to construct that class inside the frame's
 * realm — where it would be a different class object anyway.
 */
interface ContextRequestEventLike {
  /** The context alias being asked for. */
  contextAlias: string;
  /** The api alias being asked for; `'default'` when a token names none. */
  apiAlias: string;
  /** Called with whatever the provider holds; return true to accept and stop the request. */
  callback: (instance: unknown) => boolean;
  /** Whether the provider should stop the event at the first alias match. */
  stopAtContextMatch: boolean;
}

/**
 * Split a context token into its two aliases, exactly as `UmbContextProvider` splits them.
 *
 * `toString()` rather than the token's own fields because only `contextAlias` is public on a token
 * — `apiAlias` is protected — and the two have to be taken from one place or they can disagree.
 * Taking them from the token at all, rather than writing the strings here, is what makes a rename
 * in core break an import instead of silently matching nothing.
 * @param token A context token, or its string form.
 * @returns The context alias and the api alias, the latter defaulting to `'default'`.
 */
export function aliasesOf(token: { toString(): string }): [string, string] {
  const [contextAlias, apiAlias = 'default'] = token.toString().split('#');
  return [contextAlias, apiAlias];
}

/**
 * Ask one element for a context it provides.
 * @param element The element a provider announced itself from.
 * @param contextAlias The context alias to ask for.
 * @param apiAlias The api alias to ask for.
 * @param onInstance Called with whatever that provider holds; return true to accept it, which stops
 * the request travelling further.
 */
export function requestContextFrom(
  element: EventTarget,
  contextAlias: string,
  apiAlias: string,
  onInstance: (instance: unknown) => boolean,
): void {
  const event = new Event(CONTEXT_REQUEST_EVENT, { bubbles: true, composed: true, cancelable: true });
  const request: ContextRequestEventLike = {
    contextAlias,
    apiAlias,
    callback: onInstance,
    // The provider stops the event at the first alias match, which is what we want: the nearest
    // provider to that element is the one it provides.
    stopAtContextMatch: true,
  };
  Object.assign(event, request);
  element.dispatchEvent(event);
}

/**
 * Watch a frame's document for providers of one context, handing each instance to `onInstance`.
 * @param doc The frame's document.
 * @param contextAlias The context alias to watch for.
 * @param apiAlias The api alias to watch for.
 * @param onInstance Called with each instance a provider answers with; return true to accept it.
 * @returns A function that stops watching.
 */
export function watchProvidedContexts(
  doc: Document,
  contextAlias: string,
  apiAlias: string,
  onInstance: (instance: unknown) => boolean,
): () => void {
  const onProvide = (event: Event) => {
    // The provider's own element, which is where its request listener is registered. Taken off the
    // composed path rather than from `event.target`, because `target` is retargeted to the shadow
    // host once the event crosses a boundary — and every real provider is inside one.
    const source = event.composedPath()[0];
    if (source) requestContextFrom(source, contextAlias, apiAlias, onInstance);
  };
  doc.addEventListener(CONTEXT_PROVIDE_EVENT, onProvide);
  return () => doc.removeEventListener(CONTEXT_PROVIDE_EVENT, onProvide);
}
