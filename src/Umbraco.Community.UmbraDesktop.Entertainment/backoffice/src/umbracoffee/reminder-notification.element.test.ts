import { expect } from '@open-wc/testing';
import './reminder-notification.element.js';
import en from '../localization/en.js';
import { UMBRACOFFEE_APP_ALIAS, UMBRACOFFEE_REMINDER_ICON_SIZE, UMBRACOFFEE_TRAY_ALIAS } from './constants.js';
import type { UmbraCoffeeReminderNotificationElement } from './reminder-notification.element.js';
import { removeBoxes, sizedBox, type TestDesktopHostElement } from './test-support.js';

/**
 * The reminder, tested as the desktop toast draws it: created inside the desktop (here a stand-in
 * that records what the tray context is asked), given a JSON copy of the data the cup raised, and a
 * handler with the five members the toast hands a notification's element. What is asserted is what
 * it says and what its two buttons do.
 */

/** The strings the reminder falls back to, which are the English dictionary's. */
const STRINGS = en.umbraDesktopEntertainment;

/** The moment every case's clock reads, so the countdown is worked out from a known "now". */
const NOW = Date.parse('2026-10-30T11:24:48Z');

/** What the cup raises a "soon" reminder with: starting 5 minutes 12 seconds after {@link NOW}. */
const SOON = {
  headline: 'Put the kettle on, umbraCoffee starts soon',
  message: 'October. Starts at 11:30',
  kind: 'soon',
  videoId: 'v1',
  title: 'October',
  startsAt: '2026-10-30T11:30:00Z',
};

/** What the cup raises a "live" reminder with. */
const LIVE = { headline: 'Grab a cuppa, umbraCoffee is live!', message: 'October', kind: 'live', videoId: 'v1', title: 'October' };

afterEach(removeBoxes);

/**
 * Draw the reminder in a desktop stand-in, the way the desktop toast does: `notificationHandler` set
 * once when the element is made, `data` set as a fresh JSON copy.
 * @param data What the notification was raised with.
 * @param host What to draw it in: a desktop stand-in unless the case is about being outside one.
 * @param now The clock the countdown reads; a fixed {@link NOW} unless the case moves it.
 * @returns The reminder, the stand-in, and how many times the handler's `close()` was called.
 */
async function mount(
  data: unknown = SOON,
  host: HTMLElement = document.createElement('umbracoffee-test-desktop-host'),
  now: () => number = () => NOW,
) {
  sizedBox({ w: 360, h: 200 }, host);
  const closes = { count: 0 };
  const element = document.createElement('umbracoffee-reminder-notification');
  Object.assign(element, {
    now,
    notificationHandler: {
      key: 'n1',
      color: 'default',
      duration: 60_000,
      close: () => void closes.count++,
      onClose: () => new Promise<void>(() => {}),
    },
  });
  Object.assign(element, { data: JSON.parse(JSON.stringify(data)) });
  host.appendChild(element);
  await element.updateComplete;
  return { element, host, closes };
}

/**
 * One node's text, whitespace collapsed.
 * @param element The reminder.
 * @param selector What to read.
 * @returns The text, or undefined when the node is not there.
 */
function textOf(element: UmbraCoffeeReminderNotificationElement, selector: string): string | undefined {
  return element.shadowRoot?.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
}

/**
 * The reminder's buttons, in order.
 * @param element The reminder.
 * @returns The buttons.
 */
