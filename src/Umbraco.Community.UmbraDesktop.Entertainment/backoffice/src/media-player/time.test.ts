import { expect } from '@open-wc/testing';
import { formatClock, isLiveDuration } from './time.js';

describe('media player time helpers', () => {
  it('formats minutes and seconds as m:ss', () => {
    expect(formatClock(0)).to.equal('0:00');
    expect(formatClock(9)).to.equal('0:09');
    expect(formatClock(728)).to.equal('12:08');
    expect(formatClock(3019)).to.equal('50:19');
  });

  it('adds hours only when there are some', () => {
    expect(formatClock(3600)).to.equal('1:00:00');
    expect(formatClock(3725.9)).to.equal('1:02:05');
  });

  it('shows anything that is not a sensible position as 0:00', () => {
    expect(formatClock(-4)).to.equal('0:00');
    expect(formatClock(Number.NaN)).to.equal('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).to.equal('0:00');
  });

  it('treats a duration of zero, infinity or nothing as a live stream', () => {
    expect(isLiveDuration(0)).to.equal(true);
    expect(isLiveDuration(Number.POSITIVE_INFINITY)).to.equal(true);
    expect(isLiveDuration(Number.NaN)).to.equal(true);
    expect(isLiveDuration(3019)).to.equal(false);
  });
});
