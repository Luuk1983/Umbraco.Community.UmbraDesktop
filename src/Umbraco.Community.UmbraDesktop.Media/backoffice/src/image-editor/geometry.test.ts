import { expect } from '@open-wc/testing';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEPS,
  constrainCrop,
  fitZoom,
  flip,
  linkedResize,
  orientPoint,
  orientedSize,
  presetSizes,
  ratioFor,
  rotate,
  stepZoom,
} from './geometry.js';
import { initialState, outputSize } from './state.js';
import type { EditorState, Mark } from './state.js';

/**
 * The editor's geometry, as pure functions over its state: rotate and flip move the crop, the marks
 * and the regions with the picture; crops keep a ratio and stay inside it; a linked resize keeps the
 * proportions; zoom fits and steps. Design §4.1 and §4.2.
 */

/** A 600 × 400 picture cropped to its top left quarter, with one arrow and one region. */
function cropped(): EditorState {
  const arrow: Mark = { id: 'm1', kind: 'arrow', colour: '#d42054', width: 4, data: { from: { x: 10, y: 20 }, to: { x: 100, y: 50 } } };
  return {
    ...initialState({ w: 600, h: 400 }),
    crop: { x: 0, y: 0, w: 300, h: 200 },
    marks: [arrow],
    regions: [{ id: 'r1', style: 'pixelate', strength: 8, rect: { x: 50, y: 60, w: 40, h: 30 } }],
  };
}

describe('orientation', () => {
  it('swaps the sides for a quarter turn', () => {
    expect(orientedSize({ w: 6000, h: 4000 }, 90)).to.deep.equal({ w: 4000, h: 6000 });
    expect(orientedSize({ w: 6000, h: 4000 }, 180)).to.deep.equal({ w: 6000, h: 4000 });
    expect(orientedSize({ w: 6000, h: 4000 }, 270)).to.deep.equal({ w: 4000, h: 6000 });
  });

  it('turns the crop with the picture', () => {
    const turned = rotate(cropped(), 'right');
    expect(turned.rotation).to.equal(90);
    expect(turned.crop).to.deep.equal({ x: 200, y: 0, w: 200, h: 300 });
    expect(rotate(cropped(), 'left').rotation).to.equal(270);
    expect(rotate(cropped(), 'left').crop).to.deep.equal({ x: 0, y: 300, w: 200, h: 300 });
  });

  it('comes back to where it started after four turns, either way', () => {
    let state = cropped();
    for (let i = 0; i < 4; i++) state = rotate(state, 'right');
    expect(state).to.deep.equal(cropped());
    expect(rotate(rotate(cropped(), 'right'), 'left')).to.deep.equal(cropped());
  });

  it('flips the crop with the picture, and flipping twice changes nothing', () => {
    expect(flip(cropped(), 'h').crop).to.deep.equal({ x: 300, y: 0, w: 300, h: 200 });
    expect(flip(cropped(), 'h').flipH).to.equal(true);
    expect(flip(cropped(), 'v').crop).to.deep.equal({ x: 0, y: 200, w: 300, h: 200 });
    expect(flip(flip(cropped(), 'h'), 'h')).to.deep.equal(cropped());
  });

  it('moves the marks and regions the same way', () => {
    const turned = rotate(cropped(), 'right');
    const arrow = turned.marks[0] as Extract<Mark, { kind: 'arrow' }>;
    expect(arrow.data.from).to.deep.equal({ x: 380, y: 10 });
    expect(arrow.data.to).to.deep.equal({ x: 350, y: 100 });
    expect(turned.regions[0].rect).to.deep.equal({ x: 310, y: 50, w: 30, h: 40 });
    const flipped = flip(cropped(), 'h');
    expect((flipped.marks[0] as Extract<Mark, { kind: 'arrow' }>).data.from).to.deep.equal({ x: 590, y: 20 });
  });

  it('turns a pending resize with the picture', () => {
    const resized = { ...cropped(), size: { w: 150, h: 100 } };
    expect(rotate(resized, 'right').size).to.deep.equal({ w: 100, h: 150 });
  });

  it('never changes the state it was given', () => {
    const state = cropped();
    const before = JSON.stringify(state);
    rotate(state, 'right');
    flip(state, 'v');
    expect(JSON.stringify(state)).to.equal(before);
  });

  it('records a flip after a turn in the turned picture, so the two still compose', () => {
    // A quarter turn after a horizontal flip is a vertical flip after the turn.
    const state = rotate(flip(initialState({ w: 600, h: 400 }), 'h'), 'right');
    expect(state.rotation).to.equal(90);
    expect(state.flipH).to.equal(false);
    expect(state.flipV).to.equal(true);
  });
});

