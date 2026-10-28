import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopWindowPaneElement } from './window-pane.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * A backoffice page as attached content (#144, plan task 2.2): a pane whose body is a frame on a
 * backoffice route, as the Media Manager shows a media item beside its window. The pane gets the
 * frame watches a window gets, and while the page holds unsaved changes it may not move between pane
 * and window, and closing it asks.
 *
 * The frame loads a page the test server serves, so it is same-origin with a real path, as a
 * backoffice frame is. No backoffice boots in it, so unsaved changes are set on the manager, which is
 * what the pane's dirty watch writes to.
 */

/** How long a mounted case may take: a pane loads a frame. */
const TIMEOUT_MS = 20_000;

/** A page the test server serves, standing in for a media item's workspace. */
const PAGE = new URL('./window-pane-page.test.ts', import.meta.url).pathname;

/** The owner's app: an element app, as the Media Manager is. */
class OwnerElement extends HTMLElement {}
customElements.define('umbradesktop-test-page-owner', OwnerElement);

const OWNER: UmbraDesktopApp = {
  alias: 'owner',
  name: 'Owner',
  icon: 'icon-pictures',
  content: { kind: 'element', element: OwnerElement },
  chromeProfile: 'bare',
  defaultSize: { w: 600, h: 500 },
  minSize: { w: 500, h: 300 },
};

/** The page beside it. */
const PAGE_APP: UmbraDesktopApp = {
  alias: 'page',
  name: 'Item',
  icon: 'icon-picture',
  content: { kind: 'iframe', url: PAGE },
  chromeProfile: 'workspace-only',
  defaultSize: { w: 400, h: 400 },
  minSize: { w: 300, h: 300 },
};

/** A manager whose discard dialog is a recorded answer instead of a modal. */
class ProbeManager extends UmbraDesktopWindowManagerContext {
  /** What the stand-in dialog will answer. */
  public answer = true;
  /** How many times it was opened. */
  public asked = 0;

  protected override async _askToDiscard(): Promise<boolean> {
    this.asked += 1;
    return this.answer;
  }
}

/** Everything a case mounted, torn down after it. */
let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A desktop with the owner window and a page pane beside it, the owner mounted and kept in step with
 * the manager the way the desktop's repeat would.
 * @param options `floating` opens the page as a floating window instead.
 * @param options.floating Whether to open it floating.
 * @returns The manager, the owner's id, the page's id and the mounted owner element.
 */
async function desk(options: { floating?: boolean } = {}) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed; left:0; top:0; width:1600px; height:900px;';
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new ProbeManager(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  manager.clampToBounds({ w: 1600, h: 900 });
  manager.open(OWNER);
  const owner = manager.getWindows()[0].id;
  manager.move(owner, 50, 50);
  const page = manager.openAttached(owner, PAGE_APP, 'right', options)!;
  const mount = async (id: string) => {
    const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
    const read = (): UmbraDesktopWindow | undefined => manager.getWindows().find((w) => w.id === id);
    element.window = read();
    wrapper.appendChild(element);
    const subscription = manager.windows.subscribe(() => {
      const next = read();
      if (next) element.window = { ...next };
    });
    cleanup.push(() => subscription.unsubscribe());
    await element.updateComplete;
    return element;
  };
  cleanup.push(() => {
    host.destroy();
    wrapper.remove();
  });
  return { manager, owner, page, mount };
}

/**
 * The pane element in a mounted owner, rendered.
 * @param element The owner window element.
 * @returns The pane.
 */
async function paneIn(element: UmbraDesktopWindowElement): Promise<UmbraDesktopWindowPaneElement> {
  await element.updateComplete;
  const pane = element.renderRoot.querySelector('umbradesktop-window-pane') as UmbraDesktopWindowPaneElement;
  await pane.updateComplete;
  return pane;
}

/**
 * Wait for a condition, polling, so a case does not depend on how fast a frame loads.
 * @param condition What to wait for.
 */
async function until(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 80 && !condition(); tries++) await new Promise((resolve) => setTimeout(resolve, 25));
}

