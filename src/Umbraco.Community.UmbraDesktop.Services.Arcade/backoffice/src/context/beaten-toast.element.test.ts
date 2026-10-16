import { expect, fixture, html, waitUntil } from '@open-wc/testing';
// Defines core's `umb-backoffice-notification-container`, the toast container the backoffice renders.
import '@umbraco-cms/backoffice/components';
import { customElement, html as litHtml } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbNotificationContext } from '@umbraco-cms/backoffice/notification';
import type { UmbNotificationHandler } from '@umbraco-cms/backoffice/notification';
import { clearActiveArcade, setActiveArcade, whileRaising } from './active-arcade.js';
import { ARCADE_BEATEN_TOAST_ELEMENT } from './beaten-toast.element.js';
import type { UmbraDesktopArcadeBeatenToastElement } from './beaten-toast.element.js';

/** Hosts core's notification context and its container, as the backoffice's app element does. */
@customElement('umbradesktop-arcade-toast-test-host')
class ToastTestHost extends UmbLitElement {
  /** @returns A slot, so the container is in the flat tree and its toasts get laid out at all. */
  override render() {
    return litHtml`<slot></slot>`;
  }
}

/** What the Arcade puts in the toast: plain strings, as the desktop's JSON copy keeps them. */
const data = { headline: 'Bram took first place from you on Snake', message: '510 beats your 480. You are 2nd now.', game: 'Pkg.Snake.Game', board: 'default' };

/** The stand-in registered by the current test, cleared after each so no test sees another's. */
let registered: { showBoard(game: string, board?: string): boolean } | undefined;

/** The toasts the current test put in the document, removed after each. */
const built: HTMLElement[] = [];

afterEach(() => {
  if (registered) clearActiveArcade(registered);
  registered = undefined;
  for (const toast of built.splice(0)) toast.remove();
});

/**
 * A stand-in for the Arcade context, recording what it was asked to show.
 * @param opens What `showBoard` answers.
 * @returns The boards asked for, as `game:board`.
 */
function fakeArcade(opens = true) {
  const shown: string[] = [];
  registered = { showBoard: (game: string, board?: string) => { shown.push(`${game}:${board}`); return opens; } };
  setActiveArcade(registered);
  return shown;
}

/**
 * Build the element the way core's notification handler does: create, then set data and handler,
 * then put it in a toast in the document.
 * @param raisedByArcade Whether to construct it inside `whileRaising`, as the Arcade's own `peek` does.
 * @returns The element, what its handler was asked to close, and the toast around it.
 */
function build(raisedByArcade: boolean) {
  const closed: string[] = [];
  const toast = document.createElement('div');
  const create = () => document.createElement(ARCADE_BEATEN_TOAST_ELEMENT) as UmbraDesktopArcadeBeatenToastElement;
  const element = raisedByArcade ? whileRaising(create) : create();
  element.data = data;
  element.notificationHandler = { close: () => closed.push('closed'), element: toast };
  toast.append(element);
  built.push(toast);
  document.body.append(toast);
  return { element, closed, toast };
}

it('does nothing as the Arcade\'s own toast, which the desktop hides and draws itself', async () => {
  const shown = fakeArcade();
  const { closed } = build(true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(shown).to.deep.equal([]);
  expect(closed).to.deep.equal([]);
});

it('opens the board and closes itself when the desktop raises it again because the player selected it', async () => {
  const shown = fakeArcade();
  const { closed, toast } = build(false);
  await waitUntil(() => shown.length === 1, 'board shown');
  expect(shown).to.deep.equal(['Pkg.Snake.Game:default']);
  expect(toast.style.display).to.equal('none');
  // uui ignores a close until its toast has opened, so the element waits for that.
  expect(closed).to.deep.equal([]);
  toast.dispatchEvent(new Event('opened'));
  expect(closed).to.deep.equal(['closed']);
});

it('in core\'s real container, opens the board once, is never displayed, and leaves core\'s list', async () => {
  // The real chain: core's context builds the uui toast closed, its container appends it (which
  // connects this element), and only then does the uui container's slotchange open it.
  const shown = fakeArcade();
  const host = await fixture<ToastTestHost>(html`<umbradesktop-arcade-toast-test-host></umbradesktop-arcade-toast-test-host>`);
  const notifications = new UmbNotificationContext(host);
  const container = document.createElement('umb-backoffice-notification-container');
  host.append(container);
  // Rendered before the toast, so the emission that adds it opens the container's popover, as on a live page.
  await container.updateComplete;
  let live: UmbNotificationHandler[] = [];
  notifications.notifications.subscribe((list) => (live = list));
  const handler = notifications.peek('warning', { elementName: ARCADE_BEATEN_TOAST_ELEMENT, data } as never);
  // What the desktop's reraise does, so its hiding rule would let the toast through.
  handler.element.setAttribute('umbradesktop-replayed', '');
  const toast = handler.element;
  let displayed = false;
  /** Samples every frame whether the toast is laid out, from its opening until it is gone. */
  const watch = () => {
    if (toast.getClientRects().length > 0) displayed = true;
    if (live.length > 0) requestAnimationFrame(watch);
  };
  watch();
  await waitUntil(() => shown.length === 1, 'board shown');
  await waitUntil(() => live.length === 0, 'core still lists the toast', { timeout: 3000 });
  expect(shown).to.deep.equal(['Pkg.Snake.Game:default']);
  expect(displayed).to.equal(false);
  expect(toast.isConnected).to.equal(false);
});

it('stays readable, with its link, when there is no Arcade to open', async () => {
  const { element, closed } = build(false);
  await element.updateComplete;
  expect(element.shadowRoot!.textContent).to.contain('Bram took first place').and.contain('You are 2nd now');
  expect(element.shadowRoot!.querySelector('[data-action="open"]')).to.not.equal(null);
  expect(closed).to.deep.equal([]);
});
