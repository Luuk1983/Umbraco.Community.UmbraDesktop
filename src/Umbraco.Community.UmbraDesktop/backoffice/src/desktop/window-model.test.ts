import { expect } from '@open-wc/testing';
import {
  nextZIndex,
  nextWindowRect,
  focusWindow,
  removeWindow,
  moveWindow,
  setWindowState,
  findAppWindow,
  resizeRect,
  setWindowRect,
  taskActivation,
  clampWindowPosition,
  clampResizeOrigin,
  clampWindowsToBounds,
  restoreDragPosition,
} from './window-model';
import type { UmbraDesktopApp, UmbraDesktopWindow } from './types';

const app: UmbraDesktopApp = {
  alias: 'a', name: 'A', icon: 'icon-umbraco', url: '/x', chromeProfile: 'bare',
};

function win(id: string, z: number, over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return { id, app, rect: { x: 0, y: 0, w: 100, h: 100 }, z, active: false, state: 'normal', ...over };
}

it('nextZIndex is 1 for an empty desktop', () => {
  expect(nextZIndex([])).to.equal(1);
});

it('nextZIndex is one above the current max', () => {
  expect(nextZIndex([win('a', 3), win('b', 7), win('c', 2)])).to.equal(8);
});

it('nextWindowRect cascades by window count and uses the given size', () => {
  const r0 = nextWindowRect(0, { w: 800, h: 600 });
  const r1 = nextWindowRect(1, { w: 800, h: 600 });
  expect(r0).to.deep.equal({ x: 40, y: 40, w: 800, h: 600 });
  expect(r1).to.deep.equal({ x: 68, y: 68, w: 800, h: 600 });
});

it('nextWindowRect wraps the cascade after 6 windows', () => {
  expect(nextWindowRect(6, { w: 800, h: 600 })).to.deep.equal(nextWindowRect(0, { w: 800, h: 600 }));
});

it('focusWindow activates only the target and bumps it above the previous top', () => {
  const result = focusWindow([win('a', 1, { active: true }), win('b', 5)], 'a');
  const a = result.find((w) => w.id === 'a')!;
  const b = result.find((w) => w.id === 'b')!;
  expect(a.active).to.be.true;
  expect(b.active).to.be.false;
  expect(a.z).to.be.greaterThan(5);
});

it('focusWindow un-minimizes the target', () => {
  const result = focusWindow([win('a', 1, { state: 'minimized' })], 'a');
  expect(result[0].state).to.equal('normal');
});

it('removeWindow drops the target', () => {
  const result = removeWindow([win('a', 1), win('b', 2)], 'a');
  expect(result.map((w) => w.id)).to.deep.equal(['b']);
});

it('moveWindow updates only the target rectangle position', () => {
  const result = moveWindow([win('a', 1), win('b', 2)], 'a', 15, 25);
  expect(result.find((w) => w.id === 'a')!.rect).to.include({ x: 15, y: 25 });
  expect(result.find((w) => w.id === 'b')!.rect).to.include({ x: 0, y: 0 });
});

it('setWindowState toggles maximize/minimize/normal on the target only', () => {
  const result = setWindowState([win('a', 1), win('b', 2)], 'a', 'maximized');
  expect(result.find((w) => w.id === 'a')!.state).to.equal('maximized');
  expect(result.find((w) => w.id === 'b')!.state).to.equal('normal');
});

it('findAppWindow returns the window hosting the given app alias', () => {
  const windows = [win('w1', 1), win('w2', 2, { app: { ...app, alias: 'other' } })];
  expect(findAppWindow(windows, 'a')!.id).to.equal('w1');
  expect(findAppWindow(windows, 'other')!.id).to.equal('w2');
});

it('findAppWindow returns undefined when no window hosts the alias', () => {
  expect(findAppWindow([win('w1', 1)], 'missing')).to.equal(undefined);
});

const START: import('./types').Rect = { x: 100, y: 100, w: 400, h: 300 };
const MIN = { w: 320, h: 200 };

