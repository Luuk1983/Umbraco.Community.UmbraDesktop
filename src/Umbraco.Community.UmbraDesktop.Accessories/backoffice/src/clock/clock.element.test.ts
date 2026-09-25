import { expect, fixture, html } from '@open-wc/testing';
import './clock.element.js';
import { handAngles } from './hands.js';
import type { ClockElement } from './clock.element.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/** Twenty past ten and eight seconds, on a date whose weekday is known. */
const MOMENT = new Date(2026, 8, 24, 10, 20, 8);

/**
 * A mounted clock, frozen at `moment`.
 * @param moment What `now` returns.
 */
async function clock(moment: Date = MOMENT): Promise<ClockElement> {
  return await fixture<ClockElement>(html`<umbradesktop-clock .now=${() => moment}></umbradesktop-clock>`);
}

/** The rotation a hand is drawn at, read back off its transform. */
function rotation(element: ClockElement, hand: string): number {
  const transform = element.shadowRoot!.querySelector(`.hand-${hand}`)?.getAttribute('transform') ?? '';
  return Number(/rotate\(([-\d.]+)/.exec(transform)?.[1]);
}

it('sets the hands to the time', async () => {
  const element = await clock();
  const expected = handAngles(MOMENT);
  expect(rotation(element, 'hour')).to.be.closeTo(expected.hour, 1e-6);
  expect(rotation(element, 'minute')).to.be.closeTo(expected.minute, 1e-6);
  expect(rotation(element, 'second')).to.be.closeTo(expected.second, 1e-6);
});

it('shows the time and the date in words as well as on the face', async () => {
  const element = await clock();
  const time = element.shadowRoot!.querySelector('.time')?.textContent ?? '';
  const date = element.shadowRoot!.querySelector('.date')?.textContent ?? '';
  expect(time).to.contain('10').and.to.contain('20').and.to.contain('08');
  expect(date).to.contain('24').and.to.contain('2026');
});

/**
 * The face is decoration to a screen reader, and the digital line says the same thing in a form one
 * can read. Announcing the face would be a picture described every second.
 */
it('hides the face from assistive technology and names it instead', async () => {
  const element = await clock();
  const face = element.shadowRoot!.querySelector('svg');
  expect(face?.getAttribute('aria-hidden')).to.equal('true');
});

it('moves on when the time does', async () => {
  let moment = MOMENT;
  const element = await fixture<ClockElement>(
    html`<umbradesktop-clock .now=${() => moment}></umbradesktop-clock>`,
  );
  moment = new Date(2026, 8, 24, 10, 20, 9);
  element.tick();
  await element.updateComplete;
  expect(rotation(element, 'second')).to.be.closeTo(54, 1e-6);
});

/**
 * Closing the window removes the element, and a timer left running would tick against a detached
 * face for as long as the backoffice tab lives.
 */
it('stops its timer when the window closes', async () => {
  const element = await clock();
  expect(element.running, 'ticking while open').to.equal(true);
  element.remove();
  expect(element.running, 'and not once closed').to.equal(false);
});

/**
 * Inside the desktop the time and date come from the desktop's own formatting, so they follow the
 * same culture and 12/24 hour setting as the taskbar clock and change when the user changes them.
 * `docs/desktop-apps.md` §7.1 is the contract; this is a stand-in for the desktop's context.
 */
describe('inside the desktop', () => {
  /** What each case mounted, removed after it. */
  let after: Array<() => void> = [];
  afterEach(() => {
    for (const undo of after) undo();
    after = [];
  });

  /**
   * A clock under a stand-in for the desktop's settings context.
   * @param cycle The hour setting the stand-in starts on.
   */
  async function inDesktop(cycle = 'h23') {
    const settings = new UmbObjectState({ hourCycle: cycle });
    // Built by hand, not with fixture(), which waits for an animation frame a background tab never
    // gets when the whole suite runs at once.
    const host = document.createElement('div');
    const desktop = {
      // Umbraco's context consumer asks a provided instance for its host, as every real context
      // (the desktop's included) can answer; a plain object without this is not found at all.
      getHostElement: () => host,
      locale: settings.asObservable(),
      formatDateTime: (date: Date, options: Intl.DateTimeFormatOptions) =>
        `${options.hour ? 'time' : 'date'} ${settings.getValue().hourCycle} ${date.getSeconds()}`,
    };
    document.body.appendChild(host);
    after.push(() => host.remove());
    new UmbContextProvider(host, 'UmbraDesktopSettingsContext', desktop).hostConnected();
    const element = document.createElement('umbradesktop-clock') as ClockElement;
    element.now = () => MOMENT;
    host.appendChild(element);
    await element.updateComplete;
    await element.updateComplete;
    return { element, settings };
  }

  const read = (element: ClockElement, selector: string) =>
    (element.shadowRoot!.querySelector(selector)?.textContent ?? '').trim();

  it('shows the time and the date as the desktop formats them', async () => {
    const { element } = await inDesktop();
    expect(read(element, '.time')).to.equal('time h23 8');
    expect(read(element, '.date')).to.equal('date h23 8');
  });

  it('follows the desktop when its clock setting changes', async () => {
    const { element, settings } = await inDesktop('h23');
    settings.setValue({ hourCycle: 'h12' });
    await element.updateComplete;
    expect(read(element, '.time')).to.equal('time h12 8');
  });
});
