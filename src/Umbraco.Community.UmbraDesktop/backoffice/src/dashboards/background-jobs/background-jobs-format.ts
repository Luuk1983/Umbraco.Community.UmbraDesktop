import type { BackgroundJobResponseModel } from '../../api/types.gen';

/**
 * Every value of Umbraco's `ServerRole` enum, as the API stringifies them.
 *
 * A recurring job declares the roles it is willing to run on, and a job that lists all of them
 * is simply unrestricted. Spelling that out per row costs four words to say "no restriction",
 * so {@link runsOnAnyServer} collapses it. Kept here as the single definition of "all", because
 * the check is only meaningful against the complete set.
 */
export const UMBRADESKTOP_ALL_SERVER_ROLES: ReadonlyArray<string> = [
  'Unknown',
  'Single',
  'SchedulingPublisher',
  'Subscriber',
];

/** The kinds of job, split out of a flat report. */
export interface UmbraDesktopJobsByKind {
  /** Jobs Umbraco co-ordinates across servers and persists in the database. */
  distributed: Array<BackgroundJobResponseModel>;
  /** Jobs each server runs for itself, plus any kind this build does not recognise. */
  recurring: Array<BackgroundJobResponseModel>;
}

/** A time expressed relative to now, ready to hand to `Intl.RelativeTimeFormat`. */
export interface UmbraDesktopRelativeTime {
  /** Negative for the past, positive for the future, in whole units. */
  value: number;
  /** The coarsest unit that still describes the distance with a magnitude of at least one. */
  unit: Intl.RelativeTimeFormatUnit;
}

/**
 * How a next run should read: either "due now", when the report is too stale to say whether it has
 * happened yet, or a plain distance from now.
 */
export type UmbraDesktopNextRun =
  | { kind: 'due' }
  | ({ kind: 'relative' } & UmbraDesktopRelativeTime);

/**
 * What a cell shows when the report simply has nothing to put in it, as opposed to having
 * something worth wording. One definition so every such cell reads identically.
 */
export const NO_VALUE = '–';

/**
 * How often the displayed clock advances, in milliseconds. Every timestamp is rendered relative
 * to now, so the view has to re-render faster than it re-fetches or the countdowns would visibly
 * lag behind the wall clock between polls.
 */
export const UMBRADESKTOP_CLOCK_INTERVAL_MS = 1000;

/**
 * The refresh intervals the viewer offers, fastest first, in milliseconds.
 *
 * There is deliberately no "off". The screen is built out of live countdowns, and the tolerance
 * that keeps a next run from counting past zero is the refresh interval itself, so with nothing
 * refreshing there is no defensible tolerance and every relative time drifts without bound.
 * Switching off would therefore have to freeze the clock too, which is a second rendering mode
 * for a view whose entire subject is what is happening right now.
 *
 * Every value must be a whole multiple of {@link UMBRADESKTOP_CLOCK_INTERVAL_MS}, because the poll
 * fires on an Nth clock tick rather than on a timer of its own.
 */
export const UMBRADESKTOP_REFRESH_INTERVALS_MS: ReadonlyArray<number> = [1000, 5000, 10000];

/**
 * The interval a freshly opened viewer starts on. Ten seconds is slow enough to be unobtrusive on
 * a screen someone leaves open, and the faster choices exist for when a specific job is being
 * watched.
 */
export const UMBRADESKTOP_DEFAULT_REFRESH_INTERVAL_MS = 10000;

/** The wire value of `kind` for a distributed job. Everything else is treated as recurring. */
const DISTRIBUTED_KIND = 'Distributed';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * 60;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * 24;

/**
 * Rounds to the nearest whole number by magnitude, so a value and its negation round to
 * mirror images. `Math.round` rounds halves towards positive infinity, which would report a job
 * 90 seconds overdue as "1 minute ago" while one due in 90 seconds reads "in 2 minutes".
 * @param value The value to round.
 * @returns The value rounded away from zero on a half.
 */
