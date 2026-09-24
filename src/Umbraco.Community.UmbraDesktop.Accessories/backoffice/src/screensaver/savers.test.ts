import { expect } from '@open-wc/testing';
import { SAVERS, seededRandom } from './savers.js';
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
