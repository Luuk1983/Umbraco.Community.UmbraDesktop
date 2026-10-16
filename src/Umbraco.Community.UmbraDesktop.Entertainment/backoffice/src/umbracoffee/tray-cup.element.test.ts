import { expect } from '@open-wc/testing';
import './tray-cup.element.js';
import en from '../localization/en.js';
import {
  UMBRACOFFEE_APP_ALIAS,
  UMBRACOFFEE_LIVE_REMINDER_MS,
  UMBRACOFFEE_NEXT_MAX_AGE_MS,
  UMBRACOFFEE_TRAY_ICON_SIZE,
} from './constants.js';
import { UMBRACOFFEE_TIME_OPTIONS } from './desktop-format.js';
import { readReminded, type ReminderStorage, type ReminderStorageSource } from './reminder-record.js';
import { reminderKey } from './schedule.js';
import type { UmbraCoffeeFetcher, UmbraCoffeeStore } from './store.js';
import type { UmbraCoffeeData } from './types.js';
import {
  answer,
  clock,
  desktopFormatted,
  feedOf,
  live,
  offline,
  memoryStorage,
  MINUTE,
  provideDesktopSettings,
  removeBoxes,
  sizedBox,
  T0,
  testStore,
  timers,
  upcoming,
  type TestClock,
  type TestDesktopHostElement,
  type TestTimers,
} from './test-support.js';
import type { UmbraCoffeeTrayCupElement } from './tray-cup.element.js';

/**
 * The cup, tested through what it draws and what it raises. Each case puts it in a stand-in for the
 * desktop, which provides the notification and tray contexts under their real tokens and
 * records every call, and hands it its own store over a fixed answer and its own reminder record over
 * a map, so nothing reaches the network or this browser's real `localStorage`. The store and the cup
 * run on the test's timers and one clock, so nothing polls or ticks behind a case's back.
 *
 * When a reminder is due is `schedule.ts`'s rule and is tested there; these cases are about the cup
 * acting on it: raising each reminder once, with the element, data and duration the desktop toast
 * needs, and recording it first.
 */

/** The strings the cup falls back to, which are the English dictionary's. */
const STRINGS = en.umbraDesktopEntertainment;

/**
 * What the stubbed `document.visibilityState` reads. The runner's page is often in the background,
 * where the real one says hidden, so every case says visible unless it is about the tab being hidden.
 */
let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  removeBoxes();
  // The stub is an own property shadowing the prototype's getter, so deleting it restores the real one.
  delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
});

/**
 * October, starting a given number of minutes after {@link T0}.
 * @param minutes How far off the start is.
 * @returns The answer.
 */
const startingIn = (minutes: number): UmbraCoffeeData =>
  answer({
    current: {
      videoId: 'v1',
      title: 'October',
      state: 'upcoming',
      scheduledStart: new Date(T0 + minutes * MINUTE).toISOString(),
    },
  });

/**
 * Mount the cup in a desktop stand-in, the way the tray holds it.
 * @param source The data the store gives, or a fetcher the case controls.
 * @param options A store to use instead of a new one (with the clock it runs on), a reminder record
 *   to use instead of an empty map, and a desktop stand-in the case has already prepared.
 * @returns The cup after the store's first answer has rendered, the desktop stand-in, the store, the
 *   store's timers, the cup's timers, the clock and the reminder record.
 */
async function mount(
  source: UmbraCoffeeData | UmbraCoffeeFetcher,
  options: {
    store?: UmbraCoffeeStore;
    time?: TestClock;
    storeTimers?: TestTimers;
    reminders?: ReminderStorageSource;
    host?: TestDesktopHostElement;
  } = {},
) {
  const time = options.time ?? clock();
  const storeTimers = options.storeTimers ?? timers(time);
  const cupTimers = timers(time);
  const store = options.store ?? testStore(source, storeTimers);
  const storage: ReminderStorage = memoryStorage();
  const reminders = options.reminders ?? (() => storage);
  let host = options.host;
  if (!host) {
    host = document.createElement('umbracoffee-test-desktop-host');
  }
  sizedBox({ w: 200, h: 40 }, host);
  const cup = document.createElement('umbracoffee-tray-cup');
  cup.store = store;
  cup.environment = cupTimers;
  cup.reminderStorage = reminders;
  host.appendChild(cup);
  await store.settled;
  await cup.updateComplete;
  return { cup, host, store, storeTimers, cupTimers, time, reminders };
}

/**
 * The cup's button.
 * @param cup The cup.
 * @returns The button, or null before the first render.
 */
function button(cup: UmbraCoffeeTrayCupElement): HTMLButtonElement | null {
  return cup.shadowRoot?.querySelector('button') ?? null;
}

