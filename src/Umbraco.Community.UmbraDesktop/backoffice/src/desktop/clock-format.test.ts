import { expect } from '@open-wc/testing';
import { clockLocale, formatClock, formatDateTime, msUntilNextMinute } from './clock-format.js';

/**
 * The whole matrix, without a taskbar.
 *
 * Midnight and noon are in here deliberately: they are where an hour cycle actually differs, and
 * where 12-hour formatting stops being "the same number minus twelve". The 24-hour cases are the
 * ones that catch a padding rule applied to the wrong cycle.
 *
 * Exact strings for the cultures this package can reason about, and a shape assertion for Japanese
 * and Korean — there the point is *where the culture puts the marker*, which is what overriding the
 * hour cycle preserves and substituting an English locale would have thrown away. Asserting their
 * exact glyphs would make a CLDR wording change look like a regression here.
 */
const midnight = new Date(2026, 0, 5, 0, 5);
const noon = new Date(2026, 0, 5, 12, 5);
const afternoon = new Date(2026, 0, 5, 14, 30);

/** A backoffice on the culture a default Umbraco install stamps. */
const locales = { backoffice: 'en-us' };

it('formats with the backoffice culture', () => {
  expect(formatClock(afternoon, { source: 'backoffice', hourCycle: 'auto' }, locales)).to.equal('2:30 PM');
});

it('formats with the browser culture', () => {
  // The one expectation that cannot be a literal: the runtime default is whatever Chrome is running
  // as, so a literal would pass on a Dutch machine and fail elsewhere. What is actually being
  // asserted is that the backoffice culture was ignored, which the second half pins down.
  const runtime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(afternoon);
  expect(formatClock(afternoon, { source: 'browser', hourCycle: 'auto' }, locales)).to.equal(runtime);
  expect(formatClock(afternoon, { source: 'browser', hourCycle: 'h23' }, locales)).to.equal('14:30');
});

it('forces 24 hour without giving up the culture', () => {
  expect(formatClock(afternoon, { source: 'backoffice', hourCycle: 'h23' }, locales)).to.equal('14:30');
});

it('forces 12 hour without giving up the culture', () => {
  // Dutch spells the meridiem its own way. Substituting an English locale to get 12 hour would
  // have lost that, along with Danish's dot separator.
  expect(formatClock(afternoon, { source: 'backoffice', hourCycle: 'h12' }, { backoffice: 'nl' })).to.equal(
    '2:30 p.m.',
  );
  expect(formatClock(afternoon, { source: 'backoffice', hourCycle: 'h23' }, { backoffice: 'da' })).to.equal('14.30');
});

it('pads the hour on a 24 hour clock and does not on a 12 hour one', () => {
  // Derived from the resolved cycle rather than typed per option. A 12-hour clock reading
  // "02:30 PM" is not one any OS ships, and this package shipped one.
  expect(formatClock(midnight, { source: 'backoffice', hourCycle: 'auto' }, { backoffice: 'nl' })).to.equal('00:05');
  expect(formatClock(midnight, { source: 'backoffice', hourCycle: 'auto' }, locales)).to.equal('12:05 AM');
});

it('calls noon PM and midnight AM', () => {
  expect(formatClock(noon, { source: 'backoffice', hourCycle: 'auto' }, locales)).to.equal('12:05 PM');
  expect(formatClock(midnight, { source: 'backoffice', hourCycle: 'h12' }, locales)).to.equal('12:05 AM');
});

it('keeps a regional backoffice culture regional', () => {
  // en-GB survives because the localization registry keeps the region: documentLanguage is
  // Intl.Locale(...).baseName, not the bare language. Reaching this needs DefaultUILanguage
  // configured to it, since Umbraco's own picker offers only "en" and "en-us" for English.
  expect(formatClock(afternoon, { source: 'backoffice', hourCycle: 'auto' }, { backoffice: 'en-gb' })).to.equal(
    '14:30',
  );
});

it('leaves the meridiem where the culture puts it', () => {
  // Korean puts its marker first, Japanese uses its own words for it. Neither should come out
  // looking like English just because the user asked for 12 hour.
  expect(formatClock(afternoon, { source: 'backoffice', hourCycle: 'h12' }, { backoffice: 'ko' })).to.match(/^\D/);
  expect(formatClock(afternoon, { source: 'backoffice', hourCycle: 'h12' }, { backoffice: 'ja' })).to.not.match(
    /AM|PM/,
  );
});