it('draws a page pane as a frame on its route', async function () {
  this.timeout(TIMEOUT_MS);
  const { owner, mount } = await desk();
  const pane = await paneIn(await mount(owner));
  const frame = pane.shadowRoot!.querySelector('iframe.pane-content') as HTMLIFrameElement;
  expect(!!frame, 'the body is a frame').to.equal(true);
  expect(new URL(frame.src).pathname).to.equal(PAGE);
});

it('strips the backoffice chrome from a page pane', async function () {
  this.timeout(TIMEOUT_MS);
  const { owner, mount } = await desk();
  const pane = await paneIn(await mount(owner));
  const frame = pane.shadowRoot!.querySelector('iframe.pane-content') as HTMLIFrameElement;
  await until(() => frame.contentDocument?.readyState === 'complete' && frame.contentWindow?.location.pathname === PAGE);
  // A stand-in for the backoffice's header, in a shadow root as the real one is.
  const doc = frame.contentDocument!;
  const shell = doc.createElement('div');
  shell.attachShadow({ mode: 'open' }).appendChild(doc.createElement('umb-backoffice-header'));
  doc.body.appendChild(shell);
  await until(() => !!shell.shadowRoot!.getElementById('umbradesktop-injected-chrome'));
  expect(!!shell.shadowRoot!.getElementById('umbradesktop-injected-chrome')).to.equal(true);
});

it("reports the page a pane's frame is on to the manager", async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, owner, mount } = await desk();
  await paneIn(await mount(owner));
  const location = () => manager.getWindows()[0].panes?.[0].location;
  await until(() => location() === PAGE);
  expect(location()).to.equal(PAGE);
});

it('marks the owner while its pane holds unsaved changes', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, owner, page, mount } = await desk();
  const element = await mount(owner);
  manager.setPaneDirty(owner, page, true);
  await element.updateComplete;
  expect(!!element.renderRoot.querySelector('.titlebar .dirty')).to.equal(true);
});

it('disables Pop out while the pane is dirty, with the reason as its title', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, owner, page, mount } = await desk();
  const element = await mount(owner);
  manager.setPaneDirty(owner, page, true);
  const pane = await paneIn(element);
  const button = pane.shadowRoot!.querySelector('.pane-popout') as HTMLButtonElement;
  expect(button.disabled).to.equal(true);
  expect(button.title).to.equal('umbraDesktop_attachedUnsaved');
  manager.setPaneDirty(owner, page, false);
  await paneIn(element);
  expect(button.disabled).to.equal(false);
});

it('asks before putting a dirty pane away from its hide button, and No keeps it', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, owner, page, mount } = await desk();
  const element = await mount(owner);
  manager.setPaneDirty(owner, page, true);
  manager.answer = false;
  const pane = await paneIn(element);
  (pane.shadowRoot!.querySelector('.pane-hide') as HTMLButtonElement).click();
  await until(() => manager.asked > 0);
  expect(manager.asked).to.equal(1);
  expect(manager.getWindows()[0].panes).to.have.lengthOf(1);
});

it('asks before reloading a dirty pane', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, owner, page, mount } = await desk();
  const element = await mount(owner);
  manager.setPaneDirty(owner, page, true);
  manager.answer = false;
  const pane = await paneIn(element);
  const before = pane.shadowRoot!.querySelector('iframe.pane-content');
  (pane.shadowRoot!.querySelector('.pane-reload') as HTMLButtonElement).click();
  await until(() => manager.asked > 0);
  await pane.updateComplete;
  expect(manager.asked).to.equal(1);
  expect(pane.shadowRoot!.querySelector('iframe.pane-content'), 'No keeps the same frame').to.equal(before);
});

it('disables Dock on a dirty floating page, with the reason as its title', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, page, mount } = await desk({ floating: true });
  const element = await mount(page);
  manager.setDirty(page, true);
  await element.updateComplete;
  const button = element.renderRoot.querySelector('.attached-dock') as HTMLButtonElement;
  expect(button.disabled).to.equal(true);
  expect(button.title).to.equal('umbraDesktop_attachedUnsaved');
});

it('pops a clean page out from its button and keeps its id', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, owner, page, mount } = await desk();
  const pane = await paneIn(await mount(owner));
  (pane.shadowRoot!.querySelector('.pane-popout') as HTMLButtonElement).click();
  const floating = manager.getWindows().find((w) => w.owner === owner);
  expect(floating?.id).to.equal(page);
});
