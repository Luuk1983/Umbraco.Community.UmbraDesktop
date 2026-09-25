import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * What a `resizable: false` window looks like and does, driven through the rendered chrome.
 *
 * The manager's own tests pin the rule; these pin that the chrome tells the truth about it. A
 * maximize button that looks live but does nothing is worse than none, so the window simply has no
 * maximize button, which is what Windows shows for a window that cannot be maximized. This is the
 * app's choice, not a theme's, so it sits apart from the rule that a theme may restyle chrome but
 * never remove it: every theme draws the same, smaller set of controls for such a window.
 */

/** The desktop these cases lay the window out on. */
const BOUNDS = { w: 1000, h: 700 };

/** An app that asked to keep its size. */
const FIXED: UmbraDesktopApp = {
  alias: 'fixed',
  name: 'Fixed',
  icon: 'icon-umbraco',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
  resizable: false,
};

/** How long a mounted case may take, well above Mocha's default: a window renders a frame. */
const TIMEOUT_MS = 20_000;

/** Everything a case mounted, torn down after it. */
let cleanup: Array<() => void> = [];

afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A manager, a surface pinned to the viewport's corner, and one window of `app` rendered on it.
 * The same arrangement `window-snap.test.ts` uses, so client and surface coordinates coincide.
 * @param app The app to open.
 * @returns The mounted element and a function reading the live window state.
 */
async function mountWindow(app: UmbraDesktopApp) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:fixed; left:0; top:0; width:${BOUNDS.w}px; height:${BOUNDS.h}px;`;
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  manager.clampToBounds(BOUNDS);
  cleanup.push(() => {
    host.destroy();
    wrapper.remove();
  });

  manager.open(app);
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  wrapper.appendChild(element);

  /** The window the manager currently holds. */
  const state = (): UmbraDesktopWindow => {
    let list: ReadonlyArray<UmbraDesktopWindow> = [];
    manager.windows.subscribe((value) => (list = value)).unsubscribe();
    return list[0];
  };
  element.window = { ...state() };
  await element.updateComplete;
  return { element, state };
}

/**
 * Dispatch one pointer event on the window's titlebar.
 * @param element The mounted window.
 * @param type The event type.
 * @param x Client x.
 * @param y Client y.
 */
function pointer(element: UmbraDesktopWindowElement, type: string, x: number, y: number) {
  const titlebar = element.shadowRoot!.querySelector('.titlebar') as HTMLElement;
  titlebar.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, composed: true }),
  );
}

it('has no maximize button, and keeps minimize and close', async function () {
  this.timeout(TIMEOUT_MS);
  const { element } = await mountWindow(FIXED);
  expect(element.shadowRoot!.querySelector('.ctrl-maximize'), 'left out, as Windows does').to.equal(null);
  expect(element.shadowRoot!.querySelector('.ctrl-minimize')).to.not.equal(null);
  expect(element.shadowRoot!.querySelector('.ctrl-close')).to.not.equal(null);
});

it('ignores a double-click on the titlebar', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, state } = await mountWindow(FIXED);
  element.shadowRoot!.querySelector('.titlebar')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(state().state).to.equal('normal');
});

it('has no resize handles', async function () {
  this.timeout(TIMEOUT_MS);
  const { element } = await mountWindow(FIXED);
  expect(element.shadowRoot!.querySelectorAll('.rh').length).to.equal(0);
});

it('does not snap when dragged into an edge', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, state } = await mountWindow(FIXED);
  const before = state().rect;
  pointer(element, 'pointerdown', before.x + 40, before.y + 10);
  pointer(element, 'pointermove', 0, 300);
  pointer(element, 'pointerup', 0, 300);
  expect(state().snapped).to.equal(undefined);
  expect(state().rect.w, 'moved, but the same size').to.equal(before.w);
  expect(state().rect.h).to.equal(before.h);
});

it('keeps the handles and a live maximize button for an ordinary app', async function () {
  this.timeout(TIMEOUT_MS);
  const { element } = await mountWindow({ ...FIXED, alias: 'ordinary', resizable: undefined });
  expect(element.shadowRoot!.querySelector('.ctrl-maximize')).to.not.equal(null);
  expect(element.shadowRoot!.querySelectorAll('.rh').length).to.equal(8);
});
