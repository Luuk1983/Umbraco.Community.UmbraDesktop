import { expect, waitUntil } from '@open-wc/testing';
import { executeServerCommand } from '@web/test-runner-commands';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * Dragging and tapping a window with a finger, driven by real touch input.
 *
 * `window-snap.test.ts` drives the titlebar with synthetic pointer events, and those cannot see
 * this bug: a dispatched event goes straight to the listener, while a real touch first passes
 * through the browser's gesture handling, which decides whether the finger is dragging the element
 * or panning the page. The titlebar left that decision to the browser, so on a touchscreen (and in
 * DevTools' device mode) the browser took the gesture for a pan, sent `pointercancel` after the
 * first few pixels, and the window never moved. The resize handles always had `touch-action: none`
 * and never had the problem. So these cases go through the `touch-drag` and `touch-tap` commands in
 * `web-test-runner.config.mjs`, which send CDP touch events the browser treats as a touchscreen.
 */

/** The desktop these cases render onto, which fits inside the test page's 800x600 viewport. */
const BOUNDS = { w: 700, h: 500 };

/**
 * Where each case puts its window, set explicitly because `open` sizes a first window at 800px
 * whatever the desktop is. That matters more here than anywhere else: a dispatched event reaches
 * its target wherever the target is, but a real touch lands where it lands, and aimed at a close
 * button pushed past the viewport's edge it touches nothing at all. Small enough that the drag
 * below keeps the whole window on the desktop, so no clamp muddies the distance it moved.
 */
const START_RECT = { x: 40, y: 40, w: 400, h: 300 };

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
 * A manager, a surface pinned to the viewport's top-left corner, and one window on it.
 *
 * Unlike `window-snap.test.ts` this re-renders the element whenever the manager changes, the way
 * the desktop's repeat does. A real touch drag is many moves long, and a window that was not
 * re-rendered between them would keep the rect it started with and turn every move into the first.
 * @returns The mounted window element and a function reading the live window state.
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
  manager.resize(current!.id, START_RECT);
  cleanup.push(() => {
    subscription.unsubscribe();
    host.destroy();
    wrapper.remove();
  });
  await element.updateComplete;
  return { element, state: () => current! };
}

/**
 * The centre of an element in the titlebar, in client coordinates.
 * @param element The mounted window.
 * @param selector Which part of its shadow DOM to aim at.
 * @returns The point, rounded, because CDP touch coordinates are whole pixels.
 */
function centreOf(element: UmbraDesktopWindowElement, selector: string): [number, number] {
  const box = element.shadowRoot!.querySelector(selector)!.getBoundingClientRect();
  return [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
}

it('moves a window when its titlebar is dragged with a finger', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, state } = await mountWindow();
  const before = { ...state().rect };
  const [x, y] = centreOf(element, '.title-text');

  const titlebar = element.shadowRoot!.querySelector('.titlebar') as HTMLElement;
  let cancelled = 0;
  titlebar.addEventListener('pointercancel', () => cancelled++);

  // Twenty small steps rather than one jump, because the browser only decides a touch is a pan
  // once it has moved past its slop distance, and a single move would skip the moment that matters.
  const points: Array<[number, number]> = [[x, y]];
  for (let step = 1; step <= 20; step++) points.push([x + step * 8, y + step * 5]);
  await executeServerCommand('touch-drag', { points });
  await element.updateComplete;

  expect(
    cancelled,
    'the browser cancelled the pointer, so it took the finger for a pan. The titlebar needs ' +
      '`touch-action: none`, as the resize handles have',
  ).to.equal(0);
  expect(state().rect.x - before.x, 'the window should follow the finger across').to.equal(160);
  expect(state().rect.y - before.y, 'and down').to.equal(100);
});

it('still maximizes a window when its maximize button is tapped with a finger', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, state } = await mountWindow();

  await executeServerCommand('touch-tap', { position: centreOf(element, '.ctrl-maximize') });
  await element.updateComplete;

  expect(
    state().state,
    'a tap on a titlebar control should still reach it as a click once the titlebar stops the ' +
      'browser from panning',
  ).to.equal('maximized');
});

it('still closes a window when its close button is tapped with a finger', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, state } = await mountWindow();

  await executeServerCommand('touch-tap', { position: centreOf(element, '.ctrl-close') });

  // Waited for rather than read, because closing is asynchronous: the manager first asks whether
  // the window holds unsaved work, and only closes it once that answer comes back.
  await waitUntil(() => state() === undefined, 'the tapped window should be gone');
});
