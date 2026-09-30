import { expect, fixture, html } from '@open-wc/testing';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import './screensaver-panel.element.js';
import type { ScreensaverPanelElement } from './screensaver-panel.element.js';
import { SCREENSAVER_WINDOW } from './constants.js';
import { fixedSettings } from '../settings/settings.source.js';
import type { AccessoriesScreensaverSettings } from '../settings/settings.js';

/**
 * The Screen Saver window: Windows 98's Screen Saver tab, with a monitor that runs the chosen saver, a list with (None) at the
 * top, a wait in minutes and a Preview button.
 */

/**
 * A mounted panel over settings the test controls.
 * @param screensaver The starting screensaver settings.
 * @returns The element and its settings.
 */
async function panel(screensaver: Partial<AccessoriesScreensaverSettings> = {}) {
  const settings = fixedSettings({ screensaver: { enabled: true, saver: 'starfield', waitMinutes: 10, ...screensaver } });
  const element = await fixture<ScreensaverPanelElement>(
    html`<umbradesktop-screensaver-panel .source=${settings}></umbradesktop-screensaver-panel>`,
  );
  return { element, settings };
}

/** A field by its name. */
function field(element: ScreensaverPanelElement, name: 'saver' | 'wait'): HTMLSelectElement {
  return element.shadowRoot!.querySelector<HTMLSelectElement>(`[data-field="${name}"]`)!;
}

/** Choose an option in a field, as a person does. */
async function choose(element: ScreensaverPanelElement, name: 'saver' | 'wait', value: string): Promise<void> {
  const select = field(element, name);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await element.updateComplete;
}

/** The screensaver running in the monitor, if any. */
function monitor(element: ScreensaverPanelElement) {
  return element.shadowRoot!.querySelector('.screen umbradesktop-screensaver');
}

/** The full-screen screensaver, if one is up. */
const fullScreen = () => document.body.querySelector(':scope > umbradesktop-screensaver:not([preview])');

afterEach(() => fullScreen()?.remove());

it('shows the chosen saver and wait', async () => {
  const { element } = await panel({ saver: 'mystify', waitMinutes: 5 });
  expect([field(element, 'saver').value, field(element, 'wait').value]).to.deep.equal(['mystify', '5']);
});

it('runs the chosen saver in the monitor, as a preview, at the monitor’s size', async () => {
  const { element } = await panel({ saver: 'flying' });
  const running = monitor(element)!;
  expect([running.getAttribute('saver'), running.hasAttribute('preview')]).to.deep.equal(['flying', true]);
  const box = running.getBoundingClientRect();
  expect([box.width, box.height]).to.deep.equal([SCREENSAVER_WINDOW.screen.w, SCREENSAVER_WINDOW.screen.h]);
});

it('offers every saver, and (None) first', async () => {
  const { element } = await panel();
  const options = [...field(element, 'saver').options].map((option) => option.value);
  expect(options).to.deep.equal(['none', 'starfield', 'mystify', 'flying']);
});

it('switches it on with a saver, and the monitor follows', async () => {
  const { element, settings } = await panel({ enabled: false });
  await choose(element, 'saver', 'mystify');
  expect(settings.value.screensaver).to.deep.equal({ enabled: true, saver: 'mystify', waitMinutes: 10 });
  expect(monitor(element)?.getAttribute('saver')).to.equal('mystify');
});

/** (None) is how Windows switched it off, and it keeps the saver for when it is switched back on. */
it('switches it off with (None), keeping the saver it had', async () => {
  const { element, settings } = await panel({ saver: 'mystify' });
  await choose(element, 'saver', 'none');
  expect(settings.value.screensaver).to.deep.equal({ enabled: false, saver: 'mystify', waitMinutes: 10 });
  expect(monitor(element), 'a dark monitor').to.equal(null);
  expect(field(element, 'wait').disabled).to.equal(true);
  expect(element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="preview"]')!.disabled).to.equal(true);
});

