import { expect, waitUntil } from '@open-wc/testing';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbNotificationContext } from '@umbraco-cms/backoffice/notification';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { lowerBootSplash } from '../boot/splash';
import { clearBootAttempt } from '../boot/boot-storage';
import { UMBRADESKTOP_DESKTOP_SOURCE_ID } from '../notifications/types.js';
import './desktop.element';
import type { UmbraDesktopDesktopElement } from './desktop.element';

/**
 * How long to wait for the watcher's poll. It polls every 100ms, but a page the runner has in the
 * background has its intervals throttled to once a second, so the default one-second wait loses the
 * race whenever several files are in flight.
 */
const POLL_WAIT = { timeout: 5000 };

/**
 * The desktop's own half: a notification raised by the backoffice the desktop is running in, rather
 * than inside any window, also appears once on the desktop, and leaving the desktop hands the
 * document its own toasts back.
 *
 * The page stands in for that backoffice with core's real notification context on a host element and
 * a container two shadow roots below it, the shape the watcher's own test uses.
 */

/** A host for core's notification context, standing where `umb-app` stands. */
@customElement('umbradesktop-test-desktop-notification-host')
class TestHost extends UmbLitElement {}

let context: UmbNotificationContext;
let containerRoot: ShadowRoot;

beforeEach(() => {
  window.sessionStorage.clear();
  const host = document.createElement('umbradesktop-test-desktop-notification-host') as TestHost;
  document.body.appendChild(host);
  context = new UmbNotificationContext(host);
  const inner = document.createElement('div');
  host.shadowRoot!.appendChild(inner);
  const container = document.createElement('umb-backoffice-notification-container');
  inner.attachShadow({ mode: 'open' }).appendChild(container);
  containerRoot = container.attachShadow({ mode: 'open' });
});

afterEach(() => {
  lowerBootSplash();
  clearBootAttempt();
  document.body.innerHTML = '';
  window.sessionStorage.clear();
});

/**
 * Mount a painted desktop.
 * @returns The desktop.
 */
async function mountDesktop(): Promise<UmbraDesktopDesktopElement> {
  const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
  document.body.appendChild(desktop);
  desktop.reportSettingsLoaded(true);
  await desktop.updateComplete;
  return desktop;
}

it("shows the desktop's own notifications on the desktop, as the desktop's", async () => {
  const desktop = await mountDesktop();
  await waitUntil(() => containerRoot.querySelector('style'), "the desktop's own document should be taken over", POLL_WAIT);

  context.peek('danger', { data: { message: 'Something broke' } });
  await desktop.updateComplete;

  const toasts = desktop.renderRoot.querySelector('umbradesktop-toasts');
  expect(toasts, 'the desktop draws a toast stack').to.exist;
  await waitUntil(() => toasts!.shadowRoot?.textContent?.includes('Something broke'), 'the toast should be drawn');
  const entries = await new Promise<Array<{ sourceId: string }>>((resolve) =>
    desktop.notificationsForTest.entries.subscribe((e) => resolve(e as Array<{ sourceId: string }>)).unsubscribe(),
  );
  expect(entries[0].sourceId).to.equal(UMBRADESKTOP_DESKTOP_SOURCE_ID);
});

it('hands the document its own toasts back when the desktop goes', async () => {
  const desktop = await mountDesktop();
  await waitUntil(() => containerRoot.querySelector('style'), undefined, POLL_WAIT);

  desktop.remove();

  expect(containerRoot.querySelector('style'), 'leaving the desktop lifts the hiding rule').to.equal(null);
});