it('resizeRect grows width from the right edge', () => {
  expect(resizeRect(START, { right: true }, 50, 0, MIN)).to.deep.equal({ x: 100, y: 100, w: 450, h: 300 });
});

it('resizeRect grows height from the bottom edge', () => {
  expect(resizeRect(START, { bottom: true }, 0, 40, MIN)).to.deep.equal({ x: 100, y: 100, w: 400, h: 340 });
});

it('resizeRect moves the origin when dragging the left edge', () => {
  expect(resizeRect(START, { left: true }, 30, 0, MIN)).to.deep.equal({ x: 130, y: 100, w: 370, h: 300 });
});

it('resizeRect moves the origin when dragging the top edge', () => {
  expect(resizeRect(START, { top: true }, 0, 20, MIN)).to.deep.equal({ x: 100, y: 120, w: 400, h: 280 });
});

it('resizeRect handles the south-east corner (both size axes)', () => {
  expect(resizeRect(START, { bottom: true, right: true }, 50, 40, MIN)).to.deep.equal({ x: 100, y: 100, w: 450, h: 340 });
});

it('resizeRect handles the north-west corner (both origin axes)', () => {
  expect(resizeRect(START, { top: true, left: true }, 30, 20, MIN)).to.deep.equal({ x: 130, y: 120, w: 370, h: 280 });
});

it('resizeRect clamps width to the minimum from the right edge', () => {
  expect(resizeRect(START, { right: true }, -200, 0, MIN)).to.deep.equal({ x: 100, y: 100, w: 320, h: 300 });
});

it('resizeRect clamps the left edge so the origin never overshoots the minimum width', () => {
  // Shrinking from the left by 200 would drop below min (400-200=200 < 320) → width pins to 320,
  // so x only advances by (400-320)=80.
  expect(resizeRect(START, { left: true }, 200, 0, MIN)).to.deep.equal({ x: 180, y: 100, w: 320, h: 300 });
});

it('resizeRect clamps height to the minimum from the bottom edge', () => {
  expect(resizeRect(START, { bottom: true }, 0, -200, MIN)).to.deep.equal({ x: 100, y: 100, w: 400, h: 200 });
});

it('resizeRect clamps the top edge so the origin never overshoots the minimum height', () => {
  // Shrinking from the top by 200 would drop below min (300-200=100 < 200) → height pins to 200,
  // so y only advances by (300-200)=100.
  expect(resizeRect(START, { top: true }, 0, 200, MIN)).to.deep.equal({ x: 100, y: 200, w: 400, h: 200 });
});

const BOUNDS = { w: 1000, h: 700 };
const KEEP = { grab: 80, leading: 0, trailing: 138, titlebar: 40 };
const KEEP_LEFT = { grab: 80, leading: 124, trailing: 0, titlebar: 40 };
const DRAGGED: import('./types').Rect = { x: 100, y: 100, w: 400, h: 300 };

it('clampWindowPosition leaves a fully on-screen position untouched', () => {
  expect(clampWindowPosition(DRAGGED, BOUNDS, KEEP)).to.deep.equal({ x: 100, y: 100 });
});

it('clampWindowPosition keeps a drag strip on screen when dragged off the left edge', () => {
  // Hanging off the left, the visible sliver is the window's right end — which is all controls.
  // Those swallow pointerdown to stay clickable, so the clamp must also spare 80px of titlebar
  // beside them: x pins at (80 + 138) - 400.
  expect(clampWindowPosition({ ...DRAGGED, x: -900 }, BOUNDS, KEEP)).to.deep.equal({ x: -182, y: 100 });
});

it('clampWindowPosition leaves something to grab however far left it is thrown', () => {
  const { x } = clampWindowPosition({ ...DRAGGED, x: -5000 }, BOUNDS, KEEP);
  const visible = DRAGGED.w + x;
  expect(visible - KEEP.trailing).to.be.at.least(KEEP.grab);
});

