import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_RING_DASHARRAY,
  UMBRADESKTOP_RING_RADIUS,
  UMBRADESKTOP_RING_STROKE_PX,
  UMBRADESKTOP_RING_VIEWBOX,
  UMBRADESKTOP_SPLASH_RING_SIZE,
  UMBRADESKTOP_WINDOW_RING_SIZE,
  ringMarkSize,
  ringStrokeWidth,
} from './loader-ring.js';

/**
 * The ring is drawn at two sizes — 150px on the boot splash, 64px in a loading window body — from
 * one viewBox, so every number below is a ratio rather than a measurement. That is the whole point
 * of the module: the splash used to carry these as literals, and a second copy typed at a second
 * size is how the two drift into looking like different animations.
 *
 * The splash numbers are asserted exactly because they are the ones already on screen. A refactor
 * that quietly rescaled the boot logo while making the window one work would be a regression in the
 * feature this change exists to spread, and nothing else would catch it: the splash paints before
 * any test harness is up.
 */

it('renders the same visual stroke weight at both sizes', () => {
  // The SVG scales with its rendered box, so a stroke expressed in user units thins as the box
  // shrinks: the splash's literal 2 would come out at 0.85px in a 64px window loader, which
  // renders as a grey suggestion of a ring rather than a ring. `ringStrokeWidth` compensates, and
  // this asserts the compensation lands by converting back to pixels the way the browser will.
  for (const size of [UMBRADESKTOP_SPLASH_RING_SIZE, UMBRADESKTOP_WINDOW_RING_SIZE]) {
    const renderedPx = (ringStrokeWidth(size) * size) / UMBRADESKTOP_RING_VIEWBOX;
    expect(renderedPx, `the ring at ${size}px should paint a ${UMBRADESKTOP_RING_STROKE_PX}px stroke`).to.be.closeTo(
      UMBRADESKTOP_RING_STROKE_PX,
      0.001,
    );
  }
});

it('leaves the splash ring exactly the 2 user units it shipped with', () => {
  // The splash renders at its own viewBox size, so the compensation above must come out as the
  // identity there. Stated separately from the loop because this is the no-visible-change claim.
  expect(ringStrokeWidth(UMBRADESKTOP_SPLASH_RING_SIZE)).to.equal(UMBRADESKTOP_RING_STROKE_PX);
});

it('draws an arc of a quarter turn, whatever the size', () => {
  // A dash pattern lives in user units, so unlike the stroke it needs no compensation — which is
  // exactly why the arc must be derived from the radius rather than typed. The splash's literal
  // `90 360` was "near enough" to a quarter by the comment's own admission.
  const circumference = 2 * Math.PI * UMBRADESKTOP_RING_RADIUS;
  const [dash, gap] = UMBRADESKTOP_RING_DASHARRAY.split(' ').map(Number);

  expect(dash, 'the visible arc should be a quarter of the ring').to.be.closeTo(circumference / 4, 0.001);
  expect(gap, 'the gap must outrun the rest of the ring, or a second arc appears opposite the first').to.be.greaterThan(
    circumference - dash,
  );
});

it('keeps the mark at the size the splash already draws it', () => {
  // 72 of 150 is the ratio chosen by eye on the boot screen. Pinning it here is what lets the
  // window loader be "the splash, smaller" rather than a second composition that resembles it.
  expect(ringMarkSize(UMBRADESKTOP_SPLASH_RING_SIZE), 'the splash mark should still be 72px').to.equal(72);
});

it('shrinks the mark with the ring rather than fixing it', () => {
  const ratio = ringMarkSize(UMBRADESKTOP_WINDOW_RING_SIZE) / UMBRADESKTOP_WINDOW_RING_SIZE;
  const splashRatio = ringMarkSize(UMBRADESKTOP_SPLASH_RING_SIZE) / UMBRADESKTOP_SPLASH_RING_SIZE;

  expect(ratio, 'the mark should occupy the same share of the box at any size').to.be.closeTo(splashRatio, 0.001);
});

it('leaves room between the mark and the ring at the smaller size', () => {
  // The failure this guards is a mark grown until it touches the arc, which stops reading as a
  // logo with progress around it and starts reading as a clipped circle. Half the box minus the
  // ring's own radius is the clearance; it has to stay positive and visible at 64px, where every
  // ratio is at its tightest.
  const markRadius = ringMarkSize(UMBRADESKTOP_WINDOW_RING_SIZE) / 2;
  const ringRadiusPx =
    (UMBRADESKTOP_RING_RADIUS * UMBRADESKTOP_WINDOW_RING_SIZE) / UMBRADESKTOP_RING_VIEWBOX;

  expect(ringRadiusPx - markRadius, 'the mark should clear the arc by at least a few pixels').to.be.greaterThan(3);
});
