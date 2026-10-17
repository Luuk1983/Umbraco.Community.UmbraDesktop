import { expect, fixture, html } from '@open-wc/testing';
import { Stage } from './stage.js';

/**
 * The stage's own gestures, where Fabric is kept out: two fingers pan and pinch, one finger is
 * Fabric's. A finger is forgotten when it lifts, or the next single finger would look like a second.
 */

/** A stage in a box, showing a 400 × 300 picture. */
async function stage(): Promise<{ stage: Stage; box: HTMLElement }> {
  const box = await fixture<HTMLDivElement>(html`<div style="position: relative; width: 600px; height: 400px"></div>`);
  const view = new Stage(box);
  const base = document.createElement('canvas');
  base.width = 400;
  base.height = 300;
  view.setView(base, { w: 400, h: 300 }, 1, true);
  return { stage: view, box };
}

/** A touch pointer event. */
const touch = (type: string, id: number, x: number, y: number) =>
  new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, composed: true, isPrimary: id === 1 });

it('leaves one finger to Fabric, and forgets it when it lifts', async () => {
  const { stage: view, box } = await stage();
  const before = [...view.canvas.viewportTransform];
  box.dispatchEvent(touch('pointerdown', 1, 100, 100));
  window.dispatchEvent(touch('pointerup', 1, 100, 100));
  // A new single finger, then a move: still one finger, so the view does not move.
  box.dispatchEvent(touch('pointerdown', 2, 200, 200));
  window.dispatchEvent(touch('pointermove', 2, 260, 240));
  window.dispatchEvent(touch('pointerup', 2, 260, 240));
  expect([...view.canvas.viewportTransform]).to.deep.equal(before);
  view.dispose();
});

it('pans with two fingers', async () => {
  const { stage: view, box } = await stage();
  const before = view.canvas.viewportTransform[4];
  box.dispatchEvent(touch('pointerdown', 1, 100, 100));
  box.dispatchEvent(touch('pointerdown', 2, 200, 100));
  window.dispatchEvent(touch('pointermove', 2, 240, 100));
  window.dispatchEvent(touch('pointerup', 2, 240, 100));
  window.dispatchEvent(touch('pointerup', 1, 100, 100));
  expect(view.canvas.viewportTransform[4]).to.not.equal(before);
  view.dispose();
});

/**
 * From the review: Fabric caches a filtered image's GPU texture until the image is disposed, so a
 * view redrawn while an adjustment shows must dispose the images it replaces, or every redraw strands
 * a texture as large as the view.
 */
it('disposes the pictures it replaces', async () => {
  const { stage: view } = await stage();
  const old = view.canvas.getObjects().slice(0, 2);
  const disposed: unknown[] = [];
  for (const image of old) {
    const original = image.dispose.bind(image);
    image.dispose = () => {
      disposed.push(image);
      original();
    };
  }
  const base = document.createElement('canvas');
  base.width = 400;
  base.height = 300;
  view.setView(base, { w: 400, h: 300 }, 1, false);
  expect(disposed).to.have.length(2);
  view.dispose();
});

/**
 * From the review: Fabric's WebGL backend holds a square canvas of the texture size for the page's
 * whole life, so 8192 pins 256 MB of GPU memory. The view never needs more than Fabric's own 4096:
 * the saved file is drawn on the CPU at full size.
 */
it('keeps the view within Fabric own texture size', async () => {
  const { config } = await import('fabric');
  expect(config.textureSize).to.be.at.most(4096);
});
