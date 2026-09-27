import { expect } from '@open-wc/testing';
import { leaveFullscreenHintKey } from './leave-hint.js';
import en from '../../../localization/en.js';
import nl from '../../../localization/nl.js';

/**
 * Which key the greyed-out full screen button names. The browser's own full screen is left with the
 * browser's own key, and that key is not the same everywhere: F11 on Windows and Linux in every
 * browser, Control-Command-F on a Mac (where F11 shows the desktop), and a dedicated key on a
 * Chromebook, which has no F11 at all. A hint naming the wrong key is worse than no hint.
 *
 * The platform strings are what browsers actually report: `navigator.userAgentData.platform` where it
 * exists (Chromium) and `navigator.platform` where it does not (Firefox).
 */

/** The terms one language actually ships, by key. */
const terms = (set: unknown) => (set as Record<string, Record<string, string>>).umbraDesktop;

it('names F11 on Windows and Linux', () => {
  for (const platform of ['Windows', 'Win32', 'Linux', 'Linux x86_64']) {
    expect(leaveFullscreenHintKey(platform), platform).to.equal('umbraDesktop_taskbarFullscreenBrowserF11');
  }
});

it('names Control-Command-F on a Mac', () => {
  for (const platform of ['macOS', 'MacIntel']) {
    expect(leaveFullscreenHintKey(platform), platform).to.equal('umbraDesktop_taskbarFullscreenBrowserMac');
  }
});

it('names the full screen key on a Chromebook', () => {
  expect(leaveFullscreenHintKey('Chrome OS')).to.equal('umbraDesktop_taskbarFullscreenBrowserChromeOs');
});

it('names F11 when the platform says nothing', () => {
  // F11 is right on every desktop browser outside the two exceptions above, so it is the fallback
  // for a platform that reports an empty string or something this has never seen.
  expect(leaveFullscreenHintKey('')).to.equal('umbraDesktop_taskbarFullscreenBrowserF11');
});

it('has every hint in every language', () => {
  for (const platform of ['Windows', 'macOS', 'Chrome OS']) {
    const key = leaveFullscreenHintKey(platform);
    for (const [language, set] of [
      ['en', en],
      ['nl', nl],
    ] as const) {
      expect(terms(set)[key.replace('umbraDesktop_', '')], `${language} is missing ${key}`).to.be.a('string');
    }
  }
});
