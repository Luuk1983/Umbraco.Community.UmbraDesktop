import { expect, html } from '@open-wc/testing';
import './control-bar.element.js';
import type { ControlBarElement } from './control-bar.element.js';
import {
  BAR_COMPACT_WIDTH_PX,
  BAR_HEIGHT_PX,
  BAR_PAD_X_PX,
  BAR_PLAY_SIZE_PX,
  BAR_SEEK_ABOVE_PX,
  BAR_SEEK_BELOW_PX,
  BAR_TRACK_HEIGHT_PX,
  PLAYBACK_RATES,
  SEEK_PAGE_STEP_SECONDS,
  SEEK_STEP_SECONDS,
  SKIP_SECONDS,
  VOLUME_STEP,
} from './constants.js';
import { ENGINE_EVENTS } from './engine.js';
import { FakeEngine, mount, unmountAll } from './test-support.js';

/** The five theme ids the desktop stamps on an app element. */
const THEMES = ['umbraco', 'umbraco4', 'macos', 'win11', 'win98'];

/**
 * A mounted bar on a fake engine that is playing a 50 minute video, a third of the way in.
 * @param configure Optional tweak of the engine before the bar first renders.
 * @param container What the fullscreen button should fullscreen.
 * @returns The bar and its engine.
 */
async function bar(configure?: (engine: FakeEngine) => void, container?: HTMLElement, width = 720) {
  const engine = new FakeEngine();
  engine.duration = 3000;
  engine.time = 1000;
  configure?.(engine);
  const wrapper = await mount<HTMLDivElement>(
    html`<div style="width:${width}px"><umbradesktop-control-bar .engine=${engine} .videoId=${'aRkc0fRxQjw'} .container=${container}></umbradesktop-control-bar></div>`,
  );
  const element = wrapper.querySelector<ControlBarElement>('umbradesktop-control-bar')!;
  await element.updateComplete;
  return { element, engine };
}

/**
 * A bar with no engine, disabled, the way a window draws it while nothing can play yet.
 * @param status The line it shows where the time would be.
 * @param videoId The video its YouTube link goes to, if any.
 * @returns The bar.
 */
async function disabledBar(status: string, videoId = 'next1') {
  const wrapper = await mount<HTMLDivElement>(
    html`<div style="width:720px"><umbradesktop-control-bar disabled .status=${status} .videoId=${videoId}></umbradesktop-control-bar></div>`,
  );
  const element = wrapper.querySelector<ControlBarElement>('umbradesktop-control-bar')!;
  await element.updateComplete;
  return element;
}

/**
 * Whether a control is drawn and takes room, as opposed to being folded away.
 * @param element The bar.
 * @param selector The control.
 * @returns True when it has a box.
 */
function drawn(element: ControlBarElement, selector: string): boolean {
  const node = element.shadowRoot!.querySelector(selector);
  return !!node && getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0;
}

/** One element inside the bar's shadow root. */
function part<T extends HTMLElement = HTMLElement>(element: ControlBarElement, selector: string): T {
  return element.shadowRoot!.querySelector<T>(selector)!;
}

/** Whether an element is in the bar at all (a `null` check that cannot hang a failing test). */
function has(element: ControlBarElement, selector: string): boolean {
  return element.shadowRoot!.querySelector(selector) !== null;
}

/** Press a key on an element, the way a focused user would. */
async function press(element: ControlBarElement, target: HTMLElement, key: string): Promise<void> {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
  await element.updateComplete;
}

afterEach(unmountAll);

