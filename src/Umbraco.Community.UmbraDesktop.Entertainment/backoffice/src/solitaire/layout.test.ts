import { expect } from '@open-wc/testing';
import { cardPositions, computeLayout, fanOffsets } from './layout.js';
import {
  CARD_MAX_WIDTH_PX,
  CARD_MIN_WIDTH_PX,
  CARD_RATIO,
  FAN_DOWN_RATIO,
  FAN_UP_MIN_RATIO,
  FAN_UP_RATIO,
  SOLITAIRE_CONTENT_SIZE,
  SOLITAIRE_MIN_CONTENT_SIZE,
  WASTE_FAN_RATIO,
} from './constants.js';
import { deal } from './rules.js';

describe('solitaire layout', () => {
  it('opens at the default card width in the default content box', () => {
    const layout = computeLayout(SOLITAIRE_CONTENT_SIZE.w, SOLITAIRE_CONTENT_SIZE.h);
    expect(Math.round(layout.cardW)).to.equal(100);
    expect(layout.cardH).to.be.closeTo(layout.cardW * CARD_RATIO, 0.001);
  });

  it('never goes below the minimum or above the maximum card width', () => {
    expect(computeLayout(200, 200).cardW).to.equal(CARD_MIN_WIDTH_PX);
    expect(computeLayout(4000, 3000).cardW).to.equal(CARD_MAX_WIDTH_PX);
    expect(computeLayout(SOLITAIRE_MIN_CONTENT_SIZE.w, SOLITAIRE_MIN_CONTENT_SIZE.h).cardW)
      .to.be.closeTo(CARD_MIN_WIDTH_PX, 0.5);
  });

  it('is limited by the height when the window is wide and short', () => {
    const wide = computeLayout(2000, SOLITAIRE_CONTENT_SIZE.h);
    expect(wide.cardW).to.be.lessThan(CARD_MAX_WIDTH_PX);
  });

  it('centres the seven columns', () => {
    const layout = computeLayout(1200, 900);
    const first = layout.slot('t0').x;
    const last = layout.slot('t6').x + layout.cardW;
    expect(first).to.be.closeTo(1200 - last, 0.5);
  });

  it('centres even when width-limited', () => {
    const layout = computeLayout(SOLITAIRE_CONTENT_SIZE.w, 2000);
    const first = layout.slot('t0').x;
    const last = layout.slot('t6').x + layout.cardW;
    expect(first).to.be.closeTo(SOLITAIRE_CONTENT_SIZE.w - last, 0.5);
  });

  it('fans face-down cards tighter than face-up ones', () => {
    const offsets = fanOffsets(
      [{ faceUp: false }, { faceUp: false }, { faceUp: true }, { faceUp: true }],
      140,
      10000,
    );
    expect(offsets).to.deep.equal([
      0,
      140 * FAN_DOWN_RATIO,
      140 * FAN_DOWN_RATIO * 2,
      140 * FAN_DOWN_RATIO * 2 + 140 * FAN_UP_RATIO,
    ]);
  });

  it('compresses a long column to fit, but never below the minimum step', () => {
    const column = Array.from({ length: 13 }, () => ({ faceUp: true }));
    const tight = fanOffsets(column, 140, 400);
    expect(tight[12] + 140).to.be.at.most(400.001);
    const floor = fanOffsets(column, 140, 150);
    expect(floor[1]).to.be.closeTo(140 * FAN_UP_MIN_RATIO, 0.001);
  });

  it('places all 52 cards, each exactly once', () => {
    const layout = computeLayout(SOLITAIRE_CONTENT_SIZE.w, SOLITAIRE_CONTENT_SIZE.h);
    const positions = cardPositions(deal(1, (c) => [...c]), layout);
    expect(positions.size).to.equal(52);
    const ace = positions.get('1S')!;
    expect(ace.x).to.equal(layout.slot('t0').x);
    expect(ace.y).to.equal(layout.slot('t0').y);
  });

  it('fans Draw 3 waste: top card offset Math.min(3, waste.length) positions from left', () => {
    const layout = computeLayout(SOLITAIRE_CONTENT_SIZE.w, SOLITAIRE_CONTENT_SIZE.h);
    const wasteX = layout.slot('waste').x;
    const step = layout.cardW * WASTE_FAN_RATIO;

    // Use deal() to get real cards, then override waste.
    const game = deal(3, (c) => [...c]);

    // Draw 3 with 1 waste card: only card, at offset 0.
    const pos1 = cardPositions({ ...game, waste: [game.stock[0]] }, layout);
    expect(pos1.get(game.stock[0].id)!.x).to.be.closeTo(wasteX + 0 * step, 0.1);

    // Draw 3 with 2 waste cards: top at offset 1.
    const pos2 = cardPositions({ ...game, waste: [game.stock[0], game.stock[1]] }, layout);
    expect(pos2.get(game.stock[1].id)!.x).to.be.closeTo(wasteX + 1 * step, 0.1);

    // Draw 3 with 5 waste cards: top at offset 2 (capped by Math.min(3, 5) = 3 visible).
    const pos5 = cardPositions(
      { ...game, waste: [game.stock[0], game.stock[1], game.stock[2], game.stock[3], game.stock[4]] },
      layout,
    );
    expect(pos5.get(game.stock[4].id)!.x).to.be.closeTo(wasteX + 2 * step, 0.1);

    // Draw 1: top card always at offset 0.
    const pos1d = cardPositions({ ...game, drawCount: 1, waste: [game.stock[0]] }, layout);
    expect(pos1d.get(game.stock[0].id)!.x).to.be.closeTo(wasteX + 0 * step, 0.1);
  });
});
