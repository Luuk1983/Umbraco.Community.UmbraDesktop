import { expect, waitUntil } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import { UMBRADESKTOP_DESKTOP_SOURCE_ID, type UmbraDesktopNotification } from '../notifications/types.js';
import type { UmbraDesktopNotificationLayoutHandler } from '../notifications/own-element.js';
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

/**
 * A notification layout of the kind a package raises on the desktop: it keeps what it is given, so
 * a test can read back its data and call its handler the way a button inside it would. Design D15.
 */
class TestNoteElement extends HTMLElement {
  /** The data the toast handed it. */
  data: unknown;
  /** The handler the toast handed it. */
  notificationHandler?: UmbraDesktopNotificationLayoutHandler;
}
customElements.define('test-note', TestNoteElement);

/** A second layout, for a repeat that names a different element than the toast it refreshes. */
class TestOtherNoteElement extends TestNoteElement {}
customElements.define('test-other-note', TestOtherNoteElement);

/**
 * Umbraco's peek-error layout, or a stand-in under its name when nothing on this page has loaded
 * the real one. The name is what matters: D15 draws core's own non-default layouts too, on purpose.
 */
if (!customElements.get('umb-peek-error-notification')) {
  customElements.define('umb-peek-error-notification', class extends TestNoteElement {});
}

const DESKTOP = { sourceId: UMBRADESKTOP_DESKTOP_SOURCE_ID, source: 'Desktop' };

/**
 * The layout elements the stack is drawing.
 * @param element The stack.
 * @returns Every test-note in it.
 */
function notes(element: HTMLElement): TestNoteElement[] {
  return [...(element.shadowRoot?.querySelectorAll<TestNoteElement>('test-note') ?? [])];
}

it('draws the element of a notification the desktop raised itself, and not one from a window', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: { x: 1 } } }), DESKTOP);
  centre.raise(note('n', { duration: null, element: { name: 'test-note', data: { x: 2 } } }), A);
  await element.updateComplete;

  expect(notes(element)).to.have.length(1);
  expect(notes(element)[0].data).to.deep.equal({ x: 1 });
  const [own, plain] = toasts(element);
  expect(own.querySelector('.toast-body'), "the element takes the body's place").to.equal(null);
  expect(own.querySelector('.toast-close'), 'and the toast can still be closed').to.exist;
  expect(plain.querySelector('.toast-body'), "a window's notification stays plain data").to.exist;
});

it('dismisses the toast when its element closes its handler', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: {} } }), DESKTOP);
  await element.updateComplete;

  notes(element)[0].notificationHandler!.close();
  await element.updateComplete;

  expect(notes(element)).to.have.length(0);
  expect(toasts(element)).to.have.length(0);
});

it('keeps the element through a repeat, and hands it the new data', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: { x: 1 } } }), DESKTOP);
  await element.updateComplete;
  const first = notes(element)[0];

  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: { x: 2 } } }), DESKTOP);
  await element.updateComplete;

  expect(notes(element)).to.have.length(1);
  expect(notes(element)[0], 'the same element, so nothing it holds is lost').to.equal(first);
  expect(first.data).to.deep.equal({ x: 2 });
});

it('starts a new element once the toast has gone and comes back', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: {} } }), DESKTOP);
  await element.updateComplete;
  const first = notes(element)[0];
  toasts(element)[0].querySelector<HTMLElement>('.toast-close')!.click();
  await element.updateComplete;

  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: {} } }), DESKTOP);
  await element.updateComplete;
  expect(notes(element)[0]).to.not.equal(first);
});

it('draws a plain toast for a desktop notification whose element is not defined', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { element: { name: 'test-undefined-note', data: {} } }), DESKTOP);
  await element.updateComplete;

  expect(element.shadowRoot!.querySelector('test-undefined-note')).to.equal(null);
  expect(toasts(element)[0].querySelector('.toast-body')).to.exist;
});

it('closes a timed toast with an element after its duration, like any other', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { duration: 60, element: { name: 'test-note', data: {} } }), DESKTOP);
  await element.updateComplete;
  expect(notes(element)).to.have.length(1);

  await waitUntil(() => toasts(element).length === 0, 'a timed toast should close itself', { timeout: 1000 });
});

it("draws Umbraco's own non-default layouts raised on the desktop too", async () => {
  const { element, centre } = await stack();
  const data = { headline: 'Could not save', message: 'Something went wrong' };
  centre.raise(note('Could not save', { color: 'danger', element: { name: 'umb-peek-error-notification', data } }), DESKTOP);
  await element.updateComplete;

  const peek = element.shadowRoot!.querySelector('umb-peek-error-notification') as TestNoteElement | null;
  expect(peek, "drawn on the desktop toast, not raised again as core's own").to.exist;
  expect(peek!.data).to.deep.equal(data);
});

it("hands its element a handler with the basics of Umbraco's", async () => {
  const { element, centre } = await stack();
  const raised = note('m', { color: 'positive', duration: null, element: { name: 'test-note', data: {} } });
  centre.raise(raised, DESKTOP);
  await element.updateComplete;
  const handler = notes(element)[0].notificationHandler!;

  expect(handler.key).to.equal(raised.key);
  expect(handler.color).to.equal('positive');
  expect(handler.duration).to.equal(null);
  expect(() => ((handler as { key: string }).key = 'other'), 'read-only').to.throw();

  let closed = false;
  void handler.onClose().then(() => (closed = true));
  toasts(element)[0].querySelector<HTMLElement>('.toast-close')!.click();
  await element.updateComplete;
  await Promise.resolve();
  expect(closed, 'onClose settles once the toast has gone, however it went').to.equal(true);
});

it('makes the element again when a repeat names a different one', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: { x: 1 } } }), DESKTOP);
  await element.updateComplete;
  const first = notes(element)[0];
  let firstClosed = false;
  void first.notificationHandler!.onClose().then(() => (firstClosed = true));

  centre.raise(note('m', { duration: null, element: { name: 'test-other-note', data: { x: 2 } } }), DESKTOP);
  await element.updateComplete;
  await Promise.resolve();

  const other = element.shadowRoot!.querySelectorAll<TestNoteElement>('test-other-note');
  expect(other).to.have.length(1);
  expect(other[0].data).to.deep.equal({ x: 2 });
  expect(notes(element), 'the old one is gone').to.have.length(0);
  expect(firstClosed, 'and its handler settled, since its toast is gone as far as it knows').to.equal(true);
});

it('lets go of the element when a repeat from a window takes the toast over', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: {} } }), DESKTOP);
  await element.updateComplete;
  let closed = false;
  void notes(element)[0].notificationHandler!.onClose().then(() => (closed = true));

  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: {} } }), A);
  await element.updateComplete;
  await Promise.resolve();

  expect(notes(element)).to.have.length(0);
  expect(toasts(element)[0].querySelector('.toast-body'), "a window's toast is plain").to.exist;
  expect(closed).to.equal(true);
});

it('lets go of every element when the stack leaves the page', async () => {
  const { element, centre } = await stack();
  centre.raise(note('m', { duration: null, element: { name: 'test-note', data: {} } }), DESKTOP);
  await element.updateComplete;
  let closed = false;
  void notes(element)[0].notificationHandler!.onClose().then(() => (closed = true));

  element.remove();
  await Promise.resolve();

  expect(closed, 'a sender awaiting onClose is not left waiting on a desktop that has gone').to.equal(true);
});
