import { expect } from '@open-wc/testing';
import './window.element.js';
import './taskbar.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import {
  UMBRADESKTOP_CLOSE_REQUEST_EVENT,
  UMBRADESKTOP_DIRTY_ATTRIBUTE,
  UMBRADESKTOP_TITLE_ATTRIBUTE,
} from '../constants.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The two channels an app uses to speak for its own window: a title, and a request to close.
 *
 * The Image Editor shows the open file's name in the title bar and closes from its file menu, and
 * neither needs anything imported from the desktop: the title is an attribute on the app's own
 * element, the close an event from it, the same model as the dirty attribute. Issue #136.
 */

/** An app that can name its window and ask to close it. */
class TitleProbeAppElement extends HTMLElement {}
customElements.define('umbradesktop-title-probe-app', TitleProbeAppElement);

/** The registered app the window shows. */
const APP: UmbraDesktopApp = {
  alias: 'app-title-probe',
  name: 'Image Editor',
  icon: 'icon-picture',
  content: { kind: 'element', element: TitleProbeAppElement },
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
let taskbar: UmbraDesktopTaskbarElement;

beforeEach(async () => {
  wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  host = new UmbElementControllerHost(wrapper);
  manager = new ProbeManager(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
  wrapper.appendChild(taskbar);
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
  return element.shadowRoot!.querySelector('umbradesktop-title-probe-app') as HTMLElement;
}

/** Let a mutation observer report and the manager publish to both surfaces. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  element.window = current()[0];
  await element.updateComplete;
  await taskbar.updateComplete;
}

/** What the title bar says. */
const titleText = () => element.shadowRoot!.querySelector('.title-text')?.textContent?.trim();

/** What the window's taskbar button says. */
const taskLabel = () => taskbar.renderRoot.querySelector('.task.window .task-label')?.textContent?.trim();

it("titles the window with the app's title attribute, and falls back to the label without one", async () => {
  await settle();
  expect(titleText(), 'the label to start with').to.equal('Image Editor');

  app().setAttribute(UMBRADESKTOP_TITLE_ATTRIBUTE, 'beach.jpg');
  await settle();
  expect(titleText()).to.equal('beach.jpg');
  expect(taskLabel()).to.equal('beach.jpg');

  app().setAttribute(UMBRADESKTOP_TITLE_ATTRIBUTE, '');
  await settle();
  expect(titleText(), 'an empty title is no title').to.equal('Image Editor');

  app().setAttribute(UMBRADESKTOP_TITLE_ATTRIBUTE, 'sunset.jpg');
  await settle();
  app().removeAttribute(UMBRADESKTOP_TITLE_ATTRIBUTE);
  await settle();
  expect(titleText()).to.equal('Image Editor');
  expect(taskLabel()).to.equal('Image Editor');
});

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
