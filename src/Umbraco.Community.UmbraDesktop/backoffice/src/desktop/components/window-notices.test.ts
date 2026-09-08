import { expect } from '@open-wc/testing';
import './window-notices.element.js';
import type { UmbraDesktopWindowNoticesElement } from './window-notices.element.js';
import type { UmbraDesktopWindow } from '../types.js';
import { UMBRADESKTOP_NOTICE_STACK_MAX_SHARE } from '../constants.js';

/**
 * The banner stack. Design §3 and D3: severity decides where a notice appears, and `info` appears
 * as the titlebar marker only, so a window with ordinary unsaved changes must render no banner at
 * all. That is the assertion that keeps this feature from changing what today's desktop does.
 */

/**
 * A window carrying only the state the element reads.
 *
 * Built from an explicitly typed base rather than an `as UmbraDesktopWindow` cast on one literal:
 * the cast does not compile, because a literal that omits `app.chromeProfile` is assignable to
 * `UmbraDesktopWindow` in neither direction, and the test runner would never have said so — it
 * transpiles through esbuild and does not type-check.
 * @param over The flags this window carries on top of a clean one.
 * @returns The window.
 */
function win(over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  const base: UmbraDesktopWindow = {
    id: 'w1',
    app: {
      alias: 'a',
      name: 'A',
      icon: 'icon-umbraco',
      chromeProfile: 'bare',
      content: { kind: 'iframe', url: 'about:blank' },
    },
    rect: { x: 0, y: 0, w: 400, h: 300 },
    z: 1,
    active: true,
    state: 'normal',
  };
  return { ...base, ...over };
}

/**
 * Mount the element with a window and wait for its first render.
 * @param window The window to describe.
 * @returns The mounted element.
 */
