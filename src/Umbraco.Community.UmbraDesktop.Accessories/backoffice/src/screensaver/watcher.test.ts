import { expect } from '@open-wc/testing';
import { ScreensaverWatcher } from './watcher.js';
import { fixedSettings } from '../settings/settings.source.js';
import type { AccessoriesScreensaverSettings } from '../settings/settings.js';

/**
 * When the screensaver starts: after the chosen wait with nobody doing anything, on the desktop,
 * with it switched on. Driven with a clock the test controls and `tick()` called by hand, so no case
 * waits a real minute.
 */

/**
 * Watchers a case started, stopped after it. After each case rather than once at the end of the
 * file: a watcher also ticks on its own real one-second timer, and one left running from an earlier
 * case put an overlay up under a later one, which then hung the runner failing on it.
 */
let started: ScreensaverWatcher[] = [];
afterEach(() => {
  for (const subject of started) subject.stop();
  started = [];
});

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
  started.push(subject);
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

/**
 * The frame search walks every shadow root on the page, every few seconds. A switched-off
 * screensaver, or one outside the desktop, has no use for its answer, so it does not walk at all.
 * Counted by watching the one DOM call the walk is made of.
 */
describe('searching for frames', () => {
  /** How many times the page was walked since the last {@link walks} reset. */
  let walks = 0;
  /** The document's own method, put back after each case. */
  const original = Document.prototype.querySelectorAll;
  beforeEach(() => {
    walks = 0;
    document.querySelectorAll = function (this: Document, selectors: string) {
      if (selectors === '*') walks++;
      return original.call(this, selectors);
    } as typeof document.querySelectorAll;
  });
  /** Frames a case opened, closed after it so the next case counts only its own. */
  let opened: HTMLIFrameElement[] = [];
  afterEach(() => {
    delete (document as Partial<Document> & { querySelectorAll?: unknown }).querySelectorAll;
    for (const element of opened) element.remove();
    opened = [];
  });

  /**
   * A frame on the page, loaded.
   * @param content Its document's body.
   */
  async function frame(content = '<p>a backoffice page</p>'): Promise<HTMLIFrameElement> {
    const element = document.createElement('iframe');
    element.srcdoc = content;
    document.body.appendChild(element);
    opened.push(element);
    await new Promise((resolve) => element.addEventListener('load', resolve, { once: true }));
    return element;
  }

  it('does not walk the page while the screensaver is switched off', () => {
    const { pass } = watcher({ enabled: false });
    for (let i = 0; i < 5; i++) pass(10_000);
    expect(walks).to.equal(0);
  });

  it('does not walk the page anywhere but the desktop', () => {
    const { pass, clock } = watcher();
    clock.desktop = false;
    for (let i = 0; i < 5; i++) pass(10_000);
    expect(walks).to.equal(0);
  });

  /**
   * Switched on, it listens to the frames already open before it judges anybody idle, on that very
   * tick, rather than at the next scheduled search, which could be seconds away and after the wait
   * has already run out over somebody typing in a frame it had not heard yet.
   */
  it('listens to the frames already open on the first look after it is switched on', async () => {
    const { pass, settings } = watcher();
    pass(1_000);
    settings.set({ ...settings.value, screensaver: { ...settings.value.screensaver, enabled: false } });
    pass(1_000);
    const frameElement = await frame();
    settings.set({ ...settings.value, screensaver: { ...settings.value.screensaver, enabled: true } });
    pass(1_000);
    frameElement.contentWindow!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    pass(59_000);
    // Compared as a boolean: a failing equal(null) on an element hangs the runner serialising it.
    expect(overlay() === null, 'fifty-nine seconds since the key in the frame').to.equal(true);
  });

  /**
   * Every closed window used to leave its listener entry behind, holding the frame's window, for as
   * long as the backoffice tab lived. Closed frames are let go of on the next search.
   */
  it('lets go of a frame that has been closed', async () => {
    const { subject, pass } = watcher();
    // Counted from what was already there: an earlier case's frame may still be on the page.
    pass(5_000);
    const before = subject.listening;
    const frameElement = await frame();
    pass(5_000);
    expect(subject.listening, 'and the frame').to.equal(before + 1);
    frameElement.remove();
    pass(5_000);
    expect(subject.listening, 'without it').to.equal(before);
  });

  /** A frame that navigates keeps its window and gets a new document: one entry, not one per page. */
  it('keeps one entry for a frame however often it navigates', async () => {
    const { subject, pass } = watcher();
    const frameElement = await frame('<p>one</p>');
    pass(5_000);
    const before = subject.listening;
    for (const page of ['two', 'three']) {
      const loaded = new Promise((resolve) => frameElement.addEventListener('load', resolve, { once: true }));
      frameElement.srcdoc = `<p>${page}</p>`;
      await loaded;
      pass(5_000);
    }
    expect(subject.listening).to.equal(before);
  });

  it('still hears a frame after it navigates', async () => {
    const { pass } = watcher();
    const frameElement = await frame('<p>one</p>');
    pass(5_000);
    const loaded = new Promise((resolve) => frameElement.addEventListener('load', resolve, { once: true }));
    frameElement.srcdoc = '<p>two</p>';
    await loaded;
    pass(5_000);
    frameElement.contentWindow!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    pass(55_000);
    expect(overlay() === null, 'fifty-five seconds since the key in the navigated frame').to.equal(true);
  });
});