function buttons(element: UmbraCoffeeReminderNotificationElement): HTMLButtonElement[] {
  return [...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
}

/*
 * The owner (2026-10-11) chose a compact, cheerful reminder that says where it comes from: a small
 * "umbraCoffee" over the show's own voice, the coffee cup in a badge (plain before it starts, steaming
 * once live), the episode, and a countdown clock that ticks until the start. The history keeps the
 * plain headline and message; the toast draws its own words.
 */
it('says it is umbraCoffee, puts the kettle on, names the episode and counts down to the start', async () => {
  const { element } = await mount();
  expect(textOf(element, '.kicker')).to.equal(STRINGS.umbraCoffee);
  expect(textOf(element, '.lead')).to.equal(STRINGS.umbraCoffeeToastSoon);
  expect(textOf(element, '.title')).to.equal('October');
  expect(textOf(element, '.clock b')).to.equal('5:12');
  expect(element.shadowRoot!.querySelector('.steam') === null, 'no steam before it starts').to.equal(true);
  expect(element.shadowRoot!.querySelector('.badge svg')!.getBoundingClientRect().width).to.equal(UMBRACOFFEE_REMINDER_ICON_SIZE);
});

it('ticks the clock every second, and says "Starting now" once the start has passed', async () => {
  let now = NOW;
  const { element } = await mount(SOON, undefined, () => now);
  now += 2000;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await element.updateComplete;
  expect(textOf(element, '.clock b')).to.equal('5:10');
  now = Date.parse(SOON.startsAt) + 1000;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await element.updateComplete;
  expect(textOf(element, '.clock')).to.equal(STRINGS.umbraCoffeeStartingNow);
});

it('steams once live, says "On air" instead of a clock, and offers "Watch now"', async () => {
  const { element } = await mount(LIVE);
  expect(textOf(element, '.lead')).to.equal(STRINGS.umbraCoffeeToastLive);
  expect(element.shadowRoot!.querySelectorAll('.steam path').length).to.equal(3);
  expect(element.shadowRoot!.querySelector('.clock') === null).to.equal(true);
  expect(textOf(element, '.onair')).to.equal(STRINGS.umbraCoffeeOnAir);
  expect(buttons(element)[0].textContent?.trim()).to.equal(STRINGS.umbraCoffeeWatchNow);
});

it('keeps the history’s headline in the show’s own voice', () => {
  expect(STRINGS.umbraCoffeeLiveHeadline).to.match(/cuppa/i);
  expect(STRINGS.umbraCoffeeSoonHeadline).to.match(/kettle/i);
});

it('names the episode from the message when an older copy carries no title, and offers its two buttons', async () => {
  const { element } = await mount({ headline: 'h', message: 'September', kind: 'soon', videoId: 'v0' });
  expect(textOf(element, '.title')).to.equal('September');
  expect(element.shadowRoot!.querySelector('.clock') === null, 'no start, no clock').to.equal(true);
  expect(buttons(element).map((b) => b.textContent?.trim())).to.deep.equal([STRINGS.umbraCoffeeWatch, STRINGS.umbraCoffeeStopReminding]);
});

it('opens the app on Watch, and closes itself', async () => {
  const { element, host, closes } = await mount();
  buttons(element)[0].click();
  expect((host as TestDesktopHostElement).opened).to.deep.equal([UMBRACOFFEE_APP_ALIAS]);
  expect((host as TestDesktopHostElement).switched).to.deep.equal([]);
  expect(closes.count).to.equal(1);
});

it('switches the tray item off on Stop reminding me, and closes itself', async () => {
  const { element, host, closes } = await mount();
  buttons(element)[1].click();
  expect((host as TestDesktopHostElement).switched).to.deep.equal([{ alias: UMBRACOFFEE_TRAY_ALIAS, enabled: false }]);
  expect((host as TestDesktopHostElement).opened).to.deep.equal([]);
  expect(closes.count).to.equal(1);
});

it('draws the same thing when made again from the same data, as the scrollback does', async () => {
  const first = await mount();
  const second = await mount();
  const isSame = first.element === second.element;
  expect(isSame, 'two elements').to.equal(false);
  expect(second.element.shadowRoot?.textContent?.replace(/\s+/g, ' ')).to.equal(
    first.element.shadowRoot?.textContent?.replace(/\s+/g, ' '),
  );
  buttons(second.element)[0].click();
  expect((second.host as TestDesktopHostElement).opened, 'and the second works as the first did').to.deep.equal([UMBRACOFFEE_APP_ALIAS]);
});

it('still offers both buttons over data it cannot read', async () => {
  const { element, closes } = await mount({ headline: 42, title: {} });
  expect(textOf(element, '.title')).to.equal('');
  expect(buttons(element)).to.have.length(2);
  buttons(element)[0].click();
  expect(closes.count).to.equal(1);
});

it('shows only its text outside the desktop, where its buttons would do nothing', async () => {
  // Outside the desktop nothing provides the tray context: a Stop reminding me that switched nothing
  // off would leave the user believing the reminders had stopped.
  const { element } = await mount(SOON, document.createElement('div'));
  expect(textOf(element, '.lead')).to.equal(STRINGS.umbraCoffeeToastSoon);
  expect(textOf(element, '.title')).to.equal(SOON.title);
  expect(buttons(element)).to.have.length(0);
});
