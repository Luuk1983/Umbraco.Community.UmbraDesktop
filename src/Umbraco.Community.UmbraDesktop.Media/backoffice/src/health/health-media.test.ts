import { expect } from '@open-wc/testing';
import { PREVIEW_STEP, THUMB_EDGE, isPreviewable, previewWidth, thumbEdge } from './health-media.js';

/**
 * Thumbnails and the preview are Umbraco's image resizer on the item's own file (design §16.7), at a
 * few sizes, so the resizer's cache answers the next ask. The URLs themselves are signed on the
 * server, since a site with an HMAC secret refuses an unsigned one (§16.10).
 */

describe('thumbnails', () => {
  it('are asked for at the thumbnail edge times the pixel ratio', () => {
    expect(THUMB_EDGE).to.equal(120);
    expect(thumbEdge(2)).to.equal(240);
    expect(thumbEdge(1.5)).to.equal(180);
  });
});

describe('the preview', () => {
  it('rounds the width up to a step, so a few sizes cover every window', () => {
    expect(PREVIEW_STEP).to.equal(400);
    expect(previewWidth(700, 2)).to.equal(1600);
    expect(previewWidth(400, 1)).to.equal(400);
    expect(previewWidth(100, 1)).to.equal(400);
  });

  it('draws raster images only, never an SVG, and nothing without a file', () => {
    expect(isPreviewable('/media/a/x.JPG')).to.equal(true);
    expect(isPreviewable('photo.webp')).to.equal(true);
    expect(isPreviewable('/media/a/x.svg')).to.equal(false);
    expect(isPreviewable('notes.pdf')).to.equal(false);
    expect(isPreviewable('no-extension')).to.equal(false);
    expect(isPreviewable(null)).to.equal(false);
  });
});