function roundMagnitude(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Renders a job's period compactly, e.g. `10s`, `5m`, `4h`, `1d`.
 * @param periodSeconds The configured period, or null/undefined for a job with no schedule.
 * @returns The period, or an en dash when the job has none.
 */
export function formatPeriod(periodSeconds?: number | null): string {
  if (periodSeconds === null || periodSeconds === undefined) {
    return NO_VALUE;
  }
  if (periodSeconds < SECONDS_PER_MINUTE) {
    return `${periodSeconds}s`;
  }
  if (periodSeconds < SECONDS_PER_HOUR) {
    return `${Math.round(periodSeconds / SECONDS_PER_MINUTE)}m`;
  }
  if (periodSeconds < SECONDS_PER_DAY) {
    return `${Math.round(periodSeconds / SECONDS_PER_HOUR)}h`;
  }
  return `${Math.round(periodSeconds / SECONDS_PER_DAY)}d`;
}

/**
 * Expresses a timestamp as a distance from now, picking the coarsest unit that still has a
 * magnitude of at least one. Returning the parts rather than a string keeps the arithmetic
 * testable and leaves the wording to `UmbLocalizationController.relativeTime`, which speaks
 * the backoffice's language rather than English.
 * @param target The moment to describe.
 * @param now The moment to describe it against.
 * @returns The value and unit to format.
 * @remarks
 * Each step re-derives from seconds and re-checks the boundary, so a distance that rounds up
 * into the next unit (59.5 minutes becoming 60) is reported in that unit rather than as an
 * out-of-range count of the smaller one.
 */
export function toRelativeTime(target: Date, now: Date): UmbraDesktopRelativeTime {
  const seconds = roundMagnitude((target.getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < SECONDS_PER_MINUTE) {
    return { value: seconds, unit: 'second' };
  }

  const minutes = roundMagnitude(seconds / SECONDS_PER_MINUTE);
  if (Math.abs(minutes) < 60) {
    return { value: minutes, unit: 'minute' };
  }

  const hours = roundMagnitude(seconds / SECONDS_PER_HOUR);
  if (Math.abs(hours) < 24) {
    return { value: hours, unit: 'hour' };
  }

  return { value: roundMagnitude(seconds / SECONDS_PER_DAY), unit: 'day' };
}

/**
 * Decides how a next run should read, given that the report it came from is a snapshot rather
 * than live: within `toleranceMs` of now the answer is "due", because the run may already have
 * happened without this snapshot knowing.
 * @param nextRun When the job is next expected.
 * @param now The moment to describe it against.
 * @param toleranceMs How stale the report may be, which is one poll interval.
 * @returns Either "due now" or a distance from now.
 * @remarks
 * This exists because a countdown rendered faster than the data behind it refreshes will run past
 * zero and start reporting a *next* run in the past, which reads as a fault rather than as normal
 * operation. It is most visible on a job whose period is near the poll interval, where the run is
 * genuinely always imminent.
 *
 * The tolerance is deliberately one-sided in effect: past it, lateness is real rather than an
 * artefact of polling, so an overdue run keeps counting up and a stuck job stays visible.
 *
 * The window is judged on the rounded second that will actually be displayed rather than on the
 * raw delta. Judging the raw delta let the two disagree at the boundary: a run 10.4 seconds late,
 * at a 10 second interval, was classified as a countdown and then labelled "10 seconds ago" —
 * stating exactly the tolerance while being rendered as though it were outside it.
 */
export function describeNextRun(
  nextRun: Date,
  now: Date,
  toleranceMs: number,
): UmbraDesktopNextRun {
  const displayedSeconds = roundMagnitude((nextRun.getTime() - now.getTime()) / 1000);
  if (Math.abs(displayedSeconds) * 1000 <= toleranceMs) {
    return { kind: 'due' };
  }
  return { kind: 'relative', ...toRelativeTime(nextRun, now) };
}

/**
 * Whether a job's declared roles amount to no restriction at all.
 * @param serverRoles The roles the job declares, as stringified `ServerRole` values.
 * @returns True when every role Umbraco knows about is present.
 * @remarks
 * A job missing even one role is genuinely restricted and its roles are worth reading, which is
 * exactly the case that matters on a load-balanced install, so the check is deliberately strict.
 */
export function runsOnAnyServer(serverRoles: ReadonlyArray<string>): boolean {
  const declared = new Set(serverRoles);
  return UMBRADESKTOP_ALL_SERVER_ROLES.every((role) => declared.has(role));
}

/**
 * Splits a report into its two kinds, which are presented as separate tables because they can
 * answer different questions: Umbraco records nothing about how a distributed run ended, so that
 * group has no outcome to show, and distributed jobs carry no server roles.
 * @param jobs The report's jobs, in the order the server sent them.
 * @returns The jobs grouped by kind, each group in the server's order.
 * @remarks
 * `kind` crosses the wire as a string so that adding one server-side is not a breaking change.
 * Anything unrecognised is grouped with the recurring jobs rather than dropped: that table has
 * every column, so an unknown kind still shows everything it reported.
 */
export function groupJobsByKind(
  jobs: ReadonlyArray<BackgroundJobResponseModel>,
): UmbraDesktopJobsByKind {
  return {
    distributed: jobs.filter((job) => job.kind === DISTRIBUTED_KIND),
    recurring: jobs.filter((job) => job.kind !== DISTRIBUTED_KIND),
  };
}
