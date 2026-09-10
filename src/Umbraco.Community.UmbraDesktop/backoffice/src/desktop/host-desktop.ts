import type { UmbContextMinimal, UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * Finds the desktop that a window's frame is running inside, from code running in that frame.
 *
 * This is the mirror of `dirty-watcher.ts`, and the direction is what makes it easy. The watcher
 * reaches *into* a frame, where a context request travels up and away from the workspaces it wants,
 * so it has to listen for providers announcing themselves instead. Reaching *out* of a frame is the
 * case travelling up was made for: the frame's own `<iframe>` element sits inside the window
 * element, inside the desktop, and the desktop provides the window manager from its own element. A
 * request dispatched from the `<iframe>` therefore rises straight to it.
 *
 * It exists for the desk tools the desktop gives Umbraco AI. They are instantiated wherever the
 * chat is, which is inside a window on the desktop, while everything they need to read or do
 * belongs to the desktop in the outer document. Neither may assume there is one: Umbraco has no
 * per-surface conditions for frontend tools yet, so they also resolve in a plain backoffice with no
 * desktop anywhere, and `undefined` is the answer that lets them decline politely.
 */

/** Umbraco's context-request event name. Not exported by the package, and stable across v14+. */
const CONTEXT_REQUEST_EVENT = 'umb:context-request';

/** The shape `UmbContextProvider` reads off a request event. It never checks the event's class. */
interface ContextRequestEventLike {
  contextAlias: string;
  apiAlias: string;
  callback: (instance: unknown) => boolean;
  stopAtContextMatch: boolean;
}

/**
 * One of the hosting desktop's contexts, or `undefined` when this frame is not on a desktop.
 *
 * Takes the token rather than hard-coding one, because the desk tools need two of the desktop's
 * contexts — the window manager for what is open, the app catalogue for what could be — and two
 * near-identical bridges would be two places to keep the cross-realm details right.
 *
 * Synchronous, and deliberately a single question rather than a subscription. Both callers ask long
 * after everything has mounted — a tool call and a message send are user gestures — so there is
 * nothing to wait for, and a bridge that could answer later would have to be held somewhere and
 * released, for no gain.
 *
 * Three ways the answer is `undefined`, and all three are ordinary rather than exceptional: the
 * document is not framed at all (the plain backoffice), it is framed but nothing above it provides
 * the manager (an iframe that is not a desktop window), or the parent is another origin so there is
 * no `frameElement` to reach. None of them is a failure to report.
 * @param token The desktop context to ask for.
 * @param view The window to ask from; defaults to the calling realm's own.
 * @returns The context instance the hosting desktop provides, or `undefined`.
 */
export function findHostDesktopContext<T extends UmbContextMinimal>(
  token: UmbContextToken<T>,
  view: Window = window,
): T | undefined {
  // Split exactly as `UmbContextProvider` splits it, and from `toString()` rather than the token's
  // fields because only `contextAlias` is public on it — the two halves have to come from one place
  // or they can disagree.
  const [contextAlias, apiAlias = 'default'] = token.toString().split('#');
  // Same-origin is what this whole bridge rests on, and the spec's answer for a cross-origin parent
  // is a null `frameElement` rather than a throw. Guarded anyway, because a bridge that reports "no
  // desktop" is correct in that case and a bridge that throws breaks somebody's chat.
  let frame: Element | null;
  try {
    frame = view.frameElement;
  } catch {
    return undefined;
  }
  if (!frame) return undefined;

  let found: unknown;
  // Constructed from the *view's* realm rather than this module's. In production the two are the
  // same, because the AI extension points load this file inside the frame, so a plain `new Event`
  // would already be the frame's. A test, though, loads it in the outer document and passes a
  // frame's window in, and there a plain `new Event` would dispatch same-realm and quietly stop
  // testing the boundary that this whole module is about. Nothing on the receiving side cares
  // either way: the provider reads three properties off the event and never checks its class,
  // which is the contract `dirty-watcher.ts` established.
  //
  // The cast is because TypeScript declares the event constructors on `typeof globalThis` and not
  // on `Window`, while every real window carries them and `HTMLIFrameElement.contentWindow` is
  // typed as the latter. Narrowed here, once, rather than pushed onto every caller.
  const ViewEvent = (view as Window & typeof globalThis).Event;
  const event = new ViewEvent(CONTEXT_REQUEST_EVENT, {
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  const request: ContextRequestEventLike = {
    contextAlias,
    apiAlias,
    callback: (instance) => {
      found = instance;
      return true;
    },
    // Stop at the first provider of this alias. There is only ever one desktop above a frame, so
    // this says "the nearest one" for a case that cannot currently arise, and costs nothing.
    stopAtContextMatch: true,
  };
  Object.assign(event, request);
  frame.dispatchEvent(event);

  return found as T | undefined;
}