/**
 * Let a tick and a poll both happen, and every render they cause finish.
 * @param mounted What {@link mount} returned.
 */
async function tickAndPoll(mounted: Awaited<ReturnType<typeof mount>>): Promise<void> {
  mounted.cupTimers.fire();
  mounted.storeTimers.fire();
  await mounted.store.settled;
  await mounted.cup.updateComplete;
}

describe('what the cup shows', () => {
  it('hides itself when nothing is current', async () => {
    const { cup } = await mount(answer());
    expect(cup.hidden).to.equal(true);
  });

  it('hides itself before the first answer has come', async () => {
    const host = document.createElement('umbracoffee-test-desktop-host');
    sizedBox({ w: 200, h: 40 }, host);
    const time = clock();
    const cup = document.createElement('umbracoffee-tray-cup');
    // A fetcher that never answers: the store has nothing to hand out for the whole case.
    cup.store = testStore(() => new Promise<never>(() => {}), timers(time));
    cup.environment = timers(time);
    cup.reminderStorage = () => memoryStorage();
    host.appendChild(cup);
    expect(cup.hidden, 'from the moment it is in the tray').to.equal(true);
    await cup.updateComplete;
    expect(cup.hidden, 'and after its first render').to.equal(true);
  });

  it('shows a cup while an episode is coming up, with the minutes and the title in its tooltip', async () => {
    const { cup } = await mount(upcoming());
    const expected = STRINGS.umbraCoffeeTrayUpcoming.replace('%0%', '25').replace('%1%', 'October');
    expect(cup.hidden).to.equal(false);
    expect(cup.dataset.state).to.equal('upcoming');
    expect(button(cup)?.title).to.equal(expected);
    expect(button(cup)?.getAttribute('aria-label')).to.equal(expected);
  });

  it('shows the live cup while the episode is live', async () => {
    const { cup } = await mount(live());
    expect(cup.hidden).to.equal(false);
    expect(cup.getAttribute('data-state')).to.equal('live');
    expect(button(cup)?.title).to.equal(STRINGS.umbraCoffeeTrayLive.replace('%0%', 'October'));
  });

  it('hides itself, and raises nothing, over data it has held too long to trust', async () => {
    const time = clock();
    const storeTimers = timers(time);
    let calls = 0;
    // Live on the first ask, and nothing after: the store keeps its first data and it only ages.
    const store = testStore(async () => (calls++ === 0 ? feedOf(live(), time.now()) : {}), storeTimers);
    const unsubscribe = store.subscribe(() => {});
    await store.settled;
    time.advance(UMBRACOFFEE_NEXT_MAX_AGE_MS + MINUTE);
    const { cup, host } = await mount(live(), { store, time, storeTimers });
    unsubscribe();
    expect(store.value?.current?.state, 'the store still holds the live data').to.equal('live');
    expect(cup.hidden).to.equal(true);
    expect(host.raised).to.have.length(0);
  });

  it('shows no cup, and raises nothing, when the file says it was last confirmed 31 minutes ago', async () => {
    const { cup, host } = await mount(live({ currentUpdatedAt: T0 - 31 * MINUTE }));
    expect(cup.hidden).to.equal(true);
    expect(host.raised).to.have.length(0);
  });

  it('hides itself, and raises nothing, when offline, even if a current were present', async () => {
    const { cup, host } = await mount(offline({ current: live().current, currentUpdatedAt: T0 }));
    expect(cup.hidden).to.equal(true);
    expect(host.raised).to.have.length(0);
  });

  it('opens the umbraCoffee app when clicked', async () => {
    const { cup, host } = await mount(live());
    button(cup)?.click();
    expect(host.opened).to.deep.equal([UMBRACOFFEE_APP_ALIAS]);
  });

  it('draws in the colour the taskbar gives it', async () => {
    const { cup } = await mount(upcoming());
    const svg = cup.shadowRoot!.querySelector('svg')!;
    cup.style.color = 'rgb(1, 2, 3)';
    expect(getComputedStyle(svg).color, 'the icon follows the text colour it is given').to.equal('rgb(1, 2, 3)');
  });

  /*
   * The owner (2026-10-11): the cup is the app's own icon, Umbraco's icon-coffee, at the size the
   * taskbar draws app icons. Plain while an episode is coming up, steaming while it is live, and no
   * red dot: the steam is what says "live".
   */
  it("draws the app's own coffee icon at the taskbar's icon size, plain while upcoming", async () => {
    const { cup } = await mount(upcoming());
    const svg = cup.shadowRoot!.querySelector('svg')!;
    expect(svg.getAttribute('viewBox'), "icon-coffee's own grid").to.equal('0 0 24 24');
    expect(svg.getBoundingClientRect().width).to.equal(UMBRACOFFEE_TRAY_ICON_SIZE);
    expect(svg.getBoundingClientRect().height).to.equal(UMBRACOFFEE_TRAY_ICON_SIZE);
    expect(cup.shadowRoot!.querySelector('.steam') === null, 'no steam while upcoming').to.equal(true);
    expect(cup.shadowRoot!.querySelector('.dot') === null, 'no red dot, ever').to.equal(true);
  });

  it('steams while live, the three strokes rising', async () => {
    const { cup } = await mount(live());
    const strokes = [...cup.shadowRoot!.querySelectorAll<SVGPathElement>('.steam path')];
    expect(strokes.length).to.equal(3);
    expect(getComputedStyle(strokes[0]!).animationName).to.not.equal('none');
    expect(cup.shadowRoot!.querySelector('.dot') === null).to.equal(true);
  });
});

