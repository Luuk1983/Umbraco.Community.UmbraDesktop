import { expect } from '@open-wc/testing';
import { blankImage, floodFill, linePoints, parseColour, pixelAt, resizeImage, stamp } from './raster.js';
import type { Rgba } from './raster.js';

const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];
const RED: Rgba = [255, 0, 0, 255];

it('starts a picture as white paper', () => {
  const image = blankImage(3, 2);
  expect(image.data.length).to.equal(3 * 2 * 4);
  expect(pixelAt(image, 2, 1)).to.deep.equal(WHITE);
});

it('reads a hex colour as opaque RGBA', () => {
  expect(parseColour('#ff8000')).to.deep.equal([255, 128, 0, 255]);
  expect(parseColour('#FFF')).to.deep.equal([255, 255, 255, 255]);
});

/**
 * A stroke between two pointer events is a line of pixels, with no gaps. Pointer events arrive tens
 * of pixels apart on a fast drag, and stamping only where they land draws a dotted line.
 */
it('joins two points with a gapless line, both ends included', () => {
  expect(linePoints(0, 0, 3, 0)).to.deep.equal([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ]);
  const diagonal = linePoints(0, 0, 5, 2);
  expect(diagonal[0]).to.deep.equal([0, 0]);
  expect(diagonal[diagonal.length - 1]).to.deep.equal([5, 2]);
  for (let index = 1; index < diagonal.length; index++) {
    const [x0, y0] = diagonal[index - 1];
    const [x1, y1] = diagonal[index];
    expect(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), 'each step touches the last').to.equal(1);
  }
  expect(linePoints(4, 4, 4, 4), 'a click is a dot').to.deep.equal([[4, 4]]);
});

it('stamps a square brush centred on the point, clipped to the picture', () => {
  const image = blankImage(5, 5);
  stamp(image, 2, 2, 3, BLACK);
  expect(pixelAt(image, 1, 1)).to.deep.equal(BLACK);
  expect(pixelAt(image, 3, 3)).to.deep.equal(BLACK);
  expect(pixelAt(image, 0, 0), 'outside a size-3 brush').to.deep.equal(WHITE);
  stamp(image, 0, 0, 3, RED);
  expect(pixelAt(image, 0, 0), 'a brush half off the edge still paints the half that is on').to.deep.equal(RED);
});

/**
 * Fill replaces the connected region of exactly the colour clicked, four-connected, and stops at any
 * other colour. Exactly, because the strokes here are aliased: every pixel is either the colour it
 * was painted or not, so a fill never leaves a halo round a line the way it does in a picture drawn
 * with antialiasing.
 */
it('fills the enclosed region and stops at its edge', () => {
  const image = blankImage(5, 5);
  // A black box round the centre pixel.
  for (const [x, y] of [
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 2],
    [3, 2],
    [1, 3],
    [2, 3],
    [3, 3],
  ]) {
    stamp(image, x, y, 1, BLACK);
  }
  expect(floodFill(image, 2, 2, RED)).to.equal(1);
  expect(pixelAt(image, 2, 2)).to.deep.equal(RED);
  expect(pixelAt(image, 0, 0), 'outside the box').to.deep.equal(WHITE);

  expect(floodFill(image, 0, 0, RED), 'the ring of white round the box').to.equal(16);
  expect(pixelAt(image, 4, 4)).to.deep.equal(RED);
  expect(pixelAt(image, 1, 1), 'the box itself').to.deep.equal(BLACK);
});

it('does nothing when filling a region with its own colour', () => {
  const image = blankImage(2, 2);
  expect(floodFill(image, 0, 0, WHITE)).to.equal(0);
});

it('ignores a fill outside the picture', () => {
  const image = blankImage(2, 2);
  expect(floodFill(image, 5, 5, RED)).to.equal(0);
});

/**
 * Undo keeps whole copies of the picture, so its depth is set by memory rather than a fixed count:
 * twenty copies of a small sketch cost nothing, twenty of a 4,000-pixel photograph are gigabytes.
 */
it('keeps fewer undo steps for a larger picture, and always at least one', async () => {
  const { undoDepthFor } = await import('./constants.js');
  expect(undoDepthFor(480, 300)).to.equal(20);
  expect(undoDepthFor(4000, 3000)).to.be.lessThan(20).and.at.least(1);
  expect(undoDepthFor(20000, 20000)).to.equal(1);
});

/**
 * Resizing the picture: anchored at the top left, growing into a fill colour and shrinking by
 * cropping, as MS Paint's canvas handles do. Nothing that stays inside both sizes moves.
 */
describe('resizing', () => {
  it('grows into the fill colour and keeps every pixel it had', () => {
    const image = blankImage(2, 2);
    stamp(image, 1, 1, 1, BLACK);
    const grown = resizeImage(image, 4, 3, RED);
    expect([grown.width, grown.height]).to.deep.equal([4, 3]);
    expect(pixelAt(grown, 1, 1)).to.deep.equal(BLACK);
    expect(pixelAt(grown, 0, 0)).to.deep.equal(WHITE);
    expect(pixelAt(grown, 3, 0), 'new columns').to.deep.equal(RED);
    expect(pixelAt(grown, 0, 2), 'new rows').to.deep.equal(RED);
  });

  it('crops from the right and the bottom', () => {
    const image = blankImage(3, 3);
    stamp(image, 0, 0, 1, BLACK);
    stamp(image, 2, 2, 1, RED);
    const cropped = resizeImage(image, 1, 1, WHITE);
    expect([cropped.width, cropped.height]).to.deep.equal([1, 1]);
    expect(pixelAt(cropped, 0, 0)).to.deep.equal(BLACK);
  });

  it('leaves the original alone', () => {
    const image = blankImage(2, 2);
    resizeImage(image, 5, 5, RED);
    expect([image.width, image.height, image.data.length]).to.deep.equal([2, 2, 16]);
  });
});
