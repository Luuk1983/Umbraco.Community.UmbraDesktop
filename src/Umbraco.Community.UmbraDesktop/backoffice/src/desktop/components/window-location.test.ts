import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * A backoffice window keeps the manager told which page its frame is on: once it has loaded, and on
 * every route change the frame's router makes. That is what lets the window layout reopen it at the
 * page the editor was on (`windows/layout.ts`).
 *
 * The frame loads a real page on the test server, so it is same-origin exactly as a backoffice frame
 * is, and it navigates the way Umbraco's router does: `history.pushState` followed by the router's
 * own `changestate` event, or the browser's `popstate` going back.
 */

/** How long a case may take: a window loads a frame. */
const TIMEOUT_MS = 20_000;

/** A page the test server serves, standing in for a backoffice section. */
const PAGE = new URL('./window-location.test.ts', import.meta.url).pathname;

const SECTION: UmbraDesktopApp = {
  alias: 'section',
  name: 'Section',
  icon: 'icon-document',
  content: { kind: 'iframe', url: PAGE },
  chromeProfile: 'bare',
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/** A window for `SECTION`, mounted, with its frame loaded. */
async function mounted() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position: fixed; left: 0; top: 0; width: 1000px; height: 700px;';
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  cleanup.push(() => {
    host.destroy();
    wrapper.remove();
  });
  manager.open(SECTION);
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const state = (): UmbraDesktopWindow => manager.getWindows()[0];
  const sync = () => (element.window = { ...state() });
  const subscription = manager.windows.subscribe(() => element.isConnected && sync());
  cleanup.push(() => subscription.unsubscribe());
  wrapper.appendChild(element);
  sync();
  await element.updateComplete;
  const iframe = element.shadowRoot!.querySelector('iframe')!;
  if (iframe.contentDocument?.readyState !== 'complete' || iframe.contentWindow?.location.pathname !== PAGE) {
    await new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
  }
  await new Promise((resolve) => setTimeout(resolve));
  return { state, frame: iframe.contentWindow! };
}

/** Until a condition holds, polling, so a case does not depend on how fast events are delivered. */
async function until(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 40 && !condition(); tries++) await new Promise((resolve) => setTimeout(resolve, 25));
}

it('records the page its frame loaded', async function () {
  this.timeout(TIMEOUT_MS);
  const { state } = await mounted();
  await until(() => state().location === PAGE);
  expect(state().location).to.equal(PAGE);
});

it('follows the frame’s router to a new page, query and hash included', async function () {
  this.timeout(TIMEOUT_MS);
  const { state, frame } = await mounted();
  frame.history.pushState({}, '', '/umbraco/section/media/workspace/media/edit/abc?culture=en#info');
  frame.dispatchEvent(new Event('changestate'));
  await until(() => state().location !== PAGE);
  expect(state().location).to.equal('/umbraco/section/media/workspace/media/edit/abc?culture=en#info');
});

it('follows the frame back through its history', async function () {
  this.timeout(TIMEOUT_MS);
  const { state, frame } = await mounted();
  frame.history.pushState({}, '', '/umbraco/section/media');
  frame.dispatchEvent(new Event('changestate'));
  await until(() => state().location === '/umbraco/section/media');
  frame.history.back();
  await until(() => state().location === PAGE);
  expect(state().location).to.equal(PAGE);
});
