import { expect } from '@open-wc/testing';
import { UMBRACOFFEE_LATE_START_GRACE_MS, UMBRACOFFEE_NEXT_MAX_AGE_MS } from './constants.js';
import { dueReminders, reminderKey, trayStateFor, viewFor } from './schedule.js';
import { episodeOf } from './test-support.js';
import type { UmbraCoffeeCurrent, UmbraCoffeeData } from './types.js';

/**
 * The rules of design §5 and §3.2 (and the first design's D4, D6 and D7), each asserted by calling
 * the function that decides it. The clock is a number passed in, so every case pins "now" to the
 * minute it is about.
 */

/** The October episode's scheduled start. */
const START = Date.parse('2026-10-30T11:30:00Z');

/** One minute, in ms. */
const MIN = 60_000;

/** October, upcoming. */
const UPCOMING: UmbraCoffeeCurrent = {
  videoId: 'v1',
  title: 'October',
  state: 'upcoming',
  scheduledStart: new Date(START).toISOString(),
};

/** October, live. */
const LIVE: UmbraCoffeeCurrent = { videoId: 'v1', title: 'October', state: 'live', scheduledStart: null };

/**
 * Data with October upcoming and September the latest episode, online, with any field overridden.
 * The next-episode file counts as confirmed at `START - 40 min` unless a case says otherwise; cases
 * about time pass `now` and use {@link freshAt} to say when it was confirmed.
 * @param over Fields to replace.
 * @returns The data.
 */
const data = (over: Partial<UmbraCoffeeData> = {}): UmbraCoffeeData => ({
  episodes: [episodeOf({ videoId: 'v0', title: 'September', published: '2026-09-25T11:27:38Z' })],
  current: UPCOMING,
  currentUpdatedAt: START - 40 * MIN,
  offline: false,
  episodesAsOf: '2026-09-30T09:00:00Z',
  receivedAt: START - 40 * MIN,
  ...over,
});

/**
 * The same October-live data.
 * @returns The data.
 */
const live = () => data({ current: LIVE });

/**
 * Data whose next-episode file was confirmed just now, which is what most cases are about: only the
 * ones about age look at anything else.
 * @param d The data.
 * @param now Epoch ms.
 * @returns The data with `currentUpdatedAt` and `receivedAt` set to `now`.
 */
const freshAt = (d: UmbraCoffeeData, now: number): UmbraCoffeeData => ({ ...d, currentUpdatedAt: now, receivedAt: now });

/**
 * The window's view of data confirmed just now.
 * @param d The data.
 * @param now Epoch ms.
 * @returns The view.
 */
const view = (d: UmbraCoffeeData, now: number) => viewFor(freshAt(d, now), now);

/**
 * The cup's state for data confirmed just now.
 * @param d The data.
 * @param now Epoch ms.
 * @returns The state.
 */
const tray = (d: UmbraCoffeeData, now: number) => trayStateFor(freshAt(d, now), now);

/**
 * The reminders due for data confirmed just now.
 * @param d The data.
 * @param now Epoch ms.
 * @param shown Keys already shown.
 * @returns The due reminders.
 */
const due = (d: UmbraCoffeeData, now: number, shown: ReadonlySet<string> = new Set()) =>
  dueReminders(freshAt(d, now), now, shown);

it('shows an upcoming episode with minutes left, rounded up', () => {
  const v = view(data(), START - 25 * MIN + 1);
  expect(v.kind).to.equal('upcoming');
  expect(v.kind === 'upcoming' && v.minutesLeft).to.equal(25);
});

it('never counts below zero minutes once the start has passed', () => {
  const v = view(data(), START + 3 * MIN);
  expect(v.kind === 'upcoming' && v.minutesLeft).to.equal(0);
});

it('shows the live episode', () => expect(view(live(), START).kind).to.equal('live'));

it('shows the latest episode when nothing is on', () => {
  const v = view(data({ current: null }), START);
  expect(v.kind === 'latest' && v.episode.videoId).to.equal('v0');
});

it('treats an upcoming episode with no start time as nothing current', () => {
  const noStart = data({ current: { videoId: 'v1', title: 'October', state: 'upcoming', scheduledStart: null } });
  expect(view(noStart, START).kind).to.equal('latest');
  expect(tray(noStart, START)).to.equal('hidden');
  expect(due(noStart, START)).to.deep.equal([]);
});

it('treats an upcoming episode with an unreadable start time as nothing current', () => {
  const garbled = data({ current: { videoId: 'v1', title: 'October', state: 'upcoming', scheduledStart: 'soon' } });
  expect(view(garbled, START).kind).to.equal('latest');
  expect(tray(garbled, START)).to.equal('hidden');
  expect(due(garbled, START)).to.deep.equal([]);
});

it('is empty with no data or no episodes', () => {
  expect(viewFor(undefined, START).kind).to.equal('empty');
  expect(view(data({ current: null, episodes: [] }), START).kind).to.equal('empty');
});

it('hides the cup unless upcoming or live', () => {
  expect(tray(data(), START - 60 * MIN)).to.equal('upcoming');
  expect(tray(live(), START)).to.equal('live');
  expect(tray(data({ current: null }), START)).to.equal('hidden');
  expect(trayStateFor(undefined, START)).to.equal('hidden');
});

it('reminds ten minutes before, not earlier (D7)', () => {
  expect(due(data(), START - 11 * MIN)).to.deep.equal([]);
  expect(due(data(), START - 10 * MIN).map((r) => r.kind)).to.deep.equal(['soon']);
});

