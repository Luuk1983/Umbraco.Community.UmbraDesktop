import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_APP_CLOSE_ATTACHED_EVENT, UMBRADESKTOP_APP_OPEN_ATTACHED_EVENT } from '../constants.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * An app can show a backoffice page beside its own window (#144, plan task 2.3): it dispatches
 * `umbradesktop-open-attached` and `umbradesktop-close-attached`, and reads what is open from its
 * `attached` property. This is how the Media Manager opens a media item beside the folder.
 *
 * The page is a frame on a page the test server serves, under `/umbraco/section/` as the request
 * must be. No backoffice boots in it; routing is checked by the path the frame ends up on.
 */

/** How long a mounted case may take: a pane loads a frame. */
const TIMEOUT_MS = 20_000;

/** A stand-in app that asks for pages beside its window and keeps what it is told. */
class BesideApp extends HTMLElement {
  /** What the window says is open beside it. */
  attached: Readonly<Record<string, string>> = {};

  /**
   * Ask for a page beside the window.
   * @param detail The request.
   */
  open(detail: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent('umbradesktop-open-attached', { detail, bubbles: true, composed: true }));
  }

  /**
   * Ask for a page to close.
   * @param key Its key.
   */
  close(key: string) {
    this.dispatchEvent(new CustomEvent('umbradesktop-close-attached', { detail: { key }, bubbles: true, composed: true }));
  }
}
customElements.define('probe-beside-app', BesideApp);

const APP: UmbraDesktopApp = {
  alias: 'beside-app',
  name: 'Media Manager',
  icon: 'icon-pictures',
  content: { kind: 'element', element: BesideApp },
  chromeProfile: 'bare',
  defaultSize: { w: 500, h: 500 },
  minSize: { w: 400, h: 300 },
};

/** An element app of the same package, opened beside the window by its alias (#141). */
class DetailsApp extends HTMLElement {
  /** The owner window, as the desktop tells it. */
  ownerId?: string;
}
customElements.define('probe-beside-details', DetailsApp);

/** The app the owner asks for by alias: hidden from the launcher, as such an app is. */
const DETAILS: UmbraDesktopApp = {
  alias: 'probe.details',
  name: 'Details',
  icon: 'icon-info',
  content: { kind: 'element', element: DetailsApp },
  chromeProfile: 'bare',
  defaultSize: { w: 320, h: 400 },
  minSize: { w: 280, h: 300 },
  hideFromLauncher: true,
};

/**
 * A path the test server answers that still sits under `/umbraco/section/`, which a request must:
 * the server serves any path as the SPA would, and the frame needs only to be same-origin.
 */
const ONE = '/umbraco/section/media/workspace/media/edit/11111111-1111-1111-1111-111111111111';
const TWO = '/umbraco/section/media/workspace/media/edit/22222222-2222-2222-2222-222222222222';

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/** The events' names, read from the constants so the test and the host cannot drift apart. */
it('names the events as the contract does', () => {
  expect(UMBRADESKTOP_APP_OPEN_ATTACHED_EVENT).to.equal('umbradesktop-open-attached');
  expect(UMBRADESKTOP_APP_CLOSE_ATTACHED_EVENT).to.equal('umbradesktop-close-attached');
});

/**
 * A desktop with the app's window mounted and kept in step with the manager.
 * @returns The manager, the app element and the window's id.
 */
async function desk() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed; left:0; top:0; width:1800px; height:1000px;';
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  manager.clampToBounds({ w: 1800, h: 1000 });
  manager.useApps(() => [APP, DETAILS]);
  manager.open(APP);
  const id = manager.getWindows()[0].id;
  manager.move(id, 20, 20);
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const read = (): UmbraDesktopWindow => manager.getWindows().find((w) => w.id === id)!;
  element.window = read();
  wrapper.appendChild(element);
  const subscription = manager.windows.subscribe(() => {
    const next = manager.getWindows().find((w) => w.id === id);
    if (next) element.window = { ...next };
  });
  cleanup.push(() => {
    subscription.unsubscribe();
    host.destroy();
    wrapper.remove();
  });
  await element.updateComplete;
  let app: BesideApp | null = null;
  await until(() => !!(app = element.renderRoot.querySelector('umbradesktop-app-host')?.shadowRoot?.querySelector('probe-beside-app') ?? element.renderRoot.querySelector('umbradesktop-app-host')?.querySelector('probe-beside-app') ?? null));
  return { manager, id, element, app: app! as BesideApp };
}

/**
 * Wait for a condition, polling.
 * @param condition What to wait for.
 */
async function until(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 120 && !condition(); tries++) await new Promise((resolve) => setTimeout(resolve, 25));
}

/**
 * The frame of the page open beside the window, once it has loaded.
 * @param element The owner window element.
 * @returns The frame.
 */
async function paneFrame(element: UmbraDesktopWindowElement): Promise<HTMLIFrameElement> {
  let frame: HTMLIFrameElement | null = null;
  await until(() => {
    frame = element.renderRoot.querySelector('umbradesktop-window-pane')?.shadowRoot?.querySelector('iframe.pane-content') ?? null;
    return !!frame && frame.contentDocument?.readyState === 'complete' && frame.contentWindow?.location.pathname !== 'blank';
  });
  return frame!;
}

