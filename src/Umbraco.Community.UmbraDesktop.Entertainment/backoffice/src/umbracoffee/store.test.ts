import { expect } from '@open-wc/testing';
import {
  UMBRACOFFEE_ACTIVE_WINDOW_MS,
  UMBRACOFFEE_POLL_ACTIVE_MS,
  UMBRACOFFEE_POLL_IDLE_MS,
} from './constants.js';
import type { UmbraCoffeeFeedResult } from './feed.js';
import { snapshotData } from './snapshot.js';
import { pollDelay, UmbraCoffeeStore } from './store.js';
import { clock, episodeOf, MINUTE, T0, timers } from './test-support.js';
import type { UmbraCoffeeCurrent, UmbraCoffeeData, UmbraCoffeeEpisode } from './types.js';

/**
 * The store's promise is "one poller per desktop, only while someone listens, that asks GitHub
 * (never the server), tells the truth about being offline, and asks faster when a stream is close".
 * Every case injects the fetcher, the timers and the clock, so what is counted is the store's own
 * behaviour and not the network's or the machine's.
 */

/** Two episodes, so a case can tell the list it fetched from the snapshot's. */
const EPISODES: UmbraCoffeeEpisode[] = [
  episodeOf({ videoId: 'v0', title: 'September', published: '2026-09-25T11:27:38Z' }),
  episodeOf({ videoId: 'v2', title: 'August', published: '2026-08-28T11:30:00Z' }),
];

/** The moment the episode list was generated, as the file says it. */
const GENERATED_AT = '2026-09-30T09:00:00Z';

/** The moment the next-episode file was last written. */
const UPDATED_AT = new Date(T0 - MINUTE).toISOString();

/**
 * What a healthy fetch returns: both files, with nothing coming up unless a case says otherwise.
 * @param episode What `next-episode.json` holds.
 * @returns The feed result.
 */
function good(episode: UmbraCoffeeCurrent | null = null): UmbraCoffeeFeedResult {
  return {
    episodes: { version: 2, generatedAt: GENERATED_AT, episodes: EPISODES },
    next: { version: 1, updatedAt: UPDATED_AT, episode },
  };
}

/** What a fetch returns when nothing could be had. */
const nothing: UmbraCoffeeFeedResult = {};

/**
 * Timers and a clock the test drives: nothing fires and no time passes until the test says so.
 * @returns The clock and the timers reading it.
 */
function environment() {
  const time = clock();
  return { time, env: timers(time) };
}

/**
 * A fetcher that counts its calls and answers with {@link good}.
 * @returns The fetcher and its call count.
 */
function counting() {
  const counter = {
    calls: 0,
    fetch: async () => {
      counter.calls++;
      return good();
    },
  };
  return counter;
}

it('does nothing until the first subscriber', async () => {
  const f = counting();
  const { env } = environment();
  const store = new UmbraCoffeeStore(f.fetch, env);
  await store.settled;
  expect(f.calls, 'importing the module must not reach the network').to.equal(0);
  expect(env.count, 'nor start a timer').to.equal(0);
  expect(store.value === undefined).to.equal(true);
});

it('fetches once on the first subscriber and hands the data to later ones', async () => {
  const f = counting();
  const { env } = environment();
  const store = new UmbraCoffeeStore(f.fetch, env);
  const seen: UmbraCoffeeData[] = [];
  store.subscribe((d) => seen.push(d));
  await store.settled;
  store.subscribe((d) => seen.push(d));
  expect(f.calls).to.equal(1);
  const expected: UmbraCoffeeData = {
    episodes: EPISODES,
    current: null,
    currentUpdatedAt: Date.parse(UPDATED_AT),
    offline: false,
    episodesAsOf: GENERATED_AT,
    receivedAt: T0,
  };
  expect(seen).to.deep.equal([expected, expected]);
});

it('reads the current episode and its confirmation time from the next-episode file', async () => {
  const episode: UmbraCoffeeCurrent = {
    videoId: 'v1',
    title: 'October',
    state: 'upcoming',
    scheduledStart: new Date(T0 + 25 * MINUTE).toISOString(),
  };
  const { env } = environment();
  const store = new UmbraCoffeeStore(async () => good(episode), env);
  store.subscribe(() => {});
  await store.settled;
  expect(store.value?.current).to.deep.equal(episode);
  expect(store.value?.currentUpdatedAt).to.equal(Date.parse(UPDATED_AT));
  expect(store.value?.offline).to.equal(false);
});

