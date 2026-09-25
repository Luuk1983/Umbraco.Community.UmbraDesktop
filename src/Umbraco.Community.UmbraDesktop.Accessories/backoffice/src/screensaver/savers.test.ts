import { expect } from '@open-wc/testing';
import { SAVERS, drawUmbracoLogo, seededRandom } from './savers.js';
import { UMBRACO_LOGO_PATH, UMBRACO_LOGO_SIZE } from '../shared/umbraco-logo.js';
import type { FlyingState, MystifyState, StarfieldState } from './savers.js';

/**
 * The three savers as simulations: what each promises about its own state as time passes. Drawing
 * is left to the element's tests and to looking at it; these are the rules underneath.
 */

const W = 800;
const H = 600;
/** Sixty frames a second, for ten seconds. */
const FRAMES = 600;
const FRAME_MS = 1000 / 60;

it('draws the same sequence from the same seed, and a different one from another', () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  const c = seededRandom(8);
  const first = [a(), a(), a()];
  expect([b(), b(), b()]).to.deep.equal(first);
  expect([c(), c(), c()]).to.not.deep.equal(first);
  expect(first.every((value) => value >= 0 && value < 1)).to.equal(true);
});

describe('Starfield', () => {
  it('keeps the same number of stars, all in front of the viewer', () => {
    const saver = SAVERS.starfield(W, H, seededRandom(1));
    const count = (saver.state as StarfieldState).stars.length;
    for (let i = 0; i < FRAMES; i++) saver.step(FRAME_MS);
    const { stars } = saver.state as StarfieldState;
    expect(stars.length).to.equal(count);
    expect(stars.every((star) => star.z > 0 && star.z <= 1)).to.equal(true);
  });

  /** Flying forward means every star moves away from the centre of the screen until it is recycled. */
  it('moves every star outward from the centre of the screen', () => {
    const saver = SAVERS.starfield(W, H, seededRandom(2));
    const before = (saver.state as StarfieldState).stars.map((star) => ({ ...star }));
    saver.step(FRAME_MS);
    const after = (saver.state as StarfieldState).stars;
    const reach = (star: { x: number; y: number; z: number }) => Math.hypot(star.x / star.z, star.y / star.z);
    for (let i = 0; i < before.length; i++) {
      // A star that reached the viewer is recycled far away, which is not "moving".
      if (after[i].z < before[i].z) expect(reach(after[i]), `star ${i}`).to.be.at.least(reach(before[i]));
    }
  });
});

describe('Mystify', () => {
  it('keeps every corner of every shape on the screen', () => {
    const saver = SAVERS.mystify(W, H, seededRandom(3));
    for (let i = 0; i < FRAMES; i++) saver.step(FRAME_MS);
    const { shapes } = saver.state as MystifyState;
    for (const shape of shapes) {
      for (const point of shape.points) {
        expect(point.x).to.be.within(0, W);
        expect(point.y).to.be.within(0, H);
      }
    }
  });

  it('keeps a trail of a fixed length behind each shape', () => {
    const saver = SAVERS.mystify(W, H, seededRandom(4));
    for (let i = 0; i < FRAMES; i++) saver.step(FRAME_MS);
    const { shapes, trailLength } = saver.state as MystifyState;
    expect(shapes.every((shape) => shape.trail.length === trailLength)).to.equal(true);
  });

  it('shifts its colours as it goes', () => {
    const saver = SAVERS.mystify(W, H, seededRandom(5));
    const hue = (saver.state as MystifyState).shapes[0].hue;
    for (let i = 0; i < 60; i++) saver.step(FRAME_MS);
    expect((saver.state as MystifyState).shapes[0].hue).to.not.equal(hue);
  });
});

describe('Flying Umbraco', () => {
  it('keeps the same number of logos, all in front of the viewer, growing as they come closer', () => {
    const saver = SAVERS.flying(W, H, seededRandom(6));
    const count = (saver.state as FlyingState).logos.length;
    const first = { ...(saver.state as FlyingState).logos[0] };
    saver.step(FRAME_MS);
    const next = (saver.state as FlyingState).logos[0];
    if (next.z < first.z) expect(1 / next.z).to.be.greaterThan(1 / first.z);
    for (let i = 0; i < FRAMES; i++) saver.step(FRAME_MS);
    const { logos } = saver.state as FlyingState;
    expect(logos.length).to.equal(count);
    expect(logos.every((logo) => logo.z > 0 && logo.z <= 1)).to.equal(true);
  });
});

it('draws every saver onto a canvas without throwing', () => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d')!;
  for (const make of Object.values(SAVERS)) {
    const saver = make(W, H, seededRandom(9));
    saver.step(FRAME_MS);
    saver.draw(context);
  }
});

/**
 * Flying Umbraco's logo is Umbraco's own mark, checked against the path in Umbraco's `icon-umbraco`.
 *
 * Drawn once, large, then sampled: every point the official path covers must be blue, and every
 * point inside the disc that it does not cover, which is the U, must be white. Points within a
 * couple of pixels of an edge are skipped, since anti-aliasing blends them. The homemade U this
 * replaced fails it, because its U was a different shape.
 */
