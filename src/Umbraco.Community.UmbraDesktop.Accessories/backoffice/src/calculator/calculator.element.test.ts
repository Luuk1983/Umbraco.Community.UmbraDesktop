import { expect, fixture, html } from '@open-wc/testing';
import './calculator.element.js';
import { CALCULATOR_KEYPAD } from './constants.js';
import type { CalculatorElement } from './calculator.element.js';

/**
 * What a person can do with the calculator through its face and their keyboard.
 *
 * The arithmetic has its own coverage in `engine.test.ts` and is not repeated here. These cases are
 * about the wiring: that a key on the pad presses that key, that the keyboard reaches the same
 * engine, and that the display shows what the engine says.
 */

/** A mounted calculator, after its first render. */
async function calculator(): Promise<CalculatorElement> {
  return await fixture<CalculatorElement>(html`<umbradesktop-calculator></umbradesktop-calculator>`);
}

/** Click the pad key for `key`. */
async function click(element: CalculatorElement, key: string): Promise<void> {
  const button = element.shadowRoot!.querySelector<HTMLButtonElement>(`[data-key="${key}"]`);
  expect(button, `a key on the pad for ${key}`).to.not.equal(null);
  button!.click();
  await element.updateComplete;
}

/** Type `key` on the keyboard, with the calculator focused. */
async function type(element: CalculatorElement, key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
  element.dispatchEvent(event);
  await element.updateComplete;
  return event;
}

/** The main display's text. */
function display(element: CalculatorElement): string {
  return (element.shadowRoot!.querySelector('.display')?.textContent ?? '').trim();
}

it('draws every key the keypad declares, once', async () => {
  const element = await calculator();
  const keys = [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-key]')].map(
    (button) => button.dataset.key,
  );
  expect(keys).to.deep.equal(CALCULATOR_KEYPAD.flat());
});

it('does a sum from the pad', async () => {
  const element = await calculator();
  for (const key of ['2', '+', '3', '=']) await click(element, key);
  expect(display(element)).to.equal('5');
});

it('does a sum from the keyboard, with Enter as equals and Escape as clear', async () => {
  const element = await calculator();
  for (const key of ['7', '*', '6']) await type(element, key);
  await type(element, 'Enter');
  expect(display(element)).to.equal('42');
  await type(element, 'Escape');
  expect(display(element)).to.equal('0');
});

/**
 * A key the calculator used is consumed, so Enter does not also activate whichever button last had
 * focus and `/` does not open the browser's quick find. A key it does not know is left alone, so the
 * window's own shortcuts and the browser's still work.
 */
it('claims the keys it uses and leaves the rest alone', async () => {
  const element = await calculator();
  expect((await type(element, '5')).defaultPrevented, 'a digit').to.equal(true);
  expect((await type(element, 'Enter')).defaultPrevented, 'equals').to.equal(true);
  expect((await type(element, 'F5')).defaultPrevented, 'a key that is not the calculator’s').to.equal(
    false,
  );
});

it('says why it will not divide by zero', async () => {
  const element = await calculator();
  for (const key of ['5', '/', '0', '=']) await click(element, key);
  expect(display(element)).to.equal('Cannot divide by zero');
});

it('announces the display to a screen reader as it changes', async () => {
  const element = await calculator();
  const live = element.shadowRoot!.querySelector('.display');
  expect(live?.getAttribute('aria-live')).to.equal('polite');
});

/**
 * Open it and type: the keyboard reaches the calculator without clicking it first.
 *
 * It did not. The desktop brings a window to the front but moves no keyboard focus into the app,
 * so nothing in a newly opened Calculator had focus and typed keys went nowhere until one of its
 * buttons had been clicked. The case above sends its keys straight to the element, which is why it
 * passed; this one sends them to whatever has focus, which is what a keyboard does.
 */
it('takes the keyboard as soon as it opens', async () => {
  const element = await calculator();
  const focused = () => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  };
  expect(focused(), 'something in the calculator has focus').to.not.equal(document.body);
  for (const key of ['7', '*', '6', 'Enter']) {
    focused()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
    await element.updateComplete;
  }
  expect(display(element)).to.equal('42');
});
