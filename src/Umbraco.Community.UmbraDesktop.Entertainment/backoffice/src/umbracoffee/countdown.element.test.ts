import { expect } from '@open-wc/testing';
import './countdown.element.js';
import en from '../localization/en.js';
import { splitRemaining } from './countdown.element.js';
import { MINUTE, removeBoxes, sizedBox } from './test-support.js';
import type { UmbraCoffeeCountdownElement } from './countdown.element.js';

/** The strings the countdown falls back to, which are the English dictionary's. */
const STRINGS = en.umbraDesktopEntertainment;

afterEach(removeBoxes);

/** One hour, in ms, for the table below. */
const HOUR = 60 * MINUTE;

/** One day, in ms, for the table below. */
const DAY = 24 * HOUR;

describe('splitRemaining', () => {
  const table: Array<[string, number, { days: number; hours: number; minutes: number }]> = [
    ['nothing left', 0, { days: 0, hours: 0, minutes: 0 }],
    ['past the start', -5 * MINUTE, { days: 0, hours: 0, minutes: 0 }],
    ['59 seconds reads one minute, never zero', 59_000, { days: 0, hours: 0, minutes: 1 }],
    ['exactly a minute', MINUTE, { days: 0, hours: 0, minutes: 1 }],
    ['a millisecond over a minute rounds up to two', MINUTE + 1, { days: 0, hours: 0, minutes: 2 }],
    ['61 minutes', 61 * MINUTE, { days: 0, hours: 1, minutes: 1 }],
    ['26 hours', 26 * HOUR, { days: 1, hours: 2, minutes: 0 }],
    ['3 days 4 hours 5 minutes', 3 * DAY + 4 * HOUR + 5 * MINUTE, { days: 3, hours: 4, minutes: 5 }],
  ];
  for (const [name, ms, expected] of table) {
    it(`splits ${name}`, () => {
      expect(splitRemaining(ms)).to.deep.equal(expected);
    });
  }
});

/**
 * Mount the countdown in a box.
 * @param remaining Milliseconds to the start.
 * @returns The element, after its first render.
 */
async function mount(remaining: number): Promise<UmbraCoffeeCountdownElement> {
  const element = document.createElement('umbracoffee-countdown');
  element.remaining = remaining;
  sizedBox({ w: 400, h: 200 }).appendChild(element);
  await element.updateComplete;
  return element;
}

/**
 * The number and label in one block.
 * @param element The countdown.
 * @param unit Which block.
 * @returns Its two texts.
 */
function block(element: UmbraCoffeeCountdownElement, unit: 'days' | 'hours' | 'minutes') {
  const node = element.shadowRoot?.querySelector(`[data-unit="${unit}"]`);
  return { number: node?.querySelector('b')?.textContent?.trim(), label: node?.querySelector('span')?.textContent?.trim() };
}

describe('the countdown element', () => {
  it('draws days, hours and minutes, the two smaller ones padded to two digits', async () => {
    const element = await mount(2 * DAY + 4 * HOUR + 17 * MINUTE);
    expect(block(element, 'days')).to.deep.equal({ number: '2', label: STRINGS.umbraCoffeeDays });
    expect(block(element, 'hours')).to.deep.equal({ number: '04', label: STRINGS.umbraCoffeeHours });
    expect(block(element, 'minutes')).to.deep.equal({ number: '17', label: STRINGS.umbraCoffeeMinutes });
  });

  it('keeps all three blocks when the days are zero, since a block that comes and goes is a jump', async () => {
    const element = await mount(25 * MINUTE);
    expect(block(element, 'days').number).to.equal('0');
    expect(block(element, 'hours').number).to.equal('00');
    expect(block(element, 'minutes').number).to.equal('25');
  });

  it('follows a new remaining time', async () => {
    const element = await mount(25 * MINUTE);
    element.remaining = 20 * MINUTE;
    await element.updateComplete;
    expect(block(element, 'minutes').number).to.equal('20');
  });

  it('is a timer without a live region: a screen reader must not announce every minute over the stream', async () => {
    const element = await mount(25 * MINUTE);
    const group = element.shadowRoot?.querySelector('[role="timer"]');
    expect(group === null, 'the group is a timer').to.equal(false);
    expect(group?.getAttribute('aria-live') ?? 'off').to.equal('off');
    expect(group?.getAttribute('aria-label')).to.contain('25');
  });
});
