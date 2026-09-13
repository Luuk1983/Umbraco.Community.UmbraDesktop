import { expect } from '@open-wc/testing';
import './window.element.js';
import './desktop.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopDesktopElement } from './desktop.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The snap gesture, driven end to end through the titlebar rather than through the manager.
 *
 * The manager's own tests cover what a snap *is*; these cover the part only a rendered window can
 * answer, which is whether the pointer ever reaches it. A drag is three events and a pointer
 * capture, and capture is the piece that fails silently: `setPointerCapture` rejects a pointer id
 * the browser does not recognise, and an unguarded call there aborts the handler before the drag
 * has even started.
 */

/** The desktop these cases snap into, and the size of the stand-in surface they render onto. */
const BOUNDS = { w: 1000, h: 700 };

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
 * A manager, a surface to lay a window out on, and that window's element.
 *
 * The surface is pinned to the viewport's own top-left corner so that client coordinates and
 * surface coordinates are the same number: a case can then say "the pointer reached the left edge"
 * by dispatching at `clientX: 0` without restating the offset arithmetic the element does.
 * @returns The manager, the mounted window element, and a function reading the live window state.
 */
async function mountWindow() {
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

  manager.open(APP);
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  wrapper.appendChild(element);

  /** The window the manager currently holds, which is the one under test. */
  const state = (): UmbraDesktopWindow => {
    let list: ReadonlyArray<UmbraDesktopWindow> = [];
    manager.windows.subscribe((value) => (list = value)).unsubscribe();
    return list[0];
  };
  /** Re-read the manager's window into the element, the way the desktop's repeat would. */
  const sync = async () => {
    element.window = { ...state() };
    await element.updateComplete;
  };
  await sync();
  return { manager, element, state, sync };
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

it('offers the left half while a titlebar is dragged into the left edge, and takes it on release', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, element, state } = await mountWindow();

  pointer(element, 'pointerdown', 400, 10);
  pointer(element, 'pointermove', 0, 300);

  expect(previewOf(manager), 'the ghost should be offering the left half').to.eql({
    x: 0,
    y: 0,
    w: BOUNDS.w / 2,
    h: BOUNDS.h,
  });

  pointer(element, 'pointerup', 0, 300);

  expect(state().snapped).to.equal('left');
  expect(state().rect).to.eql({ x: 0, y: 0, w: BOUNDS.w / 2, h: BOUNDS.h });
  expect(previewOf(manager), 'the ghost outstays its welcome').to.equal(undefined);
});

it('leaves a window where the drag put it when it ended away from an edge', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, element, state } = await mountWindow();

  pointer(element, 'pointerdown', 400, 10);
  pointer(element, 'pointermove', 500, 300);
  pointer(element, 'pointerup', 500, 300);

  expect(state().snapped, 'an ordinary drag is not a snap').to.equal(undefined);
  expect(previewOf(manager)).to.equal(undefined);
});

it('gives a snapped window its old size back when it is dragged off', async function () {
  this.timeout(TIMEOUT_MS);
  const { element, state, sync } = await mountWindow();
  const before = state().rect;

  pointer(element, 'pointerdown', 400, 10);
  pointer(element, 'pointermove', 0, 300);
  pointer(element, 'pointerup', 0, 300);
  await sync();
  expect(state().snapped, 'the case starts from a snapped window').to.equal('left');

  pointer(element, 'pointerdown', 200, 10);
  pointer(element, 'pointermove', 400, 300);

  expect(state().snapped).to.equal(undefined);
  expect(state().rect.w, 'the size it had before it was snapped').to.equal(before.w);
  expect(state().rect.h).to.equal(before.h);
});

it('draws the ghost on the desktop surface, where the manager says the window will land', async function () {
  this.timeout(TIMEOUT_MS);
  const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
  document.body.appendChild(desktop);
  cleanup.push(() => desktop.remove());
  await desktop.updateComplete;
  desktop.reportSettingsLoaded(true);
  await desktop.updateComplete;

  const manager = desktop.managerForTest;
  // Said out loud rather than left to the surface's own ResizeObserver: a desktop mounted in a test
  // page has no height to report, and a snap has nothing to be half of until somebody says how big
  // the desktop is.
  manager.clampToBounds(BOUNDS);
  manager.open(APP);
  let id = '';
  manager.windows.subscribe((list) => (id = list[0]?.id ?? '')).unsubscribe();
  manager.previewSnap(id, { x: 0, y: 100 });
  await desktop.updateComplete;

  const ghost = desktop.renderRoot.querySelector('.snap-ghost') as HTMLElement | null;
  expect(ghost, 'a snap on offer should be visible before the pointer is released').to.not.equal(null);
  const rect = previewOf(manager)!;
  expect(ghost!.style.left).to.equal(`${rect.x}px`);
  expect(ghost!.style.top).to.equal(`${rect.y}px`);
  expect(ghost!.style.width).to.equal(`${rect.w}px`);
  expect(ghost!.style.height).to.equal(`${rect.h}px`);

  manager.commitSnap(id);
  await desktop.updateComplete;
  expect(
    desktop.renderRoot.querySelector('.snap-ghost'),
    'the ghost must go once the window itself is there',
  ).to.equal(null);
});
