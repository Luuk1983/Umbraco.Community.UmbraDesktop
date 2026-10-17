import { expect } from '@open-wc/testing';
import { REDACT_DEFAULT_STRENGTH, redact, redactionBlock } from './redact.js';

/**
 * Redaction destroys what it covers: the saved file holds nothing of the original pixels under a
 * region, for either style (design §4.1, anti-goal "a redaction that can be undone from the saved
 * file"). Both styles are built only from block means, so two pictures that differ only in detail
 * within each block redact to the same bytes.
 */

/** Side of the test pictures, and of a block. */
const SIDE = 64;
const BLOCK = 16;

/**
 * A canvas filled pixel by pixel.
 * @param fill The colour of each pixel.
 * @returns The canvas and its 2D context.
 */
function picture(fill: (x: number, y: number) => [number, number, number]) {
  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const image = context.createImageData(SIDE, SIDE);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * SIDE + x) * 4;
      image.data.set([r, g, b, 255], i);
    }
  }
  context.putImageData(image, 0, 0);
  return { canvas, context };
}

/** The whole picture's bytes. */
const bytes = (context: CanvasRenderingContext2D) => context.getImageData(0, 0, SIDE, SIDE).data;

/** A picture whose every block averages 100 grey: a checkerboard of 0 and 200 inside each block. */
const detailed = () => picture((x, y) => ((x + y) % 2 ? [200, 200, 200] : [0, 0, 0]));

/** The same means with no detail at all. */
const flat = () => picture(() => [100, 100, 100]);

it('sizes its blocks from the picture and the strength, never below 8px', () => {
  expect(REDACT_DEFAULT_STRENGTH).to.equal(8);
  expect(redactionBlock({ w: 6000, h: 4000 }, 8)).to.equal(160);
  expect(redactionBlock({ w: 6000, h: 4000 }, 1)).to.equal(20);
  expect(redactionBlock({ w: 64, h: 64 }, 8)).to.equal(8);
});

for (const style of ['pixelate', 'blur'] as const) {
  it(`${style}: keeps nothing of the detail, only the block means`, () => {
    const a = detailed();
    const b = flat();
    const rect = { x: 0, y: 0, w: SIDE, h: SIDE };
    redact(a.context, rect, style, BLOCK);
    redact(b.context, rect, style, BLOCK);
    expect([...bytes(a.context)]).to.deep.equal([...bytes(b.context)]);
  });

  it(`${style}: changes every pixel of random noise`, () => {
    const noise = picture(() => [Math.random() * 256, Math.random() * 256, Math.random() * 256].map(Math.floor) as [number, number, number]);
    const before = bytes(noise.context);
    redact(noise.context, { x: 0, y: 0, w: SIDE, h: SIDE }, style, BLOCK);
    const after = bytes(noise.context);
    let same = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i] === after[i] && before[i + 1] === after[i + 1] && before[i + 2] === after[i + 2]) same++;
    }
    expect(same).to.equal(0);
  });

  it(`${style}: leaves everything outside the region as it was`, () => {
    const a = detailed();
    const before = bytes(a.context);
    redact(a.context, { x: 16, y: 16, w: 32, h: 32 }, style, BLOCK);
    const after = bytes(a.context);
    for (const [x, y] of [
      [0, 0],
      [63, 63],
      [15, 30],
      [48, 20],
    ]) {
      const i = (y * SIDE + x) * 4;
      expect(after[i], `${x},${y}`).to.equal(before[i]);
    }
  });
}

/**
 * From the review: the blur cost grew with its radius, so a strong blur over a large region of a
 * large photo held the page for seconds on every save. It is a running sum now, whatever the radius.
 */
describe('blur cost', () => {
  /** A region of noise. */
  function noiseCanvas(w: number, h: number) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const image = context.createImageData(w, h);
    for (let i = 0; i < image.data.length; i++) image.data[i] = i % 4 === 3 ? 255 : (i * 2654435761) % 256;
    context.putImageData(image, 0, 0);
    return context;
  }

  it('blurs a 2000 × 1500 region at block 160 in well under a second', () => {
    const context = noiseCanvas(2000, 1500);
    const started = performance.now();
    redact(context, { x: 0, y: 0, w: 2000, h: 1500 }, 'blur', 160);
    expect(performance.now() - started).to.be.below(700);
  });
});
