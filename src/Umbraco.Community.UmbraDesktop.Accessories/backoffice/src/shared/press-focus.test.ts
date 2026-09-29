import { expect, fixture, html } from '@open-wc/testing';
import { sendMouse } from '@web/test-runner-commands';
import '../calculator/calculator.element.js';
import '../character-map/character-map.element.js';
import '../disk-cleanup/disk-cleanup.element.js';
import '../notepad/notepad.element.js';
import '../paint/paint.element.js';
import '../screensaver/screensaver-panel.element.js';
import '../sticky-notes/sticky-notes.element.js';
import '../system-info/system-info.element.js';
import { PRESSED_FOCUS, keepFocusOnPress } from './press-focus.js';

/**
 * Every app's buttons keep keyboard focus where it was when the mouse presses them.
 *
 * The browser half of this, that a cancelled mousedown is what stops Chrome's ring appearing on a
 * clicked button, is proven with real input in the System Info, Calculator and Notepad tests. This
 * file is the other half: that every app is wired to it, so a new button in any of them is covered
 * without anyone remembering to.
 */

/** Every accessory element with buttons in it. Clock has none. */
const TAGS = [
  'umbradesktop-calculator',
  'umbradesktop-character-map',
  'umbradesktop-disk-cleanup',
  'umbradesktop-notepad',
  'umbradesktop-paint',
  'umbradesktop-screensaver-panel',
  'umbradesktop-sticky-notes',
  'umbradesktop-system-info',
];

/**
 * Press the mouse on `target` without the browser's own input. A dispatched event reaches a
 * disabled button too, which is what lets this cover the apps whose buttons stay disabled until
 * their data loads.
 * @param target Where the press lands.
 * @returns Whether anything cancelled its default.
 */
function mousedown(target: Element): boolean {
  const event = new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

for (const tag of TAGS) {
  it(`${tag} keeps focus off a button the mouse presses`, async () => {
    const wrapper = await fixture<HTMLDivElement>(html`<div style="width: 800px; height: 600px"></div>`);
    const element = document.createElement(tag) as HTMLElement & { updateComplete: Promise<unknown> };
    wrapper.appendChild(element);
    await element.updateComplete;
    const buttons = [...element.shadowRoot!.querySelectorAll('button')].filter((button) => !button.draggable);
    expect(buttons.length, 'buttons to press').to.be.greaterThan(0);
    for (const button of buttons) {
      expect(mousedown(button), `a press on ${button.outerHTML.slice(0, 80)}`).to.equal(true);
    }
  });
}

it('leaves a press on something that is not a button alone', async () => {
  const host = await fixture<HTMLDivElement>(html`<div><span>text</span><select><option>a</option></select></div>`);
  host.addEventListener('mousedown', keepFocusOnPress);
  expect(mousedown(host.querySelector('span')!)).to.equal(false);
  expect(mousedown(host.querySelector('select')!), 'a select opens on mousedown').to.equal(false);
});

it('leaves a draggable button alone, since a cancelled mousedown never starts a drag', async () => {
  const host = await fixture<HTMLDivElement>(html`<div><button draggable="true">⠿</button><button>plain</button></div>`);
  host.addEventListener('mousedown', keepFocusOnPress);
  const [draggable, plain] = host.querySelectorAll('button');
  expect(mousedown(draggable)).to.equal(false);
  expect(mousedown(plain)).to.equal(true);
});

it('covers what is inside a button, such as its icon', async () => {
  const host = await fixture<HTMLDivElement>(html`<div><button><svg><path d="M0 0"></path></svg></button></div>`);
  host.addEventListener('mousedown', keepFocusOnPress);
  expect(mousedown(host.querySelector('path')!)).to.equal(true);
});

it('marks a select the mouse pressed until it loses focus, and still lets it open', async () => {
  const host = await fixture<HTMLDivElement>(html`<div><select><option>a</option></select></div>`);
  host.addEventListener('mousedown', keepFocusOnPress);
  const select = host.querySelector('select')!;
  select.focus();
  expect(mousedown(select), 'a select opens on mousedown').to.equal(false);
  expect(select.hasAttribute(PRESSED_FOCUS)).to.equal(true);
  select.blur();
  expect(select.hasAttribute(PRESSED_FOCUS), 'unmarked once focus leaves').to.equal(false);
});

/**
 * A text field or text area clicked with the mouse draws no ring, in every app that has one.
 *
 * Chrome rings a field however it was focused, because typing into it is keyboard use. On this
 * desktop that put the accent ring round Notepad's page, its name box, Paint's name box and Character
 * Map's fields the moment they were clicked, which nothing in the desktop's own chrome does. The
 * accent is set because the test has no palette, and without it the ring's colour is invalid and the
 * outline computes to none whatever the state. Real mouse, since only the browser's own input takes
 * this path; Sticky Notes has its own rule, and fields only once a note exists.
 */
for (const tag of ['umbradesktop-notepad', 'umbradesktop-paint', 'umbradesktop-character-map']) {
  it(`${tag} draws no ring round a field the mouse clicks`, async () => {
    const wrapper = await fixture<HTMLDivElement>(html`<div style="width: 800px; height: 600px"></div>`);
    const element = document.createElement(tag) as HTMLElement & { updateComplete: Promise<unknown> };
    element.style.setProperty('--umbradesktop-app-accent', 'rgb(0, 0, 128)');
    wrapper.appendChild(element);
    await element.updateComplete;
    const fields = [...element.shadowRoot!.querySelectorAll<HTMLElement>('textarea, input:not([type="checkbox"])')].filter(
      (field) => field.getBoundingClientRect().width > 0,
    );
    expect(fields.length, 'fields to click').to.be.greaterThan(0);
    for (const field of fields) {
      const box = field.getBoundingClientRect();
      await sendMouse({ type: 'click', position: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] });
      const name = field.outerHTML.slice(0, 60);
      expect(field.matches(':focus'), `${name} took focus`).to.equal(true);
      expect(getComputedStyle(field).outlineStyle, `a ring round ${name}`).to.equal('none');
    }
  });
}
