import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * A package's own screen runs inside a backoffice window's frame, where the desktop's Help context
 * cannot be reached. So the window passes `umbradesktop-open-help` on from its frame to the desktop
 * (Help design D9). The frame loads a real page on the test server, same-origin as a backoffice frame.
 */

const TIMEOUT_MS = 20_000;

/** A page the test server serves, standing in for a backoffice section. */
const PAGE = new URL('./window-help-event.test.ts', import.meta.url).pathname;

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

/**
 * A window for {@link SECTION}, mounted, with its frame loaded.
 * @returns The wrapper the window is in, and the frame.
 */
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
  element.window = { ...manager.getWindows()[0] };
  wrapper.appendChild(element);
  await element.updateComplete;
  const iframe = element.shadowRoot!.querySelector('iframe')!;
  if (iframe.contentDocument?.readyState !== 'complete' || iframe.contentWindow?.location.pathname !== PAGE) {
    await new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
  }
  await new Promise((resolve) => setTimeout(resolve));
  return { wrapper, frame: iframe.contentWindow! as Window & typeof globalThis };
}

it('passes a request for Help from inside its frame on to the desktop', async function () {
  this.timeout(TIMEOUT_MS);
  const { wrapper, frame } = await mounted();
  const heard: unknown[] = [];
  wrapper.addEventListener('umbradesktop-open-help', (event) => heard.push((event as CustomEvent).detail));
  const inside = frame.document.createElement('button');
  frame.document.body.append(inside);
  inside.dispatchEvent(new frame.CustomEvent('umbradesktop-open-help', { detail: { target: 'my-package/setup' }, bubbles: true, composed: true }));
  expect(heard).to.deep.equal([{ target: 'my-package/setup' }]);
});

it('passes on only a request with a target string', async function () {
  this.timeout(TIMEOUT_MS);
  const { wrapper, frame } = await mounted();
  const heard: unknown[] = [];
  wrapper.addEventListener('umbradesktop-open-help', (event) => heard.push((event as CustomEvent).detail));
  frame.document.body.dispatchEvent(new frame.CustomEvent('umbradesktop-open-help', { detail: { target: {} }, bubbles: true }));
  expect(heard).to.deep.equal([]);
});
