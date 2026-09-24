import { expect } from '@open-wc/testing';
import { handAngles, msUntilNextSecond } from './hands.js';

/**
 * The geometry of an analogue face, as plain numbers. Angles are degrees clockwise from twelve,
 * which is what an SVG `rotate()` about the centre takes.
 */

it('points every hand at twelve at midnight and noon', () => {
  expect(handAngles(new Date(2026, 0, 1, 0, 0, 0))).to.deep.equal({ hour: 0, minute: 0, second: 0 });
  expect(handAngles(new Date(2026, 0, 1, 12, 0, 0))).to.deep.equal({ hour: 0, minute: 0, second: 0 });
});

it('points the hour hand at three at three o’clock', () => {
  expect(handAngles(new Date(2026, 0, 1, 15, 0, 0)).hour).to.equal(90);
});

/**
 * The hour hand creeps and the minute hand sweeps, as on a real clock. An hour hand that jumped from
 * one numeral to the next on the hour would put half past six exactly on the six, which no clock
 * face does and every reader would notice.
 */
it('moves the hour and minute hands between their marks', () => {
  const angles = handAngles(new Date(2026, 0, 1, 6, 30, 15));
  expect(angles.hour, 'half way from six to seven, plus a quarter minute').to.be.closeTo(195.125, 1e-9);
  expect(angles.minute, 'half way round, plus a quarter of a minute').to.be.closeTo(181.5, 1e-9);
  expect(angles.second, 'fifteen seconds is a quarter turn').to.equal(90);
});

/**
 * The second hand ticks rather than sweeps: it reads whole seconds only. A sweeping one would need a
 * frame loop for a hand nobody watches, where a ticking one needs one timer a second.
 */
it('ticks the second hand on whole seconds', () => {
  expect(handAngles(new Date(2026, 0, 1, 0, 0, 15, 999)).second).to.equal(90);
});

/**
 * A timer that fires every 1000ms from whenever the window opened is up to a second behind the real
 * second, and drifts. Waiting for the next boundary first is what keeps the face and the taskbar
 * clock turning over together.
 */
it('waits until the next whole second, never zero', () => {
  expect(msUntilNextSecond(new Date(2026, 0, 1, 0, 0, 0, 250))).to.equal(750);
  expect(msUntilNextSecond(new Date(2026, 0, 1, 0, 0, 0, 0)), 'already on one: the next').to.equal(1000);
});
