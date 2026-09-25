import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_DIRTY_ATTRIBUTE } from '../constants.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * Unsaved work in a **registered app**, as opposed to a backoffice page.
 *
 * An iframe window learns it is dirty from the workspace inside it. An app window has no workspace,
 * so the app says so itself, with `data-umbradesktop-dirty` on its own element, and from there it
 * is the same flag: the titlebar marker, the taskbar marker and the close guard all read it. These
 * cases follow the attribute from the app's element to the guard.
 */

/** An app that can be told it holds unsaved work, the way Notepad marks itself. */
class DirtyProbeAppElement extends HTMLElement {}
customElements.define('umbradesktop-dirty-probe-app', DirtyProbeAppElement);

/** The registered app the window shows. */
const APP: UmbraDesktopApp = {
  alias: 'app-dirty-probe',
  name: 'Probe',
  icon: 'icon-notepad',
  content: { kind: 'element', element: DirtyProbeAppElement },
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
  return element.shadowRoot!.querySelector('umbradesktop-dirty-probe-app') as HTMLElement;
}

/** Let a mutation observer report and the manager publish. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  element.window = current()[0];
  await element.updateComplete;
}

it('marks the window unsaved when the app marks itself, and clean again when it clears it', async () => {
  expect(current()[0].dirty, 'clean to start with').to.not.equal(true);

  app().setAttribute(UMBRADESKTOP_DIRTY_ATTRIBUTE, '');
  await settle();
  expect(current()[0].dirty).to.equal(true);
  expect(element.shadowRoot!.querySelector('.dirty'), 'with the titlebar marker').to.not.equal(null);

  app().removeAttribute(UMBRADESKTOP_DIRTY_ATTRIBUTE);
  await settle();
  expect(current()[0].dirty).to.equal(false);
});

it('asks before closing an app window holding unsaved work, and keeps it on no', async () => {
  app().setAttribute(UMBRADESKTOP_DIRTY_ATTRIBUTE, '');
  await settle();
  manager.answer = false;

  (element.shadowRoot!.querySelector('.ctrl-close') as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve));

  expect(manager.asked).to.equal(1);
  expect(current(), 'still open').to.have.lengthOf(1);
});

it('closes an app window without asking once its work is saved', async () => {
  app().setAttribute(UMBRADESKTOP_DIRTY_ATTRIBUTE, '');
  await settle();
  app().removeAttribute(UMBRADESKTOP_DIRTY_ATTRIBUTE);
  await settle();

  (element.shadowRoot!.querySelector('.ctrl-close') as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve));

  expect(manager.asked).to.equal(0);
  expect(current()).to.have.lengthOf(0);
});

/** An app that is already unsaved when it mounts is reported, not only one that changes later. */
it('picks up an app that was already marked before the watch began', async () => {
  const body = element.shadowRoot!.querySelector('umbradesktop-app-host') as UmbraDesktopAppHostElement;
  let reported: boolean | undefined;
  body.addEventListener('umbradesktop-app-dirty', (event) => {
    reported = (event as CustomEvent<{ dirty: boolean }>).detail.dirty;
  });
  // A second load of the same app kind, marked before it is handed over.
  class PreMarkedAppElement extends HTMLElement {
    constructor() {
      super();
      this.setAttribute(UMBRADESKTOP_DIRTY_ATTRIBUTE, '');
    }
  }
  customElements.define('umbradesktop-dirty-premarked-app', PreMarkedAppElement);
  body.load = PreMarkedAppElement;
  await body.mountComplete;
  await new Promise((resolve) => setTimeout(resolve));
  expect(reported).to.equal(true);
});
