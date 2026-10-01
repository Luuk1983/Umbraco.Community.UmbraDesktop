import { expect } from '@open-wc/testing';
import './screensaver.element.js';
import type { FrameScheduler } from './screensaver.element.js';
import { SCREENSAVER_WAKE_DISTANCE_PX } from './constants.js';

/**
 * The screensaver itself: what wakes the desktop, what does not, and that a preview never does.
 * Mounted on `document.body` as the watcher mounts it, because full screen it listens on the window.
 */

/** Frames handed out by hand: the test says when each one happens. */
class ManualFrames implements FrameScheduler {
  #next = 1;
  #pending = new Map<number, FrameRequestCallback>();
  #time = 0;

  request(callback: FrameRequestCallback): number {
    this.#pending.set(this.#next, callback);
    return this.#next++;
  }

  cancel(handle: number): void {
    this.#pending.delete(handle);
  }

  /** How many frames are waiting. */
  get waiting(): number {
    return this.#pending.size;
  }

  /** Run the waiting frames, some milliseconds after the last. */
  run(times = 1): void {
    for (let i = 0; i < times; i++) {
      this.#time += 16;
      const due = [...this.#pending.values()];
      this.#pending.clear();
      for (const callback of due) callback(this.#time);
    }
  }
}

/** Everything a test mounted, taken down after it. */
const mounted: Element[] = [];
afterEach(() => mounted.splice(0).forEach((element) => element.remove()));

/**
 * A running screensaver, built by hand rather than by `fixture`, which waits for an animation frame
 * that a background page never gets.
 * @param preview Whether it is the little one in the monitor.
 * @returns The element, its frames, and how many times it announced it was dismissed.
 */
function screensaver(preview = false) {
  let count = 0;
  const element = document.createElement('umbradesktop-screensaver');
  const frames = new ManualFrames();
  element.frames = frames;
  element.setAttribute('saver', preview ? 'mystify' : 'starfield');
  element.addEventListener('dismiss', () => count++);
  if (preview) {
    element.setAttribute('preview', '');
    const monitor = document.createElement('div');
    monitor.style.cssText = 'position: relative; width: 192px; height: 144px';
    monitor.append(element);
    document.body.append(monitor);
    mounted.push(monitor);
  } else {
    document.body.append(element);
    mounted.push(element);
  }
  return { element, frames, dismissed: () => count };
}

/** Move the pointer to a point on the page. */
function moveTo(x: number, y: number): void {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
}

it('covers the page and takes focus, so a key pressed to wake it types nowhere', () => {
  const { element } = screensaver();
  const box = element.getBoundingClientRect();
  expect([box.width, box.height]).to.deep.equal([window.innerWidth, window.innerHeight]);
  expect(document.activeElement).to.equal(element);
});

it('goes at a key, and says so', () => {
  const { element, dismissed } = screensaver();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
  expect(element.isConnected).to.equal(false);
  expect(dismissed()).to.equal(1);
});

/** A click that wakes the desktop must not also press whatever is under the screensaver. */
it('goes at a click, and swallows it', () => {
  const { element } = screensaver();
  const click = new PointerEvent('pointerdown', { cancelable: true, bubbles: true });
  window.dispatchEvent(click);
  expect(element.isConnected).to.equal(false);
  expect(click.defaultPrevented).to.equal(true);
});

/** A knocked desk nudges the mouse a pixel or two. That is not somebody coming back. */
it('stays for a small movement, and goes for a real one', () => {
  const { element } = screensaver();
  moveTo(100, 100);
  moveTo(100 + SCREENSAVER_WAKE_DISTANCE_PX - 2, 100);
  expect(element.isConnected, 'a nudge').to.equal(true);
  moveTo(100 + SCREENSAVER_WAKE_DISTANCE_PX + 2, 100);
  expect(element.isConnected, 'a movement').to.equal(false);
});

it('never dismisses itself as a preview', () => {
  const { element, dismissed } = screensaver(true);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
  moveTo(0, 0);
  moveTo(300, 300);
  element.dismiss();
  expect(element.isConnected).to.equal(true);
  expect(dismissed()).to.equal(0);
});

it('fills its monitor as a preview, with a canvas the same size', () => {
  const { element } = screensaver(true);
  const canvas = element.shadowRoot!.querySelector('canvas')!;
  expect([element.clientWidth, element.clientHeight, canvas.width, canvas.height]).to.deep.equal([192, 144, 192, 144]);
});

it('draws something', () => {
  const { element, frames } = screensaver(true);
  frames.run(5);
  const canvas = element.shadowRoot!.querySelector('canvas')!;
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 60) lit++;
  expect(lit).to.be.greaterThan(0);
});

/** An animation left running behind a closed window costs battery for nothing. */
it('stops asking for frames when it is taken away', () => {
  const { element, frames } = screensaver(true);
  frames.run(2);
  expect(frames.waiting, 'running').to.equal(1);
  element.remove();
  expect(frames.waiting, 'stopped').to.equal(0);
});
