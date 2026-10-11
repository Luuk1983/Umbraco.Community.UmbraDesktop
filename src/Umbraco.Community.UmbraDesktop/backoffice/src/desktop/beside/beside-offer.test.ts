import { expect } from '@open-wc/testing';
import { besideOfferIn, shownViewIn, watchFrameViews } from './beside-offer';

/**
 * The whole offer as the window asks it (design §6): rules 1 to 5 from the route and the rendered
 * view's manifest, then rule 6 from the rendered view itself. A plain object with a location and a
 * document built from plain elements stands in for the owner's frame.
 */

const GUID = 'ca4249ed-2b23-4337-b522-63cabe5587d1';
const INFO_ROUTE = `/umbraco/section/content/workspace/document/edit/${GUID}/en-US/view/info`;

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
 * A document window's frame showing one view, as core renders it.
 * @param pathname The frame's route.
 * @param kind The view's kind, if any.
 * @param inside What the view's shadow root holds.
 * @returns A stand-in for the frame's window.
 */
function frameShowing(pathname: string, kind?: string, ...inside: Element[]) {
  // One frame at a time: the anchor is the first document workspace in the page.
  for (const element of mounted) element.remove();
  mounted = [];
  const view = shadowed('pkg-view', ...inside);
  (view as unknown as { manifest: unknown }).manifest = {
    type: 'workspaceView',
    alias: 'Pkg.View',
    kind,
    meta: { pathname: 'info', label: 'Info' },
  };
  const router = document.createElement('router-slot');
  router.append(view);
  const editor = shadowed('umb-workspace-editor', shadowed('umb-router-slot', router));
  const page = shadowed('umb-document-workspace-editor', shadowed('umb-workspace-split-view', editor));
  document.body.append(page);
  mounted.push(page);
  return { location: { pathname }, document } as unknown as Window;
}

it('offers the view on screen when it qualifies', () => {
  const offer = besideOfferIn(frameShowing(INFO_ROUTE), true, new Set());
  expect(offer?.alias).to.equal('Pkg.View');
});

it('refuses a view with a router of its own, which only the rendered view can tell', () => {
  expect(besideOfferIn(frameShowing(INFO_ROUTE, undefined, shadowed('div', document.createElement('umb-router-slot'))), true, new Set())).to.equal(
    undefined,
  );
});

it('refuses with the setting off, an editor kind, or an opt-out', () => {
  expect(besideOfferIn(frameShowing(INFO_ROUTE), false, new Set())).to.equal(undefined);
  expect(besideOfferIn(frameShowing(INFO_ROUTE, 'contentEditor'), true, new Set())).to.equal(undefined);
  expect(besideOfferIn(frameShowing(INFO_ROUTE), true, new Set(['Pkg.View']))).to.equal(undefined);
});

it('refuses a frame it cannot read', () => {
  const crossOrigin = new Proxy(
    {},
    {
      get() {
        throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError');
      },
    },
  ) as Window;
  expect(besideOfferIn(crossOrigin, true, new Set())).to.equal(undefined);
});

describe('the view the path names', () => {
  it('is the view on screen, whether or not it can open beside the editor', () => {
    expect(shownViewIn(frameShowing(INFO_ROUTE))?.view.alias).to.equal('Pkg.View');
    expect(shownViewIn(frameShowing(INFO_ROUTE, undefined, shadowed('div', document.createElement('umb-router-slot'))))?.view.alias).to.equal(
      'Pkg.View',
    );
  });

  it('is nothing for an editor, which is the window itself, or before the route names a view', () => {
    expect(shownViewIn(frameShowing(INFO_ROUTE, 'contentEditor'))).to.equal(undefined);
    expect(shownViewIn(frameShowing(INFO_ROUTE.replace('/view/info', '')))).to.equal(undefined);
  });
});

describe('following the frame', () => {
  it('asks again whenever the frame’s router has rendered something or changed the route', () => {
    const frameWindow = new EventTarget() as Window;
    let asked = 0;
    const stop = watchFrameViews(frameWindow, () => asked++);
    frameWindow.dispatchEvent(new Event('navigationsuccess'));
    frameWindow.dispatchEvent(new Event('changestate'));
    expect(asked).to.equal(2);
    stop();
    frameWindow.dispatchEvent(new Event('navigationsuccess'));
    expect(asked).to.equal(2);
  });
});
