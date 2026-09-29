import { expect, waitUntil } from '@open-wc/testing';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbNotificationContext } from '@umbraco-cms/backoffice/notification';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UMBRADESKTOP_REPLAYED_ATTRIBUTE, watchNotifications } from './notification-watcher.js';
import type { UmbraDesktopNotification } from './types.js';

/**
 * How long to wait for the watcher's poll. It polls every 100ms, but a page the runner has in the
 * background has its intervals throttled to once a second, so the default one-second wait loses the
 * race whenever several files are in flight.
 */
const POLL_WAIT = { timeout: 5000 };

/**
 * The watcher is run against core's own notification context, provided by a real host element, and
 * a stand-in for the container placed inside that host's shadow root the way the backoffice shell
 * places the real one. So the request the watcher sends travels the real path, up from the container
 * to its provider, and the handlers it reads are the ones `peek` really builds.
 *
 * The container is a stand-in because the real one renders through UUI's popover machinery, which
 * is not what is under test. What is under test is that the watcher finds it, asks it, and hides the
 * toasts inside it only once it is listening, and those only need an element with that tag and a
 * shadow root. Toasts are placed into that shadow root by hand, which is what the real container's
 * render does with `handler.element`.
 */

/** A host for core's notification context, standing where `umb-app` stands in a real frame. */
@customElement('umbradesktop-test-notification-host')
class TestNotificationHost extends UmbLitElement {}

/** A backoffice shell in miniature: a provider, and a container two shadow roots below it. */
interface Shell {
  /** The provider element. */
  host: TestNotificationHost;
  /** Core's context, provided by the host. */
  context: UmbNotificationContext;
  /** The stand-in container. Absent until {@link mountContainer} is called. */
  container?: HTMLElement;
  /** Put the container in, the way the shell mounts it after boot. */
  mountContainer(): HTMLElement;
  /** Render a handler's element into the container, as the real container does. */
  render(element: HTMLElement): void;
}

/**
 * Build a shell.
 * @returns The shell, in the document.
 */
function shell(): Shell {
  const host = document.createElement('umbradesktop-test-notification-host') as TestNotificationHost;
  document.body.appendChild(host);
  const context = new UmbNotificationContext(host);
  const inner = document.createElement('div');
  (host.shadowRoot ?? host.attachShadow({ mode: 'open' })).appendChild(inner);
  const innerRoot = inner.attachShadow({ mode: 'open' });
  const result: Shell = {
    host,
    context,
    mountContainer() {
      const container = document.createElement('umb-backoffice-notification-container');
      container.attachShadow({ mode: 'open' });
      innerRoot.appendChild(container);
      result.container = container;
      return container;
    },
    render(element) {
      result.container!.shadowRoot!.appendChild(element);
    },
  };
  return result;
}

/**
 * Take a handler out of core's list, which is what core does when a toast closes. `_close` is
 * private in core's types and public at runtime; its toast's own 'closed' event is what calls it,
 * and the stand-in container here renders no real toast to fire one.
 * @param context Core's context.
 * @param key The handler's key.
 */
function closeInCore(context: UmbNotificationContext, key: string): void {
  (context as unknown as { _close(key: string): void })._close(key);
}

/** Whether a toast element is being drawn. */
function drawn(element: HTMLElement): boolean {
  return getComputedStyle(element).display !== 'none';
}

let stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  document.body.innerHTML = '';
});

it('finds a container that mounts late, then reports what is raised in it', async () => {
  const s = shell();
  const raised: UmbraDesktopNotification[] = [];
  stops.push(watchNotifications(document, { onRaised: (n) => raised.push(n) }).stop);

  s.mountContainer();
  await waitUntil(() => s.container!.shadowRoot!.querySelector('style'), 'the watcher should find the container', POLL_WAIT);
  s.context.peek('warning', { data: { message: 'License invalid' } });

  expect(raised.map((n) => n.message)).to.deep.equal(['License invalid']);
  expect(raised[0].color).to.equal('warning');
});

