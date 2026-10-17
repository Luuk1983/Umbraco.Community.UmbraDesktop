import { expect } from '@open-wc/testing';
import { renderDocument } from './render.js';
import { encodeCanvas } from './encode.js';
import { initialState, outputSize } from './state.js';
import type { EditorState } from './state.js';
import { rotate } from './geometry.js';

/**
 * The picture as saved: drawn at full resolution in a fixed order (turn and flip, crop, adjust,
 * redact, marks, resize) and encoded with the canvas's own encoder. Design §6 and Review Focus 1.
 */

/**
 * A picture of one colour, as the decoder would hand it over.
 * @param w Its width.
 * @param h Its height.
 * @param colour Its colour.
 * @returns The bitmap.
 */
async function solid(w: number, h: number, colour = 'rgb(100, 100, 100)'): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(w, h);
  const context = canvas.getContext('2d')!;
  context.fillStyle = colour;
  context.fillRect(0, 0, w, h);
  return canvas.transferToImageBitmap();
}

/** A picture of random noise, which compresses badly, so quality shows in the size. */
async function noise(w: number, h: number): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(w, h);
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(w, h);
  for (let i = 0; i < image.data.length; i++) image.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
  context.putImageData(image, 0, 0);
  return canvas.transferToImageBitmap();
}

/** One pixel of a canvas, as RGBA. */
function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data];
}

it('saves at the cropped and resized size', async () => {
  const picture = await solid(600, 400);
  const state: EditorState = { ...initialState({ w: 600, h: 400 }), crop: { x: 100, y: 50, w: 300, h: 200 }, size: { w: 150, h: 100 } };
  const canvas = renderDocument(picture, state);
  expect({ w: canvas.width, h: canvas.height }).to.deep.equal(outputSize(state));
});

it('turns the picture before cropping it', async () => {
  // Red on the left half, so after a quarter turn to the right it is on the top half.
  const canvas = new OffscreenCanvas(40, 20);
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgb(255, 0, 0)';
  context.fillRect(0, 0, 20, 20);
  context.fillStyle = 'rgb(0, 0, 255)';
  context.fillRect(20, 0, 20, 20);
  const picture = canvas.transferToImageBitmap();
  const turned = renderDocument(picture, rotate(initialState({ w: 40, h: 20 }), 'right'));
  expect({ w: turned.width, h: turned.height }).to.deep.equal({ w: 20, h: 40 });
  expect(pixel(turned, 10, 5).slice(0, 3)).to.deep.equal([255, 0, 0]);
  expect(pixel(turned, 10, 35).slice(0, 3)).to.deep.equal([0, 0, 255]);
});

it('flattens marks and regions into the saved picture, and leaves them out of the view', async () => {
  const picture = await solid(200, 100, 'rgb(255, 255, 255)');
  const state: EditorState = {
    ...initialState({ w: 200, h: 100 }),
    marks: [{ id: 'm', kind: 'box', colour: '#ff0000', width: 6, data: { x: 10, y: 10, w: 60, h: 60 } }],
    regions: [{ id: 'r', style: 'pixelate', strength: 8, rect: { x: 120, y: 10, w: 60, h: 60 } }],
  };
  const view = renderDocument(picture, state, { withOverlays: false });
  const saved = renderDocument(picture, state);
  expect(pixel(view, 10, 40).slice(0, 3), 'no mark in the view').to.deep.equal([255, 255, 255]);
  expect(pixel(saved, 10, 40).slice(0, 3), 'the mark in the file').to.deep.equal([255, 0, 0]);
});

it('draws a reduced view at a scale', async () => {
  const picture = await solid(600, 400);
  const canvas = renderDocument(picture, initialState({ w: 600, h: 400 }), { scale: 0.25 });
  expect({ w: canvas.width, h: canvas.height }).to.deep.equal({ w: 150, h: 100 });
});

it('saves a 6000 × 4000 photo at its full size, adjusted (Review Focus 1)', async function () {
  this.timeout(30_000);
  const picture = await solid(6000, 4000);
  const state: EditorState = { ...initialState({ w: 6000, h: 4000 }), adjust: { exposure: 50, brightness: 0, contrast: 0, saturation: 0 } };
  const started = performance.now();
  const canvas = renderDocument(picture, state);
  const took = performance.now() - started;
  expect({ w: canvas.width, h: canvas.height }).to.deep.equal({ w: 6000, h: 4000 });
  // Exposure 50 multiplies the light by 2 ** 0.5: 100 becomes 141.
  const [r, g, b] = pixel(canvas, 3000, 2000);
  for (const value of [r, g, b]) expect(value).to.be.closeTo(141, 1);
  console.log(`6000 × 4000 render with exposure: ${Math.round(took)}ms`);
});

describe('encoding', () => {
  it('writes each format with its own type', async () => {
    const canvas = renderDocument(await solid(40, 30), initialState({ w: 40, h: 30 }));
    expect((await encodeCanvas(canvas, 'jpeg', 90)).type).to.equal('image/jpeg');
    expect((await encodeCanvas(canvas, 'png', 90)).type).to.equal('image/png');
    expect((await encodeCanvas(canvas, 'webp', 90)).type).to.equal('image/webp');
  });

  it('makes a smaller JPEG at a lower quality', async () => {
    const canvas = renderDocument(await noise(300, 200), initialState({ w: 300, h: 200 }));
    const low = await encodeCanvas(canvas, 'jpeg', 50);
    const high = await encodeCanvas(canvas, 'jpeg', 90);
    expect(low.size).to.be.lessThan(high.size);
  });
});
