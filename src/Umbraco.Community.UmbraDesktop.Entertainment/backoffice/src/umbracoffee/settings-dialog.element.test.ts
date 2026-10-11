import { expect } from '@open-wc/testing';
import './settings-dialog.element.js';
import en from '../localization/en.js';
import { removeBoxes, sizedBox } from './test-support.js';
import type { UmbraCoffeeSettingsDialogElement } from './settings-dialog.element.js';

/** The strings the dialog falls back to, which are the English dictionary's. */
const STRINGS = en.umbraDesktopEntertainment;

afterEach(removeBoxes);

/**
 * Mount the dialog over a box the size of a window's content, as the window lays it over its own.
 * @param over Properties to set before it renders.
 * @returns The dialog after its first render, and every event it raised.
 */
async function mount(over: Partial<UmbraCoffeeSettingsDialogElement> = {}) {
  const element = document.createElement('umbracoffee-settings');
  Object.assign(element, over);
  const heard: string[] = [];
  element.addEventListener('umbracoffee-settings-close', () => heard.push('close'));
  element.addEventListener('umbracoffee-remind-toggle', () => heard.push('toggle'));
  const box = sizedBox({ w: 1008, h: 665 });
  box.style.position = 'relative';
  box.appendChild(element);
  await element.updateComplete;
  return { element, heard, box };
}

/**
 * One node in the dialog.
 * @param element The dialog.
 * @param selector What to find.
 * @returns The node.
 */
const part = <T extends HTMLElement = HTMLElement>(element: UmbraCoffeeSettingsDialogElement, selector: string) =>
  element.shadowRoot!.querySelector<T>(selector)!;

/**
 * Whether a node is there, compared as a boolean so a failing case cannot hang the runner.
 * @param element The dialog.
 * @param selector What to look for.
 * @returns True when it is.
 */
const has = (element: UmbraCoffeeSettingsDialogElement, selector: string) => element.shadowRoot!.querySelector(selector) !== null;

/**
 * Collapsed text of a node.
 * @param element The dialog.
 * @param selector What to read.
 * @returns The text.
 */
const text = (element: UmbraCoffeeSettingsDialogElement, selector: string) =>
  part(element, selector).textContent!.replace(/\s+/g, ' ').trim();

describe('the umbraCoffee settings dialog', () => {
  it('is a modal dialog over the window, titled Settings, in Solitaire’s pattern', async () => {
    const { element, box } = await mount();
    const dialog = part(element, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).to.equal('true');
    expect(text(element, '#title')).to.equal(STRINGS.umbraCoffeeSettings);
    expect(dialog.getAttribute('aria-labelledby')).to.equal('title');
    const scrim = part(element, '.scrim').getBoundingClientRect();
    const outer = box.getBoundingClientRect();
    expect([scrim.left, scrim.top, scrim.width, scrim.height], 'the scrim covers the window content, not the page').to.deep.equal([
      outer.left,
      outer.top,
      outer.width,
      outer.height,
    ]);
    expect(part(element, '.x').getAttribute('aria-label')).to.equal(STRINGS.umbraCoffeeClose);
    expect(text(element, '.done')).to.equal(STRINGS.umbraCoffeeDone);
  });

  it('has a Reminders box with the Remind me switch and what it does', async () => {
    const { element } = await mount({ remind: true });
    expect(text(element, 'section h3')).to.equal(STRINGS.umbraCoffeeReminders);
    const toggle = part<HTMLButtonElement>(element, '[role="switch"]');
    expect(toggle.getAttribute('aria-checked')).to.equal('true');
    expect(text(element, '.setting b')).to.equal(STRINGS.umbraCoffeeRemindMe);
    expect(text(element, '.setting p')).to.equal(STRINGS.umbraCoffeeRemindAbout);
    expect(toggle.getAttribute('aria-labelledby')).to.equal('remind-label');
  });

  it('shows the switch off when reminders are off', async () => {
    const { element } = await mount({ remind: false });
    expect(part(element, '[role="switch"]').getAttribute('aria-checked')).to.equal('false');
  });

  it('asks the window to flip the switch, and leaves the state to the window', async () => {
    const { element, heard } = await mount({ remind: true });
    part(element, '[role="switch"]').click();
    await element.updateComplete;
    expect(heard).to.deep.equal(['toggle']);
    expect(part(element, '[role="switch"]').getAttribute('aria-checked'), 'until the window says otherwise').to.equal('true');
  });

  it('draws the switch disabled with the reason under it, never hidden, when it cannot act', async () => {
    const reason = 'Can’t reach the feed.';
    const { element, heard } = await mount({ remind: false, reason });
    const toggle = part<HTMLButtonElement>(element, '[role="switch"]');
    expect(toggle.disabled).to.equal(true);
    expect(text(element, '.reason')).to.equal(reason);
    expect(toggle.getAttribute('aria-describedby')).to.contain('remind-why');
    expect(part(element, '.setting').classList.contains('is-disabled')).to.equal(true);
    toggle.click();
    expect(heard, 'a disabled switch asks nothing').to.deep.equal([]);
  });

  it('draws no reason while the switch works', async () => {
    const { element } = await mount({ remind: true });
    expect(has(element, '.reason')).to.equal(false);
    expect(part<HTMLButtonElement>(element, '[role="switch"]').disabled).to.equal(false);
  });

  it('closes on Done, on the close button, on Escape and on the scrim, but not on the panel', async () => {
    const { element, heard } = await mount();
    part(element, '.done').click();
    part(element, '.x').click();
    part(element, '[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    part(element, '.scrim').click();
    part(element, '[role="dialog"]').click();
    expect(heard).to.deep.equal(['close', 'close', 'close', 'close']);
  });

  it('keeps Escape to itself, so it does not reach the desktop', async () => {
    const { element, box } = await mount();
    let reached = 0;
    box.addEventListener('keydown', () => reached++);
    part(element, '[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(reached).to.equal(0);
  });

  it('puts focus inside when it opens, and wraps Tab at both ends', async () => {
    const { element } = await mount();
    const root = element.shadowRoot!;
    expect(root.activeElement?.classList.contains('x'), 'the first control has focus').to.equal(true);
    const dialog = part(element, '[role="dialog"]');
    const first = part(element, '.x');
    const last = part(element, '.done');
    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true });
    dialog.dispatchEvent(forward);
    expect(forward.defaultPrevented).to.equal(true);
    expect(root.activeElement === first).to.equal(true);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true, cancelable: true });
    dialog.dispatchEvent(back);
    expect(root.activeElement === last).to.equal(true);
  });

  it('reflects the theme it is given, so its theme blocks can match', async () => {
    const { element } = await mount({ theme: 'win98' });
    expect(element.getAttribute('data-umbradesktop-theme')).to.equal('win98');
  });

  it('changes no size under any theme', async () => {
    const { element } = await mount({ reason: 'Can’t reach the feed.' });
    const sizes = () =>
      ['.panel', 'section', '[role="switch"]', '.done', '.x', '.reason'].map((selector) => {
        const box = part(element, selector).getBoundingClientRect();
        return `${selector} ${box.width}x${box.height}`;
      });
    const plain = sizes();
    for (const theme of ['umbraco', 'umbraco4', 'macos', 'win11', 'win98']) {
      element.theme = theme;
      await element.updateComplete;
      expect(sizes(), theme).to.deep.equal(plain);
    }
  });
});
