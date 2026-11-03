import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopWindowPathElement } from './window-path.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import type { UmbraDesktopSettingsContext } from '../settings/settings.context.js';
import { besideAppAlias } from '../beside/beside-model.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbBooleanState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The window's side of Open beside (issue #131): it watches its own frame for the view on screen,
 * offers it in the path strip only when it qualifies, opens it beside itself, and closes every view
 * beside it when the setting goes off. The frame loads a real same-origin route, so its location is
 * a document's, and plain elements under core's tag names stand in for the backoffice inside it.
 */

/** How long a mounted case may take: a window renders a frame. */
const TIMEOUT_MS = 20_000;

const GUID = 'ca4249ed-2b23-4337-b522-63cabe5587d1';
const DOCUMENT_ROUTE = `/umbraco/section/content/workspace/document/edit/${GUID}/en-US`;

/** A Content window opened on a document's Info view. */
const CONTENT: UmbraDesktopApp = {
  alias: 'content',
  name: 'Content',
  icon: 'icon-document',
  content: { kind: 'iframe', url: `${DOCUMENT_ROUTE}/view/info` },
  chromeProfile: 'full-section',
  defaultSize: { w: 700, h: 500 },
  minSize: { w: 600, h: 300 },
};

/** Everything a case mounted, torn down after it. */
let cleanup: Array<() => void> = [];

afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A desk holding one Content window, with the setting provided.
 * @returns The parts.
 */
async function desk() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed; left:0; top:0; width:1600px; height:900px;';
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  const setting = new UmbBooleanState(true);
  const settings = { viewsBeside: setting.asObservable(), getHostElement: () => wrapper } as unknown as UmbraDesktopSettingsContext;
  new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, settings).hostConnected();
  manager.clampToBounds({ w: 1600, h: 900 });
  manager.open(CONTENT);
  const id = manager.getWindows()[0].id;
  manager.move(id, 50, 50);

  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const read = (): UmbraDesktopWindow => manager.getWindows().find((w) => w.id === id)!;
  element.window = read();
  wrapper.appendChild(element);
  cleanup.push(() => {
    host.destroy();
    wrapper.remove();
  });
  await element.updateComplete;
  const iframe = element.renderRoot.querySelector('iframe.body') as HTMLIFrameElement;
  // Loaded once the route is the document's and the window's load handler has had its turn.
  for (let i = 0; i < 200; i++) {
    let loaded = false;
    try {
      loaded = iframe.contentWindow?.location.pathname.endsWith('/view/info') === true && iframe.contentDocument?.readyState === 'complete';
    } catch {
      loaded = false;
    }
    if (loaded) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  const path = () => element.renderRoot.querySelector('umbradesktop-window-path') as UmbraDesktopWindowPathElement;
  return { manager, id, element, iframe, setting, path };
}

/**
 * Render a document workspace in the frame showing one view, as core would, and announce it the
 * way core's router does.
 * @param iframe The window's frame.
 * @param over Fields to set on the view's manifest.
 * @param inside What the view's shadow root holds.
 */
function renderView(iframe: HTMLIFrameElement, over: Record<string, unknown> = {}, ...inside: string[]) {
  const doc = iframe.contentDocument!;
  const make = (tag: string, ...children: Element[]) => {
    const element = doc.createElement(tag);
    element.attachShadow({ mode: 'open' }).append(...children);
    return element;
  };
  const view = make('pkg-view', ...inside.map((tag) => doc.createElement(tag)));
  (view as unknown as { manifest: unknown }).manifest = {
    type: 'workspaceView',
    alias: 'Pkg.View',
    meta: { pathname: 'info', label: 'Info', icon: 'icon-info' },
    ...over,
  };
  const router = doc.createElement('router-slot');
  router.append(view);
  const editor = make('umb-workspace-editor', make('umb-router-slot', router));
  doc.body.replaceChildren(make('umb-document-workspace-editor', make('umb-workspace-split-view', editor)));
  iframe.contentWindow!.dispatchEvent(new Event('navigationsuccess'));
}

