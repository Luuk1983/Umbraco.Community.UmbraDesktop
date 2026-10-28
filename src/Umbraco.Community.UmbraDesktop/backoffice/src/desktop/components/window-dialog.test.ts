import { expect } from '@open-wc/testing';
import './window.element.js';
import './taskbar.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_APP_CLOSE_DIALOG_EVENT, UMBRADESKTOP_APP_OPEN_DIALOG_EVENT } from '../constants.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The chrome's side of a dialog window (#179): what only a rendered window or taskbar can answer.
 * What the group does is tested in `dialog-windows.test.ts`.
 */

/** How long a mounted case may take: a window renders a frame. */
const TIMEOUT_MS = 20_000;

/** A trivial element for the owner's and the dialog's bodies. */
class ProbeDialogBodyElement extends HTMLElement {
  /** A property the dialog's request sets, to see props arrive. */
  public question?: string;
}
customElements.define('umbradesktop-test-dialog-body', ProbeDialogBodyElement);

/** The owner's app: an element app, so its body is an app host that can ask for a dialog. */
const OWNER: UmbraDesktopApp = {
  alias: 'owner',
  name: 'Owner',
  icon: 'icon-folder',
  content: { kind: 'element', element: () => Promise.resolve({ element: ProbeDialogBodyElement }) },
  chromeProfile: 'bare',
  defaultSize: { w: 700, h: 500 },
};

/** The dialog's app. */
const ASK: UmbraDesktopApp = { ...OWNER, alias: 'ask', name: 'Ask', defaultSize: { w: 400, h: 300 } };

/** Everything a case mounted, torn down after it. */
let cleanup: Array<() => void> = [];

afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A manager on a surface pinned to the viewport's corner, with the owner's window on it.
 * @returns The wrapper, the manager and the owner's id.
 */
function desk() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed; left:0; top:0; width:1600px; height:900px;';
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  manager.clampToBounds({ w: 1600, h: 900 });
  cleanup.push(() => {
    host.destroy();
    wrapper.remove();
  });
  manager.open(OWNER);
  const owner = manager.getWindows()[0].id;
  manager.move(owner, 100, 50);
  return { wrapper, manager, owner };
}

/**
 * Mount a window element for one window, kept in step with the manager the way the desktop's repeat
 * would.
 * @param wrapper Where to mount it.
 * @param manager The manager holding the window.
 * @param id The window's id.
 * @returns The element and a function that re-reads the manager into it.
 */
async function mountWindow(wrapper: HTMLElement, manager: UmbraDesktopWindowManagerContext, id: string) {
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const read = (): UmbraDesktopWindow => manager.getWindows().find((w) => w.id === id)!;
  element.window = read();
  wrapper.appendChild(element);
  await element.updateComplete;
  const sync = async () => {
    element.window = { ...read() };
    await element.updateComplete;
  };
  return { element, sync };
}

describe('a window with a dialog open', () => {
  it('dims its content under a scrim and takes it out of reach of the keyboard', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, owner } = desk();
    const { element, sync } = await mountWindow(wrapper, manager, owner);
    expect(element.renderRoot.querySelector('.dialog-scrim') === null).to.equal(true);
    manager.openDialog(owner, ASK);
    await sync();
    expect(element.renderRoot.querySelector('.dialog-scrim') !== null).to.equal(true);
    expect(element.renderRoot.querySelector('.column')?.hasAttribute('inert')).to.equal(true);
  });

  it('keeps its titlebar, so it can still be moved and resized', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, owner } = desk();
    manager.openDialog(owner, ASK);
    const { element } = await mountWindow(wrapper, manager, owner);
    expect(element.renderRoot.querySelector('.titlebar')?.closest('[inert]') === null).to.equal(true);
    expect(element.renderRoot.querySelectorAll('.rh').length).to.be.greaterThan(0);
  });

  it('flashes the dialog when its content is clicked', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, owner } = desk();
    const id = manager.openDialog(owner, ASK)!;
    const { element } = await mountWindow(wrapper, manager, owner);
    const scrim = element.renderRoot.querySelector('.dialog-scrim') as HTMLElement;
    scrim.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(manager.getWindows().find((w) => w.id === id)?.flashes).to.equal(1);
  });

  it('opens a dialog when its app asks, with the props it gave', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, owner } = desk();
    const { element } = await mountWindow(wrapper, manager, owner);
    const host = element.renderRoot.querySelector('umbradesktop-app-host')!;
    const ask = () =>
      new CustomEvent(UMBRADESKTOP_APP_OPEN_DIALOG_EVENT, {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { name: 'Ask', icon: 'icon-alert', element: ProbeDialogBodyElement, props: { question: 'Why?' }, size: { w: 400, h: 300 } },
      });
    const first = ask();
    host.dispatchEvent(first);
    expect(first.defaultPrevented, 'the app is told it opened').to.equal(true);
    const second = ask();
    host.dispatchEvent(second);
    expect(second.defaultPrevented, 'a second one does not open').to.equal(false);
    const dialog = manager.getWindows().find((w) => w.dialog);
    expect(dialog?.owner).to.equal(owner);
    expect(dialog?.app.name).to.equal('Ask');
    expect(dialog?.app.content.kind === 'element' && dialog.app.content.props?.question).to.equal('Why?');
  });
});

describe('a dialog window', () => {
  it('has a close button and no minimize, maximize, reload, attached strip or resize handles', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, owner } = desk();
    const id = manager.openDialog(owner, ASK)!;
    const { element } = await mountWindow(wrapper, manager, id);
    const root = element.renderRoot;
    expect(root.querySelector('.ctrl-close') !== null).to.equal(true);
    expect(root.querySelector('.ctrl-minimize, .ctrl-maximize, .ctrl-reload, .attached-strip, .rh') === null).to.equal(true);
  });

  it('flashes when it is asked to', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, owner } = desk();
    const id = manager.openDialog(owner, ASK)!;
    const { element, sync } = await mountWindow(wrapper, manager, id);
    manager.flashDialog(owner);
    await sync();
    expect(element.renderRoot.querySelector('.frame')?.hasAttribute('flashing')).to.equal(true);
  });

  it('closes when its content asks', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, owner } = desk();
    const id = manager.openDialog(owner, ASK)!;
    const { element } = await mountWindow(wrapper, manager, id);
    const host = element.renderRoot.querySelector('umbradesktop-app-host')!;
    host.dispatchEvent(new CustomEvent(UMBRADESKTOP_APP_CLOSE_DIALOG_EVENT, { bubbles: true, composed: true }));
    expect(manager.getWindows().map((w) => w.id)).to.deep.equal([owner]);
  });

  it('has no taskbar button of its own', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, owner } = desk();
    manager.openDialog(owner, ASK);
    const taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
    wrapper.appendChild(taskbar);
    await taskbar.updateComplete;
    expect(taskbar.renderRoot.querySelectorAll('.running .task')).to.have.lengthOf(1);
    expect(taskbar.renderRoot.querySelector('.task-group') === null).to.equal(true);
  });
});
