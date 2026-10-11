import { ENGINE_EVENTS } from './engine.js';
import type { PlayerEngine, PlayerLoadOptions, PlayerState } from './engine.js';
import type { YTNamespace, YTPlayer, YTPlayerOptions } from './youtube-engine.js';
import { render, type TemplateResult } from '@umbraco-cms/backoffice/external/lit';

/** Hosts {@link mount} appended, so {@link unmountAll} can take them away again. */
const mounted: HTMLElement[] = [];

/**
 * Draw a template in a host appended to the page by hand, and wait for the element in it to render.
 *
 * In place of open-wc's `fixture`, which waits for an animation frame that a page in the background
 * never gets: in the full suite, and always in CI, the test pages are background tabs, and the
 * control bar's file hung there until the runner's two-minute limit (2026-10-11). Call
 * {@link unmountAll} in an `afterEach`.
 * @param template What to draw.
 * @returns The first element the template drew.
 */
export async function mount<T extends Element>(template: TemplateResult): Promise<T> {
  const host = document.createElement('div');
  document.body.append(host);
  mounted.push(host);
  render(template, host);
  const element = host.firstElementChild as T;
  // The first custom element drawn, the template's own or one inside a wrapper, is the one to wait for.
  const custom = [element, ...element.querySelectorAll('*')].find((node) => node.localName.includes('-')) as
    | (Element & { updateComplete?: Promise<unknown> })
    | undefined;
  await custom?.updateComplete;
  return element;
}

/** Remove every host {@link mount} appended. */
export function unmountAll(): void {
  for (const host of mounted.splice(0)) host.remove();
}

/**
 * Test doubles for the media player.
 *
 * Not a `.test.ts` file so the runner does not treat it as a suite, and not imported by anything the
 * bundle ships. Task 5's window tests reuse {@link FakeEngine} to drive the player without YouTube.
 */

/**
 * A {@link PlayerEngine} that does nothing but keep score.
 *
 * Every call is recorded and every change is announced the way a real engine announces it, so a
 * test can assert on what the bar asked for and on what the bar shows in reply.
 */
export class FakeEngine extends EventTarget implements PlayerEngine {
  /** The engine's state. Assign directly to set up a case, or call `play` and friends. */
  state: PlayerState = 'idle';
  /** The position in seconds. */
  time = 0;
  /** The length in seconds. */
  duration = 0;
  /** The volume from zero to one. */
  volume = 1;
  /** Whether sound is off. */
  muted = false;
  /** The playback speed. */
  playbackRate = 1;
  /** How much of the video is loaded, from zero to one. */
  buffered = 0;
  /** Every `load` call, in order. */
  loads: Array<{ host: HTMLElement; videoId: string; options?: PlayerLoadOptions }> = [];
  /** Names of the play and pause calls, in order. */
  calls: string[] = [];
  /** Every position passed to `seek`. */
  seeks: number[] = [];
  /** Every volume passed to `setVolume`. */
  volumeCalls: number[] = [];
  /** Every value passed to `setMuted`. */
  mutedCalls: boolean[] = [];
  /** Every value passed to `setCaptions`. */
  captionCalls: boolean[] = [];
  /** Every rate passed to `setPlaybackRate`. */
  rateCalls: number[] = [];
  /** How many times `destroy` was called. */
  destroyCalls = 0;
  /** How many listeners are currently attached, so a test can prove the bar lets go. */
  listenerCount = 0;

  /**
   * Fire an engine event.
   * @param type One of {@link ENGINE_EVENTS}.
   * @param detail The event's payload.
   */
  emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** @inheritdoc */
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    this.listenerCount++;
    super.addEventListener(type, callback, options);
  }

  /** @inheritdoc */
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
    this.listenerCount--;
    super.removeEventListener(type, callback, options);
  }

  /** @inheritdoc */
  load(host: HTMLElement, videoId: string, options?: PlayerLoadOptions): Promise<void> {
    this.loads.push({ host, videoId, options });
    return Promise.resolve();
  }

  /** @inheritdoc */
  play(): void {
    this.calls.push('play');
    this.state = 'playing';
    this.emit(ENGINE_EVENTS.stateChange, 'playing');
  }

  /** @inheritdoc */
  pause(): void {
    this.calls.push('pause');
    this.state = 'paused';
    this.emit(ENGINE_EVENTS.stateChange, 'paused');
  }

  /** @inheritdoc */
  seek(seconds: number): void {
    this.seeks.push(seconds);
    this.time = seconds;
    this.emit(ENGINE_EVENTS.timeUpdate, seconds);
  }

  /** @inheritdoc */
  setVolume(zeroToOne: number): void {
    this.volumeCalls.push(zeroToOne);
    this.volume = zeroToOne;
    this.emit(ENGINE_EVENTS.volumeChange);
  }

  /** @inheritdoc */
  setMuted(muted: boolean): void {
    this.mutedCalls.push(muted);
    this.muted = muted;
    this.emit(ENGINE_EVENTS.volumeChange);
  }

  /** @inheritdoc */
  setCaptions(on: boolean): void {
    this.captionCalls.push(on);
  }

  /** @inheritdoc */
  setPlaybackRate(rate: number): void {
    this.rateCalls.push(rate);
    this.playbackRate = rate;
    this.emit(ENGINE_EVENTS.rateChange, rate);
  }

  /** @inheritdoc */
  destroy(): void {
    this.destroyCalls++;
    this.state = 'idle';
  }
}

