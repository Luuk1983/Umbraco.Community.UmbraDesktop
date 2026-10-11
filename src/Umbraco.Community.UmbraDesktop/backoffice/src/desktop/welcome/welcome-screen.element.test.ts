import { expect } from '@open-wc/testing';
import './welcome-screen.element.js';
import {
  UMBRADESKTOP_WELCOME_DISMISS_EVENT,
  UMBRADESKTOP_WELCOME_FINISH_EVENT,
} from './welcome-screen.element.js';
import type { UmbraDesktopWelcomeScreenElement } from './welcome-screen.element.js';
import type { UmbraDesktopWelcomeChoices } from './choices';
import { UMBRADESKTOP_DEFAULT_THEME_ID } from '../theme/themes/index';
import { UMBRADESKTOP_Z_TASKBAR } from '../constants';

/**
 * The welcome wizard's frame: the greeting, then three pages behind one button that never moves.
 *
 * What is asserted is the behaviour the design doc settles (D4, D12, D13), not the wording, which
 * the dictionary owns. The pages' own contents are tested beside each page.
 */

/** A button as `uui-button` exposes it: `click()` is async, see the migration screen's test. */
type AsyncButton = HTMLElement & { click(): Promise<void> };

/**
 * Mount the screen by hand and wait for its first render.
 *
 * By hand rather than via `fixture`, whose `nextFrame()` never resolves in the backgrounded pages
 * the test runner uses when several files are in flight.
 * @param holdMs How long the greeting holds before moving on.
 * @returns The mounted screen.
 */
async function mountScreen(holdMs = 60_000): Promise<UmbraDesktopWelcomeScreenElement> {
  const screen = document.createElement('umbradesktop-welcome-screen') as UmbraDesktopWelcomeScreenElement;
  screen.holdMs = holdMs;
  document.body.appendChild(screen);
  await screen.updateComplete;
  return screen;
}

/**
 * Poll until `check` is true, or fail with `message`.
 * @param check The condition to wait for.
 * @param message What to report if it never becomes true.
 * @returns Nothing; throws when the condition never holds.
 */
async function until(check: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect.fail(message);
}

/**
 * The tag of the page on screen, or `greeting` before the first page.
 * @param screen The screen.
 * @returns Which page is showing.
 */
function pageOf(screen: UmbraDesktopWelcomeScreenElement): string {
  const page = screen.renderRoot.querySelector('[data-page]');
  return page?.getAttribute('data-page') ?? 'none';
}

/**
 * The main button.
 * @param screen The screen.
 * @returns The button, or null when none is rendered.
 */
function main(screen: UmbraDesktopWelcomeScreenElement): AsyncButton | null {
  return screen.renderRoot.querySelector<AsyncButton>('.main');
}

/**
 * Move past the greeting with a key, as anybody impatient would.
 * @param screen The screen.
 */
async function skipGreeting(screen: UmbraDesktopWelcomeScreenElement): Promise<void> {
  screen.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  await screen.updateComplete;
}

/**
 * Press the main button and wait for the page to change.
 * @param screen The screen.
 */
async function next(screen: UmbraDesktopWelcomeScreenElement): Promise<void> {
  await main(screen)!.click();
  await screen.updateComplete;
}

afterEach(() => {
  document.querySelectorAll('umbradesktop-welcome-screen').forEach((element) => element.remove());
});

it('greets first, with no button to press', async () => {
  const screen = await mountScreen();

  expect(pageOf(screen)).to.equal('greeting');
  expect(main(screen)).to.equal(null);
});

it('says what this is, not only hello, so a first visit reads as one', async () => {
  const screen = await mountScreen();
  const greeting = screen.renderRoot.querySelector('[data-page="greeting"]')!;

  expect(greeting.querySelector('.word')!.textContent!.trim()).to.equal(screen.localize.term('umbraDesktop_welcomeTitle'));
  expect(greeting.querySelector('.lead')!.textContent!.trim()).to.equal(screen.localize.term('umbraDesktop_welcomeLead'));
});

it('moves on from the greeting by itself', async () => {
  const screen = await mountScreen(30);

  await until(() => pageOf(screen) === 'language', 'the greeting should give way to the language page');
});

it('moves on from the greeting at a key press', async () => {
  const screen = await mountScreen();

  await skipGreeting(screen);

  expect(pageOf(screen)).to.equal('language');
});