it('stamps each answer with the time this browser received it', async () => {
  const f = counting();
  const { env, time } = environment();
  const store = new UmbraCoffeeStore(f.fetch, env);
  store.subscribe(() => {});
  await store.settled;
  expect(store.value?.receivedAt).to.equal(T0);
  time.advance(UMBRACOFFEE_POLL_IDLE_MS);
  env.fire();
  await store.settled;
  expect(store.value?.receivedAt).to.equal(T0 + UMBRACOFFEE_POLL_IDLE_MS);
});

describe('simulating', () => {
  /*
   * The console commands (console.ts) and browser tests drive the window, the cup and the reminders
   * through this: a stand-in feed that takes over at once and on every poll after, until cleared.
   */
  it('asks a simulation at once and on every poll instead of the real feed, and the real one again once cleared', async () => {
    const real = counting();
    const { env } = environment();
    const store = new UmbraCoffeeStore(real.fetch, env);
    store.subscribe(() => {});
    await store.settled;
    expect(real.calls).to.equal(1);
    let simulated = 0;
    const live: UmbraCoffeeCurrent = { videoId: 'sim', title: 'Simulated', state: 'live', scheduledStart: null, actualStart: null };
    store.simulate(async () => (simulated++, good(live)));
    await store.settled;
    expect(simulated, 'taken over at once, not at the next poll').to.equal(1);
    expect(store.value?.current?.videoId).to.equal('sim');
    expect(env.count, 'still one chain, one timer').to.equal(1);
    env.fire();
    await store.settled;
    expect(simulated, 'and on the poll after').to.equal(2);
    expect(real.calls, 'the real feed is left alone meanwhile').to.equal(1);
    store.simulate(undefined);
    await store.settled;
    expect(real.calls, 'cleared: the real feed again, at once').to.equal(2);
    expect(store.value?.current ?? null).to.equal(null);
  });

  it('holds a simulation set while nobody listens until the first listener arrives', async () => {
    const real = counting();
    const { env } = environment();
    const store = new UmbraCoffeeStore(real.fetch, env);
    let simulated = 0;
    store.simulate(async () => (simulated++, good()));
    expect(simulated, 'nothing asked while nobody listens').to.equal(0);
    store.subscribe(() => {});
    await store.settled;
    expect(simulated).to.equal(1);
    expect(real.calls).to.equal(0);
  });
});

describe('polling', () => {
  it('chains one timeout after each answer and stops when the last listener leaves', async () => {
    const f = counting();
    const { env } = environment();
    const store = new UmbraCoffeeStore(f.fetch, env);
    const off = store.subscribe(() => {});
    await store.settled;
    expect(env.count, 'one timeout waiting, not an interval').to.equal(1);
    env.fire();
    await store.settled;
    expect(f.calls).to.equal(2);
    expect(env.count, 'the next one is scheduled once the answer is in').to.equal(1);
    off();
    expect(env.count, 'unsubscribing the last listener clears it').to.equal(0);
  });

  it('keeps polling while a second listener stays', async () => {
    const { env } = environment();
    const store = new UmbraCoffeeStore(async () => good(), env);
    const first = store.subscribe(() => {});
    store.subscribe(() => {});
    await store.settled;
    expect(env.count, 'the second listener shares the timer the first started').to.equal(1);
    first();
    expect(env.count).to.equal(1);
  });

  it('starts again after everyone left: fetches anew on one timer, replaying what it held', async () => {
    const f = counting();
    const { env, time } = environment();
    const store = new UmbraCoffeeStore(f.fetch, env);
    store.subscribe(() => {})();
    await store.settled;
    time.advance(MINUTE);
    const seen: UmbraCoffeeData[] = [];
    store.subscribe((d) => seen.push(d));
    expect(seen.map((d) => d.receivedAt), 'the held data at once, with its original receipt time').to.deep.equal([T0]);
    await store.settled;
    expect(f.calls).to.equal(2);
    expect(env.count).to.equal(1);
    expect(seen[seen.length - 1]?.receivedAt).to.equal(T0 + MINUTE);
  });

  it('does not leave a timer behind when the last listener leaves with a request in flight', async () => {
    let finish: (result: UmbraCoffeeFeedResult) => void = () => {};
    const { env } = environment();
    const store = new UmbraCoffeeStore(() => new Promise((resolve) => (finish = resolve)), env);
    const off = store.subscribe(() => {});
    off();
    finish(good());
    await store.settled;
    expect(env.count, 'nobody listens, so nothing is scheduled').to.equal(0);
  });

  it('does not run two chains when someone leaves and another arrives during a request', async () => {
    const resolvers: Array<(result: UmbraCoffeeFeedResult) => void> = [];
    const { env } = environment();
    const store = new UmbraCoffeeStore(() => new Promise((resolve) => resolvers.push(resolve)), env);
    store.subscribe(() => {})();
    store.subscribe(() => {});
    expect(resolvers.length, 'the second start asked again').to.equal(2);
    resolvers.forEach((resolve) => resolve(good()));
    await store.settled;
    await Promise.resolve();
    expect(env.count, 'one chain, one timeout').to.equal(1);
  });

  it('does not ask a second time while a request is in flight', async () => {
    let calls = 0;
    const { env } = environment();
    const store = new UmbraCoffeeStore(
      () =>
        new Promise(() => {
          calls++;
        }),
      env,
    );
    store.subscribe(() => {});
    store.subscribe(() => {});
    expect(calls, 'the second listener shares the request on its way').to.equal(1);
  });
});

