import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_ALL_SERVER_ROLES,
  UMBRADESKTOP_CLOCK_INTERVAL_MS,
  UMBRADESKTOP_DEFAULT_REFRESH_INTERVAL_MS,
  UMBRADESKTOP_REFRESH_INTERVALS_MS,
  describeNextRun,
  formatPeriod,
  groupJobsByKind,
  runsOnAnyServer,
  toRelativeTime,
} from './background-jobs-format';
import type { BackgroundJobResponseModel } from '../../api/types.gen';

function job(over: Partial<BackgroundJobResponseModel> = {}): BackgroundJobResponseModel {
  return {
    name: 'AJob',
    typeName: 'Some.Namespace.AJob',
    kind: 'Recurring',
    state: 'Idle',
    lastOutcome: 'Succeeded',
    serverRoles: [],
    ...over,
  };
}

/** A fixed clock, so a relative-time expectation never depends on when the suite runs. */
const now = new Date('2026-09-06T12:00:00Z');

/** `now` shifted by `seconds` (negative for the past), as the timestamps in a report would be. */
function at(seconds: number): Date {
  return new Date(now.getTime() + seconds * 1000);
}

describe('formatPeriod', () => {
  it('renders an en dash when there is no period', () => {
    expect(formatPeriod(null)).to.equal('–');
    expect(formatPeriod(undefined)).to.equal('–');
  });

  it('renders sub-minute periods in seconds', () => {
    expect(formatPeriod(10)).to.equal('10s');
    expect(formatPeriod(59)).to.equal('59s');
  });

  it('steps up a unit exactly on the boundary', () => {
    expect(formatPeriod(60)).to.equal('1m');
    expect(formatPeriod(3600)).to.equal('1h');
    expect(formatPeriod(86400)).to.equal('1d');
  });

  it('renders the larger units', () => {
    expect(formatPeriod(300)).to.equal('5m');
    expect(formatPeriod(14400)).to.equal('4h');
  });
});

describe('toRelativeTime', () => {
  it('reports the present as zero seconds rather than a rounded minute', () => {
    expect(toRelativeTime(at(0), now)).to.deep.equal({ value: 0, unit: 'second' });
  });

  it('signs the past negative and the future positive', () => {
    expect(toRelativeTime(at(-6), now)).to.deep.equal({ value: -6, unit: 'second' });
    expect(toRelativeTime(at(4), now)).to.deep.equal({ value: 4, unit: 'second' });
  });

  it('holds seconds right up to the minute boundary, then steps up', () => {
    expect(toRelativeTime(at(-59), now)).to.deep.equal({ value: -59, unit: 'second' });
    expect(toRelativeTime(at(-60), now)).to.deep.equal({ value: -1, unit: 'minute' });
  });

  it('rounds the magnitude, so the past and the future round the same way', () => {
    // Math.round(-1.5) is -1 but Math.round(1.5) is 2; a job 90 seconds late and one due in
    // 90 seconds must not be described as different distances from now.
    expect(toRelativeTime(at(-90), now)).to.deep.equal({ value: -2, unit: 'minute' });
    expect(toRelativeTime(at(90), now)).to.deep.equal({ value: 2, unit: 'minute' });
  });

  it('steps up to hours and days on their boundaries', () => {
    expect(toRelativeTime(at(-3540), now)).to.deep.equal({ value: -59, unit: 'minute' });
    expect(toRelativeTime(at(-3600), now)).to.deep.equal({ value: -1, unit: 'hour' });
    expect(toRelativeTime(at(-86400), now)).to.deep.equal({ value: -1, unit: 'day' });
  });

  it('never rounds up into a unit it has already rejected', () => {
    // 59.5 minutes rounds to 60 minutes, which must be reported as an hour rather than as
    // "60 minutes", and 23.9 hours as a day rather than "24 hours".
    expect(toRelativeTime(at(-3570), now)).to.deep.equal({ value: -1, unit: 'hour' });
    expect(toRelativeTime(at(-86000), now)).to.deep.equal({ value: -1, unit: 'day' });
  });

  it('keeps counting in days beyond one', () => {
    expect(toRelativeTime(at(-86400 * 3), now)).to.deep.equal({ value: -3, unit: 'day' });
  });
});

describe('refresh intervals', () => {
  it('offers the default as one of the choices', () => {
    // The picker marks the current interval as active by identity, so a default outside the list
    // would render a control with nothing selected.
    expect(UMBRADESKTOP_REFRESH_INTERVALS_MS).to.include(UMBRADESKTOP_DEFAULT_REFRESH_INTERVAL_MS);
  });

  it('makes every interval a whole multiple of the clock tick', () => {
    // The poll fires on every Nth clock tick, so an interval that is not a multiple of the tick
    // (1500ms, say) would never come up and the view would silently stop refreshing.
    for (const interval of UMBRADESKTOP_REFRESH_INTERVALS_MS) {
      expect(interval % UMBRADESKTOP_CLOCK_INTERVAL_MS, `${interval}ms`).to.equal(0);
      expect(interval, `${interval}ms`).to.be.at.least(UMBRADESKTOP_CLOCK_INTERVAL_MS);
    }
  });

  it('lists the intervals fastest first', () => {
    const sorted = [...UMBRADESKTOP_REFRESH_INTERVALS_MS].sort((a, b) => a - b);
    expect(UMBRADESKTOP_REFRESH_INTERVALS_MS).to.deep.equal(sorted);
  });
});

