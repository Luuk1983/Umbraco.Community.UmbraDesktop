import { expect } from '@open-wc/testing';
import { fitInside } from './resize.js';

/**
 * The resize maths (design §6.2): the scale is the smallest of one and each limit over its side, on
 * the upright size, rounded to whole pixels and never below one. Never larger.
 */
describe('fitInside', () => {
  const box = { maxWidth: 2560, maxHeight: 2560 };

  it('shrinks a landscape photo to the box', () => {
    expect(fitInside(6000, 4000, box)).to.deep.equal({ width: 2560, height: 1707, scaled: true });
  });

  it('shrinks a portrait photo to the box', () => {
    expect(fitInside(4000, 6000, box)).to.deep.equal({ width: 1707, height: 2560, scaled: true });
  });

  it('never makes an image larger, and says it left it alone', () => {
    expect(fitInside(1800, 1200, box)).to.deep.equal({ width: 1800, height: 1200, scaled: false });
  });

  it('leaves a side without a limit unlimited', () => {
    expect(fitInside(3000, 10, { maxWidth: 2560 })).to.deep.equal({ width: 2560, height: 9, scaled: true });
    expect(fitInside(10, 3000, { maxHeight: 2560 })).to.deep.equal({ width: 9, height: 2560, scaled: true });
  });

  it('never rounds a side down to nothing', () => {
    expect(fitInside(5000, 1, { maxWidth: 100, maxHeight: 100 })).to.deep.equal({ width: 100, height: 1, scaled: true });
  });

  it('leaves the size as it is without a box', () => {
    expect(fitInside(6000, 4000, null)).to.deep.equal({ width: 6000, height: 4000, scaled: false });
  });
});
