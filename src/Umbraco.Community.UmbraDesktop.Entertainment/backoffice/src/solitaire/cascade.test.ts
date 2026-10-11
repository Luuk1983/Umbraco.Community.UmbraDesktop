import { expect } from '@open-wc/testing';
import { WinCascade, stepBouncer, type CascadeCard } from './cascade.js';

/**
 * A frame scheduler the test drives by hand: the runner's background tabs never deliver
 * `requestAnimationFrame`, so a cascade under test must not wait for a real frame.
 */
class ManualFrames {
  /** The callback waiting for the next frame, if any. */
  pending: (() => void) | undefined;

  /**
   * Stand-in for `requestAnimationFrame`.
   * @param callback Run on the next manual step.
   * @returns A handle for {@link cancel}.
   */
  schedule = (callback: () => void): number => {
    this.pending = callback;
    return 1;
  };

  /** Stand-in for `cancelAnimationFrame`. */
  cancel = (): void => {
    this.pending = undefined;
  };

  /**
   * Run frames until none is pending.
   * @param limit Safety cap so a broken cascade fails instead of hanging.
   * @returns How many frames ran.
   */
  drain(limit = 10_000): number {
    let n = 0;
    while (this.pending && n < limit) {
      const next = this.pending;
      this.pending = undefined;
      next();
      n++;
    }
    return n;
  }
}

/**
 * A canvas with a fixed CSS size, which the caller owns.
 * @returns The canvas.
 */
function canvas(): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.style.cssText = 'position:fixed;left:0;top:0;width:301px;height:200px';
  document.body.appendChild(el);
  return el;
}

/**
 * Cards whose image is a small canvas, which every browser can draw.
 * @param n How many.
 * @returns The cards.
 */
function cards(n: number): CascadeCard[] {
  return Array.from({ length: n }, () => ({ image: document.createElement('canvas'), x: 100, y: 10 }));
}

/** The card size every cascade test uses, in CSS px. */
const SIZE = { w: 20, h: 28 };
/** Marks a promise that had not settled when the race was run. */
const STILL_PENDING = Symbol('pending');

/**
 * Whether a promise has settled, without waiting for it.
 * @param p The promise.
 * @returns True once it resolved.
 */
async function settled(p: Promise<void>): Promise<boolean> {
  return (await Promise.race([p.then(() => true), Promise.resolve(STILL_PENDING)])) === true;
}

describe('solitaire cascade', () => {
  let host: HTMLCanvasElement;
  beforeEach(() => {
    host = canvas();
  });
  afterEach(() => host.remove());

  it('falls under gravity and moves sideways', () => {
    const next = stepBouncer({ x: 0, y: 0, vx: 3, vy: 0 }, 100, 1, 0.7);
    expect(next).to.deep.equal({ x: 3, y: 0, vx: 3, vy: 1 });
  });

  it('bounces off the floor, losing energy', () => {
    const next = stepBouncer({ x: 0, y: 99, vx: 3, vy: 10 }, 100, 1, 0.7);
    expect(next.y).to.equal(100);
    expect(next.vy).to.be.closeTo(-7, 0.001);
  });

  it('resolves at once with no cards', async () => {
    const frames = new ManualFrames();
    await new WinCascade(host, [], SIZE, frames).start();
    expect(frames.pending).to.equal(undefined);
  });

  it('runs every card off the canvas and resolves', async () => {
    const frames = new ManualFrames();
    const run = new WinCascade(host, cards(3), SIZE, { ...frames, random: () => 0.5 });
    const done = run.start();
    expect(frames.drain()).to.be.greaterThan(3);
    await done;
  });

  it('survives an image that cannot be drawn', async () => {
    const frames = new ManualFrames();
    const broken = document.createElement('img');
    const list: CascadeCard[] = [{ image: broken, x: 100, y: 10 }, ...cards(1)];
    const run = new WinCascade(host, list, SIZE, { ...frames, random: () => 0.5 });
    const done = run.start();
    frames.drain();
    await done;
  });

  it('resolves a running cascade when stopped, and again safely', async () => {
    const frames = new ManualFrames();
    const run = new WinCascade(host, cards(3), SIZE, frames);
    const done = run.start();
    expect(await settled(done)).to.equal(false);
    run.stop();
    await done;
    run.stop();
    expect(frames.pending).to.equal(undefined);
  });

  it('resolves at once when stopped before it starts', async () => {
    const frames = new ManualFrames();
    const run = new WinCascade(host, cards(3), SIZE, frames);
    run.stop();
    await run.start();
    expect(frames.pending).to.equal(undefined);
  });

  it('returns the same promise for a second start and runs one loop', async () => {
    const frames = new ManualFrames();
    const run = new WinCascade(host, cards(2), SIZE, { ...frames, random: () => 0.5 });
    const first = run.start();
    const second = run.start();
    expect(second).to.equal(first);
    frames.drain();
    await first;
  });

  it('sizes the backing store in device pixels', async () => {
    const frames = new ManualFrames();
    const run = new WinCascade(host, cards(1), SIZE, frames);
    const done = run.start();
    const dpr = window.devicePixelRatio || 1;
    expect(host.width).to.equal(Math.round(301 * dpr));
    expect(host.height).to.equal(Math.round(200 * dpr));
    run.stop();
    await done;
  });

  it('sizes from layout size, not from a scaled ancestor', async () => {
    const frames = new ManualFrames();
    const target = canvas();
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:0;top:0;transform:scale(.5);transform-origin:0 0';
    document.body.appendChild(wrapper);
    wrapper.appendChild(target);
    target.style.position = 'static';
    target.style.display = 'block';
    const run = new WinCascade(target, cards(1), SIZE, frames);
    const done = run.start();
    const dpr = window.devicePixelRatio || 1;
    expect(target.width).to.equal(Math.round(301 * dpr));
    expect(target.height).to.equal(Math.round(200 * dpr));
    run.stop();
    await done;
    wrapper.remove();
  });
});