describe('describeNextRun', () => {
  /** The staleness the report is rendered through: one poll interval. */
  const tolerance = 5000;

  it('reports a job due within the tolerance as due, in either direction', () => {
    // The report is a snapshot up to one poll old, so inside that window we genuinely cannot
    // tell whether the run is still coming or has already happened.
    expect(describeNextRun(at(0), now, tolerance)).to.deep.equal({ kind: 'due' });
    expect(describeNextRun(at(3), now, tolerance)).to.deep.equal({ kind: 'due' });
    expect(describeNextRun(at(-3), now, tolerance)).to.deep.equal({ kind: 'due' });
  });

  it('includes both edges of the tolerance window', () => {
    expect(describeNextRun(at(5), now, tolerance)).to.deep.equal({ kind: 'due' });
    expect(describeNextRun(at(-5), now, tolerance)).to.deep.equal({ kind: 'due' });
  });

  it('counts down normally once the run is further off than the tolerance', () => {
    expect(describeNextRun(at(6), now, tolerance)).to.deep.equal({
      kind: 'relative',
      value: 6,
      unit: 'second',
    });
    expect(describeNextRun(at(1800), now, tolerance)).to.deep.equal({
      kind: 'relative',
      value: 30,
      unit: 'minute',
    });
  });

  it('still reports a genuinely overdue run as past, so a stuck job is not hidden', () => {
    // Beyond the tolerance the lateness is real rather than an artefact of polling, and saying
    // "due now" about a job three hours late would bury exactly what the screen is for.
    expect(describeNextRun(at(-3 * 3600), now, tolerance)).to.deep.equal({
      kind: 'relative',
      value: -3,
      unit: 'hour',
    });
  });

  it('judges the window by the value it will display, not by the raw delta', () => {
    // Seen in a real screenshot: at a 10s interval a job read "Next run: 10 seconds ago" —
    // a label stating exactly the tolerance while being rendered as a countdown, because the
    // delta was a fraction over 10000ms but rounded to 10 for display. Classifying on the
    // rounded value keeps the two from ever disagreeing.
    expect(describeNextRun(at(-5.4), now, tolerance)).to.deep.equal({ kind: 'due' });
    expect(describeNextRun(at(5.4), now, tolerance)).to.deep.equal({ kind: 'due' });
    expect(describeNextRun(at(-5.6), now, tolerance)).to.deep.equal({
      kind: 'relative',
      value: -6,
      unit: 'second',
    });
  });

  it('never returns a negative countdown inside the tolerance', () => {
    // The defect this replaced: a five-second job whose next run had passed rendered as
    // "Next run: 2 seconds ago", which reads as broken rather than as normal operation.
    for (let seconds = -5; seconds <= 5; seconds++) {
      expect(describeNextRun(at(seconds), now, tolerance).kind, `at ${seconds}s`).to.equal('due');
    }
  });
});

describe('runsOnAnyServer', () => {
  it('is true only when every role Umbraco knows about is listed', () => {
    expect(runsOnAnyServer(UMBRADESKTOP_ALL_SERVER_ROLES)).to.equal(true);
  });

  it('ignores the order the roles arrive in', () => {
    expect(runsOnAnyServer([...UMBRADESKTOP_ALL_SERVER_ROLES].reverse())).to.equal(true);
  });

  it('is false when the job is restricted to some roles', () => {
    expect(runsOnAnyServer(['Single', 'SchedulingPublisher'])).to.equal(false);
  });

  it('is false for a job that declares no roles at all', () => {
    expect(runsOnAnyServer([])).to.equal(false);
  });
});

describe('groupJobsByKind', () => {
  it('splits the report into the two kinds', () => {
    const { distributed, recurring } = groupJobsByKind([
      job({ name: 'D1', kind: 'Distributed' }),
      job({ name: 'R1', kind: 'Recurring' }),
      job({ name: 'D2', kind: 'Distributed' }),
    ]);
    expect(distributed.map((j) => j.name)).to.deep.equal(['D1', 'D2']);
    expect(recurring.map((j) => j.name)).to.deep.equal(['R1']);
  });

  it('preserves the order the server sent, so the table stays sorted as the API sorted it', () => {
    const { distributed } = groupJobsByKind([
      job({ name: 'Zebra', kind: 'Distributed' }),
      job({ name: 'Alpha', kind: 'Distributed' }),
    ]);
    expect(distributed.map((j) => j.name)).to.deep.equal(['Zebra', 'Alpha']);
  });

  it('shows a kind it does not recognise rather than dropping it', () => {
    // The wire format is a string on purpose, so a kind added server-side must still appear.
    const { recurring } = groupJobsByKind([job({ name: 'Novel', kind: 'SomethingNew' })]);
    expect(recurring.map((j) => j.name)).to.deep.equal(['Novel']);
  });

  it('returns empty groups for an empty report', () => {
    const { distributed, recurring } = groupJobsByKind([]);
    expect(distributed).to.deep.equal([]);
    expect(recurring).to.deep.equal([]);
  });
});