/** Let the window's evaluation and render run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('the window offering its view beside itself', () => {
  it('offers the view on screen once the frame has rendered it', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, element, path } = await desk();
    renderView(iframe);
    await settle();
    await element.updateComplete;
    expect(path().view).to.deep.equal({ label: 'Info', icon: 'icon-info', beside: true, open: false, docked: false });
  });

  it('does not offer a view with a router of its own', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, element, path } = await desk();
    renderView(iframe, {}, 'umb-router-slot');
    await settle();
    await element.updateComplete;
    expect(path().view, 'still named, with no button').to.deep.equal({ label: 'Info', icon: 'icon-info', beside: false, open: false, docked: false });
  });

  it('does not offer an editor', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, element, path } = await desk();
    renderView(iframe, { kind: 'contentEditor' });
    await settle();
    await element.updateComplete;
    expect(path().view).to.equal(undefined);
  });

  it('opens it beside itself and goes back to its first view', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, element, path, manager, id } = await desk();
    renderView(iframe);
    await settle();
    await element.updateComplete;
    path().dispatchEvent(new CustomEvent('umbradesktop-path-beside', { bubbles: true, composed: true }));
    await settle();
    const owner = manager.getWindows().find((w) => w.id === id)!;
    const opened = [...(owner.panes ?? []).map((p) => p.app.alias), ...manager.getWindows().filter((w) => w.owner === id).map((w) => w.app.alias)];
    expect(opened).to.deep.equal([besideAppAlias('Pkg.View')]);
    expect(iframe.contentWindow!.location.pathname).to.equal(DOCUMENT_ROUTE);
  });

  it('opens it as a window of its own on Shift-click', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, element, path, manager, id } = await desk();
    renderView(iframe);
    await settle();
    await element.updateComplete;
    path().dispatchEvent(new CustomEvent('umbradesktop-path-beside', { detail: { floating: true }, bubbles: true, composed: true }));
    await settle();
    expect(manager.getWindows().find((w) => w.id === id)!.panes ?? []).to.have.lengthOf(0);
    expect(manager.getWindows().filter((w) => w.owner === id).map((w) => w.app.alias)).to.deep.equal([besideAppAlias('Pkg.View')]);
  });

  it('marks the view as open beside it, and closes it when pressed again', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, element, path, manager, id } = await desk();
    renderView(iframe);
    await settle();
    path().dispatchEvent(new CustomEvent('umbradesktop-path-beside', { detail: { floating: false }, bubbles: true, composed: true }));
    await settle();
    // The window went back to its first view; show Info in it again, as a click on its tab would.
    iframe.contentWindow!.history.pushState(null, '', `${DOCUMENT_ROUTE}/view/info`);
    renderView(iframe);
    await settle();
    element.window = { ...manager.getWindows().find((w) => w.id === id)! };
    await element.updateComplete;
    expect(path().view?.open).to.equal(true);
    path().dispatchEvent(new CustomEvent('umbradesktop-path-beside', { detail: { floating: false }, bubbles: true, composed: true }));
    // The pane slides back into the window before it closes, so the close lands after the slide.
    const start = performance.now();
    while ((manager.getWindows().find((w) => w.id === id)!.panes ?? []).length > 0 && performance.now() - start < 5_000) {
      await settle();
    }
    expect(manager.getWindows().find((w) => w.id === id)!.panes ?? []).to.have.lengthOf(0);
    expect(iframe.contentWindow!.location.pathname, 'the window stays on the view').to.equal(`${DOCUMENT_ROUTE}/view/info`);
  });

  it('focuses the open one on Shift-click rather than closing it or opening a second', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, path, manager, id } = await desk();
    renderView(iframe);
    await settle();
    path().dispatchEvent(new CustomEvent('umbradesktop-path-beside', { detail: { floating: false }, bubbles: true, composed: true }));
    await settle();
    iframe.contentWindow!.history.pushState(null, '', `${DOCUMENT_ROUTE}/view/info`);
    renderView(iframe);
    await settle();
    path().dispatchEvent(new CustomEvent('umbradesktop-path-beside', { detail: { floating: true }, bubbles: true, composed: true }));
    await settle();
    expect(manager.getWindows().find((w) => w.id === id)!.panes ?? []).to.have.lengthOf(1);
    expect(manager.getWindows().filter((w) => w.owner === id)).to.have.lengthOf(0);
  });

  it('checks the view again on click, and opens nothing once it has grown a router', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, element, path, manager, id } = await desk();
    renderView(iframe);
    await settle();
    await element.updateComplete;
    // The view builds its router after it rendered, without the frame announcing anything.
    const view = iframe.contentDocument!.querySelector('umb-document-workspace-editor')!.shadowRoot!.querySelector(
      'umb-workspace-split-view',
    )!.shadowRoot!.querySelector('umb-workspace-editor')!.shadowRoot!.querySelector('umb-router-slot')!.shadowRoot!.querySelector(
      'pkg-view',
    )!;
    view.shadowRoot!.append(iframe.contentDocument!.createElement('umb-router-slot'));
    path().dispatchEvent(new CustomEvent('umbradesktop-path-beside', { bubbles: true, composed: true }));
    await settle();
    await element.updateComplete;
    expect(manager.getWindows().find((w) => w.id === id)!.panes ?? []).to.have.lengthOf(0);
    expect(path().view?.beside).to.equal(false);
  });

  it('stops offering, and closes every view beside it, when the setting goes off', async function () {
    this.timeout(TIMEOUT_MS);
    const { iframe, element, path, manager, id, setting } = await desk();
    renderView(iframe);
    await settle();
    await element.updateComplete;
    path().dispatchEvent(new CustomEvent('umbradesktop-path-beside', { bubbles: true, composed: true }));
    await settle();
    setting.setValue(false);
    await settle();
    await element.updateComplete;
    const owner = manager.getWindows().find((w) => w.id === id)!;
    expect(owner.panes ?? []).to.have.lengthOf(0);
    expect(manager.getWindows().filter((w) => w.owner === id)).to.have.lengthOf(0);
    // Opening it sent the window back to its first view, so go to the view again: it is still
    // named, with no button.
    iframe.contentWindow!.history.pushState(null, '', `${DOCUMENT_ROUTE}/view/info`);
    renderView(iframe);
    await settle();
    await element.updateComplete;
    expect(path().view).to.deep.equal({ label: 'Info', icon: 'icon-info', beside: false, open: false, docked: false });
  });
});
