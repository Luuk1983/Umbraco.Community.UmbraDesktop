import { expect } from '@open-wc/testing';
import { adjustMatrix, applyMatrix } from './adjust.js';
import { NEUTRAL_ADJUST } from './state.js';

/**
 * The four adjustments as one colour matrix, which the live preview (Fabric's ColorMatrix filter)
 * and the export both use, so what is seen is what is saved. Pinned mapping in plan Task 14.
 */

/** The 4 × 5 identity, row by row. */
const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Rec. 709 luminance weights. */
const LUMA = [0.2126, 0.7152, 0.0722];

/** Numbers equal to a few decimals, element by element. */
function close(actual: number[], expected: number[]): void {
  expect(actual).to.have.length(expected.length);
  actual.forEach((value, index) => expect(value, `element ${index}`).to.be.closeTo(expected[index], 1e-9));
}

it('is the identity with every slider at zero', () => {
  close(adjustMatrix(NEUTRAL_ADJUST), IDENTITY);
});

it('doubles the light at full exposure', () => {
  const matrix = adjustMatrix({ ...NEUTRAL_ADJUST, exposure: 100 });
  expect(matrix[0]).to.be.closeTo(2, 1e-9);
  expect(matrix[6]).to.be.closeTo(2, 1e-9);
  expect(matrix[12]).to.be.closeTo(2, 1e-9);
  expect(matrix[18], 'alpha untouched').to.equal(1);
});

it('adds light evenly for brightness, and scales round the middle for contrast', () => {
  const bright = adjustMatrix({ ...NEUTRAL_ADJUST, brightness: 100 });
  expect(bright[4]).to.be.closeTo(0.5, 1e-9);
  const contrast = adjustMatrix({ ...NEUTRAL_ADJUST, contrast: 100 });
  expect(contrast[0]).to.be.closeTo(2, 1e-9);
  expect(contrast[4], 'mid grey stays put').to.be.closeTo(-0.5, 1e-9);
});

it('turns every row into the luminance weights with no saturation', () => {
  const matrix = adjustMatrix({ ...NEUTRAL_ADJUST, saturation: -100 });
  for (const row of [0, 1, 2]) close(matrix.slice(row * 5, row * 5 + 3), LUMA);
});

it('applies the matrix to pixels, clamped to a byte', () => {
  const pixels = new Uint8ClampedArray([100, 100, 100, 255, 200, 10, 0, 128]);
  applyMatrix(pixels, adjustMatrix({ ...NEUTRAL_ADJUST, exposure: 100 }));
  expect([...pixels]).to.deep.equal([200, 200, 200, 255, 255, 20, 0, 128]);
});