/**
 * A stand-in for one `YT.Player`: records the calls it gets and lets a test play YouTube's part.
 */
export class FakeYouTubePlayer implements YTPlayer {
  /** Every call, as `name` or `name:arguments`. Reads of position and duration are not in it. */
  calls: string[] = [];
  /** The position `getCurrentTime` reports. */
  time = 0;
  /** The duration `getDuration` reports. */
  duration = 0;
  /** The fraction `getVideoLoadedFraction` reports. */
  loaded = 0;
  /** How many times `getCurrentTime` was read, which is how a test sees the poll running. */
  timeReads = 0;
  /** The volume, 0 to 100, as YouTube keeps it. */
  volume = 100;
  /** Whether muted. */
  muted = false;
  /** Whether `destroy` was called. */
  destroyed = false;
  /** The speed `getPlaybackRate` reports. */
  rate = 1;

  /**
   * Record the element and options the engine gave.
   * @param target The element the engine handed to `new YT.Player`.
   * @param options What the engine asked for.
   */
  constructor(
    public readonly target: HTMLElement,
    public readonly options: YTPlayerOptions,
  ) {}

  /** Play YouTube telling the engine its state changed. @param data YouTube's state number. */
  fire(data: number): void {
    this.options.events?.onStateChange?.({ data });
  }

  /** Play YouTube telling the engine the player is ready. */
  ready(): void {
    this.options.events?.onReady?.({});
  }

  /** Play YouTube changing the speed by itself. @param rate The new speed. */
  rateChanged(rate: number): void {
    this.rate = rate;
    this.options.events?.onPlaybackRateChange?.({ data: rate });
  }

  /** Play YouTube reporting an error. @param data YouTube's error code. */
  fail(data: number): void {
    this.options.events?.onError?.({ data });
  }

  /** @inheritdoc */
  playVideo(): void {
    this.calls.push('playVideo');
  }
  /** @inheritdoc */
  pauseVideo(): void {
    this.calls.push('pauseVideo');
  }
  /** @inheritdoc */
  seekTo(seconds: number, allowSeekAhead: boolean): void {
    this.calls.push(`seekTo:${seconds}:${allowSeekAhead}`);
  }
  /** @inheritdoc */
  setVolume(volume: number): void {
    this.calls.push(`setVolume:${volume}`);
    this.volume = volume;
  }
  /** @inheritdoc */
  getVolume(): number {
    return this.volume;
  }
  /** @inheritdoc */
  mute(): void {
    this.calls.push('mute');
    this.muted = true;
  }
  /** @inheritdoc */
  unMute(): void {
    this.calls.push('unMute');
    this.muted = false;
  }
  /** @inheritdoc */
  isMuted(): boolean {
    return this.muted;
  }
  /** @inheritdoc */
  getCurrentTime(): number {
    this.timeReads++;
    return this.time;
  }
  /** @inheritdoc */
  getVideoLoadedFraction(): number {
    return this.loaded;
  }
  /** @inheritdoc */
  getDuration(): number {
    return this.duration;
  }
  /** @inheritdoc */
  setPlaybackRate(rate: number): void {
    this.calls.push(`setPlaybackRate:${rate}`);
    this.rate = rate;
  }
  /** @inheritdoc */
  getPlaybackRate(): number {
    return this.rate;
  }
  /** @inheritdoc */
  loadVideoById(videoId: string): void {
    this.calls.push(`loadVideoById:${videoId}`);
  }
  /** @inheritdoc */
  cueVideoById(videoId: string): void {
    this.calls.push(`cueVideoById:${videoId}`);
  }
  /** @inheritdoc */
  loadModule(name: string): void {
    this.calls.push(`loadModule:${name}`);
  }
  /** @inheritdoc */
  unloadModule(name: string): void {
    this.calls.push(`unloadModule:${name}`);
  }
  /** @inheritdoc */
  destroy(): void {
    this.destroyed = true;
  }
}

/**
 * A fake `YT` namespace whose `Player` builds {@link FakeYouTubePlayer}s.
 * @returns The namespace to hand to the engine's `apiLoader`, and every player it made.
 */
export function fakeYouTube(): { yt: YTNamespace; players: FakeYouTubePlayer[] } {
  const players: FakeYouTubePlayer[] = [];
  const yt: YTNamespace = {
    Player: function (target: HTMLElement, options: YTPlayerOptions) {
      const player = new FakeYouTubePlayer(target, options);
      players.push(player);
      return player;
    } as unknown as YTNamespace['Player'],
  };
  return { yt, players };
}