it('clampWindowPosition keeps a slice on screen when dragged off the right edge', () => {
  // Hanging off the right, the visible sliver is the title end of the bar — draggable all the
  // way across — so 80px of it is enough: x pins at 1000-80.
  expect(clampWindowPosition({ ...DRAGGED, x: 5000 }, BOUNDS, KEEP)).to.deep.equal({ x: 920, y: 100 });
});

it('clampWindowPosition never lets the titlebar go above the desktop top', () => {
  expect(clampWindowPosition({ ...DRAGGED, y: -300 }, BOUNDS, KEEP)).to.deep.equal({ x: 100, y: 0 });
});

it('clampWindowPosition keeps the titlebar above the taskbar when dragged down', () => {
  // The full titlebar (40px) must stay inside, so y pins at 700-40.
  expect(clampWindowPosition({ ...DRAGGED, y: 5000 }, BOUNDS, KEEP)).to.deep.equal({ x: 100, y: 660 });
});

it('clampWindowPosition still pins to the top when the desktop is shorter than the titlebar', () => {
  expect(clampWindowPosition({ ...DRAGGED, y: 500 }, { w: 1000, h: 20 }, KEEP).y).to.equal(0);
});

it('clampWindowPosition never demands more visible width than the window has', () => {
  // A 100px window is narrower than its own controls, so it has no drag strip to spare; it simply
  // stays wholly on screen rather than being shunted inward by an impossible margin.
  expect(clampWindowPosition({ x: 0, y: 0, w: 100, h: 100 }, BOUNDS, KEEP)).to.deep.equal({ x: 0, y: 0 });
  expect(clampWindowPosition({ x: -40, y: 0, w: 100, h: 100 }, BOUNDS, KEEP)).to.deep.equal({ x: 0, y: 0 });
});

it('clampWindowPosition keeps a grab strip on screen with controls at the left edge', () => {
  // Controls lead the bar, so the draggable strip is the window's right end. Thrown off the
  // left, the strip's right edge (x + w) must stay 80px on screen: x pins at 80 - 400.
  expect(clampWindowPosition({ ...DRAGGED, x: -900 }, BOUNDS, KEEP_LEFT)).to.deep.equal({ x: -320, y: 100 });
});

it('clampWindowPosition spares the leading controls when dragged off the right edge', () => {
  // The strip starts 124px into the window, so the window may only advance until that point
  // is 80px from the right edge: x pins at 1000 - 80 - 124.
  expect(clampWindowPosition({ ...DRAGGED, x: 5000 }, BOUNDS, KEEP_LEFT)).to.deep.equal({ x: 796, y: 100 });
});

it('clampWindowPosition keeps a window narrower than its own controls wholly on screen', () => {
  // 100px window against 124px of leading controls: no strip exists, so it is not shunted.
  expect(clampWindowPosition({ x: 0, y: 0, w: 100, h: 100 }, BOUNDS, KEEP_LEFT)).to.deep.equal({ x: 0, y: 0 });
  expect(clampWindowPosition({ x: -40, y: 0, w: 100, h: 100 }, BOUNDS, KEEP_LEFT)).to.deep.equal({ x: 0, y: 0 });
});

it('clampResizeOrigin leaves a rectangle inside the desktop untouched', () => {
  expect(clampResizeOrigin(DRAGGED)).to.deep.equal(DRAGGED);
});

it('clampResizeOrigin pins a top-edge resize at the desktop top, holding the bottom edge', () => {
  // Top edge pulled 50px above the desktop: y pins to 0 and the height gives back those 50px.
  expect(clampResizeOrigin({ x: 100, y: -50, w: 400, h: 350 })).to.deep.equal({ x: 100, y: 0, w: 400, h: 300 });
});

it('clampResizeOrigin pins a left-edge resize at the desktop left, holding the right edge', () => {
  expect(clampResizeOrigin({ x: -60, y: 100, w: 460, h: 300 })).to.deep.equal({ x: 0, y: 100, w: 400, h: 300 });
});

