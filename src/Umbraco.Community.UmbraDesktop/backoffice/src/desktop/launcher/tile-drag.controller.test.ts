import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_DRAG_LONG_PRESS_MS,
  UMBRADESKTOP_DRAG_SCROLL_BAND_PX,
  UMBRADESKTOP_DRAG_SCROLL_STEP_PX,
  UmbraDesktopTileDragController,
  edgeScrollStep,
} from './tile-drag.controller';
import type { UmbraDesktopDragSource } from './tile-drag.controller';
import type { UmbraDesktopDropTarget } from './drop-target';

/**
 * The drag's gesture rules, driven with synthetic pointer events. What these cannot show is the
 * browser's own touch scrolling, which only a real touch sequence triggers. That was checked by
 * hand with puppeteer's touchscreen under iPad emulation: a long press then a drag dropped without
 * the panel scrolling, and a quick swipe scrolled and did not drag.
 */

/** The hosts and controllers this file made, taken down after each case. */
const made: Array<{ host: HTMLElement; controller: UmbraDesktopTileDragController }> = [];
afterEach(() =>
  made.splice(0).forEach(({ host, controller }) => {
    controller.cancel();
    host.remove();
  }),
);

/**
 * A host with one tile to drag and a record of what the controller reported.
 *
 * Appended by hand rather than through open-wc's `fixture`. For a plain element `fixture` waits for
 * an animation frame, and a page the runner has in a background tab (the full suite runs two at a
 * time) gets no frames, so every case timed out there while passing on its own. Nothing here needs
 * a frame: hit-testing and layout happen on demand.
 * @returns The pieces a case needs.
 */
async function setup() {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed; left:0; top:0; width:400px; height:300px;';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<div class="body" style="height:300px; overflow:auto;"><button class="tile" style="width:100px; height:60px;">Tile</button></div>`;
  const tile = root.querySelector<HTMLElement>('.tile')!;
  const log: string[] = [];
  let clicks = 0;
  tile.addEventListener('click', () => clicks++);
  const target: UmbraDesktopDropTarget = { kind: 'remove' };
  const source: UmbraDesktopDragSource = { kind: 'group', groupId: 'editing' };
  const controller = new UmbraDesktopTileDragController(() => root, {
    targetAt: () => target,
    onStart: () => log.push('start'),
    onOver: () => log.push('over'),
    onDrop: (s, t) => log.push(`drop:${s.kind}:${t.kind}`),
    onEnd: () => log.push('end'),
    scroller: () => root.querySelector('.body'),
  });
  made.push({ host, controller });
  tile.addEventListener('pointerdown', (e) => controller.begin(e, source));
  /**
   * Dispatch one pointer event: `pointerdown` at the tile, the rest at the window, the way a real
   * uncaptured pointer's moves arrive.
   * @param type The event type.
   * @param x Client x.
   * @param y Client y.
   * @param pointerType mouse, pen or touch.
   */
  const pointer = (type: string, x: number, y: number, pointerType = 'mouse') => {
    const event = new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, pointerType, button: 0, bubbles: true, composed: true });
    (type === 'pointerdown' ? tile : window).dispatchEvent(event);
  };
  return { root, tile, log, controller, pointer, clicks: () => clicks };
}

it('leaves a click alone: no drag, and the click reaches the tile', async () => {
  const { tile, log, pointer, clicks } = await setup();
  pointer('pointerdown', 20, 20);
  pointer('pointerup', 21, 20);
  tile.click();
  expect(log).to.deep.equal([]);
  expect(clicks()).to.equal(1);
});

it('starts a mouse drag past the threshold, drops, and swallows the click that follows', async () => {
  const { tile, log, pointer, clicks } = await setup();
  pointer('pointerdown', 20, 20);
  pointer('pointermove', 30, 20);
  pointer('pointerup', 60, 80);
  tile.click();
  expect(log).to.include.members(['start', 'drop:group:remove', 'end']);
  expect(clicks()).to.equal(0);
});

it('draws a ghost while dragging and removes it afterwards', async () => {
  const { root, pointer } = await setup();
  pointer('pointerdown', 20, 20);
  pointer('pointermove', 30, 20);
  expect(root.querySelectorAll('.drag-ghost').length).to.equal(1);
  pointer('pointerup', 30, 20);
  expect(root.querySelectorAll('.drag-ghost').length).to.equal(0);
});

it('cancels on Escape without dropping, and keeps the Escape from closing the launcher', async () => {
  const { log, pointer } = await setup();
  let reachedDocument = false;
  const listener = () => (reachedDocument = true);
  document.addEventListener('keydown', listener);
  pointer('pointerdown', 20, 20);
  pointer('pointermove', 30, 20);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.removeEventListener('keydown', listener);
  expect(log).to.include('end');
  expect(log.some((entry) => entry.startsWith('drop'))).to.equal(false);
  expect(reachedDocument).to.equal(false);
});

it('starts a touch drag only after a long press', async () => {
  const { log, pointer } = await setup();
  pointer('pointerdown', 20, 20, 'touch');
  pointer('pointermove', 22, 20, 'touch');
  expect(log).to.not.include('start');
  await new Promise((resolve) => setTimeout(resolve, UMBRADESKTOP_DRAG_LONG_PRESS_MS + 50));
  expect(log).to.include('start');
  pointer('pointerup', 22, 20, 'touch');
  expect(log).to.include('end');
});

it('gives a touch that moves before the long press back to the page, so it scrolls', async () => {
  const { log, pointer } = await setup();
  pointer('pointerdown', 20, 20, 'touch');
  pointer('pointermove', 20, 60, 'touch');
  await new Promise((resolve) => setTimeout(resolve, UMBRADESKTOP_DRAG_LONG_PRESS_MS + 50));
  expect(log).to.deep.equal([]);
});

it('ignores a right-button press', async () => {
  const { log, tile } = await setup();
  tile.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 20, pointerId: 8, pointerType: 'mouse', button: 2, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 60, pointerId: 8, pointerType: 'mouse' }));
  expect(log).to.deep.equal([]);
});

describe('edge scrolling', () => {
  /** A 400x300 scroller at 100,100, in the shape getBoundingClientRect returns. */
  const box = { left: 100, right: 500, top: 100, bottom: 400 };

  it('scrolls up in the top band and down in the bottom band', () => {
    expect(edgeScrollStep(box, 300, box.top + UMBRADESKTOP_DRAG_SCROLL_BAND_PX / 2)).to.equal(-UMBRADESKTOP_DRAG_SCROLL_STEP_PX);
    expect(edgeScrollStep(box, 300, box.bottom - UMBRADESKTOP_DRAG_SCROLL_BAND_PX / 2)).to.equal(UMBRADESKTOP_DRAG_SCROLL_STEP_PX);
  });

  it('does not scroll in the middle', () => {
    expect(edgeScrollStep(box, 300, 250)).to.equal(0);
  });

  it('does not scroll with the pointer outside the scroller, such as over the remove pane below it', () => {
    expect(edgeScrollStep(box, 300, box.bottom + 20)).to.equal(0);
    expect(edgeScrollStep(box, 300, box.top - 20)).to.equal(0);
    expect(edgeScrollStep(box, box.left - 20, box.top + 5)).to.equal(0);
    expect(edgeScrollStep(box, box.right + 20, box.bottom - 5)).to.equal(0);
  });
});
