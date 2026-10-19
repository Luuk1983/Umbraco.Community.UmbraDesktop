import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * An app window can name itself (#144): the app dispatches `umbradesktop-app-title` and the window
 * shows that title instead of the app's name, as the Media Manager does with the folder it shows.
 */

/** A stand-in app that can name its window. */
class TitledApp extends HTMLElement {
  /**
   * Names the window, the way an app would.
   * @param title The title, or an empty string to go back to the app's name.
   */
  name(title: unknown) {
    this.dispatchEvent(new CustomEvent('umbradesktop-app-title', { detail: { title }, bubbles: true, composed: true }));
  }
}
customElements.define('probe-titled-app', TitledApp);

const APP: UmbraDesktopApp = {
  alias: 'titled',
  name: 'Media Manager',
  icon: 'icon-pictures',
  content: { kind: 'element', element: TitledApp },
  chromeProfile: 'bare',
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A window for {@link APP}, mounted, with its app element in place.
 * @returns The window's state, its element and its app element.
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
  manager.open(APP);
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const state = (): UmbraDesktopWindow => manager.getWindows()[0];
  const sync = () => (element.window = { ...state() });
  const subscription = manager.windows.subscribe(() => element.isConnected && sync());
  cleanup.push(() => subscription.unsubscribe());
  wrapper.appendChild(element);
  sync();
  let app: TitledApp | null = null;
  for (let tries = 0; tries < 40 && !app; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    app = element.shadowRoot!.querySelector<TitledApp>('probe-titled-app');
  }
  /** The titlebar text as drawn. */
  const titleText = async () => {
    await element.updateComplete;
    return element.shadowRoot!.querySelector('.title-text')?.textContent?.trim();
  };
  return { state, app: app!, titleText };
}

it('shows the title the app reports instead of its name', async () => {
  const { state, app, titleText } = await mounted();
  expect(await titleText()).to.equal('Media Manager');
  app.name('People');
  expect(state().title).to.equal('People');
  expect(await titleText()).to.equal('People');
});

it('goes back to the app name for an empty title', async () => {
  const { app, titleText } = await mounted();
  app.name('People');
  app.name('');
  expect(await titleText()).to.equal('Media Manager');
});

it('draws a title as plain text, never as markup or a dictionary key', async () => {
  const { app, titleText } = await mounted();
  app.name('<b>#general_close</b>');
  expect(await titleText()).to.equal('<b>#general_close</b>');
});

it('ignores a title that is not a string', async () => {
  const { state, app } = await mounted();
  app.name(42);
  expect(state().title).to.equal(undefined);
});