it('clampWindowsToBounds returns the same list when every window is already in reach', () => {
  const windows = [win('a', 1), win('b', 2, { rect: { x: 300, y: 200, w: 400, h: 300 } })];
  expect(clampWindowsToBounds(windows, BOUNDS, KEEP)).to.equal(windows);
});

it('clampWindowsToBounds pulls windows back when the desktop shrinks under them', () => {
  // A window parked at x=900 on a wide desktop is out of reach once the desktop is 500 wide.
  const windows = [win('a', 1, { rect: { x: 900, y: 600, w: 400, h: 300 } })];
  const next = clampWindowsToBounds(windows, { w: 500, h: 300 }, KEEP);
  expect(next[0].rect).to.deep.equal({ x: 420, y: 260, w: 400, h: 300 });
});

it('clampWindowsToBounds keeps window size and identity intact while repositioning', () => {
  const windows = [win('a', 3, { active: true, state: 'minimized', rect: { x: 900, y: 10, w: 400, h: 300 } })];
  const moved = clampWindowsToBounds(windows, { w: 500, h: 700 }, KEEP)[0];
  expect(moved).to.include({ id: 'a', z: 3, active: true, state: 'minimized' });
  expect(moved.rect).to.include({ w: 400, h: 300, y: 10 });
});

it('clampWindowsToBounds leaves in-reach windows as the very same objects', () => {
  const inside = win('a', 1);
  const outside = win('b', 2, { rect: { x: 900, y: 10, w: 400, h: 300 } });
  const next = clampWindowsToBounds([inside, outside], { w: 500, h: 700 }, KEEP);
  expect(next[0]).to.equal(inside);
  expect(next[1]).to.not.equal(outside);
});

it('restoreDragPosition keeps the pointer at the same point along the titlebar', () => {
  // Grabbed dead centre of a 1000-wide maximized bar; the restored 400-wide window centres there.
  expect(restoreDragPosition(500, { w: 1000 }, { w: 400 })).to.deep.equal({ x: 300, y: 0 });
});

it('restoreDragPosition keeps the pointer proportionally placed near the edges', () => {
  // A quarter along the bar stays a quarter along the restored bar.
  expect(restoreDragPosition(250, { w: 1000 }, { w: 400 })).to.deep.equal({ x: 150, y: 0 });
});

it('restoreDragPosition never lands the window outside the desktop', () => {
  expect(restoreDragPosition(0, { w: 1000 }, { w: 400 })).to.deep.equal({ x: 0, y: 0 });
  expect(restoreDragPosition(1000, { w: 1000 }, { w: 400 })).to.deep.equal({ x: 600, y: 0 });
});

it('restoreDragPosition survives a zero-width desktop without producing NaN', () => {
  expect(restoreDragPosition(0, { w: 0 }, { w: 400 })).to.deep.equal({ x: 0, y: 0 });
});

it('setWindowRect replaces only the target window rectangle', () => {
  const next = setWindowRect([win('a', 1), win('b', 2)], 'a', { x: 5, y: 6, w: 700, h: 500 });
  expect(next.find((w) => w.id === 'a')!.rect).to.deep.equal({ x: 5, y: 6, w: 700, h: 500 });
  expect(next.find((w) => w.id === 'b')!.rect).to.deep.equal({ x: 0, y: 0, w: 100, h: 100 });
});

it('taskActivation minimizes the active window when clicked in the taskbar', () => {
  expect(taskActivation({ active: true, state: 'normal' })).to.equal('minimize');
});

it('taskActivation minimizes an active maximized window (Windows/KDE tasklist behaviour)', () => {
  expect(taskActivation({ active: true, state: 'maximized' })).to.equal('minimize');
});

it('taskActivation focuses an inactive window when clicked in the taskbar', () => {
  expect(taskActivation({ active: false, state: 'normal' })).to.equal('focus');
});

it('taskActivation focuses (restores) a minimized window', () => {
  expect(taskActivation({ active: false, state: 'minimized' })).to.equal('focus');
});