it('falls back to the runtime default when the backoffice culture is not known yet', () => {
  // The current user arrives after first paint. A clock that threw, or that rendered nothing until
  // the request came back, would flash an empty taskbar on every boot.
  expect(clockLocale({ source: 'backoffice', hourCycle: 'auto' }, {})).to.equal(undefined);
  expect(formatClock(afternoon, { source: 'backoffice', hourCycle: 'auto' }, {})).to.be.a('string');
});

it('asks for the runtime default rather than a named locale for the browser', () => {
  // undefined is what "use the runtime default" means to Intl, and it is what the old
  // toLocaleTimeString([]) meant too, so choosing this option changes nobody's clock.
  expect(clockLocale({ source: 'browser', hourCycle: 'auto' }, locales)).to.equal(undefined);
});

it('waits until the next whole minute, never zero and never more than one', () => {
  // The taskbar sits beside the operating system's own clock, so the two have to turn over
  // together. A fixed interval cannot do that at any frequency: it turns the minute over wherever
  // it happens to be in its cycle.
  expect(msUntilNextMinute(new Date(2026, 0, 5, 14, 30, 0, 0))).to.equal(60000);
  expect(msUntilNextMinute(new Date(2026, 0, 5, 14, 30, 0, 1))).to.equal(59999);
  expect(msUntilNextMinute(new Date(2026, 0, 5, 14, 30, 30, 0))).to.equal(30000);
  expect(msUntilNextMinute(new Date(2026, 0, 5, 14, 30, 59, 999))).to.equal(1);
});

it('never asks for a wait of zero, which would busy-loop the timer', () => {
  for (let second = 0; second < 60; second += 1) {
    for (const ms of [0, 1, 500, 999]) {
      const wait = msUntilNextMinute(new Date(2026, 0, 5, 14, 30, second, ms));
      expect(wait, `${second}.${ms}`).to.be.greaterThan(0);
      expect(wait, `${second}.${ms}`).to.be.at.most(60000);
    }
  }
});

it('measures from the moment it is given, so a late timer corrects itself', () => {
  // A timer that fires late — a throttled background tab, a laptop waking up — re-arms from a
  // fresh reading rather than from when it meant to fire, so the error does not accumulate.
  const late = new Date(2026, 0, 5, 14, 31, 7, 250);
  expect(msUntilNextMinute(late)).to.equal(52750);
});

/**
 * The same rules for any time or date an app shows, not only the taskbar's hours and minutes: this
 * is what the settings context publishes to apps (see `docs/desktop-apps.md`), so a clock app with
 * seconds reads exactly as the taskbar does.
 */
describe('formatDateTime', () => {
  const withSeconds: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };

  it('applies the hour override to a time with seconds', () => {
    expect(formatDateTime(afternoon, { source: 'backoffice', hourCycle: 'h23' }, locales, withSeconds)).to.equal('14:30:00');
    expect(formatDateTime(afternoon, { source: 'backoffice', hourCycle: 'h12' }, locales, withSeconds)).to.equal('2:30:00 PM');
  });

  it('pads a 24-hour hour and not a 12-hour one, as the taskbar does', () => {
    const early = new Date(2026, 0, 5, 9, 5, 7);
    expect(formatDateTime(early, { source: 'backoffice', hourCycle: 'h23' }, locales, withSeconds)).to.equal('09:05:07');
    expect(formatDateTime(early, { source: 'backoffice', hourCycle: 'h12' }, locales, withSeconds)).to.equal('9:05:07 AM');
  });

  it('leaves a date with no time in it to the culture', () => {
    const dateOnly: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    expect(formatDateTime(afternoon, { source: 'backoffice', hourCycle: 'h23' }, locales, dateOnly)).to.equal(
      'Monday, January 5, 2026',
    );
  });

  it('is what formatClock is, for hours and minutes', () => {
    for (const hourCycle of ['auto', 'h12', 'h23'] as const) {
      expect(formatClock(midnight, { source: 'backoffice', hourCycle }, locales)).to.equal(
        formatDateTime(midnight, { source: 'backoffice', hourCycle }, locales, { hour: 'numeric', minute: '2-digit' }),
      );
    }
  });
});
