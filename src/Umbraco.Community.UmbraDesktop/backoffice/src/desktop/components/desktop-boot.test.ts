import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_SPLASH_ELEMENT_ID, lowerBootSplash, raiseBootSplash } from '../boot/splash';
import { clearBootAttempt, hasBootAttempt, markBootAttempt } from '../boot/boot-storage';
import { waitForWallpaper } from '../boot/wallpaper-ready';
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

it('leaves the splash and the boot marker alone once it has been removed mid hand-off', async () => {
  // The hand-off is asynchronous, so a desktop taken out of the page while it waits for the wallpaper
  // used to finish it anyway: it lowered whatever splash was up by then, which belonged to the next
  // boot, and cleared the marker for a boot it never finished. In this file that was the next test's
  // splash, and the test after the one that left a hand-off running failed one run in three.
  const stale = await mountDesktop();
  stale.reportSettingsLoaded(true);
  await stale.updateComplete;
  const style = stale.renderRoot.querySelector('.desktop')?.getAttribute('style') ?? '';
  const url = /url\("([^"]+)"\)/.exec(style)?.[1] ?? null;
  stale.remove();

  raiseBootSplash(document, 60_000);
  markBootAttempt();
  // The same wait the stale hand-off is in, and then a turn more for what follows it.
  await waitForWallpaper(url);
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID), 'a removed desktop lowered a splash').to.not.equal(null);
  expect(hasBootAttempt(), 'a removed desktop cleared the marker of a boot it never finished').to.equal(true);
});

/**
 * Reopening windows happens behind the hold, so nobody starts using a desktop that windows are
 * still appearing on. The windows' frames are not waited for: each window has its own loader.
 */
describe('while windows are being reopened', () => {
  it('holds the surface after settings have loaded, until the windows are back', async () => {
    const desktop = await mountDesktop();
    desktop.reportWindowsRestoring(true);
    desktop.reportSettingsLoaded(true);
    await desktop.updateComplete;
    expect(desktop.renderRoot.querySelector('.surface') === null, 'no surface while reopening').to.equal(true);
    expect(desktop.renderRoot.querySelector('umbradesktop-taskbar') === null, 'no chrome while reopening').to.equal(true);

    desktop.reportWindowsRestoring(false);
    await desktop.updateComplete;
    expect(desktop.renderRoot.querySelector('.surface') === null, 'the surface once they are').to.equal(false);
  });

  it('keeps the boot splash up until the windows are back', async () => {
    raiseBootSplash(document, 60_000);
    const desktop = await mountDesktop();
    desktop.reportWindowsRestoring(true);
    desktop.reportSettingsLoaded(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) === null, 'still up while reopening').to.equal(false);

    desktop.reportWindowsRestoring(false);
    await until(
      () => document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) === null,
      'the splash should be lowered once the windows are back',
    );
  });

  /** The restore can start a moment after settings report in, and must still be waited for. */
  it('waits for a restore reported after settings, while the hand-off is still under way', async () => {
    raiseBootSplash(document, 60_000);
    const desktop = await mountDesktop();
    desktop.reportSettingsLoaded(true);
    desktop.reportWindowsRestoring(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) === null, 'still up while reopening').to.equal(false);

    desktop.reportWindowsRestoring(false);
    await until(
      () => document.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID) === null,
      'the splash should be lowered once the windows are back',
    );
  });
});

describe('the welcome wizard', () => {
  /**
   * Put the wizard up, as the settings context does for a new user. No current user exists in a
   * test, so the context never decides it; this sets the state the desktop observes instead.
   * @param desktop The painted desktop.
   * @param showing Whether the wizard is up.
   */
  async function showWelcome(desktop: UmbraDesktopDesktopElement, showing: boolean): Promise<void> {
    (desktop as unknown as { _welcome: boolean })._welcome = showing;
    desktop.requestUpdate();
    await desktop.updateComplete;
  }

  it('covers the desktop and makes everything behind it inert', async () => {
    const desktop = await mountDesktop();
    desktop.reportSettingsLoaded(true);
    await showWelcome(desktop, true);

    expect(desktop.renderRoot.querySelector('umbradesktop-welcome-screen')).to.not.equal(null);
    for (const selector of ['.surface', 'umbradesktop-taskbar', 'umbradesktop-toasts']) {
      expect(desktop.renderRoot.querySelector(selector)!.hasAttribute('inert'), selector).to.equal(true);
    }
  });

  it('gives the desktop back when it is gone', async () => {
    const desktop = await mountDesktop();
    desktop.reportSettingsLoaded(true);
    await showWelcome(desktop, true);
    await showWelcome(desktop, false);

    expect(desktop.renderRoot.querySelector('umbradesktop-welcome-screen')).to.equal(null);
    expect(desktop.renderRoot.querySelector('.surface')!.hasAttribute('inert')).to.equal(false);
  });
});