async function mount(window: UmbraDesktopWindow) {
  const element = document.createElement('umbradesktop-window-notices') as UmbraDesktopWindowNoticesElement;
  element.window = window;
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

/**
 * Every banner the element drew.
 * @param element The mounted element.
 * @returns The banner elements, in the order they were drawn.
 */
const banners = (element: UmbraDesktopWindowNoticesElement) =>
  [...element.renderRoot.querySelectorAll('.notice')];

it('draws nothing for a clean window', async () => {
  const element = await mount(win());
  expect(banners(element).length).to.equal(0);
  element.remove();
});

it('draws nothing for a window with ordinary unsaved changes', async () => {
  const element = await mount(win({ dirty: true }));
  expect(banners(element).length).to.equal(0);
  element.remove();
});

it('draws a warning banner with both actions for a conflict', async () => {
  const element = await mount(win({ dirty: true, changedElsewhere: true }));
  const drawn = banners(element);
  expect(drawn.length).to.equal(1);
  expect(drawn[0].getAttribute('data-severity')).to.equal('warning');
  // `uui-button` and not a bare `button`: the actions are the backoffice's own component now, so a
  // notice's buttons look, focus and behave like every other button in Umbraco. The hand-rolled
  // bordered spans this replaced had none of that for free.
  expect(drawn[0].querySelectorAll('uui-button').length).to.equal(2);
  element.remove();
});

it('carries severity as an icon in the banner, never as a hue on its own', async () => {
  // The banner's ground is a light tint of the severity colour, so on a monochrome display, or for
  // a reader who does not read amber as danger, the icon and the leading edge are what say how bad
  // this is. A future change back to a wash with no glyph fails here.
  const warning = await mount(win({ dirty: true, changedElsewhere: true }));
  const warningIcon = warning.renderRoot.querySelector('.notice .notice-icon');
  expect(warningIcon?.localName, 'a warning banner leads with an icon').to.equal('umb-icon');
  expect(warningIcon?.getAttribute('name')).to.equal('icon-alert');
  expect(
    warningIcon?.getAttribute('aria-hidden'),
    'and it is hidden from a screen reader, which reads the title beside it instead',
  ).to.equal('true');
  warning.remove();

  const error = await mount(win({ dirty: true, deleted: true }));
  expect(error.renderRoot.querySelector('.notice .notice-icon')?.getAttribute('name')).to.equal('icon-wrong');
  error.remove();
});

it('names every class in the stack so a theme cannot hit one by accident', async () => {
  // This element adopts the active theme's whole `window` sheet, so every selector a theme wrote
  // for the window frame is live in this shadow root as well. The short class names this started
  // with were names the frame already uses, and the result was silent: macOS pins
  // `.title { position: absolute; inset: 0 }` to centre a window title, which pulled the notice's
  // heading out of its column and dropped it across the middle of the band, while Win98, Win11 and
  // Umbraco 4 each shrank it to their caption type. Nothing threw and nothing failed — it just
  // looked wrong on four of the five themes, and only in a browser.
  //
  // Checked as a naming rule rather than by diffing the two components' class lists, because the
  // hazard is any selector any theme writes, present or future, not only the ones the frame
  // happens to use today.
  const element = await mount(win({ dirty: true, changedElsewhere: true, trashed: true }));
  const classes = [...element.renderRoot.querySelectorAll('[class]')].flatMap((node) => [
    ...node.classList,
  ]);
  expect(classes.length, 'the stack drew nothing to check').to.be.greaterThan(0);
  for (const name of classes) {
    expect(name.startsWith('notice'), `'.${name}' is not namespaced to the notice stack`).to.equal(
      true,
    );
  }
  element.remove();
});

it('drops the banner once acknowledged', async () => {
  const element = await mount(win({ dirty: true, changedElsewhere: true, acknowledged: true }));
  expect(banners(element).length).to.equal(0);
  element.remove();
});

it('draws two banners when a document was trashed and changed', async () => {
  const element = await mount(win({ dirty: true, trashed: true, changedElsewhere: true }));
  const drawn = banners(element);
  expect(drawn.length).to.equal(2);
  expect(drawn.map((n) => n.getAttribute('data-notice'))).to.eql(['trashed', 'changed-elsewhere']);
  element.remove();
});

it('draws an error banner with no actions for a deleted document', async () => {
  // Both error notices are statements of fact rather than tools. The banner told the editor to
  // close the window, and a window whose document is gone is still perfectly usable: its tree
  // works, and navigating to another node is what most people will actually do. Offering the one
  // action that throws the window away, and only there, made the banner look like it knew a way
  // out of a situation that has none.
  const element = await mount(win({ dirty: true, deleted: true }));
  const drawn = banners(element);
  expect(drawn.length).to.equal(1);
  expect(drawn[0].getAttribute('data-severity')).to.equal('error');
  expect(drawn[0].querySelectorAll('uui-button').length).to.equal(0);
  element.remove();
});

it('announces the stack to assistive technology as it changes', async () => {
  const element = await mount(win({ dirty: true, changedElsewhere: true }));
  const stack = element.renderRoot.querySelector('.notice-stack') as HTMLElement;
  expect(stack.getAttribute('aria-live')).to.equal('polite');
  element.remove();
});

it('gives a conflict banner the non-interrupting status role', async () => {
  const element = await mount(win({ dirty: true, changedElsewhere: true }));
  const drawn = banners(element);
  expect(drawn[0].getAttribute('role')).to.equal('status');
  element.remove();
});

it('gives a deleted banner the assertive alert role', async () => {
  const element = await mount(win({ dirty: true, deleted: true }));
  const drawn = banners(element);
  expect(drawn[0].getAttribute('role')).to.equal('alert');
  element.remove();
});

/**
 * Mocha's default 5s, raised, for the three tests below that mount and then *measure*.
 *
 * Not padding for its own sake: those three mount the element twice each and read a settled layout
 * back, and a banner is no longer three spans — it is an `umb-icon` and two real `uui-button`s, both
 * of which register and upgrade before anything has a height. Under the whole suite's parallel load
 * that crossed the default and made these three intermittently fail on the clock rather than on the
 * geometry, which is the least useful way for a layout test to go red. Every other mounting test in
 * this package does the same (see `window-dirty.test.ts` and `mount-themed.ts`).
 */
const MEASURE_TIMEOUT_MS = 20_000;

/**
 * Mount the element inside a stand-in for `.frame`: a flex column with the same definite height a
 * real window frame always has, whether from a normal window's inline `height:${rect.h}px` or a
 * maximized one's `height:100%`. The cap is spent as a percentage of exactly this box (see
 * `constants.ts` and this element's `:host` rule) — mounting straight onto `document.body`, as
 * `mount` above does, gives the element no such ancestor and would only tell us the constant is
 * present in the CSS, not that it does anything.
 * @param window The window to describe.
 * @param frameHeight The stand-in frame's height in px.
 * @returns The mounted element and a teardown that removes the whole wrapper.
 */
async function mountInFrame(window: UmbraDesktopWindow, frameHeight: number) {
  const frame = document.createElement('div');
  frame.setAttribute('style', `display:flex; flex-direction:column; height:${frameHeight}px; width:260px;`);
  const element = document.createElement('umbradesktop-window-notices') as UmbraDesktopWindowNoticesElement;
  element.window = window;
  frame.appendChild(element);
  document.body.appendChild(frame);
  await element.updateComplete;
  return { element, remove: () => frame.remove() };
}

it('caps its own height so it cannot push the body out of a short window', async function () {
  this.timeout(MEASURE_TIMEOUT_MS);
  const element = await mount(win({ dirty: true, trashed: true, changedElsewhere: true }));
  const stack = element.renderRoot.querySelector('.notice-stack') as HTMLElement;
  expect(getComputedStyle(stack).overflowY).to.equal('auto');
  expect(getComputedStyle(stack).maxHeight).to.not.equal('none');
  element.remove();
});

it('lets two banners stand at their natural height in a tall window', async function () {
  this.timeout(MEASURE_TIMEOUT_MS);
  // Establishes the baseline this file's next test needs: how tall two real banners render when
  // nothing is clipping them, on a frame generous enough that UMBRADESKTOP_NOTICE_STACK_MAX_SHARE
  // cannot possibly bind (its share of a 2000px frame is nearly 1000px).
  const { element, remove } = await mountInFrame(win({ dirty: true, trashed: true, changedElsewhere: true }), 2000);
  const stack = element.renderRoot.querySelector('.notice-stack') as HTMLElement;
  const naturalHeight = stack.getBoundingClientRect().height;
  expect(naturalHeight, 'two real banners should take a real amount of room').to.be.greaterThan(0);
  remove();
});

it('actually engages the cap on a short window, against a percentage of the frame and not the viewport', async function () {
  this.timeout(MEASURE_TIMEOUT_MS);
  // The bug this guards: spending the constant as `vh` measures the whole browser tab, which a
  // window this short never fills, so the cap worked out to roughly 486px on a 300px-tall window
  // and never bound anything. A percentage of the frame must shrink the same content down as the
  // frame shrinks, which a percentage of the viewport — held constant across this test — cannot.
  const tall = await mountInFrame(win({ dirty: true, trashed: true, changedElsewhere: true }), 2000);
  const naturalHeight = (tall.element.renderRoot.querySelector('.notice-stack') as HTMLElement).getBoundingClientRect()
    .height;
  tall.remove();

  const frameHeight = 200;
  const short = await mountInFrame(win({ dirty: true, trashed: true, changedElsewhere: true }), frameHeight);
  const stack = short.element.renderRoot.querySelector('.notice-stack') as HTMLElement;
  const cappedHeight = stack.getBoundingClientRect().height;

  expect(
    cappedHeight,
    'the same two banners must render shorter on a short window than on a tall one, or nothing is ' +
      'actually capping them',
  ).to.be.lessThan(naturalHeight);
  expect(
    cappedHeight,
    `the cap should be at most ${UMBRADESKTOP_NOTICE_STACK_MAX_SHARE * 100}% of the ${frameHeight}px ` +
      'frame, with a couple of px of slack for subpixel layout',
  ).to.be.at.most(frameHeight * UMBRADESKTOP_NOTICE_STACK_MAX_SHARE + 2);
  short.remove();
});