describe('the reminders', () => {
  it('raises "soon" once at nine minutes, timed to the start, and records it before raising it', async () => {
    const storage = memoryStorage();
    const reminders = () => storage;
    const host = document.createElement('umbracoffee-test-desktop-host');
    const recordedFirst: boolean[] = [];
    host.onRaise = () => recordedFirst.push(readReminded(reminders).has(reminderKey('v1', 'soon')));
    const mounted = await mount(startingIn(9), { reminders, host });
    const { cup } = mounted;

    expect(host.raised).to.have.length(1);
    const [raised] = host.raised;
    const start = new Date(T0 + 9 * MINUTE);
    const at = cup.localize.date(start, UMBRACOFFEE_TIME_OPTIONS);
    expect(raised.method).to.equal('peek');
    expect(raised.color).to.equal('default');
    expect(raised.options.elementName).to.equal('umbracoffee-reminder-notification');
    expect(raised.options.duration, 'until the start').to.equal(9 * MINUTE);
    expect(raised.options.data).to.deep.equal({
      headline: STRINGS.umbraCoffeeSoonHeadline,
      message: `October. ${STRINGS.umbraCoffeeStartsAt.replace('%0%', at)}`,
      kind: 'soon',
      videoId: 'v1',
      title: 'October',
      startsAt: start.toISOString(),
    });
    expect(JSON.parse(JSON.stringify(raised.options.data)), 'plain JSON').to.deep.equal(raised.options.data);
    expect(recordedFirst, 'the record held the key when it was raised').to.deep.equal([true]);

    await tickAndPoll(mounted);
    await tickAndPoll(mounted);
    expect(host.raised, 'not again on later ticks and polls').to.have.length(1);
  });

  it("writes the start time in 'soon' as the desktop's clock does", async () => {
    const host = document.createElement('umbracoffee-test-desktop-host');
    provideDesktopSettings(host);
    const { host: desktop } = await mount(startingIn(9), { host });
    const at = desktopFormatted(new Date(T0 + 9 * MINUTE), UMBRACOFFEE_TIME_OPTIONS);
    const message = desktop.raised[0]?.options.data?.message;
    expect(message, 'a time asks for an hour, so the 12/24 setting applies').to.contain('h23');
    expect(message).to.equal(`October. ${STRINGS.umbraCoffeeStartsAt.replace('%0%', at)}`);
  });

  it('writes it in the backoffice language inside a desktop older than formatDateTime', async () => {
    const host = document.createElement('umbracoffee-test-desktop-host');
    provideDesktopSettings(host, 'older');
    const { cup, host: desktop } = await mount(startingIn(9), { host });
    const at = cup.localize.date(new Date(T0 + 9 * MINUTE), UMBRACOFFEE_TIME_OPTIONS);
    expect(desktop.raised[0]?.options.data?.message).to.equal(`October. ${STRINGS.umbraCoffeeStartsAt.replace('%0%', at)}`);
  });

  it('never times "soon" out in under a minute', async () => {
    // The start has passed but YouTube has not said live yet: still due, and still readable.
    const { host } = await mount(startingIn(-2));
    expect(host.raised).to.have.length(1);
    expect(host.raised[0].options.duration).to.equal(MINUTE);
  });

  it('raises "live" once, for as long as the live reminder lasts', async () => {
    const mounted = await mount(live());
    const { host } = mounted;
    expect(host.raised).to.have.length(1);
    expect(host.raised[0].options.elementName).to.equal('umbracoffee-reminder-notification');
    expect(host.raised[0].options.duration).to.equal(UMBRACOFFEE_LIVE_REMINDER_MS);
    expect(host.raised[0].options.data).to.deep.equal({
      headline: STRINGS.umbraCoffeeLiveHeadline,
      message: 'October',
      kind: 'live',
      videoId: 'v1',
      title: 'October',
    });
    expect(readReminded(mounted.reminders).has(reminderKey('v1', 'live'))).to.equal(true);
    await tickAndPoll(mounted);
    expect(host.raised).to.have.length(1);
  });

  it('raises nothing that this browser has already shown, in an earlier desktop', async () => {
    const storage = memoryStorage();
    const first = await mount(live(), { reminders: () => storage });
    expect(first.host.raised).to.have.length(1);
    const second = await mount(live(), { reminders: () => storage });
    expect(second.host.raised).to.have.length(0);
  });

  it('raises nothing ahead of the ten minutes', async () => {
    const { host } = await mount(upcoming());
    expect(host.raised).to.have.length(0);
  });

  it('raises "soon" when the clock reaches the ten minutes between two polls', async () => {
    const mounted = await mount(startingIn(11));
    expect(mounted.host.raised).to.have.length(0);
    mounted.time.advance(2 * MINUTE);
    mounted.cupTimers.fire();
    await mounted.cup.updateComplete;
    expect(mounted.host.raised).to.have.length(1);
    expect(mounted.host.raised[0].options.data?.kind).to.equal('soon');
  });

  it('waits for the tab to be visible, and reminds when the user comes back to it', async () => {
    visibility = 'hidden';
    const mounted = await mount(live());
    expect(mounted.cup.hidden, 'the cup still shows in a hidden tab').to.equal(false);
    expect(mounted.host.raised, 'but a hidden tab raises nothing').to.have.length(0);
    await tickAndPoll(mounted);
    expect(mounted.host.raised, 'not on a tick either').to.have.length(0);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await mounted.cup.updateComplete;
    expect(mounted.host.raised, 'raised on coming back').to.have.length(1);
    expect(mounted.host.raised[0].options.data?.kind).to.equal('live');
  });

  it('raises "live" once when the data goes from offline to online with a live episode', async () => {
    let data = offline();
    const time = clock();
    const storeTimers = timers(time);
    const store = testStore(async () => feedOf(data, time.now()), storeTimers);
    const mounted = await mount(data, { store, time, storeTimers });
    expect(mounted.cup.hidden, 'hidden while offline').to.equal(true);
    expect(mounted.host.raised).to.have.length(0);

    data = live();
    await tickAndPoll(mounted);
    expect(mounted.cup.hidden).to.equal(false);
    expect(mounted.host.raised).to.have.length(1);
    expect(mounted.host.raised[0].options.data?.kind).to.equal('live');

    await tickAndPoll(mounted);
    expect(mounted.host.raised, 'not again on the next poll').to.have.length(1);
  });

  /*
   * The owner (2026-10-11) saw "starts soon" still up under "is live", for one show. Once it is live,
   * "soon" is out of date, so raising "live" closes it, and the desktop's toast goes with it.
   */
  it('closes "soon" when it raises "live"', async () => {
    const soonData = upcoming({ current: { ...upcoming().current!, scheduledStart: new Date(T0 + 5 * MINUTE).toISOString() } });
    let data = soonData;
    const time = clock();
    const storeTimers = timers(time);
    const store = testStore(async () => feedOf(data, time.now()), storeTimers);
    const mounted = await mount(data, { store, time, storeTimers });
    expect(mounted.host.raised.map((r) => r.options.data?.kind)).to.deep.equal(['soon']);
    expect(mounted.host.raised[0].closed ?? false).to.equal(false);

    data = live();
    await tickAndPoll(mounted);
    expect(mounted.host.raised.map((r) => r.options.data?.kind)).to.deep.equal(['soon', 'live']);
    expect(mounted.host.raised[0].closed, '"soon" closed once live').to.equal(true);
    expect(mounted.host.raised[1].closed ?? false, '"live" stays').to.equal(false);
  });

  it('keeps working, and reminds once, when storage is blocked', async () => {
    const blocked: ReminderStorageSource = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    const mounted = await mount(live(), { reminders: blocked });
    expect(mounted.cup.hidden).to.equal(false);
    expect(mounted.host.raised).to.have.length(1);
    await tickAndPoll(mounted);
    await tickAndPoll(mounted);
    expect(mounted.host.raised, 'not once a tick for want of a record').to.have.length(1);
  });
});

describe('the store', () => {
  it('stops listening and ticking when it leaves the tray', async () => {
    const { storeTimers, cupTimers, host } = await mount(answer());
    expect(storeTimers.count, 'polling while in the tray').to.equal(1);
    expect(cupTimers.count, 'and ticking').to.equal(1);
    host.remove();
    expect(storeTimers.count, 'and neither after').to.equal(0);
    expect(cupTimers.count).to.equal(0);
  });
});