it('sets the wait', async () => {
  const { element, settings } = await panel();
  await choose(element, 'wait', '2');
  expect(settings.value.screensaver.waitMinutes).to.equal(2);
});

it('follows settings changed elsewhere, such as in the other copy of this screen', async () => {
  const { element, settings } = await panel();
  settings.set({ ...settings.value, screensaver: { enabled: true, saver: 'flying', waitMinutes: 30 } });
  await element.updateComplete;
  expect([field(element, 'saver').value, field(element, 'wait').value]).to.deep.equal(['flying', '30']);
});

it('runs the chosen saver full screen on Preview, until it is dismissed', async () => {
  const { element } = await panel({ saver: 'mystify' });
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click();
  expect(fullScreen()?.getAttribute('saver')).to.equal('mystify');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(fullScreen()).to.equal(null);
});

/**
 * A dropdown opened with the mouse draws no focus ring; one reached with Tab still does.
 *
 * Chrome gives a clicked select `:focus-visible` straight away, with no key pressed at all, unlike a
 * button. So choosing a screen saver left the accent ring round the list for as long as the window
 * kept focus. The accent is set because the test has no palette, and without it the ring's colour
 * is invalid and the outline computes to none whatever the state. Real mouse and keyboard, since
 * only the browser's own input takes this path.
 */
it('draws no ring round a dropdown opened with the mouse, and one when Tab reaches it', async () => {
  const { element } = await panel({ enabled: true });
  element.style.setProperty('--umbradesktop-app-accent', 'rgb(0, 0, 128)');
  const select = field(element, 'saver');
  const box = select.getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] });
  await sendKeys({ press: 'Escape' });
  expect(select.matches(':focus'), 'the click focused the list').to.equal(true);
  expect(getComputedStyle(select).outlineStyle, 'a ring after a click').to.equal('none');
  await sendKeys({ press: 'Tab' });
  await sendKeys({ down: 'Shift' });
  await sendKeys({ press: 'Tab' });
  await sendKeys({ up: 'Shift' });
  expect(select.matches(':focus'), 'Tab came back to the list').to.equal(true);
  expect(getComputedStyle(select).outlineStyle, "the keyboard's ring").to.equal('solid');
});

/**
 * The choice lives in the user's account now, and a save can fail. The window says so in its own
 * hint line, where the person who just made the choice is looking, rather than in a toast; and it
 * says so when what shows is only the default because the account could not be read.
 */
describe('when the account does not answer', () => {
  /**
   * A mounted panel over settings whose status the test sets.
   * @returns The element and a way to change the status.
   */
  async function failing() {
    const settings = fixedSettings({ screensaver: { enabled: true, saver: 'starfield', waitMinutes: 10 } });
    let status: 'unread' | 'unsaved' | undefined;
    const source = {
      get value() {
        return settings.value;
      },
      get status() {
        return status;
      },
      set: settings.set,
      subscribe: settings.subscribe,
    };
    const element = await fixture<ScreensaverPanelElement>(
      html`<umbradesktop-screensaver-panel .source=${source}></umbradesktop-screensaver-panel>`,
    );
    /** Change the status, and tell the window as the real store does. */
    const become = async (next: typeof status) => {
      status = next;
      settings.set(settings.value);
      await element.updateComplete;
    };
    return { element, become };
  }

  const hint = (element: ScreensaverPanelElement) => element.shadowRoot!.querySelector('.hint')!;

  it('says a choice was not saved, in the window, and takes it back when a save works', async () => {
    const { element, become } = await failing();
    await become('unsaved');
    expect(hint(element).textContent).to.contain('not saved');
    expect(hint(element).getAttribute('role')).to.equal('status');
    await become(undefined);
    expect(hint(element).textContent).to.contain('left alone');
  });

  it('says what shows is the default when the account could not be read', async () => {
    const { element, become } = await failing();
    await become('unread');
    expect(hint(element).textContent).to.contain('could not be read');
  });
});
