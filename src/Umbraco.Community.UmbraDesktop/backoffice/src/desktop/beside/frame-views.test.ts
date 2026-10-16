import { expect } from '@open-wc/testing';
import { findViewAnchor, holdsRouter, renderedView } from './frame-views';

/**
 * Reading the owner's frame: where the bridge's requests start (design §4.2), which view the editor
 * has on screen, and rule 6 of the offer, whether that view holds a router of its own (§6). Plain
 * elements under core's tag names stand in for the backoffice, which this runner cannot boot; the
 * real tree was read in the spike (§8.1).
 */

/** Everything a case put in the page, removed after it. */
let mounted: Element[] = [];

afterEach(() => {
  for (const element of mounted) element.remove();
  mounted = [];
});

/**
 * An element with an open shadow root holding the given children.
 * @param tag The tag name.
 * @param children What goes in its shadow root.
 * @returns The element.
 */
function shadowed(tag: string, ...children: Element[]): HTMLElement {
  const element = document.createElement(tag);
  element.attachShadow({ mode: 'open' }).append(...children);
  return element;
}

/**
 * An element holding the given children in its light DOM.
 * @param tag The tag name.
 * @param children Its children.
 * @returns The element.
 */
function light(tag: string, ...children: Element[]): HTMLElement {
  const element = document.createElement(tag);
  element.append(...children);
  return element;
}

/**
 * A view element as core's workspace editor leaves it: built from its manifest, with `manifest` set.
 * @param alias The view's alias.
 * @param children What its shadow root holds.
 * @returns The element.
 */
function view(alias: string, ...children: Element[]): HTMLElement {
  const element = shadowed('pkg-view', ...children);
  (element as unknown as { manifest: unknown }).manifest = { type: 'workspaceView', alias, meta: { pathname: 'x' } };
  return element;
}

/**
 * A workspace editor rendering one view through its router, as core's does: an `umb-router-slot` in
 * its shadow root, whose own shadow root holds the `router-slot` the view is appended to.
 * @param routed The view on screen.
 * @returns The editor.
 */
function editor(routed: Element): HTMLElement {
  return shadowed('umb-workspace-editor', light('umb-body-layout', shadowed('umb-router-slot', light('router-slot', routed))));
}

/**
 * A document workspace, its split views each holding an editor, inside a page's shadow trees.
 * @param editors The editors, one per split.
 * @returns The page root, mounted.
 */
function documentPage(...editors: Element[]): HTMLElement {
  const splits = editors.map((e) => shadowed('umb-workspace-split-view', e));
  const page = shadowed('umb-app', shadowed('umb-backoffice', light('main', shadowed('umb-document-workspace-editor', ...splits))));
  document.body.append(page);
  mounted.push(page);
  return page;
}

describe('the anchor the bridge asks from', () => {
  it('is the first split’s workspace editor, found through every shadow root on the way', () => {
    const first = editor(view('A'));
    const second = editor(view('B'));
    documentPage(first, second);
    expect(findViewAnchor(document)).to.equal(first);
  });

  it('is the document’s editor and not one a modal workspace stacked before it', () => {
    // A block or a media item opened in a dialog has a workspace editor of its own, and the pane must
    // never anchor there.
    const stray = shadowed('umb-block-workspace-editor', editor(view('Stray')));
    document.body.append(stray);
    mounted.push(stray);
    const own = editor(view('A'));
    documentPage(own);
    expect(findViewAnchor(document)).to.equal(own);
  });

  it('is nothing in a frame that is not showing a document', () => {
    const page = shadowed('umb-app', editor(view('A')));
    document.body.append(page);
    mounted.push(page);
    expect(findViewAnchor(document)).to.equal(undefined);
  });
});

describe('the view on screen', () => {
  it('is the element the editor’s router rendered, with the manifest core set on it', () => {
    const routed = view('Umb.WorkspaceView.Document.Info');
    const found = renderedView(editor(routed));
    expect(found?.element).to.equal(routed);
    expect(found?.manifest.alias).to.equal('Umb.WorkspaceView.Document.Info');
  });

  it('is nothing while the router has not rendered one', () => {
    expect(renderedView(editor(light('div')))).to.equal(undefined);
    expect(renderedView(shadowed('umb-workspace-editor'))).to.equal(undefined);
  });
});

describe('whether a view holds a router of its own (rule 6)', () => {
  it('finds a router slot in the view’s own shadow tree', () => {
    expect(holdsRouter(view('Routed', light('div', shadowed('pkg-tabs', shadowed('umb-router-slot')))))).to.equal(true);
  });

  it('finds one in the view’s light DOM too', () => {
    const element = view('Routed');
    element.append(light('section', document.createElement('umb-router-slot')));
    expect(holdsRouter(element)).to.equal(true);
  });

  it('finds none in a panel of information', () => {
    expect(holdsRouter(view('Info', light('div', shadowed('uui-box', light('p')))))).to.equal(false);
  });
});
