import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_TASK_EVENT } from '../constants.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * Work in progress reported by a **registered app**, through the published event, followed from
 * the app's element to the window's chrome and its close guard. Issue #108, design D5.
 */

/** An app that reports work, the way a package's app would. */
class ProgressProbeAppElement extends HTMLElement {
  /**
   * Report one task, exactly as the developer guide tells an app to.
   * @param detail The report.
   */
  report(detail: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent(UMBRADESKTOP_TASK_EVENT, { detail, bubbles: true, composed: true }));
  }
}
customElements.define('umbradesktop-progress-probe-app', ProgressProbeAppElement);

/** The registered app the window shows. */
const APP: UmbraDesktopApp = {
  alias: 'app-progress-probe',
  name: 'Probe',
  icon: 'icon-notepad',
  content: { kind: 'element', element: ProgressProbeAppElement },
  chromeProfile: 'bare',
};

/** A manager whose stop-work dialog is a recorded answer instead of a modal. */
class ProbeManager extends UmbraDesktopWindowManagerContext {
  /** What the stand-in dialog will answer. */
  public answer = true;
  /** How many times it was opened. */
  public asked = 0;

  protected override async _askToStopWork(): Promise<boolean> {
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
  await body().mountComplete;
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

/** The window's app host. */
function body(): UmbraDesktopAppHostElement {
  return element.shadowRoot!.querySelector('umbradesktop-app-host') as UmbraDesktopAppHostElement;
}

/** The app's own element, inside the window's body. */
function app(): ProgressProbeAppElement {
  return element.shadowRoot!.querySelector('umbradesktop-progress-probe-app') as ProgressProbeAppElement;
}

/** Hand the window the manager's latest state and let it render. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  element.window = current()[0];
  await element.updateComplete;
}

/** The titlebar's progress element, or null. */
function progress(): HTMLElement | null {
  return element.shadowRoot!.querySelector('.titlebar .progress');
}

it('shows an app task on the title bar as a proportion, and clears it when the app ends it', async () => {
  app().report({ id: 'render', state: 'running', completed: 1, total: 4 });
  await settle();
  expect(current()[0].progress?.state).to.equal('determinate');
  expect(progress()?.getAttribute('data-state')).to.equal('determinate');
  expect(progress()?.style.getPropertyValue('--umbradesktop-progress-value')).to.equal('0.25');
  expect(progress()?.getAttribute('role')).to.equal('progressbar');
  expect(progress()?.getAttribute('aria-valuenow')).to.equal('25');

  app().report({ id: 'render', state: 'done' });
  await settle();
  expect(current()[0].progress).to.equal(undefined);
  expect(progress(), 'the marker clears').to.equal(null);
});

it('draws work with no total as activity, with no value for assistive tech to read out', async () => {
  app().report({ id: 'sync', state: 'running' });
  await settle();
  expect(progress()?.getAttribute('data-state')).to.equal('indeterminate');
  expect(progress()?.hasAttribute('aria-valuenow')).to.equal(false);
});

it('leaves a failure on the title bar until the app ends the task', async () => {
  app().report({ id: 'render', state: 'failed', completed: 2, total: 4, failed: 2 });
  await settle();
  expect(progress()?.getAttribute('data-state')).to.equal('failed');
  app().report({ id: 'render', state: 'done' });
  await settle();
  expect(progress()).to.equal(null);
});

it('keeps the unsaved dot beside a busy window rather than swapping one for the other', async () => {
  app().setAttribute('data-umbradesktop-dirty', '');
  app().report({ id: 'render', state: 'running' });
  await settle();
  expect(element.shadowRoot!.querySelector('.titlebar .dirty'), 'the dot').to.not.equal(null);
  expect(progress(), 'and the progress').to.not.equal(null);
});

it('asks before closing an app window with work in flight, and keeps it on no', async () => {
  app().report({ id: 'render', state: 'running' });
  await settle();
  manager.answer = false;
  (element.shadowRoot!.querySelector('.ctrl-close') as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve));
  expect(manager.asked).to.equal(1);
  expect(current(), 'still open').to.have.lengthOf(1);
});

it('drops the old app tasks when another app is mounted in its place', async () => {
  app().report({ id: 'render', state: 'running' });
  await settle();
  class QuietAppElement extends HTMLElement {}
  customElements.define('umbradesktop-progress-quiet-app', QuietAppElement);
  body().load = QuietAppElement;
  await body().mountComplete;
  await settle();
  expect(current()[0].progress).to.equal(undefined);
});

it('does not let the event escape the window, where something else might take it for its own', async () => {
  let escaped = false;
  const listener = () => (escaped = true);
  wrapper.addEventListener(UMBRADESKTOP_TASK_EVENT, listener);
  app().report({ id: 'render', state: 'running' });
  wrapper.removeEventListener(UMBRADESKTOP_TASK_EVENT, listener);
  expect(escaped).to.equal(false);
});
