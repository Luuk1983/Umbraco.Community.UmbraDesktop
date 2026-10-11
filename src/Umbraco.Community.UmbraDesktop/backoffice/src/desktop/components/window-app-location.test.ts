import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * An app window keeps the manager told where the app is, the way a backoffice window does for its
 * frame: the app dispatches `umbradesktop-app-location` and the window records it, so the layout can
 * reopen the app there (Help design D7).
 */

/** A stand-in app that can report a location, and shows the one it was handed. */
class LocatedApp extends HTMLElement {
  /** The location the desktop handed over. */
  location?: string;

  /**
   * Reports a move, the way an app would.
   * @param location Where it went.
   */
  report(location: string) {
    this.dispatchEvent(new CustomEvent('umbradesktop-app-location', { detail: { location }, bubbles: true, composed: true }));
  }
}
customElements.define('probe-located-app', LocatedApp);

const APP: UmbraDesktopApp = {
  alias: 'located',
  name: 'Located',
  icon: 'icon-help',
  content: { kind: 'element', element: LocatedApp },
  chromeProfile: 'bare',
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A window for {@link APP}, mounted, with its app element in place.
 * @param location Where to open it.
 * @returns The window's state and its app element.
 */
async function mounted(location?: string) {
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
  manager.open(APP, { location });
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const state = (): UmbraDesktopWindow => manager.getWindows()[0];
  const sync = () => (element.window = { ...state() });
  const subscription = manager.windows.subscribe(() => element.isConnected && sync());
  cleanup.push(() => subscription.unsubscribe());
  wrapper.appendChild(element);
  sync();
  let app: LocatedApp | null = null;
  for (let tries = 0; tries < 40 && !app; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    app = element.shadowRoot!.querySelector<LocatedApp>('probe-located-app');
  }
  return { state, app: app! };
}

it('hands the app the location it was opened at', async () => {
  const { app } = await mounted('umbradesktop/snapping');
  expect(app.location).to.equal('umbradesktop/snapping');
});

it('records the location the app reports', async () => {
  const { state, app } = await mounted();
  app.report('umbradesktop/live-preview/headless-sites');
  expect(state().location).to.equal('umbradesktop/live-preview/headless-sites');
});

it('ignores a report that is not a string, which says nothing the layout could keep', async () => {
  const { state, app } = await mounted('a');
  app.dispatchEvent(new CustomEvent('umbradesktop-app-location', { detail: { location: 42 }, bubbles: true, composed: true }));
  expect(state().location).to.equal('a');
});
