import { besideViewFor } from './beside-model';
import type { UmbraDesktopBesideView } from './beside-model';
import { findViewAnchor, holdsRouter, renderedView } from './frame-views';

/**
 * The workspace view a document window shows, as the path strip names it: the view on screen, when
 * the route names it, and when it is not an editor kind, since an editor is the window itself. A
 * view that cannot open beside the editor is still named; it just gets no button.
 * @param frameWindow The owner's frame window.
 * @returns The view on screen and its element, or undefined.
 */
export function shownViewIn(frameWindow: Window): { view: UmbraDesktopBesideView; element: HTMLElement } | undefined {
  let pathname: string;
  let doc: Document;
  try {
    pathname = frameWindow.location.pathname;
    doc = frameWindow.document;
  } catch {
    // A frame that went to another origin, which a backoffice window never does.
    return undefined;
  }
  const anchor = findViewAnchor(doc);
  const rendered = anchor ? renderedView(anchor) : undefined;
  // Rules 2 to 4 of the offer with the setting and the lists left out: the route's view, matched to
  // the one on screen, and not an editor.
  const view = besideViewFor({ enabled: true, pathname, view: rendered?.manifest, notBeside: new Set() });
  return view && rendered ? { view, element: rendered.element } : undefined;
}

/**
 * The offer as a document window asks it of its own frame (design §6): which view, if any, the
 * view crumb's button opens beside the editor. All six rules: the pure five in `beside-model.ts`,
 * then whether the view as rendered holds a router of its own.
 * @param frameWindow The owner's frame window.
 * @param enabled The person's setting.
 * @param notBeside Every alias on the opt-out lists.
 * @returns The view to offer, or undefined.
 */
export function besideOfferIn(
  frameWindow: Window,
  enabled: boolean,
  notBeside: ReadonlySet<string>,
): UmbraDesktopBesideView | undefined {
  if (!enabled) return undefined;
  const shown = shownViewIn(frameWindow);
  if (!shown || notBeside.has(shown.view.alias) || holdsRouter(shown.element)) return undefined;
  return shown.view;
}

/**
 * Call back whenever the frame's router has rendered something or changed the route, which is when
 * the view on screen may have changed. `navigationsuccess` comes after a router slot has put its new
 * page in, `changestate` with every route change, both on the frame's window.
 * @param frameWindow The owner's frame window.
 * @param onChange Called on each.
 * @returns Stops listening.
 */
export function watchFrameViews(frameWindow: Window, onChange: () => void): () => void {
  frameWindow.addEventListener('navigationsuccess', onChange);
  frameWindow.addEventListener('changestate', onChange);
  return () => {
    frameWindow.removeEventListener('navigationsuccess', onChange);
    frameWindow.removeEventListener('changestate', onChange);
  };
}