it('hides the toasts inside the document once it is listening, and not before', async () => {
  const s = shell();
  s.mountContainer();
  const early = s.context.peek('default', { data: { message: 'Before' } });
  s.render(early.element);
  expect(drawn(early.element), 'nothing is hidden in a document nobody is watching yet').to.equal(true);

  const raised: string[] = [];
  stops.push(watchNotifications(document, { onRaised: (n) => raised.push(n.message) }).stop);
  await waitUntil(() => !drawn(early.element), 'the watcher should hide toasts once it is listening', POLL_WAIT);

  expect(raised, 'what was already on screen moves to the desktop rather than vanishing').to.deep.equal(['Before']);
  const later = s.context.peek('default', { data: { message: 'After' } });
  s.render(later.element);
  expect(drawn(later.element)).to.equal(false);
});

it('reports each notification once, however often the list changes', async () => {
  const s = shell();
  s.mountContainer();
  const raised: string[] = [];
  stops.push(watchNotifications(document, { onRaised: (n) => raised.push(n.message) }).stop);
  await waitUntil(() => s.container!.shadowRoot!.querySelector('style'), undefined, POLL_WAIT);

  const first = s.context.peek('default', { data: { message: 'One' } });
  s.context.peek('default', { data: { message: 'Two' } });
  first.close();
  closeInCore(s.context, first.key);

  expect(raised).to.deep.equal(['One', 'Two']);
});

it('says when a notification leaves the list, so a staying toast can follow its sender', async () => {
  const s = shell();
  s.mountContainer();
  const closed: string[] = [];
  stops.push(watchNotifications(document, { onRaised: () => {}, onClosed: (key) => closed.push(key) }).stop);
  await waitUntil(() => s.container!.shadowRoot!.querySelector('style'), undefined, POLL_WAIT);

  const stay = s.context.stay('default', { data: { message: 'Working' } });
  closeInCore(s.context, stay.key);

  expect(closed).to.deep.equal([stay.key]);
});

it('raises a notification again visibly, and does not report it a second time', async () => {
  const s = shell();
  s.mountContainer();
  const raised: UmbraDesktopNotification[] = [];
  const watch = watchNotifications(document, { onRaised: (n) => raised.push(n) });
  stops.push(watch.stop);
  await waitUntil(() => s.container!.shadowRoot!.querySelector('style'), undefined, POLL_WAIT);

  s.context.peek('danger', {
    elementName: 'umb-peek-error-notification',
    data: { message: 'Could not save', errors: { name: ['Required'] } },
  });
  expect(raised).to.have.length(1);

  watch.reraise(raised[0]);

  expect(raised, 'raising it again is not a new notification').to.have.length(1);
  const handlers = await new Promise<unknown[]>((resolve) =>
    s.context.notifications.subscribe((list) => resolve(list)).unsubscribe(),
  );
  const again = handlers[handlers.length - 1] as { element: HTMLElement; _elementName: string; _data: unknown; color: string };
  expect(again._elementName, 'raised with the element it carried').to.equal('umb-peek-error-notification');
  expect(again._data).to.deep.equal({ message: 'Could not save', errors: { name: ['Required'] } });
  expect(again.color).to.equal('danger');
  s.render(again.element);
  expect(again.element.hasAttribute(UMBRADESKTOP_REPLAYED_ATTRIBUTE)).to.equal(true);
  expect(drawn(again.element), 'the one raised again is shown, so its actions can be used').to.equal(true);
});

it('lifts the hiding rule when it stops, and stops reporting', async () => {
  const s = shell();
  s.mountContainer();
  const raised: string[] = [];
  const watch = watchNotifications(document, { onRaised: (n) => raised.push(n.message) });
  await waitUntil(() => s.container!.shadowRoot!.querySelector('style'), undefined, POLL_WAIT);

  watch.stop();
  const after = s.context.peek('default', { data: { message: 'Unwatched' } });
  s.render(after.element);

  expect(raised).to.deep.equal([]);
  expect(drawn(after.element), 'a document that is no longer watched draws its own toasts again').to.equal(true);
});

it('does nothing when asked to raise again before it has a context', () => {
  const watch = watchNotifications(document, { onRaised: () => {} });
  stops.push(watch.stop);
  expect(() => watch.reraise({ key: 'k', color: 'default', duration: 10, message: 'x' })).to.not.throw();
});
