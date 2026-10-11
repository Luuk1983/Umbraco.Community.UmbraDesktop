import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './player.element.js';
import type { PlayerElement } from './player.element.js';
import {
  AUTOPLAY_VISIBLE_RATIO,
  MEDIA_FRAME_MAX_HEIGHT_PROPERTY,
  MEDIA_MIN_HEIGHT_PX,
  MEDIA_MIN_WIDTH_PX,
  PLAYER_ASPECT_RATIO,
} from './constants.js';
import { FakeEngine } from './test-support.js';

/** A stand-in for `IntersectionObserver` that a case can fire by hand. */
class StubObserver {
  /** Every observer made, so a case can reach the one the player created. */
  static all: StubObserver[] = [];
  /** The thresholds the player asked for. */
  thresholds: number | number[] | undefined;
  /** Whether `disconnect` has been called. */
  disconnected = false;

  /** Records itself and its callback. */
  constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.thresholds = options?.threshold;
    StubObserver.all.push(this);
  }
  /** Observing does nothing until a case says what is visible. */
  observe(): void {}
  /** Not needed by the player. */
  unobserve(): void {}
  /** Recorded so a case can see the observer being let go. */
  disconnect(): void {
    this.disconnected = true;
  }
  /** Report a visible fraction the way the browser would. */
  report(ratio: number): void {
    this.callback(
      [{ intersectionRatio: ratio, isIntersecting: ratio > 0 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

/** Mount a player on a fake engine. */
async function player(videoId = 'aRkc0fRxQjw', autoplay = false) {
  const engine = new FakeEngine();
  const element = await fixture<PlayerElement>(
    html`<umbradesktop-media-player .engine=${engine} .videoId=${videoId} .autoplay=${autoplay}></umbradesktop-media-player>`,
  );
  return { element, engine };
}

describe('media player', () => {
  const realObserver = window.IntersectionObserver;
  afterEach(() => {
    window.IntersectionObserver = realObserver;
    StubObserver.all = [];
  });

  it('loads the video into its frame when it connects', async () => {
    const { element, engine } = await player('abc');
    await waitUntil(() => engine.loads.length === 1);
    expect(engine.loads[0].videoId).to.equal('abc');
    expect(element.shadowRoot!.querySelector('.frame')!.contains(engine.loads[0].host)).to.equal(true);
  });

  it('does not autoplay by default', async () => {
    const { engine } = await player('abc');
    await waitUntil(() => engine.loads.length === 1);
    expect(engine.loads[0].options?.autoplay).to.equal(false);
  });

  it('loads again when the video id changes', async () => {
    const { element, engine } = await player('one');
    await waitUntil(() => engine.loads.length === 1);
    element.videoId = 'two';
    await waitUntil(() => engine.loads.length === 2);
    expect(engine.loads[1].videoId).to.equal('two');
    expect(engine.destroyCalls).to.equal(0);
  });

  it('destroys the engine when it is removed', async () => {
    const { element, engine } = await player('abc');
    await waitUntil(() => engine.loads.length === 1);
    element.remove();
    expect(engine.destroyCalls).to.equal(1);
  });

  it('loads again after being put back', async () => {
    const { element, engine } = await player('abc');
    await waitUntil(() => engine.loads.length === 1);
    const parent = element.parentElement!;
    element.remove();
    parent.append(element);
    await waitUntil(() => engine.loads.length === 2);
  });

  it('waits until it is at least half visible to autoplay', async () => {
    window.IntersectionObserver = StubObserver as unknown as typeof IntersectionObserver;
    const { engine } = await player('abc', true);
    await waitUntil(() => StubObserver.all.length === 1);
    expect(StubObserver.all[0].thresholds).to.equal(AUTOPLAY_VISIBLE_RATIO);
    expect(engine.loads.length).to.equal(0);
    StubObserver.all[0].report(0.6);
    await waitUntil(() => engine.loads.length === 1);
    expect(engine.loads[0].options?.autoplay).to.equal(true);
    expect(StubObserver.all[0].disconnected).to.equal(true);
  });

  it('loads without autoplay when it is mostly hidden', async () => {
    window.IntersectionObserver = StubObserver as unknown as typeof IntersectionObserver;
    const { engine } = await player('abc', true);
    await waitUntil(() => StubObserver.all.length === 1);
    StubObserver.all[0].report(0.2);
    await waitUntil(() => engine.loads.length === 1);
    expect(engine.loads[0].options?.autoplay).to.equal(false);
  });

  it('draws the frame at 16:9 and never below 200 by 200', async () => {
    const { element } = await player();
    const frame = element.shadowRoot!.querySelector<HTMLElement>('.frame')!;
    const style = getComputedStyle(frame);
    expect(style.minWidth).to.equal(`${MEDIA_MIN_WIDTH_PX}px`);
    expect(style.minHeight).to.equal(`${MEDIA_MIN_HEIGHT_PX}px`);
    element.style.display = 'block';
    element.style.width = '640px';
    const box = frame.getBoundingClientRect();
    expect(Math.abs(box.width / box.height - PLAYER_ASPECT_RATIO)).to.be.lessThan(0.02);
  });

  it('caps the frame at the height its host asks for, keeping its width and its 200px floor', async () => {
    const { element } = await player();
    element.style.display = 'block';
    element.style.width = '640px';
    const frame = element.shadowRoot!.querySelector<HTMLElement>('.frame')!;
    expect(frame.getBoundingClientRect().height, 'uncapped, it is 16:9').to.be.closeTo(360, 0.5);
    element.style.setProperty(MEDIA_FRAME_MAX_HEIGHT_PROPERTY, '300px');
    expect(frame.getBoundingClientRect().height).to.be.closeTo(300, 0.5);
    expect(frame.getBoundingClientRect().width, 'the width stays; YouTube letterboxes inside it').to.be.closeTo(640, 0.5);
    element.style.setProperty(MEDIA_FRAME_MAX_HEIGHT_PROPERTY, '120px');
    expect(frame.getBoundingClientRect().height, 'never under YouTube’s minimum').to.be.closeTo(MEDIA_MIN_HEIGHT_PX, 0.5);
  });

  it('puts the control bar under the frame and nothing over it', async () => {
    const { element } = await player();
    const frame = element.shadowRoot!.querySelector<HTMLElement>('.frame')!;
    const bar = element.shadowRoot!.querySelector<HTMLElement>('umbradesktop-control-bar')!;
    expect(bar.getBoundingClientRect().top).to.be.at.least(frame.getBoundingClientRect().bottom - 0.5);
    const inFrame = [...frame.children].filter((child) => !child.classList.contains('host'));
    expect(inFrame.length).to.equal(0);
  });

  it('passes its theme on to the bar, which styles itself by that attribute, and follows a change', async () => {
    const { element } = await player();
    const bar = element.shadowRoot!.querySelector('umbradesktop-control-bar')!;
    expect(bar.hasAttribute('data-umbradesktop-theme')).to.equal(false);
    element.setAttribute('data-umbradesktop-theme', 'win98');
    await element.updateComplete;
    expect(bar.getAttribute('data-umbradesktop-theme')).to.equal('win98');
    element.setAttribute('data-umbradesktop-theme', 'macos');
    await element.updateComplete;
    expect(bar.getAttribute('data-umbradesktop-theme')).to.equal('macos');
    element.removeAttribute('data-umbradesktop-theme');
    await element.updateComplete;
    expect(bar.hasAttribute('data-umbradesktop-theme')).to.equal(false);
  });

  it('hands the bar its engine, the video id and itself to fullscreen', async () => {
    const { element, engine } = await player('abc');
    const bar = element.shadowRoot!.querySelector('umbradesktop-control-bar') as unknown as {
      engine: unknown;
      videoId: string;
      container: unknown;
    };
    expect(bar.engine).to.equal(engine);
    expect(bar.videoId).to.equal('abc');
    expect(bar.container).to.equal(element);
  });
});
