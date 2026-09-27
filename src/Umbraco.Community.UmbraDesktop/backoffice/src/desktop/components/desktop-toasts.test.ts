import { expect, waitUntil } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import type { UmbraDesktopNotification } from '../notifications/types.js';
import type { UmbraDesktopToastsElement } from './desktop-toasts.element.js';
import './desktop-toasts.element.js';

/**
 * The stack is what the multiplication stopped for, so these check what somebody sees: the message,
 * who raised it, how many times, and that it goes when its sender said it should and not before.
 */

/** A window manager that only records focus. */
const windows = {
  focused: [] as string[],
  focus(id: string) {
    this.focused.push(id);
  },
  getWindows: () => [{ id: 'w-a' }],
};

/** A stand-in store, so these never touch the real session. */
function memoryStore(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  } as unknown as Storage;
}

/**
 * A stack under a centre it can consume, the way the desktop provides one.
 * @returns The stack element and the centre feeding it.
 */
async function stack() {
  // By hand rather than through 'fixture', whose 'nextFrame()' never resolves in the backgrounded
  // pages the runner uses with several files in flight; 'desktop-boot.test' says the same.
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const centre = new UmbraDesktopNotificationCentreContext(host, windows, { store: memoryStore() });
  // A controller host provides nothing until it is connected, which an element host is by the DOM
  // and this bare one has to be told.
  host.hostConnected();
  const element = document.createElement('umbradesktop-toasts') as UmbraDesktopToastsElement;
  wrapper.appendChild(element);
  await element.updateComplete;
  return { element, centre };
}

/**
 * A notification as a watcher hands it over.
 * @param message Its text.
 * @param extra Anything else.
 * @returns The notification.
 */
function note(message: string, extra: Partial<UmbraDesktopNotification> = {}): UmbraDesktopNotification {
  return { key: `${message}-${Math.random()}`, color: 'warning', duration: 6000, message, ...extra };
}

/** The toasts on screen. */
function toasts(element: HTMLElement): HTMLElement[] {
  return [...(element.shadowRoot?.querySelectorAll<HTMLElement>('.toast') ?? [])];
}

const A = { sourceId: 'w-a', source: 'Content' };

beforeEach(() => (windows.focused = []));
afterEach(() => (document.body.innerHTML = ''));

it('draws a toast with its headline, message, source and severity', async () => {
  const { element, centre } = await stack();
  centre.raise(note('The license is invalid', { headline: 'Deploy' }), A);
  await element.updateComplete;

  const [toast] = toasts(element);
  expect(toast, 'a raised notification should be drawn').to.exist;
  expect(toast.textContent).to.contain('Deploy');
  expect(toast.textContent).to.contain('The license is invalid');
  expect(toast.textContent).to.contain('Content');
  expect(toast.dataset.color).to.equal('warning');
});

it('says how many times a repeat has arrived, on the one toast', async () => {
  const { element, centre } = await stack();
  centre.raise(note('Again'), A);
  centre.raise(note('Again'), A);
  await element.updateComplete;

  expect(toasts(element)).to.have.length(1);
  expect(toasts(element)[0].querySelector('.toast-count')?.textContent).to.contain('2');
});

it('closes itself after the duration its sender chose', async () => {
  const { element, centre } = await stack();
  centre.raise(note('Brief', { duration: 60 }), A);
  await element.updateComplete;
  expect(toasts(element)).to.have.length(1);

  await waitUntil(() => toasts(element).length === 0, 'a timed toast should close itself', { timeout: 1000 });
});

it('stays when its sender asked it to stay', async () => {
  const { element, centre } = await stack();
  centre.raise(note('Staying', { duration: null }), A);
  await new Promise((r) => setTimeout(r, 150));
  await element.updateComplete;
  expect(toasts(element)).to.have.length(1);
});

it('starts its timer over when a repeat arrives', async () => {
  const { element, centre } = await stack();
  centre.raise(note('Refresh', { duration: 200 }), A);
  await new Promise((r) => setTimeout(r, 130));
  centre.raise(note('Refresh', { duration: 200 }), A);
  await new Promise((r) => setTimeout(r, 130));
  await element.updateComplete;
  expect(toasts(element), 'past the first deadline, inside the second').to.have.length(1);
  await waitUntil(() => toasts(element).length === 0, 'it still closes on the new deadline', { timeout: 1000 });
});

it('holds a toast while the pointer is over the stack', async () => {
  const { element, centre } = await stack();
  centre.raise(note('Reading', { duration: 80 }), A);
  await element.updateComplete;
  element.shadowRoot!.querySelector('.stack')!.dispatchEvent(new PointerEvent('pointerenter'));
  await new Promise((r) => setTimeout(r, 160));
  expect(toasts(element), 'a toast being read does not close under the pointer').to.have.length(1);
  element.shadowRoot!.querySelector('.stack')!.dispatchEvent(new PointerEvent('pointerleave'));
  await waitUntil(() => toasts(element).length === 0, 'and closes once the pointer leaves', { timeout: 1000 });
});

it('stands aside while the list behind the clock is open, and holds its timers', async () => {
  const { element, centre } = await stack();
  centre.raise(note('Waiting', { duration: 80 }), A);
  await element.updateComplete;
  centre.setListOpen(true);
  await element.updateComplete;
  const stackEl = element.shadowRoot!.querySelector('.stack') as HTMLElement;
  expect(getComputedStyle(stackEl).visibility, 'the list is showing the same thing').to.equal('hidden');
  await new Promise((r) => setTimeout(r, 160));
  expect(toasts(element), 'nothing times out behind the list').to.have.length(1);

  centre.setListOpen(false);
  await element.updateComplete;
  expect(getComputedStyle(stackEl).visibility).to.equal('visible');
  await waitUntil(() => toasts(element).length === 0, 'and it runs on once the list closes', { timeout: 1000 });
});

it('focuses the window that raised it when clicked, and goes', async () => {
  const { element, centre } = await stack();
  centre.raise(note('Click me'), A);
  await element.updateComplete;

  toasts(element)[0].querySelector<HTMLElement>('.toast-body')!.click();
  await element.updateComplete;

  expect(windows.focused).to.deep.equal(['w-a']);
  expect(toasts(element)).to.have.length(0);
});

it('can be closed without focusing anything', async () => {
  const { element, centre } = await stack();
  centre.raise(note('Close me', { duration: null }), A);
  await element.updateComplete;

  toasts(element)[0].querySelector<HTMLElement>('.toast-close')!.click();
  await element.updateComplete;

  expect(windows.focused).to.deep.equal([]);
  expect(toasts(element)).to.have.length(0);
});