it('reminds on first sighting when already inside the ten minutes', () => {
  expect(due(data(), START - 3 * MIN).map((r) => r.kind)).to.deep.equal(['soon']);
});

it('still reminds when the start has passed but it is not live yet', () => {
  expect(due(data(), START + 2 * MIN).map((r) => r.kind)).to.deep.equal(['soon']);
});

it('reminds once when live, and first seen live means only that one', () => {
  expect(due(live(), START).map((r) => r.kind)).to.deep.equal(['live']);
});

it('never repeats a reminder already shown', () => {
  expect(due(data(), START - 5 * MIN, new Set([reminderKey('v1', 'soon')]))).to.deep.equal([]);
  expect(due(live(), START, new Set([reminderKey('v1', 'live')]))).to.deep.equal([]);
});

it('keys a reminder by episode and kind', () => {
  expect(reminderKey('v1', 'soon')).to.equal('v1:soon');
  expect(reminderKey('v1', 'live')).to.not.equal(reminderKey('v1', 'soon'));
});

/**
 * Offline is a flag, not a view: the window reads `offline` itself to draw its notice, while the
 * schedule only has to make sure nothing current, no cup and no reminder comes out of data it could
 * not confirm. The episode list is still worth showing.
 */
describe('offline data', () => {
  it('has nothing current, whatever a stale current says', () => {
    const offline = freshAt(data({ offline: true }), START - 5 * MIN);
    expect(viewFor(offline, START - 5 * MIN).kind).to.equal('latest');
    expect(trayStateFor(offline, START - 5 * MIN)).to.equal('hidden');
    expect(dueReminders(offline, START - 5 * MIN, new Set())).to.deep.equal([]);
  });

  it('is not the same as empty: the snapshot episodes still lead', () => {
    const v = viewFor(freshAt(data({ offline: true, current: null }), START), START);
    expect(v.kind === 'latest' && v.episode.videoId).to.equal('v0');
  });
});

/**
 * Design §3.2: an upcoming or live episode is believed only while the next-episode file's `updatedAt`
 * is fresh. The Action writes it on every run while an episode is set, so an old one means the Action
 * has stopped, not that nothing changed: missed, never wrong.
 */
describe('a next-episode file that is out of date', () => {
  it('is trusted while `updatedAt` is fresh, up to the limit', () => {
    const now = START - 8 * MIN;
    const d = data({ currentUpdatedAt: now - UMBRACOFFEE_NEXT_MAX_AGE_MS });
    expect(dueReminders(d, now, new Set()).map((r) => r.kind)).to.deep.equal(['soon']);
    expect(trayStateFor(d, now)).to.equal('upcoming');
    expect(viewFor(d, now).kind).to.equal('upcoming');
  });

  it('is distrusted once 31 minutes old, however good the episode looks', () => {
    const now = START - 8 * MIN;
    const d = data({ currentUpdatedAt: now - 31 * MIN });
    expect(dueReminders(d, now, new Set())).to.deep.equal([]);
    expect(trayStateFor(d, now)).to.equal('hidden');
    expect(viewFor(d, now).kind, 'the episode list is still worth showing').to.equal('latest');
  });

  it('applies to a live episode too', () => {
    const d = { ...live(), currentUpdatedAt: START - 31 * MIN };
    expect(trayStateFor(d, START)).to.equal('hidden');
    expect(dueReminders(d, START, new Set())).to.deep.equal([]);
  });

  it('is distrusted when there is no `updatedAt` at all', () => {
    const { currentUpdatedAt: _omitted, ...without } = data();
    void _omitted;
    expect(trayStateFor(without, START - 5 * MIN)).to.equal('hidden');
  });

  it('raises no "starts soon" when picked up at 13:00 having last been confirmed at 11:15', () => {
    const d = data({ currentUpdatedAt: Date.parse('2026-10-30T11:15:00Z') });
    const back = Date.parse('2026-10-30T13:00:00Z');
    expect(dueReminders(d, back, new Set())).to.deep.equal([]);
    expect(trayStateFor(d, back)).to.equal('hidden');
  });
});

/**
 * A stream still marked upcoming long after its start. The Action drops an abandoned one after six
 * hours, but until then a show that was delayed badly would otherwise go on raising "starts soon,
 * starts at 11:30" all afternoon, with the cup reading "in 0 min". That is a wrong reminder, which D4
 * rules out.
 */
describe('an upcoming stream well past its start', () => {
  it('still reminds and shows the cup when first seen late but inside the grace', () => {
    const late = START + UMBRACOFFEE_LATE_START_GRACE_MS;
    expect(due(data(), late).map((r) => r.kind)).to.deep.equal(['soon']);
    expect(tray(data(), late)).to.equal('upcoming');
    expect(view(data(), late).kind).to.equal('upcoming');
  });

  it('raises no reminder, hides the cup and shows the latest episode once past the grace', () => {
    const tooLate = START + UMBRACOFFEE_LATE_START_GRACE_MS + 1;
    expect(due(data(), tooLate)).to.deep.equal([]);
    expect(tray(data(), tooLate)).to.equal('hidden');
    expect(view(data(), tooLate).kind).to.equal('latest');
  });

  it('does not apply to a stream that is live, however long it runs', () => {
    expect(tray(live(), START + 3 * 60 * MIN)).to.equal('live');
  });
});