it('opens a page beside the window', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, id, app } = await desk();
  app.open({ key: 'item', path: ONE, name: 'Cat', icon: 'icon-picture' });
  const pane = manager.getWindows().find((w) => w.id === id)?.panes?.[0];
  expect(pane?.app).to.deep.include({ name: 'Cat', icon: 'icon-picture', chromeProfile: 'workspace-only' });
  expect(pane?.app.content).to.deep.equal({ kind: 'iframe', url: ONE });
});

it('opens it as a window when asked to float, as Shift-click asks', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, id, app } = await desk();
  app.open({ key: 'item', path: ONE, name: 'Cat', icon: 'icon-picture', floating: true });
  expect(manager.getWindows().filter((w) => w.owner === id)).to.have.lengthOf(1);
  expect(manager.getWindows().find((w) => w.id === id)?.panes ?? []).to.have.lengthOf(0);
});

it('routes the open frame for the same key instead of opening a second', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, id, element, app } = await desk();
  app.open({ key: 'item', path: ONE, name: 'Cat', icon: 'icon-picture' });
  const frame = await paneFrame(element);
  app.open({ key: 'item', path: TWO, name: 'Dog', icon: 'icon-picture' });
  await until(() => frame.contentWindow?.location.pathname === TWO);
  expect(frame.contentWindow?.location.pathname).to.equal(TWO);
  expect(manager.getWindows().find((w) => w.id === id)?.panes).to.have.lengthOf(1);
  await until(() => manager.getWindows()[0].panes?.[0].app.name === 'Dog');
  expect(manager.getWindows()[0].panes?.[0].app.name, 'the header follows once the frame is there').to.equal('Dog');
});

it("tells the app each open key's page, then nothing once it closes", async function () {
  this.timeout(TIMEOUT_MS);
  const { app } = await desk();
  app.open({ key: 'item', path: ONE, name: 'Cat', icon: 'icon-picture' });
  await until(() => app.attached.item === ONE);
  expect(app.attached).to.deep.equal({ item: ONE });
  app.close('item');
  await until(() => !('item' in app.attached));
  expect(app.attached).to.deep.equal({});
});

it("opens one of the app's own element apps beside the window, by its alias (#141)", async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, id, element, app } = await desk();
  app.open({ key: 'details', app: 'probe.details', name: 'banner.png', icon: 'icon-picture' });
  const pane = manager.getWindows().find((w) => w.id === id)?.panes?.[0];
  expect(pane?.app).to.deep.include({ name: 'banner.png', icon: 'icon-picture', chromeProfile: 'bare' });
  expect(pane?.app.content).to.deep.include({ kind: 'element', element: DetailsApp });
  let details: DetailsApp | null = null;
  await until(() => !!(details = element.renderRoot.querySelector('umbradesktop-window-pane')?.shadowRoot?.querySelector('umbradesktop-app-host')?.querySelector('probe-beside-details') ?? null));
  expect(details!.ownerId, 'the element is told whose it is').to.equal(id);
  await until(() => app.attached.details === 'probe.details');
  expect(app.attached).to.deep.equal({ details: 'probe.details' });
  app.open({ key: 'details', app: 'probe.details', name: 'cat.png', icon: 'icon-picture' });
  expect(manager.getWindows().find((w) => w.id === id)?.panes, 'asked again, it is renamed, not opened twice').to.have.lengthOf(1);
  expect(manager.getWindows().find((w) => w.id === id)?.panes?.[0].app.name).to.equal('cat.png');
  app.close('details');
  await until(() => !('details' in app.attached));
  expect(app.attached).to.deep.equal({});
});

it('opens nothing for an app the person cannot launch', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, id, app } = await desk();
  app.open({ key: 'details', app: 'probe.unknown' });
  expect(manager.getWindows().find((w) => w.id === id)?.panes ?? []).to.have.lengthOf(0);
  expect(manager.getWindows()).to.have.lengthOf(1);
});

it('refuses a path off the backoffice', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, id, app } = await desk();
  app.open({ key: 'item', path: 'https://example.com/umbraco/section/media', name: 'x', icon: 'y' });
  app.open({ key: 'item', path: '/elsewhere', name: 'x', icon: 'y' });
  expect(manager.getWindows().find((w) => w.id === id)?.panes ?? []).to.have.lengthOf(0);
  expect(manager.getWindows()).to.have.lengthOf(1);
});

it('keeps both events from reaching the desktop', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, app } = await desk();
  const heard: string[] = [];
  const listen = (event: Event) => heard.push(event.type);
  element.parentElement!.addEventListener('umbradesktop-open-attached', listen);
  element.parentElement!.addEventListener('umbradesktop-close-attached', listen);
  app.open({ key: 'item', path: ONE, name: 'Cat', icon: 'icon-picture' });
  app.close('item');
  expect(heard).to.deep.equal([]);
});

it('renames the page under a key when asked for the page it is already on, without routing it', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, element, app } = await desk();
  app.open({ key: 'item', path: ONE, name: 'New item', icon: 'icon-add' });
  const frame = await paneFrame(element);
  let popped = 0;
  frame.contentWindow!.addEventListener('popstate', () => (popped += 1));
  // As core's workspace adds its view to the address once it has routed.
  manager.setPaneLocation(manager.getWindows()[0].id, manager.getWindows()[0].panes![0].id, `${ONE}/view/media`);
  app.open({ key: 'item', path: ONE, name: 'Cat', icon: 'icon-picture' });
  expect(manager.getWindows()[0].panes?.[0].app).to.deep.include({ name: 'Cat', icon: 'icon-picture' });
  expect(popped, 'the frame is left where it is').to.equal(0);
  expect(frame.contentWindow!.location.pathname).to.equal(ONE);
});