describe('crop ratios', () => {
  it('reads each ratio for the orientation asked', () => {
    expect(ratioFor('16:9', 'portrait', { w: 600, h: 400 })).to.equal(9 / 16);
    expect(ratioFor('16:9', 'landscape', { w: 600, h: 400 })).to.equal(16 / 9);
    expect(ratioFor('4:3', 'landscape', { w: 600, h: 400 })).to.equal(4 / 3);
    expect(ratioFor('1:1', 'portrait', { w: 600, h: 400 })).to.equal(1);
    expect(ratioFor('original', 'landscape', { w: 600, h: 400 })).to.equal(1.5);
    expect(ratioFor('original', 'portrait', { w: 600, h: 400 })).to.equal(400 / 600);
    expect(ratioFor('free', 'landscape', { w: 600, h: 400 })).to.equal(null);
  });

  it('keeps a crop inside the picture, at its ratio, round its centre', () => {
    const square = constrainCrop({ x: 500, y: 300, w: 400, h: 400 }, { w: 600, h: 400 }, 1);
    expect(square.w).to.equal(square.h);
    expect(square.x).to.be.at.least(0);
    expect(square.y).to.be.at.least(0);
    expect(square.x + square.w).to.be.at.most(600);
    expect(square.y + square.h).to.be.at.most(400);
  });

  it('keeps a free crop as drawn when it fits, and at least a pixel', () => {
    expect(constrainCrop({ x: 10, y: 10, w: 100, h: 50 }, { w: 600, h: 400 }, null)).to.deep.equal({ x: 10, y: 10, w: 100, h: 50 });
    const tiny = constrainCrop({ x: 10, y: 10, w: 0, h: 0 }, { w: 600, h: 400 }, null);
    expect(tiny.w).to.equal(1);
    expect(tiny.h).to.equal(1);
  });

  it('holds a 16:9 crop to its ratio within a pixel', () => {
    const wide = constrainCrop({ x: 0, y: 0, w: 600, h: 400 }, { w: 600, h: 400 }, 16 / 9);
    expect(Math.abs(wide.w / wide.h - 16 / 9)).to.be.below(0.01);
    expect(wide.w).to.equal(600);
  });
});

describe('resize', () => {
  it('keeps the proportions while linked, and not when unlinked', () => {
    expect(linkedResize({ w: 4000, h: 3000 }, { w: 1920 }, true)).to.deep.equal({ w: 1920, h: 1440 });
    expect(linkedResize({ w: 4000, h: 3000 }, { w: 1920 }, false)).to.deep.equal({ w: 1920, h: 3000 });
    expect(linkedResize({ w: 4000, h: 3000 }, { h: 1500 }, true)).to.deep.equal({ w: 2000, h: 1500 });
    expect(linkedResize({ w: 4000, h: 3000 }, { w: 0 }, true).w).to.equal(1);
  });

  it('offers the common widths only when they shrink the picture', () => {
    const presets = presetSizes({ w: 1600, h: 1200 });
    const byKey = Object.fromEntries(presets.map((preset) => [preset.key, preset]));
    expect(presets.map((preset) => preset.key)).to.deep.equal(['2560', '1920', '1280', '800', 'half']);
    expect(byKey['2560'].enabled).to.equal(false);
    expect(byKey['1920'].enabled).to.equal(false);
    expect(byKey['1280'].enabled).to.equal(true);
    expect(byKey['1280'].size).to.deep.equal({ w: 1280, h: 960 });
    expect(byKey['800'].enabled).to.equal(true);
    expect(byKey.half).to.deep.equal({ key: 'half', size: { w: 800, h: 600 }, enabled: true });
  });
});

describe('zoom', () => {
  it('fits a picture into the view, never above 100%', () => {
    expect(fitZoom({ w: 6000, h: 4000 }, { w: 600, h: 400 })).to.equal(0.1);
    expect(fitZoom({ w: 200, h: 100 }, { w: 600, h: 400 })).to.equal(1);
    expect(fitZoom({ w: 100000, h: 100 }, { w: 600, h: 400 })).to.equal(MIN_ZOOM);
  });

  it('steps through its zoom levels and stops at either end', () => {
    expect(ZOOM_STEPS[0]).to.equal(MIN_ZOOM);
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).to.equal(MAX_ZOOM);
    expect(stepZoom(1, 1)).to.be.greaterThan(1);
    expect(stepZoom(1, -1)).to.be.lessThan(1);
    expect(stepZoom(0.1, 1), 'from the fit to the next level up').to.be.greaterThan(0.1);
    expect(stepZoom(0.123, -1)).to.equal(0.1);
    expect(stepZoom(MAX_ZOOM, 1)).to.equal(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).to.equal(MIN_ZOOM);
  });
});

describe('the picture as saved', () => {
  it('is the cropped size, or the resize when one is set', () => {
    expect(outputSize(initialState({ w: 600, h: 400 }))).to.deep.equal({ w: 600, h: 400 });
    expect(outputSize(cropped())).to.deep.equal({ w: 300, h: 200 });
    expect(outputSize({ ...cropped(), size: { w: 150, h: 100 } })).to.deep.equal({ w: 150, h: 100 });
    expect(outputSize(rotate(initialState({ w: 600, h: 400 }), 'right'))).to.deep.equal({ w: 400, h: 600 });
  });
});

describe('a point of the upright picture, turned', () => {
  it('lands where the turn and the flips put it', () => {
    const state = initialState({ w: 600, h: 400 });
    expect(orientPoint(state, { x: 10, y: 20 })).to.deep.equal({ x: 10, y: 20 });
    expect(orientPoint(rotate(state, 'right'), { x: 10, y: 20 })).to.deep.equal({ x: 380, y: 10 });
    expect(orientPoint(flip(state, 'h'), { x: 10, y: 20 })).to.deep.equal({ x: 590, y: 20 });
    expect(orientPoint(rotate(flip(state, 'h'), 'right'), { x: 10, y: 20 })).to.deep.equal({ x: 380, y: 590 });
  });
});
