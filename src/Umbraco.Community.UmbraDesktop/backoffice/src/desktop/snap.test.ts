import { expect } from '@open-wc/testing';
import { snapRect, snapTargetAt } from './snap';
import { UMBRADESKTOP_SNAP_EDGE } from './constants';

/**
 * A desktop wide enough that half of it clears any minimum in these cases, so a test that means to
 * be about tiling is about tiling and not about the overlap rule.
 */
const BOUNDS = { w: 1000, h: 700 };

/** A minimum small enough never to be in force, for the cases that are not about it. */
const TINY = { w: 100, h: 100 };

it('snaps left when the pointer reaches the left edge', () => {
  expect(snapTargetAt({ x: 0, y: 300 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal('left');
});

it('snaps right when the pointer reaches the right edge', () => {
  expect(snapTargetAt({ x: BOUNDS.w, y: 300 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal('right');
});

it('snaps top when the pointer reaches the top edge', () => {
  expect(snapTargetAt({ x: 500, y: 0 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal('top');
});

it('snaps nothing in the middle of the desktop', () => {
  expect(snapTargetAt({ x: 500, y: 300 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal(undefined);
});

it('still snaps when the pointer has left the surface entirely', () => {
  // Pointer capture keeps the drag alive past the surface, and a drag shoved hard into an edge
  // overshoots it. Reading that as "no longer in the zone" would cancel the snap the user is
  // most obviously asking for.
  expect(snapTargetAt({ x: -40, y: 300 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal('left');
  expect(snapTargetAt({ x: BOUNDS.w + 40, y: 300 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal('right');
  expect(snapTargetAt({ x: 500, y: -40 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal('top');
});

it('gives a side the corner, because the top edge is reachable without meaning it', () => {
  // The drag clamp pins a dragged titlebar to y >= 0, so a pointer aiming for the left half
  // routinely sits within a few pixels of the top edge on the way there. Halving is the specific
  // request; maximizing is what the whole top edge already offers everywhere else along it.
  expect(snapTargetAt({ x: 0, y: 0 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal('left');
  expect(snapTargetAt({ x: BOUNDS.w, y: 0 }, BOUNDS, UMBRADESKTOP_SNAP_EDGE)).to.equal('right');
});

it('halves the desktop exactly, leaving no gap and no overlap', () => {
  const left = snapRect('left', BOUNDS, TINY);
  const right = snapRect('right', BOUNDS, TINY);
  expect(left).to.deep.equal({ x: 0, y: 0, w: 500, h: 700 });
  expect(right).to.deep.equal({ x: 500, y: 0, w: 500, h: 700 });
  expect(left.x + left.w, 'the two halves should meet').to.equal(right.x);
});

it('halves an odd width without dropping or double-counting the middle pixel', () => {
  const odd = { w: 1001, h: 700 };
  const left = snapRect('left', odd, TINY);
  const right = snapRect('right', odd, TINY);
  expect(left.x + left.w).to.equal(right.x);
  expect(right.x + right.w).to.equal(odd.w);
});

it('fills the surface for a top snap', () => {
  expect(snapRect('top', BOUNDS, TINY)).to.deep.equal({ x: 0, y: 0, w: 1000, h: 700 });
});

it('lets the halves overlap rather than snapping a window below its minimum', () => {
  // The accepted trade-off: a window that cannot work at half the desktop keeps its own minimum
  // and the two halves grow into each other. Snapping to a legal-but-useless 320px backoffice
  // would satisfy the constraint and help nobody.
  const min = { w: 600, h: 100 };
  const left = snapRect('left', BOUNDS, min);
  const right = snapRect('right', BOUNDS, min);
  expect(left.w).to.equal(600);
  expect(right.w).to.equal(600);
  expect(left.x).to.equal(0);
  expect(right.x).to.equal(400);
  expect(left.x + left.w, 'the halves are expected to overlap here').to.be.greaterThan(right.x);
});

it('never snaps a window wider than the desktop it is snapping into', () => {
  // Past this point the window is wider than the surface whatever anybody does, and its own
  // inline min-width is what will actually be in force. Asking for more than the surface would
  // only add an x that hangs the titlebar off an edge on top of that.
  const rect = snapRect('right', { w: 500, h: 400 }, { w: 900, h: 300 });
  expect(rect.w).to.equal(500);
  expect(rect.x).to.equal(0);
});

it('keeps a snapped window flush with the top and the bottom of the surface', () => {
  const rect = snapRect('left', BOUNDS, TINY);
  expect(rect.y).to.equal(0);
  expect(rect.y + rect.h).to.equal(BOUNDS.h);
});