describe('media player control bar', () => {
  it('renders every control', async () => {
    const { element } = await bar();
    for (const selector of ['.play', '.back', '.forward', '.seek', '.time', '.mute', '.volume', '.captions', '.speed', '.fullscreen', '.watch']) {
      expect(has(element, selector), selector).to.equal(true);
    }
  });

  it('lays the row out as the mock does: transport, sound, time, then captions, speed, full screen and YouTube', async () => {
    const { element } = await bar();
    const order = [...element.shadowRoot!.querySelectorAll('.row > *')].map((node) => node.classList[0]);
    expect(order).to.deep.equal(['play', 'back', 'forward', 'mute', 'volume', 'time', 'grow', 'captions', 'speed', 'fullscreen', 'divider', 'watch']);
  });

  it('is as tall as constants.ts says, on demand, live and disabled alike, so a window can sum it', async () => {
    const onDemand = await bar();
    const streaming = await bar((e) => (e.duration = 0));
    const waiting = await disabledBar('Starts in 28 days');
    for (const [name, element] of [['on demand', onDemand.element], ['live', streaming.element], ['disabled', waiting]] as const) {
      expect(element.getBoundingClientRect().height, name).to.be.closeTo(BAR_HEIGHT_PX, 0.5);
    }
  });

  it('gives the seek line its own full-width row with the breathing space constants.ts names above and below the track', async () => {
    const { element } = await bar();
    const seek = part(element, '.seek').getBoundingClientRect();
    const track = part(element, '.seek .track').getBoundingClientRect();
    const bar_ = part(element, '.bar').getBoundingClientRect();
    expect(track.top - seek.top, 'above the track').to.be.closeTo(BAR_SEEK_ABOVE_PX, 0.5);
    expect(seek.bottom - track.bottom, 'below the track').to.be.closeTo(BAR_SEEK_BELOW_PX, 0.5);
    expect(track.height).to.be.closeTo(BAR_TRACK_HEIGHT_PX, 0.5);
    expect(seek.left - bar_.left, 'the row spans the bar inside its side padding').to.be.closeTo(BAR_PAD_X_PX, 0.5);
    expect(bar_.right - seek.right).to.be.closeTo(BAR_PAD_X_PX, 0.5);
    expect(part(element, '.row').getBoundingClientRect().top, 'the controls sit under the seek row').to.be.closeTo(seek.bottom, 0.5);
    expect(part(element, '.play').getBoundingClientRect().width).to.be.closeTo(BAR_PLAY_SIZE_PX, 0.5);
  });

  it('takes the dark of the video, joined to the frame with no border, under every theme but Windows 98, which stays grey', async () => {
    const { element } = await bar();
    const paint = () => getComputedStyle(part(element, '.bar')).backgroundColor;
    for (const theme of [undefined, 'umbraco']) {
      if (theme) element.setAttribute('data-umbradesktop-theme', theme);
      await element.updateComplete;
      expect(paint(), String(theme)).to.equal('rgb(14, 16, 24)');
    }
    for (const [theme, colour] of [['macos', 'rgb(28, 28, 30)'], ['win11', 'rgb(32, 32, 32)'], ['win98', 'rgb(192, 192, 192)']] as const) {
      element.setAttribute('data-umbradesktop-theme', theme);
      await element.updateComplete;
      expect(paint(), theme).to.equal(colour);
    }
    element.setAttribute('data-umbradesktop-theme', 'umbraco');
    await element.updateComplete;
    expect(getComputedStyle(part(element, '.bar')).borderTopWidth, 'no seam').to.equal('0px');
    expect(getComputedStyle(part(element, '.bar')).color, 'white time and icons').to.equal('rgba(255, 255, 255, 0.92)');
  });

  it('draws the buffered stretch on the track as far as the engine says it has loaded', async () => {
    const { element, engine } = await bar();
    const width = () => part(element, '.seek .buffer').getBoundingClientRect().width / part(element, '.seek .track').getBoundingClientRect().width;
    expect(width()).to.be.closeTo(0, 0.001);
    engine.buffered = 0.6;
    engine.emit(ENGINE_EVENTS.bufferedChange, 0.6);
    await element.updateComplete;
    expect(width()).to.be.closeTo(0.6, 0.001);
  });

  it('jumps back and forward ten seconds, never outside the video', async () => {
    const { element, engine } = await bar();
    part(element, '.back').click();
    expect(engine.seeks).to.deep.equal([1000 - SKIP_SECONDS]);
    engine.time = 1000;
    part(element, '.forward').click();
    expect(engine.seeks[1]).to.equal(1000 + SKIP_SECONDS);
    engine.time = 4;
    part(element, '.back').click();
    expect(engine.seeks[2], 'not before the start').to.equal(0);
    engine.time = 2995;
    part(element, '.forward').click();
    expect(engine.seeks[3], 'not past the end').to.equal(3000);
  });

  it('names the jumps for assistive technology', async () => {
    const { element } = await bar();
    expect(part(element, '.back').getAttribute('aria-label')).to.equal('Back 10 seconds');
    expect(part(element, '.forward').getAttribute('aria-label')).to.equal('Forward 10 seconds');
  });

  it('shows the speed and steps through the rates on each press, back to normal after the last', async () => {
    const { element, engine } = await bar();
    expect(part(element, '.speed').textContent!.trim()).to.equal('1×');
    for (const rate of [...PLAYBACK_RATES.slice(1), PLAYBACK_RATES[0]]) {
      part(element, '.speed').click();
      await element.updateComplete;
      expect(engine.playbackRate).to.equal(rate);
      expect(part(element, '.speed').textContent!.trim()).to.equal(`${rate}×`);
    }
    expect(engine.rateCalls).to.deep.equal([...PLAYBACK_RATES.slice(1), PLAYBACK_RATES[0]]);
    expect(part(element, '.speed').getAttribute('aria-label')).to.equal('Playback speed: 1×');
  });

  it('follows a speed the engine reports by itself', async () => {
    const { element, engine } = await bar();
    engine.setPlaybackRate(1.5);
    await element.updateComplete;
    expect(part(element, '.speed').textContent!.trim()).to.equal('1.5×');
  });

  it('plays when paused and pauses when playing', async () => {
    const { element, engine } = await bar();
    part(element, '.play').click();
    expect(engine.calls).to.deep.equal(['play']);
    await element.updateComplete;
    part(element, '.play').click();
    expect(engine.calls).to.deep.equal(['play', 'pause']);
  });

  it('says whether it is playing through aria-pressed', async () => {
    const { element, engine } = await bar();
    expect(part(element, '.play').getAttribute('aria-pressed')).to.equal('false');
    engine.play();
    await element.updateComplete;
    expect(part(element, '.play').getAttribute('aria-pressed')).to.equal('true');
  });

  it('shows elapsed and total time as m:ss / m:ss', async () => {
    const { element } = await bar();
    expect(part(element, '.time').textContent!.replace(/\s+/g, ' ').trim()).to.equal('16:40 / 50:00');
  });

  it('follows the engine: position, time, volume and mute', async () => {
    const { element, engine } = await bar();
    engine.seek(1500);
    engine.setVolume(0.5);
    engine.setMuted(true);
    await element.updateComplete;
    expect(part(element, '.seek').getAttribute('aria-valuenow')).to.equal('1500');
    expect(part(element, '.time').textContent).to.contain('25:00');
    expect(part(element, '.volume').getAttribute('aria-valuenow')).to.equal('50');
    expect(part(element, '.mute').getAttribute('aria-pressed')).to.equal('true');
  });

  it('exposes the seek slider as a slider with a range and a spoken value', async () => {
    const { element } = await bar();
    const seek = part(element, '.seek');
    expect(seek.getAttribute('role')).to.equal('slider');
    expect(seek.getAttribute('aria-valuemin')).to.equal('0');
    expect(seek.getAttribute('aria-valuemax')).to.equal('3000');
    expect(seek.getAttribute('aria-valuenow')).to.equal('1000');
    expect(seek.getAttribute('aria-valuetext')).to.equal('16:40 of 50:00');
    expect(seek.getAttribute('tabindex')).to.equal('0');
  });

  it('seeks with the keyboard: arrows, page keys, home and end', async () => {
    const { element, engine } = await bar();
    const seek = part(element, '.seek');
    const cases: Array<[string, number]> = [
      ['ArrowRight', 1000 + SEEK_STEP_SECONDS],
      ['ArrowLeft', 1000 - SEEK_STEP_SECONDS],
      ['ArrowUp', 1000 + SEEK_STEP_SECONDS],
      ['ArrowDown', 1000 - SEEK_STEP_SECONDS],
      ['PageUp', 1000 + SEEK_PAGE_STEP_SECONDS],
      ['PageDown', 1000 - SEEK_PAGE_STEP_SECONDS],
      ['Home', 0],
      ['End', 3000],
    ];
    for (const [key, expected] of cases) {
      engine.time = 1000;
      await press(element, seek, key);
      expect(engine.seeks[engine.seeks.length - 1], key).to.equal(expected);
    }
    expect(engine.seeks.length).to.equal(cases.length);
  });

  it('never seeks outside the video', async () => {
    const { element, engine } = await bar((e) => (e.time = 2));
    await press(element, part(element, '.seek'), 'ArrowLeft');
    expect(engine.seeks).to.deep.equal([0]);
  });

  it('ignores keys the slider does not use, so Tab still works', async () => {
    const { element, engine } = await bar();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    part(element, '.seek').dispatchEvent(event);
    expect(engine.seeks).to.deep.equal([]);
    expect(event.defaultPrevented).to.equal(false);
  });

  it('draws a live stream as a full track at the live edge and a Live pill in place of the time', async () => {
    const { element } = await bar((e) => (e.duration = 0));
    expect(has(element, '[role="slider"].seek'), 'there is nothing to seek through').to.equal(false);
    expect(has(element, '.seek.is-live'), 'but the track is still drawn, so the bar keeps its height').to.equal(true);
    expect(has(element, '.time')).to.equal(false);
    expect(part(element, '.live').textContent!.trim()).to.equal('Live');
    expect(has(element, '.play')).to.equal(true);
  });

  it('keeps back ten seconds live and disables what a live stream cannot do: forward and speed', async () => {
    const { element, engine } = await bar((e) => {
      e.duration = 0;
      e.time = 600;
    });
    expect(part<HTMLButtonElement>(element, '.back').disabled).to.equal(false);
    expect(part<HTMLButtonElement>(element, '.forward').disabled, 'nothing ahead of live').to.equal(true);
    expect(part<HTMLButtonElement>(element, '.speed').disabled, 'a stream plays at its own speed').to.equal(true);
    part(element, '.back').click();
    expect(engine.seeks, 'a stream has no length to clamp to').to.deep.equal([590]);
  });

  it('treats an infinite duration as live as well, and switches back when it becomes finite', async () => {
    const { element, engine } = await bar((e) => (e.duration = Number.POSITIVE_INFINITY));
    expect(has(element, '.live')).to.equal(true);
    engine.duration = 3000;
    engine.emit('durationchange', 3000);
    await element.updateComplete;
    expect(has(element, '.live')).to.equal(false);
    expect(has(element, '[role="slider"].seek')).to.equal(true);
    expect(has(element, '.time')).to.equal(true);
  });

  it('toggles mute through the engine', async () => {
    const { element, engine } = await bar();
    part(element, '.mute').click();
    await element.updateComplete;
    part(element, '.mute').click();
    expect(engine.mutedCalls).to.deep.equal([true, false]);
  });

  it('sets the volume with the keyboard', async () => {
    const { element, engine } = await bar((e) => (e.volume = 0.5));
    const volume = part(element, '.volume');
    const cases: Array<[string, number]> = [
      ['ArrowRight', 0.5 + VOLUME_STEP],
      ['ArrowLeft', 0.5 - VOLUME_STEP],
      ['Home', 0],
      ['End', 1],
    ];
    for (const [key, expected] of cases) {
      engine.volume = 0.5;
      await press(element, volume, key);
      expect(engine.volumeCalls[engine.volumeCalls.length - 1], key).to.equal(expected);
    }
  });

  it('toggles captions and says whether they are on', async () => {
    const { element, engine } = await bar();
    expect(part(element, '.captions').getAttribute('aria-pressed')).to.equal('false');
    part(element, '.captions').click();
    await element.updateComplete;
    expect(engine.captionCalls).to.deep.equal([true]);
    expect(part(element, '.captions').getAttribute('aria-pressed')).to.equal('true');
  });

  it('fullscreens the container it was given', async () => {
    const container = document.createElement('div');
    let asked = 0;
    container.requestFullscreen = () => {
      asked++;
      return Promise.resolve();
    };
    const { element } = await bar(undefined, container);
    part(element, '.fullscreen').click();
    expect(asked).to.equal(1);
  });

  /**
   * Found in the browser pass (design v2, task 9): the player lives inside shadow roots, where
   * `document.fullscreenElement` is retargeted to the outermost host (`umb-app`) and never equals the
   * container, so the button could enter fullscreen and never leave it (only Escape did).
   */
  it('leaves fullscreen from the button when the container is inside a shadow root', async () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    root.append(container);
    document.body.append(host);
    let asked = 0;
    container.requestFullscreen = () => {
      asked++;
      return Promise.resolve();
    };
    // What the browser reports once the container is fullscreen: in its own tree it is the element itself,
    // and in the document it is the outermost host.
    Object.defineProperty(root, 'fullscreenElement', { configurable: true, get: () => container });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => host });
    let left = 0;
    const original = document.exitFullscreen;
    document.exitFullscreen = () => {
      left++;
      return Promise.resolve();
    };
    try {
      const { element } = await bar(undefined, container);
      part(element, '.fullscreen').click();
      expect(left, 'asked the document to leave').to.equal(1);
      expect(asked, 'and did not ask to enter again').to.equal(0);
    } finally {
      document.exitFullscreen = original;
      delete (document as unknown as Record<string, unknown>).fullscreenElement;
      host.remove();
    }
  });

  it('does not throw when there is nothing to fullscreen', async () => {
    const { element } = await bar();
    expect(() => part(element, '.fullscreen').click()).not.to.throw();
  });

  it('links to the video on YouTube in a new tab without handing over the opener', async () => {
    const { element } = await bar();
    const link = part<HTMLAnchorElement>(element, '.watch');
    expect(link.getAttribute('href')).to.equal('https://www.youtube.com/watch?v=aRkc0fRxQjw');
    expect(link.getAttribute('target')).to.equal('_blank');
    expect(link.getAttribute('rel')).to.contain('noopener');
  });

  it('gives every control an accessible name', async () => {
    const { element } = await bar();
    const controls = [...element.shadowRoot!.querySelectorAll<HTMLElement>('button, a, [role="slider"]')];
    expect(controls.length).to.be.greaterThan(6);
    for (const control of controls) {
      const name = control.getAttribute('aria-label') ?? control.textContent ?? '';
      expect(name.trim().length, control.className).to.be.greaterThan(0);
    }
  });

  it('gives every control a name in live mode too', async () => {
    const { element } = await bar((e) => (e.duration = 0));
    const controls = [...element.shadowRoot!.querySelectorAll<HTMLElement>('button, a, [role="slider"]')];
    for (const control of controls) {
      const name = control.getAttribute('aria-label') ?? control.textContent ?? '';
      expect(name.trim().length, control.className).to.be.greaterThan(0);
    }
  });

  it('uses real buttons, not clickable divs', async () => {
    const { element } = await bar();
    for (const selector of ['.play', '.back', '.forward', '.mute', '.captions', '.speed', '.fullscreen']) {
      expect(part(element, selector).tagName, selector).to.equal('BUTTON');
    }
  });

  it('lets a theme repaint the bar but never resize or remove a control', async () => {
    const { element } = await bar();
    const selectors = ['.play', '.back', '.forward', '.seek', '.mute', '.volume', '.captions', '.speed', '.fullscreen', '.watch'];
    const measure = () =>
      selectors.map((selector) => {
        const box = part(element, selector).getBoundingClientRect();
        return [selector, Math.round(box.width), Math.round(box.height)];
      });
    const plain = measure();
    for (const [, width, height] of plain) {
      expect(width).to.be.greaterThan(0);
      expect(height).to.be.greaterThan(0);
    }
    for (const theme of THEMES) {
      element.setAttribute('data-umbradesktop-theme', theme);
      await element.updateComplete;
      expect(measure(), theme).to.deep.equal(plain);
    }
  });

  it('draws every control disabled, and the status line where the time goes, when it has nothing to play', async () => {
    const element = await disabledBar('Starts in 28 days');
    for (const selector of ['.play', '.back', '.forward', '.mute', '.captions', '.speed', '.fullscreen']) {
      expect(part<HTMLButtonElement>(element, selector).disabled, selector).to.equal(true);
    }
    for (const selector of ['.seek', '.volume']) {
      expect(part(element, selector).getAttribute('aria-disabled'), selector).to.equal('true');
      expect(part(element, selector).getAttribute('tabindex'), `${selector} is out of the tab order`).to.equal('-1');
    }
    expect(part(element, '.status').textContent!.trim()).to.equal('Starts in 28 days');
    expect(has(element, '.time')).to.equal(false);
  });

  it('keeps the YouTube link working while disabled, so the waiting room is one click away', async () => {
    const element = await disabledBar('Starts in 28 days', 'next1');
    const link = part<HTMLAnchorElement>(element, '.watch');
    expect(link.getAttribute('href')).to.equal('https://www.youtube.com/watch?v=next1');
    expect(link.hasAttribute('aria-disabled')).to.equal(false);
  });

  it('folds the volume slider and the YouTube label into their icons below the compact width, never the controls', async () => {
    const wide = await bar(undefined, undefined, BAR_COMPACT_WIDTH_PX);
    expect(drawn(wide.element, '.volume'), 'the slider at the compact width').to.equal(true);
    expect(drawn(wide.element, '.watch .label'), 'the label at the compact width').to.equal(true);
    const narrow = await bar(undefined, undefined, BAR_COMPACT_WIDTH_PX - 1);
    expect(drawn(narrow.element, '.volume'), 'no slider below it').to.equal(false);
    expect(drawn(narrow.element, '.watch .label'), 'no label below it').to.equal(false);
    for (const selector of ['.play', '.back', '.forward', '.mute', '.captions', '.speed', '.fullscreen', '.watch']) {
      expect(drawn(narrow.element, selector), selector).to.equal(true);
    }
  });

  for (const width of [480, BAR_COMPACT_WIDTH_PX]) {
    it(`fits its row in ${width}px without anything spilling out`, async () => {
      const { element } = await bar((e) => (e.duration = 3 * 3600), undefined, width);
      const row = part(element, '.row');
      expect(row.scrollWidth, 'the row does not overflow').to.be.at.most(row.clientWidth);
      const right = element.getBoundingClientRect().right;
      expect(part(element, '.watch').getBoundingClientRect().right).to.be.at.most(right + 0.5);
    });
  }

  it('stops listening to an engine it has been taken off', async () => {
    const { element, engine } = await bar();
    const next = new FakeEngine();
    next.duration = 100;
    element.engine = next;
    await element.updateComplete;
    engine.seek(2000);
    await element.updateComplete;
    expect(part(element, '.seek').getAttribute('aria-valuemax')).to.equal('100');
    expect(engine.listenerCount).to.equal(0);
  });
});