describe('going offline', () => {
  it('keeps the first episodes, hides current and flips offline when a later poll fails, and flips back on recovery', async () => {
    let result: UmbraCoffeeFeedResult = good({ videoId: 'v1', title: 'October', state: 'live' });
    const { env, time } = environment();
    const store = new UmbraCoffeeStore(async () => result, env);
    store.subscribe(() => {});
    await store.settled;
    expect(store.value?.offline).to.equal(false);

    result = nothing;
    time.advance(UMBRACOFFEE_POLL_ACTIVE_MS);
    env.fire();
    await store.settled;
    expect(store.value?.offline).to.equal(true);
    expect(store.value?.episodes).to.deep.equal(EPISODES);
    expect(store.value?.episodesAsOf).to.equal(GENERATED_AT);
    expect(store.value?.current === null, 'nothing is believed while it cannot be confirmed').to.equal(true);
    expect(store.value?.currentUpdatedAt === undefined).to.equal(true);

    result = good();
    time.advance(UMBRACOFFEE_POLL_IDLE_MS);
    env.fire();
    await store.settled;
    expect(store.value?.offline).to.equal(false);
  });

  it('serves the snapshot when the very first fetch fails', async () => {
    const { env } = environment();
    const store = new UmbraCoffeeStore(async () => nothing, env);
    const seen: UmbraCoffeeData[] = [];
    store.subscribe((d) => seen.push(d));
    await store.settled;
    expect(seen).to.deep.equal([await snapshotData(T0)]);
    expect(store.value?.offline).to.equal(true);
  });

  it('is offline when only one file comes back, using the episodes that did arrive', async () => {
    const { env } = environment();
    const onlyEpisodes = new UmbraCoffeeStore(async () => ({ episodes: good().episodes }), env);
    onlyEpisodes.subscribe(() => {});
    await onlyEpisodes.settled;
    expect(onlyEpisodes.value?.offline).to.equal(true);
    expect(onlyEpisodes.value?.episodes).to.deep.equal(EPISODES);
    expect(onlyEpisodes.value?.current === null).to.equal(true);

    const onlyNext = new UmbraCoffeeStore(async () => ({ next: good({ videoId: 'v1', title: 'October', state: 'live' }).next }), env);
    onlyNext.subscribe(() => {});
    await onlyNext.settled;
    expect(onlyNext.value?.offline).to.equal(true);
    expect(onlyNext.value?.episodes, 'no episodes file and none held: the snapshot').to.deep.equal((await snapshotData(T0)).episodes);
    expect(onlyNext.value?.current === null, 'a next-episode file alone is not believed').to.equal(true);
  });

  it('survives a fetcher that throws, and one that throws before returning a promise', async () => {
    const { env } = environment();
    const rejecting = new UmbraCoffeeStore(async () => {
      throw new Error('offline');
    }, env);
    rejecting.subscribe(() => {});
    await rejecting.settled;
    expect(rejecting.value?.offline).to.equal(true);

    const throwing = new UmbraCoffeeStore(() => {
      throw new Error('blocked');
    }, env);
    expect(() => throwing.subscribe(() => {})).to.not.throw();
    await throwing.settled;
    expect(throwing.value?.offline).to.equal(true);
    // The failure must not leave the store unable to ask again.
    env.fire();
    await throwing.settled;
    expect(throwing.value?.offline).to.equal(true);
  });
});

