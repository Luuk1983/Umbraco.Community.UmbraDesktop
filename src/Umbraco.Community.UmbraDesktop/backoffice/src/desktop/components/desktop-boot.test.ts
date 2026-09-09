import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_SPLASH_ELEMENT_ID, lowerBootSplash, raiseBootSplash } from '../boot/splash';
import { clearBootAttempt, hasBootAttempt, markBootAttempt } from '../boot/boot-storage';
import './desktop.element';
import type { UmbraDesktopDesktopElement } from './desktop.element';

/**
 * Mount a desktop by hand and wait for its first render.
 *
 * By hand rather than via `fixture`, whose `nextFrame()` never resolves in the backgrounded pages
 * the test runner uses when it has several files in flight — the same reason `desktop-chrome.test`
 * mounts its own.
 * @returns The mounted desktop.
 */
async function mountDesktop(): Promise<UmbraDesktopDesktopElement> {
  const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
  document.body.appendChild(desktop);
  await desktop.updateComplete;
  return desktop;
}

/**
 * Poll until `check` is true, or fail with `message`.
 *
 * The hand-off from the splash crosses a Lit update and the wallpaper wait, so there is no single
 * promise for a test to await and counting microtask ticks is how this file first went flaky. Same
 * shape as `theme-adoption.test`'s helper, for the same reason.
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

afterEach(() => {
  lowerBootSplash();
  clearBootAttempt();
  document.querySelectorAll('umbradesktop-desktop').forEach((element) => element.remove());
});

it('holds the surface until settings have loaded, rather than painting the defaults', async () => {
  // No current-user context in a test, so nothing ever loads: exactly the state a real boot is in
  // while the current-user request is in flight. Nothing of the desktop may be on screen yet.
  const desktop = await mountDesktop();
  expect(desktop.renderRoot.querySelector('.booting'), 'the hold should be rendered').to.not.equal(null);
  expect(desktop.renderRoot.querySelector('umbradesktop-taskbar'), 'no chrome before settings').to.equal(null);
  expect(desktop.renderRoot.querySelector('.surface'), 'no surface before settings').to.equal(null);
});

it('paints the desktop once settings have loaded', async () => {
  const desktop = await mountDesktop();
  desktop.reportSettingsLoaded(true);
  await desktop.updateComplete;

  expect(desktop.renderRoot.querySelector('.booting')).to.equal(null);
  expect(desktop.renderRoot.querySelector('umbradesktop-taskbar')).to.not.equal(null);
  expect(desktop.renderRoot.querySelector('.surface')).to.not.equal(null);
});

it('lowers the boot splash once it has painted, not before', async () => {
  raiseBootSplash(document, 60_000);
  const desktop = await mountDesktop();
  expect(document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID), 'the splash covers the hold').to.not.equal(null);

  desktop.reportSettingsLoaded(true);
  await until(
    () => document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) === null,
    'the splash should be lowered once the desktop has painted',
  );
});

it('clears the boot marker once the desktop has actually mounted', async () => {
  // The marker is what stops a desktop that mounts and then breaks from booting again forever.
  // Clearing it at the moment the desktop is genuinely on screen is what makes it mean "the last
  // boot finished" rather than "a boot was attempted".
  markBootAttempt();
  const desktop = await mountDesktop();
  expect(hasBootAttempt(), 'still marked while the desktop is holding').to.equal(true);

  desktop.reportSettingsLoaded(true);
  await until(() => !hasBootAttempt(), 'the boot marker should be cleared once the desktop has painted');
});

it('reports readiness once, so a repeated report does not re-run the hand-off', async () => {
  const desktop = await mountDesktop();
  raiseBootSplash(document, 60_000);
  desktop.reportSettingsLoaded(true);
  // Wait for the *last* step of the hand-off, not the marker: clearing the marker happens a line
  // earlier, so waiting on that raced the splash this test then raises.
  await until(
    () => document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) === null,
    'the first report should complete its hand-off',
  );

  // A splash raised afterwards belongs to something else and must not be torn down by a second
  // report of a state that has not changed.
  raiseBootSplash(document, 60_000);
  desktop.reportSettingsLoaded(true);
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID)).to.not.equal(null);
});

it('observes the surface for clamping once it exists', async () => {
  // The surface only appears when the hold lifts, so an observer attached at connect time would
  // watch nothing for the whole boot and a window could be stranded off-screen after a resize.
  const desktop = await mountDesktop();
  desktop.reportSettingsLoaded(true);
  await desktop.updateComplete;
  expect(desktop.observedSurfaceForTest).to.equal(desktop.renderRoot.querySelector('.surface'));
});
