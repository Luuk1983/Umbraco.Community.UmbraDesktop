import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The window's half of the unsaved-changes guard: the titlebar marker, and the two controls that
 * could throw the work away going through the manager's guard instead of straight at the window.
 *
 * The manager here is real — only its dialog is substituted — because what these tests are for is
 * the *wiring*. A close button that called `close` instead of `requestClose` would still pass every
 * test in `window-manager.test.ts`.
 */

/** A throwaway app; `about:blank` loads instantly and boots no backoffice. */
const APP: UmbraDesktopApp = {
  alias: 'dirty-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  content: { kind: 'iframe', url: 'about:blank' },
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

/**
 * Mounting a chrome component is documented as slow in this runner (see `mount-themed.ts`), so the
 * window is mounted once for the file and re-pointed at a fresh window per test.
 */
const MOUNT_TIMEOUT_MS = 20_000;

let wrapper: HTMLElement;
let host: UmbElementControllerHost;
let manager: ProbeManager;
let element: UmbraDesktopWindowElement;

before(async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  wrapper = document.createElement('div');
  document.body.appendChild(wrapper);

  host = new UmbElementControllerHost(wrapper);
  manager = new ProbeManager(host);
  // Provided on the wrapper by hand rather than by mounting a whole desktop: the window element
  // consumes the manager from its ancestors, and that is all it needs to be a real consumer.
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();

  element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  wrapper.appendChild(element);
  await element.updateComplete;
});

after(() => {
  host?.destroy();
  wrapper?.remove();
});

/**
 * Open a fresh window on the manager and point the mounted element at it.
 * @param dirty Whether the new window holds unsaved changes.
 * @returns The window the element is now rendering.
 */
async function showWindow(dirty: boolean): Promise<UmbraDesktopWindow> {
  for (const open of [...current()]) manager.close(open.id);
  manager.answer = true;
  manager.asked = 0;
  manager.open(APP);
  const opened = current()[0];
  if (dirty) manager.setDirty(opened.id, true);
  const win = current()[0];
  element.window = win;
  await element.updateComplete;
  return win;
}

/**
 * The manager's window list, read synchronously.
 * @returns The open windows.
 */
function current(): UmbraDesktopWindow[] {
  let list: UmbraDesktopWindow[] = [];
  manager.windows.subscribe((value) => (list = value as UmbraDesktopWindow[])).unsubscribe();
  return list;
}

/**
 * A control in the mounted window's titlebar.
 * @param selector The control's class selector.
 * @returns The button.
 */
function control(selector: string): HTMLButtonElement {
  return element.shadowRoot!.querySelector(selector) as HTMLButtonElement;
}

it('shows no marker on a window with nothing unsaved', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  await showWindow(false);
  expect(element.shadowRoot!.querySelector('.dirty')).to.equal(null);
});

it('marks the titlebar of a window holding unsaved changes', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  await showWindow(true);
  const marker = element.shadowRoot!.querySelector('.dirty') as HTMLElement;

  expect(marker, 'a dirty window carries a marker').to.not.equal(null);
  expect(marker.getBoundingClientRect().width, 'and it is actually painted').to.be.greaterThan(0);
  expect(
    element.shadowRoot!.querySelector('.title')!.contains(marker),
    'it belongs to the title, so it sits beside the name rather than among the buttons',
  ).to.equal(true);
  expect(marker.getAttribute('title'), 'and it says what it means, for a tooltip and a screen reader')
    .to.be.a('string')
    .that.has.length.greaterThan(0);
});

it('clears the marker again once the content is saved', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  const win = await showWindow(true);
  manager.setDirty(win.id, false);
  element.window = current()[0];
  await element.updateComplete;

  expect(element.shadowRoot!.querySelector('.dirty')).to.equal(null);
});

it('closes a clean window on the first click, with no dialog', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  await showWindow(false);

  control('.ctrl-close').click();
  await new Promise((resolve) => setTimeout(resolve));

  expect(manager.asked).to.equal(0);
  expect(current(), 'the window closed').to.have.lengthOf(0);
});

it('asks before closing a marked window, and keeps it when the answer is no', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  await showWindow(true);
  manager.answer = false;

  control('.ctrl-close').click();
  await new Promise((resolve) => setTimeout(resolve));

  expect(manager.asked, 'the close button goes through the guard').to.equal(1);
  expect(current(), 'and cancelling leaves the window open').to.have.lengthOf(1);
  expect(current()[0].dirty, 'still holding its edits').to.equal(true);
});

it('closes a marked window when the discard is confirmed', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  await showWindow(true);
  manager.answer = true;

  control('.ctrl-close').click();
  await new Promise((resolve) => setTimeout(resolve));

  expect(manager.asked).to.equal(1);
  expect(current()).to.have.lengthOf(0);
});

it('asks before the reload button discards a marked window, and leaves the frame alone on no', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  await showWindow(true);
  manager.answer = false;
  const frame = element.shadowRoot!.querySelector('iframe.body') as HTMLIFrameElement;
  const before = frame.contentWindow;

  control('.ctrl-reload').click();
  await new Promise((resolve) => setTimeout(resolve));

  expect(manager.asked, 'reload is a third way to lose the work, so it asks the same question').to.equal(1);
  expect(frame.contentWindow, 'and refusing leaves the frame untouched').to.equal(before);
});

it('does not ask before reloading a window with nothing unsaved', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  await showWindow(false);

  control('.ctrl-reload').click();
  await new Promise((resolve) => setTimeout(resolve));

  expect(manager.asked).to.equal(0);
});
