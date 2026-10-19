import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_CLOSE_REQUEST_EVENT, UMBRADESKTOP_DIRTY_ATTRIBUTE } from '../constants.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * An app asks to close its own window with `umbradesktop-close-request`, as the Image Editor's file
 * menu does from Close, and the window closes it through the same unsaved-work guard as its close
 * button. Nothing is imported from the desktop: an event from the app's own element, the same model
 * as the title event and the dirty attribute. Issue #136.
 */

/** An app that can ask to close its window. */
class CloseProbeAppElement extends HTMLElement {}
customElements.define('umbradesktop-close-probe-app', CloseProbeAppElement);

/** The registered app the window shows. */
const APP: UmbraDesktopApp = {
  alias: 'app-close-probe',
  name: 'Image Editor',
  icon: 'icon-picture',
  content: { kind: 'element', element: CloseProbeAppElement },
  chromeProfile: 'bare',
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

let wrapper: HTMLElement;
let host: UmbElementControllerHost;
let manager: ProbeManager;
let element: UmbraDesktopWindowElement;

beforeEach(async () => {
  wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  host = new UmbElementControllerHost(wrapper);
  manager = new ProbeManager(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  wrapper.appendChild(element);
  manager.open(APP);
  element.window = current()[0];
  await element.updateComplete;
  const body = element.shadowRoot!.querySelector('umbradesktop-app-host') as UmbraDesktopAppHostElement;
  await body.mountComplete;
});

afterEach(() => {
  host.destroy();
  wrapper.remove();
});

/** The manager's window list, read synchronously. */
function current(): UmbraDesktopWindow[] {
  let list: UmbraDesktopWindow[] = [];
  manager.windows.subscribe((value) => (list = value as UmbraDesktopWindow[])).unsubscribe();
  return list;
}

/** The app's own element, inside the window's body. */
function app(): HTMLElement {
  return element.shadowRoot!.querySelector('umbradesktop-close-probe-app') as HTMLElement;
}

/** Let the dirty attribute's observer report and the manager publish. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  element.window = current()[0];
  await element.updateComplete;
}

it('closes the window when its app asks, through the unsaved guard', async () => {
  app().setAttribute(UMBRADESKTOP_DIRTY_ATTRIBUTE, '');
  await settle();
  manager.answer = false;

  app().dispatchEvent(new CustomEvent(UMBRADESKTOP_CLOSE_REQUEST_EVENT, { bubbles: true, composed: true }));
  await new Promise((resolve) => setTimeout(resolve));
  expect(manager.asked, 'the guard asked').to.equal(1);
  expect(current(), 'a no keeps it').to.have.lengthOf(1);

  app().removeAttribute(UMBRADESKTOP_DIRTY_ATTRIBUTE);
  await settle();
  app().dispatchEvent(new CustomEvent(UMBRADESKTOP_CLOSE_REQUEST_EVENT, { bubbles: true, composed: true }));
  await new Promise((resolve) => setTimeout(resolve));
  expect(manager.asked, 'a clean window closes without asking').to.equal(1);
  expect(current()).to.have.lengthOf(0);
});
