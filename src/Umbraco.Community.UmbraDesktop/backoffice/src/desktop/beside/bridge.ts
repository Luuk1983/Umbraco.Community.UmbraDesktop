import { CONTEXT_PROVIDE_EVENT, CONTEXT_REQUEST_EVENT } from '../frame-context.js';

/**
 * The bridge that lets a workspace view on the desktop page run on its owner's workspace, inside the
 * owner's frame (issue #131, design §4).
 *
 * A view gets everything through context requests, which rise until a provider answers. So the
 * pane's host stops each request that reaches it and asks the owner's frame the same question, from
 * the first split's workspace editor, where it rises through the owner's providers exactly as if the
 * view sat in its tab. Nothing is listed or proxied one by one.
 *
 * Two copies of the backoffice meet here, the desktop page's and the frame's: the view's code is
 * the page's, its data objects are the frame's. Reading observables and calling methods works across
 * that line. Two things do not, and this module fixes both: core's modal context checks its token
 * with `instanceof`, and core's consumer waits for a re-provide on its own page's `window`.
 *
 * Next to `frame-context.ts` on purpose, which already depends on core's event names: when core
 * changes one, both are found in one place.
 */

/** The fields core's provider reads off a request; `frame-context.ts` explains why these suffice. */
interface ContextRequest {
  /** The context alias asked for. */
  contextAlias: string;
  /** The api alias asked for. */
  apiAlias: string;
  /** Hands the instance to the consumer; true when it accepted. */
  callback: (instance: unknown) => boolean;
  /** Whether a provider stops the request at the first alias match. */
  stopAtContextMatch: boolean;
}

/** What became of a forwarded request. */
export type UmbraDesktopForwardOutcome =
  /** A provider in the frame answered and the view accepted. */
  | 'answered'
  /** A provider in the frame matched the alias and stopped the request, but did not answer. */
  | 'matched'
  /** Nothing in the frame matched, so the request went on up the desktop page. */
  | 'missed';

/**
 * A request carrying the original's four fields, dispatched afresh.
 *
 * A plain `Event` rather than core's class, as `frame-context.ts` does, because the provider reads
 * the fields and never the class. `stopPropagation` is wrapped so the caller learns whether a
 * provider matched: core's provider stops a request whose context alias matches even when its api
 * alias does not, and once dispatch ends the browser clears the flag that would have said so.
 * @param original The view's request.
 * @param onAnswered Called when a provider's answer was accepted.
 * @param onMatched Called when a provider stopped the request.
 * @returns The new event.
 */
function lookAlike(original: ContextRequest, onAnswered: () => void, onMatched: () => void): Event {
  const event = new Event(CONTEXT_REQUEST_EVENT, { bubbles: true, composed: true, cancelable: true });
  const fields: ContextRequest = {
    contextAlias: original.contextAlias,
    apiAlias: original.apiAlias,
    stopAtContextMatch: original.stopAtContextMatch,
    callback: (instance) => {
      const accepted = original.callback(instance);
      if (accepted) onAnswered();
      return accepted;
    },
  };
  Object.assign(event, fields);
  const stop = event.stopPropagation.bind(event);
  event.stopPropagation = () => {
    onMatched();
    stop();
  };
  return event;
}

/**
 * Ask the owner's frame a question a view beside the editor asked, and fall back to the desktop page
 * only when the frame had nothing to say (design §4.2, §4.3).
 *
 * Called from the host's own listener, so the original request is stopped there and never reaches
 * the desktop page's providers, which would hand the view the desktop's modal manager and a
 * workspace that does not exist. The frame is asked from `anchor`. A provider answers during the
 * dispatch, so the outcome is known as soon as it returns. Only a request the frame neither answered
 * nor matched goes on up the desktop page: in the spike, nothing Info asks for did.
 * @param event The view's request, as it reached the host.
 * @param anchor The first split's workspace editor in the owner's frame.
 * @param host The host element the request reached. The fallback starts above it: from its parent,
 * or from its shadow root's host when it sits directly in a shadow root and so has no parent element.
 * @returns What became of it.
 */
