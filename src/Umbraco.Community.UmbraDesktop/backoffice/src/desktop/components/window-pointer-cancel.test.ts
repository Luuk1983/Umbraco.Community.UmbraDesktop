import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * A drag or resize the browser cancels has to end there, not wait for a `pointerup` that never
 * comes.
 *
 * The browser sends `pointercancel` instead of `pointerup` whenever it takes a pointer back
 * mid-gesture: an operating-system gesture, a touch it decides is a pan, a lost capture. The window
 * only ever ended its gestures on `pointerup`, so a cancelled one stayed switched on, and the next
 * `pointermove` over the titlebar or the handle carried on from it. A mouse hovering past with no
 * button pressed moved the window. The titlebar's `touch-action: none` made the common cause go
 * away, not the bug.
 *
 * Synthetic events are the right tool here, unlike in `window-touch.test.ts`: the question is what
 * the element does once a cancel arrives, not whether the browser sends one.
 */

/** The desktop these cases render onto. */
const BOUNDS = { w: 1000, h: 700 };

/** Where each case puts its window, well away from every snap edge. */
const START_RECT = { x: 200, y: 150, w: 400, h: 300 };

/** A throwaway app; the frame loads nothing. */
const APP: UmbraDesktopApp = {
  alias: 'probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
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
 * A manager, a surface pinned to the viewport's top-left corner, and one window on it at
 * {@link START_RECT}, re-rendered whenever the manager changes the way the desktop's repeat does.
 *
 * Pinned so client and surface coordinates are the same numbers, as in `window-snap.test.ts`.
 * Re-rendered live because these cases send moves after a cancel, and a stale element would hold
 * the rect it had at the start and hide whether the window moved.
 * @returns The manager, the mounted element, and a function reading the live window state.
 */
async function mountWindow() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:fixed; left:0; top:0; width:${BOUNDS.w}px; height:${BOUNDS.h}px;`;
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  manager.clampToBounds(BOUNDS);

  manager.open(APP);
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  wrapper.appendChild(element);

  let current: UmbraDesktopWindow | undefined;
  const subscription = manager.windows.subscribe((list) => {
    current = list[0];
    if (current) element.window = { ...current };
  });
  cleanup.push(() => {
    subscription.unsubscribe();
    host.destroy();
    wrapper.remove();
  });
  manager.resize(current!.id, START_RECT);
  await element.updateComplete;
  return { manager, element, state: () => current! };
}

/**
 * Dispatch one pointer event on a part of the window, then let it re-render.
 * @param element The mounted window.
 * @param selector The part of its shadow DOM that receives the event.
 * @param type The event type.
 * @param x Client x.
 * @param y Client y.
 */
async function pointer(element: UmbraDesktopWindowElement, selector: string, type: string, x: number, y: number) {
  const target = element.shadowRoot!.querySelector(selector) as HTMLElement;
  target.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, composed: true }),
  );
  await element.updateComplete;
}

/**
 * The manager's current ghost rectangle.
 * @param manager The manager to read.
 * @returns The preview rect, or undefined when no snap is on offer.
 */
function previewOf(manager: UmbraDesktopWindowManagerContext) {
  let rect: { x: number; y: number; w: number; h: number } | undefined;
  manager.snapPreview.subscribe((value) => (rect = value)).unsubscribe();
  return rect;
}

it('stops moving a window once the browser cancels its titlebar drag', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, state } = await mountWindow();

  await pointer(element, '.titlebar', 'pointerdown', 300, 160);
  await pointer(element, '.titlebar', 'pointermove', 350, 200);
  await pointer(element, '.titlebar', 'pointercancel', 350, 200);
  const after = { ...state().rect };

  // Over the titlebar again, as a mouse passing by would be, with no button down.
  await pointer(element, '.titlebar', 'pointermove', 450, 300);

  expect(
    state().rect,
    'the drag outlived its cancel, so a pointer passing over the titlebar dragged the window',
  ).to.eql(after);
});

it('withdraws the snap on offer when the browser cancels the drag, and takes nothing', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, element, state } = await mountWindow();

  await pointer(element, '.titlebar', 'pointerdown', 300, 160);
  await pointer(element, '.titlebar', 'pointermove', 0, 300);
  expect(previewOf(manager), 'the case needs a snap on offer before the cancel').to.not.equal(undefined);

  await pointer(element, '.titlebar', 'pointercancel', 0, 300);

  expect(previewOf(manager), 'the ghost outlived the drag it was offered to').to.equal(undefined);
  expect(state().snapped, 'a cancel is not a release, so it must not take the snap').to.equal(undefined);
});

it('forgets an armed restore when the browser cancels the press on a maximized titlebar', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, element, state } = await mountWindow();
  manager.setState(state().id, 'maximized');
  await element.updateComplete;

  await pointer(element, '.titlebar', 'pointerdown', 300, 10);
  await pointer(element, '.titlebar', 'pointercancel', 300, 10);
  await pointer(element, '.titlebar', 'pointermove', 500, 300);

  expect(
    state().state,
    'the press armed a restore and the cancel left it armed, so a pointer passing over the ' +
      'titlebar un-maximized the window',
  ).to.equal('maximized');
});

it('stops resizing a window once the browser cancels the resize', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, state } = await mountWindow();
  const edge = START_RECT.x + START_RECT.w - 2;

  await pointer(element, '.rh-e', 'pointerdown', edge, 300);
  await pointer(element, '.rh-e', 'pointermove', edge + 50, 300);
  await pointer(element, '.rh-e', 'pointercancel', edge + 50, 300);
  const after = { ...state().rect };

  await pointer(element, '.rh-e', 'pointermove', edge + 150, 300);

  expect(
    state().rect,
    'the resize outlived its cancel, so a pointer passing over the handle resized the window',
  ).to.eql(after);
});
