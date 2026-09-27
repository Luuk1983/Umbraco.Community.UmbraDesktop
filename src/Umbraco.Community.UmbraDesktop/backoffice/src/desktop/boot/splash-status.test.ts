import { expect } from '@open-wc/testing';
import { delayedBootStatus } from './splash-status';

/**
 * When the boot splash is allowed to say anything.
 *
 * The rule is that a normal boot says nothing at all. A line explaining that settings are loading is
 * reassuring after a second and a half and faintly alarming after eighty milliseconds, because it
 * tells a user something is slow when nothing is. So the first message is held behind a delay, and
 * anything after it goes straight up — by then the splash is already talking.
 *
 * The scheduler is injected so every branch is a function call rather than a wait. A test that
 * actually slept for the real delay would add more wall-clock time than the whole suite takes.
 */

/** A scheduler whose timer fires only when a test says so. */
function manualScheduler(): {
  /** The scheduler to hand to the controller. */
  schedule: (fn: () => void, ms: number) => number;
  /** The canceller to hand to the controller. */
  cancel: (handle: number) => void;
  /** Run the pending timer, if there is one. */
  fire: () => void;
  /** The delay the controller asked for. */
  askedFor: () => number | undefined;
  /** Whether the pending timer was cancelled. */
  cancelled: () => boolean;
} {
  let pending: (() => void) | undefined;
  let delay: number | undefined;
  let cancelled = false;

  return {
    schedule: (fn, ms) => {
      pending = fn;
      delay = ms;
      return 1;
    },
    cancel: () => (cancelled = true),
    fire: () => {
      const run = pending;
      pending = undefined;
      run?.();
    },
    askedFor: () => delay,
    cancelled: () => cancelled,
  };
}

/**
 * A controller writing into a list instead of the DOM.
 * @param scheduler The scheduler to use.
 * @param shown The list every shown value is appended to.
 * @returns The controller.
 */
function statusInto(scheduler: ReturnType<typeof manualScheduler>, shown: (string | null)[]) {
  return delayedBootStatus({
    delayMs: 1500,
    show: (text) => shown.push(text),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
}

it('says nothing before the delay has passed', () => {
  const shown: (string | null)[] = [];
  const scheduler = manualScheduler();

  statusInto(scheduler, shown).set('Loading your settings');

  expect(shown).to.eql([]);
});

it('says the latest message once the delay passes', () => {
  const shown: (string | null)[] = [];
  const scheduler = manualScheduler();
  const status = statusInto(scheduler, shown);

  status.set('Loading your settings');
  status.set('Moving your settings');
  scheduler.fire();

  expect(shown).to.eql(['Moving your settings']);
});

it('says nothing when the delay passes with nothing to say', () => {
  const shown: (string | null)[] = [];
  const scheduler = manualScheduler();
  statusInto(scheduler, shown);

  scheduler.fire();

  expect(shown).to.eql([]);
});

it('speaks immediately once it has started speaking', () => {
  const shown: (string | null)[] = [];
  const scheduler = manualScheduler();
  const status = statusInto(scheduler, shown);

  status.set('Loading your settings');
  scheduler.fire();
  status.set('Moving your settings');

  expect(shown).to.eql(['Loading your settings', 'Moving your settings']);
});

it('arms its timer only once', () => {
  const scheduled: number[] = [];
  const status = delayedBootStatus({
    delayMs: 1500,
    show: () => {},
    schedule: (_fn, ms) => {
      scheduled.push(ms);
      return scheduled.length;
    },
    cancel: () => {},
  });

  status.set('one');
  status.set('two');
  status.set('three');

  expect(scheduled).to.eql([1500]);
});

it('clears what it said when it stops', () => {
  const shown: (string | null)[] = [];
  const scheduler = manualScheduler();
  const status = statusInto(scheduler, shown);

  status.set('Loading your settings');
  scheduler.fire();
  status.stop();

  expect(shown).to.eql(['Loading your settings', null]);
});

it('says nothing at all when it stops before the delay', () => {
  const shown: (string | null)[] = [];
  const scheduler = manualScheduler();
  const status = statusInto(scheduler, shown);

  status.set('Loading your settings');
  status.stop();
  scheduler.fire();

  expect(shown).to.eql([]);
  expect(scheduler.cancelled()).to.equal(true);
});

it('resolves the line when it shows it, not when it is set', () => {
  // The line is set at the start of a load and shown a second and a half later, and Umbraco's
  // dictionaries are dynamic imports that may not have arrived at the earlier moment — `term()`
  // returns the key itself when it cannot resolve one. Resolving early risks painting a raw
  // localization key across a full-screen splash, on the slow boot, which is the only boot that
  // shows this at all.
  const shown: (string | null)[] = [];
  const scheduler = manualScheduler();
  let translation = 'umbraDesktop_bootLoadingSettings';
  const status = delayedBootStatus({
    delayMs: 1500,
    show: (text) => shown.push(text),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  status.set(() => translation);
  translation = 'Loading your desktop';
  scheduler.fire();

  expect(shown).to.eql(['Loading your desktop']);
});

it('asks for the delay it was given', () => {
  const scheduler = manualScheduler();

  statusInto(scheduler, []).set('anything');

  expect(scheduler.askedFor()).to.equal(1500);
});
