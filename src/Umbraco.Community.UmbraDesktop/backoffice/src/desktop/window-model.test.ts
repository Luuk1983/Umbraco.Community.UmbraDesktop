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
