import { expect } from '@open-wc/testing';
import { ScreensaverWatcher } from './watcher.js';
import { fixedSettings } from '../settings/settings.source.js';
import type { AccessoriesScreensaverSettings } from '../settings/settings.js';

/**
 * When the screensaver starts: after the chosen wait with nobody doing anything, on the desktop,
 * with it switched on. Driven with a clock the test controls and `tick()` called by hand, so no case
 * waits a real minute.
 */

/** A watcher over settings, a clock and a desktop-visible flag the test controls. */
function watcher(screensaver: Partial<AccessoriesScreensaverSettings> = {}) {
  const clock = { now: 0, desktop: true };
  const settings = fixedSettings({ screensaver: { enabled: true, saver: 'starfield', waitMinutes: 1, ...screensaver } });
  const subject = new ScreensaverWatcher({
    settings,
    now: () => clock.now,
    onDesktop: () => clock.desktop,
    visible: () => true,
  });
  subject.start();
  after(() => subject.stop());
  /** Move the clock on and let the watcher look. */
  const pass = (ms: number) => {
    clock.now += ms;
    subject.tick();
  };
  return { subject, clock, settings, pass };
}

/** The overlay, if one is up. */
const overlay = () => document.body.querySelector('umbradesktop-screensaver');

afterEach(() => overlay()?.remove());

it('starts after the wait, with nobody doing anything', () => {
  const { pass } = watcher();
  pass(59_000);
  expect(overlay(), 'not before the minute is up').to.equal(null);
  pass(2_000);
  expect(overlay()?.getAttribute('saver')).to.equal('starfield');
});

it('waits again from the last thing anybody did', () => {
  const { pass } = watcher();
  pass(50_000);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
  pass(20_000);
  expect(overlay(), 'seventy seconds since the start, but only twenty since the key').to.equal(null);
  pass(45_000);
  expect(overlay()).to.not.equal(null);
});

it('does not start when it is switched off', () => {
  const { pass } = watcher({ enabled: false });
  pass(10 * 60_000);
  expect(overlay()).to.equal(null);
});

/** A screensaver belongs to the desktop, not to the classic backoffice around it. */
it('does not start anywhere but the desktop', () => {
  const { pass, clock } = watcher();
  clock.desktop = false;
  pass(10 * 60_000);
  expect(overlay()).to.equal(null);
});

it('follows a change of settings without being restarted', () => {
  const { pass, settings } = watcher({ enabled: false });
  settings.set({ ...settings.value, screensaver: { enabled: true, saver: 'mystify', waitMinutes: 1 } });
  pass(61_000);
  expect(overlay()?.getAttribute('saver')).to.equal('mystify');
});

it('starts only one at a time', () => {
  const { pass } = watcher();
  pass(61_000);
  pass(61_000);
  expect(document.body.querySelectorAll('umbradesktop-screensaver').length).to.equal(1);
});

/**
 * Most desktop windows are backoffice pages in iframes, and typing in one never reaches the page
 * around it. A watcher that only listened to the outer page would start the screensaver over
 * somebody who is busy typing in a content window.
 */
it('counts typing inside an iframe window as somebody being there', async () => {
  const { pass } = watcher();
  const frame = document.createElement('iframe');
  frame.srcdoc = '<p>a backoffice page</p>';
  document.body.appendChild(frame);
  after(() => frame.remove());
  await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  pass(30_000);
  frame.contentWindow!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
  pass(45_000);
  expect(overlay(), 'forty-five seconds since the key inside the frame').to.equal(null);
});

it('stops watching when stopped', () => {
  const { subject, pass } = watcher();
  subject.stop();
  pass(10 * 60_000);
  expect(overlay()).to.equal(null);
});

/** Preview in the Screen Saver window runs one by hand; the wait running out under it adds none. */
it('does not start over one already running from Preview', () => {
  const { pass } = watcher();
  document.body.appendChild(document.createElement('umbradesktop-screensaver'));
  pass(61_000);
  expect(document.body.querySelectorAll('umbradesktop-screensaver').length).to.equal(1);
});
