import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_APP_FOCUS_EVENT } from '../constants.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * An app can bring its own window forward (#144): it dispatches `umbradesktop-app-focus`, as the
 * Media Manager does for the window items were dropped into, so the next key acts there.
 */

/** A stand-in app that asks for its window to come forward. */
class RaisingApp extends HTMLElement {
  /** Ask, the way an app would. */
  raise() {
    this.dispatchEvent(new CustomEvent('umbradesktop-app-focus', { bubbles: true, composed: true }));
  }
}
customElements.define('probe-raising-app', RaisingApp);

const APP: UmbraDesktopApp = {
  alias: 'raising',
  name: 'Raising',
  icon: 'icon-pictures',
  content: { kind: 'element', element: RaisingApp },
  chromeProfile: 'bare',
  allowMultiple: true,
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * Two windows of {@link APP}, the first one mounted, the second opened after it and so in front.
 * @returns The manager, the first window's id, its app element and what reached the page.
 */
async function mounted() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position: fixed; left: 0; top: 0; width: 1000px; height: 700px;';
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  const reached: string[] = [];
  const listen = (event: Event) => reached.push(event.type);
  wrapper.addEventListener('umbradesktop-app-focus', listen);
  cleanup.push(() => {
    host.destroy();
    wrapper.remove();
  });
  manager.open(APP);
  const first = manager.getWindows()[0].id;
  manager.open(APP);
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const state = (): UmbraDesktopWindow => manager.getWindows().find((w) => w.id === first)!;
  const sync = () => (element.window = { ...state() });
  const subscription = manager.windows.subscribe(() => element.isConnected && sync());
  cleanup.push(() => subscription.unsubscribe());
  wrapper.appendChild(element);
  sync();
  let app: RaisingApp | null = null;
  for (let tries = 0; tries < 40 && !app; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    app = element.shadowRoot!.querySelector<RaisingApp>('probe-raising-app');
  }
  return { manager, first, state, app: app!, reached };
}

it('names the event as the contract does', () => {
  expect(UMBRADESKTOP_APP_FOCUS_EVENT).to.equal('umbradesktop-app-focus');
});

it('brings the window forward when its app asks', async () => {
  const { manager, state, app } = await mounted();
  expect(state().active).to.equal(false);
  app.raise();
  expect(state().active).to.equal(true);
  expect(state().z).to.equal(Math.max(...manager.getWindows().map((w) => w.z)));
});

it('restores the window first when it is minimised', async () => {
  const { manager, first, state, app } = await mounted();
  manager.setState(first, 'minimized');
  app.raise();
  expect(state().state).to.equal('normal');
  expect(state().active).to.equal(true);
});

it('keeps the request from reaching the desktop', async () => {
  const { app, reached } = await mounted();
  app.raise();
  expect(reached).to.deep.equal([]);
});
