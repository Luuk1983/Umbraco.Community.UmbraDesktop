import type { UmbraDesktopBesideView } from './beside-model';

/**
 * Reading a document window's frame for the views beside the editor: where the bridge asks from,
 * which view the editor has on screen, and whether that view has a router of its own.
 *
 * Every lookup crosses shadow roots, because the backoffice is Lit elements all the way down. They
 * walk the tree rather than query a known path, except where core's structure is the contract (the
 * workspace editor's own router), so a layout change in core costs a lookup that finds nothing,
 * which the button reads as "not offered", rather than one that finds the wrong thing.
 */

/** The element core's document workspace renders its split views in. */
const DOCUMENT_WORKSPACE_EDITOR = 'UMB-DOCUMENT-WORKSPACE-EDITOR';

/** The element each split renders its views in, with the tabs and the router. */
const WORKSPACE_EDITOR = 'UMB-WORKSPACE-EDITOR';

/** The tags a router is drawn as: core's element, and the library element inside it. */
const ROUTER_TAGS: ReadonlySet<string> = new Set(['UMB-ROUTER-SLOT', 'ROUTER-SLOT']);

/**
 * The first element, in document order, that matches, looking into every open shadow root on the
 * way. Each element's shadow tree is searched before its light children, which is the order its
 * rendered content comes in.
 * @param root Where to start.
 * @param match What to look for.
 * @returns The element, or undefined.
 */
function deepFind(root: ParentNode, match: (element: Element) => boolean): Element | undefined {
  const stack: ParentNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    const children = Array.from(node.children);
    // Pushed in reverse so the first child is searched first.
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      stack.push(child);
      if (child.shadowRoot) stack.push(child.shadowRoot);
    }
    // Checked when popped rather than when pushed, so the walk reports the first in document order.
    // By node type and never `instanceof Element`: the frame's elements are made by the frame's
    // `Element`, which is a different class from this page's, so `instanceof` is false for every one.
    if ((node as Node).nodeType === Node.ELEMENT_NODE && match(node as Element)) return node as Element;
  }
  return undefined;
}

/**
 * Where the bridge asks the owner for what a view needs: the first split's workspace editor
 * (design §4.2).
 *
 * The editor and not the router slot inside it, because the route context a view gets from there is
 * the document's, so the modal routes it registers hang off the document and a link to one keeps the
 * owner on it. Found inside the document workspace, so a block or a media item a dialog has opened,
 * with a workspace editor of its own, is never taken for it.
 * @param doc The owner frame's document.
 * @returns The editor, or undefined when the frame is not showing a document.
 */
export function findViewAnchor(doc: Document): HTMLElement | undefined {
  const workspace = deepFind(doc, (element) => element.tagName === DOCUMENT_WORKSPACE_EDITOR);
  if (!workspace) return undefined;
  return deepFind(workspace.shadowRoot ?? workspace, (element) => element.tagName === WORKSPACE_EDITOR) as
    | HTMLElement
    | undefined;
}

/** A view element as core's workspace editor leaves it, with its manifest set. */
export interface UmbraDesktopRenderedView {
  /** The element on screen. */
  element: HTMLElement;
  /** Its manifest, which core sets on it when its route renders it. */
  manifest: UmbraDesktopBesideView;
}

/**
 * The view an editor has on screen: the element its router rendered, which core's workspace editor
 * gives its `manifest` (`workspace-editor.element.js`, the route's `setup`).
 *
 * Read off the element rather than matched from the registry by pathname, because pathnames repeat
 * across workspaces and a view's conditions decide where it shows; the element is the answer core
 * itself arrived at.
 * @param editor The workspace editor.
 * @returns The view and its manifest, or undefined while nothing is rendered.
 */
export function renderedView(editor: Element): UmbraDesktopRenderedView | undefined {
  const slot = editor.shadowRoot?.querySelector('umb-router-slot');
  const router = slot?.shadowRoot?.querySelector('router-slot');
  for (const child of Array.from(router?.children ?? [])) {
    const manifest = (child as { manifest?: Partial<UmbraDesktopBesideView> }).manifest;
    if (manifest?.type === 'workspaceView' && typeof manifest.alias === 'string') {
      return { element: child as HTMLElement, manifest: manifest as UmbraDesktopBesideView };
    }
  }
  return undefined;
}

/**
 * Rule 6 of the offer (design §6): whether a view holds a router of its own anywhere in it.
 *
 * A router slot routes against its own page's address, and beside the editor that page is the
 * desktop, so a view with one would put its tabs in the desktop's address. The spike found most
 * package views with tabs have one (§8.1).
 * @param view The view element as rendered in the owner.
 * @returns True when a router is anywhere in its light or shadow trees.
 */
export function holdsRouter(view: Element): boolean {
  const roots: ParentNode[] = [view];
  if (view.shadowRoot) roots.push(view.shadowRoot);
  return roots.some((root) => deepFind(root, (element) => element !== view && ROUTER_TAGS.has(element.tagName)) !== undefined);
}
