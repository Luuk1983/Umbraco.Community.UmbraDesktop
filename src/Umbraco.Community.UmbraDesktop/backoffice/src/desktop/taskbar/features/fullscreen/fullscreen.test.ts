import { expect } from '@open-wc/testing';
import { render } from '@umbraco-cms/backoffice/external/lit';
import { UMBRADESKTOP_FULLSCREEN_FEATURE } from './index.js';
import { currentPlatform, leaveFullscreenHintKey } from './leave-hint.js';
import icons from '../../../icons/icons.js';
import type { UmbraDesktopTaskbarFeatureContext } from '../types';

/**
 * The full screen button, as a pure feature over a stand-in context: what it draws for each state,
 * what a click asks for, and when it is not available. The taskbar's side of it, following the
 * browser's own full screen state, is tested with the rest of the row in `taskbar-features.test.ts`.
 */

/**
 * A feature context with the full screen fields a case cares about.
 * @param over The fields to set.
 * @returns The context, and how many times it was asked to toggle.
 */
function context(over: Partial<UmbraDesktopTaskbarFeatureContext> = {}) {
  const toggled = { count: 0 };
  const value: UmbraDesktopTaskbarFeatureContext = {
    apps: [],
    pinned: [],
    isRefRegistered: () => false,
    entryRef: () => undefined,
    open: () => undefined,
    localize: (key) => key,
    fullscreen: 'off',
    canFullscreen: true,
    toggleFullscreen: () => toggled.count++,
    ...over,
  };
  return { value, toggled };
}

/**
 * The feature's one button, rendered into a throwaway container.
 * @param value The context to render with.
 * @returns The button.
 */
function button(value: UmbraDesktopTaskbarFeatureContext): HTMLButtonElement {
  const container = document.createElement('div');
  render(UMBRADESKTOP_FULLSCREEN_FEATURE.render(value), container);
  const found = container.querySelectorAll<HTMLButtonElement>('button');
  expect(found.length, 'one button').to.equal(1);
  return found[0];
}

it('offers to go full screen when the desktop is not', () => {
  const drawn = button(context().value);
  expect(drawn.classList.contains('task'), 'themed as a taskbar button').to.equal(true);
  expect(drawn.querySelector('umb-icon')?.getAttribute('name')).to.equal('icon-umbradesktop-fullscreen');
  expect(drawn.getAttribute('aria-label')).to.equal('#umbraDesktop_taskbarFullscreenEnter');
  expect(drawn.getAttribute('aria-pressed')).to.equal('false');
});

it('offers to leave full screen when the page is full screen', () => {
  const drawn = button(context({ fullscreen: 'page' }).value);
  expect(drawn.querySelector('umb-icon')?.getAttribute('name')).to.equal('icon-umbradesktop-exit-fullscreen');
  expect(drawn.getAttribute('aria-label')).to.equal('#umbraDesktop_taskbarFullscreenExit');
  expect(drawn.getAttribute('aria-pressed')).to.equal('true');
});

/**
 * Umbraco has no four-arrow pair, so both glyphs are this package's own, and a name nobody
 * registered does not fail anywhere: `umb-icon` just draws an empty button. This is where that
 * would surface.
 */
it('draws only icons this package registers', () => {
  const registered = icons.map((icon) => icon.name);
  for (const fullscreen of ['off', 'page', 'browser'] as const) {
    const name = button(context({ fullscreen }).value).querySelector('umb-icon')?.getAttribute('name');
    expect(registered, `${name} is not registered`).to.include(name);
  }
});

/**
 * F11, or the browser's own menu, puts the browser itself in full screen, and no page can leave
 * that: `exitFullscreen()` is rejected, and asking for the page's own full screen on top only swaps
 * one browser notice for another. So the button says so rather than pretending, and says how.
 */
it('greys out while the browser itself is full screen, and says how to leave it', () => {
  const { value, toggled } = context({ fullscreen: 'browser' });
  const drawn = button(value);
  const hint = `#${leaveFullscreenHintKey(currentPlatform())}`;

  expect(drawn.getAttribute('aria-disabled'), 'greyed out').to.equal('true');
  expect(drawn.getAttribute('title'), 'the hint is the tooltip').to.equal(hint);
  expect(drawn.getAttribute('aria-label'), 'and what a screen reader hears').to.equal(hint);
  // Inward arrows still: the screen is full screen, it is only not this button's to end.
  expect(drawn.querySelector('umb-icon')?.getAttribute('name')).to.equal('icon-umbradesktop-exit-fullscreen');

  drawn.click();
  expect(toggled.count, 'a click must not ask for a full screen nothing here can leave').to.equal(0);
});

it('stays enabled whenever the full screen is its own to leave, or there is none', () => {
  for (const fullscreen of ['off', 'page'] as const) {
    expect(button(context({ fullscreen }).value).hasAttribute('aria-disabled'), fullscreen).to.equal(false);
  }
});

it('toggles full screen when clicked', () => {
  const { value, toggled } = context();
  button(value).click();
  expect(toggled.count).to.equal(1);
});

/**
 * A browser, or an embedding page, can refuse full screen outright. Then the button is not drawn,
 * and Desktop settings says why its switch is disabled.
 */
it('is unavailable where the browser does not allow full screen', () => {
  const unavailable = context({ canFullscreen: false }).value;
  expect(UMBRADESKTOP_FULLSCREEN_FEATURE.availability(unavailable)).to.deep.equal({
    available: false,
    reasonKey: 'umbraDesktop_taskbarFullscreenUnavailable',
  });
  expect(UMBRADESKTOP_FULLSCREEN_FEATURE.availability(context().value)).to.deep.equal({ available: true });
});

it('sits on the launcher side', () => {
  // Where on that side is the registry's to say, and `features.test.ts` asserts it.
  expect(UMBRADESKTOP_FULLSCREEN_FEATURE.region).to.equal('launcher');
  expect(UMBRADESKTOP_FULLSCREEN_FEATURE.id).to.equal('fullscreen');
});