it('draws the Umbraco logo as Umbraco draws it', () => {
  const size = 200;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  drawUmbracoLogo(context, size / 2, size / 2, size / 2);

  const official = new Path2D(UMBRACO_LOGO_PATH);
  const scale = UMBRACO_LOGO_SIZE / size;
  const covered = (x: number, y: number) => context.isPointInPath(official, x * scale, y * scale);
  const inDisc = (x: number, y: number) => Math.hypot(x - size / 2, y - size / 2) < size * 0.44;
  let checked = 0;
  for (let y = 4; y < size; y += 6) {
    for (let x = 4; x < size; x += 6) {
      const here = covered(x, y);
      const neighbours = [covered(x - 2, y), covered(x + 2, y), covered(x, y - 2), covered(x, y + 2)];
      if (neighbours.some((each) => each !== here)) continue;
      if (!here && !inDisc(x, y)) continue;
      const [r, g, b] = context.getImageData(x, y, 1, 1).data;
      if (here) expect([r, g, b], `blue at ${x},${y}`).to.deep.equal([0x35, 0x44, 0xb1]);
      else expect([r, g, b], `the U is white at ${x},${y}`).to.deep.equal([255, 255, 255]);
      checked++;
    }
  }
  expect(checked, 'enough of the logo sampled to mean something').to.be.greaterThan(300);
});

/**
 * A stand-in canvas that records what is drawn at what size, for asserting on proportions without
 * reading pixels.
 * @param width The screen's width.
 * @param height The screen's height.
 * @returns The context, and the sizes it was asked to draw: fillRect widths, scale factors (the
 *   logo's), and line widths.
 */
function recorder(width: number, height: number) {
  const drawn = { rects: [] as number[], scales: [] as number[], lines: [] as number[] };
  const target: Record<string | symbol, unknown> = { canvas: { width, height } };
  const context = new Proxy(target, {
    get(_target, key) {
      if (key in target) return target[key];
      if (key === 'fillRect') return (_x: number, _y: number, w: number) => drawn.rects.push(w);
      if (key === 'scale') return (by: number) => drawn.scales.push(by);
      return () => undefined;
    },
    set(_target, key, value) {
      if (key === 'lineWidth') drawn.lines.push(value as number);
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, drawn };
}

/**
 * Draw one frame of a saver on a screen, from a fixed seed.
 * @param id The saver.
 * @param width The screen's width.
 * @param height The screen's height.
 * @returns What it drew.
 */
function frame(id: keyof typeof SAVERS, width: number, height: number) {
  const { context, drawn } = recorder(width, height);
  const saver = SAVERS[id](width, height, seededRandom(3));
  saver.step(FRAME_MS);
  saver.draw(context);
  return drawn;
}

/**
 * Sizes are in proportion to the screen, so the little preview is a miniature of the real thing.
 * They were fixed pixels: a logo that filled much of the 192px preview was small on a 1920px
 * monitor, and the stars were specks, which was reported as the preview not looking like the output.
 * A screen twice the size draws everything twice the size.
 */
describe('in proportion to the screen', () => {
  const HD = [1920, 1080] as const;
  const UHD = [3840, 2160] as const;
  const scaled = (small: number[], large: number[]) => small.map((size, i) => large[i] / size);

  it('draws stars twice the size on a screen twice the size', () => {
    const small = frame('starfield', ...HD).rects.slice(1);
    const large = frame('starfield', ...UHD).rects.slice(1);
    // Only the stars drawn above the one-pixel minimum: the faintest on a full HD screen come out
    // just under it and are lifted to it, so they do not double.
    const pairs = small.map((size, i) => [size, large[i]]).filter(([size]) => size > 1);
    expect(pairs.length, 'most stars are above the minimum').to.be.greaterThan(small.length / 2);
    for (const [size, twice] of pairs) expect(twice / size).to.be.closeTo(2, 1e-9);
  });

  it('draws logos twice the size on a screen twice the size', () => {
    for (const ratio of scaled(frame('flying', ...HD).scales, frame('flying', ...UHD).scales)) {
      expect(ratio).to.be.closeTo(2, 1e-9);
    }
  });

  it('draws Mystify’s lines twice as thick on a screen twice the size', () => {
    expect(frame('mystify', ...UHD).lines[0] / frame('mystify', ...HD).lines[0]).to.be.closeTo(2, 1e-9);
  });

  it('draws bigger than it used to on a full HD screen, and never below a pixel in the preview', () => {
    // The nearest logo used to be at most 74px across the radius, whatever the screen.
    expect(Math.max(...frame('flying', ...HD).scales) * (315.89 / 2)).to.be.greaterThan(74);
    const preview = frame('starfield', 192, 144).rects.slice(1);
    expect(Math.min(...preview), 'every star in the preview still shows').to.be.at.least(1);
  });
});