describe('loading the snapshot', () => {
  /**
   * A snapshot loader that counts its calls, so a case can tell whether the store asked for the
   * shipped list at all: the real one is a dynamic import, and a normal start must never make it.
   * @param load What the loader resolves to, or rejects with.
   * @returns The loader and its call count.
   */
  function countingSnapshot(load: (now: number) => Promise<UmbraCoffeeData> = snapshotData) {
    const counter = {
      calls: 0,
      load: (now: number) => {
        counter.calls++;
        return load(now);
      },
    };
    return counter;
  }

  it('never loads it when both files come back, or when the episodes file alone does', async () => {
    const snapshot = countingSnapshot();
    const { env } = environment();
    const both = new UmbraCoffeeStore(async () => good(), env, snapshot.load);
    both.subscribe(() => {});
    await both.settled;
    const episodesOnly = new UmbraCoffeeStore(async () => ({ episodes: good().episodes }), env, snapshot.load);
    episodesOnly.subscribe(() => {});
    await episodesOnly.settled;
    expect(snapshot.calls).to.equal(0);
  });

  it('never loads it once a list is held, however many polls fail after', async () => {
    let result: UmbraCoffeeFeedResult = good();
    const snapshot = countingSnapshot();
    const { env } = environment();
    const store = new UmbraCoffeeStore(async () => result, env, snapshot.load);
    store.subscribe(() => {});
    await store.settled;
    result = nothing;
    env.fire();
    await store.settled;
    env.fire();
    await store.settled;
    expect(snapshot.calls).to.equal(0);
    expect(store.value?.episodes).to.deep.equal(EPISODES);
  });

  it('loads it when the first answer has no episodes file, whether the other came or not', async () => {
    const snapshot = countingSnapshot();
    const { env } = environment();
    const none = new UmbraCoffeeStore(async () => nothing, env, snapshot.load);
    none.subscribe(() => {});
    await none.settled;
    const onlyNext = new UmbraCoffeeStore(async () => ({ next: good().next }), env, snapshot.load);
    onlyNext.subscribe(() => {});
    await onlyNext.settled;
    expect(snapshot.calls).to.equal(2);
    expect(none.value?.episodes).to.deep.equal((await snapshotData(T0)).episodes);
  });

  it('stamps the snapshot with the time the answer came, not the time the file finished loading', async () => {
    const { env, time } = environment();
    const store = new UmbraCoffeeStore(async () => nothing, env, async (now) => {
      time.advance(MINUTE);
      return snapshotData(now);
    });
    store.subscribe(() => {});
    await store.settled;
    expect(store.value?.receivedAt).to.equal(T0);
  });

  it('survives a snapshot that cannot be loaded: offline, an empty list, and still polling', async () => {
    const { env } = environment();
    const store = new UmbraCoffeeStore(async () => nothing, env, async () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    const seen: UmbraCoffeeData[] = [];
    store.subscribe((d) => seen.push(d));
    await store.settled;
    expect(seen.length).to.equal(1);
    expect(store.value?.offline).to.equal(true);
    expect(store.value?.episodes).to.deep.equal([]);
    expect(store.value?.episodesAsOf === null).to.equal(true);
    expect(env.count, 'the next poll is still scheduled').to.equal(1);
  });
});

describe('listeners', () => {
  it('treats the same function subscribed twice as two subscriptions', async () => {
    const { env } = environment();
    const store = new UmbraCoffeeStore(async () => good(), env);
    let calls = 0;
    const listener = () => void calls++;
    const first = store.subscribe(listener);
    store.subscribe(listener);
    await store.settled;
    expect(calls, 'once per subscription').to.equal(2);
    first();
    env.fire();
    await store.settled;
    expect(calls, 'the second subscription still hears').to.equal(3);
    expect(env.count).to.equal(1);
  });

  it('tells every listener even when one throws, and still settles', async () => {
    const { env } = environment();
    const store = new UmbraCoffeeStore(async () => good(), env);
    const heard: string[] = [];
    store.subscribe(() => {
      throw new Error('broken listener');
    });
    store.subscribe(() => heard.push('second'));
    await store.settled;
    expect(heard).to.deep.equal(['second']);
    // A throwing listener given the held data on subscribe must not throw out of `subscribe` either.
    expect(() =>
      store.subscribe(() => {
        throw new Error('broken late listener');
      }),
    ).to.not.throw();
  });
});

describe('pollDelay', () => {
  /** Data with the given current and offline flag, on nothing else. */
  const data = (current: UmbraCoffeeCurrent | null, offline = false): UmbraCoffeeData => ({
    episodes: EPISODES,
    current,
    offline,
    episodesAsOf: GENERATED_AT,
    receivedAt: T0,
  });

  /**
   * An upcoming episode starting a given time from {@link T0}.
   * @param inMs How long from T0.
   * @returns The episode.
   */
  const startingIn = (inMs: number): UmbraCoffeeCurrent => ({
    videoId: 'v1',
    title: 'October',
    state: 'upcoming',
    scheduledStart: new Date(T0 + inMs).toISOString(),
  });

  it('asks every minute while live', () => {
    expect(pollDelay(data({ videoId: 'v1', title: 'October', state: 'live' }), T0)).to.equal(UMBRACOFFEE_POLL_ACTIVE_MS);
  });

  it('asks every minute for an upcoming episode inside the active window, and after its start', () => {
    expect(pollDelay(data(startingIn(60 * MINUTE)), T0)).to.equal(UMBRACOFFEE_POLL_ACTIVE_MS);
    expect(pollDelay(data(startingIn(UMBRACOFFEE_ACTIVE_WINDOW_MS - 1)), T0)).to.equal(UMBRACOFFEE_POLL_ACTIVE_MS);
    expect(pollDelay(data(startingIn(-5 * MINUTE)), T0), 'late, and not live yet: watch for the switch').to.equal(
      UMBRACOFFEE_POLL_ACTIVE_MS,
    );
  });

  it('asks every half hour for an upcoming episode further off than the window, and for nothing', () => {
    expect(pollDelay(data(startingIn(3 * 60 * MINUTE)), T0)).to.equal(UMBRACOFFEE_POLL_IDLE_MS);
    expect(pollDelay(data(startingIn(UMBRACOFFEE_ACTIVE_WINDOW_MS)), T0)).to.equal(UMBRACOFFEE_POLL_IDLE_MS);
    expect(pollDelay(data(null), T0)).to.equal(UMBRACOFFEE_POLL_IDLE_MS);
  });

  it('asks every half hour when offline, so a blocked host is not hammered', () => {
    expect(pollDelay(data({ videoId: 'v1', title: 'October', state: 'live' }, true), T0)).to.equal(UMBRACOFFEE_POLL_IDLE_MS);
    expect(pollDelay(data(startingIn(5 * MINUTE), true), T0)).to.equal(UMBRACOFFEE_POLL_IDLE_MS);
  });

  it('asks every half hour for an upcoming episode with no readable start', () => {
    expect(pollDelay(data({ videoId: 'v1', title: 'October', state: 'upcoming', scheduledStart: 'soon' }), T0)).to.equal(
      UMBRACOFFEE_POLL_IDLE_MS,
    );
  });

  it('is what the store schedules its next poll with', async () => {
    let result = good({ videoId: 'v1', title: 'October', state: 'live' });
    const { env, time } = environment();
    const store = new UmbraCoffeeStore(async () => result, env);
    store.subscribe(() => {});
    await store.settled;
    expect(env.timeoutDelays).to.deep.equal([UMBRACOFFEE_POLL_ACTIVE_MS]);
    result = good();
    time.advance(UMBRACOFFEE_POLL_ACTIVE_MS);
    env.fire();
    await store.settled;
    expect(env.timeoutDelays).to.deep.equal([UMBRACOFFEE_POLL_IDLE_MS]);
    result = nothing;
    env.fire();
    await store.settled;
    expect(env.timeoutDelays, 'offline is idle too').to.deep.equal([UMBRACOFFEE_POLL_IDLE_MS]);
  });
});