export function forwardContextRequest(event: Event, anchor: EventTarget, host: Node): UmbraDesktopForwardOutcome {
  const original = event as Event & ContextRequest;
  event.stopPropagation();
  let answered = false;
  let matched = false;
  anchor.dispatchEvent(
    lookAlike(
      original,
      () => (answered = true),
      () => (matched = true),
    ),
  );
  if (answered) return 'answered';
  if (matched) return 'matched';
  const parent = host.parentNode;
  const above = parent && parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? (parent as ShadowRoot).host : host.parentElement;
  above?.dispatchEvent(lookAlike(original, () => {}, () => {}));
  return 'missed';
}

/** Marks a class this module has already taught, so a second call does not wrap the first. */
const TAUGHT = Symbol.for('umbraDesktop.besideForeignInstances');

/**
 * Make `instanceof frameClass` also accept instances of `pageClass`, and nothing else new (design
 * §4.4).
 *
 * For core's `UmbModalToken`: `UmbModalContext` reads a modal's defaults (its sidebar size, its
 * data) only when `alias instanceof UmbModalToken`, and a view beside the editor passes the desktop
 * page's token to the frame's modal manager. Without this the template picker opened as a small,
 * empty dialog. Core has eight `instanceof Umb…` checks, and this is the only one that broke.
 *
 * Only `frameClass` itself gains the answer. A subclass inherits `Symbol.hasInstance`, so the check
 * on `this` keeps `pageInstance instanceof FrameSubclass` false, and the page's own class is left
 * alone. Applied on every frame load and safe to apply twice.
 * @param frameClass The class in the owner's frame.
 * @param pageClass The same class on the desktop page.
 */
export function acceptForeignInstances(frameClass: object, pageClass: object): void {
  const record = frameClass as Record<symbol, unknown>;
  if (record[TAUGHT] === pageClass) return;
  const own = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(frameClass, Symbol.hasInstance, {
    configurable: true,
    value(this: unknown, instance: unknown): boolean {
      if (own.call(this, instance)) return true;
      return this === frameClass && own.call(pageClass, instance);
    },
  });
  Object.defineProperty(frameClass, TAUGHT, { configurable: true, value: pageClass });
}

/**
 * Relay the owner frame's provide events to the desktop page's `window`, for the aliases a view
 * beside the editor has asked for (design §4.4).
 *
 * A save makes the owner withdraw and provide again its property dataset, its variant context and
 * its route addendum. Core's consumer, once its context is withdrawn, waits for a provide event on
 * its own page's `window`, which the frame's never reach, so without this Info's "last edited" froze
 * after the first save. A relayed event makes the consumer ask again, and the request comes through
 * the host to the frame like any other.
 *
 * Withdrawals need nothing: an answered consumer listens on the provider's own element, which is in
 * the frame.
 * @param frameWindow The owner frame's window.
 * @param pageWindow The desktop page's window.
 * @param asked Whether the view has asked for a context alias.
 * @returns Stops relaying.
 */
export function relayProvideEvents(
  frameWindow: EventTarget,
  pageWindow: EventTarget,
  asked: (contextAlias: string) => boolean,
): () => void {
  const relay = (event: Event) => {
    const contextAlias = (event as Event & { contextAlias?: unknown }).contextAlias;
    if (typeof contextAlias !== 'string' || !asked(contextAlias)) return;
    // Not bubbling: it is dispatched on the window, which is where the consumer listens.
    const copy = new Event(CONTEXT_PROVIDE_EVENT);
    Object.assign(copy, { contextAlias });
    pageWindow.dispatchEvent(copy);
  };
  frameWindow.addEventListener(CONTEXT_PROVIDE_EVENT, relay);
  return () => frameWindow.removeEventListener(CONTEXT_PROVIDE_EVENT, relay);
}
