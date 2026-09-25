import { expect } from '@open-wc/testing';
import { render } from '@umbraco-cms/backoffice/external/lit';
import { UMBRADESKTOP_FULLSCREEN_FEATURE } from './index.js';
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
    open: () => undefined,
    localize: (key) => key,
    fullscreen: false,
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
  expect(drawn.querySelector('umb-icon')?.getAttribute('name')).to.equal('icon-fullscreen');
  expect(drawn.getAttribute('aria-label')).to.equal('#umbraDesktop_taskbarFullscreenEnter');
  expect(drawn.getAttribute('aria-pressed')).to.equal('false');
});

it('offers to leave full screen when the desktop is full screen', () => {
  const drawn = button(context({ fullscreen: true }).value);
  expect(drawn.querySelector('umb-icon')?.getAttribute('name')).to.equal('icon-exit-fullscreen');
  expect(drawn.getAttribute('aria-label')).to.equal('#umbraDesktop_taskbarFullscreenExit');
  expect(drawn.getAttribute('aria-pressed')).to.equal('true');
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

it('sits on the launcher side, after the pinned apps', () => {
  expect(UMBRADESKTOP_FULLSCREEN_FEATURE.region).to.equal('launcher');
  expect(UMBRADESKTOP_FULLSCREEN_FEATURE.id).to.equal('fullscreen');
});
