import { expect } from '@open-wc/testing';
import { EDGE_SCROLL_MAX, EDGE_SCROLL_ZONE, edgeScrollSpeed } from './edge-scroll.js';

/**
 * A selection box scrolls its list when the pointer nears the top or bottom edge (design §16.15): the
 * deeper into the edge, the faster, and at full speed past it.
 */
describe('scrolling at the edge', () => {
  const top = 100;
  const bottom = 500;

  it('does not scroll away from the edges', () => {
    expect(edgeScrollSpeed(300, top, bottom)).to.equal(0);
    expect(edgeScrollSpeed(top + EDGE_SCROLL_ZONE, top, bottom)).to.equal(0);
    expect(edgeScrollSpeed(bottom - EDGE_SCROLL_ZONE, top, bottom)).to.equal(0);
  });

  it('scrolls up near the top and down near the bottom, faster the deeper', () => {
    const near = edgeScrollSpeed(top + EDGE_SCROLL_ZONE - 4, top, bottom);
    const nearer = edgeScrollSpeed(top + 2, top, bottom);
    expect(near).to.be.below(0);
    expect(nearer).to.be.below(near);
    expect(edgeScrollSpeed(bottom - 2, top, bottom)).to.be.above(0);
  });

  it('scrolls at full speed past the edge', () => {
    expect(edgeScrollSpeed(top - 50, top, bottom)).to.equal(-EDGE_SCROLL_MAX);
    expect(edgeScrollSpeed(bottom + 50, top, bottom)).to.equal(EDGE_SCROLL_MAX);
  });

  it('keeps a list too short for two zones from scrolling both ways at once', () => {
    expect(edgeScrollSpeed(109, 100, 120)).to.be.below(0);
    expect(edgeScrollSpeed(111, 100, 120)).to.be.above(0);
  });
});