it('moves on from the greeting at a click', async () => {
  const screen = await mountScreen();

  screen.renderRoot.querySelector<HTMLElement>('[data-page="greeting"]')!.click();
  await screen.updateComplete;

  expect(pageOf(screen)).to.equal('language');
});

it('asks for the language, then the theme, then the sign-in switch', async () => {
  const screen = await mountScreen();
  await skipGreeting(screen);

  expect(pageOf(screen)).to.equal('language');
  await next(screen);
  expect(pageOf(screen)).to.equal('theme');
  await next(screen);
  expect(pageOf(screen)).to.equal('sign-in');
});

it('keeps the main button in one place on every page', async () => {
  const screen = await mountScreen();
  await skipGreeting(screen);

  const places: Array<{ right: number; bottom: number }> = [];
  for (let page = 0; page < 3; page++) {
    const box = main(screen)!.getBoundingClientRect();
    places.push({ right: Math.round(box.right), bottom: Math.round(box.bottom) });
    if (page < 2) await next(screen);
  }

  expect(places[1]).to.deep.equal(places[0]);
  expect(places[2]).to.deep.equal(places[0]);
});

it('labels the main button Next, then Done on the last page', async () => {
  const screen = await mountScreen();
  await skipGreeting(screen);

  expect(main(screen)!.getAttribute('label')).to.equal(screen.localize.term('umbraDesktop_welcomeNext'));
  await next(screen);
  expect(main(screen)!.getAttribute('label')).to.equal(screen.localize.term('umbraDesktop_welcomeNext'));
  await next(screen);
  expect(main(screen)!.getAttribute('label')).to.equal(screen.localize.term('umbraDesktop_welcomeDone'));
});

it('offers Back from the second page, and it goes back', async () => {
  const screen = await mountScreen();
  await skipGreeting(screen);

  expect(screen.renderRoot.querySelector('.back')).to.equal(null);
  await next(screen);

  screen.renderRoot.querySelector<HTMLElement>('.back')!.click();
  await screen.updateComplete;

  expect(pageOf(screen)).to.equal('language');
});

it('shows which of three steps this is', async () => {
  const screen = await mountScreen();
  await skipGreeting(screen);
  await next(screen);

  const dots = [...screen.renderRoot.querySelectorAll('.dots i')];

  expect(dots.length).to.equal(3);
  expect(dots.map((dot) => dot.classList.contains('on'))).to.deep.equal([false, true, false]);
});

it('finishes with the defaults when nothing was changed', async () => {
  const screen = await mountScreen();
  let finished: UmbraDesktopWelcomeChoices | undefined;
  screen.addEventListener(UMBRADESKTOP_WELCOME_FINISH_EVENT, (event) => {
    finished = (event as CustomEvent<UmbraDesktopWelcomeChoices>).detail;
  });
  await skipGreeting(screen);

  await next(screen);
  await next(screen);
  await next(screen);

  expect(finished).to.deep.equal({ theme: UMBRADESKTOP_DEFAULT_THEME_ID, bootIntoDesktop: false });
});

it('finishes once, however often Done is pressed', async () => {
  const screen = await mountScreen();
  let count = 0;
  screen.addEventListener(UMBRADESKTOP_WELCOME_FINISH_EVENT, () => count++);
  await skipGreeting(screen);
  await next(screen);
  await next(screen);

  await next(screen);
  await main(screen)?.click();

  expect(count).to.equal(1);
});

it('asks to be taken away once it has finished', async () => {
  const screen = await mountScreen();
  let dismissed = false;
  screen.addEventListener(UMBRADESKTOP_WELCOME_DISMISS_EVENT, () => (dismissed = true));
  await skipGreeting(screen);
  await next(screen);
  await next(screen);

  await next(screen);

  await until(() => dismissed, 'the screen should ask to be dismissed after Done');
});

it('puts focus on the main button when a page appears', async () => {
  const screen = await mountScreen();
  await skipGreeting(screen);

  await until(() => screen.shadowRoot!.activeElement === main(screen), 'focus should land on the main button');
});

it('is a modal dialog, so assistive technology knows the desktop is out of reach', async () => {
  const screen = await mountScreen();

  const dialog = screen.renderRoot.querySelector('[role="dialog"]');

  expect(dialog?.getAttribute('aria-modal')).to.equal('true');
});

it('sits above the taskbar', async () => {
  const screen = await mountScreen();

  expect(Number(getComputedStyle(screen).zIndex)).to.be.greaterThan(UMBRADESKTOP_Z_TASKBAR);
});
